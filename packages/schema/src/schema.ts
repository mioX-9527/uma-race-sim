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

export const courseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  venue: z.string().min(1),
  distance: z.number().int().positive(),
  surface: z.enum(['turf', 'dirt']),
  distanceType: z.enum(['short', 'mile', 'mid', 'long']).optional(),
  corners: z.array(cornerSchema),
  slopes: z.array(slopeSchema),
  phaseBounds: z.object({ midStart: nonneg, lateStart: nonneg, finalStart: nonneg }),
  baseSpeed: z.number().positive().optional(),
  courseSetStatus: z.array(passiveStat).optional(),
});

const conditionBase = z.enum(['start', 'midStart', 'lateStart', 'finalStart']);
const phaseId = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const skillConditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('raceStart') }),
  z.object({ kind: z.literal('phase'), phase: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]) }),
  z.object({ kind: z.literal('phaseAfter'), phase: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]) }),
  z.object({ kind: z.literal('cornerN'), n: z.number().int().positive() }),
  z.object({ kind: z.literal('cornerFastest'), phaseFilter: phaseId.optional() }),
  z.object({ kind: z.literal('finalCorner') }),
  z.object({ kind: z.literal('thirdCornerFromEnd') }),
  z.object({ kind: z.literal('lateCorner') }),
  z.object({ kind: z.literal('midCorner') }),
  z.object({ kind: z.literal('finalStraight') }),
  z.object({ kind: z.literal('straightFastest'), phaseFilter: phaseId.optional() }),
  z.object({ kind: z.literal('lateStraight') }),
  z.object({ kind: z.literal('uphillFastest'), phaseFilter: phaseId.optional() }),
  z.object({ kind: z.literal('downhillFastest'), phaseFilter: phaseId.optional() }),
  z.object({ kind: z.literal('distanceRun'), meters: z.number().positive(), base: conditionBase }),
  z.object({ kind: z.literal('distanceLeft'), meters: z.number().positive() }),
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
  rarity: z.enum(['normal', 'rareEvolved', 'unique1', 'unique2', 'unique3', 'unique4', 'unique5', 'unique6']),
  precision: z.enum(['precise', 'approx', 'unsupported']),
  effects: z.array(skillEffectSchema).min(1),
  durationSec: z.number().positive().nullable(),
  condition: skillConditionSchema,
  /** 条件限制(距离/跑法)装配时已过滤,数据层保留原始描述 */
  restriction: z.string().optional(),
  wisdomScaled: z.boolean(),
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
