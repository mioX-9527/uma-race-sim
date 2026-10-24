/**
 * 数据校验:data/courses.json 与 data/skills.json 必须通过 packages/schema 的 zod 校验。
 * CI 与数据 PR 前运行:node tools/validate-data.ts
 */
import { readFileSync } from 'node:fs';
import { parseCourses, parseSkills } from '../packages/schema/src/schema.ts';

let failed = false;

function validate<T>(file: string, parse: (json: unknown) => T[], label: string): T[] | null {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`✗ ${label}:读取/解析失败 ${String(err)}`);
    failed = true;
    return null;
  }
  try {
    const data = parse(json);
    console.log(`✓ ${label}:${data.length} 条通过校验`);
    return data;
  } catch (err) {
    const issues = (err as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues ?? [];
    console.error(`✗ ${label}:${issues.length} 处不合规,前 10 条:`);
    for (const i of issues.slice(0, 10)) {
      console.error(`  - [${i.path.join('.')}] ${i.message}`);
    }
    failed = true;
    return null;
  }
}

const courses = validate('data/courses.json', parseCourses, 'courses');
const skills = validate('data/skills.json', parseSkills, 'skills');

if (courses !== null) {
  const venues = new Set(courses.map(c => c.venue));
  console.log(`  赛场数:${venues.size}(${[...venues].join('/')})`);
}
if (skills !== null) {
  const byPrecision = { precise: 0, approx: 0, unsupported: 0 };
  for (const s of skills) byPrecision[s.precision]++;
  console.log(`  精度分层:精确 ${byPrecision.precise} / 近似 ${byPrecision.approx} / 不支持 ${byPrecision.unsupported}`);
}

if (failed) process.exit(1);
