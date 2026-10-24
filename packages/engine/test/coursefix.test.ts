import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { Course } from '../src/types';
import { courseFixOf, effectiveStatsOf } from '../src/effstats';
import { makeRunner } from './fixtures';
import { simulate } from '../src/simulate';

/**
 * 赛道补正自动计算(uma-skill-tools CourseHelpers.courseSpeedModifier):
 *   1 + 平均((1 + floor(min(参照属性,901)/300.01)) × 0.05),参照属性 =(面板+绿)×干劲;
 *   courseSetStatus 为空 → ×1.0;数字 courseFix = 手动覆盖。
 */
const dataUrl = new URL('../../../data/courses.json', import.meta.url);
const courses = JSON.parse(readFileSync(fileURLToPath(dataUrl), 'utf8')) as Course[];
const nakayama2500 = courses.find(c => c.id === 'c10506'); // 有马纪念,门槛 [耐力, 根性]

describe('courseFixOf 自动补正', () => {
  test('空门槛(courseSetStatus 无)→ ×1.0', () => {
    const r = makeRunner();
    expect(courseFixOf(undefined, r)).toBe(1);
    expect(courseFixOf({ ...makeCourse(), courseSetStatus: [] }, r)).toBe(1);
  });

  test.each([
    [301, 1.1], // (1+floor(301/300.01))×0.05 = 0.10
    [600, 1.1],
    [601, 1.15],
    [900, 1.15],
    [901, 1.2], // 达到上限档
    [2400, 1.2], // 超 901 截断
  ])('单门槛属性 %i → ×%.2f', (stat, expected) => {
    const c = { ...makeCourse(), courseSetStatus: ['stamina' as const] };
    // 干劲「普通」(×1.0)隔离档位测试;绿技能同样不掺入
    const r = makeRunner({ motivation: 'normal', stats: { speed: 1200, stamina: stat, power: 1200, guts: 1200, wisdom: 1200 } });
    expect(courseFixOf(c, r)).toBeCloseTo(expected, 10);
  });

  test('双门槛取平均:耐力901(1.2 档)+ 根性600(1.1 档)→ ×1.15', () => {
    const c = { ...makeCourse(), courseSetStatus: ['stamina' as const, 'guts' as const] };
    const r = makeRunner({ motivation: 'normal', stats: { speed: 1200, stamina: 901, power: 1200, guts: 600, wisdom: 1200 } });
    expect(courseFixOf(c, r)).toBeCloseTo(1.15, 10);
  });

  test('参照属性含绿技能与干劲:绝好调下 870×1.04=904.8 → 1.2 档', () => {
    const c = { ...makeCourse(), courseSetStatus: ['guts' as const] };
    const r = makeRunner({ stats: { speed: 1200, stamina: 1200, power: 1200, guts: 870, wisdom: 1200 }, greenBonus: { guts: 0 } });
    expect(courseFixOf(c, r)).toBeCloseTo(1.2, 10);
    const rNormal = makeRunner({ ...r, motivation: 'normal' as const }); // 870×1.0 → 1.15 档
    expect(courseFixOf(c, rNormal)).toBeCloseTo(1.15, 10);
  });

  test('手动数字覆盖优先于自动', () => {
    const c = { ...makeCourse(), courseSetStatus: [] };
    expect(courseFixOf(c, makeRunner({ courseFix: 1.2 }))).toBe(1.2);
    const c2 = { ...makeCourse(), courseSetStatus: ['stamina' as const] };
    expect(courseFixOf(c2, makeRunner({ courseFix: 1 }))).toBe(1);
  });

  test('有马纪念2500(门槛耐力/根性):高属性 auto=1.2,与手动 1.2 完赛一致', () => {
    expect(nakayama2500).toBeDefined();
    const stats = { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 };
    const auto = simulate(nakayama2500!, makeRunner({ stats }));
    const manual = simulate(nakayama2500!, makeRunner({ stats, courseFix: 1.2 }));
    expect(auto.finishTimeSec).toBeCloseTo(manual.finishTimeSec, 6);
  });
});

function makeCourse(): Course {
  return {
    id: 'test',
    name: '测试',
    venue: '测试',
    distance: 2400,
    surface: 'turf',
    distanceType: 'mid',
    corners: [],
    straights: [],
    slopes: [],
    phaseBounds: { midStart: 400, lateStart: 1600, finalStart: 2000 },
    baseSpeed: 19.6,
  };
}

// 有效速度含补正:同一跑者在空门槛(×1.0)与 1.2 档赛道上的 eff.speed 差 1.2 倍
describe('effectiveStatsOf 速度含补正', () => {
  test('自动 ×1.2 档 vs ×1.0', () => {
    const r = makeRunner({ motivation: 'normal', stats: { speed: 1200, stamina: 1200, power: 1200, guts: 1200, wisdom: 1200 } });
    const noFix = effectiveStatsOf(r, { ...makeCourse(), courseSetStatus: [] });
    const maxFix = effectiveStatsOf(r, { ...makeCourse(), courseSetStatus: ['speed' as const] });
    expect(noFix.speed).toBeCloseTo(1200, 6);
    expect(maxFix.speed).toBeCloseTo(1440, 6);
    // 补正只作用于速度
    expect(noFix.stamina).toBe(maxFix.stamina);
    expect(noFix.power).toBe(maxFix.power);
  });
});
