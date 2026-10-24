import { describe, test } from 'vitest';

/**
 * 校准基准(硬门)。
 * 启用条件:D2~D3 真实东京草2400 赛道数据 + D7~D8 校准常量(跑法×阶段速度系数、体力上限公式等,
 * 见 docs/formulas.md 的 TODO(calibration) 清单)注入后,把 test.todo 换成断言:
 *   expect(simulate(TOKYO, noSkillRunner).finishTimeSec).toBeCloseTo(116.987, 0) 且 |Δ| ≤ 0.5
 */
describe('校准基准', () => {
  test.todo('无技能 东京草2400 完赛时间 = 116.987s ± 0.5s(614tools 公开基准)');
});
