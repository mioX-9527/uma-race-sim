// 临时诊断:提取 614tools bundle 中 ZP/wP/xP 函数体(stats+green 合并逻辑)
import { readFileSync } from 'node:fs';
const t = readFileSync('data/raw/614tools-bundle.js', 'utf8');
for (const name of ['ZP', 'wP', 'xP']) {
  const i = t.indexOf('function ' + name + '(');
  if (i < 0) { console.log(name, ': not found'); continue; }
  // 花括号配平
  let d = 0, j = t.indexOf('{', i);
  const start = j;
  for (; j < t.length; j++) {
    if (t[j] === '{') d++;
    else if (t[j] === '}') { d--; if (d === 0) break; }
  }
  console.log(name + ':', JSON.stringify(t.slice(start, j + 1).slice(0, 500)), '\n');
}
