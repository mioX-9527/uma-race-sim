import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { activationRegions, realStraights, straightGaps } from '../src/conditions';
import type { Course } from '../src/types';

/**
 * 真实赛道的直线判定(解包 straights 列表)。
 * 有馬記念(中山2500,c10506):起跑后最初的 100m 为过渡区(既非直线也非弯道),
 * straights 列表 = 496-875 / 1375-1700 / 2190-2500。
 */
const file = new URL('../../../data/courses.json', import.meta.url);
const courses: Course[] | null = existsSync(file)
  ? (JSON.parse(readFileSync(file, 'utf8')) as Course[])
  : null;
const nakayama = courses?.find(c => c.id === 'c10506') ?? null;

describe('真实直线段(解包 straights)', () => {
  test.skipIf(nakayama === null)('有馬記念中山2500:直线 = 3 段,起跑 0-100m 不在其中', () => {
    const rs = realStraights(nakayama!);
    expect(rs).toEqual([[496, 875], [1375, 1700], [2190, 2500]]);
    // 弯道间隙法(旧模型)会把 0-100m 误判为直线
    expect(straightGaps(nakayama!)).toEqual([[0, 100], [496, 875], [1375, 1700], [2190, 2500]]);
  });

  test.skipIf(nakayama === null)('直线类技能在中山2500不于 0m 发动(首个直线起点 496m)', () => {
    const regions = activationRegions({ kind: 'straightFastest' }, nakayama!);
    expect(regions).toEqual([[496, 875], [1375, 1700], [2190, 2500]]);
    expect(Math.min(...regions.map(r => r[0]))).toBe(496);
  });

  test.skipIf(nakayama === null)('最终直线 = straights 末段 [2190, 2500]', () => {
    expect(activationRegions({ kind: 'finalStraight' }, nakayama!)).toEqual([[2190, 2500]]);
  });

  test.skipIf(nakayama === null)('末脚内直线(迫る影型)→ 终盘分界后的直线段,不含过渡区', () => {
    // 终盘分界 1667:直线 [1375,1700] 截为 [1667,1700],[2190,2500] 保留
    const regions = activationRegions({ kind: 'straightFastest', spurt: true }, nakayama!);
    expect(regions).toEqual([[1667, 1700], [2190, 2500]]);
  });

  test('无 straights 数据时回退弯道间隙(兼容占位赛道)', () => {
    const plain: Course = {
      id: 'plain',
      name: 'plain',
      venue: 'x',
      distance: 1000,
      surface: 'turf',
      corners: [{ n: 1, start: 300, end: 600 }],
      slopes: [],
      phaseBounds: { midStart: 167, lateStart: 667, finalStart: 833 },
    };
    expect(realStraights(plain)).toEqual([[0, 300], [600, 1000]]);
    expect(activationRegions({ kind: 'straightFastest' }, plain)).toEqual([[0, 300], [600, 1000]]);
  });
});
