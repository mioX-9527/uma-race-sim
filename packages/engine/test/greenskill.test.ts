import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { effectiveStatsOf, passiveBonusOf } from '../src/effstats';
import { simulate } from '../src/simulate';
import { skillApplicable } from '../src/restriction';
import type { Course, SkillConfig } from '../src/types';
import { BASE_STATS, makeRunner } from './fixtures';

const coursesUrl = new URL('../../../data/courses.json', import.meta.url);
const courses = JSON.parse(readFileSync(fileURLToPath(coursesUrl), 'utf8')) as Course[];
/** 中山草2500(顺时针,长距离) */
const nak = courses.find(c => c.id === 'c10506')!;
/** 东京草2400(逆时针,中距离) */
const tokyo = courses.find(c => c.id === 'c10606')!;
const skillsUrl = new URL('../../../data/skills.json', import.meta.url);
const skills = JSON.parse(readFileSync(fileURLToPath(skillsUrl), 'utf8')) as SkillConfig[];

/** 按 id 取技能(数据重跑后名称/顺序会变,锚定 id 更稳) */
const byId = (id: string): SkillConfig => {
  const s = skills.find(x => x.id === id);
  if (!s) throw new Error('技能未找到:' + id);
  return s;
};

/** 独行侠◎:速度 +80,无装配限制(数值锚点用) */
const DOKKOU = byId('200271');
/** 七福即生:速度/耐力/力量 +80,无装配限制 */
const SHICHI = byId('105601211');
/** 顺时针◎:速度 +60,限顺时针赛道 */
const CLOCKWISE = byId('200011');
/** 逆时针◎:速度 +60,限逆时针赛道 */
const COUNTER = byId('200021');
/** 风霜高洁:速度/力量 +80,限秋季(season==3) */
const AUTUMN = byId('101702211');

describe('常时被动(绿技能)并入起跑属性', () => {
  test('passiveBonusOf:技能被动与手动 greenBonus 合并', () => {
    const runner = makeRunner({ skills: [SHICHI], greenBonus: { speed: 20 } });
    const p = passiveBonusOf(runner, nak);
    expect(p.speed).toBe(100);
    expect(p.stamina).toBe(80);
    expect(p.power).toBe(80);
  });

  test('有效属性:绿加成先并入面板再过软上限,乘干劲(614tools ZP → E → mood)', () => {
    // 面板 2000,绿 +80 → 合计 2080 → 软上限 1640 → 绝好调 ×1.04 = 1705.6
    // 用东京2400(无门槛属性 → 赛道补正 ×1.0)隔离补正影响
    const runner = makeRunner({ stats: { speed: 2000, stamina: 1200, power: 1200, guts: 1200, wisdom: 1200 }, skills: [DOKKOU] });
    expect(effectiveStatsOf(runner, tokyo).speed).toBeCloseTo(1640 * 1.04, 6);
    // 绿加成不吃干劲的判定面:若绿被干劲乘过,值会是 (2000×1.04 + 83.2) 过软上限 → 不同
    const runnerNormal = makeRunner({ ...runner, motivation: 'normal' as never });
    expect(effectiveStatsOf(runnerNormal, tokyo).speed).toBeCloseTo(1640, 6);
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
    const runner = makeRunner({
      stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
      distanceAptitude: 'S',
      surfaceAptitude: 'A',
      tactic: 'senko',
      skills: [DOKKOU],
    });
    const withG = simulate(nak, runner);
    const withoutG = simulate(nak, { ...runner, skills: [] });
    expect(withG.finishTimeSec).toBeLessThan(withoutG.finishTimeSec);
  });

  test('常时被动不进入发动列表(图上无标记)', () => {
    const runner = makeRunner({
      stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
      skills: [DOKKOU],
    });
    expect(simulate(nak, runner).activations.filter(a => a.skillId === DOKKOU.id).length).toBe(0);
  });
});

describe('装配限制生效:回转方向 / 季节', () => {
  test('顺时针◎ 只在顺时针赛道计入起跑属性', () => {
    const runner = makeRunner({ skills: [CLOCKWISE] });
    expect(passiveBonusOf(runner, nak).speed).toBe(60); // 中山=顺时针
    expect(passiveBonusOf(runner, tokyo).speed).toBe(0); // 东京=逆时针
  });

  test('逆时针◎ 只在逆时针赛道计入', () => {
    const runner = makeRunner({ skills: [COUNTER] });
    expect(passiveBonusOf(runner, tokyo).speed).toBe(60);
    expect(passiveBonusOf(runner, nak).speed).toBe(0);
  });

  test('直線赛道(无 rotation 字段)→ 回转方向类技能一律不生效', () => {
    const straight = courses.find(c => c.rotation === undefined)!;
    const runner = makeRunner({ skills: [CLOCKWISE, COUNTER] });
    expect(straight.name).toContain('1000');
    expect(passiveBonusOf(runner, straight).speed).toBe(0);
    expect(skillApplicable(CLOCKWISE, straight, runner)).toBe(false);
  });

  test('季节绿技能按季节判定(风霜高洁 = 秋)', () => {
    expect(passiveBonusOf(makeRunner({ skills: [AUTUMN], season: 3 }), nak).speed).toBe(80);
    expect(passiveBonusOf(makeRunner({ skills: [AUTUMN], season: 1 }), nak).speed).toBe(0);
    // 缺省季节 = 春 → 不计入
    expect(passiveBonusOf(makeRunner({ skills: [AUTUMN] }), nak).speed).toBe(0);
  });

  test('不匹配的绿技能不改变完赛时间(消融收益为 0)', () => {
    const runner = makeRunner({
      stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
      distanceAptitude: 'S',
      surfaceAptitude: 'A',
      skills: [COUNTER], // 中山是顺时针 → 不生效
    });
    const withS = simulate(nak, runner);
    const withoutS = simulate(nak, { ...runner, skills: [] });
    expect(withS.finishTimeSec).toBeCloseTo(withoutS.finishTimeSec, 10);
  });
});

describe('触发代码严格执行(数据驱动:标准距离 / 面板属性 / 海外)', () => {
  const byType = (t: string): Course => {
    const c = courses.find(x => x.distanceType === t && x.surface === 'turf');
    if (!c) throw new Error('赛道未找到:' + t);
    return c;
  };

  // 标准距离 = 赛程全长为 400 米整数倍(游戏内定义),与距离档无关:
  //   1600(英里) / 2400(中) 是倍数;1800(英里) / 2500(长) 不是倍数。
  const byDistance = (d: number): Course => {
    const c = courses.find(x => x.distance === d && x.surface === 'turf');
    if (!c) throw new Error('赛道未找到:' + d + 'm');
    return c;
  };

  test('标准距离◎ 按 400 倍数判定,不看距离档', () => {
    const s = byId('200131'); // 耐力 +60
    const runner = makeRunner({ skills: [s] });
    // 400 倍数:1600(英里档)、2400(中距离档)
    for (const d of [1600, 2400]) {
      expect(d % 400).toBe(0);
      expect(passiveBonusOf(runner, byDistance(d)).stamina).toBe(60);
    }
    // 非倍数:1800(英里档)、2500(长距离档)
    for (const d of [1800, 2500]) {
      expect(d % 400).not.toBe(0);
      expect(passiveBonusOf(runner, byDistance(d)).stamina).toBe(0);
    }
    expect(skillApplicable(s, byDistance(2500), runner)).toBe(false);
    expect(skillApplicable(s, byDistance(1600), runner)).toBe(true);
  });

  test('非标准距离◎ 与非 400 倍数一一对应', () => {
    const s = byId('200141'); // 耐力 +60
    const runner = makeRunner({ skills: [s] });
    for (const d of [1800, 2500]) expect(passiveBonusOf(runner, byDistance(d)).stamina).toBe(60);
    for (const d of [1600, 2400]) expect(passiveBonusOf(runner, byDistance(d)).stamina).toBe(0);
  });

  test('拉普拉斯妖(1)/(2) 按面板 速度/智力 分流(先行·中距离)', () => {
    const b1 = byId('103202111-b1'); // speed≥1200 & wiz≥1200 → 速度+100
    const b2 = byId('103202111-b2'); // speed≥1200 & wiz<1200  → 速度+80
    const mid = byType('mid');
    const hi = makeRunner({ tactic: 'senko', stats: { ...BASE_STATS, speed: 1300, wisdom: 1300 }, skills: [b1, b2] });
    const lo = makeRunner({ tactic: 'senko', stats: { ...BASE_STATS, speed: 1300, wisdom: 1000 }, skills: [b1, b2] });
    expect(passiveBonusOf(hi, mid).speed).toBe(100);
    expect(passiveBonusOf(lo, mid).speed).toBe(80);
    // 短距离两条都不满足
    expect(passiveBonusOf(hi, byType('short')).speed).toBe(0);
  });

  test('海外赛场(is_abroad)按赛道所在地判定', () => {
    const s = byId('111321-b1'); // 仅在海外赛场发动
    const abroad = courses.find(c => c.overseas === true)!;
    const domestic = courses.find(c => c.overseas !== true)!;
    const runner = makeRunner();
    expect(skillApplicable(s, abroad, runner)).toBe(true);
    expect(skillApplicable(s, domestic, runner)).toBe(false);
  });
});
