import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { Course } from '../src/types';
import { makeRunner } from './fixtures';
import { simulate } from '../src/simulate';

/**
 * 校准硬门:无技能东京草2400 = 116.987s ± 0.5s(614tools 页脚公开基准)。
 * 输入采用 614tools 默认配置:速度2200/耐力1600/力量1700/根性1200/智力1800,
 * 先行、距离适性S、场地适性A、绝好调、无技能;赛道取真实数据 c10606。
 */
const dataUrl = new URL('../../../data/courses.json', import.meta.url);
const courses = JSON.parse(readFileSync(fileURLToPath(dataUrl), 'utf8')) as Course[];
const tokyo = courses.find(c => c.id === 'c10606');
const REF = 116.987;

describe('校准基准:无技能东京草2400', () => {
  test('完赛时间 = 116.987s ± 0.5s', () => {
    expect(tokyo).toBeDefined();
    const runner = makeRunner({
      stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
      distanceAptitude: 'S',
      surfaceAptitude: 'A',
      tactic: 'senko',
    });
    const res = simulate(tokyo!, runner);
    console.log(`基准赛:完赛 ${res.finishTimeSec.toFixed(3)}s(参考 ${REF}s,偏差 ${(res.finishTimeSec - REF).toFixed(3)}s)`);
    expect(Math.abs(res.finishTimeSec - REF)).toBeLessThan(0.5);
  });
});
