import { ABILITIES, SKILLS, abilityMod, effScore, fmt, saveMod, skillMod } from '../logic';
import { useSheet } from '../sheet';
import type { Ability } from '../types';
import { NumInput, ProfDot, Step } from './ui';

const LEVEL_NAMES = ['Not proficient', 'Proficient', 'Expertise'];

// 2024 layout: skills sit under their ability.
export function Abilities() {
  const { edit } = useSheet();
  return (
    <section id="sec-abilities" aria-label="Abilities and skills" className="section col gap-8">
      <div className="muted">
        {edit
          ? 'Editing: set the original score, use − / + for temporary changes, tap Saving Throw to toggle proficiency, tap a skill to cycle Not proficient → Proficient → Expertise.'
          : 'Checks and saves: roll d20 + the bonus shown.'}
      </div>
      <div className="grid abil-grid">
        {ABILITIES.map(([k, name]) => <AbilityCard key={k} k={k} name={name} />)}
      </div>
    </section>
  );
}

function AbilityCard({ k, name }: { k: Ability; name: string }) {
  const { c, update, edit } = useSheet();
  const cur = effScore(c, k), base = c.abil[k], changed = cur !== base;
  const saveProf = !!c.saveProf[k];
  const scoreColor = cur > base ? 'var(--blue)' : cur < base ? 'var(--danger)' : 'var(--text)';
  const lower = name.toLowerCase();
  const adjust = (d: number) => update((p) => {
    const adj = p.abilAdj[k] || 0, next = p.abil[k] + adj + d;
    return next < 1 || next > 30 ? {} : { abilAdj: { ...p.abilAdj, [k]: adj + d } };
  });
  const saveText = fmt(saveMod(c, k));
  const saveRow = <><ProfDot level={saveProf ? 1 : 0} /><span className="grow" style={{ fontWeight: 600 }}>Saving Throw</span><span style={{ fontWeight: 700 }}>{saveText}</span></>;

  return (
    <div className="card" style={{ gap: 2 }}>
      <div className="row between gap-8 abil-head">
        <div className="col" style={{ gap: 2 }}>
          <span className="abil-name">{name}</span>
          {changed && !edit && <span className="small">Was {base}</span>}
          {edit && (
            <label className="row gap-6 small">Original score
              <NumInput className="input input-num" style={{ width: 56 }} value={base} min={1} max={30} onCommit={(v) => update((p) => ({ abil: { ...p.abil, [k]: v } }))} />
            </label>
          )}
        </div>
        <div role="img" aria-label={name + ' modifier ' + fmt(abilityMod(c, k)) + ', score ' + cur} className="mod-token">
          {fmt(abilityMod(c, k))}<span className="score-coin" style={{ color: scoreColor }}>{cur}</span>
        </div>
      </div>

      {edit && (
        <div className="row wrap gap-6" style={{ paddingBottom: 6 }}>
          <span className="muted">Current</span>
          <Step label={'Lower current ' + lower + ' score'} onClick={() => adjust(-1)}>−</Step>
          <span style={{ minWidth: 28, textAlign: 'center', fontSize: 18, fontWeight: 700, color: scoreColor }}>{cur}</span>
          <Step label={'Raise current ' + lower + ' score'} onClick={() => adjust(1)}>+</Step>
          {changed && (
            <button type="button" className="btn" style={{ fontSize: 13, padding: '0 10px' }} aria-label={'Reset ' + lower + ' to original ' + base}
              onClick={() => update((p) => ({ abilAdj: { ...p.abilAdj, [k]: 0 } }))}>Reset</button>
          )}
        </div>
      )}

      {edit ? (
        <button type="button" aria-pressed={saveProf} className="btn row gap-10" style={{ border: '1px dashed var(--dash)', padding: '0 10px', textAlign: 'left', fontWeight: 400 }}
          onClick={() => update((p) => ({ saveProf: { ...p.saveProf, [k]: !p.saveProf[k] } }))}>
          {saveRow}
        </button>
      ) : (
        <div className="row gap-10 save-row">
          {saveRow}
        </div>
      )}

      {SKILLS.filter((s) => s[2] === k).map(([key, skill]) => {
        const lv = c.skillProf[key] || 0;
        const modText = fmt(skillMod(c, key, k));
        const label = <><ProfDot level={lv} /><span className="grow">{skill}</span></>;
        return edit ? (
          <button key={key} type="button" aria-label={skill + ': ' + LEVEL_NAMES[lv] + '. Tap to change.'} className="row gap-10"
            style={{ cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: '1px dashed var(--line)', minHeight: 44, padding: '0 2px', textAlign: 'left' }}
            onClick={() => update((p) => ({ skillProf: { ...p.skillProf, [key]: ((p.skillProf[key] || 0) + 1) % 3 } }))}>
            {label}
            <span className="small">{LEVEL_NAMES[lv]}</span>
            <span style={{ fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{modText}</span>
          </button>
        ) : (
          <div key={key} className="row gap-10 skill-row">
            {label}<span style={{ fontWeight: 600 }}>{modText}</span>
          </div>
        );
      })}
    </div>
  );
}
