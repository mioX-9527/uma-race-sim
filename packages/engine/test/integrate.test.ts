import { describe, expect, test } from 'vitest';
import { simulate } from '../src/simulate';
import { freshRunner, makeRunner, speedSkill, TOKYO_TURF_2400 as C } from './fixtures';

describe('无技能帧积分(占位赛道,断言机制而非数值精度)', () => {
  const res = simulate(C, freshRunner());

  test('完成全程并给出有限完赛时间', () => {
    expect(res.finishTimeSec).toBeGreaterThan(100);
    expect(res.finishTimeSec).toBeLessThan(160);
    expect(res.activations).toHaveLength(0);
    expect(res.exhaustedAtMeter).toBeNull();
  });

  test('位置单调递增且冲线', () => {
    for (let i = 1; i < res.x.length; i++) expect(res.x[i]!).toBeGreaterThan(res.x[i - 1]!);
    expect(res.x[res.x.length - 1]!).toBeGreaterThanOrEqual(C.distance);
  });

  test('速度处于合理区间', () => {
    for (const v of res.v) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(30);
    }
  });

  test('出闸:24 m/s² 加速至基准 85%', () => {
    const idx = Math.round(0.67 / (1 / 30)); // ~0.67s 处应已越过 85%×19.6≈16.66
    expect(res.v[idx]!).toBeGreaterThanOrEqual(16.6);
  });

  test('体力全程递减', () => {
    for (let i = 1; i < res.hp.length; i++) expect(res.hp[i]!).toBeLessThan(res.hp[i - 1]!);
  });
});

describe('体力耗尽 → 温存', () => {
  test('低耐力:记录体力归零点且完赛更慢', () => {
    const weak = simulate(C, makeRunner({ stats: { speed: 1200, stamina: 700, power: 1200, guts: 1200, wisdom: 1200 } }));
    const rich = simulate(C, freshRunner());
    expect(weak.exhaustedAtMeter).not.toBeNull();
    expect(weak.finishTimeSec).toBeGreaterThan(rich.finishTimeSec);
  });
});

describe('技能发动', () => {
  test('终盘速度技能在最终盘分界后发动,并加快完赛', () => {
    const skill = speedSkill('finale', 1.0, 10);
    const withSkill = simulate(C, freshRunner([skill]));
    const without = simulate(C, freshRunner());
    expect(withSkill.activations).toHaveLength(1);
    expect(withSkill.activations[0]!.atMeter).toBeGreaterThanOrEqual(C.phaseBounds.finalStart);
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
    const weak = { stats: { speed: 1200, stamina: 700, power: 1200, guts: 1200, wisdom: 1200 } };
    const noHeal = simulate(C, makeRunner({ ...weak, skills: [] }));
    const withHeal = simulate(C, makeRunner({ ...weak, skills: [healSkill] }));
    expect(withHeal.exhaustedAtMeter!).toBeGreaterThan(noHeal.exhaustedAtMeter!);
  });
});
