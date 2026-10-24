import type { Course, Motivation, RunnerConfig, SkillConfig, SkillRestriction, Stats, Tactic, Aptitude } from '@uma-race-sim/engine';
import coursesJson from '../../../../data/courses.json';
import skillsJson from '../../../../data/skills.json';

export interface SkillEntry extends SkillConfig {
  readonly nameJa?: string;
  readonly nameTrad?: string;
  readonly cnReleased?: boolean;
  readonly restrictionText?: string;
}

export const COURSES = coursesJson as unknown as Course[];
export const SKILLS = skillsJson as unknown as SkillEntry[];

const PHASE_LABEL: Record<number, string> = { 0: '序盘', 1: '中盘', 2: '终盘', 3: '最终盘' };
const SEGMENT_LABEL: Record<string, string> = {
  cornerFastest: '弯道',
  straightFastest: '直线',
  uphillFastest: '上坡',
  downhillFastest: '下坡',
};
const BASE_LABEL: Record<string, string> = { start: '起点', midStart: '中盘起', lateStart: '终盘起', finalStart: '最终盘起' };
const STAT_LABEL: Record<string, string> = { speed: '速度', stamina: '耐力', power: '力量', guts: '根性', wisdom: '智力' };

/** 发动条件 → 中文短描述 */
export function describeCondition(c: SkillConfig['condition']): string {
  const seg = SEGMENT_LABEL[c.kind];
  if (seg !== undefined && 'spurt' in c && c.spurt === true) {
    return `末脚内${seg}(末脚为动态起点)`;
  }
  const pctWin = 'withinPct' in c && c.withinPct !== undefined
    ? `(${Math.round(c.withinPct[0] * 10) / 10}~${Math.round(c.withinPct[1] * 10) / 10}%处)`
    : '';
  const leftWin = 'withinLeftM' in c && c.withinLeftM !== undefined ? `(剩${c.withinLeftM[0]}~${c.withinLeftM[1]}m)` : '';
  const win = pctWin !== '' ? pctWin : leftWin;
  switch (c.kind) {
    case 'raceStart': return '起步时';
    case 'lastSpurt': return '末脚期间(动态起点)';
    case 'phase': {
      const part = c.part === 'firstHalf' ? '前半' : c.part === 'laterHalf' ? '后半' : c.part === 'firstQuarter' ? '前四分之一' : '';
      return `${PHASE_LABEL[c.phase]}${part}`;
    }
    case 'phaseAfter': return `${PHASE_LABEL[c.phase]}起`;
    case 'cornerN': return `第${c.n}个弯道${win}`;
    case 'cornerFastest': return `弯道${win}`;
    case 'finalCorner': return c.part === 'laterHalf' ? '最终弯道后半' : '最终弯道';
    case 'finalCornerOnward': return '最终弯道及往后';
    case 'thirdCornerFromEnd': return '最终第3弯道';
    case 'lateCorner': return '终盘弯道';
    case 'midCorner': return '中盘弯道';
    case 'finalStraight': return `最终直线${win}`;
    case 'straightFastest': return `直线${win}`;
    case 'backStraight': return `看台对面直线${win}`;
    case 'lateStraight': return '终盘直线';
    case 'uphillFastest': return `上坡${win}`;
    case 'downhillFastest': return `下坡${win}`;
    case 'distanceRun': return `行驶${c.meters}m后(${BASE_LABEL[c.base]})`;
    case 'distanceLeft':
      return c.fromMeters === c.toMeters
        ? `剩余${c.fromMeters}m时`
        : c.fromMeters === 0
          ? `剩余≤${c.toMeters}m`
          : `剩余${c.fromMeters}~${c.toMeters}m`;
    case 'distanceRate': {
      const from = Math.round(c.fromPct);
      const to = Math.round(c.toPct);
      return from === to ? `行进${from}%处` : `行进${from}~${Math.min(to, 100)}%`;
    }
    case 'elapsedSec': return `开赛${c.seconds}s后`;
    case 'positionPct': return `地点${c.pct}%`;
  }
}

/** 效果列表 → 中文短描述(含基准持续时间与冷却) */
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
  const cd = skill.cooldownSec != null && skill.cooldownSec > 0 ? `·冷却${skill.cooldownSec}s` : '';
  return parts.join(' / ') + dur + cd;
}

export interface UiConfig {
  readonly stats: Stats;
  readonly tactic: Tactic;
  readonly distanceAptitude: Aptitude;
  readonly surfaceAptitude: Aptitude;
  readonly motivation: Motivation;
  /** 赛道补正:有效速度 ×1.2(最大)或 ×1(标准);缺省=最大,与 614tools 默认一致 */
  readonly courseFix?: number;
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
    courseFix: cfg.courseFix ?? 1.2,
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

const DISTTYPE_LABEL: Record<string, string> = { short: '短距离', mile: '英里', mid: '中距离', long: '长距离' };
const GROUND_LABEL: Record<number, string> = { 0: '良场', 1: '好场', 2: '稍重', 3: '不良' };

/** 装配型限制 → 中文短描述 */
export function describeRestriction(s: SkillConfig): string {
  const r = s.restriction;
  if (r === undefined) return '';
  const parts: string[] = [];
  if (r.tactics !== undefined) parts.push(r.tactics.map(t => TACTIC_LABEL[t]).join('/'));
  if (r.distanceTypes !== undefined) parts.push(r.distanceTypes.map(d => DISTTYPE_LABEL[d] ?? d).join('/'));
  if (r.surfaces !== undefined) parts.push(r.surfaces.map(x => (x === 'turf' ? '草地' : '泥地')).join('/'));
  if (r.venues !== undefined) parts.push(`${r.venues.join('/')}赛场`);
  if (r.distances !== undefined) parts.push(r.distances.map(d => `${d}m`).join('/'));
  if (r.grounds !== undefined) parts.push(r.grounds.map(g => GROUND_LABEL[g] ?? `${g}`).join('/'));
  return parts.join(' · ');
}
