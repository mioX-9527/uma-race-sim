// 一次性工具:解析 模块:技能数据库内容 的 Lua skill_data 表 → JSON + 条件token统计
import { readFileSync, writeFileSync } from 'node:fs';

const t = readFileSync('data/raw/lua-skill-db.txt', 'utf8');
const start = t.indexOf('p.skill_data={');
if (start < 0) throw new Error('找不到 p.skill_data');
const bodyStart = t.indexOf('{', start);
// 找到与之配对的右括号(顶层 p.skill_data 的结束)
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

// 按顶层 {...} 记录切分:跟踪嵌套深度
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

// 每条记录是 key="value" 逗号分隔
const records = entries.map((e) => {
  const o = {};
  for (const m of e.matchAll(/([A-Za-z_0-9]+)="([^"]*)"/g)) o[m[1]] = m[2];
  return o;
});
console.log(`记录数: ${records.length}`);
console.log(`字段数(首条): ${Object.keys(records[0]).length}`);

// 条件token统计
const tokenFreq = new Map();
const condCount = { c1: 0, c2: 0, pre1: 0, pre2: 0 };
for (const r of records) {
  for (const [k, tag] of [
    ['condition_1', 'c1'],
    ['condition_2', 'c2'],
    ['precondition_1', 'pre1'],
    ['precondition_2', 'pre2'],
  ]) {
    const v = r[k];
    if (!v) continue;
    condCount[tag]++;
    // 按 & 或 && 切分子条件
    for (const part of v.split(/&&|&(?!&)/)) {
      const tok = part.trim().match(/^([A-Za-z_0-9]+)([=!<>]=|>|<)?(.*)$/);
      if (!tok) {
        tokenFreq.set(`<<parse-fail:${part.trim().slice(0, 30)}>>`, (tokenFreq.get(`<<parse-fail:${part.trim().slice(0, 30)}>>`) ?? 0) + 1);
        continue;
      }
      const key = tok[1];
      tokenFreq.set(key, (tokenFreq.get(key) ?? 0) + 1);
    }
  }
}
console.log('条件数量:', condCount);
console.log('--- token 频次(降序) ---');
[...tokenFreq.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`${String(v).padStart(5)}  ${k}`));

// 效果类型分布
const abiFreq = new Map();
for (const r of records)
  for (const s of [1, 2])
    for (const e of [1, 2, 3]) {
      const v = r[`ability_type_${s}_${e}`];
      if (v && v !== '0') abiFreq.set(v, (abiFreq.get(v) ?? 0) + 1);
    }
console.log('--- ability_type 频次 ---');
[...abiFreq.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`${String(v).padStart(5)}  type ${k}`));

// 关键技能抽查
for (const id of ['200641', '200331', '950641']) {
  const r = records.find((x) => x.id === id);
  console.log(`--- ${id} ---`);
  if (!r) console.log('(不存在)');
  else
    console.log(
      JSON.stringify(
        {
          id: r.id,
          rarity: r.rarity,
          condition_1: r.condition_1,
          precondition_1: r.precondition_1,
          condition_2: r.condition_2,
          at11: r.ability_type_1_1,
          av11: r.float_ability_value_1_1,
          time1: r.float_ability_time_1,
          cd1: r.float_cooldown_time_1,
          at12: r.ability_type_1_2,
          av12: r.float_ability_value_1_2,
        },
        null,
        0
      )
    );
}

writeFileSync('data/raw/skill-data-lua.json', JSON.stringify(records), 'utf8');
console.log('→ data/raw/skill-data-lua.json');
