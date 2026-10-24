import { useMemo, useState } from 'react';
import { simulate } from '@uma-race-sim/engine';
import { ablate } from '@uma-race-sim/analysis';
import { AblationTable } from './components/AblationTable';
import { Chart } from './components/Chart';
import { ConfigPanel } from './components/ConfigPanel';
import { TrackBar } from './components/TrackBar';
import { DEFAULT_CONFIG, buildRunner, findCourse, fmtSec, type UiConfig } from './lib/sim';

export function App(): JSX.Element {
  const [config, setConfig] = useState<UiConfig>(DEFAULT_CONFIG);
  const [plotArea, setPlotArea] = useState<{ left: number; width: number } | undefined>(undefined);

  const course = useMemo(() => findCourse(config.courseId), [config.courseId]);
  const runner = useMemo(() => buildRunner(config), [config]);
  const result = useMemo(() => simulate(course, runner), [course, runner]);
  const report = useMemo(
    () => (config.skillIds.length > 0 ? ablate(course, runner) : null),
    [course, runner, config.skillIds.length],
  );

  const hpPct = useMemo(() => {
    const arr = new Float64Array(result.hp.length);
    for (let i = 0; i < result.hp.length; i++) arr[i] = (result.hp[i]! / result.maxHp) * 100;
    return arr;
  }, [result]);

  const activatedCount = result.activations.length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>uma-race-sim · 赛马娘赛道模拟器</h1>
        <span className="sub">
          单马确定性期望模型 · 校准基准:东京草2400 无技能 116.747s(参考 116.987s)· v0.1 开发版
        </span>
      </header>

      <div className="result-summary">
        <span className="big">{fmtSec(result.finishTimeSec)}</span>
        <span className="item">完赛时间({result.finishTimeSec.toFixed(2)}s)</span>
        <span className="item">
          赛道 <b>{course.name}</b>
        </span>
        <span className="item">
          技能发动 <b>{activatedCount}/{config.skillIds.length}</b>
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
      </div>

      <div className="layout">
        <ConfigPanel config={config} onChange={setConfig} />

        <div style={{ display: 'grid', gap: 12 }}>
          <section className="panel">
            <h2>赛道条(弯道 / 坡度 / 阶段 / 技能发动位置,与下图按距离对齐)</h2>
            <TrackBar course={course} activations={result.activations} exhaustedAtMeter={result.exhaustedAtMeter} align={plotArea} />
          </section>

          <section className="panel">
            <Chart x={result.x} v={result.v} hpPct={hpPct} onPlotArea={setPlotArea} />
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
        非官方同人开源工具(GPL-3.0),与 Cygames/bilibili 无关;《赛马娘 Pretty Derby》名称与商标归各权利方所有。
        数据来源:BWIKI 技能速查表与社区解包研究;数值仅作育成参考。随机机制(焦躁/追比/多马阻挡等)不参与 v0.1 计算,近似项已在界面标注。
      </p>
    </div>
  );
}
