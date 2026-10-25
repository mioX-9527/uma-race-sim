import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { simulate } from '../src/simulate';
import { counterValue, prereqSatisfied } from '../src/prereq';
import type { Course, SkillConfig, SkillPrereq } from '../src/types';
import { freshRunner, makeRunner, speedSkill, TOKYO_TURF_2400 as C } from './fixtures';

const skillsUrl = new URL('../../../data/skills.json', import.meta.url);
const skills = JSON.parse(readFileSync(fileURLToPath(skillsUrl), 'utf8')) as SkillConfig[];
const byId = (id: string): SkillConfig => {
  const s = skills.find(x => x.id === id);
  if (!s) throw new Error('技能未找到:' + id);
  return s;
};

/** 回复技能(中盘起一次) */
const healSkill = (id: string, value = 0.02): SkillConfig => ({
  id,
  name: id,
  rarity: 'normal',
  precision: 'precise',
  effects: [{ type: 'heal', value }],
  durationSec: null,
  condition: { kind: 'phase', phase: 1 },
  wisdomScaled: false,
});

const firedIds = (rep: { activations: readonly { skillId: string }[] }): string[] =>
  rep.activations.map(a => a.skillId);

describe('发动前提:已发动技能计数器', () => {
  /** 依赖「已发动回复技能 ≥3」的终盘速度技能 */
  const need3Heals: SkillConfig = speedSkill('need3heal', 0.2, 3, {
    condition: { kind: 'distanceRate', fromPct: 55, toPct: 100 },
    prereq: { counters: { heal: { min: 3 } } },
  });

  test('回复技能只有 2 个时依赖技能不发动', () => {
    const rep = simulate(C, freshRunner([healSkill('h1'), healSkill('h2'), need3Heals]));
    expect(firedIds(rep)).toEqual(['h1', 'h2']);
  });

  test('回复技能够 3 个才发动', () => {
    const rep = simulate(C, freshRunner([healSkill('h1'), healSkill('h2'), healSkill('h3'), need3Heals]));
    expect(firedIds(rep)).toContain('need3heal');
    // 前提满足后不会憋到终点才发:应在 55% 之后的第一个可发动帧
    const a = rep.activations.find(x => x.skillId === 'need3heal')!;
    expect(a.atMeter).toBeGreaterThanOrEqual(C.distance * 0.55 - 1);
    expect(a.atMeter).toBeLessThan(C.distance * 0.6);
  });

  test('is_activate_any_skill(≥1 个)与 activate_count_all(≥2 个)', () => {
    const anySkill = speedSkill('any', 0.1, 2, {
      condition: { kind: 'phase', phase: 2 },
      prereq: { counters: { all: { min: 1 } } },
    });
    const first = speedSkill('first', 0.1, 2, { condition: { kind: 'phase', phase: 1 } });
    // 只放 any + first:first 在中盘发动后 any 才能在终盘发动
    expect(firedIds(simulate(C, freshRunner([first, anySkill])))).toEqual(['first', 'any']);
    // 单独放 any:它自己不算「已发动」,前面没有任何技能 → 永不发动
    expect(firedIds(simulate(C, freshRunner([anySkill])))).toEqual([]);
  });

  test('activate_count_middle 只数中盘发动的技能', () => {
    const startSkill = speedSkill('s0', 0.1, 2, { condition: { kind: 'phase', phase: 0 } });
    const midSkill = speedSkill('m1', 0.1, 2, { condition: { kind: 'phase', phase: 1 } });
    const need2Mid = speedSkill('need2mid', 0.2, 2, {
      condition: { kind: 'phase', phase: 2 },
      prereq: { counters: { middle: { min: 2 } } },
    });
    // 只有 1 个中盘技能(序盘技能不计入 middle)
    expect(firedIds(simulate(C, freshRunner([startSkill, midSkill, need2Mid])))).not.toContain('need2mid');
    expect(firedIds(simulate(C, freshRunner([startSkill, midSkill, healSkill('m2', 0.01), need2Mid]))))
      .toContain('need2mid');
  });
});

describe('发动前提:需已发动/已持有的具体技能', () => {
  test('requiresFirstBlock:-b2 在 -b1 未发动时不发动', () => {
    const b1 = speedSkill('x-b1', 0.1, 2, { condition: { kind: 'phase', phase: 1 } });
    const b2 = speedSkill('x-b2', 0.2, 2, {
      condition: { kind: 'phase', phase: 2 },
      prereq: { requiresFirstBlock: true },
    });
    expect(firedIds(simulate(C, freshRunner([b2])))).toEqual([]);
    expect(firedIds(simulate(C, freshRunner([b1, b2])))).toEqual(['x-b1', 'x-b2']);
  });

  test('usedSkillBaseIds:需另一个技能先发动(按基础 id 匹配,忽略 -bN)', () => {
    const dep = speedSkill('dep', 0.2, 2, {
      condition: { kind: 'phase', phase: 2 },
      prereq: { usedSkillBaseIds: ['301'] },
    });
    const target = speedSkill('301-b1', 0.1, 2, { condition: { kind: 'phase', phase: 1 } });
    expect(firedIds(simulate(C, freshRunner([dep])))).toEqual([]);
    expect(firedIds(simulate(C, freshRunner([target, dep])))).toEqual(['301-b1', 'dep']);
  });

  test('ownedSkillBaseIds:只要牌组里选了就满足(不看是否发动)', () => {
    const dep = speedSkill('dep2', 0.2, 2, {
      condition: { kind: 'phase', phase: 2 },
      prereq: { ownedSkillBaseIds: ['999'] },
    });
    const owned: SkillConfig = { ...speedSkill('999', 0.1, 2, { condition: { kind: 'phase', phase: 1 } }), precision: 'unsupported' };
    expect(firedIds(simulate(C, freshRunner([dep])))).toEqual([]);
    // 999 即使因 unsupported 不发动,只要在牌组里,dependent 就能发动
    expect(firedIds(simulate(C, freshRunner([owned, dep])))).toEqual(['dep2']);
  });
});

describe('发动前提:绿技能计数与数据驱动', () => {
  const green = (id: string, stat: 'speed' | 'stamina', value: number, restriction?: SkillConfig['restriction']): SkillConfig => ({
    id,
    name: id,
    rarity: 'normal',
    precision: 'precise',
    effects: [{ type: 'passive', stat, value }],
    durationSec: null,
    condition: { kind: 'raceStart' },
    wisdomScaled: false,
    ...(restriction !== undefined ? { restriction } : {}),
  });

  test('activate_count_param_skill 只数当前赛道生效的绿技能', () => {
    const ctx = (runner: ReturnType<typeof makeRunner>) => ({
      course: C,
      runner,
      baseId: 'dep',
      fired: [],
    });
    const dep: SkillPrereq = { counters: { green: { min: 2 } } };
    const tokyo1 = green('g1', 'speed', 20, { venues: ['东京'] });
    const nakayama = green('g2', 'speed', 20, { venues: ['中山'] });
    const tokyo2 = green('g3', 'stamina', 20, { venues: ['东京'] });
    // 中山绿技能在东京不生效 → 只数到 1
    expect(counterValue('green', ctx(makeRunner({ skills: [tokyo1, nakayama] })))).toBe(1);
    expect(prereqSatisfied(dep, ctx(makeRunner({ skills: [tokyo1, nakayama] })))).toBe(false);
    expect(prereqSatisfied(dep, ctx(makeRunner({ skills: [tokyo1, tokyo2, nakayama] })))).toBe(true);
  });

  test('真实数据:圣诞夜的奇迹飞驰！需要「回复技能发动≥3」(触发代码 activate_count_heal>=3)', () => {
    const s = byId('110061');
    expect(s.prereq).toEqual({ counters: { heal: { min: 3 } } });
    // 条件锚在 50% 之后
    expect(s.condition).toMatchObject({ kind: 'distanceRate', fromPct: 50 });
    const two = simulate(C, freshRunner([healSkill('h1'), healSkill('h2'), s]));
    expect(firedIds(two)).not.toContain('110061');
    const three = simulate(C, freshRunner([healSkill('h1'), healSkill('h2'), healSkill('h3'), s]));
    expect(firedIds(three)).toContain('110061');
  });

  test('真实数据:二段构え(2) 需先发动第一段', () => {
    const b1 = byId('202832-b1');
    const b2 = byId('202832-b2');
    expect(b2.prereq).toMatchObject({ requiresFirstBlock: true });
    // 该技能限泥地(ground_type==2),且两段都要求「已发动任意技能」
    const dirt: Course = { ...C, id: 'tokyo-dirt-2400', surface: 'dirt' };
    const filler = speedSkill('filler', 0.05, 2, { condition: { kind: 'phase', phase: 0 } });
    // 只选第二段 → 不发动
    expect(firedIds(simulate(dirt, freshRunner([filler, b2])))).toEqual(['filler']);
    // 两段都选 → 第一段中盘、第二段终盘
    const rep = simulate(dirt, freshRunner([filler, b1, b2]));
    expect(firedIds(rep)).toEqual(expect.arrayContaining(['202832-b1', '202832-b2']));
  });
});
