// 临时工具:抽查清洗结果
import { readFileSync } from 'node:fs';
const skills = JSON.parse(readFileSync('data/skills.json', 'utf8'));
const pick = (id) => {
  const s = skills.filter(x => x.id === id || x.id.startsWith(id + '-b'));
  for (const x of s) console.log(JSON.stringify(x, null, 1));
};
console.log('=== 迫る影 200641(追马末脚直线) ===');
pick('200641');
console.log('=== 円弧のマエストロ 200331(每弯道,冷却30s) ===');
pick('200331');
console.log('=== always==1 样本 200431 ===');
pick('200431');
console.log('=== distance_rate 窗口 10071 ===');
pick('10071');
console.log('=== 最终弯道后半 100101 ===');
pick('100101');
console.log('=== remain_distance 200m 10081 ===');
pick('10081');
console.log('=== track_id 范围 JRA 120171 ===');
pick('120171');
console.log('=== ground_condition 良 200151 ===');
pick('200151');
console.log('=== 看台对面直线 100681 ===');
pick('100681');
console.log('=== 第三弯道+行进50% 100961 ===');
pick('100961');
// 精度分布核对
const dist = {};
for (const s of skills) dist[s.precision] = (dist[s.precision] ?? 0) + 1;
console.log('精度分布:', dist);
// 条件种类分布
const kinds = {};
for (const s of skills) kinds[s.condition.kind] = (kinds[s.condition.kind] ?? 0) + 1;
console.log('条件种类:', Object.fromEntries(Object.entries(kinds).sort((a, b) => b[1] - a[1])));
// 有冷却的技能数
console.log('带冷却技能:', skills.filter(s => s.cooldownSec !== undefined).length, '例:', skills.filter(s => s.cooldownSec !== undefined).slice(0, 5).map(s => `${s.id}@${s.cooldownSec}s`));
// 多效果槽技能
const multi = skills.filter(s => s.effects.length > 1 && s.effects.every(e => e.type !== 'unsupported'));
console.log('多效果槽技能:', multi.length, '例:', multi.slice(0, 5).map(s => `${s.name}:${s.effects.map(e => e.type + '+' + e.value).join('/')}`));
