import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { RARITY_LEVEL_FACTOR } from '../src/constants';
import type { SkillConfig } from '../src/types';

/**
 * 进化技能(1M+ 段,模块:技能数据库内容2):本体技能进化后的强化版,
 * 触发代码级条件解析(633 条,193 条双分支);剧本技能等无解包数据的维持排除。
 */
const skillsUrl = new URL('../../../data/skills.json', import.meta.url);
const skills = JSON.parse(readFileSync(fileURLToPath(skillsUrl), 'utf8')) as (SkillConfig & { nameJa?: string })[];
const evolved = skills.filter(s => s.rarity === 'evolved');

describe('进化技能数据', () => {
  test('进化技能已生成(633 条 + 193 双分支,≥700 条)', () => {
    expect(evolved.length).toBeGreaterThanOrEqual(700);
  });

  test('饥肠辘辘大将:中盘 随机位置,耐力恢复 0.055 + 目标速度 0.15,3s', () => {
    const e = skills.find(s => s.id === '100101111');
    expect(e?.name).toBe('饥肠辘辘大将');
    expect(e?.effects).toEqual([
      { type: 'heal', value: 0.055 },
      { type: 'targetSpeed', value: 0.15 },
    ]);
    expect(e?.durationSec).toBe(3);
    expect(e?.precision).toBe('approx'); // phase_random
    expect(e?.restriction?.tactics).toEqual(['senko', 'sashi']); // 前置 先行/差行
  });

  test('强袭疾驰双分支:-b1/-b2,东京2400 前置在限制里', () => {
    const b1 = skills.find(s => s.id === '100101311-b1');
    const b2 = skills.find(s => s.id === '100101311-b2');
    expect(b1?.name).toBe('强袭疾驰(1)');
    expect(b2?.effects[0]).toEqual({ type: 'targetSpeed', value: 0.35 });
    for (const b of [b1, b2]) {
      expect(b?.restriction?.venues).toEqual(['东京']);
      expect(b?.restriction?.distances).toEqual([2400]);
    }
  });

  test('智力增幅系数恒 1.0,且受智力增幅', () => {
    expect(RARITY_LEVEL_FACTOR.evolved).toBe(1.0);
    for (const e of evolved) expect(e.wisdomScaled).toBe(true);
  });

  test('全部有可解析条件与效果(不允许 unsupported 空条件)', () => {
    for (const e of evolved) {
      expect(e.effects.length).toBeGreaterThan(0);
      expect(e.condition).toBeDefined();
    }
  });
});
