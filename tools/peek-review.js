// 临时工具:复核清单问题分布
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync('data/skill-review.json', 'utf8'));
const c = new Map();
for (const it of r.items) {
  for (const x of it.reasons) {
    const k = x.slice(0, 26);
    c.set(k, (c.get(k) ?? 0) + 1);
  }
}
[...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).forEach(([k, v]) => console.log(String(v).padStart(4), k));
console.log('--- 无可解析发动位置的技能(前10) ---');
let n = 0;
for (const it of r.items) {
  if (it.reasons.some(x => x.includes('无可解析'))) {
    console.log(it.id, it.reasons.filter(x => !x.includes('前置条件')).slice(0, 2).join(' | ').slice(0, 110));
    if (++n >= 10) break;
  }
}
