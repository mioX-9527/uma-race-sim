// 一次性工具:SMW 查询继承技页面(ID ≥ 900000)的三语名称 → data/raw/heir-skill-names.json
import { writeFileSync } from 'node:fs';

async function ask(query) {
  const url =
    'https://wiki.biligame.com/umamusume/api.php?action=ask&format=json&limit=500&query=' +
    encodeURIComponent(query);
  return await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (research; uma-race-sim)' } })).json();
}

// 分页取全部 ID ≥ 900000 的页面
const results = [];
let offset = '';
for (let page = 0; page < 10; page++) {
  const q = '[[ID::>899999]]|?ID|limit=500' + (offset ? '|offset=' + offset : '');
  const j = await ask(q);
  const r = j.query?.results ?? {};
  const keys = Object.keys(r);
  console.log('batch', page, 'got', keys.length);
  for (const [title, v] of Object.entries(r)) {
    const id = String(v.printouts?.ID?.[0] ?? '').trim();
    results.push({ title, id });
  }
  // SMW json format: 'query-continue-offset' 或直接看是否取满
  const cont = j['query-continue']?.offset ?? (keys.length === 500 ? Number(offset || 0) + 500 : null);
  if (cont === null || keys.length === 0) break;
  offset = String(cont);
}
console.log('total pages:', results.length);

const byId = new Map();
for (const { title, id } of results) {
  if (!/^\d+$/.test(id)) continue;
  let lang;
  let name = title;
  if (title.startsWith('简/继承技/')) { lang = 'cn'; name = title.slice('简/继承技/'.length); }
  else if (title.startsWith('繁/继承技/')) { lang = 'trad'; name = title.slice('繁/继承技/'.length); }
  else if (title.startsWith('继承技/')) { lang = 'ja'; name = title.slice('继承技/'.length); }
  else continue;
  const rec = byId.get(id) ?? {};
  rec[lang] = name;
  byId.set(id, rec);
}

const out = { fetchedAt: new Date().toISOString(), count: byId.size, map: Object.fromEntries(byId) };
writeFileSync('data/raw/heir-skill-names.json', JSON.stringify(out, null, 1), 'utf8');
console.log('→ data/raw/heir-skill-names.json,映射', byId.size, '条');
console.log('样例:', JSON.stringify([...byId.entries()].slice(0, 4), null, 0));
const missing = [...byId.entries()].filter(([, r]) => !r.cn);
console.log('缺简中名的:', missing.length);
