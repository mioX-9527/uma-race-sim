// 临时工具:抓取 wiki 页面 wikitext(避开 cmd 的 & 转义问题)
import { writeFileSync } from 'node:fs';
const title = process.argv[2];
const out = process.argv[3] ?? 'data/raw/page-sample.txt';
const url = `https://wiki.biligame.com/umamusume/index.php?title=${encodeURIComponent(title)}&action=raw`;
const res = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' },
});
console.log(`HTTP ${res.status}`);
const text = await res.text();
writeFileSync(out, text, 'utf8');
console.log(`${text.length} 字符 → ${out}`);
console.log('--- 前 40 行 ---');
console.log(text.split('\n').slice(0, 40).join('\n'));
