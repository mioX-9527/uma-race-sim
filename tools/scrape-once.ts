/**
 * 一次性抓取脚本:BWIKI 技能速查表 → data/raw/skills.raw.json。
 *
 * 原理:技能速查表页面的 4 个隐藏 div 里存放的是 SMW #ask 查询模板(非渲染结果),
 * 前端 JS 实际通过 MediaWiki 的 SMW ask API 取数。本脚本直接调同一 API:
 *   api.php?action=ask&query=[[分类:技能]][[稀有度::...]]|?ID|?技能名|...|limit=500|offset=N
 *
 * 用法:
 *   node tools/scrape-once.ts           # 在线抓取(4 批,批间限速 2.5s)
 *   node tools/scrape-once.ts --inbox   # 人工兜底:解析 tools/inbox/ 下另存的 api JSON(待实现)
 *
 * 注意:BWIKI 有 EdgeOne 防护;脚本带 3 次指数退避重试,仍失败时走 --inbox 人工导出。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const API = 'https://wiki.biligame.com/umamusume/api.php';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CONDITIONS = '[[分类:技能]][[稀有度::普通||传说||独特||独特·低星||剧情||进化]]';
const PRINTOUTS = [
  'ID', '技能名', '中文名', '稀有度', '条件限制', '图标颜色', '技能描述', '技能描述中文',
  '触发条件', '技能类型', '技能数值', '持续时间', '技能消耗PT', '前置技能', '可解锁技能',
  '图标icon', '评价分', '共需技能PT', 'PT评价比', '繁译名', '速查筛选',
];
const BATCH_SIZE = 500;
const RETRIES = 3;

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

async function fetchAsk(offset: number): Promise<Record<string, unknown>> {
  const query = [
    CONDITIONS,
    ...PRINTOUTS.map(p => `?${p}`),
    'link=none',
    'sort=ID,',
    'order=asc,asc',
    `limit=${BATCH_SIZE}`,
    `offset=${offset}`,
    'searchlabel=',
  ].join('|');

  const url = `${API}?action=ask&format=json&query=${encodeURIComponent(query)}`;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Record<string, unknown>;
      if (json.error !== undefined) throw new Error(`API error: ${JSON.stringify(json.error)}`);
      return json;
    } catch (err) {
      lastErr = err;
      const waitMs = 3000 * 3 ** (attempt - 1);
      console.error(`offset=${offset} 第 ${attempt} 次失败:${String(err)},${waitMs / 1000}s 后重试`);
      await sleep(waitMs);
    }
  }
  throw new Error(`offset=${offset} 重试 ${RETRIES} 次仍失败:${String(lastErr)}。请改走 --inbox 人工导出兜底。`);
}

interface RawEntry {
  page: string;
  printouts: Record<string, Array<{ value?: unknown; formatted?: string }>>;
}

function pickPrintouts(json: Record<string, unknown>): { entries: RawEntry[]; count: number } {
  const query = (json as { query?: { results?: Record<string, { printouts?: RawEntry['printouts']; fulltext?: string }> } }).query ?? {};
  const results = query.results ?? {};
  const entries: RawEntry[] = [];
  for (const [page, item] of Object.entries(results)) {
    entries.push({ page: item.fulltext ?? page, printouts: item.printouts ?? {} });
  }
  return { entries, count: entries.length };
}

function firstValue(po: RawEntry['printouts'], key: string): unknown {
  const arr = po[key];
  if (!arr || arr.length === 0) return undefined;
  const v = arr[0];
  return v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v;
}

async function main(): Promise<void> {
  const entries = new Map<string, RawEntry>();
  const batches: Array<{ offset: number; count: number }> = [];
  for (let offset = 0; ; offset += BATCH_SIZE) {
    console.log(`抓取 offset=${offset} ...`);
    const json = await fetchAsk(offset);
    const { entries: batch, count } = pickPrintouts(json);
    for (const e of batch) entries.set(e.page, e);
    batches.push({ offset, count });
    console.log(`  本批 ${count} 条,累计 ${entries.size}`);
    if (count < BATCH_SIZE) break;
    await sleep(2500);
  }

  const out = {
    fetchedAt: new Date().toISOString(),
    source: 'wiki.biligame.com/umamusume 技能速查表(api.php action=ask)',
    batches,
    results: [...entries.values()].map(e => ({
      page: e.page,
      props: Object.fromEntries(PRINTOUTS.map(p => [p, firstValue(e.printouts, p)])),
    })),
  };
  const file = resolve(process.cwd(), 'data/raw/skills.raw.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 1), 'utf8');
  console.log(`完成:${entries.size} 条 → ${file}`);
  // 打印一条样例便于人工核对
  const sample = out.results[0];
  if (sample) console.log('样例:\n' + JSON.stringify(sample, null, 1));
}

void main();
