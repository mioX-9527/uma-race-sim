import type { Course, Motivation, RunnerConfig, SkillConfig, Stats, Tactic, Aptitude } from '@uma-race-sim/engine';
import coursesJson from '../../../../data/courses.json';
import skillsJson from '../../../../data/skills.json';

export interface SkillEntry extends SkillConfig {
  readonly nameJa?: string;
  readonly restriction?: string;
}

export const COURSES = coursesJson as unknown as Course[];
export const SKILLS = skillsJson as unknown as SkillEntry[];

export interface UiConfig {
  readonly stats: Stats;
  readonly tactic: Tactic;
  readonly distanceAptitude: Aptitude;
  readonly surfaceAptitude: Aptitude;
  readonly motivation: Motivation;
  readonly courseId: string;
  readonly skillIds: readonly string[];
}

export const DEFAULT_CONFIG: UiConfig = {
  stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
  tactic: 'senko',
  distanceAptitude: 'S',
  surfaceAptitude: 'A',
  motivation: 'best',
  courseId: 'c10606',
  skillIds: [],
};

export function findCourse(id: string): Course {
  return COURSES.find(c => c.id === id) ?? COURSES[0]!;
}

export function buildRunner(cfg: UiConfig): RunnerConfig {
  const skills = cfg.skillIds
    .map(id => SKILLS.find(s => s.id === id))
    .filter((s): s is SkillEntry => s !== undefined);
  return {
    stats: cfg.stats,
    greenBonus: {},
    tactic: cfg.tactic,
    distanceAptitude: cfg.distanceAptitude,
    surfaceAptitude: cfg.surfaceAptitude,
    motivation: cfg.motivation,
    skills,
  };
}

export const TACTIC_LABEL: Record<Tactic, string> = { nige: '逃马', senko: '先行', sashi: '差行', oikomi: '追马' };
export const MOTIVATION_LABEL: Record<Motivation, string> = {
  best: '绝好调',
  good: '好调',
  normal: '普通',
  bad: '不调',
  worst: '绝不调',
};
export const PRECISION_LABEL: Record<string, string> = { precise: '精确', approx: '近似', unsupported: '不支持' };
export const APTITUDES: readonly Aptitude[] = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

export function fmtSec(v: number): string {
  return `${Math.floor(v / 60)}:${(v % 60).toFixed(2).padStart(5, '0')}`;
}
