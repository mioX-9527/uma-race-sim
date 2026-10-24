import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { Course } from '../src/types';
import { makeRunner } from './fixtures';
import { simulate } from '../src/simulate';

/**
 * 校准双锚(2026-10-24 赛道补正自动计算后):
 * 1. 工具互拍锚:614tools(赛道补正手动「最大」=1.2)同输入实算 = 116.328s,容差 ±0.1s
 *    —— runner 显式 courseFix:1.2 复现其手动档位。
 * 2. 游戏实录锚:614tools 页脚公开参考 116.987s(游戏实测),容差 ±0.5s
 *    —— runner 缺省 courseFix:'auto',东京2400 courseSetStatus 为空 → 自动 ×1.0,
 *    实算 116.72s(偏差 −0.26s,较旧固定 1.2 的 −0.62s 显著收敛),证实东京2400 无赛道补正。
 * 输入:614tools 默认配置 速度2200/耐力1600/力量1700/根性1200/智力1800,先行、
 * 距离适性S、场地适性A、绝好调、无技能;赛道 c10606 东京草2400。
 */
const dataUrl = new URL('../../../data/courses.json', import.meta.url);
const courses = JSON.parse(readFileSync(fileURLToPath(dataUrl), 'utf8')) as Course[];
const tokyo = courses.find(c => c.id === 'c10606');
const TOOL_REF = 116.328;
const GAME_REF = 116.987;

const benchRunner = (courseFix: 1.2 | 'auto') =>
  makeRunner({
    stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
    distanceAptitude: 'S',
    surfaceAptitude: 'A',
    tactic: 'senko',
    courseFix,
  });

describe('校准基准:无技能东京草2400', () => {
  test(`courseFix=1.2(614tools 手动「最大」)对拍 = ${TOOL_REF}s ±0.1s`, () => {
    expect(tokyo).toBeDefined();
    const res = simulate(tokyo!, benchRunner(1.2));
    console.log(
      `互拍锚:完赛 ${res.finishTimeSec.toFixed(3)}s(614tools 实算 ${TOOL_REF}s,偏差 ${(res.finishTimeSec - TOOL_REF).toFixed(3)}s)`
    );
    expect(Math.abs(res.finishTimeSec - TOOL_REF)).toBeLessThan(0.1);
  });

  test(`courseFix=auto(缺省)对游戏实录 = ${GAME_REF}s ±0.5s`, () => {
    const res = simulate(tokyo!, benchRunner('auto'));
    console.log(
      `实录锚:完赛 ${res.finishTimeSec.toFixed(3)}s(游戏参考 ${GAME_REF}s,偏差 ${(res.finishTimeSec - GAME_REF).toFixed(3)}s;东京2400 无门槛属性 → 补正 ×1.0)`
    );
    expect(Math.abs(res.finishTimeSec - GAME_REF)).toBeLessThan(0.5);
  });
});
