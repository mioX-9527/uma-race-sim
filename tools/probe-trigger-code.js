// 临时工具:定位"触发代码"字段的真实数据源
// 1) 模板:技能 的源码 —— 看触发代码行怎么渲染 2) 渲染后的技能页 HTML —— 看代码值和线索
import { writeFileSync } from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, out, label) {
  const res = await fetch(url, { headers: UA });
  const text = await res.text();
  writeFileSync(out, text, 'utf8');
  console.log(`[${label}] HTTP ${res.status},${text.length} 字符 → ${out}`);
  return text;
}

// 1) 模板源码
const tpl = await get(
  `https://wiki.biligame.com/umamusume/index.php?title=${encodeURIComponent('模板:技能')}&action=raw`,
  'data/raw/template-skill.txt',
  '模板:技能'
);
const lines = tpl.split('\n');
const hits = lines.map((l, i) => [i, l]).filter(([, l]) => /触发代码|触发|条件/.test(l));
console.log('--- 模板中含"触发/条件"的行 ---');
for (const [i, l] of hits.slice(0, 30)) console.log(`${i + 1}: ${l.slice(0, 160)}`);

// 模板里引用的模块/子查询
const modRefs = [...new Set([...tpl.matchAll(/(?:模块|Module):[^\s|}<]+/g)].map((m) => m[0]))];
console.log('引用的模块:', modRefs);
const askRefs = [...new Set([...tpl.matchAll(/#(?:ask|show|cargo_query|invoke)[^|}]*/g)].map((m) => m[0].slice(0, 60)))];
console.log('查询/调用:', askRefs);

await sleep(8000);

// 2) 渲染后的页面 HTML
const html = await get(
  `https://wiki.biligame.com/umamusume/index.php?title=${encodeURIComponent('迫る影')}&action=render`,
  'data/raw/skill-page-rendered.html',
  '迫る影(render)'
);
const idx = html.indexOf('触发代码');
if (idx >= 0) {
  console.log('--- HTML 中"触发代码"上下文 ---');
  console.log(html.slice(Math.max(0, idx - 400), idx + 600).replace(/\s+/g, ' '));
} else {
  console.log('渲染 HTML 中未找到 触发代码');
}
