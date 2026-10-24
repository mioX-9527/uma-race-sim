// 临时工具:中山2500 赛道信息
import { readFileSync } from 'node:fs';
const c = JSON.parse(readFileSync('data/courses.json', 'utf8'));
const hit = c.filter(x => x.venue === '中山' && x.distance === 2500);
for (const x of hit) {
  console.log(x.id, x.name, 'surface', x.surface, 'distanceType', x.distanceType);
  console.log('corners:', JSON.stringify(x.corners));
  console.log('phaseBounds:', JSON.stringify(x.phaseBounds));
  const s = JSON.parse(readFileSync('data/skills.json', 'utf8'));
  const maestro = s.find(y => y.id === '200331');
  console.log('弧线大师:', JSON.stringify({ condition: maestro.condition, cd: maestro.cooldownSec, dur: maestro.durationSec, value: maestro.effects[0].value }));
  const shadow = s.find(y => y.id === '200641');
  console.log('迫近的暗影:', JSON.stringify({ condition: shadow.condition, restriction: shadow.restriction, precision: shadow.precision }));
}
