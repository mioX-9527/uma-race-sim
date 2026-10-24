import type { Course, RunnerConfig, SkillConfig, Stats } from '../src';

/**
 * 东京草 2400 结构示例赛道。
 * 注意:弯道/坡度/阶段分界为占位数据,真实数据待 D2~D3 数据日生成(见 data/version.json)。
 * 坡度段 1250~1500(-1.5%)取自 614tools 页脚对东京 2400 的示例。
 */
export const TOKYO_TURF_2400: Course = {
  id: 'tokyo-turf-2400',
  name: '东京 草 2400m',
  venue: '东京',
  distance: 2400,
  surface: 'turf',
  corners: [
    { n: 1, start: 160, end: 420 },
    { n: 2, start: 620, end: 830 },
    { n: 3, start: 1230, end: 1470 },
    { n: 4, start: 1760, end: 1980 },
  ],
  slopes: [{ start: 1250, end: 1500, gradient: -1.5 }],
  // TODO(calibration): 阶段分界为占位
  phaseBounds: { midStart: 480, lateStart: 1440, finalStart: 1920 },
  baseSpeed: 19.6,
};

export const BASE_STATS: Stats = { speed: 1200, stamina: 1200, power: 1200, guts: 1200, wisdom: 1200 };

export function makeRunner(partial: Partial<RunnerConfig> = {}): RunnerConfig {
  return {
    stats: { ...BASE_STATS },
    greenBonus: {},
    tactic: 'senko',
    distanceAptitude: 'A',
    surfaceAptitude: 'A',
    motivation: 'best',
    skills: [],
    ...partial,
  };
}

/** 耐力充足的跑者(不触发挥体力耗尽,便于隔离测机制) */
export function freshRunner(skills: readonly SkillConfig[] = [], stats: Partial<Stats> = {}): RunnerConfig {
  return makeRunner({ stats: { ...BASE_STATS, stamina: 5000, ...stats }, skills });
}

/** 终盘发动的目标速度技能 */
export function speedSkill(id: string, value: number, durationSec: number, extra: Partial<SkillConfig> = {}): SkillConfig {
  return {
    id,
    name: id,
    rarity: 'normal',
    precision: 'precise',
    effects: [{ type: 'targetSpeed', value }],
    durationSec,
    condition: { kind: 'phase', phase: 3 },
    wisdomScaled: false,
    ...extra,
  };
}
