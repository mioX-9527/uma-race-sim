import { useMemo, useState } from 'react';
import { skillApplicable } from '@uma-race-sim/engine';
import type { Course, RunnerConfig } from '@uma-race-sim/engine';
import { PRECISION_LABEL, SKILLS, describeCondition, describeEffects, describeRestriction, type SkillEntry } from '../lib/sim';

interface Props {
  selected: readonly string[];
  onChange: (ids: readonly string[]) => void;
  /** 当前赛道与环境(用于标注装配限制不满足的技能「不生效」) */
  course: Course;
  runner: RunnerConfig;
}

const MAX_SKILLS = 30;

/** 技能搜索点选:简中/繁中/日文三语匹配,显示发动条件与效果数值 */
export function SkillPicker({ selected, onChange, course, runner }: Props): JSX.Element {
  const [query, setQuery] = useState('');
  /** 该技能在当前赛道/环境下是否满足装配限制 */
  const okOf = (s: SkillEntry): boolean => skillApplicable(s, course, runner);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return [];
    return SKILLS.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        (s.nameJa ?? '').toLowerCase().includes(q) ||
        (s.nameTrad ?? '').toLowerCase().includes(q),
    ).slice(0, 40);
  }, [query]);

  const selectedSkills = useMemo(
    () => selected.map(id => SKILLS.find(s => s.id === id)).filter((s): s is SkillEntry => s !== undefined),
    [selected],
  );

  const toggle = (id: string): void => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else if (selected.length < MAX_SKILLS) onChange([...selected, id]);
  };

  return (
    <div className="skill-search">
      <input
        type="text"
        placeholder={`搜索技能(简中/繁中/日文名),已选 ${selected.length}/${MAX_SKILLS}`}
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {matches.length > 0 && (
        <div className="skill-list">
          {matches.map(s => (
            <div
              key={s.id}
              className={`skill-item${selected.includes(s.id) ? ' selected' : ''}${s.precision === 'unsupported' || !okOf(s) ? ' dim' : ''}`}
              onClick={() => toggle(s.id)}
            >
              <div className="row1">
                <span className="name">{s.name}</span>
                <span>
                  {s.rarity === 'uniqueHeir' && <span className="badge cn" title="继承固有:数值/持续时间与本体(大招)不同,智力增幅系数恒 1.0">继承</span>}
                  {s.rarity === 'evolved' && <span className="badge cn" title="进化技能:本体技能进化后的强化版,数值与发动条件以进化后为准">进化</span>}
                  {s.cnReleased === true && <span className="badge cn">国服</span>}
                  <span className={`badge ${s.precision}`}>{PRECISION_LABEL[s.precision]}</span>
                  {!okOf(s) && <span className="badge off" title="当前赛道/环境不满足装配限制,选中也不生效">不生效</span>}
                </span>
              </div>
              <div className="meta">
                {describeCondition(s.condition)} · {describeEffects(s)}
                {(() => {
                  const rst = describeRestriction(s);
                  return rst !== '' ? ` · 限:${rst}` : '';
                })()}
                {s.nameJa !== undefined && s.nameJa !== s.name ? ` · 原名:${s.nameJa}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {selectedSkills.length > 0 && (
        <div className="chips">
          {selectedSkills.map((s, i) => (
            <span
              key={s.id}
              className="chip"
              onClick={() => toggle(s.id)}
              title={`点击移除 · ${describeCondition(s.condition)} · ${describeEffects(s)}`}
            >
              <span className="idx">{i + 1}</span>
              {s.name}
              <span className={`badge ${s.precision}`}>{PRECISION_LABEL[s.precision]}</span>
              {!okOf(s) && <span className="badge off">不生效</span>}
              ×
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
