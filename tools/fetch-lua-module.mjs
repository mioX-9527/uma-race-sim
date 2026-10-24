// 抓取 BWIKI 模块:技能数据库内容2(含继承技 900xxx 数据的候选源)
import { writeFileSync } from 'node:fs';

const title = process.argv[2] ?? '模块:技能数据库内容2';
const url =
  'https://wiki.biligame.com/umamusume/index.php?title=' +
  encodeURIComponent(title) +
  '&action=raw';
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (research; uma-race-sim)' } });
console.log('HTTP', res.status);
const t = await res.text();
const out = 'data/raw/' + title.replace(/[^\w-]+/g, '-') + '.txt';
writeFileSync(out, t);
console.log('saved', out, t.length, 'chars');
console.log(t.slice(0, 400));
const ids = [...t.matchAll(/id="?(\d{6,7})"?/g)].map(m => Number(m[1]));
const seg = {};
for (const n of ids) {
  const k = Math.floor(n / 100000);
  seg[k] = (seg[k] ?? 0) + 1;
}
console.log('id 段分布:', JSON.stringify(seg));
