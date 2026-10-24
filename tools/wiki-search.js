// 临时工具:调用 BWIKI 搜索 API
const query = process.argv.slice(2).join(' ');
const url = `https://wiki.biligame.com/umamusume/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=20&format=json`;
const res = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' },
});
const json = await res.json();
for (const r of json.query?.search ?? []) {
  console.log(`${r.title}  (含片段: ${String(r.snippet).replace(/<[^>]+>/g, '').slice(0, 60)})`);
}
console.log(`共 ${json.query?.searchinfo?.totalhits ?? 0} 命中`);
