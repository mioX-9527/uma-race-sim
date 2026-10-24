import type { Course, Motivation, RunnerConfig, SkillConfig, Stats, Tactic, Aptitude } from '@uma-race-sim/engine';
import coursesJson from '../../../../data/courses.json';
import skillsJson from '../../../../data/skills.json';

export interface SkillEntry extends SkillConfig {
  readonly nameJa?: string;
  readonly nameTrad?: string;
  readonly cnReleased?: boolean;
  readonly restriction?: string;
}

export const COURSES = coursesJson as unknown as Course[];
export const SKILLS = skillsJson as unknown as SkillEntry[];

const PHASE_LABEL: Record<number, string> = { 0: '序盘', 1: '中盘', 2: '终盘', 3: '最终盘' };
const BASE_LABEL: Record<string, string> = { start: '起点', midStart: '中盘起', lateStart: '终盘起', finalStart: '最终盘起' };
const STAT_LABEL: Record<string, string> = { speed: '速度', stamina: '耐力', power: '力量', guts: '根性', wisdom: '智力' };

/** 发动条件 → 中文短描述 */
export function describeCondition(c: SkillConfig['condition']): string {
  switch (c.kind) {
    case 'raceStart': return '起步时';
    case 'phase': return `仅${PHASE_LABEL[c.phase]}`;
    case 'phaseAfter': return `${PHASE_LABEL[c.phase]}起`;
    case 'cornerN': return `第${c.n}个弯道`;
    case 'cornerFastest': return `首个弯道${c.phaseFilter !== undefined ? `(限${PHASE_LABEL[c.phaseFilter]})` : ''}`;
    case 'finalCorner': return '最终弯道';
    case 'thirdCornerFromEnd': return '最终第3弯道';
    case 'lateCorner': return '终盘弯道';
    case 'midCorner': return '中盘弯道';
    case 'finalStraight': return '最终直线';
    case 'straightFastest': return `首个直线${c.phaseFilter !== undefined ? `(限${PHASE_LABEL[c.phaseFilter]})` : ''}`;
    case 'lateStraight': return '终盘直线';
    case 'uphillFastest': return `首个上坡${c.phaseFilter !== undefined ? `(限${PHASE_LABEL[c.phaseFilter]})` : ''}`;
    case 'downhillFastest': return `首个下坡${c.phaseFilter !== undefined ? `(限${PHASE_LABEL[c.phaseFilter]})` : ''}`;
    case 'distanceRun': return `行驶${c.meters}m后(${BASE_LABEL[c.base]})`;
    case 'distanceLeft': return `剩余${c.meters}m时`;
    case 'elapsedSec': return `开赛${c.seconds}s后`;
    case 'positionPct': return `地点${c.pct}%`;
  }
}

/** 效果列表 → 中文短描述(含基准持续时间) */
export function describeEffects(skill: SkillConfig): string {
  const parts = skill.effects.map(e => {
    switch (e.type) {
      case 'targetSpeed': return `速度${e.value >= 0 ? '+' : ''}${e.value}`;
      case 'currentSpeed': return `即时速度${e.value >= 0 ? '+' : ''}${e.value}`;
      case 'acceleration': return `加速度${e.value >= 0 ? '+' : ''}${e.value}`;
      case 'lastSpurtExtension': return `末脚延展+${e.value}`;
      case 'heal': return `回复${(e.value * 100).toFixed(1)}%体力`;
      case 'passive': return `绿·${STAT_LABEL[e.stat]}+${e.value}`;
      case 'unsupported': return `〔${e.label}〕`;
    }
  });
  const dur = skill.durationSec === null ? '' : `·${skill.durationSec}s`;
  return parts.join(' / ') + dur;
}

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
