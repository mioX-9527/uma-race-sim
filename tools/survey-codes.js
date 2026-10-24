// 一次性工具:触发代码语义普查 —— 用 SMW 中文文本交叉验证数值映射
import { readFileSync } from 'node:fs';

const lua = JSON.parse(readFileSync('data/raw/skill-data-lua.json', 'utf8'));
const raw = JSON.parse(readFileSync('data/raw/skills.raw.json', 'utf8'));
const byId = new Map();
for (const e of raw.results) {
  const id = String(e.props.ID ?? '').trim();
  if (id) byId.set(id, e.props);
}
console.log(`SMW 唯一ID:${byId.size},Lua:${lua.length}`);
const luaIds = new Set(lua.map((r) => r.id));
let matched = 0;
for (const id of byId.keys()) if (luaIds.has(id)) matched++;
console.log(`SMW∩Lua:${matched}(SMW 有而 Lua 无:${byId.size - matched})`);

// 取值分布:distance_type/ground_type/phase/slope/target_type/time_usage/precondition
const dist = {};
const sample = (key, n = 3) => {
  const out = [];
  for (const r of lua) {
    const m = (r.condition_1 + '&' + r.condition_2 + '&' + r.precondition_1 + '&' + r.precondition_2).match(
      new RegExp(key + '(==|>=|<=|>|<|!=)([0-9.\\-]+)', 'g')
    );
    if (m) {
      out.push([r.id, m.join(';'), (byId.get(r.id)?.触发条件 ?? [''])[0] ?? '']);
      if (out.length >= n) break;
    }
  }
  return out;
};
for (const tok of [
  'distance_type', 'ground_type', 'phase_random', 'phase_firsthalf_random', 'phase_laterhalf_random',
  'phase_corner_random', 'slope', 'is_finalcorner_laterhalf', 'accumulatetime', 'course_distance',
  'track_id', 'ground_condition', 'is_lastspurt', 'lastspurt', 'corner', 'distance_rate',
  'remain_distance', 'always', 'hp_per', 'base_power', 'order_rate', 'order',
]) {
  const vals = new Map();
  for (const r of lua) {
    const hay = [r.condition_1, r.condition_2, r.precondition_1, r.precondition_2].filter(Boolean).join('&');
    for (const m of hay.matchAll(new RegExp(tok + '(==|>=|<=|>|<|!=)(-?[0-9.]+)', 'g'))) {
      const k = m[1] + m[2];
      vals.set(k, (vals.get(k) ?? 0) + 1);
    }
  }
  const top = [...vals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`\n${tok}: ${top.map(([k, c]) => `${k}×${c}`).join('  ')}`);
  for (const [id, code, text] of sample(tok, 2)) console.log(`   例 ${id}: ${code}  |中文:${String(text).slice(0, 60)}`);
}

// target_type / usage 分布
const tt = new Map();
for (const r of lua)
  for (const s of [1, 2])
    for (let e = 1; e <= 3; e++) {
      const v = r[`ability_type_${s}_${e}`];
      const t = r[`target_type_${s}_${e}`];
      if (v && v !== '0') {
        const k = `${v}/${t}`;
        tt.set(k, (tt.get(k) ?? 0) + 1);
      }
    }
console.log('\nability_type/target_type 组合(top15):');
[...tt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, c]) => console.log(`  ${k} ×${c}`));

const tu = new Map();
for (const r of lua)
  for (const s of [1, 2]) {
    const v = r[`ability_time_usage_${s}`];
    if (v) tu.set(v, (tu.get(v) ?? 0) + 1);
  }
console.log('ability_time_usage:', [...tu.entries()]);

// 被动技能数值缩放:找 ability_type 1-5 的样本
console.log('\n被动样本:');
for (const r of lua) {
  const t = r.ability_type_1_1;
  if (['1', '2', '3', '4', '5'].includes(t)) {
    const smw = byId.get(r.id);
    console.log(
      `  ${r.id} type=${t} value=${r.float_ability_value_1_1} time=${r.float_ability_time_1} cd=${r.float_cooldown_time_1} cond=${r.condition_1} |SMW类型:${String(smw?.技能类型 ?? '?').slice(0, 30)} 数值:${String(smw?.技能数值 ?? '?').slice(0, 20)}`
    );
    if (++seenPassive >= 4) break;
  }
}
let seenPassive = 0;

// 模板里 target_table 的用法
const mod = readFileSync('data/raw/lua-database.txt', 'utf8');
const ti = mod.indexOf('target_table[');
console.log('\n模块:数据库 中 target_table 用法:');
if (ti >= 0) console.log(mod.slice(ti - 300, ti + 400));
