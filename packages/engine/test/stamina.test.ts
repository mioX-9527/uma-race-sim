import { describe, expect, test } from 'vitest';
import { gutsDrainModifier, maxHpOf, staminaDrainPerSecond } from '../src/stamina';
import { makeRunner, TOKYO_TURF_2400 as C } from './fixtures';

const OPTS = { statusCoef: 1, ground: 0 as const, gutsModifier: 1, phase: 0 as const };

describe('体力模型(解包公式,有效属性口径)', () => {
  test('秒耗:20 × (v − 基准 + 12)² / 144(良/草地/序盘/无状态)', () => {
    expect(staminaDrainPerSecond(19.6, 19.6, C, OPTS)).toBeCloseTo(20, 5);
    expect(staminaDrainPerSecond(25.6, 19.6, C, OPTS)).toBeCloseTo(45, 5);
    expect(staminaDrainPerSecond(17.6, 19.6, C, OPTS)).toBeCloseTo((20 * 100) / 144, 5);
  });

  test('终盘起应用根性消耗系数(有效根性 = 软上限×干劲)', () => {
    const gut = gutsDrainModifier(makeRunner()); // 根性 1200 ×绝好调1.04 = 1248
    expect(gut).toBeCloseTo(1 + 200 / Math.sqrt(600 * 1248), 6);
    const late = { ...OPTS, phase: 2 as const, gutsModifier: gut };
    expect(staminaDrainPerSecond(19.6, 19.6, C, late)).toBeCloseTo(20 * gut, 4);
  });

  test('体力上限 = 0.8 × 跑法系数 × 有效耐力(软上限+干劲) + 距离', () => {
    // 先行(0.89)、耐力 1600 → 软上限 1400 ×绝好调1.04 = 1456 → 0.8×0.89×1456+2400
    const r = makeRunner({ stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 } });
    expect(maxHpOf(C, r)).toBeCloseTo(0.8 * 0.89 * 1456 + 2400, 6);
    // 耐力 1000(不触发软上限)×1.04 = 1040
    const r2 = makeRunner({ stats: { speed: 2200, stamina: 1000, power: 1700, guts: 1200, wisdom: 1800 } });
    expect(maxHpOf(C, r2)).toBeCloseTo(0.8 * 0.89 * 1040 + 2400, 6);
  });
});
