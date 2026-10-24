/**
 * 技能清洗脚本:data/raw/skills.raw.json(BWIKI 技能速查表)→ data/skills.json + data/skill-review.json
 *
 * 规则要点(见 docs/最终方案.md §4/§5):
 * - 排除「进化」稀有度(v0.1 不支持进化技能)
 * - 固有技能的 条件1/条件2 双分支拆成独立条目(id 加 -b1/-b2 后缀)
 * - 发动条件文本 → 引擎条件枚举:静态锚点(阶段/弯道/坡道/位置)精确;
 *   名次/间距/随机/依赖他马的条款 → approx(UI 需角标);无法解析 → 复核清单
 * - 技能效果词表:速度→targetSpeed、即时速度→currentSpeed、加速度→acceleration、
 *   耐力恢复→heal、被动(属性)→passive(前提值)、妨害/视野/横向速度→unsupported
 * - 持续时间为基准值:运行期按 距离/1000 缩放(解包模型,RaceSolver.activateSkill)
 */
import { readFileSync, writeFileSync } from 'node:fs';

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
  rarity: string;
  precision: 'precise' | 'approx' | 'unsupported';
  effects: OutEffect[];
  durationSec: number | null;
  condition: Record<string, unknown>;
  restriction?: string;
  wisdomScaled: boolean;
  source: string;
  fetchedAt: string;
}

const raw = JSON.parse(readFileSync('data/raw/skills.raw.json', 'utf8')) as {
  fetchedAt: string;
  source: string;
  results: RawEntry[];
};
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
  { re: /最终弯道/, kind: 'finalCorner' },
  { re: /终盘直线/, kind: 'lateStraight' },
  { re: /终盘弯道/, kind: 'lateCorner' },
  { re: /中盘弯道/, kind: 'midCorner' },
  { re: /第(\d+)个?弯道/, kind: 'cornerN' },
  { re: /上坡/, kind: 'uphillFastest' },
  { re: /下坡/, kind: 'downhillFastest' },
  { re: /弯道/, kind: 'cornerFastest' },
  { re: /直线/, kind: 'straightFastest' },
  { re: /最后冲刺|最终冲刺状态/, kind: 'phase3', approxHint: true },
  { re: /最终盘/, kind: 'phase3' },
  { re: /终盘前半|终盘后半|终盘四分之三|终盘前四分之一|终盘中后/, kind: 'phase2', approxHint: true },
  { re: /终盘/, kind: 'phase2' },
  { re: /中盘后半|中盘前半/, kind: 'phase1', approxHint: true },
  { re: /中盘/, kind: 'phase1' },
  { re: /序盘/, kind: 'phase0' },
];
const PHASE_OF = { phase0: 0, phase1: 1, phase2: 2, phase3: 3 } as const;
const SEGMENT_KINDS = new Set(['cornerFastest', 'straightFastest', 'uphillFastest', 'downhillFastest']);
const APPROX_RE = /名次|超过|紧跟|贴[近着]|距离前|距离后|内道|外道|侧面阻挡|包围|随机|队伍位置|最大冲刺|冲刺状态|对手|马身|体力[≥<＝=]|发动技能|发动第一段|焦躁|仕掛|先后|保持/;
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

  const segments = text.split(/[，,。;；、]/).map(s => s.trim()).filter(Boolean);
  for (const seg of segments) {
    if (seg === '') continue;
    if (CONTEXT_RE.test(seg)) { restrictions.push(seg); continue; }
    // 数值条件
    let m = seg.match(/行进距离[≥>]=?\s*(\d+(?:\.\d+)?)\s*[％%]/);
    if (m) { anchor = anchor && anchor.kind !== 'raceStart' ? anchor : { kind: 'positionPct' }; (anchor as Record<string, unknown>).pct = Number.parseFloat(m[1]!); continue; }
    m = seg.match(/(?:赛事|比赛)?进行时间[≥>]=?\s*(\d+(?:\.\d+)?)/);
    if (m) { approx = true; anchor = anchor && anchor.kind !== 'raceStart' ? anchor : { kind: 'elapsedSec' }; (anchor as Record<string, unknown>).seconds = Number.parseFloat(m[1]!); (anchor as Record<string, unknown>).base = 'start'; continue; }
    // 锚点(表按特异性从高到低,命中即可能覆盖之前的宽泛锚点)
    let matched = false;
    for (let i = 0; i < ANCHORS.length; i++) {
      const a = ANCHORS[i]!;
      const am = seg.match(a.re);
      if (am) {
        // 只有更特异(下标更小)或尚无锚点时覆盖
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

  // 主条件没解析出锚点时,用速查筛选字段兜底
  if (anchor === null && fallbackFilter !== '') {
    const fb = parseCondition(fallbackFilter, '');
    if (fb.condition !== null) {
      anchor = fb.condition as unknown as { kind: string };
      approx = approx;
      // 兜底视为期望发动(approx)
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
  } else {
    condition = SEGMENT_KINDS.has(kind)
      ? { kind, ...(phaseWord !== null ? { phaseFilter: phaseWord } : {}) }
      : { kind };
  }
  return { condition, approx: approx || (anchor.approxHint === true), restrictions, unresolved: reasons };
}

// ---------- 主流程 ----------
const stats = { raw: 0, excludedEvolution: 0, out: 0, precise: 0, approx: 0, unsupported: 0, branchEntries: 0 };
const out: OutSkill[] = [];

for (const e of raw.results) {
  stats.raw++;
  const rarityCn = prop(e, '稀有度');
  const id = prop(e, 'ID') || e.page;
  if (rarityCn === '进化') { stats.excludedEvolution++; continue; }

  const rarity = rarityCn === '普通' ? 'normal' : rarityCn === '传说' ? 'rareEvolved' : 'unique5';
  const nameJa = prop(e, '技能名') || e.page;
  const baseName = cleanName(prop(e, '中文名')) || nameJa;
  const tradRaw = cleanName(prop(e, '繁译名'));
  const tradName = /^(（?\(?未[实實]裝\)?）?)$/.test(tradRaw) || tradRaw === '' ? '' : tradRaw;
  const restrictionBase = prop(e, '条件限制');
  const filterHint = prop(e, '速查筛选');

  // 分支标签来自技能类型
  const typeParts = splitBranches(prop(e, '技能类型')).filter(p => p.label !== null && !p.premise);
  const labels = typeParts.map(p => p.label!);
  const multi = labels.length > 1;
  const typeFields = fieldByBranch(prop(e, '技能类型'), labels.length ? labels : [null]);
  const valueFields = fieldByBranch(prop(e, '技能数值'), labels.length ? labels : [null]);
  const durFields = fieldByBranch(prop(e, '持续时间'), labels.length ? labels : [null]);
  const condText = prop(e, '触发条件');
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
    let approx = cp.approx || prem.approx;
    if (branchCond === '' && condPremise === '') reasons.push('触发条件为空');

    let precision: OutSkill['precision'];
    if (hasUnsupported || cp.condition === null || effects.length === 0 || allPassive) {
      precision = 'unsupported';
      if (cp.condition === null) reasons.push('无可解析发动位置');
      if (allPassive && effects.length > 0) reasons.push('纯被动(前提值,不参与比赛过程)');
    } else {
      precision = approx ? 'approx' : 'precise';
    }

    if (reasons.length > 0) review.push({ id: id + suffix, page: e.page, reasons });

    const skill: OutSkill = {
      id: id + suffix,
      name: multi ? `${baseName}(${b + 1})` : baseName,
      nameJa,
      nameTrad: tradName !== '' ? tradName : undefined,
      rarity,
      precision,
      effects,
      durationSec,
      condition: cp.condition ?? { kind: 'raceStart' },
      restriction: restrictions.length > 0 ? restrictions.join(',') : undefined,
      wisdomScaled: rarity !== 'normal',
      source: 'BWIKI 技能速查表',
      fetchedAt: raw.fetchedAt.slice(0, 10),
    };
    out.push(skill);
    stats[precision]++;
  }
}

stats.out = out.length;
writeFileSync('data/skills.json', JSON.stringify(out, null, 1), 'utf8');
writeFileSync('data/skill-review.json', JSON.stringify({ generatedAt: new Date().toISOString(), items: review }, null, 1), 'utf8');
console.log(JSON.stringify(stats, null, 2));
console.log(`复核清单:${review.length} 条 → data/skill-review.json`);
