import {
  DT,
  EXHAUST_DECEL,
  GATE_ACCEL,
  GATE_EXIT_RATIO,
  GATE_SPEED,
  PHASE_DECEL,
  START_DELAY_EXPECTED,
  START_PACE_DOWN_RATIO,
  START_PACE_DOWN_UNTIL_M,
  strategyPhase,
} from './constants';
import { activationRegions, dynamicSatisfied, inRegion, type FrameState } from './conditions';
import { phaseAt } from './phase';
import { baseAccelOf, baseSpeedOf, lastSpurtSpeedOf, minSpeedOf, phaseTargetSpeed } from './speed';
import { accelerationBonus, applyInstant, restrictionSatisfied, spurtExtensionAccel, targetSpeedBonus, type Buff } from './skills';
import { gutsDrainModifier, maxHpOf, staminaDrainPerSecond } from './stamina';
import type { Activation, Course, RunnerConfig, SimResult, Slope } from './types';

const MAX_SECONDS = 600;

/** 当前位置所在的坡道段 */
export function slopeAt(course: Course, x: number): Slope | null {
  for (const s of course.slopes) {
    if (x >= s.start && x < s.end) return s;
  }
  return null;
}

interface SpurtCtx {
  readonly pos: number;
  readonly hp: number;
}

/**
 * 末脚(最终冲刺)开始位置:按体力预算解算(解包 HpPolicy.getLastSpurtPair 的确定性最优解,
 * 忽略与智力相关的"次优接受率"随机项)。体力充裕时从终盘分界(2/3)即开始末脚。
 */
function solveSpurtTransition(
  course: Course,
  runner: RunnerConfig,
  ctx: SpurtCtx,
): number {
  const baseV = baseSpeedOf(course);
  const gutsMod = gutsDrainModifier(runner);
  const ground = runner.groundCondition ?? 0;
  const drainAt = (v: number): number =>
    staminaDrainPerSecond(v, baseV, course, { statusCoef: 1, ground, gutsModifier: gutsMod, phase: 2 });
  const spurtV = lastSpurtSpeedOf(course, runner);
  const target2 = phaseTargetSpeed(course, runner, 2);
  const late = course.phaseBounds.lateStart;

  // 体力足以全程末脚:从终盘分界开始
  const maxDist = course.distance - late;
  const sFull = (maxDist - 60) / spurtV;
  if (ctx.hp >= drainAt(spurtV) * sFull) return late;

  // 否则解最优(最早完赛)的冲刺起点
  const remain = course.distance - 60 - ctx.pos;
  const candidates: Array<[number, number]> = [];
  for (let speed = spurtV - 0.1; speed >= target2; speed -= 0.1) {
    const dur = Math.min(
      remain / speed,
      Math.max(
        0,
        (target2 * ctx.hp - drainAt(target2) * remain) /
          (target2 * drainAt(speed) - drainAt(target2) * speed),
      ),
    );
    const spurtDistance = dur * speed + 60;
    candidates.push([course.distance - spurtDistance, speed]);
  }
  if (candidates.length === 0) return course.distance;
  candidates.sort(
    (a, b) =>
      (a[0] - ctx.pos) / target2 + (course.distance - a[0]) / a[1] -
      ((b[0] - ctx.pos) / target2 + (course.distance - b[0]) / b[1]),
  );
  return candidates[0]![0];
}

/**
 * 单马确定性期望模拟:30fps 帧级积分,物理公式见 docs/formulas.md(解包模型)。
 * 随机项(焦躁/追比/下坡模式/位置保持等)v0.1 不参与计算。
 */
export function simulate(course: Course, runner: RunnerConfig): SimResult {
  const baseV = baseSpeedOf(course);
  const maxHp = maxHpOf(course, runner);
  const minSpeed = minSpeedOf(course, runner);
  const gutsMod = gutsDrainModifier(runner);
  const spurtV = lastSpurtSpeedOf(course, runner);
  const ground = runner.groundCondition ?? 0;
  const distScale = course.distance / 1000;

  const tArr: number[] = [];
  const xArr: number[] = [];
  const vArr: number[] = [];
  const hpArr: number[] = [];
  let v = GATE_SPEED;
  let x = 0;
  let t = 0;
  let hp = maxHp;
  let tempering = false;
  let spurtOn = false;
  let spurtTransition: number | null = null;
  let startDash = true;
  let exhaustedAtMeter: number | null = null;
  const buffs: Buff[] = [];
  const activations: Activation[] = [];
  const activated = new Set<string>();

  const record = (): void => {
    tArr.push(t);
    xArr.push(x);
    vArr.push(v);
    hpArr.push(hp);
  };
  record();

  const dt = DT;
  while (x < course.distance && t < MAX_SECONDS) {
    const phase = phaseAt(course, x);
    const p2 = strategyPhase(phase);

    if (phase >= 2 && spurtTransition === null) {
      spurtTransition = solveSpurtTransition(course, runner, { pos: x, hp });
    }
    if (!spurtOn && spurtTransition !== null && x >= spurtTransition) spurtOn = true;

    // ---- 目标速度 ----
    const slope = slopeAt(course, x);
    let target: number;
    if (spurtOn) {
      target = spurtV;
    } else if (p2 === 0) {
      // 起步放缓段:出闸后前 100m 目标压低(614tools,见 constants 注释)
      target =
        x < START_PACE_DOWN_UNTIL_M
          ? phaseTargetSpeed(course, runner, 0) * START_PACE_DOWN_RATIO
          : phaseTargetSpeed(course, runner, 0);
    } else {
      target = phaseTargetSpeed(course, runner, phase);
    }
    target += targetSpeedBonus(buffs, t, runner);
    if (hp <= 0) tempering = true;
    if (tempering) {
      target = Math.min(target, minSpeed);
    } else if (slope !== null && slope.gradient > 0) {
      // 上坡减速:gradient%×200/力量,下限温存线
      const power = runner.stats.power + (runner.greenBonus.power ?? 0);
      target = Math.max(target - (slope.gradient * 200) / power, minSpeed);
    }

    // ---- 加速度 ----
    let accel: number;
    if (tempering) {
      accel = EXHAUST_DECEL;
    } else if (v > target) {
      accel = PHASE_DECEL[p2];
    } else {
      accel =
        baseAccelOf(course, runner, phase, slope !== null && slope.gradient > 0) +
        accelerationBonus(buffs, t, runner) +
        (spurtOn ? spurtExtensionAccel(buffs, t, runner) : 0);
    }
    if (startDash) accel = Math.max(accel, GATE_ACCEL);

    // ---- 积分 ----
    const dv = target - v;
    if (dv > 0) v += Math.min(dv, accel * dt);
    else if (dv < 0) v += Math.max(dv, accel * dt);
    if (startDash && v >= GATE_EXIT_RATIO * baseV) startDash = false;
    if (!startDash && v < minSpeed) v = minSpeed;

    hp -= staminaDrainPerSecond(v, baseV, course, {
      statusCoef: 1,
      ground,
      gutsModifier: gutsMod,
      phase,
    }) * dt;
    if (hp <= 0 && exhaustedAtMeter === null) exhaustedAtMeter = x;

    for (let i = buffs.length - 1; i >= 0; i--) {
      if (t >= buffs[i]!.untilSec) buffs.splice(i, 1);
    }

    // ---- 技能发动 ----
    const frame: FrameState = { t, x, phase, isSpurt: spurtOn };
    for (const s of runner.skills) {
      if (activated.has(s.id) || s.precision === 'unsupported') continue;
      if (s.restriction !== undefined && !restrictionSatisfied(s.restriction, runner, course)) continue;
      const hit = activationRegions(s.condition, course).some(r => inRegion(r, x));
      if (!hit) continue;
      if (!dynamicSatisfied(s.condition, frame)) continue;
      activated.add(s.id);
      activations.push({ skillId: s.id, name: s.name, atSec: t, atMeter: x, precision: s.precision });
      const dur = s.durationSec !== null && s.durationSec > 0 ? s.durationSec * distScale : 0;
      if (dur > 0) buffs.push({ skill: s, untilSec: t + dur });
      const st = applyInstant(s, { v, hp, maxHp }, runner);
      v = st.v;
      hp = st.hp;
      // 回复改变体力预算:末脚尚未开始时重算起点
      if (s.effects.some(e => e.type === 'heal') && !spurtOn) spurtTransition = null;
    }

    x += v * dt;
    t += dt;
    record();
  }

  const interp = interpolateFinish(tArr, xArr, course.distance) ?? t;
  return {
    finishTimeSec: interp + START_DELAY_EXPECTED,
    t: Float64Array.from(tArr),
    x: Float64Array.from(xArr),
    v: Float64Array.from(vArr),
    hp: Float64Array.from(hpArr),
    maxHp,
    activations,
    exhaustedAtMeter,
  };
}

/** 冲线时刻线性插值 */
function interpolateFinish(ts: readonly number[], xs: readonly number[], distance: number): number | null {
  for (let i = xs.length - 1; i >= 1; i--) {
    const x0 = xs[i - 1]!;
    const x1 = xs[i]!;
    const t0 = ts[i - 1]!;
    const t1 = ts[i]!;
    if (x1 >= distance && x0 < distance) {
      const ratio = (distance - x0) / (x1 - x0);
      return t0 + (t1 - t0) * ratio;
    }
  }
  return null;
}
