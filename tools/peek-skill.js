// 临时检查:按 ID 查看清洗前后完整条目
import { readFileSync } from 'node:fs';
const id = process.argv[2];
const raw = JSON.parse(readFileSync('data/raw/skills.raw.json', 'utf8')).results;
const r = raw.find(x => String(x.props['ID']) === id);
if (r !== undefined) {
  console.log('=== raw ===');
  for (const k of ['技能名', '中文名', '稀有度', '触发条件', '技能类型', '技能数值', '持续时间', '条件限制', '速查筛选']) {
    console.log(`  ${k}: ${JSON.stringify(r.props[k])}`);
  }
}
const skills = JSON.parse(readFileSync('data/skills.json', 'utf8'));
const hits = skills.filter(s => s.id.replace(/-b\d$/, '') === id);
console.log('=== cleaned ===');
console.log(JSON.stringify(hits, null, 1).slice(0, 2000));
