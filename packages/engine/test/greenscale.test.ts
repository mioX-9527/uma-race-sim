import { describe, expect, test } from 'vitest';
import { simulate } from '../src/simulate';
import { expandScaleByGreen } from '../src/skills';
import { makeRunner, TOKYO_TURF_2400 as C } from './fixtures';
import type { RunnerConfig, SkillConfig } from '../src/types';

/**
 * 绿技能发动数分档固有(小林历奇「时来运转，龙腾九霄」形态):
 * 基础 速度+0.25 恒定;绿技能 0~2 → 无追加 / 3~4 → +0.05速+0.05加 / 5 → ×2 / 6+ → ×3。
 * 引擎在 simulate 开头按 counterValue('green') 一次性展开,下游流程完全复用。
 */
const scaleSkill: SkillConfig = {
  id: 'gs1',
  name: 'gs1',
  rarity: 'normal',
  precision: 'approx',
  effects: [{ type: 'targetSpeed', value: 0.25 }],
  durationSec: 5,
  condition: { kind: 'phase', phase: 1, part: 'laterHalf' },
  wisdomScaled: false,
  scaleByGreen: {
    base: [{ type: 'targetSpeed', value: 0.25 }],
    tiers: [
      { min: 3, max: 4, effects: [{ type: 'targetSpeed', value: 0.05 }, { type: 'acceleration', value: 0.05 }] },
      { min: 5, max: 5, effects: [{ type: 'targetSpeed', value: 0.1 }, { type: 'acceleration', value: 0.1 }] },
      { min: 6, effects: [{ type: 'targetSpeed', value: 0.15 }, { type: 'acceleration', value: 0.15 }] },
    ],
  },
};

/** 绿技能(智力被动,无物理效果,不干扰速度对比) */
const greenSkill = (n: number): SkillConfig => ({
  id: `green-${n}`,
  name: `green-${n}`,
  rarity: 'normal',
  precision: 'precise',
  effects: [{ type: 'passive', stat: 'wisdom', value: 60 }],
  durationSec: null,
  condition: { kind: 'raceStart' },
  wisdomScaled: false,
});

const runnerWithGreens = (n: number): RunnerConfig =>
  makeRunner({ skills: [scaleSkill, ...Array.from({ length: n }, (_, i) => greenSkill(i))] });

describe('expandScaleByGreen 展开', () => {
  test('0~2 绿 → 仅 base;3~4/5/6+ → 对应档位叠加', () => {
    const [s] = expandScaleByGreen([scaleSkill], 2);
    expect(s!.effects).toHaveLength(1);
    const [s3] = expandScaleByGreen([scaleSkill], 3);
    expect(s3!.effects).toEqual([{ type: 'targetSpeed', value: 0.25 }, { type: 'targetSpeed', value: 0.05 }, { type: 'acceleration', value: 0.05 }]);
    const [s5] = expandScaleByGreen([scaleSkill], 5);
    expect(s5!.effects).toEqual([{ type: 'targetSpeed', value: 0.25 }, { type: 'targetSpeed', value: 0.1 }, { type: 'acceleration', value: 0.1 }]);
    const [s9] = expandScaleByGreen([scaleSkill], 9);
    expect(s9!.effects).toEqual([{ type: 'targetSpeed', value: 0.25 }, { type: 'targetSpeed', value: 0.15 }, { type: 'acceleration', value: 0.15 }]);
  });

  test('无 scaleByGreen 的技能原样返回(引用不变)', () => {
    const plain: SkillConfig = { ...scaleSkill, scaleByGreen: undefined, id: 'plain' };
    expect(expandScaleByGreen([plain], 6)[0]).toBe(plain);
  });
});

describe('分档固有行为(simulate)', () => {
  const finish = (n: number): number => simulate(C, runnerWithGreens(n)).finishTimeSec;

  test('0 绿与 2 绿完全一致(追加档未生效)', () => {
    expect(finish(2)).toBeCloseTo(finish(0), 9);
  });

  test('绿技能越多越快:3 < 2,5 < 3,6 < 5', () => {
    const t0 = finish(0);
    const t3 = finish(3);
    const t5 = finish(5);
    const t6 = finish(6);
    expect(t3).toBeLessThan(t0);
    expect(t5).toBeLessThan(t3);
    expect(t6).toBeLessThan(t5);
  });

  test('发动记录不受分档影响(1 次发动)', () => {
    const res = simulate(C, runnerWithGreens(6));
    expect(res.activations.filter(a => a.skillId === 'gs1')).toHaveLength(1);
  });
});
