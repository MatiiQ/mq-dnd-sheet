import type { CSSProperties } from 'react';
import { activeGrants, sourceLabel } from '../../links';
import { COMBAT_ACTIONS, removeRef } from '../../logic';
import { patchEntry, removeEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Attack, Rider } from '../../types';
import { AddButton, DieBadge, EntryForm, EntryRow, Step, TextField } from '../ui';

const ECON: Record<string, string> = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction', free: 'Free', other: 'Other' };

const ATTACK_BLANK = { name: '', hit: '', dmg: '', info: '', mastery: '' };
const RIDER_BLANK = { name: '', dice: '' };

export function ActionsTab() {
  const { c, update } = useSheet();
  const fa = useEntryForm('attack', ATTACK_BLANK, 'attack', 'Add an attack');
  const fr = useEntryForm('rider', RIDER_BLANK, 'extra damage', 'Add extra damage');

  const saveAttack = () => {
    const d = fa.draft, name = d.name.trim();
    if (!name) return;
    let hit = d.hit.trim();
    if (/^\d+$/.test(hit)) hit = '+' + hit;
    update((p) => ({ attacks: saveEntry<Attack>(p.attacks, { name, hit, dmg: d.dmg.trim(), info: d.info.trim(), mastery: d.mastery.trim() }, fa.editingId) }));
    fa.close();
  };
  const saveRider = () => {
    const name = fr.draft.name.trim();
    if (!name) return;
    update((p) => ({ riders: saveEntry<Rider>(p.riders, { name, dice: fr.draft.dice.trim() }, fr.editingId) }));
    fr.close();
  };
  const attackForm = fa.isOpen && (
    <EntryForm kind="attack" title={fa.title} saveLabel={fa.saveLabel} onSave={saveAttack} onCancel={fa.close}>
      <div className="grid">
        <TextField label="Name" value={fa.draft.name} placeholder="e.g. Dagger" onChange={(v) => fa.set({ name: v })} />
        <TextField label="To hit bonus" value={fa.draft.hit} placeholder="e.g. +7" onChange={(v) => fa.set({ hit: v })} />
        <TextField label="Damage" value={fa.draft.dmg} placeholder="e.g. 1d4 +4 Piercing" onChange={(v) => fa.set({ dmg: v })} />
        <TextField label="Range & properties" value={fa.draft.info} placeholder="e.g. 20/60 ft · Finesse, Light" onChange={(v) => fa.set({ info: v })} />
        <TextField label="Mastery (optional)" value={fa.draft.mastery} placeholder="e.g. Nick: extra Light attack" onChange={(v) => fa.set({ mastery: v })} />
      </div>
    </EntryForm>
  );
  const riderForm = fr.isOpen && (
    <EntryForm kind="rider" inline title={fr.title} saveLabel={fr.saveLabel} onSave={saveRider} onCancel={fr.close}>
      <div className="row wrap gap-6">
        <input type="text" className="input" style={{ flex: '2 1 180px', width: 180, padding: '0 10px' }} aria-label="Extra damage source"
          placeholder="Source, e.g. Sneak Attack" value={fr.draft.name} onChange={(e) => fr.set({ name: e.target.value })} />
        <input type="text" className="input" style={{ flex: '1 1 110px', width: 110, padding: '0 10px' }} aria-label="Extra damage dice"
          placeholder="Dice, e.g. +3d6" value={fr.draft.dice} onChange={(e) => fr.set({ dice: e.target.value })} />
      </div>
    </EntryForm>
  );

  // Actions that features give (Wild Shape, Healing Hands), with the uses of the resource they spend. Plan 5 replaces this.
  const featureActions = activeGrants(c, 'action');
  return (
    <div className="col gap-12">
      {featureActions.length > 0 && (
        <div className="block col gap-6">
          <h3 className="block-title">From features</h3>
          {featureActions.map((g) => {
            const r = g.res ? c.res.find((x) => x.id === g.res) : undefined;
            return (
              <div key={g.id} className="well row gap-8">
                <span className="col grow">
                  <strong>{g.name}</strong>
                  <span className="muted">{[g.econ && ECON[g.econ], g.dice, g.note, sourceLabel(c, g)].filter(Boolean).join(' · ')}</span>
                </span>
                {r && <>
                  <Step label={'Use ' + r.name} onClick={() => update((p) => ({ res: patchEntry(p.res, r.id, (x) => ({ count: Math.max(0, x.count - 1) })) }))}>−</Step>
                  <span style={{ fontWeight: 700, minWidth: 36, textAlign: 'center' }} aria-label={r.name + ' uses left'}>{r.count}</span>
                  <Step label={'Restore ' + r.name} onClick={() => update((p) => ({ res: patchEntry(p.res, r.id, (x) => ({ count: x.count + 1 })) }))}>+</Step>
                </>}
              </div>
            );
          })}
        </div>
      )}
      {c.attacks.map((a) => (fa.editingId === a.id ? <div key={a.id}>{attackForm}</div> : (
        <EntryRow key={a.id} name={a.name}
          head={<>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{a.name}</span>
            {a.info && <span className="muted">{a.info}</span>}
            {a.mastery && <span style={{ fontSize: 13, color: 'var(--text-2)' }}><strong style={{ color: 'var(--accent)' }}>Mastery</strong> · {a.mastery}</span>}
          </>}
          side={<div className="row wrap gap-10" style={{ minWidth: 0, padding: '6px 0' }}>
            <span className="sr-only">To hit</span><DieBadge value={a.hit} />
            <span className="sr-only">Damage</span><span style={{ fontSize: 16, fontWeight: 600 }}>{a.dmg || '—'}</span>
          </div>}
          onEdit={() => fa.openEdit(a.id, { name: a.name, hit: a.hit || '', dmg: a.dmg || '', info: a.info || '', mastery: a.mastery || '' })}
          onRemove={() => update((p) => removeRef(p, { kind: 'attack', id: a.id }))} />
      )))}
      {!fa.isOpen && <AddButton onClick={fa.openAdd}>+ Add attack</AddButton>}
      {fa.isOpen && !fa.editingId && attackForm}

      <div className="block">
        <h3 className="block-title">Extra damage on a hit</h3>
        {c.riders.map((r) => (fr.editingId === r.id ? <div key={r.id}>{riderForm}</div> : (
          <EntryRow key={r.id} name={r.name} head={<span>{r.name}</span>} side={<strong style={{ marginRight: 4 }}>{r.dice}</strong>}
            onEdit={() => fr.openEdit(r.id, { name: r.name, dice: r.dice || '' })}
            onRemove={() => update((p) => ({ riders: removeEntry(p.riders, r.id) }))} />
        )))}
        {!fr.isOpen && <AddButton onClick={fr.openAdd}>+ Add extra damage</AddButton>}
        {fr.isOpen && !fr.editingId && riderForm}
      </div>

      <div className="block">
        <h3 className="block-title">Actions in combat</h3>
        <ul className="row wrap gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {COMBAT_ACTIONS.map((a) => <li key={a} style={pillStyle}>{a}</li>)}
        </ul>
      </div>
    </div>
  );
}

const pillStyle: CSSProperties = { fontSize: 13, background: 'var(--well)', borderRadius: 16, padding: '6px 12px' };
