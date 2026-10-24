import { COURSE_FIX_MAX, MOTIVATION_WISDOM_MULT, STAT_SOFT_CAP } from './constants';
import type { RunnerConfig, Stats } from './types';

/**
 * 有效属性管线(614tools worker 实证):
 *   各属性 = 软上限(1200 + (面板−1200)/2) × 干劲乘数;速度再 × 赛道补正(最大=1.2)。
 * 物理公式(终盘/末脚速度加成、最低速度根性项、体力上限、加速度、上坡减速、
 * 耗体力根性修正)全部使用有效属性;干劲(智力)增幅与耐力对决参照值用面板×干劲口径(见 skills.ts)。
 */
export interface EffectiveStats extends Stats {
  /** 末脚速度加成与终盘加成用的有效速度(含赛道补正) */
  readonly speed: number;
}

export function softCap(stat: number): number {
  return stat <= STAT_SOFT_CAP ? stat : STAT_SOFT_CAP + (stat - STAT_SOFT_CAP) / 2;
}

export function effectiveStatsOf(runner: RunnerConfig): EffectiveStats {
  const m = MOTIVATION_WISDOM_MULT[runner.motivation];
  const fix = runner.courseFix ?? COURSE_FIX_MAX;
  return {
    speed: softCap(runner.stats.speed) * m * fix,
    stamina: softCap(runner.stats.stamina) * m,
    power: softCap(runner.stats.power) * m,
    guts: softCap(runner.stats.guts) * m,
    wisdom: softCap(runner.stats.wisdom) * m,
  };
}
