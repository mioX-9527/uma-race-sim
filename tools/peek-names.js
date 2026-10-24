import { readFileSync } from 'node:fs';
const s = JSON.parse(readFileSync('data/skills.json', 'utf8'));
const cn = s.filter(x => x.cnReleased);
console.log(`cnReleased: ${cn.length} / ${s.length}`);
const prof = s.filter(x => x.nameJa === '弧線のプロフェッサー');
console.log('弧線のプロフェッサー →', JSON.stringify(prof.map(x => ({ name: x.name, cn: x.cnReleased }))));
const bad = s.filter(x => x.cnReleased && !/[\u4e00-\u9fff]/.test(x.name.slice(0, 2)));
console.log('已实装但名字非中文开头:', bad.length, bad.slice(0, 5).map(x => x.name).join(','));
