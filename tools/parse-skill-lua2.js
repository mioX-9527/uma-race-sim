// 一次性工具:解析 模块:技能数据库内容2(继承技 900xxx / 进化等补充数据)的 Lua skill_data 表 → JSON
import { readFileSync, writeFileSync } from 'node:fs';

const t = readFileSync('data/raw/lua-database-content2.txt', 'utf8');
const start = t.indexOf('p.skill_data={');
if (start < 0) throw new Error('找不到 p.skill_data');
const bodyStart = t.indexOf('{', start);
let depth = 0,
  end = -1;
for (let i = bodyStart; i < t.length; i++) {
  const c = t[i];
  if (c === '{') depth++;
  else if (c === '}') {
    depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }
}
const body = t.slice(bodyStart + 1, end);

const entries = [];
let d = 0,
  recStart = -1;
for (let i = 0; i < body.length; i++) {
  const c = body[i];
  if (c === '{') {
    if (d === 0) recStart = i;
    d++;
  } else if (c === '}') {
    d--;
    if (d === 0 && recStart >= 0) {
      entries.push(body.slice(recStart + 1, i));
      recStart = -1;
    }
  }
}

const records = entries.map((e) => {
  const o = {};
  for (const m of e.matchAll(/([A-Za-z_0-9]+)="([^"]*)"/g)) o[m[1]] = m[2];
  return o;
});

const seg = {};
for (const r of records) {
  const n = Number(r.id);
  const k = n >= 900000 && n < 1000000 ? '900xxx(继承技)' : n >= 1000000 ? '1M+(进化等)' : '其它';
  seg[k] = (seg[k] ?? 0) + 1;
}
console.log('记录数:', records.length, JSON.stringify(seg));
const withCond = records.filter((r) => r.condition_1 || r.condition_2);
console.log('含条件条目:', withCond.length);

writeFileSync('data/raw/skill-data-lua2.json', JSON.stringify(records), 'utf8');
console.log('→ data/raw/skill-data-lua2.json');
