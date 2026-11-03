import type { CSSProperties } from 'react';
import { armorClass, fmt, untrainedArmor, initiative, modeSpeed, profBonus, speedNow, speedOf, UNARMORED, walkSpeed, zeroSpeedBy } from '../logic';
import { removeEntry, saveEntry, useEntryForm, useSheet } from '../sheet';
import type { AcMod, SpeedKind, Unarmored } from '../types';
import { AddButton, Caret, EntryActions, EntryForm, NumInput, PartTiles, Step, TextField } from './ui';

const SPEEDS: ['walk' | SpeedKind, string][] = [['walk', 'Walk'], ['climb', 'Climb'], ['swim', 'Swim'], ['fly', 'Fly'], ['burrow', 'Burrow']];

export function Vitals() {
  const { c, update, edit } = useSheet();
  const ac = armorClass(c);
  const untrained = untrainedArmor(c);
  // The first part is the base AC and shows as a bare number; every other part is a signed bonus.
  const acValue = (v: number, i: number) => (i === 0 ? String(v) : fmt(v));
  const acHint = ac.parts.flatMap((p, i) => (p.active ? [p.label + ' ' + acValue(p.value, i)] : [])).join(' · ');
  const f = useEntryForm('acmod', { name: '', val: 1 }, 'bonus', 'Add a custom bonus');
  const saveMod = () => {
    const name = f.draft.name.trim();
    if (!name) return;
    update((p) => ({ acMods: saveEntry<AcMod>(p.acMods, { name, val: f.draft.val }, f.editingId) }));
    f.close();
  };
  const zeroBy = zeroSpeedBy(c);
  const exhCut = 5 * c.exh;
  const extraCount = SPEEDS.filter(([k]) => k !== 'walk' && modeSpeed(c, k).base).length;
  const hint = c.speedOpen ? 'Hide' : zeroBy.length ? 'Speed 0 · ' + zeroBy[0] : extraCount ? '+' + extraCount + ' more' : 'Climb · Swim · Fly';
  const note = (zeroBy.length ? 'Speed 0 while ' + zeroBy.join(', ') + '. ' : '') +
    (exhCut ? 'Exhaustion: −' + exhCut + ' ft applied to every speed. ' : '') +
    (edit ? 'Use − / + to set each base speed.' : 'Without a climb or swim speed, each foot costs 1 extra foot.');

  return (
    <section id="sec-vitals" aria-label="Combat vitals" className="vitals section">
      <div className="card stat-bar">
        <button type="button" className={'stat' + (c.acOpen ? ' open' : '')} onClick={() => update({ acOpen: !c.acOpen })} aria-expanded={c.acOpen} aria-controls="ac-panel">
          <span className="stat-value">{ac.total}</span>
          <span className="row gap-4 stat-label">Armor class<Caret open={c.acOpen} /></span>
          {acHint && <span className="stat-hint">{acHint}</span>}
        </button>
        <div className="stat"><span className="stat-value">{fmt(initiative(c))}</span><span className="stat-label">Initiative</span></div>
        <button type="button" className={'stat' + (c.speedOpen ? ' open' : '')} onClick={() => update({ speedOpen: !c.speedOpen })} aria-expanded={c.speedOpen} aria-controls="speed-panel">
          <span className="stat-value" style={{ color: zeroBy.length ? 'var(--danger)' : undefined }}>{speedNow(c)}<span className="stat-unit"> ft</span></span>
          <span className="row gap-4 stat-label">Speed<Caret open={c.speedOpen} /></span>
          <span className="stat-hint" style={{ color: zeroBy.length ? 'var(--danger)' : undefined }}>{hint}</span>
        </button>
        <div className="stat"><span className="stat-value">+{profBonus(c.level)}</span><span className="stat-label">Proficiency</span></div>
      </div>

      {c.acOpen && (
        <div id="ac-panel" className="block">
          <h2 className="block-title">Armor class</h2>
          <PartTiles parts={ac.parts} />
          {untrained && <span className="small">No training with {untrained.name}: Disadvantage on D20 Tests using Strength or Dexterity, and no spellcasting.</span>}
          {edit && (
            <div className="col gap-8">
              <label className="field">Unarmored base
                <select className="input" value={c.acUnarm} onChange={(e) => update({ acUnarm: e.target.value as Unarmored })}>
                  {Object.entries(UNARMORED).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </label>
              {c.acMods.map((m) => (
                <div key={m.id} className="row between gap-8">
                  <span>{m.name}</span>
                  <div className="row gap-8">
                    <strong>{fmt(m.val)}</strong>
                    <EntryActions name={m.name} canEdit={edit}
                      onEdit={() => f.openEdit(m.id, { name: m.name, val: m.val })}
                      onRemove={() => update((p) => ({ acMods: removeEntry(p.acMods, m.id) }))} />
                  </div>
                </div>
              ))}
              {!f.isOpen && <AddButton onClick={f.openAdd}>+ Add custom bonus</AddButton>}
              {f.isOpen && (
                <EntryForm kind="acmod" inline title={f.title} saveLabel={f.saveLabel} onSave={saveMod} onCancel={f.close}>
                  <div className="row wrap gap-6">
                    <TextField label="Label" value={f.draft.name} placeholder="Defense fighting style" onChange={(name) => f.set({ name })} style={{ flex: '2 1 160px' }} />
                    <label className="field" style={{ flex: '1 1 80px' }}>Bonus
                      <NumInput className="input" value={f.draft.val} min={-20} max={20} onCommit={(val) => f.set({ val })} />
                    </label>
                  </div>
                </EntryForm>
              )}
              <span className="muted">Armor and shields come from Inventory, AC spells from Spells.</span>
            </div>
          )}
        </div>
      )}

      {c.speedOpen && (
        <div id="speed-panel" className="block">
          <div className="row wrap between gap-6">
            <h2 className="block-title">Movement</h2>
            <span className="muted">{note}</span>
          </div>
          <div className="grid speed-grid" style={edit ? { '--min': '150px' } as CSSProperties : undefined}>
            {SPEEDS.map(([k, label]) => {
              // The steppers edit the typed base; grants add to the walking Speed or give another speed with its source.
              const typed = k === 'walk' ? c.speedBase : c.speeds[k] || 0;
              const mode = k === 'walk' ? null : modeSpeed(c, k);
              const base = mode ? mode.base : walkSpeed(c);
              const set = (v: number) => update((p) => (k === 'walk' ? { speedBase: v } : { speeds: { ...p.speeds, [k]: v } }));
              return (
                <div key={k} className="tile">
                  <span className="muted">{label}</span>
                  <span className="speed-value" style={{ color: base ? (exhCut || zeroBy.length ? 'var(--danger)' : 'var(--text)') : 'var(--dim)' }}>
                    {base ? speedOf(c, base) + ' ft' : k === 'climb' || k === 'swim' ? 'Walk ×½' : '—'}
                  </span>
                  {mode?.by && <span className="muted">{mode.hover ? 'hover · ' : ''}from {mode.by}</span>}
                  {k === 'walk' && base !== typed && <span className="muted">base {typed} ft {fmt(base - typed)} from grants</span>}
                  {edit && (
                    <div className="row gap-6">
                      <Step label={'Lower ' + label.toLowerCase() + ' speed'} onClick={() => set(Math.max(0, typed - 5))}>−</Step>
                      <span className="muted">base {typed} ft</span>
                      <Step label={'Raise ' + label.toLowerCase() + ' speed'} onClick={() => set(Math.min(200, typed + 5))}>+</Step>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
