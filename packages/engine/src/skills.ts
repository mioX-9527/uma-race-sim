import { LAST_SPURT_EXT_ACCEL_SCALE, MOTIVATION_WISDOM_MULT, RARITY_LEVEL_FACTOR } from './constants';
import type { Course, RunnerConfig, SkillConfig, SkillRestriction } from './types';

/** 装配型限制(脚质/距离档/场地/赛场/场地状态/精确距离)是否满足;不满足则整场不发动 */
export function restrictionSatisfied(r: SkillRestriction, runner: RunnerConfig, course: Course): boolean {
  if (r.tactics !== undefined && !r.tactics.includes(runner.tactic)) return false;
  if (r.distanceTypes !== undefined && (course.distanceType === undefined || !r.distanceTypes.includes(course.distanceType))) return false;
  if (r.surfaces !== undefined && !r.surfaces.includes(course.surface)) return false;
  if (r.venues !== undefined && !r.venues.includes(course.venue)) return false;
  if (r.grounds !== undefined && !r.grounds.includes(runner.groundCondition ?? 0)) return false;
  if (r.distances !== undefined && !r.distances.includes(course.distance)) return false;
  return true;
}

export interface Buff {
  readonly skill: SkillConfig;
  readonly untilSec: number;
}

/** 参照智力 =(面板+绿技能)×干劲(614tools:面板+绿,不含软上限) */
export function referenceWisdom(runner: RunnerConfig): number {
  return (runner.stats.wisdom + (runner.greenBonus.wisdom ?? 0)) * MOTIVATION_WISDOM_MULT[runner.motivation];
}

/**
 * 智力补正:超过 1200 的部分按档位累计(614tools 页脚):
 * 0–200 每 20 +0.02;200–400 每 20 +0.06;400–800 每 20 +0.01;800–1900 每 100 +0.01。
 * 按档位向上取整到 0.01(示例:参照智力 1872 → 0.94)。
 */
export function wisdomCorrection(w: number): number {
  const over = w - 1200;
  if (over <= 0) return 0;
  let c = 0;
  c += (Math.min(over, 200) / 20) * 0.02;
  c += (Math.max(0, Math.min(over - 200, 200)) / 20) * 0.06;
  c += (Math.max(0, Math.min(over - 400, 400)) / 20) * 0.01;
  c += (Math.max(0, over - 800) / 100) * 0.01;
  return Math.ceil(c * 100) / 100;
}

/** 固有/レア 技能的目标速度·即时速度效果乘数:×(1 + 0.21 × 智力补正 × 等级系数) */
export function effectMultiplier(skill: SkillConfig, runner: RunnerConfig): number {
  if (!skill.wisdomScaled || skill.rarity === 'normal') return 1;
  return 1 + 0.21 * wisdomCorrection(referenceWisdom(runner)) * RARITY_LEVEL_FACTOR[skill.rarity];
}

/** 激活中的目标速度加成(m/s);「即时速度上升」在持续期内同时抬高目标速度(614tools) */
export function targetSpeedBonus(buffs: readonly Buff[], t: number, runner: RunnerConfig): number {
  let sum = 0;
  for (const b of buffs) {
    if (t >= b.untilSec) continue;
    for (const e of b.skill.effects) {
      if (e.type === 'targetSpeed' || e.type === 'currentSpeed') sum += e.value * effectMultiplier(b.skill, runner);
    }
  }
  return sum;
}

export function accelerationBonus(buffs: readonly Buff[], t: number, runner: RunnerConfig): number {
  let sum = 0;
  for (const b of buffs) {
    if (t >= b.untilSec) continue;
    for (const e of b.skill.effects) {
      if (e.type === 'acceleration') sum += e.value * effectMultiplier(b.skill, runner);
    }
  }
  return sum;
}

/** 末脚延展折算为最终冲刺的额外加速度(×0.1,Excel AA79,614tools) */
export function spurtExtensionAccel(buffs: readonly Buff[], t: number, runner: RunnerConfig): number {
  let sum = 0;
  for (const b of buffs) {
    if (t >= b.untilSec) continue;
    for (const e of b.skill.effects) {
      if (e.type === 'lastSpurtExtension') sum += e.value * LAST_SPURT_EXT_ACCEL_SCALE * effectMultiplier(b.skill, runner);
    }
  }
  return sum;
}

export interface InstantState {
  readonly v: number;
  readonly hp: number;
  readonly maxHp: number;
}

/** 发动瞬间的一次性效果:即时速度提升、体力回复 */
export function applyInstant(skill: SkillConfig, s: InstantState, runner: RunnerConfig): InstantState {
  let { v, hp } = s;
  for (const e of skill.effects) {
    if (e.type === 'currentSpeed') v += e.value * effectMultiplier(skill, runner);
    else if (e.type === 'heal') {
      // TODO(calibration): 真实回复量与智力/干劲相关;v0.1 按体力上限 × value
      hp = Math.min(s.maxHp, hp + s.maxHp * e.value);
    }
  }
  return { v, hp, maxHp: s.maxHp };
}
