import { describe, expect, test } from 'vitest';
import { simulate } from '../src/simulate';
import { makeRunner, speedSkill, TOKYO_TURF_2400 as C } from './fixtures';

describe('体力探针模式(ignoreExhaustion)', () => {
  test('低耐力:正常模拟温存变慢,探针模拟不温存且 hp 可为负', () => {
    const weak = makeRunner({ stats: { speed: 2400, stamina: 200, power: 1700, guts: 1200, wisdom: 1800 } });
    const normal = simulate(C, weak);
    const probe = simulate(C, weak, { ignoreExhaustion: true });
    expect(normal.exhaustedAtMeter).not.toBeNull();
    // 探针不温存 → 更快完赛
    expect(probe.finishTimeSec).toBeLessThan(normal.finishTimeSec);
    // 探针 hp 贯穿为负(不温存),且 exhaustedAtMeter 仍记录首次归零
    expect(probe.hp[probe.hp.length - 1]!).toBeLessThan(0);
    expect(probe.exhaustedAtMeter).not.toBeNull();
    // 不温存跑完全程所需 HP = maxHp − min(hp)
    let minHp = Infinity;
    for (const v of probe.hp) minHp = Math.min(minHp, v!);
    expect(probe.maxHp - minHp).toBeGreaterThan(probe.maxHp);
  });

  test('高耐力:探针与正常模拟一致(不触发归零)', () => {
    const rich = makeRunner({ stats: { speed: 2200, stamina: 5000, power: 1700, guts: 1200, wisdom: 1800 } });
    const normal = simulate(C, rich);
    const probe = simulate(C, rich, { ignoreExhaustion: true });
    expect(probe.finishTimeSec).toBeCloseTo(normal.finishTimeSec, 6);
  });

  test('回体技能推迟体力归零点并加快完赛(体力预算重算→全程末脚)', () => {
    const base = { stats: { speed: 2400, stamina: 400, power: 1700, guts: 1200, wisdom: 1800 } };
    const heal = { ...speedSkill('h', 0, 0), effects: [{ type: 'heal' as const, value: 0.35 }], durationSec: null, condition: { kind: 'phase' as const, phase: 1 as const } };
    const noHeal = simulate(C, makeRunner(base));
    const withHeal = simulate(C, makeRunner({ ...base, skills: [heal] }));
    expect(withHeal.exhaustedAtMeter === null || withHeal.exhaustedAtMeter > noHeal.exhaustedAtMeter!).toBe(true);
    expect(withHeal.finishTimeSec).toBeLessThan(noHeal.finishTimeSec);
  });
});
