import { BODY_LENGTH_METERS, sampleableSpans, simulate } from '@uma-race-sim/engine';
import type { Course, Region, RunnerConfig } from '@uma-race-sim/engine';

/** 区段随机类技能的期望位置采样数(在满足区段全长上均匀取点) */
export const POSITION_SAMPLES = 7;

export interface PositionSample {
  /** 强制发动位置(米) */
  readonly meter: number;
  /** 该位置发动时的马身收益(相对无该技能) */
  readonly deltaBody: number;
}

export interface AblationRow {
  readonly skillId: string;
  readonly name: string;
  /** 是否在基准模拟中发动(approx/unsupported 或条件未满足时可能不发动) */
  readonly activated: boolean;
  readonly activatedAtMeter: number | null;
  readonly activatedAtSec: number | null;
  /** 发动次数(带冷却的技能如 弧线大师 可逐弯道多次发动) */
  readonly activationCount: number;
  /** 去掉该技能后完赛变慢的秒数;>0 表示该技能带来正收益 */
  readonly deltaSec: number;
  /** 距离收益(米),按 Δ时间 × 末速近似 */
  readonly deltaMeter: number;
  /** 马身收益 = 米差 / 2.5(规则取位口径) */
  readonly deltaBody: number;
  /**
   * 区段随机类技能(randomPosition)的位置采样:null = 未采样
   * (非随机位置、点条件/动态条件不可枚举、或未发动)。
   */
  readonly positionSamples?: readonly PositionSample[];
  /** 采样马身期望(算术平均);与 deltaBody(规则取位)并列展示 */
  readonly expectedBody?: number;
  /** 采样马身区间 [min, max] */
  readonly bodyRange?: readonly [number, number];
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

/** 在满足区段全长上均匀取 K 个采样点(按区段长度加权;第 i 点取 (i+0.5)/K 分位) */
function samplePositions(spans: readonly Region[], k: number): number[] {
  const total = spans.reduce((a, s) => a + (s[1] - s[0]), 0);
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    let target = ((i + 0.5) / k) * total;
    for (const s of spans) {
      const len = s[1] - s[0];
      if (target <= len) {
        out.push(s[0] + target);
        break;
      }
      target -= len;
    }
  }
  return out;
}

/**
 * leave-one-out 消融:对每个技能跑一次"去掉它"的模拟。
 * 注意不能用增量法(逐个累加):技能间存在位置/体力耦合,消融法才能如实度量单项贡献。
 *
 * 位置采样(方案二):触发代码含 *_random 的技能(randomPosition),发动位置在满足区段内
 * 均匀随机,规则取位只是其中一个实现——对这些技能在满足区段全长上取 K 个均匀采样点,
 * 分别强制在该位置发动(其余技能保持规则发动)再消融,报期望与区间;点条件/动态条件
 * (lastSpurt 等)不可枚举,维持规则发动。
 */
export function ablate(course: Course, runner: RunnerConfig): AblationReport {
  const full = simulate(course, runner);
  const none = simulate(course, { ...runner, skills: [] });
  // 马身差换算基准 = 末脚(冲刺)目标速度(614tools 口径)
  const endV = full.spurtTargetSpeed;

  const rows: AblationRow[] = runner.skills.map(skill => {
    const without = simulate(course, {
      ...runner,
      skills: runner.skills.filter(s => s.id !== skill.id),
    });
    const acts = full.activations.filter(a => a.skillId === skill.id);
    const deltaSec = without.finishTimeSec - full.finishTimeSec;
    const deltaMeter = deltaSec * endV;

    let positionSamples: PositionSample[] | undefined;
    let expectedBody: number | undefined;
    let bodyRange: [number, number] | undefined;
    if (skill.randomPosition === true && acts.length > 0) {
      const spans = sampleableSpans(skill.condition, course);
      if (spans !== null) {
        positionSamples = samplePositions(spans, POSITION_SAMPLES).map(meter => {
          const forced = simulate(course, {
            ...runner,
          }, { positionOverrides: new Map([[skill.id, meter]]) });
          const deltaBody = ((none.finishTimeSec - forced.finishTimeSec) * endV) / BODY_LENGTH_METERS;
          return { meter: Math.round(meter), deltaBody };
        });
        const bodies = positionSamples.map(s => s.deltaBody);
        expectedBody = bodies.reduce((a, b) => a + b, 0) / bodies.length;
        bodyRange = [Math.min(...bodies), Math.max(...bodies)];
      }
    }

    return {
      skillId: skill.id,
      name: skill.name,
      activated: acts.length > 0,
      activatedAtMeter: acts[0]?.atMeter ?? null,
      activatedAtSec: acts[0]?.atSec ?? null,
      activationCount: acts.length,
      deltaSec,
      deltaMeter,
      deltaBody: deltaMeter / BODY_LENGTH_METERS,
      ...(positionSamples !== undefined ? { positionSamples, expectedBody, bodyRange } : {}),
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
