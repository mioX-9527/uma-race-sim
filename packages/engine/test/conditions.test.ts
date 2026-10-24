import { describe, expect, test } from 'vitest';
import { activationRegions, inRegion, straightGaps } from '../src/conditions';
import { TOKYO_TURF_2400 as C } from './fixtures';

describe('发动条件 → 可发动区间(静态预解析)', () => {
  test('弯道最快 → 第一个弯道', () => {
    expect(activationRegions({ kind: 'cornerFastest' }, C)).toEqual([[160, 420]]);
  });

  test('最终弯道 → 最后一个弯道;最终第3弯道 → 倒数第三(4 弯道中为第 2 个)', () => {
    expect(activationRegions({ kind: 'finalCorner' }, C)).toEqual([[1760, 1980]]);
    expect(activationRegions({ kind: 'thirdCornerFromEnd' }, C)).toEqual([[620, 830]]);
  });

  test('终盘弯道 → 终盘内首个弯道,起点与终盘分界取大', () => {
    expect(activationRegions({ kind: 'lateCorner' }, C)).toEqual([[1440, 1470]]);
  });

  test('最终直线 → 最后弯道结束至终点', () => {
    expect(activationRegions({ kind: 'finalStraight' }, C)).toEqual([[1980, 2400]]);
  });

  test('直线最快 → 第一段直线(起点至首弯)', () => {
    expect(activationRegions({ kind: 'straightFastest' }, C)).toEqual([[0, 160]]);
  });

  test('直线最快·限最终盘 → 裁剪到最终盘边界内(不再提前到直线段起点)', () => {
    // 夹具最终直线段为 [1980, 2400],最终盘 [1920, 2400] → 交集为 [1980, 2400]
    expect(activationRegions({ kind: 'straightFastest', phaseFilter: 3 }, C)).toEqual([[1980, 2400]]);
  });

  test('下坡最快 → 首个下坡段', () => {
    expect(activationRegions({ kind: 'downhillFastest' }, C)).toEqual([[1250, 1500]]);
  });

  test('仅中盘 → [中盘分界, 终盘分界)', () => {
    expect(activationRegions({ kind: 'phase', phase: 1 }, C)).toEqual([[480, 1440]]);
  });

  test('行驶距离 100m·基准最终盘 → 点条件 2020m', () => {
    const r = activationRegions({ kind: 'distanceRun', meters: 100, base: 'finalStart' }, C);
    expect(r).toEqual([[2020, 2020]]);
    expect(inRegion(r[0]!, 2020)).toBe(true);
    expect(inRegion(r[0]!, 2019)).toBe(false);
  });

  test('剩余 200m → 点条件 2200m;地点 50% → 1200m', () => {
    expect(activationRegions({ kind: 'distanceLeft', meters: 200 }, C)).toEqual([[2200, 2200]]);
    expect(activationRegions({ kind: 'positionPct', pct: 50 }, C)).toEqual([[1200, 1200]]);
  });

  test('直线段划分:4 弯道 → 5 段直线', () => {
    expect(straightGaps(C)).toEqual([[0, 160], [420, 620], [830, 1230], [1470, 1760], [1980, 2400]]);
  });
});
