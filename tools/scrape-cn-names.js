/**
 * 抓取 BWIKI「简中技能速查表」(分类:简中技能)→ data/raw/cn-skill-names.json
 * 方案:SMW ask 枚举 简/ 标题(标题=国服官方译名),再经 index.php?action=raw 逐页提取 {{简中技能|ID=}}。
 * EdgeOne 限流对策:启动冷却 3 分钟;抓取间隔 1.2s;失败退避 30/60/120/180/300s;每 25 页增量落盘,支持断点续跑。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const API = 'https://wiki.biligame.com/umamusume/api.php';
const INDEX = 'https://wiki.biligame.com/umamusume/index.php';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0';
const TITLES_FILE = 'data/raw/cn-titles.json';
const PARTIAL_FILE = 'data/raw/cn-skill-names.partial.json';
const OUT_FILE = 'data/raw/cn-skill-names.json';
const BACKOFFS = [30_000, 60_000, 120_000, 180_000, 300_000, 300_000, 600_000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, label) {
  for (let i = 0; i <= BACKOFFS.length; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === BACKOFFS.length) throw err;
      console.log(`  [${label}] 失败(${String(err)}),${BACKOFFS[i] / 1000}s 后重试(${i + 1}/${BACKOFFS.length})`);
      await sleep(BACKOFFS[i]);
    }
  }
  throw new Error('unreachable');
}

console.log('启动冷却 180s(等待 EdgeOne 限流窗口)…');
await sleep(180_000);

// 1) 枚举标题(有缓存则跳过)
let titles;
if (existsSync(TITLES_FILE)) {
  titles = JSON.parse(readFileSync(TITLES_FILE, 'utf8'));
  console.log(`标题缓存命中:${titles.length} 个`);
} else {
  titles = [];
  for (let offset = 0; ; offset += 500) {
    const query = encodeURIComponent(`[[分类:简中技能]]|limit=500|offset=${offset}|link=none|sort=|order=asc|searchlabel=`);
    const text = await fetchText(`${API}?action=ask&format=json&query=${query}`, `枚举${offset}`);
    const results = JSON.parse(text).query?.results ?? {};
    const batch = Object.keys(results);
    titles.push(...batch);
    writeFileSync(TITLES_FILE, JSON.stringify(titles, null, 1), 'utf8');
    console.log(`枚举 offset=${offset}:本批 ${batch.length},累计 ${titles.length}`);
    if (batch.length < 500) break;
    await sleep(3000);
  }
}

// 2) 逐页取 ID(断点续跑)
let state = { map: {}, doneTitles: [] };
if (existsSync(PARTIAL_FILE)) {
  state = JSON.parse(readFileSync(PARTIAL_FILE, 'utf8'));
  console.log(`断点续跑:已完成 ${state.doneTitles.length} 页,映射 ${Object.keys(state.map).length} 条`);
}
const doneSet = new Set(state.doneTitles);
let fetchedThisRun = 0;
for (const title of titles) {
  if (doneSet.has(title)) continue;
  try {
    const raw = await fetchText(`${INDEX}?title=${encodeURIComponent(title)}&action=raw`, title.slice(0, 20));
    if (raw.includes('{{简中技能')) {
      const m = raw.match(/\|\s*ID\s*=\s*(\d+)/);
      if (m !== null) state.map[m[1]] = title.replace(/^简\//, '');
    }
    doneSet.add(title);
    state.doneTitles = [...doneSet];
  } catch (err) {
    console.error(`  放弃页面 ${title}:${String(err)}(继续下一个)`);
  }
  fetchedThisRun++;
  if (fetchedThisRun % 25 === 0) {
    writeFileSync(PARTIAL_FILE, JSON.stringify(state), 'utf8');
    console.log(`进度 ${state.doneTitles.length}/${titles.length},映射 ${Object.keys(state.map).length}`);
  }
  await sleep(1200);
}

writeFileSync(PARTIAL_FILE, JSON.stringify(state), 'utf8');
writeFileSync(OUT_FILE, JSON.stringify({ fetchedAt: new Date().toISOString(), total: titles.length, map: state.map }, null, 1), 'utf8');
console.log(`完成:简中技能页 ${titles.length} 个,ID 映射 ${Object.keys(state.map).length} 条 → ${OUT_FILE}`);
console.log(`抽查: 200331=${state.map['200331'] ?? '(无)'}`);
