/**
 * 诊断(解封后跑一次,尽量少的请求):
 * 1) 单页 ask 的完整 printouts JSON(确认简/页的 ID 属性真实字段名)
 * 2) Template:简中技能 源码(看模板是否 #set 属性)
 * 3) 简中技能速查表页面的隐藏查询语句(看它自己怎么查的)
 */
import { writeFileSync } from 'node:fs';

const API = 'https://wiki.biligame.com/umamusume/api.php';
const INDEX = 'https://wiki.biligame.com/umamusume/index.php';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: UA });
  const text = await res.text();
  return { status: res.status, text };
}

// 1) 单页完整 printouts
const q = encodeURIComponent('[[简/弧线大师]]|?ID|limit=1');
const r1 = await get(`${API}?action=ask&format=json&query=${q}`);
console.log(`[1] ask HTTP ${r1.status}`);
if (r1.status === 200) {
  const page = Object.values(JSON.parse(r1.text).query?.results ?? {})[0];
  console.log(JSON.stringify(page?.printouts ?? {}, null, 1).slice(0, 800));
}
await sleep(3000);

// 2) 模板源码
const r2 = await get(`${INDEX}?title=${encodeURIComponent('Template:简中技能')}&action=raw`);
console.log(`\n[2] 模板 HTTP ${r2.status}`);
if (r2.status === 200) console.log(r2.text.slice(0, 1200));
await sleep(3000);

// 3) 速查表页面里的隐藏查询
const r3 = await get(`${INDEX}?title=${encodeURIComponent('简中技能速查表')}&action=raw`);
console.log(`\n[3] 速查表 HTTP ${r3.status}`);
if (r3.status === 200) {
  const asks = r3.text.match(/\{\{#ask:[^}]+\}\}/gs) ?? [];
  console.log(`共 ${asks.length} 个 #ask,第一个:\n${asks[0]?.slice(0, 800) ?? '(无)'}`);
}
writeFileSync('data/raw/cn-diag.json', JSON.stringify({ askStatus: r1.status, tpl: r2.text.slice(0, 2000), table: r3.text.slice(0, 3000) }), 'utf8');
