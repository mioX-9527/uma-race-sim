// 临时审计:抽样对比 原始触发条件/条件限制 文本 与 清洗后的引擎条件
import { readFileSync } from 'node:fs';
const raw = JSON.parse(readFileSync('data/raw/skills.raw.json', 'utf8'));
const skills = JSON.parse(readFileSync('data/skills.json', 'utf8'));
const rawById = new Map();
for (const r of raw.results) rawById.set(String(r.props['ID']), r);

const PHASE = { 0: '序盘', 1: '中盘', 2: '终盘', 3: '最终盘' };
function describe(c) {
  if (c === undefined) return '(无)';
  switch (c.kind) {
    case 'phase': return `仅${PHASE[c.phase]}`;
    case 'phaseAfter': return `${PHASE[c.phase]}起`;
    case 'cornerN': return `第${c.n}弯道`;
    case 'cornerFastest': return `首个弯道${c.phaseFilter !== undefined ? '(限' + PHASE[c.phaseFilter] + ')' : ''}`;
    case 'finalCorner': return '最终弯道';
    case 'finalStraight': return '最终直线';
    case 'lateCorner': return '终盘弯道';
    case 'lateStraight': return '终盘直线';
    case 'midCorner': return '中盘弯道';
    case 'straightFastest': return `首个直线${c.phaseFilter !== undefined ? '(限' + PHASE[c.phaseFilter] + ')' : ''}`;
    case 'uphillFastest': return '首个上坡';
    case 'downhillFastest': return '首个下坡';
    case 'distanceRun': return `行驶${c.meters}m后(${c.base})`;
    case 'distanceLeft': return `剩余${c.meters}m`;
    case 'elapsedSec': return `开赛${c.seconds}s后`;
    case 'positionPct': return `${c.pct}%处`;
    case 'raceStart': return '起步时';
    default: return c.kind;
  }
}

// 随机抽 35 条(含分支)
const idxs = new Set();
while (idxs.size < 35) idxs.add(Math.floor(Math.random() * skills.length));
for (const i of idxs) {
  const s = skills[i];
  const baseId = s.id.replace(/-b\d$/, '');
  const r = rawById.get(baseId);
  if (r === undefined) continue;
  console.log(`■ ${s.name} [${s.rarity}] 精度=${s.precision}`);
  console.log(`  原始触发: ${String(r.props['触发条件'] ?? '').replace(/<br>/g, ' ⏎ ')}`);
  console.log(`  条件限制: ${String(r.props['条件限制'] ?? '')} | 速查筛选: ${String(r.props['速查筛选'] ?? '')}`);
  console.log(`  解析结果: ${describe(s.condition)} 限制=${s.restriction ?? '(无)'}`);
}
