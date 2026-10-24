import type { CSSProperties } from 'react';
import { saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Attack, Rider } from '../../types';
import { AddButton, EntryActions, EntryForm, TextField } from '../ui';

const ATTACK_BLANK = { name: '', hit: '', dmg: '', info: '', mastery: '' };
const RIDER_BLANK = { name: '', dice: '' };
const COMBAT_ACTIONS = ['Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Influence', 'Magic', 'Ready', 'Search', 'Study', 'Utilize'];

export function ActionsTab() {
  const { c, update, edit } = useSheet();
  const fa = useEntryForm('attack', ATTACK_BLANK, 'attack', 'ADD AN ATTACK');
  const fr = useEntryForm('rider', RIDER_BLANK, 'extra damage', 'ADD EXTRA DAMAGE');

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

  return (
    <div className="col gap-12">
      {c.attacks.map((a) => (
        <div key={a.id} className="card row wrap gap-12" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <div className="col" style={{ flex: '1 1 220px', minWidth: 0, gap: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{a.name}</span>
            {a.info && <span className="muted">{a.info}</span>}
            {a.mastery && <span style={{ fontSize: 13, color: 'var(--text-2)' }}><strong style={{ color: 'var(--accent)' }}>Mastery</strong> · {a.mastery}</span>}
          </div>
          <div className="stat-box" style={{ minWidth: 96 }}><span className="k">TO HIT</span><span style={{ fontSize: 18, fontWeight: 700 }}>{a.hit ? 'd20 ' + a.hit : '—'}</span></div>
          <div className="stat-box" style={{ minWidth: 140 }}><span className="k">DAMAGE</span><span style={{ fontSize: 16, fontWeight: 700 }}>{a.dmg || '—'}</span></div>
          <EntryActions name={a.name} canEdit={edit}
            onEdit={() => fa.openEdit(a.id, { name: a.name, hit: a.hit || '', dmg: a.dmg || '', info: a.info || '', mastery: a.mastery || '' })}
            onRemove={() => update((p) => ({ attacks: p.attacks.filter((x) => x.id !== a.id) }))} />
        </div>
      ))}
      {!fa.isOpen && <AddButton onClick={fa.openAdd}>+ Add attack</AddButton>}
      {fa.isOpen && (
        <EntryForm kind="attack" title={fa.title} saveLabel={fa.saveLabel} onSave={saveAttack} onCancel={fa.close}>
          <div className="grid">
            <TextField label="Name" value={fa.draft.name} placeholder="e.g. Dagger" onChange={(v) => fa.set({ name: v })} />
            <TextField label="To hit bonus" value={fa.draft.hit} placeholder="e.g. +7" onChange={(v) => fa.set({ hit: v })} />
            <TextField label="Damage" value={fa.draft.dmg} placeholder="e.g. 1d4 +4 Piercing" onChange={(v) => fa.set({ dmg: v })} />
            <TextField label="Range & properties" value={fa.draft.info} placeholder="e.g. 20/60 ft · Finesse, Light" onChange={(v) => fa.set({ info: v })} />
            <TextField label="Mastery (optional)" value={fa.draft.mastery} placeholder="e.g. Nick: extra Light attack" onChange={(v) => fa.set({ mastery: v })} />
          </div>
        </EntryForm>
      )}

      <div className="card gap-4">
        <span className="caps">EXTRA DAMAGE ON A HIT</span>
        {c.riders.map((r) => (
          <div key={r.id} className="list-row">
            <span className="grow">{r.name}</span><strong style={{ marginRight: 4 }}>{r.dice}</strong>
            <EntryActions name={r.name} canEdit={edit} onEdit={() => fr.openEdit(r.id, { name: r.name, dice: r.dice || '' })}
              onRemove={() => update((p) => ({ riders: p.riders.filter((x) => x.id !== r.id) }))} />
          </div>
        ))}
        {!fr.isOpen && <AddButton style={{ marginTop: 8 }} onClick={fr.openAdd}>+ Add extra damage</AddButton>}
        {fr.isOpen && (
          <EntryForm kind="rider" inline title={fr.title} saveLabel={fr.saveLabel} onSave={saveRider} onCancel={fr.close}>
            <div className="row wrap gap-6">
              <input type="text" className="input" style={{ flex: '2 1 180px', width: 180, padding: '0 10px' }} aria-label="Extra damage source"
                placeholder="Source, e.g. Sneak Attack" value={fr.draft.name} onChange={(e) => fr.set({ name: e.target.value })} />
              <input type="text" className="input" style={{ flex: '1 1 110px', width: 110, padding: '0 10px' }} aria-label="Extra damage dice"
                placeholder="Dice, e.g. +3d6" value={fr.draft.dice} onChange={(e) => fr.set({ dice: e.target.value })} />
            </div>
          </EntryForm>
        )}
      </div>

      <div className="col gap-8">
        <span className="caps">ACTIONS IN COMBAT</span>
        <ul className="row wrap gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {COMBAT_ACTIONS.map((a) => <li key={a} style={pillStyle}>{a}</li>)}
        </ul>
      </div>
    </div>
  );
}

const pillStyle: CSSProperties = { fontSize: 13, background: 'var(--raised)', borderRadius: 8, padding: '6px 10px' };
