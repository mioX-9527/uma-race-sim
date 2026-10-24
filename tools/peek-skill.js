// 临时检查:按名称查清洗前后条目
import { readFileSync } from 'node:fs';
const kw = process.argv[2];
const skills = JSON.parse(readFileSync('data/skills.json', 'utf8'));
const hits = skills.filter(s => s.name.includes(kw) || (s.nameJa ?? '').includes(kw));
const raw = JSON.parse(readFileSync('data/raw/skills.raw.json', 'utf8')).results;
for (const s of hits) {
  const r = raw.find(x => String(x.props['ID']) === s.id.replace(/-b\d$/, ''));
  console.log(`■ ${s.name}(${s.nameJa}) 精度=${s.precision}`);
  console.log(`  原始: ${JSON.stringify(r?.props['触发条件'])} 限制=${r?.props['条件限制']}`);
  console.log(`  解析: ${JSON.stringify(s.condition)} 限制=${JSON.stringify(s.restriction)}`);
}
