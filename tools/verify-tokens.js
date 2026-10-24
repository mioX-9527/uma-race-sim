// 一次性工具:corner/ground_type/ground_condition/slope/distance_type 语义交叉验证
import { readFileSync } from 'node:fs';
const lua = JSON.parse(readFileSync('data/raw/skill-data-lua.json', 'utf8'));
const raw = JSON.parse(readFileSync('data/raw/skills.raw.json', 'utf8'));
const byId = new Map();
for (const e of raw.results) {
  const id = String(e.props.ID ?? '').trim();
  if (id && !byId.has(id)) byId.set(id, e.props);
}
const show = (label, filter, n = 4) => {
  console.log(`\n=== ${label} ===`);
  let c = 0;
  for (const r of lua) {
    if (!filter(r)) continue;
    const p = byId.get(r.id);
    console.log(
      `${r.id} [${r.condition_1}${r.condition_2 ? ' ##2:' + r.condition_2 : ''}]\n   限制:${String(p?.条件限制 ?? '')}  触发:${String(p?.触发条件 ?? '').replace(/<br\s*\/?>/gi, ' | ').slice(0, 90)}`
    );
    if (++c >= n) break;
  }
};
const has = (r, tok) =>
  [r.condition_1, r.condition_2, r.precondition_1, r.precondition_2].filter(Boolean).some((c) => c.includes(tok));

show('corner==1', (r) => has(r, 'corner==1'));
show('corner==3', (r) => has(r, 'corner==3'));
show('corner!=0', (r) => has(r, 'corner!=0'));
show('ground_type==2', (r) => has(r, 'ground_type==2'));
show('ground_type==1', (r) => has(r, 'ground_type==1'));
show('ground_condition==1', (r) => has(r, 'ground_condition==1'));
show('ground_condition==4', (r) => has(r, 'ground_condition==4'));
show('slope==1', (r) => has(r, 'slope==1'));
show('slope==2', (r) => has(r, 'slope==2'));
show('distance_type==1', (r) => has(r, 'distance_type==1'));
show('distance_type==4', (r) => has(r, 'distance_type==4'));
show('lastspurt==2', (r) => has(r, 'lastspurt==2'));
show('is_last_straight==1', (r) => has(r, 'is_last_straight==1'));
show('track_id 范围', (r) => has(r, 'track_id>='));
show('course_distance>=', (r) => has(r, 'course_distance>='));
