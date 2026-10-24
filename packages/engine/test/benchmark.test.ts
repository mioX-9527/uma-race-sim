import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { Course } from '../src/types';
import { makeRunner } from './fixtures';
import { simulate } from '../src/simulate';

/**
 * 校准双锚(2026-10-24 交叉对拍后):
 * 1. 工具互拍锚:614tools 技能模拟器同输入实算 = 116.328s(其 worker 源码逐式核对一致),容差 ±0.1s
 * 2. 游戏实录锚:614tools 页脚公开参考 116.987s(游戏实测),容差 ±0.7s
 * 输入:614tools 默认配置 速度2200/耐力1600/力量1700/根性1200/智力1800,先行、
 * 距离适性S、场地适性A、绝好调、赛道补正最大、无技能;赛道 c10606 东京草2400。
 */
const dataUrl = new URL('../../../data/courses.json', import.meta.url);
const courses = JSON.parse(readFileSync(fileURLToPath(dataUrl), 'utf8')) as Course[];
const tokyo = courses.find(c => c.id === 'c10606');
const TOOL_REF = 116.328;
const GAME_REF = 116.987;

describe('校准基准:无技能东京草2400', () => {
  test(`与 614tools 实算对拍 = ${TOOL_REF}s ±0.1s`, () => {
    expect(tokyo).toBeDefined();
    const runner = makeRunner({
      stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
      distanceAptitude: 'S',
      surfaceAptitude: 'A',
      tactic: 'senko',
    });
    const res = simulate(tokyo!, runner);
    console.log(
      `基准赛:完赛 ${res.finishTimeSec.toFixed(3)}s(614tools 实算 ${TOOL_REF}s,偏差 ${(res.finishTimeSec - TOOL_REF).toFixed(3)}s;游戏参考 ${GAME_REF}s)`
    );
    expect(Math.abs(res.finishTimeSec - TOOL_REF)).toBeLessThan(0.1);
  });

  test(`游戏实录参考 = ${GAME_REF}s ±0.7s`, () => {
    const runner = makeRunner({
      stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
      distanceAptitude: 'S',
      surfaceAptitude: 'A',
      tactic: 'senko',
    });
    const res = simulate(tokyo!, runner);
    expect(Math.abs(res.finishTimeSec - GAME_REF)).toBeLessThan(0.7);
  });
});
