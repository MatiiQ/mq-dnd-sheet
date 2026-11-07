import { useState } from 'react';
import {
  removeRef, ABILITIES, castingRows, itemOfSpell, pactLeft, clamp, CAST_NAMES, newId, ORDINAL, ownFreeCasts, setOwnFreeCast, SPELL_SORTS, acAfterEdit, castSpell, concAfterEdit, detectAcSpell, effectsAfterEdit, fmt, preparedCount, setConc, setSlotUsed,
  slotsLeft, sortSpells, spellAttack, spellAttackParts, spellDcParts, spellSaveDC, spellUsable, freeCastsOf, spellAttackFor, spellSaveDcFor
} from '../../logic';
import { hasActiveEffect, inactiveReason, linkOf, sourceLabel } from '../../links';
import { BLANK_SPELL, draftFromSpell, keepPrep, spellFromForm, type SpellDraft } from '../../catalog/copy';
import { patchEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { AcEffect, Ability, CastAbility, Character, ClassRow, Spell } from '../../types';
import { removalNote } from '../Chips';
import { SpellPicker } from '../pickers/SpellPicker';
import { SourcePicker } from '../SourcePicker';
import { AcTargetSwitch, AddButton, Caret, DamageTypeField, DieBadge, EffectSwitch, EntryForm, EntryRow, FreeCastButton, ItemCastButtons, NumInput, PartTiles, Step, TextField, UsePips } from '../ui';

const AC_EFFECTS: [AcEffect | '', string][] = [['', 'None'], ['bonus', 'Bonus'], ['base', 'Base (+ DEX)'], ['floor', 'Floor']];
const TIMES = ['Action', 'Bonus Action', 'Reaction', '1 Minute', '10 Minutes', '1 Hour'];
const SAVES: [SpellDraft['save'], string][] = [['', 'None'], ...ABILITIES.map(([k, n]): [SpellDraft['save'], string] => [k, n])];
const ATTACKS: [SpellDraft['atk'], string][] = [['', 'None'], ['melee', 'Melee spell attack'], ['ranged', 'Ranged spell attack']];
const EFFECTS: [SpellDraft['fx'], string][] = [['', '—'], ['damage', 'Damage'], ['healing', 'Healing'], ['other', 'Other']];

// "Give it a free cast" shows only the spell's own free cast, never one a feat grants for it.
const toDraft = (c: Character, sp: Spell): SpellDraft => ({ ...draftFromSpell(sp), freeCast: ownFreeCasts(c, sp.id).length > 0 });

export function SpellsTab() {
  const { c, update, edit, form: openForm, setForm, focus } = useSheet();
  const [castPick, setCastPick] = useState<string | null>(null);
  const [statOpen, setStatOpen] = useState<'dc' | 'atk' | null>(null);
  const f = useEntryForm('spell', BLANK_SPELL, 'spell', 'Add a custom spell');
  const picking = openForm?.kind === 'pick-spell';
  const usePrep = c.usePrep;
  const dc = spellSaveDC(c), atk = spellAttack(c);
  const prepCount = preparedCount(c);
  const breakdown = statOpen === 'dc' ? spellDcParts(c) : statOpen === 'atk' ? spellAttackParts(c) : null;
  const toggleStat = (k: 'dc' | 'atk') => setStatOpen(statOpen === k ? null : k);

  const save = () => {
    const d = f.draft, name = d.name.trim();
    if (!name || (d.acFx && !d.acVal)) return;
    const id = f.editingId;
    // A new spell named Shield, Mage Armor... fills in its AC effect. Editing never re-detects, so None sticks.
    const found = !id && !d.acFx ? detectAcSpell(name) : null;
    const form = spellFromForm(d);
    const built = {
      ...form, from: d.from, srcKind: d.srcKind, srcName: d.srcName?.trim() || undefined,
      // Both keys always present: undefined clears the effect when editing.
      acFx: form.acFx ?? found?.acFx, acVal: form.acFx ? form.acVal : found?.acVal
    };
    const sid = id ?? newId();
    update((p) => {
      const next = {
        ...p, spells: saveEntry<Spell>(p.spells, { ...built, ...keepPrep(p.spells.find((x) => x.id === id), d.always) }, id, { prep: true, id: sid }),
        ...(id ? { ...concAfterEdit(p, { ...built, id }), ...acAfterEdit(p, { ...built, id }), ...effectsAfterEdit(p, { ...built, id }) } : {})
      };
      return setOwnFreeCast(next, sid, d.freeCast, p.spells.find((x) => x.id === id)?.name);
    });
    f.close();
  };
  const form = f.isOpen && (
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
            {(TIMES.includes(f.draft.time) ? TIMES : [f.draft.time, ...TIMES]).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <TextField label="Range" value={f.draft.range} placeholder="e.g. 60 ft" onChange={(v) => f.set({ range: v })} />
        <SourcePicker self={f.editingId ? linkOf('spell', f.editingId) : undefined} value={f.draft} onChange={(v) => f.set(v)} />
        <TextField label="Dice / effect" value={f.draft.dice} placeholder="e.g. DEX save · 3d6 Fire" onChange={(v) => f.set({ dice: v })} />
        <TextField label="Duration" value={f.draft.dur} placeholder="e.g. 1 hour, Instantaneous" onChange={(v) => f.set({ dur: v })} />
        <TextField label="Components" value={f.draft.comp} placeholder="e.g. V, S, M (a pinch of salt)" onChange={(v) => f.set({ comp: v })} />
        <label className="check"><input type="checkbox" checked={f.draft.conc} onChange={(e) => f.set({ conc: e.target.checked })} />Concentration</label>
        <label className="check"><input type="checkbox" checked={f.draft.always} onChange={(e) => f.set({ always: e.target.checked })} />Always prepared</label>
        <label className="field">AC effect
          <select className="input" value={f.draft.acFx} onChange={(e) => {
            const acFx = e.target.value as AcEffect | '';
            const known = detectAcSpell(f.draft.name);
            f.set({ acFx, ...(acFx && known ? { acVal: known.acVal } : {}) });
          }}>
            {AC_EFFECTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        {f.draft.acFx && (
          <label className="field">{f.draft.acFx === 'bonus' ? 'AC bonus' : f.draft.acFx === 'base' ? 'Base AC (+ DEX)' : 'AC at least'}
            <NumInput className="input" value={f.draft.acVal} min={0} max={30} onCommit={(acVal) => f.set({ acVal })} />
            {!f.draft.acVal && <span className="small" style={{ color: 'var(--danger)' }}>Enter a value for the AC effect.</span>}
          </label>
        )}
        <label className="field">Attack
          <select className="input" value={f.draft.atk} onChange={(e) => f.set({ atk: e.target.value as SpellDraft['atk'] })}>
            {ATTACKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">Saving throw
          <select className="input" value={f.draft.save} onChange={(e) => f.set({ save: e.target.value as SpellDraft['save'] })}>
            {SAVES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">Effect
          <select className="input" value={f.draft.fx} onChange={(e) => f.set({ fx: e.target.value as SpellDraft['fx'] })}>
            {EFFECTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <TextField label="Damage or healing dice" value={f.draft.dmg} placeholder="e.g. 8d6" onChange={(v) => f.set({ dmg: v })} />
        <DamageTypeField value={f.draft.dtype} onChange={(dtype) => f.set({ dtype })} />
        <label className="check"><input type="checkbox" checked={f.draft.freeCast} onChange={(e) => f.set({ freeCast: e.target.checked })} />Give it a free cast (once per Long Rest)</label>
      </div>
      <label className="field">Description
        <textarea className="input textarea" rows={4} value={f.draft.desc} onChange={(e) => f.set({ desc: e.target.value })} />
      </label>
      <TextField label="At higher levels" value={f.draft.higher} placeholder="e.g. +1d6 for each slot level above 3" onChange={(v) => f.set({ higher: v })} />
    </EntryForm>
  );

  const groups = [];
  for (let l = 0; l <= 9; l++) {
    const list = sortSpells(c, c.spells.filter((x) => (x.lvl || 0) === l && (c.spellFilter !== 'prepared' || l === 0 || spellUsable(c, x) || focus?.id === 'spell-' + x.id)));
    if (list.length) groups.push({ l, list });
  }
  const slotLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((l) => edit || c.slotMax[l] > 0);
  const slotPips = (l: number, max: number) => (
    <UsePips used={c.slotUsed[l]} max={max} color="var(--accent)" size={20} noun={'level ' + l + ' slot'} onChange={(n) => update((p) => setSlotUsed(p, l, n))} />
  );

  // Prepared spells are counted per casting class (PHB p.45); Edit mode sets each row's maximum and ability (every row,
  // so a class can become a caster).
  const casters = castingRows(c);
  const setRow = (id: string, f: (r: ClassRow) => ClassRow) => update((p) => ({ classes: p.classes.map((r) => (r.id === id ? f(r) : r)) }));
  const rowName = (r: ClassRow) => r.name || 'Level ' + r.lvl;
  const abilityCard = casters.filter((r) => r.castAb).length > 1
    ? casters.filter((r) => r.castAb).map((r) => rowName(r) + ' ' + CAST_NAMES[r.castAb as CastAbility]).join(' · ') : CAST_NAMES[c.castAb];
  return (
    <div className="col gap-12">
      <div className="row wrap gap-12" style={{ alignItems: 'stretch' }}>
        <StatCard label="Spellcasting ability" value={abilityCard} />
        <DieStat label="Spell save DC" value={dc === null ? '' : String(dc)} open={statOpen === 'dc'} onToggle={dc === null ? undefined : () => toggleStat('dc')} />
        <DieStat label="Spell attack" value={atk === null ? '' : fmt(atk)} open={statOpen === 'atk'} onToggle={atk === null ? undefined : () => toggleStat('atk')} />
        {usePrep && (
          <div className="well col" style={{ flex: '1 1 140px' }}>
            <span className="small">Prepared spells</span>
            {casters.length === 0
              ? <span style={{ fontSize: 20, fontWeight: 700 }}>{prepCount}</span>
              : <span style={{ fontSize: 20, fontWeight: 700 }}>{casters.map((r, i) => {
                const n = preparedCount(c, r);
                return <span key={r.id} style={{ color: r.prep && n > r.prep ? 'var(--danger)' : 'var(--text)' }}>{(i ? ' · ' : '') + rowName(r) + ' ' + n + (r.prep ? '/' + r.prep : '')}</span>;
              })}</span>}
            {edit && c.classes.map((r) => (
              <div key={r.id} className="row wrap gap-6" style={{ marginTop: 4 }}>
                <div role="group" aria-label={'Maximum prepared, ' + rowName(r)} className="row gap-6">
                  <span className="small">{rowName(r)} max</span>
                  <Step small label={'Lower maximum prepared, ' + rowName(r)} onClick={() => setRow(r.id, (x) => ({ ...x, prep: clamp(x.prep - 1, 0, 40) }))}>−</Step>
                  <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{r.prep}</span>
                  <Step small label={'Raise maximum prepared, ' + rowName(r)} onClick={() => setRow(r.id, (x) => ({ ...x, prep: clamp(x.prep + 1, 0, 40) }))}>+</Step>
                </div>
                <select className="input" aria-label={'Spellcasting ability, ' + rowName(r)} value={r.castAb ?? 'none'}
                  onChange={(e) => setRow(r.id, (x) => { const { castAb: _, ...rest } = x; return e.target.value === 'none' ? rest : { ...rest, castAb: e.target.value as Ability }; })}>
                  {Object.entries(CAST_NAMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
      {breakdown && (
        <div className="block">
          <h3 className="block-title">{statOpen === 'dc' ? 'Spell save DC' : 'Spell attack'}</h3>
          {/* Same look as the Armor Class panel. The DC's first part (8) is a bare number; the rest are signed. */}
          <PartTiles parts={breakdown} bareFirst={statOpen === 'dc'} />
        </div>
      )}

      <div className="row wrap" style={{ gap: '8px 14px' }}>
        <button type="button" role="switch" aria-checked={usePrep} className="btn row gap-10" style={{ fontSize: 14, padding: '0 12px 0 8px' }}
          onClick={() => update({ usePrep: !usePrep })}>
          <span aria-hidden="true" style={{ position: 'relative', flex: 'none', width: 40, height: 24, borderRadius: 12, background: usePrep ? 'var(--accent)' : 'var(--line-2)' }}>
            <span style={{ position: 'absolute', top: 3, left: usePrep ? 19 : 3, width: 18, height: 18, borderRadius: '50%', background: usePrep ? 'var(--on-accent)' : 'var(--muted)' }} />
          </span>
          Track prepared spells
        </button>
        {usePrep && (
          <div role="group" aria-label="Which spells to show" className="row gap-4">
            {([['all', 'All spells'], ['prepared', 'Prepared only']] as const).map(([k, label]) => {
              const on = c.spellFilter === k;
              return <button key={k} type="button" aria-pressed={on} className="filter-btn" onClick={() => update({ spellFilter: k })}>{label}</button>;
            })}
          </div>
        )}
        <span className="muted" style={{ flex: '1 1 260px' }}>
          {usePrep
            ? 'Tap P to prepare a spell. A dashed P means always prepared (doesn’t count toward the limit).'
            : 'Off: every spell on the list can be cast (for classes that know their spells, like Bard or Sorcerer).'}
        </span>
      </div>

      <div className="block">
        <div className="row wrap between gap-6">
          <h3 className="block-title">Spell slots</h3>
          <span className="muted">Tap a circle to mark a slot used or restore it</span>
        </div>
        {slotLevels.map((l) => {
          const max = c.slotMax[l], left = slotsLeft(c, l);
          return (
            <div key={l} className="well row wrap" style={{ gap: '4px 10px', minHeight: 44, padding: '0 12px' }}>
              <span style={{ minWidth: 64, fontWeight: 700 }}>Level {l}</span>
              <div className="row wrap">
                {slotPips(l, max)}
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
        {(c.pactMax > 0 || edit) && (
          <div className="well row wrap" style={{ gap: '4px 10px', minHeight: 44, padding: '0 12px' }}>
            <span style={{ minWidth: 64, fontWeight: 700 }}>Pact slots{c.pactLvl ? ' (' + ORDINAL[c.pactLvl] + ')' : ''}</span>
            <div className="row wrap">
              <UsePips used={c.pactUsed} max={c.pactMax} color="var(--accent)" size={20} noun="pact slot" onChange={(n) => update({ pactUsed: clamp(n, 0, c.pactMax) })} />
            </div>
            <span className="muted">{c.pactMax ? pactLeft(c) + ' of ' + c.pactMax + ' left' : 'none'}</span>
            {edit && (
              <div className="row wrap gap-6" style={{ marginLeft: 'auto' }}>
                <div role="group" aria-label="Pact slot count" className="row gap-6">
                  <span className="muted">Count</span>
                  <Step label="Fewer pact slots" onClick={() => update((p) => ({ pactMax: Math.max(0, p.pactMax - 1), pactUsed: Math.min(p.pactUsed, Math.max(0, p.pactMax - 1)) }))}>−</Step>
                  <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{c.pactMax}</span>
                  <Step label="More pact slots" onClick={() => update((p) => ({ pactMax: Math.min(9, p.pactMax + 1) }))}>+</Step>
                </div>
                <div role="group" aria-label="Pact slot level" className="row gap-6">
                  <span className="muted">Level</span>
                  <Step label="Lower pact slot level" onClick={() => update((p) => ({ pactLvl: Math.max(1, p.pactLvl - 1) }))}>−</Step>
                  <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{c.pactLvl}</span>
                  <Step label="Raise pact slot level" onClick={() => update((p) => ({ pactLvl: Math.min(5, p.pactLvl + 1) }))}>+</Step>
                </div>
              </div>
            )}
          </div>
        )}
        {slotLevels.length === 0 && c.pactMax === 0 && <span className="muted" style={{ padding: '8px 0' }}>No spell slots. Turn on Edit to set them.</span>}
      </div>

      <div className="row wrap between" style={{ gap: '8px 14px' }}>
        {/* Hidden only by the add form: while a spell below is edited it stays, so the list doesn't shift up. */}
        {(!f.isOpen || f.editingId) && !picking ? (
          <div className="row wrap gap-8">
            <AddButton always onClick={() => setForm({ kind: 'pick-spell', id: null })}>+ Add spell</AddButton>
            <AddButton always onClick={f.openAdd}>Custom spell</AddButton>
          </div>
        ) : <span />}
        <div role="group" aria-label="Sort spells" className="row wrap gap-4">
          {SPELL_SORTS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={c.spellSort === k} className="filter-btn" onClick={() => update({ spellSort: k })}>{label}</button>
          ))}
        </div>
      </div>
      {f.isOpen && !f.editingId && form}
      {picking && <SpellPicker onClose={() => setForm(null)} />}

      {groups.map(({ l, list }) => {
        const max = l ? c.slotMax[l] : 0, left = slotsLeft(c, l);
        return (
          <div key={l} className="block">
            <div className="row wrap between" style={{ gap: '4px 10px' }}>
              <h3 className="block-title">{l === 0 ? 'Cantrips' : 'Level ' + l}</h3>
              {max > 0 && (
                <div role="group" aria-label={'Level ' + l + ' spell slots'} className="row wrap">
                  <span style={{ fontSize: 13, color: left ? 'var(--muted)' : 'var(--danger)', marginRight: 4 }}>{left} of {max} slots left</span>
                  {slotPips(l, max)}
                </div>
              )}
              {l > 0 && max === 0 && <span style={{ fontSize: 13, color: 'var(--dim)' }}>No level {l} slots</span>}
            </div>
            {list.map((sp) => (f.editingId === sp.id ? <div key={sp.id}>{form}</div> : (
              <SpellRow key={sp.id} sp={sp} picking={castPick === sp.id} setPicking={(on) => setCastPick(on ? sp.id : null)}
                onEdit={() => f.openEdit(sp.id, toDraft(c, sp))} />
            )))}
          </div>
        );
      })}

    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="well col" style={{ flex: '1 1 140px' }}>
      <span className="small">{label}</span><span style={{ fontSize: 20, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

// Tapping shows how the number is made up. Without a spellcasting ability there is nothing to show, so it is no button.
function DieStat({ label, value, open, onToggle }: { label: string; value: string; open: boolean; onToggle?: () => void }) {
  if (!onToggle) {
    return <div className="well row gap-10" style={{ flex: '1 1 140px' }}><DieBadge value={value} /><span className="small">{label}</span></div>;
  }
  return (
    <button type="button" className="well row gap-10 die-stat" aria-expanded={open} onClick={onToggle} style={{ flex: '1 1 140px' }}>
      <DieBadge value={value} /><span className="small">{label}</span>
    </button>
  );
}

function SpellRow({ sp, picking, setPicking, onEdit }: { sp: Spell; picking: boolean; setPicking: (on: boolean) => void; onEdit: () => void }) {
  const { c, update } = useSheet();
  const lvl = sp.lvl || 0;
  const usePrep = c.usePrep;
  const isAlways = usePrep && !!sp.always;
  const prepOn = !usePrep || !!sp.prep;
  const usable = spellUsable(c, sp);
  const concOn = c.conc?.id === sp.id;
  const frees = freeCastsOf(c, sp.id);
  // A non-Concentration spell whose grants need it on (Shillelagh) gets an On/Off switch; a Concentration one is on
  // while concentrating.
  const link = linkOf('spell', sp.id);
  const effect = !sp.c && hasActiveEffect(c, link);
  // An item's spell is cast from the item (its charges), never with a slot.
  const fromItem = !!itemOfSpell(c, sp);
  const concOf = { id: sp.id, name: sp.name };

  const casts: { l: number; left: number }[] = [];
  if (lvl > 0) {
    for (let l = lvl; l <= 9; l++) {
      if (c.slotMax[l]) casts.push({ l, left: slotsLeft(c, l) });
    }
  }
  const first = casts.find((x) => x.left > 0);
  const upcasts = first ? casts.filter((x) => x.l > first.l) : [];
  const castWith = (l: number) => {
    update((p) => castSpell(p, sp, l));
    setPicking(false);
  };
  // A pact slot casts any spell up to the pact level (PHB p.45).
  const pact = lvl > 0 && c.pactMax > 0 && c.pactLvl >= lvl ? pactLeft(c) : null;

  const prepBox = (on: boolean, dashed: boolean) => ({
    flex: 'none', width: 44, height: 44, padding: 0, borderRadius: 10, font: '700 15px var(--sans)',
    border: '2px ' + (dashed ? 'dashed' : 'solid') + ' ' + (on ? 'var(--accent)' : 'var(--dash)')
  });
  const before = <>
    {usePrep && lvl > 0 && !isAlways && (
      <button type="button" aria-pressed={prepOn} aria-label={prepOn ? sp.name + ' is prepared; tap to unprepare' : 'Prepare ' + sp.name} title="Prepared"
        onClick={() => update((p) => ({ spells: patchEntry(p.spells, sp.id, (x) => ({ prep: !x.prep })) }))}
        style={{ ...prepBox(prepOn, false), cursor: 'pointer', background: prepOn ? 'var(--accent)' : 'transparent', color: prepOn ? 'var(--on-accent)' : 'var(--off)' }}>P</button>
    )}
    {lvl > 0 && isAlways && (
      <span role="img" aria-label="Always prepared" title="Always prepared" className="row" style={{ ...prepBox(true, true), color: 'var(--accent)', justifyContent: 'center' }}>P</span>
    )}
    {usePrep && lvl === 0 && <span aria-hidden="true" style={{ flex: 'none', width: 44 }} />}
  </>;

  // A spell from an item that is off, or granted from a higher level, doesn't count yet.
  const why = inactiveReason(c, sp);
  const head = (
    <span className="col" style={{ opacity: (lvl > 0 && !usable) || why ? 0.45 : 1 }}>
      <span className="row gap-6" style={{ fontWeight: 600 }}>
        {sp.name}
        {lvl > 0 && !usable && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>not prepared</span>}
        {sp.c && <span title="Concentration" style={{ fontSize: 11, fontWeight: 700, border: '1px solid var(--blue)', color: 'var(--blue)', borderRadius: 4, padding: '0 4px' }}>C</span>}
      </span>
      {why && <span className="small">Inactive: {why}</span>}
      <span className="muted">{[sp.time, sp.range].filter((x) => x).join(' · ')}</span>
      {(sp.dur || sp.comp) && <span className="muted">{[sp.dur, sp.comp].filter((x) => x).join(' · ')}</span>}
      {sp.dice && <span style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{sp.dice}</span>}
      {sp.castAb && sp.dc === undefined && sp.atkB === undefined && <span className="muted">Casts with {sp.castAb.toUpperCase()}: save DC {spellSaveDcFor(c, sp)} · attack {fmt(spellAttackFor(c, sp)!)}</span>}
      {(sp.dc !== undefined || sp.atkB !== undefined) && <span className="muted">{[sp.dc !== undefined && 'save DC ' + sp.dc, sp.atkB !== undefined && 'attack ' + fmt(sp.atkB)].filter(Boolean).join(' · ')}</span>}
    </span>
  );

  const side = (
    <div className="row wrap gap-6" style={{ padding: '6px 0' }}>
      {sp.c && (lvl === 0 || usable) && (
        <button type="button" aria-pressed={concOn} aria-label={concOn ? 'Stop concentrating on ' + sp.name : 'Concentrate on ' + sp.name}
          className="btn btn-sm" style={{ border: '1px solid var(--blue)', background: concOn ? 'var(--blue)' : 'transparent', color: concOn ? 'var(--on-accent)' : 'var(--blue)' }}
          onClick={() => update(setConc(concOn ? null : concOf))}>{concOn ? 'Conc. ✓' : 'Conc.'}</button>
      )}
      <AcTargetSwitch sp={sp} />
      {effect && <EffectSwitch link={link} name={sp.name} />}
      {fromItem && <ItemCastButtons sp={sp} />}
      {!fromItem && (lvl === 0 || usable) && frees.map((r) => <FreeCastButton key={r.id} sp={sp} r={r} />)}
      {!fromItem && (!!first || !!pact) && usable && (
        <div role="group" aria-label={'Spell slots for ' + sp.name} className="row wrap gap-6">
          {first && <button type="button" aria-label={'Cast ' + sp.name + ' with a level ' + first.l + ' slot, ' + first.left + ' left'}
            className="btn btn-sm" style={{ border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)' }} onClick={() => castWith(first.l)}>Cast {ORDINAL[first.l]}</button>}
          {!!pact && <button type="button" aria-label={'Cast ' + sp.name + ' with a level ' + c.pactLvl + ' pact slot, ' + pact + ' left'}
            className="btn btn-sm" style={{ border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)' }} onClick={() => update((p) => castSpell(p, sp, p.pactLvl, 'pact'))}>{ORDINAL[c.pactLvl]} (pact)</button>}
          {upcasts.length > 0 && (
            <button type="button" aria-expanded={picking} aria-label={'Upcast ' + sp.name + ' with a higher slot'} className="btn btn-sm row gap-4"
              style={{ border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--text-2)' }} onClick={() => setPicking(!picking)}>
              Up<Caret open={picking} />
            </button>
          )}
        </div>
      )}
    </div>
  );

  const noSlots = !fromItem && lvl > 0 && !frees.some((r) => r.count > 0) && !first && !pact && usable;
  return (
    <EntryRow id={'spell-' + sp.id} name={sp.name} before={before} head={head} side={side}
      body={sp.desc || sourceLabel(c, sp) ? <>
        {sp.desc && <span className="entry-desc">{sp.desc}</span>}
        {sourceLabel(c, sp) && <span className="muted">Source: {sourceLabel(c, sp)}</span>}
      </> : undefined}
      onEdit={onEdit} onRemove={() => update((p) => removeRef(p, { kind: 'spell', id: sp.id }))} removeConfirm={removalNote(c, { kind: 'spell', id: sp.id })}>
      {(picking && upcasts.length > 0 || noSlots) && <>
        {picking && upcasts.length > 0 && (
          <div role="group" aria-label={'Higher slot levels for ' + sp.name} className="row wrap gap-6" style={{ padding: 8, borderRadius: 12, background: 'var(--raised)' }}>
            <span className="muted" style={{ flex: '1 1 100%' }}>Cast {sp.name} with a higher slot:</span>
            {upcasts.map(({ l, left }) => (
              <button key={l} type="button" aria-disabled={!left} aria-label={'Cast ' + sp.name + ' with a level ' + l + ' slot, ' + left + ' left'}
                className="btn btn-sm" style={{ border: '1px solid ' + (left ? 'var(--line-2)' : 'var(--line)'), background: left ? 'var(--raised)' : 'transparent', color: left ? 'var(--text)' : 'var(--off)', cursor: left ? 'pointer' : 'not-allowed', textDecoration: left ? undefined : 'line-through' }}
                onClick={() => { if (left) castWith(l); }}>{ORDINAL[l]} ({left})</button>
            ))}
          </div>
        )}
        {noSlots && <span style={{ fontSize: 13, color: 'var(--danger)' }}>No slots of this level or higher</span>}
      </>}
    </EntryRow>
  );
}
