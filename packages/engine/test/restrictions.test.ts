import { describe, expect, test } from 'vitest';
import { simulate } from '../src/simulate';
import { passiveBonusOf } from '../src/effstats';
import { BASE_STATS, freshRunner, makeRunner, speedSkill, TOKYO_TURF_2400 as C } from './fixtures';

/** 中盘发动的通用测试技能(便于观察限制是否拦截) */
const midSkill = speedSkill('r-test', 0.5, 10, { condition: { kind: 'phase', phase: 1 } as never });

describe('装配型限制(脚质/场地/距离档)判定', () => {
  test('脚质不符 → 整场不发动;相符 → 正常发动', () => {
    const nigeOnly = { ...midSkill, restriction: { tactics: ['nige' as const] } };
    const senkoRunner = simulate(C, freshRunner([nigeOnly]));
    expect(senkoRunner.activations).toHaveLength(0);
    const nigeRunner = simulate(C, makeRunner({ tactic: 'nige', skills: [nigeOnly] }));
    expect(nigeRunner.activations).toHaveLength(1);
  });

  test('距离档不符(中距离技在长距离档赛道)→ 不发动', () => {
    const midOnly = { ...midSkill, restriction: { distanceTypes: ['mid' as const] } };
    const tokyo2400 = simulate(C, freshRunner([midOnly])); // 2400m = 中距离
    expect(tokyo2400.activations).toHaveLength(1);
    const longCourse = { ...C, distance: 3000, distanceType: 'long' as const };
    const kyoto3000 = simulate(longCourse, freshRunner([midOnly]));
    expect(kyoto3000.activations).toHaveLength(0);
  });

  test('场地不符(泥地技在草地)→ 不发动', () => {
    const dirtOnly = { ...midSkill, restriction: { surfaces: ['dirt' as const] } };
    const res = simulate(C, freshRunner([dirtOnly]));
    expect(res.activations).toHaveLength(0);
  });

  test('精确距离限制:2400m 技在 2400 赛道发动、2300 不发动', () => {
    const exact = { ...midSkill, restriction: { distances: [2400] } };
    expect(simulate(C, freshRunner([exact])).activations).toHaveLength(1);
    expect(simulate({ ...C, distance: 2300 }, freshRunner([exact])).activations).toHaveLength(0);
  });

  test('距离范围限制(触发代码 course_distance>=/<=):≥2400 与 ≤2500 各自拦截', () => {
    const min2400 = { ...midSkill, restriction: { distanceMin: 2400 } };
    expect(simulate(C, freshRunner([min2400])).activations).toHaveLength(1);
    expect(simulate({ ...C, distance: 2000, distanceType: 'mile' as const }, freshRunner([min2400])).activations).toHaveLength(0);
    const max2200 = { ...midSkill, restriction: { distanceMax: 2200 } };
    expect(simulate(C, freshRunner([max2200])).activations).toHaveLength(0);
  });
});

describe('环境条件限制(场地状态 / 天气 / 季节)', () => {
  /** 常时绿技能(速度 +60),用于观察装配限制是否拦截 */
  const greenSpeed = (restriction: Record<string, unknown>) =>
    speedSkill('g-env', 0, 0, {
      effects: [{ type: 'passive', stat: 'speed', value: 60 }],
      durationSec: null,
      condition: { kind: 'raceStart' },
      restriction,
    }) as never;

  test('场地状态:良场地◎ 只在良场生效', () => {
    const s = greenSpeed({ grounds: [0] });
    const atGood = passiveBonusOf(freshRunner([s], {}, { groundCondition: 0 }), C).speed;
    const atHeavy = passiveBonusOf(freshRunner([s], {}, { groundCondition: 3 }), C).speed;
    expect(atGood).toBe(60);
    expect(atHeavy).toBe(0);
  });

  test('天气:雨天◎ 只在雨天生效,缺省(晴)不生效', () => {
    const s = greenSpeed({ weathers: [3] });
    expect(passiveBonusOf(freshRunner([s]), C).speed).toBe(0);
    expect(passiveBonusOf(freshRunner([s], {}, { weather: 3 }), C).speed).toBe(60);
  });

  test('季节:秋季技能按季节判定', () => {
    const s = greenSpeed({ seasons: [3] });
    expect(passiveBonusOf(freshRunner([s], {}, { season: 1 }), C).speed).toBe(0);
    expect(passiveBonusOf(freshRunner([s], {}, { season: 3 }), C).speed).toBe(60);
    // 春/樱花双季技能
    const spring = greenSpeed({ seasons: [1, 5] });
    expect(passiveBonusOf(freshRunner([spring], {}, { season: 5 }), C).speed).toBe(60);
  });

  test('普通技能的限制不满足时整场不发动', () => {
    const onlyAutumn = { ...midSkill, restriction: { seasons: [3] as const } };
    expect(simulate(C, freshRunner([onlyAutumn], {}, { season: 1 })).activations).toHaveLength(0);
    expect(simulate(C, freshRunner([onlyAutumn], {}, { season: 3 })).activations).toHaveLength(1);
  });
});

describe('场地状态进体力消耗(不改速度)', () => {
  test('草地:良=稍重(1.0)、重与不良(1.02)更快耗体力', () => {
    const runner = makeRunner({ stats: { ...BASE_STATS, stamina: 900 } });
    const minHp = (groundCondition: 0 | 1 | 2 | 3): number => {
      const probe = simulate(C, { ...runner, groundCondition }, { ignoreExhaustion: true });
      let m = Infinity;
      for (let i = 0; i < probe.hp.length; i++) m = Math.min(m, probe.hp[i]!);
      return probe.maxHp - m; // 全程消耗
    };
    const good = minHp(0);
    expect(minHp(1)).toBeCloseTo(good, 6);
    expect(minHp(2)).toBeGreaterThan(good);
    expect(minHp(3)).toBeCloseTo(minHp(2), 6);
  });
});

describe('限制子句语义(anyOf / 面板属性 / 干劲 / 海外)', () => {
  test('anyOf:任一子句满足即生效(触发代码 OR 分支不压成并集)', () => {
    const either = { ...midSkill, restriction: { anyOf: [{ tactics: ['nige' as const] }, { distanceTypes: ['mid' as const] }] } };
    // 先行不满足第一条,但中距离满足第二条 → 发动
    expect(simulate(C, makeRunner({ tactic: 'senko', skills: [either] })).activations).toHaveLength(1);
    const neither = { ...midSkill, restriction: { anyOf: [{ tactics: ['nige' as const] }, { distanceTypes: ['short' as const] }] } };
    expect(simulate(C, makeRunner({ tactic: 'senko', skills: [neither] })).activations).toHaveLength(0);
    // 逃马满足第一支
    expect(simulate(C, makeRunner({ tactic: 'nige', skills: [neither] })).activations).toHaveLength(1);
  });

  test('面板属性条件:base_speed>=1200 / base_wiz<1200(取面板,不含绿与干劲)', () => {
    const hiWis = { ...midSkill, restriction: { statsAtLeast: { speed: 1200, wisdom: 1200 } } };
    const loWis = { ...midSkill, restriction: { statsAtLeast: { speed: 1200 }, statsBelow: { wisdom: 1200 } } };
    const high = makeRunner({ stats: { ...BASE_STATS, speed: 1300, wisdom: 1300 } });
    const low = makeRunner({ stats: { ...BASE_STATS, speed: 1300, wisdom: 1000 } });
    expect(simulate(C, { ...high, skills: [hiWis] }).activations).toHaveLength(1);
    expect(simulate(C, { ...low, skills: [hiWis] }).activations).toHaveLength(0);
    expect(simulate(C, { ...low, skills: [loWis] }).activations).toHaveLength(1);
    expect(simulate(C, { ...high, skills: [loWis] }).activations).toHaveLength(0);
  });

  test('干劲条件:motivation==5 / <=4', () => {
    const bestOnly = { ...midSkill, restriction: { motivations: ['best' as const] } };
    const notBest = { ...midSkill, restriction: { motivations: ['worst', 'bad', 'normal', 'good'] as const } };
    expect(simulate(C, makeRunner({ motivation: 'best', skills: [bestOnly] })).activations).toHaveLength(1);
    expect(simulate(C, makeRunner({ motivation: 'good', skills: [bestOnly] })).activations).toHaveLength(0);
    expect(simulate(C, makeRunner({ motivation: 'good', skills: [notBest] })).activations).toHaveLength(1);
    expect(simulate(C, makeRunner({ motivation: 'best', skills: [notBest] })).activations).toHaveLength(0);
  });

  test('海外赛场条件(is_abroad)', () => {
    const abroadOnly = { ...midSkill, restriction: { abroad: true } };
    expect(simulate(C, makeRunner({ skills: [abroadOnly] })).activations).toHaveLength(0);
    expect(simulate({ ...C, overseas: true }, makeRunner({ skills: [abroadOnly] })).activations).toHaveLength(1);
  });
});
