import { describe, expect, test } from 'vitest';
import { simulate } from '../src/simulate';
import { freshRunner, makeRunner, speedSkill, TOKYO_TURF_2400 as C } from './fixtures';

/** 中盘发动的通用测试技能(便于观察限制是否拦截) */
const midSkill = speedSkill('r-test', 0.5, 10, { condition: { kind: 'phase', phase: 1 } as never });

describe('装配型限制(脚质/场地/距离档)判定', () => {
  test('脚质不符 → 整场不发动;相符 → 正常发动', () => {
    const nigeOnly = { ...midSkill, restriction: { tactics: ['nige' as const] } };
    const senkoRunner = simulate(C, freshRunner([nigeOnly]));
    expect(senkoRunner.activations).toHaveLength(0);
    const nigeRunner = simulate(C, makeRunner({ tactic: 'nige', skills: [nigeOnly] }));
    expect(nigeRunner.activations).toHaveLength(1);
  });

  test('距离档不符(中距离技在长距离档赛道)→ 不发动', () => {
    const midOnly = { ...midSkill, restriction: { distanceTypes: ['mid' as const] } };
    const tokyo2400 = simulate(C, freshRunner([midOnly])); // 2400m = 中距离
    expect(tokyo2400.activations).toHaveLength(1);
    const longCourse = { ...C, distance: 3000, distanceType: 'long' as const };
    const kyoto3000 = simulate(longCourse, freshRunner([midOnly]));
    expect(kyoto3000.activations).toHaveLength(0);
  });

  test('场地不符(泥地技在草地)→ 不发动', () => {
    const dirtOnly = { ...midSkill, restriction: { surfaces: ['dirt' as const] } };
    const res = simulate(C, freshRunner([dirtOnly]));
    expect(res.activations).toHaveLength(0);
  });

  test('精确距离限制:2400m 技在 2400 赛道发动、2300 不发动', () => {
    const exact = { ...midSkill, restriction: { distances: [2400] } };
    expect(simulate(C, freshRunner([exact])).activations).toHaveLength(1);
    expect(simulate({ ...C, distance: 2300 }, freshRunner([exact])).activations).toHaveLength(0);
  });
});
