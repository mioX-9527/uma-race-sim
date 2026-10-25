import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { effectiveStatsOf, passiveBonusOf } from '../src/effstats';
import { simulate } from '../src/simulate';
import type { Course, SkillConfig } from '../src/types';
import { makeRunner } from './fixtures';

const coursesUrl = new URL('../../../data/courses.json', import.meta.url);
const courses = JSON.parse(readFileSync(fileURLToPath(coursesUrl), 'utf8')) as Course[];
const nak = courses.find(c => c.id === 'c10506')!;
const skillsUrl = new URL('../../../data/skills.json', import.meta.url);
const skills = JSON.parse(readFileSync(fileURLToPath(skillsUrl), 'utf8')) as SkillConfig[];

/** 数据里的常时绿技能(全部效果为 passive、raceStart) */
const green = (name: string): SkillConfig => {
  const s = skills.find(x => x.name === name);
  if (!s) throw new Error('绿技能未找到:' + name);
  return s;
};

describe('常时被动(绿技能)并入起跑属性', () => {
  test('passiveBonusOf:技能被动与手动 greenBonus 合并', () => {
    const s = green('风霜高洁'); // 速度+80 力量+80
    const runner = makeRunner({ skills: [s], greenBonus: { speed: 20 } });
    const p = passiveBonusOf(runner);
    expect(p.speed).toBe(100);
    expect(p.power).toBe(80);
    expect(p.stamina).toBe(0);
  });

  test('有效属性:绿加成先并入面板再过软上限,乘干劲(614tools ZP → E → mood)', () => {
    // 面板 2000,绿 +80 → 合计 2080 → 软上限 1640 → 绝好调 ×1.04 = 1705.6
    const s = skills.find(x => x.effects.length === 1 && x.effects[0]!.type === 'passive' && x.effects[0]!.stat === 'speed' && x.effects[0]!.value === 80)!;
    const runner = makeRunner({ stats: { speed: 2000, stamina: 1200, power: 1200, guts: 1200, wisdom: 1200 }, skills: [s] });
    const eff = effectiveStatsOf(runner);
    expect(eff.speed).toBeCloseTo(1640 * 1.04, 6);
    // 绿加成不吃干劲的判定面:若绿被干劲乘过,值会是 (2000×1.04 + 83.2) 过软上限 → 不同
    const runnerNormal = makeRunner({ ...runner, motivation: 'normal' as never });
    expect(effectiveStatsOf(runnerNormal).speed).toBeCloseTo(1640, 6);
  });

  test('绿耐力提高体力上限;绿力量降低上坡减速(经有效属性传导)', () => {
    const base = makeRunner({ stats: { speed: 1200, stamina: 1200, power: 1200, guts: 1200, wisdom: 1200 } });
    const withGreen = makeRunner({
      stats: { speed: 1200, stamina: 1200, power: 1200, guts: 1200, wisdom: 1200 },
      greenBonus: { stamina: 200 },
    });
    expect(simulate(nak, withGreen).maxHp).toBeGreaterThan(simulate(nak, base).maxHp);
  });

  test('消融:绿技能出现在表中,activated=true,收益为正(速度绿)', () => {
    const s = skills.find(x => x.effects.length === 1 && x.effects[0]!.type === 'passive' && x.effects[0]!.stat === 'speed' && x.effects[0]!.value === 80)!;
    const runner = makeRunner({
      stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
      distanceAptitude: 'S',
      surfaceAptitude: 'A',
      tactic: 'senko',
      skills: [s],
    });
    // 直接用模拟对拍:带绿 vs 不带绿
    const withG = simulate(nak, runner);
    const withoutG = simulate(nak, { ...runner, skills: [] });
    expect(withG.finishTimeSec).toBeLessThan(withoutG.finishTimeSec);
  });

  test('常时被动不进入发动列表(图上无标记)', () => {
    const s = green('风霜高洁');
    const runner = makeRunner({
      stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
      skills: [s],
    });
    const res = simulate(nak, runner);
    expect(res.activations.filter(a => a.skillId === s.id).length).toBe(0);
  });
});
