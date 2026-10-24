/**
 * 一体化重试:长冷却 → 诊断 → 枚举 → 逐页抓取 → 清洗 → 校验。
 * 产出 data/raw/cn-skill-names.json 并自动重建 data/skills.json。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://wiki.biligame.com/umamusume/api.php';
const INDEX = 'https://wiki.biligame.com/umamusume/index.php';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' };
const TITLES_FILE = 'data/raw/cn-titles.json';
const PARTIAL_FILE = 'data/raw/cn-skill-names.partial.json';
const OUT_FILE = 'data/raw/cn-skill-names.json';
const NODE = process.execPath;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('静默冷却 75 分钟…');
await sleep(75 * 60 * 1000);

async function get(url) {
  const res = await fetch(url, { headers: UA });
  return { status: res.status, text: await res.text() };
}

// 探针:确认解封
const probe = await get(`${API}?action=ask&format=json&query=${encodeURIComponent('[[简/弧线大师]]|?ID|limit=1')}`);
console.log(`探针 HTTP ${probe.status}`);
if (probe.status !== 200) {
  console.log('仍被拦截,放弃本次(可再次运行本脚本)');
  process.exit(2);
}
console.log('单页 printouts:' + JSON.stringify(Object.values(JSON.parse(probe.text).query?.results ?? {})[0]?.printouts ?? {}).slice(0, 400));

// 枚举(带缓存)
let titles;
if (existsSync(TITLES_FILE)) {
  titles = JSON.parse(readFileSync(TITLES_FILE, 'utf8'));
  console.log(`标题缓存命中:${titles.length}`);
} else {
  titles = [];
  for (let offset = 0; ; offset += 500) {
    const q = encodeURIComponent(`[[分类:简中技能]]|limit=500|offset=${offset}|link=none|sort=|order=asc|searchlabel=`);
    const r = await get(`${API}?action=ask&format=json&query=${q}`);
    if (r.status !== 200) throw new Error(`枚举 offset=${offset} HTTP ${r.status}`);
    const batch = Object.keys(JSON.parse(r.text).query?.results ?? {});
    titles.push(...batch);
    writeFileSync(TITLES_FILE, JSON.stringify(titles, null, 1), 'utf8');
    console.log(`枚举 offset=${offset}:本批 ${batch.length},累计 ${titles.length}`);
    if (batch.length < 500) break;
    await sleep(3000);
  }
}

// 逐页抓取(3s 间隔,失败退避,断点续跑)
let state = { map: {}, doneTitles: [] };
if (existsSync(PARTIAL_FILE)) {
  state = JSON.parse(readFileSync(PARTIAL_FILE, 'utf8'));
  console.log(`断点续跑:已完成 ${state.doneTitles.length} 页`);
}
const doneSet = new Set(state.doneTitles);
const BACKOFFS = [30_000, 60_000, 120_000, 300_000, 600_000, 600_000];
for (const title of titles) {
  if (doneSet.has(title)) continue;
  let ok = false;
  for (let i = 0; i <= BACKOFFS.length && !ok; i++) {
    try {
      const r = await get(`${INDEX}?title=${encodeURIComponent(title)}&action=raw`);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      if (r.text.includes('{{简中技能')) {
        const m = r.text.match(/\|\s*ID\s*=\s*(\d+)/);
        if (m !== null) state.map[m[1]] = title.replace(/^简\//, '');
      }
      ok = true;
    } catch (err) {
      if (i === BACKOFFS.length) {
        console.error(`  放弃 ${title}:${String(err)}`);
      } else {
        console.log(`  [${title.slice(0, 16)}] ${String(err)},退避 ${BACKOFFS[i] / 1000}s(${i + 1}/${BACKOFFS.length})`);
        await sleep(BACKOFFS[i]);
      }
    }
  }
  doneSet.add(title);
  state.doneTitles = [...doneSet];
  if (doneSet.size % 50 === 0) {
    writeFileSync(PARTIAL_FILE, JSON.stringify(state), 'utf8');
    console.log(`进度 ${doneSet.size}/${titles.length},映射 ${Object.keys(state.map).length}`);
  }
  await sleep(3000);
}

writeFileSync(PARTIAL_FILE, JSON.stringify(state), 'utf8');
writeFileSync(OUT_FILE, JSON.stringify({ fetchedAt: new Date().toISOString(), total: titles.length, map: state.map }, null, 1), 'utf8');
console.log(`抓取完成:映射 ${Object.keys(state.map).length} 条(抽查 200331=${state.map['200331'] ?? '无'})`);

// 重建数据并校验
execFileSync(NODE, ['tools/clean-skills.ts'], { stdio: 'inherit' });
execFileSync(NODE, ['tools/validate-data.ts'], { stdio: 'inherit' });
console.log('全链路完成');
