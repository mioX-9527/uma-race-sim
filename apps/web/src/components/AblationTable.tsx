import { Fragment, useState } from 'react';
import type { AblationReport } from '@uma-race-sim/analysis';
import { PRECISION_LABEL, SKILLS, describeCondition, describeEffects } from '../lib/sim';

const signed = (v: number, digits: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;

/** 每技能马身收益(leave-one-out 消融);区段随机类技能显示联合抽样期望,可展开逐位置明细 */
export function AblationTable({ report }: { report: AblationReport }): JSX.Element {
  const rows = [...report.rows].sort((a, b) => (b.expectedBody ?? b.deltaBody) - (a.expectedBody ?? a.deltaBody));
  const order = report.rows; // 与赛道条编号一致
  const [expanded, setExpanded] = useState<string | null>(null);

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
            <th>马身收益</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const skill = SKILLS.find(s => s.id === r.skillId);
            const idx = order.findIndex(o => o.skillId === r.skillId) + 1;
            const sampled = r.positionSamples !== undefined && r.positionSamples.length > 0;
            const open = expanded === r.skillId;
            const body = r.expectedBody ?? r.deltaBody;
            return (
              <Fragment key={r.skillId}>
                <tr>
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
                  <td>
                    {r.activatedAtMeter === null
                      ? '—'
                      : r.activationCount > 1
                        ? `${Math.round(r.activatedAtMeter)}m ×${r.activationCount}次`
                        : `${Math.round(r.activatedAtMeter)}m`}
                  </td>
                  <td className={body > 0 ? 'pos' : 'neg'}>
                    {sampled ? (
                      <>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => setExpanded(open ? null : r.skillId)}
                          title="发动位置在满足区段内随机;点击展开逐位置收益明细"
                        >
                          {signed(body, 2)}(期望{open ? '▲' : '▼'})
                        </button>
                        <div className="meta">
                          区间 {signed(r.bodyRange![0], 2)} ~ {signed(r.bodyRange![1], 2)}
                        </div>
                      </>
                    ) : (
                      signed(r.deltaBody, 2)
                    )}
                  </td>
                </tr>
                {sampled && open && (
                  <tr className="sample-row">
                    <td colSpan={5}>
                      <div className="meta" style={{ padding: '2px 8px' }}>
                        位置采样(满足区段全长均匀取 {r.positionSamples!.length} 点,强制发动后消融;其余技能按规则发动):
                        {r.positionSamples!.map(s => (
                          <span key={s.meter} style={{ marginLeft: 10, whiteSpace: 'nowrap' }}>
                            {s.meter}m → <b className={s.deltaBody > 0 ? 'pos' : 'neg'}>{signed(s.deltaBody, 2)}</b>
                          </span>
                        ))}
                        。规则取位(进区段即发动)为 {signed(r.deltaBody, 2)} 马身,仅供对照。
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>左侧搜索并点选技能后显示收益</td></tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            {report.mcDraws !== undefined && report.totalExpectedBody !== undefined ? (
              <>
                <tr>
                  <td colSpan={4}>Σ 单项收益(期望,联合抽样 {report.mcDraws} 组)</td>
                  <td>
                    {signed(report.sumExpectedBody, 2)} 马身({signed(report.sumExpectedSec, 3)}s)
                  </td>
                </tr>
                <tr>
                  <td colSpan={4}>实测总收益(期望 ±95%CI)</td>
                  <td>
                    {signed(report.totalExpectedBody, 2)} 马身({signed(report.totalExpectedSec, 3)}s
                    <span className="meta"> ±{report.totalExpectedCI.toFixed(3)}</span>)
                  </td>
                </tr>
              </>
            ) : (
              <>
                <tr>
                  <td colSpan={4}>Σ 单项收益(去重前)</td>
                  <td>{signed(report.sumDeltaBody ?? report.sumDeltaSec * 8, 2)} 马身({signed(report.sumDeltaSec, 3)}s)</td>
                </tr>
                <tr>
                  <td colSpan={4}>实测总收益(无技能 − 全技能)</td>
                  <td>{signed(report.totalDeltaBody ?? report.totalDeltaSec * 8, 2)} 马身({signed(report.totalDeltaSec, 3)}s)</td>
                </tr>
              </>
            )}
          </tfoot>
        )}
      </table>
      </div>
      <p className="note">
        收益 = 去掉该技能后完赛变慢的幅度(马身 = 米差/2.5)。Σ单项 ≠ 总收益属正常:技能间存在交互。
        标「期望」的技能发动位置在满足区段内随机(如进弯道随机时刻),数字来自联合蒙特卡洛
        (含技能间随机耦合,确定性可复现),点击展开逐位置明细;名次类条件仍为规则取位近似。
      </p>
    </div>
  );
}
