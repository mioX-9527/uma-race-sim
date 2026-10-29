import type {
  Aptitude, Course, GroundCondition, Motivation, RestrictionClause, RunnerConfig, Season, SkillConfig, Stats, Tactic, Weather,
} from '@uma-race-sim/engine';
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

/** 回体/减益档位(614tools 耐力计算器同款分组;value=相对体力上限的比例) */
export interface HealTier {
  readonly key: string;
  readonly label: string;
  readonly note: string;
  readonly value: number;
}

export const HEAL_TIERS: readonly HealTier[] = [
  { key: 'h035', label: '0.35%', note: '快速、霸气十足等', value: 0.0035 },
  { key: 'h05', label: '0.5%', note: '斗争心、璀璨之星等', value: 0.005 },
  { key: 'h15', label: '1.5%', note: '弯道回复○等', value: 0.015 },
  { key: 'h35', label: '3.5%', note: '固有或复合回体', value: 0.035 },
  { key: 'h55', label: '5.5%', note: '圆弧的艺术家等金回', value: 0.055 },
  { key: 'h75', label: '7.5%', note: '进化或强化回体', value: 0.075 },
  { key: 'h95', label: '9.5%', note: '部分进化回体', value: 0.095 },
];

export const DEBUFF_TIERS: readonly HealTier[] = [
  { key: 'd05', label: '0.5%', note: '耐力吞噬等', value: -0.005 },
  { key: 'd1', label: '1%', note: '牵制、焦躁、低语等', value: -0.01 },
  { key: 'd2', label: '2%', note: '部分固有或复合减益', value: -0.02 },
  { key: 'd3', label: '3%', note: '魅惑的低语、八方睥睨等', value: -0.03 },
];

/** 单档回体/减益:数量与发动位置(赛程百分比) */
export interface HealPlanItem {
  readonly tierKey: string;
  readonly count: number;
  readonly atPct: 10 | 25 | 40;
}

export interface UiConfig {
  readonly stats: Stats;
  readonly tactic: Tactic;
  readonly distanceAptitude: Aptitude;
  readonly surfaceAptitude: Aptitude;
  readonly motivation: Motivation;
  /** 场地状态(影响体力消耗:稍重/重/不良按场地系数放大) */
  readonly groundCondition: GroundCondition;
  /** 天气(仅作技能条件:晴/阴/雨/雪) */
  readonly weather: Weather;
  /** 季节(仅作技能条件:春/夏/秋/冬/樱花) */
  readonly season: Season;
  /**
   * 赛道补正:'auto'(缺省)= 按赛道门槛属性(courseSetStatus)与五维自动计算
   * (uma-skill-tools 公式,见 engine courseFixOf);数字 = 手动覆盖。
   */
  readonly courseFix?: number | 'auto';
  /** 回体/减益试算(614tools 耐力计算器口径;发动位置取首档,温存判定前) */
  readonly healPlan?: readonly HealPlanItem[];
  readonly courseId: string;
  readonly skillIds: readonly string[];
}

export const DEFAULT_CONFIG: UiConfig = {
  stats: { speed: 2200, stamina: 1600, power: 1700, guts: 1200, wisdom: 1800 },
  tactic: 'senko',
  distanceAptitude: 'S',
  surfaceAptitude: 'A',
  motivation: 'best',
  groundCondition: 0,
  weather: 1,
  season: 1,
  courseId: 'c10606',
  skillIds: [],
};

export function findCourse(id: string): Course {
  return COURSES.find(c => c.id === id) ?? COURSES[0]!;
}

/** 回体/减益计划 → 合成 heal 技能(同档多次按所选位置合并发动;value 相对体力上限) */
export function planToSkills(plan: readonly HealPlanItem[] | undefined, kind: 'heal' | 'debuff'): SkillEntry[] {
  const tiers = kind === 'heal' ? HEAL_TIERS : DEBUFF_TIERS;
  const out: SkillEntry[] = [];
  for (const item of plan ?? []) {
    if (!Number.isFinite(item.count) || item.count <= 0) continue;
    const tier = tiers.find(t => t.key === item.tierKey);
    if (tier === undefined) continue;
    out.push({
      id: `plan-${kind}-${item.tierKey}-${item.atPct}`,
      name: `${kind === 'heal' ? '回体' : '减益'}${tier.label}×${item.count}(${item.atPct}%)`,
      rarity: 'normal',
      precision: 'precise',
      effects: [{ type: 'heal', value: tier.value * item.count }],
      durationSec: null,
      condition: { kind: 'positionPct', pct: item.atPct },
      wisdomScaled: false,
    });
  }
  return out;
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
    groundCondition: cfg.groundCondition,
    weather: cfg.weather,
    season: cfg.season,
    courseFix: cfg.courseFix ?? 'auto',
    skills: [...skills, ...planToSkills(cfg.healPlan, 'heal'), ...planToSkills(cfg.healPlan, 'debuff')],
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
/** 场地状态(触发代码 ground_condition 1良/2稍重/3重/4不良 → 枚举 0~3) */
export const GROUND_LABEL: Record<GroundCondition, string> = { 0: '良场', 1: '稍重', 2: '重', 3: '不良' };
export const WEATHER_LABEL: Record<Weather, string> = { 1: '晴', 2: '阴', 3: '雨', 4: '雪' };
export const SEASON_LABEL: Record<Season, string> = { 1: '春', 2: '夏', 3: '秋', 4: '冬', 5: '樱花' };
/** 赛场回转方向:1=顺时针 2=逆时针(与技能名「顺时针◎」「逆时针◎」用词一致) */
export const ROTATION_LABEL: Record<number, string> = { 1: '顺时针', 2: '逆时针' };

const STAT_CN: Record<string, string> = { speed: '速度', stamina: '耐力', power: '力量', guts: '根性', wisdom: '智力' };
const MOTIVATION_ORDER: readonly Motivation[] = ['worst', 'bad', 'normal', 'good', 'best'];

/** 距离档 → 简中(注意:「标准距离」不是距离档,而是 400m 倍数赛道,见 basisDistance) */
function distanceTypeText(dts: readonly string[]): string {
  return dts.map(d => DISTTYPE_LABEL[d] ?? d).join('/');
}

/** 干劲集合 → 「好调以上」这类区间描述 */
function motivationText(ms: readonly Motivation[]): string {
  const idx = ms.map(m => MOTIVATION_ORDER.indexOf(m)).filter(i => i >= 0).sort((a, b) => a - b);
  if (idx.length === 0) return '';
  if (idx.length === MOTIVATION_ORDER.length) return '';
  const lo = idx[0]!;
  const hi = idx[idx.length - 1]!;
  const contiguous = hi - lo + 1 === idx.length;
  const full = MOTIVATION_LABEL[MOTIVATION_ORDER[lo]!];
  if (!contiguous) return `干劲 ${ms.map(m => MOTIVATION_LABEL[m]).join('/')}`;
  if (lo === 0) return `干劲 ${MOTIVATION_LABEL[MOTIVATION_ORDER[hi]!]}以下`;
  if (hi === MOTIVATION_ORDER.length - 1) return `干劲 ${full}以上`;
  return `干劲 ${full}~${MOTIVATION_LABEL[MOTIVATION_ORDER[hi]!]}`;
}

/** 单条限制子句 → 中文短描述(字段间为「与」) */
function describeClause(r: RestrictionClause): string {
  const parts: string[] = [];
  if (r.tactics !== undefined) parts.push(r.tactics.map(t => TACTIC_LABEL[t]).join('/'));
  if (r.distanceTypes !== undefined) parts.push(distanceTypeText(r.distanceTypes));
  if (r.surfaces !== undefined) parts.push(r.surfaces.map(x => (x === 'turf' ? '草地' : '泥地')).join('/'));
  if (r.venues !== undefined) parts.push(`${r.venues.join('/')}赛场`);
  if (r.distances !== undefined) parts.push(r.distances.map(d => `${d}m`).join('/'));
  if (r.basisDistance !== undefined) parts.push(r.basisDistance ? '标准距离(400m倍数)' : '非标准距离(非400m倍数)');
  if (r.grounds !== undefined) parts.push(r.grounds.map(g => GROUND_LABEL[g] ?? `${g}`).join('/'));
  if (r.rotations !== undefined) parts.push(`${r.rotations.map(v => ROTATION_LABEL[v] ?? `${v}`).join('/')}赛道`);
  if (r.weathers !== undefined) parts.push(`${r.weathers.map(w => WEATHER_LABEL[w] ?? `${w}`).join('/')}天`);
  if (r.seasons !== undefined) parts.push(`季节 ${r.seasons.map(s => SEASON_LABEL[s] ?? `${s}`).join('/')}`);
  if (r.motivations !== undefined) {
    const t = motivationText(r.motivations);
    if (t !== '') parts.push(t);
  }
  if (r.abroad !== undefined) parts.push(r.abroad ? '海外赛场' : '国内赛场');
  if (r.dirtGrade !== undefined) parts.push(r.dirtGrade ? '交流重赏(地方赛事)' : '非交流重赏');
  for (const [k, v] of Object.entries(r.statsAtLeast ?? {})) parts.push(`${STAT_CN[k] ?? k}≥${v}`);
  for (const [k, v] of Object.entries(r.statsBelow ?? {})) parts.push(`${STAT_CN[k] ?? k}<${v}`);
  return parts.join(' · ');
}

const COUNTER_CN: Record<string, string> = {
  all: '已发动技能',
  start: '序盘发动技能',
  middle: '中盘发动技能',
  laterHalf: '后半段发动技能',
  endAfter: '终盘发动技能',
  heal: '已发动回复技能',
  green: '生效绿技能',
  heir: '继承技能',
};

/** 单条计数器约束 → 「已发动回复技能 ≥3」/「中盘发动技能 =7」 */
function counterText(key: string, req: { readonly min?: number; readonly max?: number }): string {
  const name = COUNTER_CN[key] ?? key;
  const min = req.min;
  const max = req.max;
  if (min !== undefined && max !== undefined) return min === max ? `${name} =${min}` : `${name} ${min}~${max}`;
  if (min !== undefined) return `${name} ≥${min}`;
  if (max !== undefined) return `${name} ≤${max}`;
  return '';
}

/** 技能 id → 名称(前提里引用别的技能时用) */
function skillNameOf(id: string): string {
  const hit = SKILLS.find(x => x.id === id || x.id.replace(/-b\d+$/, '') === id);
  return hit?.name ?? id;
}

/** 单条前提子句 → 中文短描述(字段间为「与」) */
function prereqClauseText(p: NonNullable<SkillConfig['prereq']>): string {
  const parts: string[] = [];
  for (const [k, req] of Object.entries(p.counters ?? {})) {
    if (req === undefined) continue;
    const t = counterText(k, req);
    if (t !== '') parts.push(t);
  }
  if (p.usedSkillBaseIds !== undefined) parts.push(`已发动「${p.usedSkillBaseIds.map(skillNameOf).join('」「')}」`);
  if (p.ownedSkillBaseIds !== undefined) parts.push(`持有「${p.ownedSkillBaseIds.map(skillNameOf).join('」「')}」`);
  if (p.requiresFirstBlock === true) parts.push('需先发动第一段');
  return parts.join(' · ');
}

/** 发动前提 → 中文短描述;多分支(anyOf)按「或」拼接 */
export function describePrereq(s: SkillConfig): string {
  const p = s.prereq;
  if (p === undefined) return '';
  if (p.anyOf !== undefined && p.anyOf.length > 0) {
    return p.anyOf.map(c => `(${prereqClauseText(c)})`).join(' 或 ');
  }
  return prereqClauseText(p);
}

/** 装配型限制 → 中文短描述;多分支(anyOf)按「或」拼接 */
export function describeRestriction(s: SkillConfig): string {
  const r = s.restriction;
  if (r === undefined) return '';
  if (r.anyOf !== undefined && r.anyOf.length > 0) {
    return r.anyOf.map(c => `(${describeClause(c)})`).join(' 或 ');
  }
  return describeClause(r);
}

/** 临场条件 token → 中文名(枠番/人气/抽选…,赛道与跑法都确定不了) */
const UNDETERMINED_LABEL: Record<string, string> = {
  post_number: '枠番',
  popularity: '人气',
  random_lot: '抽选',
  random_lot_shared: '抽选',
  grade: '赛事等级',
  time: '比赛时段',
  lane_type: '内外道',
  fan_count: '粉丝数',
  visiblehorse: '视野内有马',
  is_move_lane: '变道中',
  is_exist_chara_id: '队伍角色',
  remain_distance_viewer_id: '观察者距离',
};

/** 单个临场条件 token(`post_number>=6`)→ 可读文本(`枠番≥6`) */
function undeterminedText(tok: string): string {
  const m = tok.match(/^([a-z_0-9]+)(==|!=|>=|<=|>|<)(-?\d+)$/);
  if (m === null) return tok;
  const label = UNDETERMINED_LABEL[m[1]!] ?? m[1]!;
  const op = m[2] === '==' ? '=' : m[2] === '!=' ? '≠' : m[2] === '>=' ? '≥' : m[2] === '<=' ? '≤' : m[2]!;
  return `${label}${op}${m[3]}`;
}

/** 技能的临场条件列表(含 anyOf 各支),空数组 = 没有临场条件 */
export function undeterminedOf(s: SkillConfig): readonly string[] {
  const r = s.restriction;
  if (r === undefined) return [];
  const all = [...(r.undetermined ?? []), ...(r.anyOf ?? []).flatMap(c => c.undetermined ?? [])];
  return [...new Set(all)];
}

/** 临场条件的展示文本,如「枠番≥6」;无则空串 */
export function describeUndetermined(s: SkillConfig): string {
  return undeterminedOf(s).map(undeterminedText).join(' · ');
}
