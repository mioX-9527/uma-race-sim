import { Fragment, useState } from 'react';
import type { AblationReport } from '@uma-race-sim/analysis';
import { PRECISION_LABEL, SKILLS, describeCondition, describeEffects, describePrereq, describeRestriction, describeUndetermined } from '../lib/sim';

const signed = (v: number, digits: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;

/** 每技能马身收益(leave-one-out 消融);区段随机类技能显示联合抽样期望,可展开逐位置明细 */
export function AblationTable({ report }: { report: AblationReport }): JSX.Element {
  const rows = [...report.rows].sort((a, b) => (b.expectedBody ?? b.deltaBody) - (a.expectedBody ?? a.deltaBody));
  const order = report.rows; // 与赛道条编号一致
  const [expanded, setExpanded] = useState<string | null>(null);
  // 合计行的期望口径字段在无随机位置技能时缺省,这里统一兜底 0(该分支本身不会渲染)
  const sumExpBody = report.sumExpectedBody ?? 0;
  const sumExpSec = report.sumExpectedSec ?? 0;
  const totalExpSec = report.totalExpectedSec ?? 0;
  const totalExpCI = report.totalExpectedCI ?? 0;

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
            const multi = r.firingSamples !== undefined && r.firingSamples.length > 1;
            const open = expanded === r.skillId;
            const openFiring = expanded === `${r.skillId}#f`;
            const body = r.expectedBody ?? r.deltaBody;
            const firingSum = multi ? r.firingSamples!.reduce((a, f) => a + f.deltaBody, 0) : 0;
            const isPassiveRaceStart =
              skill !== undefined && skill.effects.length > 0 && skill.effects.every(e => e.type === 'passive') && skill.condition.kind === 'raceStart';
            const need = skill !== undefined ? describeRestriction(skill) : '';
            const cond = skill !== undefined ? describeUndetermined(skill) : '';
            return (
              <Fragment key={r.skillId}>
                <tr className={r.applicable ? undefined : 'row-off'}>
                  <td>{idx}</td>
                  <td>
                    {r.name}
                    {skill !== undefined && <span className={`badge ${skill.precision}`}>{PRECISION_LABEL[skill.precision]}</span>}
                    {!r.applicable && (cond !== '' ? (
                      <span
                        className="badge cond"
                        title={`临场条件:${cond} —— 由开赛时的实际情况决定(闸位/人气/抽选/赛事等级),赛道与跑法确定不了,不能保证 100% 发动 ⇒ 默认不计收益`}
                      >
                        临场条件
                      </span>
                    ) : (
                      <span className="badge off" title={need === '' ? '当前赛道/环境不满足装配限制' : `需:${need}`}>
                        不生效
                      </span>
                    ))}
                    {skill !== undefined && skill.prereq !== undefined && (
                      <span className="badge pre" title={`前提:${describePrereq(skill)}`}>前提</span>
                    )}
                    {r.dependentIds !== undefined && (
                      <span
                        className="badge dep"
                        title={`从牌组删掉它会连带失去:${r.dependentIds.map(id => SKILLS.find(x => x.id === id)?.name ?? id).join('、')}`}
                      >
                        被依赖 {r.dependentIds.length}
                      </span>
                    )}
                    {r.carryOverSpeed !== undefined && (
                      <span
                        className="badge carry"
                        title={
                          `进入末脚(最终冲刺)时起步速度被抬高 +${r.carryOverSpeed.toFixed(2)} m/s`
                          + (r.carryOverLeftSec === undefined
                            ? ''
                            : r.carryOverLeftSec >= 0
                              ? `(技能还在生效,剩 ${r.carryOverLeftSec.toFixed(1)}s)`
                              : `(技能已在进入末脚前 ${(-r.carryOverLeftSec).toFixed(1)}s 结束,残余部分按阶段减速度衰减后剩下的)`)
                          + '。这段速度会被带进终盘加速段:加速段不用从原速重新爬,技能结束后也不用"还回去" —— 即「存速」'
                        }
                      >
                        存速 +{r.carryOverSpeed.toFixed(2)}
                      </span>
                    )}
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
                    {!r.applicable
                      ? cond !== ''
                        ? <span title={`临场条件:${cond}(默认不计收益)`}>需临场条件</span>
                        : <span title={need === '' ? '' : `需:${need}`}>不生效</span>
                      : isPassiveRaceStart
                        ? '常时'
                        : r.activatedAtMeter === null
                          ? '—'
                          : r.activationCount > 1
                            ? <span title={r.firingSamples?.map(f => `第${f.index}次 ${Math.round(f.atMeter)}m (${f.atSec.toFixed(1)}s)`).join('  ') ?? ''}>{`${Math.round(r.activatedAtMeter)}m ×${r.activationCount}次`}</span>
                            : `${Math.round(r.activatedAtMeter)}m`}
                  </td>
                  <td className={!r.applicable ? '' : body > 0 ? 'pos' : 'neg'}>
                    {!r.applicable ? (
                      <span className="meta" title={cond !== '' ? `临场条件:${cond} —— 不能保证 100% 发动,按 0 计` : undefined}>—</span>
                    ) : sampled ? (
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
                    ) : multi ? (
                      <>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => setExpanded(openFiring ? null : `${r.skillId}#f`)}
                          title="同场多次发动(带冷却);点击展开每一次各值多少马身"
                        >
                          {signed(r.deltaBody, 2)}
                        </button>
                        <div className="meta">逐次{openFiring ? '▲' : '▼'}</div>
                      </>
                    ) : (
                      <span title="发动时机确定(非区段随机),只有这一个确定值;带 *_random 触发的技能才显示期望与区间">
                        {signed(r.deltaBody, 2)}
                      </span>
                    )}
                  </td>
                </tr>
                {multi && openFiring && (
                  <tr className="sample-row">
                    <td colSpan={5}>
                      <div className="meta" style={{ padding: '2px 8px' }}>
                        逐次发动(只去掉这一次的效果,其余各次照常生效):
                        {r.firingSamples!.map(f => (
                          <span key={f.index} style={{ marginLeft: 10, whiteSpace: 'nowrap' }}>
                            第{f.index}次 {Math.round(f.atMeter)}m({f.atSec.toFixed(1)}s) →{' '}
                            <b className={f.deltaBody > 0 ? 'pos' : 'neg'}>{signed(f.deltaBody, 2)}</b>
                          </span>
                        ))}
                        。整条技能都去掉为 {signed(r.deltaBody, 2)} 马身,逐次之和 {signed(firingSum, 2)}
                        (差额来自前后段耦合:去掉前一次会改变后续发动位置与体力节奏)。
                      </div>
                    </td>
                  </tr>
                )}
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
                    {signed(sumExpBody, 2)} 马身({signed(sumExpSec, 3)}s)
                  </td>
                </tr>
                <tr>
                  <td colSpan={4}>实测总收益(期望 ±95%CI)</td>
                  <td>
                    {signed(report.totalExpectedBody, 2)} 马身({signed(totalExpSec, 3)}s
                    <span className="meta"> ±{totalExpCI.toFixed(3)}</span>)
                  </td>
                </tr>
              </>
            ) : (
              <>
                <tr>
                  <td colSpan={4}>Σ 单项收益</td>
                  <td>{signed(report.sumDeltaBody ?? 0, 2)} 马身({signed(report.sumDeltaSec, 3)}s)</td>
                </tr>
                <tr>
                  <td colSpan={4}>实测总收益(无技能 − 全技能)</td>
                  <td>{signed(report.totalDeltaBody, 2)} 马身({signed(report.totalDeltaSec, 3)}s)</td>
                </tr>
              </>
            )}
          </tfoot>
        )}
      </table>
      </div>
      <p className="note">
        收益 = 只去掉该技能的效果(它照常发动、仍算进别的技能的前提)后,完赛变慢的幅度(马身 = 米差/2.5)。
        绿底「存速 +x」= 进入末脚那一帧该项速度加成仍在生效:它把起步速度抬高了 x,终盘加速段(约 10s)因此缩短,
        所以同样数值越靠近末脚起点收益越大;在末脚起点之后才发动、又在爬到原上限前结束的技能,加速段会把它吃掉(收益≈0)。
        所以回复/耐力类技能在体力不吃紧时显示 +0.00 是正常的;标「被依赖」的技能,从牌组里删掉才会连带失去依赖它的技能。
        Σ单项 ≠ 总收益属正常:技能间存在交互。
        标「期望」的技能发动位置在满足区段内随机(如进弯道随机时刻,触发代码含 *_random),数字来自联合蒙特卡洛
        (含技能间随机耦合,确定性可复现),点击展开逐位置明细;名次类条件仍为规则取位近似。
        <b>发动时机确定的技能(开赛 X 秒后、终点前 X 米、末脚入口等)只有一个确定值</b> ——
        它不在区段内随机,没有可抽样的位置分布,所以不给期望/区间。
        同场多次发动的技能(带冷却)标「逐次」,点击展开每一次各值多少马身。
      </p>
    </div>
  );
}
