import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { RARITY_LEVEL_FACTOR } from '../src/constants';
import type { SkillConfig } from '../src/types';

/**
 * 继承固有(900xxx,模块:技能数据库内容2):
 * 固有技能的继承版与本体(大招)数值/持续时间不同(如 流星:本体 6s 0.35/0.10 → 继承 3.6s 0.15/0.05);
 * 等级不可升级 → 智力增幅等级系数恒 1.0。
 */
const skillsUrl = new URL('../../../data/skills.json', import.meta.url);
const skills = JSON.parse(readFileSync(fileURLToPath(skillsUrl), 'utf8')) as (SkillConfig & { nameJa?: string })[];
const heirs = skills.filter(s => s.rarity === 'uniqueHeir');

describe('继承固有技能数据', () => {
  test('继承技已生成(271 固有 × 分支,≥300 条)', () => {
    expect(heirs.length).toBeGreaterThanOrEqual(300);
  });

  test('命名区分本体:名称含「(继承)」,日文名含「(継承)」', () => {
    for (const h of heirs) {
      expect(h.name).toContain('(继承)');
      expect(h.nameJa ?? '').toContain('(継承)');
    }
  });

  test('流星:本体 6s 0.35/0.10 → 继承 3.6s 0.15/0.05(数值不同)', () => {
    const base = skills.find(s => s.id === '100011');
    const heir = skills.find(s => s.id === '900011');
    expect(base?.effects).toEqual([
      { type: 'currentSpeed', value: 0.35 },
      { type: 'acceleration', value: 0.1 },
    ]);
    expect(base?.durationSec).toBe(6);
    expect(heir?.effects).toEqual([
      { type: 'currentSpeed', value: 0.15 },
      { type: 'acceleration', value: 0.05 },
    ]);
    expect(heir?.durationSec).toBe(3.6);
  });

  test('绝大多数继承技与本体数值不同(允许负面段不变的特殊情形)', () => {
    const baseByBranch = new Map(
      skills
        .filter(s => s.rarity !== 'uniqueHeir')
        .flatMap(s => {
          // 继承分支 -bN 对齐本体同名分支;本体单分支时对齐本体条目
          const m = s.id.match(/^(.*)-b\d$/);
          return m ? [[m[1]! + (s.id.endsWith('-b1') ? '-b1' : '-b2'), s], [m[1]!, s]] : [[s.id, s]];
        }),
    );
    let diff = 0;
    const same: string[] = [];
    for (const h of heirs) {
      const baseId = String(Number(h.id.replace(/-b\d$/, '')) - 800000);
      const branch = h.id.match(/-b\d$/)?.[0] ?? '';
      const base = baseByBranch.get(baseId + branch) ?? baseByBranch.get(baseId);
      expect(base).toBeDefined();
      const sig = (x: SkillConfig) => JSON.stringify([x.effects, x.durationSec]);
      if (sig(h) === sig(base!)) same.push(h.id);
      else diff++;
    }
    // 游戏数据实况:负面段(减益)在继承版保持不变,增益段被削减
    expect(diff).toBeGreaterThan(heirs.length * 0.9);
    expect(same.length).toBeLessThanOrEqual(2);
  });

  test('继承技智力增幅系数恒 1.0(不可升级),且受智力增幅', () => {
    expect(RARITY_LEVEL_FACTOR.uniqueHeir).toBe(1.0);
    for (const h of heirs) expect(h.wisdomScaled).toBe(true);
  });

  test('全部为一次性技能(基准冷却 500s → cooldownSec 缺省/null)', () => {
    for (const h of heirs) {
      expect(h.cooldownSec ?? null).toBeNull();
    }
  });
});
