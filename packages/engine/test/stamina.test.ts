import { describe, expect, test } from 'vitest';
import { staminaDrainPerSecond } from '../src/stamina';

const OPTS = { stateCoef: 1, surfaceCoef: 1 };

describe('体力消耗公式:20 × 状态 × (v − 基准 + 12)² / 144 × 场地', () => {
  test('基准速度下每秒消耗 20 点', () => {
    expect(staminaDrainPerSecond(19.6, 19.6, OPTS)).toBeCloseTo(20, 6);
  });

  test('超速 6m/s 时消耗 2.25 倍(45/s)', () => {
    expect(staminaDrainPerSecond(25.6, 19.6, OPTS)).toBeCloseTo(45, 6);
  });

  test('低于基准 2m/s 时消耗 20 × 10²/144', () => {
    expect(staminaDrainPerSecond(17.6, 19.6, OPTS)).toBeCloseTo((20 * 100) / 144, 6);
  });

  test('场地系数与状态系数线性放大', () => {
    const base = staminaDrainPerSecond(19.6, 19.6, OPTS);
    expect(staminaDrainPerSecond(19.6, 19.6, { stateCoef: 1.2, surfaceCoef: 1 })).toBeCloseTo(base * 1.2, 6);
    expect(staminaDrainPerSecond(19.6, 19.6, { stateCoef: 1, surfaceCoef: 1.1 })).toBeCloseTo(base * 1.1, 6);
  });
});
