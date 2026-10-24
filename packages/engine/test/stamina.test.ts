import { describe, expect, test } from 'vitest';
import { gutsDrainModifier, maxHpOf, staminaDrainPerSecond } from '../src/stamina';
import { makeRunner, TOKYO_TURF_2400 as C } from './fixtures';

const OPTS = { statusCoef: 1, ground: 0 as const, gutsModifier: 1, phase: 0 as const };

describe('体力模型(解包公式)', () => {
  test('秒耗:20 × (v − 基准 + 12)² / 144(良/草地/序盘/无状态)', () => {
    expect(staminaDrainPerSecond(19.6, 19.6, C, OPTS)).toBeCloseTo(20, 5);
    expect(staminaDrainPerSecond(25.6, 19.6, C, OPTS)).toBeCloseTo(45, 5);
    expect(staminaDrainPerSecond(17.6, 19.6, C, OPTS)).toBeCloseTo((20 * 100) / 144, 5);
  });

  test('终盘起应用根性消耗系数', () => {
    const gut = gutsDrainModifier(makeRunner()); // 根性1200 → 1+200/√720000 ≈ 1.2357
    expect(gut).toBeCloseTo(1 + 200 / Math.sqrt(600 * 1200), 6);
    const late = { ...OPTS, phase: 2 as const, gutsModifier: gut };
    expect(staminaDrainPerSecond(19.6, 19.6, C, late)).toBeCloseTo(20 * gut, 4);
  });

  test('体力上限 = 0.8 × 跑法系数 × 耐力 + 距离', () => {
    // 先行(0.89)、耐力 1600、2400m → 0.8×0.89×1600+2400 = 3539.2
    const r = makeRunner({ stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 } });
    expect(maxHpOf(C, r)).toBeCloseTo(0.8 * 0.89 * 1600 + 2400, 6);
  });
});
