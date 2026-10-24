// 临时检查:赛道弯道/直线段结构 + 指定技能解析
import { readFileSync } from 'node:fs';
const courses = JSON.parse(readFileSync('data/courses.json', 'utf8'));
const kw = process.argv[2];
const c = courses.find(x => x.name.includes(kw));
if (c === undefined) {
  console.log('未找到赛道');
} else {
  console.log(`${c.name}(${c.id}) 阶段=${JSON.stringify(c.phaseBounds)}`);
  console.log(`弯道: ${c.corners.map(x => `${x.n}:${x.start}-${x.end}`).join(' ')}`);
  console.log(`坡道: ${c.slopes.map(x => `${x.start}-${x.end}m ${x.gradient}%`).join(' | ') || '(无)'}`);
  const gaps = [];
  let cursor = 0;
  for (const k of c.corners) {
    if (k.start > cursor) gaps.push([cursor, k.start]);
    cursor = Math.max(cursor, k.end);
  }
  if (cursor < c.distance) gaps.push([cursor, c.distance]);
  console.log(`直线段: ${gaps.map(g => `${Math.round(g[0])}-${Math.round(g[1])}(${Math.round(g[1] - g[0])}m)`).join(' ')}`);
  console.log(`终盘窗口 [${c.phaseBounds.lateStart}, ${c.phaseBounds.finalStart}], 最终盘 [${c.phaseBounds.finalStart}, ${c.distance}]`);
}
const skills = JSON.parse(readFileSync('data/skills.json', 'utf8'));
const raw = JSON.parse(readFileSync('data/raw/skills.raw.json', 'utf8')).results;
const kw2 = process.argv[3];
if (kw2 !== undefined) {
  for (const s of skills.filter(s => s.name.includes(kw2))) {
    const r = raw.find(x => String(x.props['ID']) === s.id.replace(/-b\d$/, ''));
    console.log(`■ ${s.name}: 原始=${JSON.stringify(r?.props['触发条件'])} → 解析=${JSON.stringify(s.condition)}`);
  }
}
