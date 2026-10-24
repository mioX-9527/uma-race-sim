import type { ConditionBase, Course, PhaseId, SkillCondition } from './types';

/** 赛道上的可发动区间 [from, to](米);from === to 表示"越过 from 即触发"的点条件 */
export type Region = readonly [number, number];

export interface FrameState {
  readonly t: number;
  readonly x: number;
  readonly phase: PhaseId;
}

function boundOf(course: Course, key: ConditionBase | PhaseId): number {
  const b = course.phaseBounds;
  switch (key) {
    case 'start':
    case 0:
      return 0;
    case 'midStart':
    case 1:
      return b.midStart;
    case 'lateStart':
    case 2:
      return b.lateStart;
    case 'finalStart':
    case 3:
      return b.finalStart;
  }
}

function phaseEndOf(course: Course, phase: PhaseId): number {
  switch (phase) {
    case 0:
      return course.phaseBounds.midStart;
    case 1:
      return course.phaseBounds.lateStart;
    case 2:
      return course.phaseBounds.finalStart;
    case 3:
      return course.distance;
  }
}

/** 赛道直线段(弯道之间的空隙) */
export function straightGaps(course: Course): readonly Region[] {
  const gaps: Region[] = [];
  let cursor = 0;
  for (const c of course.corners) {
    if (c.start > cursor) gaps.push([cursor, c.start]);
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < course.distance) gaps.push([cursor, course.distance]);
  return gaps;
}

/**
 * 静态条件 → 赛道上的可发动区间(设计思路参考 uma-skill-tools ConditionParser,见 THIRD_PARTY.md)。
 * 无法静态化的时间类条件返回全区间,交给 dynamicSatisfied 逐帧判定。
 */
export function activationRegions(cond: SkillCondition, course: Course): readonly Region[] {
  const L = course.distance;
  const late = course.phaseBounds.lateStart;
  const phaseFilter = 'phaseFilter' in cond ? cond.phaseFilter : undefined;
  switch (cond.kind) {
    case 'raceStart':
      return [[0, 0]];
    case 'phase': {
      const from = boundOf(course, cond.phase);
      const to = cond.phase < 3 ? boundOf(course, (cond.phase + 1) as PhaseId) : L;
      return [[from, to]];
    }
    case 'phaseAfter':
      return [[boundOf(course, cond.phase), L]];
    case 'cornerN': {
      const c = course.corners[cond.n - 1];
      return c ? [[c.start, c.end]] : [];
    }
    case 'cornerFastest': {
      const list = phaseFilter !== undefined
        ? course.corners.filter(c => c.end > boundOf(course, phaseFilter) && c.start < phaseEndOf(course, phaseFilter))
        : course.corners;
      const c = list[0];
      return c ? [[c.start, c.end]] : [];
    }
    case 'finalCorner': {
      const c = course.corners[course.corners.length - 1];
      return c ? [[c.start, c.end]] : [];
    }
    case 'thirdCornerFromEnd': {
      const c = course.corners[course.corners.length - 3];
      return c ? [[c.start, c.end]] : [];
    }
    case 'lateCorner': {
      const c = course.corners.find(c => c.end > late);
      return c ? [[Math.max(c.start, late), c.end]] : [];
    }
    case 'midCorner': {
      const mid = course.phaseBounds.midStart;
      const c = course.corners.find(c => c.end > mid);
      return c ? [[Math.max(c.start, mid), c.end]] : [];
    }
    case 'finalStraight': {
      const last = course.corners[course.corners.length - 1];
      const from = last ? last.end : 0;
      return from < L ? [[from, L]] : [];
    }
    case 'straightFastest': {
      const gaps = phaseFilter !== undefined
        ? straightGaps(course).filter(g => g[1] > boundOf(course, phaseFilter) && g[0] < phaseEndOf(course, phaseFilter))
        : straightGaps(course);
      const g = gaps[0];
      return g ? [g] : [];
    }
    case 'lateStraight': {
      const g = straightGaps(course).find(g => g[1] > late);
      return g ? [[Math.max(g[0], late), g[1]]] : [];
    }
    case 'uphillFastest': {
      const list = phaseFilter !== undefined
        ? course.slopes.filter(s => s.gradient > 0 && s.end > boundOf(course, phaseFilter) && s.start < phaseEndOf(course, phaseFilter))
        : course.slopes.filter(s => s.gradient > 0);
      const s = list[0];
      return s ? [[s.start, s.end]] : [];
    }
    case 'downhillFastest': {
      const list = phaseFilter !== undefined
        ? course.slopes.filter(s => s.gradient < 0 && s.end > boundOf(course, phaseFilter) && s.start < phaseEndOf(course, phaseFilter))
        : course.slopes.filter(s => s.gradient < 0);
      const s = list[0];
      return s ? [[s.start, s.end]] : [];
    }
    case 'distanceRun': {
      const p = Math.min(boundOf(course, cond.base) + cond.meters, L);
      return [[p, p]];
    }
    case 'distanceLeft': {
      const p = Math.max(L - cond.meters, 0);
      return [[p, p]];
    }
    case 'elapsedSec':
      return [[0, L]];
    case 'positionPct': {
      const p = (L * cond.pct) / 100;
      return [[p, p]];
    }
  }
}

export function inRegion(r: Region, x: number): boolean {
  return r[0] === r[1] ? x >= r[0] : x >= r[0] && x <= r[1];
}

/** 区间命中后的动态谓词;返回 true 表示本帧可发动 */
export function dynamicSatisfied(cond: SkillCondition, s: FrameState): boolean {
  switch (cond.kind) {
    case 'elapsedSec':
      // v0.1 精确层仅支持基准=起步;其余基准属近似层,由数据侧标记 approx
      return cond.base === 'start' && s.t >= cond.seconds;
    default:
      return true;
  }
}
