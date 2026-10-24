// 临时工具:SMW browsebysubject 查看页面全部属性 / 测试 prop=revisions 批量
const mode = process.argv[2];
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' };

if (mode === 'browse') {
  const subject = process.argv[3];
  const url = `https://wiki.biligame.com/umamusume/api.php?action=browsebysubject&format=json&subject=${encodeURIComponent(subject)}`;
  const res = await fetch(url, { headers: UA });
  console.log(`HTTP ${res.status}`);
  if (res.ok) {
    const json = await res.json();
    const props = json.query?.data ?? [];
    for (const p of props) {
      const vals = (p.dataitem ?? []).map(d => d.value ?? d).join(',');
      if (vals !== '') console.log(`  ${p.property} = ${String(vals).slice(0, 60)}`);
    }
  }
} else if (mode === 'revisions') {
  const titles = process.argv.slice(3);
  const url = `https://wiki.biligame.com/umamusume/api.php?action=query&format=json&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(titles.join('|'))}`;
  const res = await fetch(url, { headers: UA });
  console.log(`HTTP ${res.status}`);
  if (res.ok) {
    const json = await res.json();
    const pages = json.query?.pages ?? {};
    for (const page of Object.values(pages)) {
      const content = page.revisions?.[0]?.slots?.main?.['*'] ?? '(无内容)';
      console.log(`--- ${page.title} ---`);
      console.log(content.slice(0, 150));
    }
  }
}
