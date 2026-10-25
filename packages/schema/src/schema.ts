import { z } from 'zod';

/**
 * 数据文件 schema:tools 生成的 courses/skills/version 必须通过校验才能进 data/。
 * 字段与 engine 的类型对齐(英文键,名称字段承载中文)。
 */

const nonneg = z.number().nonnegative();

const passiveStat = z.enum(['speed', 'stamina', 'power', 'guts', 'wisdom']);

export const cornerSchema = z.object({
  n: z.number().int().positive(),
  start: nonneg,
  end: z.number().positive(),
});

export const slopeSchema = z.object({
  start: nonneg,
  end: z.number().positive(),
  gradient: z.number(),
});

export const straightSchema = z.object({
  start: nonneg,
  end: z.number().positive(),
  frontType: z.number().int(),
});

export const courseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  venue: z.string().min(1),
  distance: z.number().int().positive(),
  surface: z.enum(['turf', 'dirt']),
  distanceType: z.enum(['short', 'mile', 'mid', 'long']).optional(),
  corners: z.array(cornerSchema),
  slopes: z.array(slopeSchema),
  straights: z.array(straightSchema).optional(),
  phaseBounds: z.object({ midStart: nonneg, lateStart: nonneg, finalStart: nonneg }),
  baseSpeed: z.number().positive().optional(),
  courseSetStatus: z.array(passiveStat).optional(),
  /** 赛场回转方向:1=顺时针(中山/京都/阪神/札幌/函馆/福岛/小仓/大井/隆尚),2=逆时针;直線赛道无此字段 */
  rotation: z.union([z.literal(1), z.literal(2)]).optional(),
  /** 海外赛场(is_abroad:隆尚/圣安妮塔公园/德尔马) */
  overseas: z.boolean().optional(),
});

const conditionBase = z.enum(['start', 'midStart', 'lateStart', 'finalStart']);
const phaseId = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const phasePart = z.enum(['firstHalf', 'laterHalf', 'firstQuarter']);
/** 区段类条件与 distance_rate / remain_distance 联用时的窗口裁剪(触发代码语法) */
const regionExtras = {
  withinPct: z.tuple([z.number(), z.number()]).optional(),
  withinLeftM: z.tuple([z.number(), z.number()]).optional(),
  spurt: z.boolean().optional(),
};

const statMap = z.object({
  speed: z.number().optional(),
  stamina: z.number().optional(),
  power: z.number().optional(),
  guts: z.number().optional(),
  wisdom: z.number().optional(),
});

/** 单条限制子句(字段间为「与」) */
const clauseSchema = z.object({
  tactics: z.array(z.enum(['nige', 'senko', 'sashi', 'oikomi'])).optional(),
  distanceTypes: z.array(z.enum(['short', 'mile', 'mid', 'long'])).optional(),
  surfaces: z.array(z.enum(['turf', 'dirt'])).optional(),
  venues: z.array(z.string()).optional(),
  grounds: z.array(z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])).optional(),
  distances: z.array(z.number().int().positive()).optional(),
  distanceMin: z.number().int().positive().optional(),
  distanceMax: z.number().int().positive().optional(),
  /** 标准距离(触发代码 is_basis_distance:1=赛程全长为 400 米整数倍,0=非倍数;非距离档) */
  basisDistance: z.boolean().optional(),
  /** 赛场回转方向(触发代码 rotation==N:1=顺时针,2=逆时针) */
  rotations: z.array(z.union([z.literal(1), z.literal(2)])).optional(),
  /** 天气(触发代码 weather==N:1晴/2阴/3雨/4雪) */
  weathers: z.array(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])).optional(),
  /** 季节(触发代码 season==N:1春/2夏/3秋/4冬/5樱花) */
  seasons: z.array(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])).optional(),
  /** 干劲(触发代码 motivation) */
  motivations: z.array(z.enum(['best', 'good', 'normal', 'bad', 'worst'])).optional(),
  /** 海外赛场(触发代码 is_abroad) */
  abroad: z.boolean().optional(),
  /** 面板属性下限(含)/上限(不含),触发代码 base_* */
  statsAtLeast: statMap.optional(),
  statsBelow: statMap.optional(),
  rawText: z.string().optional(),
});

/** 技能装配限制:单子句用扁平字段,多分支用 anyOf(任一子句满足即生效) */
const restrictionSchema = clauseSchema.extend({
  anyOf: z.array(clauseSchema).min(1).optional(),
});

export const skillConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('raceStart') }),
  z.object({ kind: z.literal('phase'), phase: phaseId, part: phasePart.optional() }).extend(regionExtras),
  z.object({ kind: z.literal('phaseAfter'), phase: phaseId }),
  z.object({ kind: z.literal('cornerN'), n: z.number().int().positive() }).extend(regionExtras),
  z.object({ kind: z.literal('cornerFastest'), phaseFilter: phaseId.optional(), spurt: z.boolean().optional() }).extend(regionExtras),
  z.object({ kind: z.literal('finalCorner'), part: z.literal('laterHalf').optional() }).extend(regionExtras),
  z.object({ kind: z.literal('finalCornerOnward') }),
  z.object({ kind: z.literal('thirdCornerFromEnd') }),
  z.object({ kind: z.literal('lateCorner') }),
  z.object({ kind: z.literal('midCorner') }),
  z.object({ kind: z.literal('finalStraight') }).extend(regionExtras),
  z.object({ kind: z.literal('straightFastest'), phaseFilter: phaseId.optional(), spurt: z.boolean().optional() }).extend(regionExtras),
  z.object({ kind: z.literal('backStraight') }).extend(regionExtras),
  z.object({ kind: z.literal('lateStraight') }),
  z.object({ kind: z.literal('uphillFastest'), phaseFilter: phaseId.optional(), spurt: z.boolean().optional() }).extend(regionExtras),
  z.object({ kind: z.literal('downhillFastest'), phaseFilter: phaseId.optional(), spurt: z.boolean().optional() }).extend(regionExtras),
  z.object({ kind: z.literal('lastSpurt') }),
  z.object({ kind: z.literal('distanceRun'), meters: z.number().positive(), base: conditionBase }),
  z.object({ kind: z.literal('distanceLeft'), fromMeters: nonneg, toMeters: z.number().positive() }).extend(regionExtras),
  z.object({ kind: z.literal('distanceRate'), fromPct: nonneg, toPct: z.number().positive() }).extend(regionExtras),
  z.object({ kind: z.literal('elapsedSec'), seconds: z.number().positive(), base: conditionBase }),
  z.object({ kind: z.literal('positionPct'), pct: z.number().min(0).max(100) }),
]);

export const skillEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('targetSpeed'), value: z.number() }),
  z.object({ type: z.literal('acceleration'), value: z.number() }),
  z.object({ type: z.literal('currentSpeed'), value: z.number() }),
  z.object({ type: z.literal('lastSpurtExtension'), value: z.number() }),
  z.object({ type: z.literal('heal'), value: z.number() }),
  z.object({ type: z.literal('passive'), stat: passiveStat, value: z.number() }),
  z.object({ type: z.literal('unsupported'), label: z.string(), value: z.number().nullable() }),
]);

export const skillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameJa: z.string().optional(),
  nameTrad: z.string().optional(),
  cnReleased: z.boolean().optional(),
  rarity: z.enum(['normal', 'rareEvolved', 'evolved', 'unique1', 'unique2', 'unique3', 'unique4', 'unique5', 'unique6', 'uniqueHeir']),
  precision: z.enum(['precise', 'approx', 'unsupported']),
  effects: z.array(skillEffectSchema).min(1),
  durationSec: z.number().positive().nullable(),
  /** 冷却时间(秒);<600 时引擎允许同场再次发动,null/缺省=一次性 */
  cooldownSec: z.number().positive().nullable().optional(),
  condition: skillConditionSchema,
  restriction: restrictionSchema.optional(),
  /** 条件限制原始描述(装配时已过滤,数据层保留原始描述) */
  restrictionText: z.string().optional(),
  wisdomScaled: z.boolean(),
  /** 触发代码含 *_random → 发动位置在满足区段内随机,消融按位置采样求期望 */
  randomPosition: z.boolean().optional(),
  /** 数据来源与抓取日期,供追溯 */
  source: z.string().optional(),
  fetchedAt: z.string().optional(),
});

export const versionSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.string().min(1),
  sources: z.array(z.string()),
  counts: z.object({ courses: z.number().int().nonnegative(), skills: z.number().int().nonnegative() }),
  note: z.string().optional(),
});

export type CourseJson = z.infer<typeof courseSchema>;
export type SkillJson = z.infer<typeof skillSchema>;

export function parseCourses(json: unknown): CourseJson[] {
  return z.array(courseSchema).parse(json);
}

export function parseSkills(json: unknown): SkillJson[] {
  return z.array(skillSchema).parse(json);
}
