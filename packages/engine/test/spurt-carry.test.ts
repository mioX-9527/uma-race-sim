import { describe, expect, test } from 'vitest';
import { simulate } from '../src/simulate';
import type { SkillConfig } from '../src/types';
import { freshRunner, speedSkill, TOKYO_TURF_2400 as C } from './fixtures';

/**
 * 「存速」(Spurt Speed Carry-over)回归测试。
 *
 * 机理(解包 RaceSolver + 社区口径一致):
 * - 速度技能 = 抬高目标速度上限;马以固定加速度爬到上限。
 * - 进入末脚时上限从中盘速度跳到末脚速度,加速段约 10 秒(2400m)。
 * - 若技能在进入末脚那一刻仍在生效,马的「起步速度」已经比基础值高 x,
 *   于是整个加速段都少爬 x,且技能结束后这段速度不需要「还回去」(上限远高于它)。
 * - 反之,在末脚起点之后才发动、并在马爬到原上限之前结束的技能,加速段会把它吃掉(收益≈0)。
 */

/** 距离百分比窗口的中盘/终盘速度技能 */
function buff(id: string, value: number, durationSec: number, fromPct: number): SkillConfig {
  return speedSkill(id, value, durationSec, { condition: { kind: 'distanceRate', fromPct, toPct: 100 } });
}

/** 末脚起点处的瞬时速度(取跨越末脚起点那一帧之前的速度,即「起步速度」) */
function speedAtSpurtStart(r: ReturnType<typeof simulate>): number {
  const m = r.spurtStartMeter;
  if (m === null) throw new Error('未进入末脚');
  for (let i = 1; i < r.x.length; i++) {
    if (r.x[i - 1]! < m && r.x[i]! >= m) return r.v[i - 1]!;
  }
  throw new Error('未找到末脚起点帧');
}

const base = simulate(C, freshRunner([]));
const late = C.phaseBounds.lateStart;

describe('存速(末脚起点速度带进终盘加速段)', () => {
  test('体力充足时末脚起点 = 终盘分界,且起点速度 = 中盘目标速度', () => {
    expect(base.spurtStartMeter).not.toBeNull();
    expect(base.spurtStartMeter!).toBeCloseTo(late, 0);
    expect(base.spurtStartSec!).toBeGreaterThan(70);
    // 起点速度就是中盘目标速度(还没开始爬升)
    expect(speedAtSpurtStart(base)).toBeLessThan(base.spurtTargetSpeed - 3);
  });

  test('技能持续到末脚起点 → 起步速度整体抬高「技能值」(存速的来源)', () => {
    const withBuff = simulate(C, freshRunner([buff('carry', 0.25, 5, 55)]));
    expect(speedAtSpurtStart(withBuff) - speedAtSpurtStart(base)).toBeCloseTo(0.25, 3);
  });

  test('技能在末脚起点前已结束并衰减完 → 起点速度不变(没有存速)', () => {
    // 40% 处发动,5s×2.4=12s,早已在终盘分界前结束并衰减回中盘目标速度
    const early = simulate(C, freshRunner([buff('early', 0.25, 5, 40)]));
    expect(speedAtSpurtStart(early) - speedAtSpurtStart(base)).toBeCloseTo(0, 6);
  });

  test('存速收益 ≈ 值 × 加速段时长,明显大于「值 × 持续时长」', () => {
    const b = simulate(C, freshRunner([buff('carry', 0.25, 5, 55)]));
    const gainSec = base.finishTimeSec - b.finishTimeSec;
    const gainMeter = gainSec * base.spurtTargetSpeed;
    // 加速段时长:末脚速度 − 起点速度)/加速度 ≈ 9.5s,存速 0.25 → 约 2.4m
    const accelSpanSec = (b.spurtTargetSpeed - speedAtSpurtStart(base)) / 0.5;
    expect(gainMeter).toBeGreaterThan(0.25 * accelSpanSec * 0.6);
    // 纯持续时长口径(5s×2.4=12s)只有 3m,存速把它抬到 3m 以上
    expect(gainMeter).toBeGreaterThan(0.25 * 5 * (C.distance / 1000) * 1.2);
  });

  test('末脚起点之后才发动 → 起步速度不变,短技能被加速段吃掉(≈0)', () => {
    // 60% = 1440m = 终盘分界;2s×2.4=4.8s 远短于加速段
    const atStart = simulate(C, freshRunner([buff('atstart', 0.25, 2, 60)]));
    expect(atStart.spurtStartMeter).not.toBeNull();
    expect(speedAtSpurtStart(atStart)).toBeCloseTo(speedAtSpurtStart(base), 6);
    const gainSec = base.finishTimeSec - atStart.finishTimeSec;
    expect(gainSec).toBeCloseTo(0, 6);
  });

  test('末脚起点之后发动但持续超过加速段 → 加速完毕后的尾段有收益', () => {
    const longAtStart = simulate(C, freshRunner([buff('long', 0.25, 5, 60)]));
    const gainSec = base.finishTimeSec - longAtStart.finishTimeSec;
    expect(gainSec).toBeGreaterThan(0);
    // 但仍远小于「起点前发动」的存速收益(只是加速段之后的一小截)
    const carry = simulate(C, freshRunner([buff('carry', 0.25, 5, 55)]));
    expect(base.finishTimeSec - carry.finishTimeSec).toBeGreaterThan(gainSec * 2);
  });
});
