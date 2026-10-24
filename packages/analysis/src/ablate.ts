import { BODY_LENGTH_METERS, simulate } from '@uma-race-sim/engine';
import type { Course, RunnerConfig } from '@uma-race-sim/engine';

export interface AblationRow {
  readonly skillId: string;
  readonly name: string;
  /** 是否在基准模拟中发动(approx/unsupported 或条件未满足时可能不发动) */
  readonly activated: boolean;
  readonly activatedAtMeter: number | null;
  readonly activatedAtSec: number | null;
  /** 去掉该技能后完赛变慢的秒数;>0 表示该技能带来正收益 */
  readonly deltaSec: number;
  /** 距离收益(米),按 Δ时间 × 末速近似 */
  readonly deltaMeter: number;
  /** 马身收益 = 米差 / 2.5 */
  readonly deltaBody: number;
}

export interface AblationReport {
  readonly fullTimeSec: number;
  readonly noSkillTimeSec: number;
  /** 全技能总收益(无技能 − 全技能) */
  readonly totalDeltaSec: number;
  /** 单项收益之和;与 totalDeltaSec 的差 = 技能间交互(回体改变后续发动位置等),UI 需同时展示 */
  readonly sumDeltaSec: number;
  readonly rows: readonly AblationRow[];
}

/**
 * leave-one-out 消融:对每个技能跑一次"去掉它"的模拟。
 * 注意不能用增量法(逐个累加):技能间存在位置/体力耦合,消融法才能如实度量单项贡献。
 */
export function ablate(course: Course, runner: RunnerConfig): AblationReport {
  const full = simulate(course, runner);
  const none = simulate(course, { ...runner, skills: [] });
  const endV = full.v[full.v.length - 1] ?? 1;

  const rows: AblationRow[] = runner.skills.map(skill => {
    const without = simulate(course, {
      ...runner,
      skills: runner.skills.filter(s => s.id !== skill.id),
    });
    const act = full.activations.find(a => a.skillId === skill.id);
    const deltaSec = without.finishTimeSec - full.finishTimeSec;
    const deltaMeter = deltaSec * endV;
    return {
      skillId: skill.id,
      name: skill.name,
      activated: act !== undefined,
      activatedAtMeter: act?.atMeter ?? null,
      activatedAtSec: act?.atSec ?? null,
      deltaSec,
      deltaMeter,
      deltaBody: deltaMeter / BODY_LENGTH_METERS,
    };
  });

  return {
    fullTimeSec: full.finishTimeSec,
    noSkillTimeSec: none.finishTimeSec,
    totalDeltaSec: none.finishTimeSec - full.finishTimeSec,
    sumDeltaSec: rows.reduce((a, r) => a + r.deltaSec, 0),
    rows,
  };
}
