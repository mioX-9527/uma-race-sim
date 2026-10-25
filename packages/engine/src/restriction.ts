import type { Course, RunnerConfig, Season, SkillConfig, SkillRestriction, Weather } from './types';

/**
 * 装配型限制(脚质/距离档/场地/赛场/场地状态/精确距离/距离范围/回转方向/天气/季节)
 * 是否满足;不满足则整场不发动(绿技能则不计入起跑属性)。
 *
 * 环境类取值缺省口径(与 UI 默认一致):场地状态 0=良、天气 1=晴、季节 1=春;
 * 赛道无 rotation 字段(如新潟草1000m 直線)→ 回转方向类技能不匹配。
 */
export function restrictionSatisfied(r: SkillRestriction, runner: RunnerConfig, course: Course): boolean {
  if (r.tactics !== undefined && !r.tactics.includes(runner.tactic)) return false;
  if (r.distanceTypes !== undefined && (course.distanceType === undefined || !r.distanceTypes.includes(course.distanceType))) return false;
  if (r.surfaces !== undefined && !r.surfaces.includes(course.surface)) return false;
  if (r.venues !== undefined && !r.venues.includes(course.venue)) return false;
  if (r.grounds !== undefined && !r.grounds.includes(runner.groundCondition ?? 0)) return false;
  if (r.distances !== undefined && !r.distances.includes(course.distance)) return false;
  if (r.distanceMin !== undefined && course.distance < r.distanceMin) return false;
  if (r.distanceMax !== undefined && course.distance > r.distanceMax) return false;
  if (r.rotations !== undefined && (course.rotation === undefined || !r.rotations.includes(course.rotation))) return false;
  if (r.weathers !== undefined && !r.weathers.includes(runner.weather ?? DEFAULT_WEATHER)) return false;
  if (r.seasons !== undefined && !r.seasons.includes(runner.season ?? DEFAULT_SEASON)) return false;
  return true;
}

/** 天气缺省 = 晴(1) */
export const DEFAULT_WEATHER: Weather = 1;
/** 季节缺省 = 春(1) */
export const DEFAULT_SEASON: Season = 1;

/** 技能在当前赛道/环境配置下是否生效(无装配限制视为生效) */
export function skillApplicable(skill: SkillConfig, course: Course, runner: RunnerConfig): boolean {
  return skill.restriction === undefined || restrictionSatisfied(skill.restriction, runner, course);
}
