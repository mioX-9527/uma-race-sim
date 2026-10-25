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

const restrictionSchema = z.object({
  tactics: z.array(z.enum(['nige', 'senko', 'sashi', 'oikomi'])).optional(),
  distanceTypes: z.array(z.enum(['short', 'mile', 'mid', 'long'])).optional(),
  surfaces: z.array(z.enum(['turf', 'dirt'])).optional(),
  venues: z.array(z.string()).optional(),
  grounds: z.array(z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])).optional(),
  distances: z.array(z.number().int().positive()).optional(),
  distanceMin: z.number().int().positive().optional(),
  distanceMax: z.number().int().positive().optional(),
  rawText: z.string().optional(),
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
