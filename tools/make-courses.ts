/**
 * 赛道转换脚本:data/raw/course_data.json(uma-skill-tools,源自游戏解包)→ data/courses.json
 *
 * 转换要点:
 * - 阶段分界按解包公式:中盘=距离/6、终盘=2/3、最终盘=5/6
 * - 基准速度 = 20 − (距离−2000)/1000
 * - slope 原始单位为万分之一(slope=-15000 即 -1.5%),gradient(%) = slope/10000
 *   (与 RaceSolver 的 下坡加成 0.3+slope/100000、上坡减速 slope/10000×200/力量 一致)
 * - 赛场映射:10001~10010 = JRA 十场(札幌/函馆/新潟/福岛/中山/东京/中京/京都/阪神/小仓,
 *   其中 10006=东京、10005=中山、10008=京都 已用坡度指纹与赛道集合验证;
 *   10101~ 为地方赛场、10201~ 为海外赛场,按游戏内顺序映射,精度中等,待 BWIKI 抽查)
 * - 同赛场同距离同场地存在内外回り双赛道时,名称追加线路后缀
 */
import { readFileSync, writeFileSync } from 'node:fs';

const VENUES: Record<number, string> = {
  10001: '札幌', 10002: '函馆', 10003: '新潟', 10004: '福岛', 10005: '中山',
  10006: '东京', 10007: '中京', 10008: '京都', 10009: '阪神', 10010: '小仓',
  10101: '大井', 10103: '川崎', 10104: '船桥', 10105: '盛冈',
  10201: '隆尚', 10202: '圣安妮塔公园', 10203: '德尔马',
};
const DISTANCE_TYPES: Record<number, 'short' | 'mile' | 'mid' | 'long'> = { 1: 'short', 2: 'mile', 3: 'mid', 4: 'long' };
const STATS: Record<number, string> = { 1: 'speed', 2: 'stamina', 3: 'power', 4: 'guts', 5: 'wisdom' };

interface RawCourse {
  raceTrackId: number;
  distance: number;
  distanceType: number;
  surface: number;
  turn: number;
  courseSetStatus: number[];
  corners: Array<{ start: number; length: number }>;
  straights: Array<{ start: number; end: number; frontType: number }>;
  slopes: Array<{ start: number; length: number; slope: number }>;
}

const raw = JSON.parse(readFileSync('data/raw/course_data.json', 'utf8')) as Record<string, RawCourse>;

const out = Object.entries(raw).map(([courseId, c]) => {
  const venue = VENUES[c.raceTrackId] ?? `场地${c.raceTrackId}`;
  const surface = c.surface === 1 ? 'turf' : 'dirt';
  const d = c.distance;
  return {
    id: `c${courseId}`,
    name: `${venue} ${surface === 'turf' ? '草' : '泥'} ${d}m`,
    rawTrackId: c.raceTrackId,
    venue,
    distance: d,
    surface,
    distanceType: DISTANCE_TYPES[c.distanceType],
    corners: c.corners
      .map((x, i) => ({ n: i + 1, start: Math.round(x.start), end: Math.round(x.start + x.length) }))
      .sort((a, b) => a.start - b.start),
    slopes: c.slopes
      .map(x => ({
        start: Math.round(x.start),
        end: Math.round(x.start + x.length),
        gradient: Math.round((x.slope / 10000) * 100) / 100,
      }))
      .sort((a, b) => a.start - b.start),
    phaseBounds: {
      midStart: Math.round(d / 6),
      lateStart: Math.round((d * 2) / 3),
      finalStart: Math.round((d * 5) / 6),
    },
    baseSpeed: Math.round((20 - (d - 2000) / 1000) * 1000) / 1000,
    courseSetStatus: (c.courseSetStatus ?? []).map(s => STATS[s] ?? 'speed'),
  };
});

// 同赛场+距离+场地的双赛道(内外回り)追加线路后缀
const seen = new Map<string, number>();
for (const c of out) {
  const key = `${c.venue}|${c.surface}|${c.distance}`;
  const k = (seen.get(key) ?? 0) + 1;
  seen.set(key, k);
  if (k > 1) c.name = `${c.name}(线路${k})`;
}
for (const c of out) delete (c as { rawTrackId?: number }).rawTrackId;

writeFileSync('data/courses.json', JSON.stringify(out, null, 1), 'utf8');
console.log(`courses: ${out.length} 条 → data/courses.json`);

// 抽查 1:东京 草 2400 —— 对照 614tools 页脚公开事实(下坡 1250~1500m,-1.5%)
for (const c of out.filter(c => c.venue === '东京' && c.distance === 2400 && c.surface === 'turf')) {
  console.log(`\n[抽查] ${c.id} ${c.name} 阶段=${JSON.stringify(c.phaseBounds)} base=${c.baseSpeed}`);
  console.log(`  弯道: ${c.corners.map(x => `${x.n}:${x.start}-${x.end}`).join(' ')}`);
  console.log(`  坡道: ${c.slopes.map(x => `${x.start}-${x.end}m ${x.gradient}%`).join(' | ')}`);
}
// 抽查 2:京都应有内外双 1400/1600;中山应有 3600;隆尚仅 2400
const dupCount = (venue: string, dist: number): number =>
  out.filter(c => c.venue === venue && c.distance === dist && c.surface === 'turf').length;
console.log(`\n京都草1400×${dupCount('京都', 1400)} 京都草1600×${dupCount('京都', 1600)} 京都草3200×${dupCount('京都', 3200)}`);
console.log(`中山草3600×${dupCount('中山', 3600)} 隆尚草2400×${dupCount('隆尚', 2400)}`);
