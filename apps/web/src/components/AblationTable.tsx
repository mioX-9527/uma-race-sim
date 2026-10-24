import type { AblationReport } from '@uma-race-sim/analysis';
import { PRECISION_LABEL, SKILLS, describeCondition, describeEffects } from '../lib/sim';

/** 每技能马身收益(leave-one-out 消融) */
export function AblationTable({ report }: { report: AblationReport }): JSX.Element {
  const rows = [...report.rows].sort((a, b) => b.deltaBody - a.deltaBody);
  const order = report.rows; // 与赛道条编号一致

  return (
    <div>
      <div className="table-scroll">
      <table className="ablation">
        <thead>
          <tr>
            <th>#</th>
            <th>技能</th>
            <th className="left">发动条件 / 效果</th>
            <th>发动位置</th>
            <th>发动时刻</th>
            <th>Δ时间</th>
            <th>Δ距离</th>
            <th>马身收益</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const skill = SKILLS.find(s => s.id === r.skillId);
            const idx = order.findIndex(o => o.skillId === r.skillId) + 1;
            return (
              <tr key={r.skillId}>
                <td>{idx}</td>
                <td>
                  {r.name}
                  {skill !== undefined && <span className={`badge ${skill.precision}`}>{PRECISION_LABEL[skill.precision]}</span>}
                </td>
                <td className="left">
                  {skill !== undefined ? (
                    <>
                      <div>{describeCondition(skill.condition)}</div>
                      <div className="meta">{describeEffects(skill)}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{r.activatedAtMeter === null ? '—' : `${Math.round(r.activatedAtMeter)}m`}</td>
                <td>{r.activatedAtSec === null ? '—' : `${r.activatedAtSec.toFixed(2)}s`}</td>
                <td className={r.deltaSec > 0 ? 'pos' : 'neg'}>{r.deltaSec >= 0 ? '+' : ''}{r.deltaSec.toFixed(3)}s</td>
                <td className={r.deltaMeter > 0 ? 'pos' : 'neg'}>{r.deltaMeter >= 0 ? '+' : ''}{r.deltaMeter.toFixed(1)}m</td>
                <td className={r.deltaBody > 0 ? 'pos' : 'neg'}>{r.deltaBody >= 0 ? '+' : ''}{r.deltaBody.toFixed(2)}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)' }}>左侧搜索并点选技能后显示收益</td></tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={5}>Σ 单项收益(去重前)</td>
              <td>+{report.sumDeltaSec.toFixed(3)}s</td>
              <td>+{(report.sumDeltaSec * 20).toFixed(0)}m(约)</td>
              <td>+{(report.sumDeltaSec * 20 / 2.5).toFixed(2)}(约)</td>
            </tr>
            <tr>
              <td colSpan={5}>实测总收益(无技能 − 全技能)</td>
              <td>+{report.totalDeltaSec.toFixed(3)}s</td>
              <td colSpan={2}>+{(report.totalDeltaSec * 20 / 2.5).toFixed(2)} 马身(约)</td>
            </tr>
          </tfoot>
        )}
      </table>
      </div>
      <p className="note">
        收益 = 去掉该技能后完赛变慢的幅度(马身 = 米差/2.5)。Σ单项 ≠ 总收益属正常:技能间存在交互
        (回体技能改变后续发动位置、速度技能改变体力曲线)。未发动的技能不计收益。
      </p>
    </div>
  );
}
