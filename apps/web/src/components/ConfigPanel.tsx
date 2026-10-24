import { Fragment } from 'react';
import { courseFixOf } from '@uma-race-sim/engine';
import type { Aptitude, Motivation, Stats, Tactic } from '@uma-race-sim/engine';
import { APTITUDES, COURSES, DEBUFF_TIERS, HEAL_TIERS, MOTIVATION_LABEL, TACTIC_LABEL, buildRunner, findCourse, type HealPlanItem, type UiConfig } from '../lib/sim';
import { SkillPicker } from './SkillPicker';

interface Props {
  config: UiConfig;
  onChange: (cfg: UiConfig) => void;
}

const STAT_KEYS: readonly (keyof Stats)[] = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
const STAT_LABEL: Record<keyof Stats, string> = { speed: '速度', stamina: '耐力', power: '力量', guts: '根性', wisdom: '智力' };
const TACTICS: readonly Tactic[] = ['nige', 'senko', 'sashi', 'oikomi'];
const MOTIVATIONS: readonly Motivation[] = ['best', 'good', 'normal', 'bad', 'worst'];

/** 赛道补正说明行:门槛属性 + 当前配置下的补正值(自动或手动覆盖) */
function courseFixNote(config: UiConfig): string {
  const course = findCourse(config.courseId);
  const refs = course.courseSetStatus ?? [];
  const gate = refs.length === 0 ? '无门槛属性(基准 ×1.0)' : `门槛:${refs.map(k => STAT_LABEL[k]).join('/')}`;
  const fix = courseFixOf(course, buildRunner(config));
  const mode = config.courseFix === undefined || config.courseFix === 'auto' ? '自动补正' : '手动补正';
  return `${course.name} — ${gate},${mode} ×${fix.toFixed(2)}(自动档:≥901→×1.2、601~900→×1.15、301~600→×1.10、≤300→×1.05)`;
}

export function ConfigPanel({ config, onChange }: Props): JSX.Element {
  const set = (patch: Partial<UiConfig>): void => onChange({ ...config, ...patch });
  const setStat = (k: keyof Stats, value: number): void => set({ stats: { ...config.stats, [k]: value } });

  const venueGroups = new Map<string, typeof COURSES>();
  for (const c of COURSES) {
    if (!venueGroups.has(c.venue)) venueGroups.set(c.venue, []);
    venueGroups.get(c.venue)!.push(c);
  }

  const plan = config.healPlan ?? [];
  const setPlan = (next: readonly HealPlanItem[]): void => set({ healPlan: next });
  const getTier = (tierKey: string): HealPlanItem => plan.find(p => p.tierKey === tierKey) ?? { tierKey, count: 0, atPct: 25 };
  const updateTier = (item: HealPlanItem): void =>
    setPlan([...plan.filter(p => p.tierKey !== item.tierKey), ...(item.count > 0 ? [item] : [])]);
  const tierRow = (tier: (typeof HEAL_TIERS)[number], kind: 'heal' | 'debuff'): JSX.Element => {
    const item = getTier(tier.key);
    return (
      <Fragment key={tier.key}>
        <label title={`${tier.note};${kind === 'heal' ? '回复' : '扣除'}体力上限 ×${tier.value},同档多次合并发动`}>
          {kind === 'heal' ? '+' : '−'}
          {tier.label}
        </label>
        <input
          type="number"
          min={0}
          max={9}
          value={item.count}
          aria-label={`${tier.label}${kind === 'heal' ? '回体' : '减益'}数量`}
          onChange={e => updateTier({ ...item, count: Math.max(0, Math.min(9, Number(e.target.value) || 0)) })}
        />
        <select
          value={item.atPct}
          aria-label={`${tier.label}${kind === 'heal' ? '回体' : '减益'}发动位置`}
          onChange={e => updateTier({ ...item, atPct: Number(e.target.value) as 10 | 25 | 40 })}
        >
          <option value={10}>10%</option>
          <option value={25}>25%</option>
          <option value={40}>40%</option>
        </select>
      </Fragment>
    );
  };

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <section>
        <h2>属性设定</h2>
        <div className="stats-grid">
          {STAT_KEYS.map(k => (
            <Fragment key={k}>
              <label htmlFor={`stat-${k}`}>{STAT_LABEL[k]}</label>
              <input
                id={`stat-${k}`}
                type="number"
                min={1}
                max={2400}
                value={config.stats[k]}
                onChange={e => setStat(k, Math.max(1, Number(e.target.value) || 0))}
              />
            </Fragment>
          ))}
        </div>
      </section>

      <section>
        <h2>适性与跑法</h2>
        <div className="field-grid">
          <label htmlFor="cfg-tactic">脚质</label>
          <select id="cfg-tactic" value={config.tactic} onChange={e => set({ tactic: e.target.value as Tactic })}>
            {TACTICS.map(t => <option key={t} value={t}>{TACTIC_LABEL[t]}</option>)}
          </select>
          <label htmlFor="cfg-dapt">距离适性</label>
          <select id="cfg-dapt" value={config.distanceAptitude} onChange={e => set({ distanceAptitude: e.target.value as Aptitude })}>
            {APTITUDES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label htmlFor="cfg-sapt">场地适性</label>
          <select id="cfg-sapt" value={config.surfaceAptitude} onChange={e => set({ surfaceAptitude: e.target.value as Aptitude })}>
            {APTITUDES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label htmlFor="cfg-mot">干劲</label>
          <select id="cfg-mot" value={config.motivation} onChange={e => set({ motivation: e.target.value as Motivation })}>
            {MOTIVATIONS.map(m => <option key={m} value={m}>{MOTIVATION_LABEL[m]}</option>)}
          </select>
          <label htmlFor="cfg-fix" title="自动 = 按赛道门槛属性(courseSetStatus)与五维计算:1 + 平均((1+floor(min(属性,901)/300.01))×0.05),只作用于有效速度;空门槛赛道 = ×1.0。最大/标准 = 手动覆盖(与 614tools 档位一致)">
            赛道补正
          </label>
          <select
            id="cfg-fix"
            value={config.courseFix ?? 'auto'}
            onChange={e => set({ courseFix: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}
          >
            <option value="auto">自动(按门槛属性)</option>
            <option value={1.2}>最大(×1.2)</option>
            <option value={1}>标准(×1.0)</option>
          </select>
        </div>
        <p className="note">{courseFixNote(config)}</p>
      </section>

      <section>
        <h2>赛场 / 赛道({COURSES.length} 条)</h2>
        <select value={config.courseId} onChange={e => set({ courseId: e.target.value })}>
          {[...venueGroups.entries()].map(([venue, list]) => (
            <optgroup key={venue} label={venue}>
              {list.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </section>

      <section>
        <h2>耐力试算(回体 / 减益)</h2>
        <p className="note" style={{ marginTop: 0 }}>
          按体力上限百分比快速计入回体技能与耐力减益(614tools 耐力计算器口径);
          发动位置为赛程百分比,只计温存判定前。上排=回体,下排=减益。列:档位 / 数量 / 位置。
        </p>
        <div className="heal-grid">
          <span className="heal-head">回体</span>
          <span className="heal-head">数量</span>
          <span className="heal-head">位置</span>
          {HEAL_TIERS.map(t => tierRow(t, 'heal'))}
          <span className="heal-head">减益</span>
          <span className="heal-head">数量</span>
          <span className="heal-head">位置</span>
          {DEBUFF_TIERS.map(t => tierRow(t, 'debuff'))}
        </div>
      </section>

      <section>
        <h2>技能</h2>
        <SkillPicker selected={config.skillIds} onChange={ids => set({ skillIds: ids })} />
        <p className="note">
          「近似」= 发动条件依赖名次/间距/随机时刻,单马期望模型按期望位置发动;
          「不支持」(进化技能/干扰/被动等)不参与模拟。绿技能(前提值)计入待 v0.2。
        </p>
      </section>
    </div>
  );
}
