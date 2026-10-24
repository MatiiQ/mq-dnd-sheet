import { useState, type CSSProperties } from 'react';
import { fmt, preparedCount, slotsLeft, spellAttack, spellSaveDC, spellUsable } from '../../logic';
import { patchEntry, removeEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Character, Spell } from '../../types';
import { AddButton, ChevronDown, EntryActions, EntryForm, Step, TextField, UsePips } from '../ui';

const ORDINAL = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
const CAST_NAMES = { none: 'None', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const BLANK = { name: '', lvl: '1', time: 'Action', range: '', dice: '', conc: false, source: '', dur: '', comp: '', always: false };
type Draft = typeof BLANK;

const toDraft = (e: Spell): Draft => ({
  name: e.name, lvl: String(e.lvl || 0), time: e.time || 'Action', range: e.range || '', dice: e.dice || '',
  conc: !!e.c, source: e.source || '', dur: e.dur || '', comp: e.comp || '', always: !!e.always
});

const setSlotUsed = (c: Character, l: number, n: number) => { const u = c.slotUsed.slice(); u[l] = n; return { slotUsed: u }; };

export function SpellsTab() {
  const { c, update, edit } = useSheet();
  const [castPick, setCastPick] = useState<string | null>(null);
  const f = useEntryForm('spell', BLANK, 'spell', 'ADD A SPELL');
  const usePrep = c.usePrep;
  const dc = spellSaveDC(c), atk = spellAttack(c);
  const prepCount = preparedCount(c);

  const save = () => {
    const d = f.draft, name = d.name.trim();
    if (!name) return;
    const built = {
      name, lvl: parseInt(d.lvl, 10) || 0, time: d.time, range: d.range.trim(), dice: d.dice.trim(), c: d.conc,
      source: d.source.trim() || 'Custom', dur: d.dur.trim(), comp: d.comp.trim(), always: d.always
    };
    update((p) => ({ spells: saveEntry<Spell>(p.spells, built, f.editingId, { prep: true }) }));
    f.close();
  };

  const groups = [];
  for (let l = 0; l <= 9; l++) {
    const list = c.spells
      .filter((x) => (x.lvl || 0) === l && (c.spellFilter !== 'prepared' || l === 0 || spellUsable(c, x)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (list.length) groups.push({ l, list });
  }
  const slotLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((l) => edit || c.slotMax[l] > 0);
  const filterStyle = (on: boolean): CSSProperties => ({
    fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', minHeight: 40, padding: '0 14px',
    background: on ? 'var(--accent)' : 'var(--raised)', color: on ? 'var(--bg)' : 'var(--text-2)'
  });

  return (
    <div className="col gap-12">
      <div className="row wrap gap-12" style={{ alignItems: 'stretch' }}>
        <StatCard label="Spellcasting ability" value={CAST_NAMES[c.castAb]} />
        <StatCard label="Spell save DC" value={dc ?? '—'} />
        <StatCard label="Spell attack" value={atk === null ? '—' : 'd20 ' + fmt(atk)} />
        {usePrep && (
          <div className="card" style={{ flex: '1 1 140px', padding: '10px 14px' }}>
            <span className="small">Prepared spells</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: c.prepMax && prepCount > c.prepMax ? 'var(--orange)' : 'var(--text)' }}>
              {prepCount + (c.prepMax ? ' / ' + c.prepMax : '')}
            </span>
            {edit && (
              <div className="row gap-6" style={{ marginTop: 4 }}>
                <span className="small">Max</span>
                <Step small label="Lower maximum prepared spells" onClick={() => update((p) => ({ prepMax: Math.max(0, p.prepMax - 1) }))}>−</Step>
                <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{c.prepMax}</span>
                <Step small label="Raise maximum prepared spells" onClick={() => update((p) => ({ prepMax: Math.min(40, p.prepMax + 1) }))}>+</Step>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="row wrap" style={{ gap: '8px 14px' }}>
        <button type="button" role="switch" aria-checked={usePrep} className="btn row gap-10" style={{ fontSize: 14, padding: '0 12px 0 8px' }}
          onClick={() => update({ usePrep: !usePrep })}>
          <span aria-hidden="true" style={{ position: 'relative', flex: 'none', width: 40, height: 24, borderRadius: 12, background: usePrep ? 'var(--accent)' : 'var(--line-2)' }}>
            <span style={{ position: 'absolute', top: 3, left: usePrep ? 19 : 3, width: 18, height: 18, borderRadius: '50%', background: usePrep ? 'var(--bg)' : 'var(--muted)' }} />
          </span>
          Track prepared spells
        </button>
        {usePrep && (
          <div role="group" aria-label="Which spells to show" className="row" style={{ border: '1px solid var(--line-2)', borderRadius: 10, overflow: 'hidden' }}>
            {([['all', 'All spells'], ['prepared', 'Prepared only']] as const).map(([k, label]) => {
              const on = c.spellFilter === k;
              return <button key={k} type="button" aria-pressed={on} style={filterStyle(on)} onClick={() => update({ spellFilter: k })}>{label}</button>;
            })}
          </div>
        )}
        <span className="muted" style={{ flex: '1 1 260px' }}>
          {usePrep
            ? 'Tap P to prepare a spell. A dashed P means always prepared (doesn’t count toward the limit).'
            : 'Off: every spell on the list can be cast (for classes that know their spells, like Bard or Sorcerer).'}
        </span>
      </div>

      <div className="card gap-4">
        <div className="row wrap between gap-6">
          <span className="caps">SPELL SLOTS</span>
          <span className="muted">Tap a circle to mark a slot used or restore it</span>
        </div>
        {slotLevels.map((l) => {
          const max = c.slotMax[l], left = slotsLeft(c, l);
          return (
            <div key={l} className="row wrap" style={{ gap: '4px 10px', minHeight: 44, borderTop: '1px solid var(--line)' }}>
              <span style={{ minWidth: 64, fontWeight: 700, color: 'var(--accent)' }}>Level {l}</span>
              <div className="row wrap">
                <UsePips used={c.slotUsed[l]} max={max} color="var(--accent)" size={20} noun={'level ' + l + ' slot'} onChange={(n) => update((p) => setSlotUsed(p, l, n))} />
              </div>
              <span className="muted">{max ? left + ' of ' + max + ' left' : 'none'}</span>
              {edit && (
                <div className="row gap-6" style={{ marginLeft: 'auto' }}>
                  <span className="muted">Max</span>
                  <Step label={'Fewer level ' + l + ' slots'} onClick={() => update((p) => {
                    const m = p.slotMax.slice(); m[l] = Math.max(0, m[l] - 1);
                    const u = p.slotUsed.slice(); u[l] = Math.min(u[l], m[l]);
                    return { slotMax: m, slotUsed: u };
                  })}>−</Step>
                  <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{max}</span>
                  <Step label={'More level ' + l + ' slots'} onClick={() => update((p) => { const m = p.slotMax.slice(); m[l] = Math.min(9, m[l] + 1); return { slotMax: m }; })}>+</Step>
                </div>
              )}
            </div>
          );
        })}
        {slotLevels.length === 0 && <span className="muted" style={{ padding: '8px 0' }}>No spell slots. Turn on Edit to set them.</span>}
      </div>

      {groups.map(({ l, list }) => {
        const max = l ? c.slotMax[l] : 0, left = slotsLeft(c, l);
        return (
          <div key={l} className="card" style={{ gap: 2 }}>
            <div className="row wrap between" style={{ gap: '4px 10px', paddingBottom: 4 }}>
              <span className="group-title">{l === 0 ? 'Cantrips' : 'Level ' + l}</span>
              {max > 0 && (
                <div role="group" aria-label={'Level ' + l + ' spell slots'} className="row wrap">
                  <span style={{ fontSize: 13, color: left ? 'var(--muted)' : 'var(--orange)', marginRight: 4 }}>{left} of {max} slots left</span>
                  <UsePips used={c.slotUsed[l]} max={max} color="var(--accent)" size={20} noun={'level ' + l + ' slot'} onChange={(n) => update((p) => setSlotUsed(p, l, n))} />
                </div>
              )}
              {l > 0 && max === 0 && <span style={{ fontSize: 13, color: 'var(--dim)' }}>No level {l} slots</span>}
            </div>
            {list.map((sp) => (
              <SpellRow key={sp.id} sp={sp} picking={castPick === sp.id} setPicking={(on) => setCastPick(on ? sp.id : null)}
                onEdit={() => f.openEdit(sp.id, toDraft(sp))} />
            ))}
          </div>
        );
      })}

      {!f.isOpen && <AddButton onClick={f.openAdd}>+ Add spell</AddButton>}
      {f.isOpen && (
        <EntryForm kind="spell" title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
          <div className="grid">
            <TextField label="Name" value={f.draft.name} placeholder="e.g. Misty Step" onChange={(v) => f.set({ name: v })} />
            <label className="field">Level
              <select className="input" value={f.draft.lvl} onChange={(e) => f.set({ lvl: e.target.value })}>
                {ORDINAL.map((_, i) => <option key={i} value={String(i)}>{i === 0 ? 'Cantrip' : 'Level ' + i}</option>)}
              </select>
            </label>
            <label className="field">Casting time
              <select className="input" value={f.draft.time} onChange={(e) => f.set({ time: e.target.value })}>
                {['Action', 'Bonus Action', 'Reaction', '1 Minute', '10 Minutes', '1 Hour'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <TextField label="Range" value={f.draft.range} placeholder="e.g. 60 ft" onChange={(v) => f.set({ range: v })} />
            <TextField label="Source" value={f.draft.source} placeholder="e.g. Ranger, Feat" onChange={(v) => f.set({ source: v })} />
            <TextField label="Dice / effect" value={f.draft.dice} placeholder="e.g. DEX save · 3d6 Fire" onChange={(v) => f.set({ dice: v })} />
            <TextField label="Duration" value={f.draft.dur} placeholder="e.g. 1 hour, Instantaneous" onChange={(v) => f.set({ dur: v })} />
            <TextField label="Components" value={f.draft.comp} placeholder="e.g. V, S, M (a pinch of salt)" onChange={(v) => f.set({ comp: v })} />
            <label className="check"><input type="checkbox" checked={f.draft.conc} onChange={(e) => f.set({ conc: e.target.checked })} />Concentration</label>
            <label className="check"><input type="checkbox" checked={f.draft.always} onChange={(e) => f.set({ always: e.target.checked })} />Always prepared</label>
          </div>
        </EntryForm>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card" style={{ flex: '1 1 140px', padding: '10px 14px' }}>
      <span className="small">{label}</span><span style={{ fontSize: 20, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function SpellRow({ sp, picking, setPicking, onEdit }: { sp: Spell; picking: boolean; setPicking: (on: boolean) => void; onEdit: () => void }) {
  const { c, update, edit } = useSheet();
  const lvl = sp.lvl || 0;
  const usePrep = c.usePrep;
  const isAlways = usePrep && !!sp.always;
  const prepOn = !usePrep || !!sp.prep;
  const usable = spellUsable(c, sp);
  const concOn = c.conc?.id === sp.id;
  const freeUsed = !!c.free[sp.id];

  const casts: { l: number; left: number }[] = [];
  if (lvl > 0) {
    for (let l = lvl; l <= 9; l++) {
      if (c.slotMax[l]) casts.push({ l, left: slotsLeft(c, l) });
    }
  }
  const firstIdx = casts.findIndex((x) => x.left > 0);
  const anyLeft = firstIdx >= 0;
  const upcasts = anyLeft ? casts.slice(firstIdx + 1) : [];
  const castWith = (l: number) => {
    update((p) => {
      const max = p.slotMax[l], used = p.slotUsed[l];
      if (used >= max) return {};
      return { ...setSlotUsed(p, l, used + 1), ...(sp.c ? { conc: { id: sp.id, name: sp.name } } : {}) };
    });
    setPicking(false);
  };

  return (
    <div className="row wrap" style={{ gap: '8px 10px', borderTop: '1px solid var(--line)', padding: '8px 0' }}>
      {usePrep && lvl > 0 && !isAlways && (
        <button type="button" aria-pressed={prepOn} aria-label={prepOn ? sp.name + ' is prepared; tap to unprepare' : 'Prepare ' + sp.name} title="Prepared"
          onClick={() => update((p) => ({ spells: patchEntry(p.spells, sp.id, (x) => ({ prep: !x.prep })) }))}
          style={{
            flex: 'none', width: 40, height: 40, padding: 0, cursor: 'pointer', borderRadius: 10, font: '700 15px var(--sans)',
            border: '2px solid ' + (prepOn ? 'var(--accent)' : 'var(--dash)'), background: prepOn ? 'var(--accent)' : 'transparent', color: prepOn ? 'var(--bg)' : '#8A8478'
          }}>P</button>
      )}
      {lvl > 0 && isAlways && (
        <span role="img" aria-label="Always prepared" title="Always prepared" className="row" style={{
          flex: 'none', width: 40, height: 40, borderRadius: 10, border: '2px dashed var(--accent)', color: 'var(--accent)',
          justifyContent: 'center', font: '700 15px var(--sans)'
        }}>P</span>
      )}
      {usePrep && lvl === 0 && <span aria-hidden="true" style={{ flex: 'none', width: 40 }} />}

      <div className="col" style={{ flex: '1 1 220px', minWidth: 0, opacity: lvl > 0 && !usable ? 0.45 : 1 }}>
        <span className="row gap-6" style={{ fontWeight: 600 }}>
          {sp.name}
          {lvl > 0 && !usable && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>not prepared</span>}
          {sp.c && <span title="Concentration" style={{ fontSize: 11, fontWeight: 700, border: '1px solid var(--blue)', color: 'var(--blue)', borderRadius: 4, padding: '0 4px' }}>C</span>}
        </span>
        <span className="muted">{[sp.time, sp.range, sp.source].filter((x) => x).join(' · ')}</span>
        {(sp.dur || sp.comp) && <span className="muted">{[sp.dur, sp.comp].filter((x) => x).join(' · ')}</span>}
        {sp.dice && <span style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{sp.dice}</span>}
      </div>

      {sp.c && (lvl === 0 || usable) && (
        <button type="button" aria-pressed={concOn} aria-label={concOn ? 'Stop concentrating on ' + sp.name : 'Concentrate on ' + sp.name}
          className="btn btn-sm" style={{ border: '1px solid var(--blue)', background: concOn ? 'var(--blue)' : 'transparent', color: concOn ? 'var(--bg)' : 'var(--blue)', borderRadius: 10 }}
          onClick={() => update({ conc: concOn ? null : { id: sp.id, name: sp.name } })}>{concOn ? 'Conc. ✓' : 'Conc.'}</button>
      )}
      {sp.free && usable && (
        <button type="button" aria-pressed={freeUsed} aria-label={freeUsed ? 'Free cast of ' + sp.name + ' used; tap to restore' : 'Use free cast of ' + sp.name}
          className="btn btn-sm" style={{ border: '1px solid ' + (freeUsed ? 'var(--line-2)' : 'var(--accent)'), background: 'transparent', color: freeUsed ? 'var(--muted)' : 'var(--accent)' }}
          onClick={() => update((p) => {
            const used = !p.free[sp.id];
            return { free: { ...p.free, [sp.id]: used }, ...(used && sp.c ? { conc: { id: sp.id, name: sp.name } } : {}) };
          })}>{freeUsed ? 'Free used' : 'Free'}</button>
      )}
      {anyLeft && usable && (
        <div role="group" aria-label={'Spell slots for ' + sp.name} className="row wrap gap-6">
          <button type="button" aria-label={'Cast ' + sp.name + ' with a level ' + casts[firstIdx].l + ' slot, ' + casts[firstIdx].left + ' left'}
            className="btn btn-sm" style={{ border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)' }} onClick={() => castWith(casts[firstIdx].l)}>Cast {ORDINAL[casts[firstIdx].l]}</button>
          {upcasts.length > 0 && (
            <button type="button" aria-expanded={picking} aria-label={'Upcast ' + sp.name + ' with a higher slot'} className="btn btn-sm row gap-4"
              style={{ border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--text-2)' }} onClick={() => setPicking(!picking)}>
              Up<ChevronDown size={12} style={{ transform: picking ? 'rotate(180deg)' : undefined }} />
            </button>
          )}
        </div>
      )}
      {picking && upcasts.length > 0 && (
        <div role="group" aria-label={'Higher slot levels for ' + sp.name} className="row wrap gap-6" style={{ flex: '1 1 100%', padding: 8, borderRadius: 12, background: 'var(--raised)' }}>
          <span className="muted" style={{ flex: '1 1 100%' }}>Cast {sp.name} with a higher slot:</span>
          {upcasts.map(({ l, left }) => (
            <button key={l} type="button" aria-disabled={!left} aria-label={'Cast ' + sp.name + ' with a level ' + l + ' slot, ' + left + ' left'}
              className="btn btn-sm" style={{ border: '1px solid ' + (left ? 'var(--line-2)' : 'var(--line)'), background: left ? 'var(--raised)' : 'transparent', color: left ? 'var(--text)' : 'var(--off)', cursor: left ? 'pointer' : 'not-allowed', textDecoration: left ? undefined : 'line-through' }}
              onClick={() => { if (left) castWith(l); }}>{ORDINAL[l]} ({left})</button>
          ))}
        </div>
      )}
      {lvl > 0 && !sp.free && !anyLeft && usable && <span style={{ fontSize: 13, color: 'var(--orange)' }}>No slots of this level or higher</span>}
      <EntryActions name={sp.name} canEdit={edit} onEdit={onEdit} onRemove={() => update((p) => ({ spells: removeEntry(p.spells, sp.id) }))} />
    </div>
  );
}
