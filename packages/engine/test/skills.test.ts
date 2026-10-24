import { describe, expect, test } from 'vitest';
import { applyInstant, effectMultiplier, targetSpeedBonus, wisdomCorrection, type Buff } from '../src/skills';
import { makeRunner, speedSkill } from './fixtures';

describe('智力补正(614tools 档位表)', () => {
  test('1200 以下为 0', () => {
    expect(wisdomCorrection(1200)).toBe(0);
    expect(wisdomCorrection(1000)).toBe(0);
  });

  test('参照智力 1872 → 0.94(614tools 示例)', () => {
    expect(wisdomCorrection(1872)).toBeCloseTo(0.94, 6);
  });

  test('连续累计后向上取整到 0.01(与 1872→0.94 锚点一致)', () => {
    expect(wisdomCorrection(1219)).toBeCloseTo(0.02, 6); // 0.019 → 0.02
    expect(wisdomCorrection(1221)).toBeCloseTo(0.03, 6); // 0.021 → 0.03
    expect(wisdomCorrection(1239)).toBeCloseTo(0.04, 6); // 0.039 → 0.04
  });
});

describe('技能效果乘数', () => {
  test('普通技能不受智力增幅', () => {
    const runner = makeRunner({ stats: { speed: 1200, stamina: 1200, power: 1200, guts: 1200, wisdom: 1800 } });
    const s = { ...speedSkill('x', 0.2, 3), wisdomScaled: false };
    expect(effectMultiplier(s, runner)).toBe(1);
  });

  test('固有·受智力增幅:参照智力 1872 → ×(1 + 0.21×0.94)', () => {
    const runner = makeRunner({
      stats: { speed: 1200, stamina: 1200, power: 1200, guts: 1200, wisdom: 1800 },
      greenBonus: { wisdom: 72 },
    });
    const s = { ...speedSkill('u', 0.4, 3), rarity: 'unique5' as const, wisdomScaled: true };
    expect(effectMultiplier(s, runner)).toBeCloseTo(1 + 0.21 * 0.94, 5);
  });
});

describe('持续加成与瞬时效果', () => {
  const runner = makeRunner();
  const skill = speedSkill('s', 0.3, 3);

  test('持续期内目标速度 +0.3,过期归零', () => {
    const buff: Buff = { skill, untilSec: 10 };
    expect(targetSpeedBonus([buff], 9.9, runner)).toBeCloseTo(0.3, 6);
    expect(targetSpeedBonus([buff], 10.0, runner)).toBe(0);
  });

  test('即时速度提升与体力回复(回复按体力上限比例,v0.1 近似)', () => {
    const instant = { ...skill, effects: [{ type: 'currentSpeed' as const, value: 0.65 }, { type: 'heal' as const, value: 0.055 }], durationSec: null };
    const st = applyInstant(instant, { v: 20.0, hp: 400, maxHp: 1000 }, runner);
    expect(st.v).toBeCloseTo(20.65, 6);
    expect(st.hp).toBeCloseTo(455, 6);
  });
});
