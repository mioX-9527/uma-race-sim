// 临时检查:追踪某个技能名在数据链路中的踪迹
import { readFileSync } from 'node:fs';
const kw = process.argv[2] ?? '浑然忘我';

const cnNames = JSON.parse(readFileSync('data/raw/cn-skill-names.json', 'utf8')).map;
const hitCn = Object.entries(cnNames).filter(([, v]) => String(v).includes(kw));
console.log(`官方译名映射命中 ${hitCn.length}:${JSON.stringify(hitCn.slice(0, 5))}`);

const raw = JSON.parse(readFileSync('data/raw/skills.raw.json', 'utf8')).results;
const hitRaw = raw.filter(r =>
  [r.props['技能名'], r.props['中文名'], r.props['繁译名'], r.page].some(v => String(v ?? '').includes(kw)),
);
for (const r of hitRaw.slice(0, 5)) {
  console.log(`raw: ID=${r.props['ID']} ${r.page} 中文名=${r.props['中文名']} 繁译=${r.props['繁译名']} 稀有度=${r.props['稀有度']}`);
}

const skills = JSON.parse(readFileSync('data/skills.json', 'utf8'));
const hitSkills = skills.filter(s => [s.name, s.nameJa, s.nameTrad].some(v => String(v ?? '').includes(kw)));
for (const s of hitSkills.slice(0, 5)) {
  console.log(`skills.json: id=${s.id} name=${s.name} precision=${s.precision} cn=${s.cnReleased ?? false}`);
}
if (hitSkills.length === 0) console.log('skills.json: 未命中');
