// 临时检查:按页名查看原始技能数据
import { readFileSync } from 'node:fs';
const raw = JSON.parse(readFileSync('data/raw/skills.raw.json', 'utf8'));
for (const name of process.argv.slice(2)) {
  const e = raw.results.find(r => r.page === name || r.props['ID'] === name);
  if (!e) { console.log('未找到: ' + name); continue; }
  console.log('=== ' + e.page + ' ===');
  for (const k of ['ID', '中文名', '稀有度', '触发条件', '技能类型', '技能数值', '持续时间', '条件限制']) {
    console.log(`  ${k}: ${JSON.stringify(e.props[k])}`);
  }
}
