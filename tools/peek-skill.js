// 临时检查:查看 skills.json 中指定索引的条目
import { readFileSync } from 'node:fs';
const skills = JSON.parse(readFileSync('data/skills.json', 'utf8'));
const targets = ['消融在爱中吧', '誓不罢休', '扩散的担忧', '干柴烈火', '天骄', '舞艺'];
for (const t of targets) {
  const list = skills.filter(s => s.name.includes(t));
  for (const s of list) {
    console.log(`■ ${s.name} [${s.precision}] condition=${JSON.stringify(s.condition)} restriction=${JSON.stringify(s.restriction)}`);
  }
}
