import { describe, expect, test } from 'vitest';
import { ablate } from '../src/ablate';
import { freshRunner, speedSkill, TOKYO_TURF_2400 as C } from '@uma-race-sim/engine/test/fixtures';
import type { SkillConfig } from '@uma-race-sim/engine';

describe('leave-one-out 消融', () => {
  const s1 = speedSkill('sp-a', 0.3, 10);
  const s2 = speedSkill('sp-b', 0.5, 10);
  const rep = ablate(C, freshRunner([s1, s2]));

  test('每个技能一行,均发动且为正收益', () => {
    expect(rep.rows).toHaveLength(2);
    for (const r of rep.rows) {
      expect(r.activated).toBe(true);
      expect(r.deltaSec).toBeGreaterThan(0);
      expect(r.deltaMeter).toBeGreaterThan(0);
      expect(r.deltaBody).toBeCloseTo(r.deltaMeter / 2.5, 6);
    }
  });

  test('总收益大于任一单项', () => {
    expect(rep.totalDeltaSec).toBeGreaterThan(rep.rows[0]!.deltaSec);
    expect(rep.totalDeltaSec).toBeGreaterThan(rep.rows[1]!.deltaSec);
  });

  test('体力充足且无交互时,Σ单项 ≈ 总收益', () => {
    expect(Math.abs(rep.sumDeltaSec - rep.totalDeltaSec)).toBeLessThan(rep.totalDeltaSec * 0.1 + 0.05);
  });

  test('不支持的技能:不计收益,activated=false', () => {
    const bad = speedSkill('bad', 1.0, 10, { precision: 'unsupported' });
    const r = ablate(C, freshRunner([bad]));
    expect(r.rows[0]!.activated).toBe(false);
    expect(r.rows[0]!.deltaSec).toBe(0);
    expect(r.totalDeltaSec).toBe(0);
  });
});

describe('装配限制不满足的技能(标注「不生效」)', () => {
  test('限制不满足:applicable=false,收益恒 0,activated=false', () => {
    const green = speedSkill('green-off', 0.5, 0, {
      effects: [{ type: 'passive', stat: 'speed', value: 60 }],
      durationSec: null,
      condition: { kind: 'raceStart' },
      restriction: { rotations: [2] }, // 逆时针,而 C(Tokyo 结构示例)无 rotation → 不匹配
    });
    const rep = ablate(C, freshRunner([green]));
    const row = rep.rows[0]!;
    expect(row.applicable).toBe(false);
    expect(row.activated).toBe(false);
    expect(row.deltaSec).toBeCloseTo(0, 10);
    expect(row.deltaBody).toBeCloseTo(0, 10);
  });

  test('限制满足时同一技能正常计入(对照)', () => {
    const green = speedSkill('green-on', 0.5, 0, {
      effects: [{ type: 'passive', stat: 'speed', value: 60 }],
      durationSec: null,
      condition: { kind: 'raceStart' },
      restriction: { rotations: [1] },
    });
    const rep = ablate({ ...C, rotation: 1 as const }, freshRunner([green]));
    const row = rep.rows[0]!;
    expect(row.applicable).toBe(true);
    expect(row.activated).toBe(true);
    expect(row.deltaSec).toBeGreaterThan(0);
  });
});

describe('单项效果消融(只去掉效果、保留发动)', () => {
  /** 中盘发动一次、回复量为给定值的回复技能 */
  const healSkill = (id: string): SkillConfig => ({
    id,
    name: id,
    rarity: 'normal',
    precision: 'precise',
    effects: [{ type: 'heal', value: 0.02 }],
    durationSec: null,
    condition: { kind: 'phase', phase: 1 },
    wisdomScaled: false,
  });

  test('回复技能自身 0 收益,不再背负「大招因此不发动」的收益', () => {
    const heals = [healSkill('h1'), healSkill('h2'), healSkill('h3')];
    // 圣诞夜的奇迹飞驰:prereq 回复技能≥3,条件 50%~终点
    const ult: SkillConfig = {
      ...speedSkill('ult', 0.25, 5),
      condition: { kind: 'distanceRate', fromPct: 50, toPct: 100 },
      prereq: { counters: { heal: { min: 3 } } },
    };
    const rep = ablate(C, freshRunner([...heals, ult]));
    const byId = new Map(rep.rows.map(r => [r.skillId, r]));
    for (const h of heals) expect(Math.abs(byId.get(h.id)!.deltaSec)).toBeLessThan(1e-9);
    expect(byId.get('ult')!.deltaSec).toBeGreaterThan(0);
    // Σ 单项 ≈ 总收益(不再把同一份大招收益重复计 3 次)
    expect(rep.sumDeltaSec).toBeCloseTo(byId.get('ult')!.deltaSec, 6);
  });

  test('前提链:-b2 只在 -b1 发动后才算收益,且 -b1 标注被依赖', () => {
    // 注意:b1 的加成要够大才看得出完赛差异(终盘前期速度还在爬升,+0.1/2s 会在追上目标速度前就过期)
    const b1 = speedSkill('x-b1', 0.3, 5, { condition: { kind: 'phase', phase: 2 } });
    const b2 = speedSkill('x-b2', 0.2, 2, {
      condition: { kind: 'phase', phase: 3 },
      prereq: { requiresFirstBlock: true },
    });
    const rep = ablate(C, freshRunner([b1, b2]));
    const byId = new Map(rep.rows.map(r => [r.skillId, r]));
    expect(byId.get('x-b1')!.deltaSec).toBeGreaterThan(0);
    expect(byId.get('x-b2')!.deltaSec).toBeGreaterThan(0);
    expect(byId.get('x-b1')!.dependentIds).toEqual(['x-b2']);
    expect(byId.get('x-b2')!.dependentIds).toBeUndefined();
  });
});

describe('存速(末脚起点仍生效的速度加成)', () => {
  const buff = (id: string, fromPct: number): SkillConfig => ({
    id,
    name: id,
    rarity: 'normal',
    precision: 'precise',
    effects: [{ type: 'targetSpeed', value: 0.25 }],
    durationSec: 5,
    condition: { kind: 'distanceRate', fromPct, toPct: 100 },
    wisdomScaled: false,
  });

  test('持续到末脚起点 → 报告 carryOverSpeed;起点前结束 → 不报告', () => {
    const rep = ablate(C, freshRunner([buff('carry', 55), buff('early', 40)]));
    const byId = new Map(rep.rows.map(r => [r.skillId, r]));
    expect(byId.get('carry')!.carryOverSpeed).toBeCloseTo(0.25, 3);
    expect(byId.get('carry')!.carryOverLeftSec).toBeGreaterThan(0);
    expect(byId.get('early')!.carryOverSpeed).toBeUndefined();
  });

  test('存速行的收益高于同数值但早结束的行(加速段把它带进终盘)', () => {
    const rep = ablate(C, freshRunner([buff('carry', 55), buff('early', 40)]));
    const byId = new Map(rep.rows.map(r => [r.skillId, r]));
    expect(byId.get('carry')!.deltaSec).toBeGreaterThan(byId.get('early')!.deltaSec);
  });
});
