import { CALIB, DT, GATE_ACCEL, GATE_EXIT_RATIO, GATE_SPEED } from './constants';
import { activationRegions, dynamicSatisfied, inRegion, type FrameState } from './conditions';
import { phaseAt } from './phase';
import { baseSpeedOf, phaseAccel, phaseTargetSpeed } from './speed';
import { accelerationBonus, applyInstant, spurtExtensionAccel, targetSpeedBonus, type Buff } from './skills';
import { staminaDrainPerSecond } from './stamina';
import type { Activation, Course, RunnerConfig, SimResult } from './types';

const MAX_SECONDS = 600;

/** 体力上限 = 耐力(含绿)× 系数 —— TODO(calibration): 实际公式待校准 */
export function maxHpOf(runner: RunnerConfig): number {
  return (runner.stats.stamina + (runner.greenBonus.stamina ?? 0)) * CALIB.hpPerStamina;
}

/**
 * 单马确定性期望模拟:30fps 帧级积分。
 * 随机项(焦躁/追比/下坡模式等)v0.1 不参与计算,边界见 docs/最终方案.md §1。
 */
export function simulate(course: Course, runner: RunnerConfig): SimResult {
  const baseV = baseSpeedOf(course);
  const maxHp = maxHpOf(runner);

  const tArr: number[] = [];
  const xArr: number[] = [];
  const vArr: number[] = [];
  const hpArr: number[] = [];
  let v = GATE_SPEED;
  let x = 0;
  let t = 0;
  let hp = maxHp;
  let tempering = false;
  let exhaustedAtMeter: number | null = null;
  const buffs: Buff[] = [];
  const activations: Activation[] = [];
  const activated = new Set<string>();
  let finalPhaseSince: number | null = null;

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
    if (phase === 3 && finalPhaseSince === null) finalPhaseSince = t;

    let target = phaseTargetSpeed(course, runner, phase) + targetSpeedBonus(buffs, t, runner);
    let accel = phaseAccel(phase) + accelerationBonus(buffs, t, runner);
    if (phase === 3) {
      accel += spurtExtensionAccel(buffs, t, runner);
      // 脚色充分:最终盘开始起 3 秒 accel += √((power−1200)×130)×0.001(614tools;power=面板+绿)
      if (finalPhaseSince !== null && t - finalPhaseSince < 3) {
        const pw = runner.stats.power + (runner.greenBonus.power ?? 0);
        if (pw > 1200) accel += Math.sqrt((pw - 1200) * 130) * 0.001;
      }
    }

    if (hp <= 0) tempering = true;
    if (tempering) target = Math.min(target, baseV * CALIB.temperRatio);
    if (v < baseV * GATE_EXIT_RATIO) accel = Math.max(accel, GATE_ACCEL);

    const dv = target - v;
    if (dv > 0) v += Math.min(dv, accel * dt);
    else if (dv < 0) v += Math.max(dv, -CALIB.brakeAccel * dt);

    hp -= staminaDrainPerSecond(v, baseV, { stateCoef: 1, surfaceCoef: CALIB.surfaceCoef }) * dt;
    if (hp <= 0 && exhaustedAtMeter === null) exhaustedAtMeter = x;

    for (let i = buffs.length - 1; i >= 0; i--) {
      if (t >= buffs[i]!.untilSec) buffs.splice(i, 1);
    }

    const frame: FrameState = { t, x, phase };
    for (const s of runner.skills) {
      if (activated.has(s.id) || s.precision === 'unsupported') continue;
      const hit = activationRegions(s.condition, course).some(r => inRegion(r, x));
      if (!hit) continue;
      if (!dynamicSatisfied(s.condition, frame)) continue;
      activated.add(s.id);
      activations.push({ skillId: s.id, name: s.name, atSec: t, atMeter: x, precision: s.precision });
      if ((s.durationSec ?? 0) > 0) buffs.push({ skill: s, untilSec: t + s.durationSec! });
      const st = applyInstant(s, { v, hp, maxHp }, runner);
      v = st.v;
      hp = st.hp;
    }

    x += v * dt;
    t += dt;
    record();
  }

  return {
    finishTimeSec: interpolateFinish(tArr, xArr, course.distance) ?? t,
    t: Float64Array.from(tArr),
    x: Float64Array.from(xArr),
    v: Float64Array.from(vArr),
    hp: Float64Array.from(hpArr),
    maxHp,
    activations,
    exhaustedAtMeter,
  };
}

/** 冲线时刻线性插值(帧粒度不足以直接读 t) */
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
