import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ablate } from '@uma-race-sim/analysis';
import { sampleableSpans, simulate } from '../src';
import type { Course, SkillConfig } from '../src/types';
import { makeRunner, speedSkill } from './fixtures';

const coursesUrl = new URL('../../../data/courses.json', import.meta.url);
const courses = JSON.parse(readFileSync(fileURLToPath(coursesUrl), 'utf8')) as Course[];
const nak = courses.find(c => c.id === 'c10506')!;
const skillsUrl = new URL('../../../data/skills.json', import.meta.url);
const skills = JSON.parse(readFileSync(fileURLToPath(skillsUrl), 'utf8')) as SkillConfig[];

describe('positionOverrides(消融位置采样地基)', () => {
  test('强制发动位置:技能在指定米数处发动,而非条件区段入口', () => {
    const arc = skills.find(s => s.name === '弧线大师')!;
    const runner = makeRunner({ stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 }, skills: [arc] });
    const forced = simulate(nak, runner, { positionOverrides: new Map([[arc.id, 1800]]) });
    const act = forced.activations.filter(a => a.skillId === arc.id);
    expect(act.length).toBeGreaterThanOrEqual(1);
    expect(act[0]!.atMeter).toBeGreaterThanOrEqual(1800);
    expect(act[0]!.atMeter).toBeLessThan(1810);
  });

  test('无 override 时技能在条件区段入口发动(回归)', () => {
    const arc = skills.find(s => s.name === '弧线大师')!;
    const runner = makeRunner({ stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 }, skills: [arc] });
    const res = simulate(nak, runner);
    const act = res.activations.filter(a => a.skillId === arc.id);
    expect(act[0]!.atMeter).toBeCloseTo(100, 0); // 弯道1 入口 100m
  });

  test('一次性技能同样可强制', () => {
    const s = speedSkill('once-skill', 0.3, 3);
    const runner = makeRunner({ stats: { speed: 2200, stamina: 5000, power: 1700, guts: 1200, wisdom: 1800 }, skills: [s] });
    const forced = simulate(nak, runner, { positionOverrides: new Map([['once-skill', 2000]]) });
    const act = forced.activations.filter(a => a.skillId === 'once-skill');
    expect(act.length).toBe(1);
    expect(act[0]!.atMeter).toBeGreaterThanOrEqual(2000);
  });
});

describe('sampleableSpans', () => {
  test('cornerFastest → 全部弯道段;lastSpurt → null(动态不可枚举)', () => {
    const spans = sampleableSpans({ kind: 'cornerFastest' }, nak)!;
    expect(spans.length).toBe(6);
    expect(spans[0]![0]).toBe(100);
    expect(sampleableSpans({ kind: 'lastSpurt' }, nak)).toBeNull();
    expect(sampleableSpans({ kind: 'raceStart' }, nak)).toBeNull();
  });
});

describe('ablate 位置采样', () => {
  test('弧线大师(中山2500):7 个采样点,期望在区间内,规则取位在区间内', () => {
    const arc = skills.find(s => s.name === '弧线大师')!;
    const runner = makeRunner({
      stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
      distanceAptitude: 'S',
      surfaceAptitude: 'A',
      tactic: 'senko',
      skills: [arc],
    });
    const rep = ablate(nak, runner);
    const row = rep.rows[0]!;
    expect(row.activationCount).toBe(2);
    expect(row.positionSamples).toBeDefined();
    expect(row.positionSamples!.length).toBe(7);
    const bodies = row.positionSamples!.map(s => s.deltaBody);
    // 采样点覆盖满足区段(首个在弯道1内 100~246m)
    expect(row.positionSamples![0]!.meter).toBeGreaterThanOrEqual(100);
    expect(row.positionSamples![0]!.meter).toBeLessThanOrEqual(246);
    // 不同位置收益确实不同(用户提出的问题前提)
    expect(new Set(bodies).size).toBeGreaterThan(1);
    // 单随机技能:联合 MC 期望 ≈ K 点均匀采样期望(两者估计同一期望)
    const kMean = bodies.reduce((a, b) => a + b, 0) / bodies.length;
    expect(Math.abs(row.expectedBody! - kMean)).toBeLessThan(0.3);
  });

  test('联合蒙特卡洛:单随机技能时 Σ期望=总收益期望=行期望,且报抽样组数', () => {
    const arc = skills.find(s => s.name === '弧线大师')!;
    const runner = makeRunner({
      stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
      distanceAptitude: 'S',
      surfaceAptitude: 'A',
      tactic: 'senko',
      skills: [arc],
    });
    const rep = ablate(nak, runner);
    expect(rep.mcDraws).toBeDefined();
    expect(rep.totalExpectedSec).toBeDefined();
    expect(rep.sumExpectedSec).toBeDefined();
    // 单技能:总收益期望与行期望是同一量的两种换算
    const bodyFromTotal = (rep.totalExpectedSec! * (simulate(nak, runner).spurtTargetSpeed)) / 2.5;
    expect(bodyFromTotal).toBeCloseTo(rep.rows[0]!.expectedBody!, 6);
    expect(rep.sumExpectedSec! * (simulate(nak, runner).spurtTargetSpeed) / 2.5).toBeCloseTo(rep.rows[0]!.expectedBody!, 6);
  });

  test('非随机位置技能不采样(precise/无 randomPosition)', () => {
    const s = speedSkill('plain-skill', 0.3, 3);
    const runner = makeRunner({ stats: { speed: 2200, stamina: 5000, power: 1700, guts: 1200, wisdom: 1800 }, skills: [s] });
    const rep = ablate(nak, runner);
    expect(rep.rows[0]!.positionSamples).toBeUndefined();
    expect(rep.mcDraws).toBeUndefined();
  });
});
