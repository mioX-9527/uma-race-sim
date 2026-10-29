/**
 * 技能清洗脚本:data/raw/skills.raw.json(BWIKI 技能速查表)→ data/skills.json + data/skill-review.json
 *
 * 条件解析双层策略:
 * 1. 触发代码优先 —— BWIKI「模块:技能数据库内容」(游戏解包,parse-skill-lua.js 转存为
 *    data/raw/skill-data-lua.json):condition_1/2 为机器可读表达式(如
 *    running_style==4&is_lastspurt==1&corner==0),效果/持续时间/冷却取 ability_type_s_e /
 *    float_ability_time_s / float_cooldown_time_s(均 ×10000 缩放)。
 *    代码内「@」分隔"或"变体(对应速查表 条件N.M):限制取并集,区段取首个变体并标记 approx。
 * 2. 文本兜底 —— Lua 数据缺失的技能沿用中文文本规则解析(锚点表 + 近似词表)。
 *
 * 继承技:固有技能的继承版(模块:技能数据库内容2,900xxx,本体 = unique_skill_id_1)
 * 单独生成条目(rarity uniqueHeir,名称「XXX(继承)」)—— 数值/持续时间/触发条件与本体不同。
 *
 * 精度分层:所有 token 可精确映射 → precise;含随机位置(_random)/名次/他马相关 token → approx;
 * 无可发动区段或效果不支持 → unsupported(灰显可搜索)。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

interface RawEntry {
  page: string;
  props: Record<string, unknown>;
}
interface OutEffect {
  type: string;
  value?: number;
  stat?: string;
  label?: string;
}
interface OutSkill {
  id: string;
  name: string;
  nameJa?: string;
  /** 繁中(台服)译名,便于搜索对照 */
  nameTrad?: string;
  /** 国服已实装(名称取自 BWIKI 简中技能速查表的官方译名) */
  cnReleased?: boolean;
  rarity: string;
  precision: 'precise' | 'approx' | 'unsupported';
  effects: OutEffect[];
  durationSec: number | null;
  cooldownSec?: number | null;
  condition: Record<string, unknown>;
  restriction?: Record<string, unknown>;
  /** 发动前提(已发动技能数 / 回复技能数 / 需已发动的技能 / 本技能第一段) */
  prereq?: Record<string, unknown>;
  restrictionText?: string;
  wisdomScaled: boolean;
  /** 触发代码含 *_random → 发动位置在满足区段内随机,消融按位置采样求期望 */
  randomPosition?: boolean;
  source: string;
  fetchedAt: string;
}

const raw = JSON.parse(readFileSync('data/raw/skills.raw.json', 'utf8')) as {
  fetchedAt: string;
  source: string;
  results: RawEntry[];
};
/** 国服官方译名:BWIKI 简中技能速查表(简/ 页面,ID 对齐);文件未生成时视为空映射 */
const cnNames = existsSync('data/raw/cn-skill-names.json')
  ? (JSON.parse(readFileSync('data/raw/cn-skill-names.json', 'utf8')) as { map: Record<string, string> })
  : { map: {} as Record<string, string> };
/** 游戏解包技能数据(模块:技能数据库内容);未生成时全部走文本兜底 */
const luaSkills = existsSync('data/raw/skill-data-lua.json')
  ? (JSON.parse(readFileSync('data/raw/skill-data-lua.json', 'utf8')) as Array<Record<string, string>>)
  : [];
const luaById = new Map(luaSkills.map(r => [r.id!, r]));
/** 游戏解包技能数据其二(模块:技能数据库内容2):继承技(900xxx,本体 = unique_skill_id_1)与进化(1M+) */
const lua2Skills = existsSync('data/raw/skill-data-lua2.json')
  ? (JSON.parse(readFileSync('data/raw/skill-data-lua2.json', 'utf8')) as Array<Record<string, string>>)
  : [];
const lua2ById = new Map(lua2Skills.map(r => [r.id!, r]));
/** 继承技三语名称(BWIKI 继承技/* 页面,fetch-heir-names.mjs 抓取);缺简中 = 国服未实装 */
const heirNames = existsSync('data/raw/heir-skill-names.json')
  ? (JSON.parse(readFileSync('data/raw/heir-skill-names.json', 'utf8')) as {
      map: Record<string, { cn?: string; trad?: string; ja?: string }>;
    }).map
  : {};

const review: Array<{ id: string; page: string; reasons: string[] }> = [];

// ---------- 字段工具 ----------
const prop = (e: RawEntry, k: string): string => String(e.props[k] ?? '').trim();

function cleanName(s: string): string {
  return s.split(/<br\s*\/?>/i)[0]!.replace(/\s+/g, ' ').trim();
}

/** 把字段按 <br> 分段,识别 条件N / 条件N.M(子条件变体) / 前置 前缀 */
function splitBranches(field: string): Array<{ label: string | null; premise: boolean; text: string }> {
  const parts = field.split(/<br\s*\/?>/i).map(p => p.trim()).filter(p => p !== '');
  return parts.map(p => {
    const m = p.match(/^(条件\d(?:\.\d)?)(前置)?\s*[:：]\s*(.*)$/);
    if (m) return { label: m[1]!, premise: m[2] !== undefined, text: m[3]!.trim() };
    const pm = p.match(/^前置\s*[:：]\s*(.*)$/);
    if (pm) return { label: null, premise: true, text: pm[1]!.trim() };
    return { label: null, premise: false, text: p };
  });
}

/** 无分支标签的字段 → 单值;有标签 → 按标签映射;子条件变体(条件N.M)归并到基础标签 N(取首个变体) */
function fieldByBranch(field: string, labels: readonly string[]): string[] {
  const parts = splitBranches(field);
  const labeled = new Map<string, string>();
  for (const p of parts) {
    if (p.label === null || p.premise) continue;
    const base = p.label.replace(/\.\d$/, '');
    if (!labeled.has(p.label)) labeled.set(p.label, p.text);
    if (!labeled.has(base)) labeled.set(base, p.text);
  }
  if (labels.length <= 1) {
    const plain = parts.filter(p => p.label === null && !p.premise).map(p => p.text);
    return [plain.join(',') || parts.map(p => p.text).join(',')];
  }
  return labels.map(l => labeled.get(l) ?? parts.map(p => p.text).join(','));
}

// =====================================================================
// 触发代码解析(模块:技能数据库内容,游戏解包表达式)
// =====================================================================

/** 赛场编号 → 名称(与 make-courses.ts 的 VENUES 一致) */
const TRACK_VENUES: Record<number, string> = {
  10001: '札幌', 10002: '函馆', 10003: '新潟', 10004: '福岛', 10005: '中山',
  10006: '东京', 10007: '中京', 10008: '京都', 10009: '阪神', 10010: '小仓',
  10101: '大井', 10103: '川崎', 10104: '船桥', 10105: '盛冈',
  10201: '隆尚', 10202: '圣安妮塔公园', 10203: '德尔马',
};
const CODE_TACTIC: Record<string, string> = { '1': 'nige', '2': 'senko', '3': 'sashi', '4': 'oikomi' };
const CODE_DISTTYPE: Record<string, string> = { '1': 'short', '2': 'mile', '3': 'mid', '4': 'long' };
const CODE_PHASE: Record<string, 0 | 1 | 2 | 3> = { '0': 0, '1': 1, '2': 2, '3': 3 };
/** 阶段 → 行进距离百分比窗口(阶段分界 1/6、2/3、5/6 的百分比表示) */
const PHASE_PCT: Record<0 | 1 | 2 | 3, [number, number]> = {
  0: [0, 100 / 6],
  1: [100 / 6, 200 / 3],
  2: [200 / 3, 500 / 6],
  3: [500 / 6, 100],
};

interface CodeRestriction {
  tactics: Set<string>;
  distanceTypes: Set<string>;
  surfaces: Set<string>;
  venues: Set<string>;
  grounds: Set<number>;
  distances: Set<number>;
  /** 赛场回转方向(触发代码 rotation==N:1=顺时针,2=逆时针) */
  rotations: Set<number>;
  /** 天气(触发代码 weather==N:1晴/2阴/3雨/4雪) */
  weathers: Set<number>;
  /** 季节(触发代码 season==N:1春/2夏/3秋/4冬/5樱花) */
  seasons: Set<number>;
  /** 干劲(触发代码 motivation:1绝不调~5绝好调) */
  motivations: Set<string>;
  /** 海外赛场(触发代码 is_abroad) */
  abroad?: boolean;
  /** 标准距离(触发代码 is_basis_distance:赛程全长为 400 米整数倍) */
  basisDistance?: boolean;
  /** 面板属性下限(含,base_xxx>=N) */
  statsAtLeast: Record<string, number>;
  /** 面板属性上限(不含,base_xxx<N) */
  statsBelow: Record<string, number>;
  distanceMin?: number;
  distanceMax?: number;
}

interface CodeParse {
  /** 条件对象(null=无可发动区段) */
  condition: Record<string, unknown> | null;
  approx: boolean;
  /** 各 @ 变体的限制子句(变体之间是「或」;单元素 = 单子句) */
  clauses: CodeRestriction[];
  /** 各 @ 变体的发动前提(变体之间是「或」) */
  prereqs: CodePrereq[];
  /** 临场条件 token(post_number==7 等,无法由赛道/跑法确定;绿技能据此默认不计收益) */
  undetermined: string[];
  notes: string[];
}

interface Token {
  name: string;
  op: string;
  value: number;
  raw: string;
}

function tokenize(code: string): Token[] {
  return code
    .split(/&&|&(?!&)/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      const m = p.match(/^([A-Za-z_0-9]+)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
      return m ? { name: m[1]!, op: m[2]!, value: Number.parseFloat(m[3]!), raw: p } : { name: p, op: '?', value: NaN, raw: p };
    });
}

/** 名次/他马/随机相关 token → 近似层 */
const APPROX_NAME_RE =
  /^order|bashin_diff|distance_diff|near_|infront_near|behind_near|is_behind_in|is_overtake|overtake_target|blocked_|is_surrounded|compete_|temptation|is_temptation|change_order|is_activate_other|is_activate_any|is_activate_heal|activate_count|is_used_skill|hp_per|run_at_full_speed_random|running_style_count|running_style_equal|is_other_character|same_skill_horse|is_badstart|is_goodstart/;
/** 环境前提 token:单马模拟视为满足,记录到备注 */
const ENV_TOKENS = new Set([
  'popularity', 'post_number',
  'fan_count', 'grade', 'is_dirtgrade', 'is_tight_track', 'lane_type',
  'furlong', 'remain_distance_viewer_id', 'is_exist_chara_id',
  'visiblehorse', 'random_lot', 'random_lot_shared', 'is_move_lane', 'time',
]);

/**
 * **临场条件** token:由开赛时的实际情况决定 —— 闸位(枠番)、人气、抽选、赛事等级、
 * 比赛时段、内外道、他马/观众/队伍 —— 赛道、跑法、环境配置全都确定不了。
 * 常时被动(绿技能)带这些条件 ⇒ 不能保证 100% 发动,默认不计收益:
 * 写进 `restriction.undetermined`,引擎视为不满足(见 restriction.ts)。
 * ⚠️ `is_tight_track`(小回り,可由赛场确定)与 `furlong`(与剩余距离有关)**不在列**,
 * 仍按「环境前提,视为满足」处理。
 */
const UNDETERMINED_TOKENS = new Set([
  'post_number', 'popularity', 'random_lot', 'random_lot_shared',
  'grade', 'is_dirtgrade', 'time', 'lane_type', 'fan_count',
  'visiblehorse', 'is_move_lane', 'is_exist_chara_id', 'remain_distance_viewer_id',
]);

function emptyRestriction(): CodeRestriction {
  return {
    tactics: new Set(), distanceTypes: new Set(), surfaces: new Set(), venues: new Set(),
    grounds: new Set(), distances: new Set(), rotations: new Set(), weathers: new Set(), seasons: new Set(),
    motivations: new Set(), statsAtLeast: {}, statsBelow: {},
  };
}

/** 计数器 token → 引擎计数器名(与 ActivationCounter 对齐) */
const COUNTER_BY_TOKEN: Record<string, string> = {
  activate_count_all: 'all',
  activate_count_start: 'start',
  activate_count_middle: 'middle',
  activate_count_later_half: 'laterHalf',
  activate_count_end_after: 'endAfter',
  activate_count_heal: 'heal',
  activate_count_param_skill: 'green',
  succession_skill_count: 'heir',
};

/** 触发代码里的「发动前提」(依赖自身技能发动史 / 持有技能) */
interface CodePrereq {
  counters: Record<string, { min?: number; max?: number }>;
  usedSkillBaseIds: string[];
  ownedSkillBaseIds: string[];
  requiresFirstBlock: boolean;
}

function emptyPrereq(): CodePrereq {
  return { counters: {}, usedSkillBaseIds: [], ownedSkillBaseIds: [], requiresFirstBlock: false };
}

function prereqIsEmpty(p: CodePrereq): boolean {
  return Object.keys(p.counters).length === 0 && p.usedSkillBaseIds.length === 0 &&
    p.ownedSkillBaseIds.length === 0 && !p.requiresFirstBlock;
}

/** 写入计数器约束(同字段多次出现取「与」:min 取大、max 取小) */
function putCounter(p: CodePrereq, key: string, op: string, value: number, notes: string[]): void {
  const cur = p.counters[key] ?? {};
  let min = cur.min;
  let max = cur.max;
  if (op === '>=') min = Math.max(min ?? -Infinity, value);
  else if (op === '>') min = Math.max(min ?? -Infinity, value + 1);
  else if (op === '<=') max = Math.min(max ?? Infinity, value);
  else if (op === '<') max = Math.min(max ?? Infinity, value - 1);
  else if (op === '==') { min = Math.max(min ?? -Infinity, value); max = Math.min(max ?? Infinity, value); }
  else { notes.push(`${key}${op}${value} 未识别(前提)`); return; }
  p.counters[key] = {
    ...(min !== undefined && Number.isFinite(min) ? { min } : {}),
    ...(max !== undefined && Number.isFinite(max) ? { max } : {}),
  };
}

/** 前提「与」合并(两组前提需同时满足) */
function mergePrereqAnd(a: CodePrereq, b: CodePrereq): void {
  for (const [k, v] of Object.entries(b.counters)) {
    const cur = a.counters[k] ?? {};
    a.counters[k] = {
      ...(v.min !== undefined || cur.min !== undefined ? { min: Math.max(v.min ?? -Infinity, cur.min ?? -Infinity) } : {}),
      ...(v.max !== undefined || cur.max !== undefined ? { max: Math.min(v.max ?? Infinity, cur.max ?? Infinity) } : {}),
    };
  }
  for (const id of b.usedSkillBaseIds) if (!a.usedSkillBaseIds.includes(id)) a.usedSkillBaseIds.push(id);
  for (const id of b.ownedSkillBaseIds) if (!a.ownedSkillBaseIds.includes(id)) a.ownedSkillBaseIds.push(id);
  if (b.requiresFirstBlock) a.requiresFirstBlock = true;
}

/**
 * 只有前提、没有位置锚点的技能(如「中盘发动技能数≥3」):按前提的统计范围给出可发动区间。
 * 例如 activate_count_middle 天然只能在中盘满足 → 中盘区间;later_half → 50%~终点。
 */
function conditionFromPrereq(p: CodePrereq): Record<string, unknown> {
  const c = p.counters;
  if (c.endAfter !== undefined) return { kind: 'phaseAfter', phase: 2 };
  if (c.laterHalf !== undefined) return { kind: 'distanceRate', fromPct: 50, toPct: 100 };
  if (c.middle !== undefined) return { kind: 'phase', phase: 1 };
  if (c.start !== undefined) return { kind: 'phase', phase: 0 };
  // all / heal / green / heir:随时可能满足,整场可发动
  return { kind: 'distanceRate', fromPct: 0, toPct: 100 };
}

/** 前提 → 输出对象(空 = 无前提) */
function prereqObj(p: CodePrereq): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (Object.keys(p.counters).length > 0) out.counters = { ...p.counters };
  if (p.usedSkillBaseIds.length > 0) out.usedSkillBaseIds = [...p.usedSkillBaseIds].sort();
  if (p.ownedSkillBaseIds.length > 0) out.ownedSkillBaseIds = [...p.ownedSkillBaseIds].sort();
  if (p.requiresFirstBlock) out.requiresFirstBlock = true;
  return out;
}

/**
 * 多组前提(@ 变体 / 前置条件)→ 输出对象。
 * 变体之间是「或」:任一无前提 ⇒ 整体无前提;多组不同 ⇒ `{ anyOf: [...] }`(任一满足即成立)。
 */
function prereqObjOf(groups: readonly CodePrereq[]): Record<string, unknown> | undefined {
  const objs: Record<string, unknown>[] = [];
  for (const g of groups) {
    if (prereqIsEmpty(g)) return undefined;
    objs.push(prereqObj(g));
  }
  const uniq = [...new Map(objs.map(o => [JSON.stringify(o), o])).values()];
  if (uniq.length === 0) return undefined;
  if (uniq.length === 1) return uniq[0];
  // 有任意一支不需要前提 → 等价于无前提
  if (uniq.some(o => Object.keys(o).length === 0)) return undefined;
  return { anyOf: uniq };
}

/** 前置条件与发动条件的前提「与」组合(两组都是 OR 时取交叉) */
function crossPrereq(a: readonly CodePrereq[], b: readonly CodePrereq[]): CodePrereq[] {
  const out: CodePrereq[] = [];
  for (const x of a) {
    for (const y of b) {
      const m: CodePrereq = {
        counters: { ...x.counters },
        usedSkillBaseIds: [...x.usedSkillBaseIds],
        ownedSkillBaseIds: [...x.ownedSkillBaseIds],
        requiresFirstBlock: x.requiresFirstBlock,
      };
      mergePrereqAnd(m, y);
      const key = JSON.stringify(prereqObj(m));
      if (!out.some(o => JSON.stringify(prereqObj(o)) === key)) out.push(m);
    }
  }
  return out.slice(0, 8);
}

/** 子句内字段是否「已被本变体赋值」(用于同字段多次出现取交集,即 AND 语义) */
type Touched = Set<string>;

/**
 * 写入单值集合:本变体内首次出现 → 赋值;再次出现 → 取交集。
 * 触发代码同一支里 `ground_condition>=2&ground_condition<=3` 这类写法是「与」,
 * 直接累加会错成并集(全部场地状态)。
 */
function putSet<T>(field: string, set: Set<T>, values: readonly T[], touched: Touched): void {
  if (!touched.has(field)) {
    set.clear();
    for (const v of values) set.add(v);
    touched.add(field);
  } else {
    for (const v of [...set]) if (!values.includes(v)) set.delete(v);
  }
}

/** 子句「与」合并(把 b 的限制并进 a;同字段取交集/更严的一端) */
function andRestriction(a: CodeRestriction, b: CodeRestriction): void {
  const andSet = <T>(x: Set<T>, y: Set<T>): void => {
    if (y.size === 0) return;
    if (x.size === 0) { for (const v of y) x.add(v); return; }
    for (const v of [...x]) if (!y.has(v)) x.delete(v);
  };
  andSet(a.tactics, b.tactics);
  andSet(a.distanceTypes, b.distanceTypes);
  andSet(a.surfaces, b.surfaces);
  andSet(a.venues, b.venues);
  andSet(a.grounds, b.grounds);
  andSet(a.distances, b.distances);
  andSet(a.rotations, b.rotations);
  andSet(a.weathers, b.weathers);
  andSet(a.seasons, b.seasons);
  andSet(a.motivations, b.motivations);
  if (b.abroad !== undefined) a.abroad = a.abroad === undefined ? b.abroad : a.abroad && b.abroad;
  if (b.basisDistance !== undefined) {
    // 「与」:两边要求不同(一个要标准、一个要非标准)⇒ 该子句不可能成立,记成 false 兜底
    a.basisDistance = a.basisDistance === undefined ? b.basisDistance : a.basisDistance === b.basisDistance ? a.basisDistance : false;
  }
  for (const [k, v] of Object.entries(b.statsAtLeast)) a.statsAtLeast[k] = Math.max(a.statsAtLeast[k] ?? -Infinity, v);
  for (const [k, v] of Object.entries(b.statsBelow)) a.statsBelow[k] = Math.min(a.statsBelow[k] ?? Infinity, v);
  if (b.distanceMin !== undefined) a.distanceMin = Math.max(a.distanceMin ?? -Infinity, b.distanceMin);
  if (b.distanceMax !== undefined) a.distanceMax = Math.min(a.distanceMax ?? Infinity, b.distanceMax);
}

/** 子句是否「无任何限制」(恒真) */
function restrictionIsEmpty(r: CodeRestriction): boolean {
  return r.tactics.size + r.distanceTypes.size + r.surfaces.size + r.venues.size + r.grounds.size + r.distances.size +
    r.rotations.size + r.weathers.size + r.seasons.size + r.motivations.size === 0 &&
    r.abroad === undefined && r.basisDistance === undefined && Object.keys(r.statsAtLeast).length === 0 && Object.keys(r.statsBelow).length === 0 &&
    r.distanceMin === undefined && r.distanceMax === undefined;
}

/**
 * 解析单个变体(「@」分隔的其中一支)。
 * 锚点优先级(高→低):末脚起点 > 具体弯道 > 最终弯道/直线 > 任意弯道/直线 > 坡道 > 看台对面直线 >
 * 距离窗口(独立成锚) > 阶段 > 累计时间 > 常驻。阶段/距离窗口与区段锚联用时转为裁剪字段。
 */
function parseVariant(tokens: readonly Token[], notes: string[]): Omit<CodeParse, 'clauses' | 'prereqs'> & { restriction: CodeRestriction; prereq: CodePrereq } {
  const restriction = emptyRestriction();
  /** 发动前提(已发动技能数等;不参与位置锚定) */
  const prereq = emptyPrereq();
  /** 本变体内已被赋值的限制字段(同字段二次出现 → 取交集) */
  const touched: Touched = new Set();
  let approx = false;

  // 距离窗口(可与区段锚联用)
  let rateLo: number | null = null;
  let rateHi: number | null = null;
  let leftLo: number | null = null;
  let leftHi: number | null = null;
  // 阶段信息(可与区段锚联用)
  let phaseRange: [number, number] | null = null;
  let phaseAfter: number | null = null;
  let phaseFilter: number | null = null;

  type Anchor = { rank: number; cond: Record<string, unknown> };
  let anchor: Anchor | null = null;
  const setAnchor = (rank: number, cond: Record<string, unknown>): void => {
    if (anchor === null || rank < anchor.rank) anchor = { rank, cond };
  };
  let spurtFlag = false;
  let trackMin: number | null = null;
  let trackMax: number | null = null;
  let slopeSign = 0;
  /** 全部 token 都属于装配限制/环境前提(无位置锚点)→ 条件视为"满足即常驻" */
  let onlyRestrictive = true;
  /** 本变体内的临场条件(post_number==7 等;赛道/跑法确定不了) */
  const undetermined: string[] = [];

  for (const tk of tokens) {
    const { name, op, value } = tk;
    const v1 = op === '==' && value === 1;
    switch (true) {
      // ---- 锚点 ----
      case name === 'always' && v1:
        setAnchor(90, { kind: 'raceStart' });
        break;
      case name === 'lastspurt' && op === '==' && value === 2:
        setAnchor(10, { kind: 'lastSpurt' });
        break;
      case (name === 'is_lastspurt' && v1) || (name === 'lastspurt' && v1):
        spurtFlag = true;
        break;
      case name === 'corner' && op === '==' && value >= 1:
        setAnchor(20, { kind: 'cornerN', n: value });
        break;
      case name === 'corner' && op === '==' && value === 0:
        setAnchor(40, { kind: 'straightFastest' });
        break;
      case (name === 'corner' && (op === '!=' || op === '>=')) || (name === 'corner' && op === '>' && value === 0):
        setAnchor(40, { kind: 'cornerFastest' });
        break;
      case name === 'is_finalcorner_laterhalf' && v1:
        setAnchor(20, { kind: 'finalCorner', part: 'laterHalf' });
        break;
      case name === 'is_finalcorner' && v1:
        setAnchor(20, { kind: 'finalCorner' });
        break;
      case name === 'is_finalcorner_random' && v1:
        approx = true;
        setAnchor(20, { kind: 'finalCorner' });
        break;
      case (name === 'is_last_straight' || name === 'is_last_straight_onetime') && v1:
        setAnchor(30, { kind: 'finalStraight' });
        break;
      case name === 'last_straight_random' && v1:
        approx = true;
        setAnchor(30, { kind: 'finalStraight' });
        break;
      case name === 'corner_random' || name === 'all_corner_random':
        approx = true;
        setAnchor(40, { kind: 'cornerFastest' });
        break;
      case name === 'straight_random':
        approx = true;
        setAnchor(40, { kind: 'straightFastest' });
        break;
      case name === 'phase_corner_random':
        approx = true;
        phaseFilter = CODE_PHASE[String(value)] ?? null;
        setAnchor(40, { kind: 'cornerFastest' });
        break;
      case name === 'phase_straight_random':
        approx = true;
        phaseFilter = CODE_PHASE[String(value)] ?? null;
        setAnchor(40, { kind: 'straightFastest' });
        break;
      case name === 'up_slope_random':
        approx = true;
        setAnchor(50, { kind: 'uphillFastest' });
        break;
      case name === 'down_slope_random':
        approx = true;
        setAnchor(50, { kind: 'downhillFastest' });
        break;
      case name === 'slope' && op === '==' && value === 1:
        slopeSign = 1;
        setAnchor(50, { kind: 'uphillFastest' });
        break;
      case name === 'slope' && op === '==' && value === 2:
        slopeSign = -1;
        setAnchor(50, { kind: 'downhillFastest' });
        break;
      case name === 'slope' && op === '==' && value === 0:
        // 非坡道区段:没有精确几何,按全场近似
        approx = true;
        notes.push('slope==0(非坡道)按全场近似');
        setAnchor(85, { kind: 'raceStart' });
        break;
      case name === 'straight_front_type' && op === '==' && value === 2:
        setAnchor(45, { kind: 'backStraight' });
        break;
      // ---- 阶段 ----
      case name === 'phase' && (op === '==' || op === '>='):
        if (op === '==') {
          const p = CODE_PHASE[String(value)];
          if (p !== undefined) {
            phaseRange = PHASE_PCT[p];
            setAnchor(70, { kind: 'phase', phase: p });
          }
        } else {
          phaseAfter = value;
          setAnchor(75, { kind: 'phaseAfter', phase: value });
        }
        break;
      case name === 'phase' && (op === '<=' || op === '<'): {
        // phase<=N:从起步到阶段 N 结束
        const p = CODE_PHASE[String(value)];
        if (p !== undefined) {
          onlyRestrictive = false;
          setAnchor(80, { kind: 'raceStart', withinPct: [0, PHASE_PCT[p][1]] });
        }
        break;
      }
      case name === 'phase_firsthalf' || name === 'phase_laterhalf': {
        const p = CODE_PHASE[String(value)];
        if (p !== undefined) {
          phaseRange = PHASE_PCT[p];
          setAnchor(70, {
            kind: 'phase',
            phase: p,
            part: name === 'phase_firsthalf' ? 'firstHalf' : 'laterHalf',
          });
        }
        break;
      }
      case name === 'phase_random' || name === 'phase_firsthalf_random' || name === 'phase_laterhalf_random' || name === 'phase_firstquarter_random': {
        approx = true;
        const p = CODE_PHASE[String(value)];
        if (p !== undefined) {
          phaseRange = PHASE_PCT[p];
          const part =
            name === 'phase_firsthalf_random' ? 'firstHalf'
              : name === 'phase_laterhalf_random' ? 'laterHalf'
                : name === 'phase_firstquarter_random' ? 'firstQuarter'
                  : undefined;
          setAnchor(70, { kind: 'phase', phase: p, ...(part !== undefined ? { part } : {}) });
        }
        break;
      }
      // ---- 距离窗口 ----
      case name === 'distance_rate': {
        if (op === '>=' || op === '>') rateLo = Math.max(rateLo ?? -Infinity, value);
        else if (op === '<=' || op === '<') rateHi = Math.min(rateHi ?? Infinity, value);
        else if (op === '==') { rateLo = value; rateHi = value; }
        setAnchor(60, { kind: 'distanceRate', fromPct: 0, toPct: 100 });
        break;
      }
      case name === 'distance_rate_after_random':
        // 到达 N% 之后的随机位置
        approx = true;
        setAnchor(60, { kind: 'distanceRate', fromPct: value, toPct: 100 });
        break;
      case name === 'remain_distance': {
        if (op === '>=' || op === '>') leftLo = Math.max(leftLo ?? -Infinity, value);
        else if (op === '<=' || op === '<') leftHi = Math.min(leftHi ?? Infinity, value);
        else if (op === '==') { leftLo = value; leftHi = value; }
        setAnchor(60, { kind: 'distanceLeft', fromMeters: 0, toMeters: Infinity });
        break;
      }
      case name === 'accumulatetime' && (op === '>=' || op === '>'):
        setAnchor(80, { kind: 'elapsedSec', seconds: value, base: 'start' });
        break;
      // ---- 装配限制(同一变体内为「与」:同字段多次出现取交集) ----
      case name === 'running_style' && op === '==': {
        const t = CODE_TACTIC[String(value)];
        if (t !== undefined) putSet('tactics', restriction.tactics, [t], touched);
        else notes.push(`running_style=${value} 未知`);
        break;
      }
      case name === 'distance_type' && op === '==': {
        const d = CODE_DISTTYPE[String(value)];
        if (d !== undefined) putSet('distanceTypes', restriction.distanceTypes, [d], touched);
        break;
      }
      case name === 'distance_type' && op === '!=':
        // distance_type!=N:排除某一档
        putSet('distanceTypes', restriction.distanceTypes, Object.entries(CODE_DISTTYPE).filter(([k]) => k !== String(value)).map(([, v]) => v), touched);
        break;
      case name === 'is_basis_distance': {
        // 標準距離:赛程全长为 400 米的整数倍(1200/1600/2000/2400/3200...)。
        // 注意它和距离档(短/英里/中/长)是两条独立轴:2500 是长距离但非 400 倍数,
        // 1600 是英里但是 400 倍数。**不要**映射成 distanceTypes。
        const flag = value === 1;
        if (op === '==') restriction.basisDistance = flag;
        else if (op === '!=') restriction.basisDistance = !flag;
        else notes.push(`is_basis_distance${op}${value} 未识别`);
        break;
      }
      case name === 'ground_type' && op === '==':
        putSet('surfaces', restriction.surfaces, [value === 1 ? 'turf' : 'dirt'], touched);
        break;
      case name === 'ground_condition': {
        // 触发代码 1良/2稍重/3重/4不良 → 枚举 0/1/2/3;!= / >= / <= 展开为候选集
        const all: readonly number[] = [0, 1, 2, 3];
        const g = value - 1;
        let vals: readonly number[] | null = null;
        if (op === '==') vals = [g];
        else if (op === '!=') vals = all.filter(x => x !== g);
        else if (op === '>=') vals = all.filter(x => x >= g);
        else if (op === '<=') vals = all.filter(x => x <= g);
        if (vals === null) notes.push(`ground_condition${op}${value} 未识别`);
        else putSet('grounds', restriction.grounds, vals, touched);
        break;
      }
      case name === 'rotation' && op === '==':
        // 赛场回转方向:1=顺时针(中山/京都/阪神/札幌/函馆/福岛/小仓/大井/隆尚),2=逆时针
        putSet('rotations', restriction.rotations, [value], touched);
        break;
      case name === 'weather': {
        // 天气:1晴/2阴/3雨/4雪
        const all: readonly number[] = [1, 2, 3, 4];
        const vals = op === '==' ? [value] : op === '!=' ? all.filter(w => w !== value) : null;
        if (vals === null) notes.push(`weather${op}${value} 未识别`);
        else putSet('weathers', restriction.weathers, vals, touched);
        break;
      }
      case name === 'season': {
        // 季节:1春/2夏/3秋/4冬/5樱花
        const all: readonly number[] = [1, 2, 3, 4, 5];
        const vals = op === '==' ? [value] : op === '!=' ? all.filter(x => x !== value) : null;
        if (vals === null) notes.push(`season${op}${value} 未识别`);
        else putSet('seasons', restriction.seasons, vals, touched);
        break;
      }
      case (name === 'motivation') && ['==', '>=', '>', '<=', '<'].includes(op): {
        // 干劲:1绝不调 2不调 3普通 4好调 5绝好调
        const table: Record<number, string> = { 1: 'worst', 2: 'bad', 3: 'normal', 4: 'good', 5: 'best' };
        const idx = [1, 2, 3, 4, 5];
        let vals: readonly string[] | null = null;
        if (op === '==') vals = table[value] !== undefined ? [table[value]!] : null;
        else if (op === '>=') vals = idx.filter(i => i >= value).map(i => table[i]!);
        else if (op === '>') vals = idx.filter(i => i > value).map(i => table[i]!);
        else if (op === '<=') vals = idx.filter(i => i <= value).map(i => table[i]!);
        else vals = idx.filter(i => i < value).map(i => table[i]!);
        if (vals === null || vals.length === 0) notes.push(`motivation${op}${value} 未识别`);
        else putSet('motivations', restriction.motivations, vals, touched);
        break;
      }
      case name === 'is_abroad' && (op === '==' || op === '!='): {
        // 海外赛场:隆尚/圣安妮塔公园/德尔马
        const flag = value === 1;
        restriction.abroad = op === '==' ? flag : !flag;
        break;
      }
      case name === 'base_speed' || name === 'base_stamina' || name === 'base_power' || name === 'base_guts' || name === 'base_wiz': {
        // 面板属性条件(base_* = 面板值,不含绿技能与干劲)
        const stat = name.slice(5) === 'wiz' ? 'wisdom' : name.slice(5);
        if (op === '>=' || op === '>') restriction.statsAtLeast[stat] = Math.max(restriction.statsAtLeast[stat] ?? -Infinity, value);
        else if (op === '<' || op === '<=') restriction.statsBelow[stat] = Math.min(restriction.statsBelow[stat] ?? Infinity, value);
        else if (op === '==') { restriction.statsAtLeast[stat] = value; restriction.statsBelow[stat] = value + 1; }
        else notes.push(`${name}${op}${value} 未识别`);
        break;
      }
      case name === 'track_id' && op === '==': {
        const v = TRACK_VENUES[value];
        if (v !== undefined) putSet('venues', restriction.venues, [v], touched);
        else notes.push(`track_id=${value} 未知赛场`);
        break;
      }
      case name === 'track_id' && (op === '>=' || op === '<='):
        // 范围需成对合并(如 track_id>=10001&track_id<=10010 = JRA 十场),循环后统一枚举
        if (op === '>=') trackMin = Math.max(trackMin ?? -Infinity, value);
        else trackMax = Math.min(trackMax ?? Infinity, value);
        break;
      case name === 'course_distance' && op === '==':
        putSet('distances', restriction.distances, [value], touched);
        break;
      case name === 'course_distance' && op === '>=':
        restriction.distanceMin = Math.max(restriction.distanceMin ?? -Infinity, value);
        break;
      case name === 'course_distance' && op === '<=':
        restriction.distanceMax = Math.min(restriction.distanceMax ?? Infinity, value);
        break;
      // ---- 发动前提(依赖自身技能发动史 / 持有技能,不参与位置锚定) ----
      case COUNTER_BY_TOKEN[name] !== undefined:
        // activate_count_all/start/middle/later_half/end_after/heal/param_skill、succession_skill_count
        putCounter(prereq, COUNTER_BY_TOKEN[name]!, op, value, notes);
        break;
      case name === 'is_activate_any_skill': {
        // 「发动任意技能」:==1 → 至少 1 个
        const flag = value === 1;
        putCounter(prereq, 'all', op === '!=' ? (flag ? '<=' : '>=') : '>=', flag ? 1 : 0, notes);
        break;
      }
      case name === 'is_activate_heal_skill': {
        // 「发动耐力回复技能」
        const flag = value === 1;
        putCounter(prereq, 'heal', op === '!=' ? (flag ? '<=' : '>=') : '>=', flag ? 1 : 0, notes);
        break;
      }
      case name === 'is_used_skill_id' || name === 'is_used_skill_id_with_detail_one':
        // 「发动技能 X」(按基础 id 匹配,忽略 -b1/-b2)
        if (op === '==') prereq.usedSkillBaseIds.push(String(value));
        else notes.push(`${name}${op}${value} 未识别(前提)`);
        if (name === 'is_used_skill_id_with_detail_one') {
          approx = true;
          notes.push('is_used_skill_id_with_detail_one:仅建模「该技能已发动」,细节条件未建模');
        }
        break;
      case name === 'is_exist_skill_id':
        // 「持有技能 X」(牌组里选了就算满足)
        if (op === '==') prereq.ownedSkillBaseIds.push(String(value));
        else notes.push(`${name}${op}${value} 未识别(前提)`);
        break;
      case name === 'is_activate_other_skill_detail':
        // 「已发动第一段技能」:本技能的 -b2 依赖 -b1 已发动
        if (op === '==' && value === 1) prereq.requiresFirstBlock = true;
        break;
      // ---- 近似/环境 ----
      case APPROX_NAME_RE.test(name):
        approx = true;
        onlyRestrictive = false;
        break;
      case ENV_TOKENS.has(name):
        if (UNDETERMINED_TOKENS.has(name)) {
          undetermined.push(`${name}${op}${value}`);
          notes.push(`${name}${op}${value}(临场条件,赛道/跑法确定不了)`);
        } else {
          notes.push(`${name}${op}${value}(环境前提,视为满足)`);
        }
        break;
      default:
        approx = true;
        onlyRestrictive = false;
        notes.push(`未识别token:${tk.raw}`);
    }
  }

  // 组装条件:锚点 + 阶段/窗口裁剪 + 末脚标记
  // track_id 范围成对合并(>=10001 & <=10010 = JRA 十场)
  if (trackMin !== null || trackMax !== null) {
    const lo = trackMin ?? -Infinity;
    const hi = trackMax ?? Infinity;
    let found = false;
    const inRange: string[] = [];
    for (const [k, v] of Object.entries(TRACK_VENUES)) {
      const n = Number.parseInt(k, 10);
      if (n >= lo && n <= hi) { inRange.push(v); found = true; }
    }
    if (found) putSet('venues', restriction.venues, inRange, touched);
    if (!found) notes.push(`track_id 范围 ${lo}~${hi} 无已知赛场`);
  }
  let condition: Record<string, unknown> | null = null;
  if (anchor !== null) {
    condition = { ...anchor.cond };
    const kind = condition.kind as string;
    // 直线/弯道与坡道条件叠加时,几何交集无法表达,保留区段锚并标近似
    if (slopeSign !== 0 && (kind === 'straightFastest' || kind === 'cornerFastest')) {
      approx = true;
      notes.push('直线/弯道与坡道条件叠加,未取交集(近似)');
    }
    if (kind === 'cornerFastest' || kind === 'straightFastest' || kind === 'uphillFastest' || kind === 'downhillFastest') {
      if (phaseFilter !== null) condition.phaseFilter = phaseFilter;
      else if (phaseRange !== null) condition.withinPct = phaseRange;
    } else if (phaseRange !== null && kind !== 'phase' && kind !== 'lastSpurt' && kind !== 'raceStart') {
      condition.withinPct = phaseRange;
    }
    if (rateLo !== null || rateHi !== null) {
      const lo = Math.max(0, rateLo ?? 0);
      const hi = Math.min(100, rateHi ?? 100);
      if (kind === 'distanceRate') {
        condition.fromPct = Math.round(lo * 100) / 100;
        condition.toPct = Math.round(hi * 100) / 100;
      } else if (lo > 0 || hi < 100) {
        condition.withinPct = [Math.round(lo * 100) / 100, Math.round(hi * 100) / 100];
      }
    }
    if (leftLo !== null || leftHi !== null) {
      const lo = Math.max(0, leftLo ?? 0);
      const hi = leftHi ?? Infinity;
      if (kind === 'distanceLeft') {
        condition.fromMeters = Math.round(lo);
        condition.toMeters = Number.isFinite(hi) ? Math.round(hi) : 10000;
      } else {
        condition.withinLeftM = [Math.round(lo), Number.isFinite(hi) ? Math.round(hi) : 10000];
      }
    }
    if (spurtFlag) {
      if (kind === 'lastSpurt' || kind === 'raceStart') {
        if (kind === 'raceStart') { condition = { kind: 'lastSpurt' }; }
      } else {
        condition.spurt = true;
      }
    }
    if (phaseAfter !== null && kind !== 'phaseAfter' && kind !== 'phase') {
      // phase>=N 与其他锚联用:窗口为该阶段起点到终点
      const p = CODE_PHASE[String(phaseAfter)];
      if (p !== undefined) condition.withinPct = [PHASE_PCT[p][0], 100];
    }
  } else if (spurtFlag) {
    condition = { kind: 'lastSpurt' };
  } else if (onlyRestrictive && tokens.length > 0) {
    // 全部 token 都是装配限制/环境前提(如 track_id==10008、season==4):限制满足即常驻
    condition = { kind: 'raceStart' };
  }

  return { condition, approx, restriction, prereq, notes, undetermined };
}

/** 完整条件字符串(可能含 @ 变体)→ 条件对象 + 并集限制 */
function parseCode(code: string): CodeParse {
  const notes: string[] = [];
  const variants = code.split('@').map(v => v.trim()).filter(Boolean);
  const parsed = (variants.length > 0 ? variants : ['']).map(v => parseVariant(tokenize(v), notes));
  const first = parsed[0]!;
  let approx = parsed.some(p => p.approx);
  const firstKind = first.condition?.kind;
  for (const pv of parsed.slice(1)) {
    if (pv.condition?.kind !== firstKind) {
      approx = true;
      notes.push(`变体锚点不同(${String(firstKind)} / ${String(pv.condition?.kind)}),取首个变体`);
    }
  }
  if (parsed.length > 1) approx = true;
  // 临场条件按变体取并集(任一支需要 → 整体不能保证 100% 发动)
  const undetermined = [...new Set(parsed.flatMap(p => p.undetermined))];
  return {
    condition: first.condition, approx, clauses: parsed.map(p => p.restriction),
    prereqs: parsed.map(p => p.prereq), notes, undetermined,
  };
}

/** 触发代码效果槽(ability_type_s_e)→ 效果列表 */
const CODE_EFFECT_TYPE: Record<string, string> = { '27': 'targetSpeed', '21': 'targetSpeed', '31': 'acceleration', '22': 'currentSpeed', '9': 'heal' };
const CODE_PASSIVE_STAT: Record<string, string> = { '1': 'speed', '2': 'stamina', '3': 'power', '4': 'guts', '5': 'wisdom' };

function effectsFromLua(lua: Record<string, string>, slot: 1 | 2): { effects: OutEffect[]; hasUnsupported: boolean; allPassive: boolean } {
  const effects: OutEffect[] = [];
  let hasUnsupported = false;
  let allPassive = true;
  for (const e of [1, 2, 3] as const) {
    const type = lua[`ability_type_${slot}_${e}`];
    if (type === undefined || type === '' || type === '0') continue;
    const rawValue = Number.parseFloat(lua[`float_ability_value_${slot}_${e}`] ?? '0');
    const target = lua[`target_type_${slot}_${e}`] ?? '1';
    const value = Math.round((rawValue / 10000) * 10000) / 10000;
    if (target !== '1') {
      hasUnsupported = true;
      allPassive = false;
      effects.push({ type: 'unsupported', label: `妨害/他人(目标${target})`, value });
      continue;
    }
    const t = CODE_EFFECT_TYPE[type];
    if (t !== undefined) {
      allPassive = false;
      effects.push({ type: t, value });
    } else {
      const stat = CODE_PASSIVE_STAT[type];
      if (stat !== undefined) {
        effects.push({ type: 'passive', stat, value });
      } else {
        hasUnsupported = true;
        allPassive = false;
        effects.push({ type: 'unsupported', label: `效果类型${type}`, value });
      }
    }
  }
  return { effects, hasUnsupported, allPassive };
}

/** 触发代码路径的输出元数据(本体走速查表,继承技走名称映射) */
interface LuaSkillMeta {
  readonly id: string;
  readonly name: string;
  readonly nameJa?: string;
  readonly nameTrad?: string;
  readonly cnReleased?: boolean;
  readonly rarity: string;
  readonly wisdomScaled: boolean;
  readonly source: string;
  readonly textRestrictionObj?: Record<string, unknown>;
  readonly restrictionText?: string;
}
/** 解包数据单分支 → OutSkill(本体与继承技共用;review/info 由调用方落盘) */
function skillFromLuaBranch(
  lua: Record<string, string>,
  slot: 1 | 2,
  meta: LuaSkillMeta,
): { skill: OutSkill; reasons: string[]; info: string[] } {
  const reasons: string[] = [];
  const info: string[] = [];
  const codeRaw = lua[`condition_${slot}`] ?? '';
  const cp = parseCode(codeRaw);
  for (const n of cp.notes) {
    (n.startsWith('未识别token') || n.includes('未知赛场') || n.includes('无已知赛场') ? reasons : info).push(n);
  }
  // 前置条件:限制并入,近似/未知 token 标记
  const pre = lua[`precondition_${slot}`] ?? '';
  // 触发代码含 *_random(corner/phase/straight/slope 随机)→ 发动位置在区段内随机
  const randomPosition = /_random/.test(`${codeRaw} ${pre}`);
  let clauses = cp.clauses;
  let prereqs = cp.prereqs;
  if (pre !== '') {
    const pp = parseCode(pre);
    // 前置条件与发动条件为「与」:两边的每个变体交叉合并
    const crossed: CodeRestriction[] = [];
    for (const a of clauses) {
      for (const b of pp.clauses) {
        const m = cloneRestriction(a);
        andRestriction(m, b);
        crossed.push(m);
      }
    }
    clauses = crossed;
    prereqs = crossPrereq(prereqs, pp.prereqs);
    if (pp.approx) cp.approx = true;
    info.push(`前置条件:${pre}`);
  }

  const { effects, hasUnsupported, allPassive } = effectsFromLua(lua, slot);
  if (effects.length === 0) reasons.push('无效果');
  const rawDur = Number.parseFloat(lua[`float_ability_time_${slot}`] ?? '0');
  const durationSec = allPassive || rawDur <= 0 ? null : Math.round((rawDur / 10000) * 1000) / 1000;
  // heal/即时速度 为瞬时(时长 0)属正常;速度/加速度无持续才是问题
  if (!allPassive && rawDur <= 0 && effects.some(e => e.type === 'targetSpeed' || e.type === 'acceleration' || e.type === 'lastSpurtExtension')) {
    reasons.push('速度/加速度类效果持续时间为 0');
  }
  const rawCd = Number.parseFloat(lua[`float_cooldown_${slot}`] ?? lua[`float_cooldown_time_${slot}`] ?? '0');
  const cdSec = Math.round((rawCd / 10000) * 10) / 10;
  // 500s = 一次性(一场比赛最长不超过 ~4 分钟);仅短冷却(如 弧线大师 30s)允许同场再次发动
  const cooldownSec = cdSec > 0 && cdSec < 400 ? cdSec : null;
  if (lua[`ability_time_usage_${slot}`] !== undefined && lua[`ability_time_usage_${slot}`] !== '1') {
    reasons.push(`ability_time_usage=${lua[`ability_time_usage_${slot}`]}`);
  }

  let restrictionObj = restrictionObjOf(clauses, meta.textRestrictionObj);
  const prereqObjOut = prereqObjOf(prereqs);

  // 绿技能(常时被动)带临场条件(枠番/人气/抽选/赛事等级/比赛时段)→ 不能保证 100% 发动,
  // 默认不计收益:写进 restriction.undetermined,引擎视为不满足(不进起跑属性、收益 0)。
  // 非被动技能不加(它们按规则取位发动,本身已标 approx),避免把整类技能一次性判死。
  const undetermined = allPassive ? cp.undetermined : [];
  if (undetermined.length > 0) {
    restrictionObj = { ...(restrictionObj ?? {}), undetermined };
    info.push(`临场条件 ${undetermined.join('&')}:绿技能默认不计收益(赛道/跑法确定不了)`);
  }

  let precision: OutSkill['precision'];
  if (hasUnsupported || cp.condition === null || effects.length === 0) {
    precision = 'unsupported';
    if (cp.condition === null) reasons.push(`无可解析发动位置(${lua[`condition_${slot}`] ?? ''})`);
  } else if (allPassive) {
    // 常时被动(绿技能):并入起跑属性,引擎 effstats passiveBonusOf 支持 → 精确
    if (prereqObjOut !== undefined) {
      // 依赖「已发动 N 个技能」的绿技能:加成本身要在比赛中段才成立,
      // 起跑属性折算无法表达(且会凭空常驻),按不支持处理,不计入面板
      precision = 'unsupported';
      reasons.push('常时被动但依赖发动次数前提(起跑属性无法折算)');
    } else if (cp.condition.kind === 'raceStart') {
      precision = 'precise';
    } else {
      precision = 'unsupported';
      reasons.push('条件型被动(非常时)暂不支持');
    }
  } else {
    precision = cp.approx ? 'approx' : 'precise';
  }

  // 前提型技能若没有位置锚点(condition 落到 raceStart),按前提的统计范围重建可发动区间,
  // 否则只会在起跑帧判定一次、永远不满足前提而永不发动。
  let conditionOut = cp.condition ?? { kind: 'raceStart' };
  if (prereqObjOut !== undefined && !allPassive && conditionOut.kind === 'raceStart') {
    conditionOut = conditionFromPrereq(prereqs[0] ?? emptyPrereq());
    info.push(`前提型技能无位置锚点,按前提范围发动:${JSON.stringify(conditionOut)}`);
  }

  const skill: OutSkill = {
    id: meta.id,
    name: meta.name,
    nameJa: meta.nameJa,
    nameTrad: meta.nameTrad,
    cnReleased: meta.cnReleased,
    rarity: meta.rarity,
    precision,
    effects,
    durationSec,
    ...(cooldownSec !== null ? { cooldownSec } : {}),
    condition: conditionOut,
    restriction: restrictionObj,
    ...(prereqObjOut !== undefined ? { prereq: prereqObjOut } : {}),
    restrictionText: meta.restrictionText,
    wisdomScaled: meta.wisdomScaled,
    ...(randomPosition ? { randomPosition: true } : {}),
    source: meta.source,
    fetchedAt: raw.fetchedAt.slice(0, 10),
  };
  return { skill, reasons, info };
}

// =====================================================================
// 文本兜底解析(原规则)
// =====================================================================

// ---------- 效果解析 ----------
const STAT_MAP: Record<string, string> = { 速度: 'speed', 耐力: 'stamina', 力量: 'power', 毅力: 'guts', 智力: 'wisdom' };
const TYPE_MAP: Record<string, string> = { 速度: 'targetSpeed', 即时速度: 'currentSpeed', 加速度: 'acceleration', 耐力恢复: 'heal' };

function parseTypeToken(tok: string): OutEffect | null {
  const t = tok.trim();
  if (TYPE_MAP[t] !== undefined) return { type: TYPE_MAP[t]! };
  const pm = t.match(/^被动[（(](.+)[)）]$/);
  if (pm) {
    const stat = STAT_MAP[pm[1]!.trim()];
    if (stat) return { type: 'passive', stat };
  }
  if (/妨害|视野|横向速度/.test(t)) return { type: 'unsupported', label: t };
  return null;
}

function parseNumbers(s: string): number[] {
  return s.split('、').map(t => {
    const cleaned = t.replace(/[(（][*＊※][)）]/g, '').replace(/[*＊※]/g, '').replace(/[％%]/g, '').trim();
    return Number.parseFloat(cleaned);
  });
}

// ---------- 持续时间 ----------
function parseDuration(s: string, reasons: string[]): number | null {
  const t = s.trim();
  if (t === '' || t === '瞬时') return null;
  if (t === '始终') return 600;
  if (/^\d+(\.\d+)?$/.test(t)) return Number.parseFloat(t);
  reasons.push(`持续时间无法解析:${t}`);
  return null;
}

// ---------- 触发条件解析 ----------
const ANCHORS: Array<{ re: RegExp; kind: string; approxHint?: boolean }> = [
  { re: /最终第?三弯道/, kind: 'thirdCornerFromEnd' },
  { re: /最终直线/, kind: 'finalStraight' },
  { re: /最终弯道及(往后|以后)/, kind: 'finalCornerOnward' },
  { re: /最终弯道后半/, kind: 'finalCorner', approxHint: true },
  { re: /最终弯道/, kind: 'finalCorner' },
  { re: /终盘直线/, kind: 'lateStraight' },
  { re: /终盘弯道/, kind: 'lateCorner' },
  { re: /中盘弯道/, kind: 'midCorner' },
  { re: /第(\d+)个?弯道/, kind: 'cornerN' },
  { re: /上坡/, kind: 'uphillFastest' },
  { re: /下坡/, kind: 'downhillFastest' },
  { re: /弯道/, kind: 'cornerFastest' },
  { re: /直线/, kind: 'straightFastest' },
  { re: /最后冲刺|最终冲刺/, kind: 'lastSpurt', approxHint: true },
  { re: /最终盘/, kind: 'phase3' },
  { re: /终盘前半|终盘后半|终盘四分之三|终盘前四分之一|终盘中后|终盘前八分之一/, kind: 'phase2', approxHint: true },
  { re: /终盘/, kind: 'phase2' },
  { re: /中盘后半|中盘前半/, kind: 'phase1', approxHint: true },
  { re: /中盘/, kind: 'phase1' },
  { re: /序盘/, kind: 'phase0' },
];
const PHASE_OF = { phase0: 0, phase1: 1, phase2: 2, phase3: 3 } as const;
const SEGMENT_KINDS = new Set(['cornerFastest', 'straightFastest', 'uphillFastest', 'downhillFastest']);
const APPROX_RE = /名次|超过|紧跟|贴[近着]|距离前|距离后|内道|外道|侧面阻挡|包围|随机|队伍位置|最大冲刺|冲刺状态|比拼|对手|马身|体力[≥<＝=]|发动技能|发动第一段|焦躁|仕掛|先后|保持|数量|人气|力量数值|智力数值/;
const CONTEXT_RE = /逃马|大逃|先行|差行|差马|追马|短距离|英里|中距离|长距离|泥地|草地|比赛距离=\d+|[场競马場]|春天|夏天|秋天|冬天|良场|重马场|不良马场|稍重|马场状态/;

interface CondParse {
  condition: Record<string, unknown> | null;
  approx: boolean;
  restrictions: string[];
  unresolved: string[];
}

function parseCondition(text: string, fallbackFilter: string): CondParse {
  const reasons: string[] = [];
  const restrictions: string[] = [];
  let approx = false;
  let anchor: { kind: string; n?: number; approxHint?: boolean } | null = null;
  let phaseWord: number | null = null;
  let remainLo: number | null = null;
  let remainHi: number | null = null;

  const segments = text
    .split(/[，,。;；、]/)
    .map(s => s.replace(/^(前置条件|触发条件|条件)\s*[:：]\s*/, '').trim())
    .filter(Boolean);
  for (const seg of segments) {
    if (seg === '') continue;
    if (CONTEXT_RE.test(seg)) { restrictions.push(seg); continue; }
    // 距离/时间类数值条件
    let m = seg.match(/行进距离[≥>]=?\s*(\d+(?:\.\d+)?)\s*[％%]/);
    if (m) {
      if (anchor === null || anchor.kind === 'raceStart') anchor = { kind: 'positionPct', n: undefined };
      (anchor as Record<string, unknown>).pct = Number.parseFloat(m[1]!);
      continue;
    }
    m = seg.match(/(\d+)\s*%\s*≤\s*行进距离\s*≤\s*(\d+)\s*%/);
    if (m) {
      anchor = { kind: 'positionPct' };
      (anchor as Record<string, unknown>).pct = (Number.parseFloat(m[1]!) + Number.parseFloat(m[2]!)) / 2;
      approx = true;
      continue;
    }
    m = seg.match(/(\d+)\s*m?\s*≤\s*剩余距离\s*≤\s*(\d+)\s*m?/) ?? seg.match(/剩余距离[≥>]=?\s*(\d+)\s*m/);
    if (m === null) m = seg.match(/剩余距离[≤<]=?\s*(\d+)\s*m/);
    if (m !== null && m.length >= 2) {
      if (m.length >= 3 && m[2] !== undefined && m[1] !== undefined && /≤\s*剩余距离/.test(seg)) {
        remainLo = Number.parseFloat(m[1]!);
        remainHi = Number.parseFloat(m[2]!);
      } else {
        const v = Number.parseFloat((m[1] ?? m[2])!);
        if (/剩余距离[≤<]/.test(seg) && !/≤\s*剩余距离/.test(seg)) remainHi = v;
        else remainLo = v;
      }
      continue;
    }
    m = seg.match(/行进距离[≥>]=?\s*(\d+)\s*m/);
    if (m) {
      if (anchor === null || anchor.kind === 'raceStart') anchor = { kind: 'distanceRun' };
      (anchor as Record<string, unknown>).meters = Number.parseFloat(m[1]!);
      (anchor as Record<string, unknown>).base = 'start';
      continue;
    }
    m = seg.match(/(?:赛事|比赛)?进行时间[≥>]=?\s*(\d+(?:\.\d+)?)/);
    if (m) {
      approx = true;
      if (anchor === null || anchor.kind === 'raceStart') anchor = { kind: 'elapsedSec' };
      (anchor as Record<string, unknown>).seconds = Number.parseFloat(m[1]!);
      (anchor as Record<string, unknown>).base = 'start';
      continue;
    }
    // 锚点(表按特异性从高到低,命中即可能覆盖之前的宽泛锚点)
    let matched = false;
    for (let i = 0; i < ANCHORS.length; i++) {
      const a = ANCHORS[i]!;
      const am = seg.match(a.re);
      if (am) {
        const curIdx = anchor ? ANCHORS.findIndex(x => x.kind === anchor!.kind) : -1;
        if (curIdx === -1 || i < curIdx) {
          const nm = a.kind === 'cornerN' ? am[1] : undefined;
          anchor = { kind: a.kind, n: nm !== undefined ? Number.parseInt(nm, 10) : undefined, approxHint: a.approxHint };
        }
        if (a.approxHint) approx = true;
        matched = true;
        break;
      }
    }
    if (matched) {
      const pm = seg.match(/序盘|中盘|终盘|最终盘/);
      if (pm) {
        phaseWord = pm[0] === '序盘' ? 0 : pm[0] === '中盘' ? 1 : pm[0] === '终盘' ? 2 : 3;
      }
      continue;
    }
    if (APPROX_RE.test(seg)) { approx = true; reasons.push(seg); continue; }
    reasons.push(seg);
  }

  // 剩余距离范围(两点夹逼取中点;单侧上限取该点)
  if (remainLo !== null || remainHi !== null) {
    const mid = remainLo !== null && remainHi !== null ? (remainLo + remainHi) / 2 : (remainHi ?? remainLo)!;
    anchor = { kind: 'distanceLeft' };
    (anchor as Record<string, unknown>).meters = Math.round(mid);
    approx = true;
  }

  // 阶段语境兜底:锚点分句本身不含阶段词时,从全文推断
  // 「最后冲刺/最终冲刺」= 末脚(动态起点,体力预算解算);「最终盘」= 固定 5/6;其余为固定阶段
  let spurtContext = false;
  if (anchor !== null && phaseWord === null && SEGMENT_KINDS.has(anchor.kind)) {
    if (/最后冲刺|最终冲刺/.test(text)) spurtContext = true;
    else if (/最终盘/.test(text)) phaseWord = 3;
    else if (/终盘/.test(text)) phaseWord = 2;
    else if (/中盘/.test(text)) phaseWord = 1;
    else if (/序盘/.test(text)) phaseWord = 0;
  }

  // 无条件类:必定触发/常时 → 起步时(不标近似)
  if (anchor === null && /必定触发|无特殊条件|常时|无条件/.test(text)) {
    return { condition: { kind: 'raceStart' }, approx, restrictions, unresolved: reasons };
  }

  // 主条件没解析出锚点时,用速查筛选字段兜底
  if (anchor === null && fallbackFilter !== '') {
    const fb = parseCondition(fallbackFilter, '');
    if (fb.condition !== null) {
      return { condition: fb.condition, approx: true, restrictions, unresolved: reasons };
    }
  }

  if (anchor === null) {
    return { condition: null, approx, restrictions, unresolved: reasons };
  }

  const kind = anchor.kind;
  let condition: Record<string, unknown>;
  if (kind.startsWith('phase')) {
    condition = { kind: 'phase', phase: PHASE_OF[kind as keyof typeof PHASE_OF] };
  } else if (kind === 'cornerN') {
    condition = { kind: 'cornerN', n: anchor.n ?? 1 };
  } else if (kind === 'positionPct') {
    condition = { kind: 'positionPct', pct: (anchor as unknown as { pct?: number }).pct ?? 50 };
  } else if (kind === 'elapsedSec') {
    condition = { kind: 'elapsedSec', seconds: (anchor as unknown as { seconds?: number }).seconds ?? 5, base: 'start' };
  } else if (kind === 'distanceRun') {
    condition = { kind: 'distanceRun', meters: (anchor as unknown as { meters?: number }).meters ?? 100, base: 'start' };
  } else if (kind === 'distanceLeft') {
    condition = { kind: 'distanceLeft', fromMeters: (anchor as unknown as { meters?: number }).meters ?? 200, toMeters: (anchor as unknown as { meters?: number }).meters ?? 200 };
  } else {
    condition = SEGMENT_KINDS.has(kind)
      ? spurtContext
        ? { kind, spurt: true }
        : { kind, ...(phaseWord !== null ? { phaseFilter: phaseWord } : {}) }
      : { kind };
  }
  return { condition, approx: approx || (anchor.approxHint === true), restrictions, unresolved: reasons };
}

// ---------- 限制(脚质/场地/赛场)结构化 ----------
const TACTIC_MAP: Record<string, string> = { 逃马: 'nige', 大逃: 'nige', 先行: 'senko', 差行: 'sashi', 差马: 'sashi', 追马: 'oikomi' };
const DISTTYPE_MAP: Record<string, string> = { 短距离: 'short', 英里: 'mile', 中距离: 'mid', 长距离: 'long' };
const VENUE_LIST = ['东京', '中山', '京都', '阪神', '札幌', '函馆', '新潟', '福岛', '中京', '小仓', '大井', '川崎', '船桥', '盛冈', '隆尚', '圣安妮塔公园', '德尔马'];

function buildRestriction(rawTexts: readonly string[]): Record<string, unknown> | undefined {
  const tactics = new Set<string>();
  const dts = new Set<string>();
  const surfaces = new Set<string>();
  const venues = new Set<string>();
  const grounds = new Set<number>();
  const distances = new Set<number>();
  let distanceMin: number | undefined;
  let distanceMax: number | undefined;
  for (const s of rawTexts) {
    if (!s.includes('数量')) {
      // 「追马数量≥1」这类说的是场上其他马,不是自身脚质限制
      for (const [k, v] of Object.entries(TACTIC_MAP)) if (s.includes(k)) tactics.add(v);
    }
    for (const [k, v] of Object.entries(DISTTYPE_MAP)) if (s.includes(k)) dts.add(v);
    if (s.includes('泥地')) surfaces.add('dirt');
    if (s.includes('草地')) surfaces.add('turf');
    for (const v of VENUE_LIST) if (s.includes(v)) venues.add(v);
    const dm = s.match(/比赛距离[=＝](\d+)\s*m?/);
    if (dm !== null) distances.add(Number.parseInt(dm[1]!, 10));
    const dmin = s.match(/比赛距离[≥>]=?\s*(\d+)\s*m/);
    if (dmin !== null) distanceMin = Number.parseInt(dmin[1]!, 10);
    const dmax = s.match(/比赛距离[≤<]=?\s*(\d+)\s*m/);
    if (dmax !== null) distanceMax = Number.parseInt(dmax[1]!, 10);
    // 注意:文本里「1600m≤比赛距离≤2000m」的左界也是 比赛距离≥ 形式,上面两条正则可各取一边
    if (/重马场或不良/.test(s)) { grounds.add(2); grounds.add(3); }
    else if (s.includes('不良马场')) grounds.add(3);
    else if (s.includes('稍重')) grounds.add(2);
    else if (s.includes('重马场')) grounds.add(2);
    else if (s.includes('良场')) grounds.add(0);
  }
  if (tactics.size + dts.size + surfaces.size + venues.size + grounds.size + distances.size === 0 && distanceMin === undefined && distanceMax === undefined) return undefined;
  const out: Record<string, unknown> = {};
  if (tactics.size > 0) out.tactics = [...tactics];
  if (dts.size > 0) out.distanceTypes = [...dts];
  if (surfaces.size > 0) out.surfaces = [...surfaces];
  if (venues.size > 0) out.venues = [...venues];
  if (grounds.size > 0) out.grounds = [...grounds].sort();
  if (distances.size > 0) out.distances = [...distances];
  if (distanceMin !== undefined) out.distanceMin = distanceMin;
  if (distanceMax !== undefined) out.distanceMax = distanceMax;
  return out;
}

/** 深拷贝一条子句(后续与前置条件/文本限制合并时不污染原对象) */
function cloneRestriction(c: CodeRestriction): CodeRestriction {
  return {
    tactics: new Set(c.tactics), distanceTypes: new Set(c.distanceTypes), surfaces: new Set(c.surfaces),
    venues: new Set(c.venues), grounds: new Set(c.grounds), distances: new Set(c.distances),
    rotations: new Set(c.rotations), weathers: new Set(c.weathers), seasons: new Set(c.seasons),
    motivations: new Set(c.motivations), statsAtLeast: { ...c.statsAtLeast }, statsBelow: { ...c.statsBelow },
    ...(c.abroad !== undefined ? { abroad: c.abroad } : {}),
    ...(c.basisDistance !== undefined ? { basisDistance: c.basisDistance } : {}),
    ...(c.distanceMin !== undefined ? { distanceMin: c.distanceMin } : {}),
    ...(c.distanceMax !== undefined ? { distanceMax: c.distanceMax } : {}),
  };
}

/**
 * 把文本侧限制补进子句:**只填空缺字段**(触发代码为准,文本只补代码没写的)。
 * 早期实现是并集,会把「代码限先行、文本写先行/差行」放大成两者皆可 —— 与触发代码冲突,已改。
 */
function fillTextInto(c: CodeRestriction, textObj: Record<string, unknown>): void {
  const fill = <T>(set: Set<T>, values: readonly T[] | undefined): void => {
    if (set.size > 0) return;
    for (const v of values ?? []) set.add(v);
  };
  fill(c.tactics, textObj.tactics as string[] | undefined);
  fill(c.distanceTypes, textObj.distanceTypes as string[] | undefined);
  fill(c.surfaces, textObj.surfaces as string[] | undefined);
  fill(c.venues, textObj.venues as string[] | undefined);
  fill(c.grounds, textObj.grounds as number[] | undefined);
  fill(c.distances, textObj.distances as number[] | undefined);
  if (c.distanceMin === undefined) c.distanceMin = textObj.distanceMin as number | undefined;
  if (c.distanceMax === undefined) c.distanceMax = textObj.distanceMax as number | undefined;
}

/** 排序用字典序(按游戏内枚举顺序,便于与历史数据/测试断言保持一致) */
const VALUE_ORDER: Record<string, readonly string[]> = {
  tactics: ['nige', 'senko', 'sashi', 'oikomi'],
  distanceTypes: ['short', 'mile', 'mid', 'long'],
  surfaces: ['turf', 'dirt'],
  motivations: ['worst', 'bad', 'normal', 'good', 'best'],
};

/** 字段值排序:数字按大小,枚举按游戏顺序,其余按字典序 */
function sortVals<T>(vals: readonly T[], field?: string): T[] {
  const order = field !== undefined ? VALUE_ORDER[field] : undefined;
  return [...vals].sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (order !== undefined) {
      const ia = order.indexOf(String(a));
      const ib = order.indexOf(String(b));
      if (ia >= 0 && ib >= 0) return ia - ib;
    }
    return String(a).localeCompare(String(b));
  });
}

/** 枚举字段的「全集」:写满等于没限制,直接省略(化简后常见,如 motivation==5@motivation<=4) */
const FULL_SETS: Record<string, readonly unknown[]> = {
  distanceTypes: ['short', 'mile', 'mid', 'long'],
  surfaces: ['turf', 'dirt'],
  grounds: [0, 1, 2, 3],
  weathers: [1, 2, 3, 4],
  seasons: [1, 2, 3, 4, 5],
  motivations: ['worst', 'bad', 'normal', 'good', 'best'],
};
function isFullSet(field: string, values: readonly unknown[]): boolean {
  const full = FULL_SETS[field];
  return full !== undefined && values.length >= full.length && full.every(v => values.includes(v));
}

/** 单条子句 → 输出对象(字段顺序固定,便于去重) */
function clauseObj(c: CodeRestriction): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (c.tactics.size > 0) out.tactics = sortVals([...c.tactics], 'tactics');
  if (c.distanceTypes.size > 0 && !isFullSet('distanceTypes', [...c.distanceTypes])) out.distanceTypes = sortVals([...c.distanceTypes], 'distanceTypes');
  if (c.surfaces.size > 0 && !isFullSet('surfaces', [...c.surfaces])) out.surfaces = sortVals([...c.surfaces], 'surfaces');
  if (c.venues.size > 0) out.venues = sortVals([...c.venues], 'venues');
  if (c.grounds.size > 0 && !isFullSet('grounds', [...c.grounds])) out.grounds = sortVals([...c.grounds], 'grounds');
  if (c.distances.size > 0) out.distances = sortVals([...c.distances], 'distances');
  if (c.rotations.size > 0) out.rotations = sortVals([...c.rotations], 'rotations');
  if (c.weathers.size > 0 && !isFullSet('weathers', [...c.weathers])) out.weathers = sortVals([...c.weathers], 'weathers');
  if (c.seasons.size > 0 && !isFullSet('seasons', [...c.seasons])) out.seasons = sortVals([...c.seasons], 'seasons');
  if (c.motivations.size > 0 && !isFullSet('motivations', [...c.motivations])) out.motivations = sortVals([...c.motivations], 'motivations');
  if (c.abroad !== undefined) out.abroad = c.abroad;
  if (c.basisDistance !== undefined) out.basisDistance = c.basisDistance;
  if (Object.keys(c.statsAtLeast).length > 0) out.statsAtLeast = { ...c.statsAtLeast };
  if (Object.keys(c.statsBelow).length > 0) out.statsBelow = { ...c.statsBelow };
  if (c.distanceMin !== undefined) out.distanceMin = c.distanceMin;
  if (c.distanceMax !== undefined) out.distanceMax = c.distanceMax;
  return out;
}

/**
 * 多子句 → restriction 对象。
 * 触发代码的分支之间是「或」:任一支无限制 ⇒ 整体恒真(不写 restriction);
 * 单支 ⇒ 扁平字段(与历史数据格式一致);多支 ⇒ `{ anyOf: [...] }`。
 */
function restrictionObjOf(clauses: readonly CodeRestriction[], textObj: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const objs: Record<string, unknown>[] = [];
  for (const c0 of clauses) {
    const c = cloneRestriction(c0);
    if (textObj !== undefined) fillTextInto(c, textObj);
    if (restrictionIsEmpty(c)) return undefined;
    objs.push(clauseObj(c));
  }
  const uniq = dropDominated(simplifyClauseObjs([...new Map(objs.map(o => [JSON.stringify(o), o])).values()]));
  if (uniq.length === 0) return undefined;
  return uniq.length === 1 ? uniq[0] : { anyOf: uniq };
}

/**
 * 去掉被支配的子句:甲字段是乙字段的子集(值相同)⇒ 甲更宽松,OR 后乙无意义。
 * 例:{干劲:好调} 与 {} 并存 ⇒ 后者恒真,前者失效,只留 {}。
 */
function dropDominated(objs: Record<string, unknown>[]): Record<string, unknown>[] {
  if (objs.length < 2) return objs;
  const subsumes = (loose: Record<string, unknown>, strict: Record<string, unknown>): boolean => {
    const lk = Object.keys(loose);
    if (lk.length >= Object.keys(strict).length) return false;
    return lk.every(k => JSON.stringify(loose[k]) === JSON.stringify(strict[k]));
  };
  return objs.filter(o => !objs.some(other => other !== o && subsumes(o, other)));
}

/**
 * 子句化简:(A∧X)∨(A∧Y) ≡ A∧(X∨Y)。
 * 若所有子句除某个字段外完全一致,就把该字段并成一条 —— 这样「先行 or 差行」这类
 * 单字段分支仍是扁平结构(与历史数据一致),只有真正异构的分支才落到 anyOf。
 */
function simplifyClauseObjs(objs: Record<string, unknown>[]): Record<string, unknown>[] {
  const ARRAY_FIELDS = [
    'tactics', 'distanceTypes', 'surfaces', 'venues', 'grounds', 'distances',
    'rotations', 'weathers', 'seasons', 'motivations',
  ];
  let cur = objs;
  let changed = true;
  while (changed && cur.length > 1) {
    changed = false;
    for (const f of ARRAY_FIELDS) {
      if (!cur.every(o => Array.isArray(o[f]))) continue;
      const sigs = new Set(cur.map(o => JSON.stringify({ ...o, [f]: null })));
      if (sigs.size !== 1) continue;
      const merged = sortVals([...new Set(cur.flatMap(o => o[f] as unknown[]))], f);
      const base = { ...cur[0]!, [f]: merged };
      cur = [base];
      changed = true;
      break;
    }
  }
  return cur;
}

// =====================================================================
// 主流程
// =====================================================================
const stats = { raw: 0, excludedEvolution: 0, out: 0, precise: 0, approx: 0, unsupported: 0, branchEntries: 0, codeParsed: 0, textFallback: 0, heirEntries: 0, evolutionEntries: 0 };
const out: OutSkill[] = [];
/** 信息性备注(环境前提/前置条件原文等),单独存放不进复核清单 */
const infoNotes: Array<{ id: string; page: string; reasons: string[] }> = [];
/** 本体技能名称(供继承技派生命名) */
const baseInfo = new Map<string, { name: string; nameJa: string; nameTrad: string }>();

// 按 ID 去重(速查表每技能一行)
const rowsById = new Map<string, RawEntry>();
for (const e of raw.results) {
  const id = prop(e, 'ID') || e.page;
  if (!rowsById.has(id)) rowsById.set(id, e);
}

for (const [id, e] of rowsById) {
  stats.raw++;
  const rarityCn = prop(e, '稀有度');
  // 进化技能:速查表行 ID 与「模块:技能数据库内容2」(1M+ 段)对齐的走触发代码路径;
  // 无解包数据的(剧本技能等)维持排除
  const isEvolution = rarityCn === '进化';
  if (isEvolution && !lua2ById.has(id)) { stats.excludedEvolution++; continue; }

  const rarity = isEvolution ? 'evolved' : rarityCn === '普通' ? 'normal' : rarityCn === '传说' ? 'rareEvolved' : 'unique5';
  const nameJa = prop(e, '技能名') || e.page;
  // 名称优先级:国服官方译名(简中技能速查表)> wiki 中文名(社区译名)> 日文原名
  const official = cnNames.map[id];
  const baseName = official || cleanName(prop(e, '中文名')) || nameJa;
  const tradRaw = cleanName(prop(e, '繁译名'));
  const tradName = /^(（?\(?未[实實]裝\)?）?)$/.test(tradRaw) || tradRaw === '' ? '' : tradRaw;
  baseInfo.set(id, { name: baseName, nameJa, nameTrad: tradName || nameJa });
  const restrictionBase = prop(e, '条件限制');
  const filterHint = prop(e, '速查筛选');
  const condText = prop(e, '触发条件');
  /** 文本侧限制(条件限制 + 全文中场地/脚质语境) */
  const textRestrictionObj = buildRestriction([
    ...[restrictionBase !== '' && restrictionBase !== '通用' ? restrictionBase : ''],
    ...splitBranches(condText).filter(p => CONTEXT_RE.test(p.text)).map(p => p.text),
  ]);

  const lua = luaById.get(id) ?? (isEvolution ? lua2ById.get(id) : undefined);
  if (lua !== undefined) {
    // ---- 触发代码路径 ----
    stats.codeParsed++;
    const branchCodes: Array<{ slot: 1 | 2; code: string }> = [];
    if (lua.condition_1 !== '') branchCodes.push({ slot: 1, code: lua.condition_1 });
    if (lua.condition_2 !== '') branchCodes.push({ slot: 2, code: lua.condition_2 });
    const multiB = branchCodes.length > 1;

    branchCodes.forEach((b, bi) => {
      const suffix = multiB ? `-b${bi + 1}` : '';
      if (multiB) stats.branchEntries++;
      if (isEvolution) stats.evolutionEntries++;
      const { skill, reasons, info } = skillFromLuaBranch(lua, b.slot, {
        id: id + suffix,
        name: multiB ? `${baseName}(${bi + 1})` : baseName,
        nameJa,
        nameTrad: tradName !== '' ? tradName : undefined,
        cnReleased: official !== undefined ? true : undefined,
        rarity,
        wisdomScaled: rarity !== 'normal',
        source: isEvolution
          ? 'BWIKI 速查表 + 触发代码(模块:技能数据库内容2)'
          : 'BWIKI 速查表 + 触发代码(模块:技能数据库内容)',
        textRestrictionObj,
        restrictionText: restrictionBase !== '' && restrictionBase !== '通用' ? restrictionBase : undefined,
      });
      if (reasons.length > 0) review.push({ id: skill.id, page: e.page, reasons: [...reasons, ...info] });
      else if (info.length > 0) infoNotes.push({ id: skill.id, page: e.page, reasons: info });
      out.push(skill);
      stats[skill.precision]++;
    });
    continue;
  }

  // ---- 文本兜底路径(Lua 未收录的技能) ----
  stats.textFallback++;
  const typeParts = splitBranches(prop(e, '技能类型')).filter(p => p.label !== null && !p.premise);
  const labels = typeParts.map(p => p.label!);
  const multi = labels.length > 1;
  const typeFields = fieldByBranch(prop(e, '技能类型'), labels.length ? labels : [null]);
  const valueFields = fieldByBranch(prop(e, '技能数值'), labels.length ? labels : [null]);
  const durFields = fieldByBranch(prop(e, '持续时间'), labels.length ? labels : [null]);
  const condParts = splitBranches(condText);
  const condByLabel = new Map(condParts.filter(p => p.label !== null).map(p => [p.label!, p]));
  const condPlain = condParts.filter(p => p.label === null && !p.premise).map(p => p.text).join(',');
  const condPremise = condParts.filter(p => p.premise).map(p => p.text).join(',');

  const nBranches = multi ? labels.length : 1;
  for (let b = 0; b < nBranches; b++) {
    const reasons: string[] = [];
    const label = multi ? labels[b]! : null;
    const suffix = multi ? `-b${b + 1}` : '';
    if (multi) stats.branchEntries++;

    // 效果
    const typesRaw = (typeFields[b] ?? '').split('、').map(t => t.trim()).filter(Boolean);
    const values = parseNumbers(valueFields[b] ?? '');
    if (/\.\d\s*[:：]/.test(valueFields[b] ?? '')) reasons.push('含子条件变体(条件N.M),取基础值');
    const effects: OutEffect[] = [];
    let hasUnsupported = false;
    let allPassive = true;
    typesRaw.forEach((tok, i) => {
      const eff = parseTypeToken(tok);
      const val = values[i];
      const safeVal = Number.isFinite(val) ? val : 0;
      if (eff === null) {
        hasUnsupported = true;
        allPassive = false;
        reasons.push(`未知效果类型:${tok}`);
        effects.push({ type: 'unsupported', label: tok, value: Number.isFinite(val) ? val : null });
        return;
      }
      if (eff.type === 'unsupported') hasUnsupported = true;
      if (eff.type !== 'passive') allPassive = false;
      effects.push({ ...eff, value: safeVal });
    });
    if (effects.length === 0) reasons.push('无效果');
    if (values.some(v => Number.isNaN(v))) reasons.push(`数值含非数字:${valueFields[b] ?? ''}`);
    if (effects.length > 0 && values.length !== effects.length && !hasUnsupported) {
      reasons.push(`类型/数值数量不匹配(${effects.length}/${values.length})`);
    }

    // 持续时间
    const durationSec = parseDuration(durFields[b] ?? '', reasons);

    // 条件(主条件 = 对应分支;前置条款并入 approx 判定)
    const branchCond = label !== null && condByLabel.has(label) && !condByLabel.get(label)!.premise
      ? condByLabel.get(label)!.text
      : condPlain;
    const cp = parseCondition(branchCond || filterHint, filterHint);
    const prem = parseCondition(condPremise, '');
    const restrictions = [...new Set([...cp.restrictions, ...prem.restrictions, ...(restrictionBase !== '' && restrictionBase !== '通用' ? [restrictionBase] : [])])];
    const restrictionObj = buildRestriction(restrictions);
    let approx = cp.approx || prem.approx;
    if (branchCond === '' && condPremise === '') reasons.push('触发条件为空');
    reasons.push('Lua 未收录,文本解析');

    let precision: OutSkill['precision'];
    if (hasUnsupported || cp.condition === null || effects.length === 0) {
      precision = 'unsupported';
      if (cp.condition === null) reasons.push('无可解析发动位置');
    } else if (allPassive && cp.condition?.kind === 'raceStart') {
      precision = 'precise'; // 常时被动(绿技能):并入起跑属性
    } else if (allPassive) {
      precision = 'unsupported';
      reasons.push('条件型被动(非常时)暂不支持');
    } else {
      precision = approx ? 'approx' : 'precise';
    }

    if (reasons.length > 0) review.push({ id: id + suffix, page: e.page, reasons });

    const skill: OutSkill = {
      id: id + suffix,
      name: multi ? `${baseName}(${b + 1})` : baseName,
      nameJa,
      nameTrad: tradName !== '' ? tradName : undefined,
      cnReleased: official !== undefined ? true : undefined,
      rarity,
      precision,
      effects,
      durationSec,
      condition: cp.condition ?? { kind: 'raceStart' },
      restriction: restrictionObj,
      restrictionText: restrictions.length > 0 ? restrictions.join(',') : undefined,
      wisdomScaled: rarity !== 'normal',
      source: 'BWIKI 技能速查表(文本解析)',
      fetchedAt: raw.fetchedAt.slice(0, 10),
    };
    out.push(skill);
    stats[precision]++;
  }
}

// =====================================================================
// 继承技(模块:技能数据库内容2):固有技能的继承版(900xxx,本体 = unique_skill_id_1)
// 数值/持续时间/触发条件均与本体不同(如 流星:本体 6s 0.35/0.10 → 继承 3.6s 0.15/0.05);
// 固有等级不可升级 → 智力增幅等级系数恒 1.0(rarity uniqueHeir)。
// =====================================================================
for (const lua of lua2Skills) {
  const id = lua.id ?? '';
  const idNum = Number(id);
  if (!(idNum >= 900000 && idNum < 1000000)) continue;
  stats.heirEntries++;
  const baseId = lua.unique_skill_id_1 ?? '';
  const base = baseInfo.get(baseId);
  const nm = heirNames[id] ?? {};
  const heirJa = nm.ja ?? base?.nameJa ?? id;
  const heirName = nm.cn !== undefined ? `${nm.cn}(继承)` : `${base?.name ?? heirJa}(继承)`;
  const heirTrad = nm.trad ?? base?.nameTrad ?? heirJa;
  const page = `继承技/${heirJa}`;

  const branchCodes: Array<{ slot: 1 | 2 }> = [];
  if ((lua.condition_1 ?? '') !== '') branchCodes.push({ slot: 1 });
  if ((lua.condition_2 ?? '') !== '') branchCodes.push({ slot: 2 });
  if (branchCodes.length === 0) {
    review.push({ id, page, reasons: ['无触发条件'] });
    continue;
  }
  const multiB = branchCodes.length > 1;
  branchCodes.forEach((b, bi) => {
    if (multiB) stats.branchEntries++;
    const { skill, reasons, info } = skillFromLuaBranch(lua, b.slot, {
      id: id + (multiB ? `-b${bi + 1}` : ''),
      name: multiB ? `${heirName}(${bi + 1})` : heirName,
      nameJa: `${heirJa}(継承)`,
      nameTrad: `${heirTrad}(繼承)`,
      // 有简中「继承技/」页面 = 国服已实装该继承技
      cnReleased: nm.cn !== undefined ? true : false,
      rarity: 'uniqueHeir',
      wisdomScaled: true,
      source: 'BWIKI 继承技页面 + 触发代码(模块:技能数据库内容2)',
    });
    if (reasons.length > 0) review.push({ id: skill.id, page, reasons: [...reasons, ...info] });
    else if (info.length > 0) infoNotes.push({ id: skill.id, page, reasons: info });
    out.push(skill);
    stats[skill.precision]++;
  });
}

stats.out = out.length;
writeFileSync('data/skills.json', JSON.stringify(out, null, 1), 'utf8');
writeFileSync('data/skill-review.json', JSON.stringify({ generatedAt: new Date().toISOString(), items: review }, null, 1), 'utf8');
writeFileSync('data/skill-notes.json', JSON.stringify({ generatedAt: new Date().toISOString(), items: infoNotes }, null, 1), 'utf8');
console.log(JSON.stringify(stats, null, 2));
console.log(`复核清单:${review.length} 条 → data/skill-review.json;信息备注:${infoNotes.length} 条 → data/skill-notes.json`);
