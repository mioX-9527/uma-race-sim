import { describe, expect, test } from 'vitest';
import { simulate } from '../src/simulate';
import { lastSpurtSpeedOf, minSpeedOf, phaseTargetSpeed } from '../src/speed';
import { freshRunner, makeRunner, speedSkill, TOKYO_TURF_2400 as C } from './fixtures';

describe('无技能帧积分(解包公式,占位赛道)', () => {
  const res = simulate(C, freshRunner());

  test('完成全程并给出合理完赛时间', () => {
    expect(res.finishTimeSec).toBeGreaterThan(100);
    expect(res.finishTimeSec).toBeLessThan(160);
    expect(res.activations).toHaveLength(0);
    expect(res.exhaustedAtMeter).toBeNull();
  });

  test('位置单调递增且冲线;速度处于合理区间', () => {
    for (let i = 1; i < res.x.length; i++) expect(res.x[i]!).toBeGreaterThan(res.x[i - 1]!);
    expect(res.x[res.x.length - 1]!).toBeGreaterThanOrEqual(C.distance);
    for (const v of res.v) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(30);
    }
  });

  test('出闸:24 m/s² 加速至基准 85%', () => {
    const idx = Math.round(0.67 / (1 / 30));
    expect(res.v[idx]!).toBeGreaterThanOrEqual(16.6);
  });

  test('末脚速度高于终盘目标,终盘目标高于中盘(先行)', () => {
    const r = freshRunner();
    expect(lastSpurtSpeedOf(C, r)).toBeGreaterThan(phaseTargetSpeed(C, r, 2));
    expect(phaseTargetSpeed(C, r, 2)).toBeGreaterThan(phaseTargetSpeed(C, r, 1));
  });

  test('体力全程递减', () => {
    for (let i = 1; i < res.hp.length; i++) expect(res.hp[i]!).toBeLessThan(res.hp[i - 1]!);
  });
});

describe('体力耗尽 → 温存', () => {
  // 高速度(大消耗)+ 极低耐力,保证耗尽:hp = 0.8×0.89×200+2400 ≈ 2542 < 全程消耗
  const weak = makeRunner({ stats: { speed: 2400, stamina: 200, power: 1700, guts: 1200, wisdom: 1800 } });

  test('记录体力归零点且完赛更慢;耗尽后速度受温存线约束', () => {
    const drained = simulate(C, weak);
    const rich = simulate(C, freshRunner());
    expect(drained.exhaustedAtMeter).not.toBeNull();
    expect(drained.finishTimeSec).toBeGreaterThan(rich.finishTimeSec);
    const minSpeed = minSpeedOf(C, weak);
    const idx = drained.x.findIndex(x => x >= (drained.exhaustedAtMeter ?? 0) + 100);
    expect(drained.v[idx]!).toBeLessThanOrEqual(minSpeed + 1.0);
  });
});

describe('技能发动', () => {
  test('终盘速度技能在阶段分界后发动,并加快完赛', () => {
    const skill = speedSkill('finale', 1.0, 10);
    const withSkill = simulate(C, freshRunner([skill]));
    const without = simulate(C, freshRunner());
    expect(withSkill.activations).toHaveLength(1);
    expect(withSkill.activations[0]!.atMeter).toBeGreaterThanOrEqual(C.phaseBounds.lateStart);
    expect(withSkill.finishTimeSec).toBeLessThan(without.finishTimeSec);
  });

  test('unsupported 精度层技能永不发动', () => {
    const skill = speedSkill('bad', 1.0, 10, { precision: 'unsupported' });
    const res = simulate(C, freshRunner([skill]));
    expect(res.activations).toHaveLength(0);
  });

  test('回体技能可推迟体力归零点', () => {
    const healSkill = {
      ...speedSkill('heal', 0, 0),
      effects: [{ type: 'heal' as const, value: 0.3 }],
      durationSec: null,
      condition: { kind: 'phase', phase: 1 } as const,
    };
    const weak = { stats: { speed: 2400, stamina: 200, power: 1700, guts: 1200, wisdom: 1800 } };
    const noHeal = simulate(C, makeRunner({ ...weak, skills: [] }));
    const withHeal = simulate(C, makeRunner({ ...weak, skills: [healSkill] }));
    expect(withHeal.exhaustedAtMeter!).toBeGreaterThan(noHeal.exhaustedAtMeter!);
  });
});
