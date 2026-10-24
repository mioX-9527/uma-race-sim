import { Fragment } from 'react';
import type { Aptitude, Motivation, Stats, Tactic } from '@uma-race-sim/engine';
import { APTITUDES, COURSES, MOTIVATION_LABEL, TACTIC_LABEL, type UiConfig } from '../lib/sim';
import { SkillPicker } from './SkillPicker';

interface Props {
  config: UiConfig;
  onChange: (cfg: UiConfig) => void;
}

const STAT_KEYS: readonly (keyof Stats)[] = ['speed', 'stamina', 'power', 'guts', 'wisdom'];
const STAT_LABEL: Record<keyof Stats, string> = { speed: '速度', stamina: '耐力', power: '力量', guts: '根性', wisdom: '智力' };
const TACTICS: readonly Tactic[] = ['nige', 'senko', 'sashi', 'oikomi'];
const MOTIVATIONS: readonly Motivation[] = ['best', 'good', 'normal', 'bad', 'worst'];

export function ConfigPanel({ config, onChange }: Props): JSX.Element {
  const set = (patch: Partial<UiConfig>): void => onChange({ ...config, ...patch });
  const setStat = (k: keyof Stats, value: number): void => set({ stats: { ...config.stats, [k]: value } });

  const venueGroups = new Map<string, typeof COURSES>();
  for (const c of COURSES) {
    if (!venueGroups.has(c.venue)) venueGroups.set(c.venue, []);
    venueGroups.get(c.venue)!.push(c);
  }

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
          <label htmlFor="cfg-fix" title="有效速度 ×赛道补正:最大=1.2、标准=1(与 614tools 一致,默认最大)">
            赛道补正
          </label>
          <select id="cfg-fix" value={config.courseFix ?? 1.2} onChange={e => set({ courseFix: Number(e.target.value) })}>
            <option value={1.2}>最大(×1.2)</option>
            <option value={1}>标准(×1.0)</option>
          </select>
        </div>
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
