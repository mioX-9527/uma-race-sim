// 临时工具:SMW ask 查询探测(参数用空格分隔,脚本内用 | 拼接,避开 cmd 管道符)
const parts = process.argv.slice(2);
const query = parts.join('|');
const url = `https://wiki.biligame.com/umamusume/api.php?action=ask&format=json&query=${encodeURIComponent(query)}`;
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' } });
console.log(`HTTP ${res.status}`);
if (res.ok) {
  const json = await res.json();
  const results = json.query?.results ?? {};
  console.log(`命中 ${Object.keys(results).length}`);
  for (const [title, item] of Object.entries(results).slice(0, 8)) {
    const id = item.printouts?.ID?.[0]?.value ?? '?';
    console.log(`  ${title} → ID=${id}`);
  }
}
