import type { CSSProperties } from 'react';
import { ARMORS, detectArmor, fmt } from '../../logic';
import { patchEntry, removeEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Coin, Item } from '../../types';
import { AddButton, EntryActions, EntryForm, NumInput, TextField } from '../ui';

const COINS: [Coin, string, string][] = [['cp', 'CP', 'var(--coin-cp)'], ['sp', 'SP', 'var(--coin-sp)'], ['ep', 'EP', 'var(--coin-ep)'], ['gp', 'GP', 'var(--accent)'], ['pp', 'PP', 'var(--coin-pp)']];
// armor: an ARMORS name or '' for None.
const BLANK = { name: '', armor: '', bonus: 0 };

// The ARMORS row an item was set from. Leather and Padded share kind and base, so the name decides between them.
const armorName = (it: Item) => {
  const rows = ARMORS.filter(([, k, b]) => k === it.armor && b === it.acBase);
  return (rows.find(([n]) => it.name.toLowerCase().includes(n.toLowerCase().replace(/ armor$/, ''))) ?? rows[0])?.[0] ?? '';
};

const acNote = (it: Item) => {
  const bonus = it.acBonus ? fmt(it.acBonus) : '';
  if (!it.armor) return bonus && bonus + ' AC';
  const base = it.armor === 'shield' ? 'Shield +' + it.acBase
    : 'AC ' + it.acBase + (it.armor === 'light' ? ' + DEX' : it.armor === 'medium' ? ' + DEX (max 2)' : '');
  return base + (bonus && ' · ' + bonus);
};

export function InventoryTab() {
  const { c, update, edit } = useSheet();
  const f = useEntryForm('item', BLANK, 'item', 'Add an item');
  const patch = (id: string, p: Partial<Item>) => update((s) => ({ inv: patchEntry(s.inv, id, p) }));
  const save = () => {
    const name = f.draft.name.trim();
    if (!name) return;
    const a = ARMORS.find(([n]) => n === f.draft.armor);
    // A new item named like armor (e.g. "+1 Chain Mail") fills itself in. Editing never re-detects, so None sticks.
    const found = !f.editingId && !a ? detectArmor(name) : null;
    // All keys always present: an undefined one clears the field when editing.
    const built = { name, armor: a?.[1] ?? found?.armor, acBase: a?.[2] ?? found?.acBase, acBonus: (f.draft.bonus || found?.acBonus) || undefined };
    update((p) => ({ inv: saveEntry<Item>(p.inv, built, f.editingId, { qty: 1, eq: false }) }));
    f.close();
  };

  return (
    <div className="col gap-12">
      <div className="block">
        <h3 className="block-title">Magic item attunement <span className="muted">· {c.attune.filter((x) => x && x.trim()).length} / 3</span></h3>
        <div className="grid" style={{ '--min': '200px', gap: 8 } as CSSProperties}>
          {c.attune.map((v, i) => (
            <input key={i} type="text" className="input" aria-label={'Attunement slot ' + (i + 1)} value={v} placeholder="Empty slot"
              style={{ fontWeight: 600, background: 'transparent', border: v ? '1px solid var(--accent)' : '1px dashed var(--dash)' }}
              onChange={(e) => update((p) => { const a = p.attune.slice(); a[i] = e.target.value; return { attune: a }; })} />
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
        {COINS.map(([k, label, color]) => (
          <label key={k} className="well col gap-4" style={{ alignItems: 'center', padding: '8px 6px', fontSize: 12, fontWeight: 700, color }}>{label}
            <NumInput className="input" value={c.coins[k]} min={0} max={999999} style={{ font: '700 18px var(--serif)', textAlign: 'center', padding: '0 4px' }}
              onCommit={(v) => update((p) => ({ coins: { ...p.coins, [k]: v } }))} />
          </label>
        ))}
      </div>

      <ul className="col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {c.inv.map((it) => (
          <li key={it.id} className="well row wrap gap-8" style={{ padding: '6px 6px 6px 14px' }}>
            <span style={{ flex: '1 1 160px', minWidth: 0 }}>{it.name}{acNote(it) && <span className="muted" style={{ display: 'block' }}>{acNote(it)}</span>}</span>
            <button type="button" aria-pressed={it.eq} onClick={() => patch(it.id, { eq: !it.eq })} style={{
              fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, minWidth: 92, padding: '0 10px', borderRadius: 22,
              border: '1px solid ' + (it.eq ? 'var(--accent)' : 'var(--line-2)'), background: 'transparent', color: it.eq ? 'var(--accent)' : 'var(--muted)'
            }}>{it.eq ? 'Equipped' : 'Carried'}</button>
            <div className="row gap-4">
              <button type="button" className="step" style={{ fontSize: 18 }} aria-label={'Decrease ' + it.name} onClick={() => patch(it.id, { qty: Math.max(0, it.qty - 1) })}>−</button>
              <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{it.qty}</span>
              <button type="button" className="step" style={{ fontSize: 18 }} aria-label={'Increase ' + it.name} onClick={() => patch(it.id, { qty: it.qty + 1 })}>+</button>
            </div>
            <EntryActions name={it.name} canEdit={edit} onEdit={() => f.openEdit(it.id, { name: it.name, armor: armorName(it), bonus: it.acBonus || 0 })}
              onRemove={() => update((p) => ({ inv: removeEntry(p.inv, it.id) }))} />
          </li>
        ))}
        {c.res.filter((r) => r.inv).map((r) => (
          <li key={r.id} className="well row between gap-8" style={{ padding: '12px 14px' }}>
            <span>{r.name} <span className="muted">· tracked in Resources</span></span><span style={{ fontWeight: 700 }}>{r.count}</span>
          </li>
        ))}
      </ul>

      {!f.isOpen && <AddButton onClick={f.openAdd}>+ Add item</AddButton>}
      {f.isOpen && (
        <EntryForm kind="item" title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
          <TextField label="Name" value={f.draft.name} placeholder="e.g. Rope (50 ft), Bag of Holding" onChange={(v) => f.set({ name: v })} />
          <div className="row wrap gap-6">
            <label className="field" style={{ flex: '2 1 180px' }}>Armor
              <select className="input" value={f.draft.armor} onChange={(e) => f.set({ armor: e.target.value })}>
                <option value="">None</option>
                {ARMORS.map(([n]) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 80px' }}>AC bonus
              <NumInput className="input" value={f.draft.bonus} min={-5} max={10} onCommit={(bonus) => f.set({ bonus })} />
            </label>
          </div>
        </EntryForm>
      )}
    </div>
  );
}
