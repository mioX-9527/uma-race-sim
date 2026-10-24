// 临时工具:检查 Lua 数据库结构
import { readFileSync } from 'node:fs';
const t = readFileSync('data/raw/lua-database-content.txt', 'utf8');
const lines = t.split('\n');
console.log('--- 顶层表定义 ---');
lines.forEach((l, i) => {
  if (/^p\.[A-Za-z_0-9]+=\{|^local p/.test(l)) console.log(`${i + 1}: ${l.slice(0, 90)}`);
});
console.log('--- 200641 (迫る影) 出现的行 ---');
lines.forEach((l, i) => {
  if (l.includes('200641')) console.log(`${i + 1}: ${l.slice(0, 260)}`);
});
