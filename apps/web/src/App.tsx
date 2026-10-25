import { useCallback, useMemo, useState } from 'react';
import { BODY_LENGTH_METERS, simulate } from '@uma-race-sim/engine';
import type { SimResult } from '@uma-race-sim/engine';
import { ablate } from '@uma-race-sim/analysis';
import { AblationTable } from './components/AblationTable';
import { Chart } from './components/Chart';
import { ConfigPanel } from './components/ConfigPanel';
import { TrackBar } from './components/TrackBar';
import { DEFAULT_CONFIG, buildRunner, findCourse, fmtSec, type UiConfig } from './lib/sim';

export function App(): JSX.Element {
  const [config, setConfig] = useState<UiConfig>(DEFAULT_CONFIG);
  /** 两图联动悬停:赛道条与曲线图共享的全局悬停距离(null = 无悬停) */
  const [hoverMeter, setHoverMeter] = useState<number | null>(null);
  /** 曲线图绘图区 bbox 上报(仅作赛道条几何重测量的触发器) */
  const [plotArea, setPlotArea] = useState<{ left: number; width: number } | undefined>(undefined);

  const course = useMemo(() => findCourse(config.courseId), [config.courseId]);
  const runner = useMemo(() => buildRunner(config), [config]);
  const result = useMemo(() => simulate(course, runner), [course, runner]);
  const report = useMemo(
    () => (config.skillIds.length > 0 ? ablate(course, runner) : null),
    [course, runner, config.skillIds.length],
  );

  /** 赛道条 tooltip 的数据快照:悬停距离 → 最近帧的速度/体力(result.x 单调,二分) */
  const describePoint = useCallback(
    (m: number): string => {
      const xs = result.x;
      let lo = 0;
      let hi = xs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((xs[mid] ?? 0) < m) lo = mid + 1;
        else hi = mid;
      }
      const i = Math.min(lo, xs.length - 1);
      const v = result.v[i] ?? 0;
      const hp = result.hp[i] ?? 0;
      return `速度 ${v.toFixed(2)} m/s · 体力 ${((hp / result.maxHp) * 100).toFixed(1)}%`;
    },
    [result],
  );

  const hpPct = useMemo(() => {
    const arr = new Float64Array(result.hp.length);
    for (let i = 0; i < result.hp.length; i++) arr[i] = (result.hp[i]! / result.maxHp) * 100;
    return arr;
  }, [result]);

  /** 适性 S↔A 马身差:同配置下分别以 S/A 模拟(距离适性影响终盘/末脚速度与加速度,场地适性影响加速度) */
  const aptCompare = useMemo(() => {
    const distS = simulate(course, { ...runner, distanceAptitude: 'S' });
    const distA = simulate(course, { ...runner, distanceAptitude: 'A' });
    const surfS = simulate(course, { ...runner, surfaceAptitude: 'S' });
    const surfA = simulate(course, { ...runner, surfaceAptitude: 'A' });
    const endV = distS.spurtTargetSpeed;
    const diff = (s: SimResult, a: SimResult) => {
      const deltaSec = a.finishTimeSec - s.finishTimeSec; // >0 = S 更快
      return { deltaSec, deltaBody: (deltaSec * endV) / BODY_LENGTH_METERS };
    };
    return { distance: diff(distS, distA), surface: diff(surfS, surfA) };
  }, [course, runner]);

  /**
   * 耐力温存判定(614tools 耐力计算器口径):
   * 探针模拟(体力可降至负、不温存)求"不温存跑完全程所需 HP"= maxHp − min(hp);
   * 温存回避线 = 所需 ×1.04(判定余量)×1.05(默认安全余量);
   * 到达度 = maxHp / 回避线;结论:≥100% 余量充足 / 实际能跑完但 <100% 无余量 / 否则耐力不足。
   */
  const staminaJudge = useMemo(() => {
    const probe = simulate(course, runner, { ignoreExhaustion: true });
    let minHp = Infinity;
    for (let i = 0; i < probe.hp.length; i++) minHp = Math.min(minHp, probe.hp[i]!);
    const required = result.maxHp - minHp;
    const avoidLine = required * 1.04 * 1.05;
    const reach = (result.maxHp / avoidLine) * 100;
    const margin = result.maxHp - avoidLine;
    const verdict: 'safe' | 'tight' | 'short' =
      reach >= 100 ? 'safe' : required <= result.maxHp ? 'tight' : 'short';
    return { required, avoidLine, reach, margin, verdict };
  }, [course, runner, result.maxHp]);

  const activatedCount = result.activations.length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>uma-race-sim · 赛马娘赛道模拟器</h1>
        <span className="sub">
          单马确定性期望模型 · 赛道补正按门槛属性自动计算 · 与游戏实录基准偏差 0.26s · v0.3 开发版
        </span>
      </header>

      <div className="result-summary">
        <span className="big">{fmtSec(result.finishTimeSec)}</span>
        <span className="item">完赛时间({result.finishTimeSec.toFixed(2)}s)</span>
        <span className="item">
          赛道 <b>{course.name}</b>
        </span>
        <span className="item">
          技能发动 <b>{activatedCount}/{runner.skills.length}</b>
        </span>
        <span className="item warn">
          {result.exhaustedAtMeter === null ? '体力充足' : `体力归零 @ ${Math.round(result.exhaustedAtMeter)}m(温存)`}
        </span>
        {report !== null && (
          <span className="item">
            全技能总收益 <b className={report.totalDeltaSec >= 0 ? 'pos' : 'neg'}>
              {report.totalDeltaSec >= 0 ? '+' : ''}
              {((report.totalDeltaSec * 20) / 2.5).toFixed(2)}
            </b> 马身(约)
          </span>
        )}
        <span className="item" title="同配置下分别以适性 S 与 A 模拟:距离适性影响终盘/末脚速度与加速度,场地适性影响加速度;正值 = S 比 A 快">
          适性 S−A:距离 <b className="pos">+{aptCompare.distance.deltaBody.toFixed(2)}</b> / 场地{' '}
          <b className="pos">+{aptCompare.surface.deltaBody.toFixed(2)}</b> 马身
        </span>
        <span
          className={`item ${staminaJudge.verdict === 'safe' ? '' : 'warn'}`}
          title={
            '耐力温存判定(温存回避口径):不温存跑完全程所需 HP ' +
            `${Math.round(staminaJudge.required)} × 1.04(判定余量) × 1.05(安全余量) = 回避线 ` +
            `${Math.round(staminaJudge.avoidLine)};体力上限 ${Math.round(result.maxHp)};` +
            '到达度 = 上限/回避线,≥100% 判定余量充足。'
          }
        >
          耐力判定{' '}
          <b className={staminaJudge.verdict === 'safe' ? 'pos' : staminaJudge.verdict === 'tight' ? '' : 'neg'}>
            {staminaJudge.verdict === 'safe' ? '余量充足' : staminaJudge.verdict === 'tight' ? '无余量' : '耐力不足'}
          </b>{' '}
          ({staminaJudge.margin >= 0 ? '+' : ''}
          {Math.round(staminaJudge.margin)}HP · 到达度 {staminaJudge.reach.toFixed(1)}%)
        </span>
      </div>

      <div className="layout">
        <ConfigPanel config={config} onChange={setConfig} />

        <div style={{ display: 'grid', gap: 12 }}>
          <section className="panel">
            <h2>赛道条(弯道 / 坡度 / 阶段 / 技能发动位置,与下图按距离对齐)</h2>
            <TrackBar
              course={course}
              activations={result.activations}
              exhaustedAtMeter={result.exhaustedAtMeter}
              hoverMeter={hoverMeter}
              onHover={setHoverMeter}
              align={plotArea}
              describePoint={describePoint}
            />
          </section>

          <section className="panel">
            <Chart x={result.x} v={result.v} hpPct={hpPct} hoverMeter={hoverMeter} onHover={setHoverMeter} onPlotArea={setPlotArea} />
          </section>

          <section className="panel">
            <h2>每技能马身收益(leave-one-out 消融)</h2>
            {report !== null ? (
              <AblationTable report={report} />
            ) : (
              <p className="note">在左侧搜索并点选技能后,这里显示每个技能的发动位置与马身收益。</p>
            )}
          </section>
        </div>
      </div>

      <p className="disclaimer">
        由 mioX 通过 AI 制作,仅供个人测试使用,非官方同人开源工具(GPL-3.0),与 Cygames/bilibili 无关;《赛马娘 Pretty Derby》名称与商标归各权利方所有。
        数据来源:公开解包数据与社区攻略资料整理;数值仅作育成参考。随机机制(焦躁/追比/多马阻挡等)不参与 v0.1 计算,近似项已在界面标注。
      </p>
    </div>
  );
}
