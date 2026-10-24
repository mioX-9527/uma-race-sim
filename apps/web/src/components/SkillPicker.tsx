import { useMemo, useState } from 'react';
import { PRECISION_LABEL, SKILLS, type SkillEntry } from '../lib/sim';

interface Props {
  selected: readonly string[];
  onChange: (ids: readonly string[]) => void;
}

const MAX_SKILLS = 30;

/** 技能搜索点选(非手填数值) */
export function SkillPicker({ selected, onChange }: Props): JSX.Element {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return [];
    return SKILLS.filter(s => !s.precision.includes('unsupported'))
      .filter(s => s.name.toLowerCase().includes(q) || (s.nameJa ?? '').toLowerCase().includes(q))
      .slice(0, 40);
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
        placeholder={`搜索技能(名称/日文名),已选 ${selected.length}/${MAX_SKILLS}`}
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {matches.length > 0 && (
        <div className="skill-list">
          {matches.map(s => (
            <div
              key={s.id}
              className={`skill-item${selected.includes(s.id) ? ' selected' : ''}`}
              onClick={() => toggle(s.id)}
            >
              <span className="name">{s.name}</span>
              <span className="meta">
                {s.restriction ? `${s.restriction} · ` : ''}
                <span className={`badge ${s.precision}`}>{PRECISION_LABEL[s.precision]}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {selectedSkills.length > 0 && (
        <div className="chips">
          {selectedSkills.map((s, i) => (
            <span key={s.id} className="chip" onClick={() => toggle(s.id)} title="点击移除">
              <span className="idx">{i + 1}</span>
              {s.name}
              <span className={`badge ${s.precision}`}>{PRECISION_LABEL[s.precision]}</span>
              ×
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
