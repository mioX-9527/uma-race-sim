// 临时检查:查看 skills.json 中指定索引的条目
import { readFileSync } from 'node:fs';
const skills = JSON.parse(readFileSync('data/skills.json', 'utf8'));
for (const i of (process.argv.slice(2).map(Number))) {
  console.log(JSON.stringify(skills[i], null, 1));
}
