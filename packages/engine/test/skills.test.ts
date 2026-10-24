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

describe('技能效果乘数(脚质×阶段基准乘数,Ce 表)', () => {
  test('普通技能不受智力增幅', () => {
    const runner = makeRunner({ stats: { speed: 1200, stamina: 1200, power: 1200, guts: 1200, wisdom: 1800 } });
    const s = { ...speedSkill('x', 0.2, 3), wisdomScaled: false };
    expect(effectMultiplier(s, runner, 2)).toBe(1);
  });

  test('先行·终盘:参照智力 1872 → ×(1 + 0.21×0.94×1.1)(Ce 表先行恒 0.21;unique5 等级系数 1.1)', () => {
    // 参照智力 =(面板1728+绿72)×干劲1.04 = 1872
    const runner = makeRunner({
      stats: { speed: 1200, stamina: 1200, power: 1200, guts: 1200, wisdom: 1728 },
      greenBonus: { wisdom: 72 },
    });
    const s = { ...speedSkill('u', 0.4, 3), rarity: 'unique5' as const, wisdomScaled: true };
    expect(effectMultiplier(s, runner, 2)).toBeCloseTo(1 + 0.21 * 0.94 * 1.1, 5);
  });

  test('基准乘数按脚质×阶段:追马·最终盘 0.27 / 逃马·终盘 0.19', () => {
    const runner = makeRunner({
      stats: { speed: 1200, stamina: 1200, power: 1200, guts: 1200, wisdom: 1728 },
      greenBonus: { wisdom: 72 },
    });
    const s = { ...speedSkill('u', 0.4, 3), rarity: 'unique5' as const, wisdomScaled: true };
    expect(effectMultiplier(s, { ...runner, tactic: 'oikomi' }, 3)).toBeCloseTo(1 + 0.27 * 0.94 * 1.1, 5);
    expect(effectMultiplier(s, { ...runner, tactic: 'nige' }, 2)).toBeCloseTo(1 + 0.19 * 0.94 * 1.1, 5);
  });
});

describe('持续加成与瞬时效果', () => {
  const runner = makeRunner();
  const skill = speedSkill('s', 0.3, 3);

  test('持续期内目标速度 +0.3(普通技无增幅),过期归零', () => {
    const buff: Buff = { skill, untilSec: 10, mult: 1 };
    expect(targetSpeedBonus([buff], 9.9)).toBeCloseTo(0.3, 6);
    expect(targetSpeedBonus([buff], 10.0)).toBe(0);
  });

  test('固有技按 buff 锁定的乘数缩放', () => {
    const unique = { ...speedSkill('u', 0.3, 3), rarity: 'unique5' as const, wisdomScaled: true };
    const buff: Buff = { skill: unique, untilSec: 10, mult: 1 + 0.21 * 0.94 };
    expect(targetSpeedBonus([buff], 5)).toBeCloseTo(0.3 * (1 + 0.21 * 0.94), 6);
  });

  test('即时速度提升与体力回复(回复按体力上限比例,v0.1 近似)', () => {
    const instant = { ...skill, effects: [{ type: 'currentSpeed' as const, value: 0.65 }, { type: 'heal' as const, value: 0.055 }], durationSec: null };
    const st = applyInstant(instant, { v: 20.0, hp: 400, maxHp: 1000 }, 1);
    expect(st.v).toBeCloseTo(20.65, 6);
    expect(st.hp).toBeCloseTo(455, 6);
  });
});
