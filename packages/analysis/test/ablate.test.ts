import { describe, expect, test } from 'vitest';
import { ablate } from '../src/ablate';
import { freshRunner, speedSkill, TOKYO_TURF_2400 as C } from '@uma-race-sim/engine/test/fixtures';

describe('leave-one-out 消融', () => {
  const s1 = speedSkill('sp-a', 0.3, 10);
  const s2 = speedSkill('sp-b', 0.5, 10);
  const rep = ablate(C, freshRunner([s1, s2]));

  test('每个技能一行,均发动且为正收益', () => {
    expect(rep.rows).toHaveLength(2);
    for (const r of rep.rows) {
      expect(r.activated).toBe(true);
      expect(r.deltaSec).toBeGreaterThan(0);
      expect(r.deltaMeter).toBeGreaterThan(0);
      expect(r.deltaBody).toBeCloseTo(r.deltaMeter / 2.5, 6);
    }
  });

  test('总收益大于任一单项', () => {
    expect(rep.totalDeltaSec).toBeGreaterThan(rep.rows[0]!.deltaSec);
    expect(rep.totalDeltaSec).toBeGreaterThan(rep.rows[1]!.deltaSec);
  });

  test('体力充足且无交互时,Σ单项 ≈ 总收益', () => {
    expect(Math.abs(rep.sumDeltaSec - rep.totalDeltaSec)).toBeLessThan(rep.totalDeltaSec * 0.1 + 0.05);
  });

  test('不支持的技能:不计收益,activated=false', () => {
    const bad = speedSkill('bad', 1.0, 10, { precision: 'unsupported' });
    const r = ablate(C, freshRunner([bad]));
    expect(r.rows[0]!.activated).toBe(false);
    expect(r.rows[0]!.deltaSec).toBe(0);
    expect(r.totalDeltaSec).toBe(0);
  });
});
