import type { CSSProperties } from 'react';
import { saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Coin, Item } from '../../types';
import { AddButton, EntryActions, EntryForm, NumInput, TextField } from '../ui';

const COINS: [Coin, string, string][] = [['cp', 'CP', '#D9A27A'], ['sp', 'SP', '#C8CCD2'], ['ep', 'EP', '#B9C7A4'], ['gp', 'GP', 'var(--accent)'], ['pp', 'PP', '#D7D3E8']];
const BLANK = { name: '' };

export function InventoryTab() {
  const { c, update, edit } = useSheet();
  const f = useEntryForm('item', BLANK, 'item', 'ADD AN ITEM');
  const patch = (id: string, p: Partial<Item>) => update((s) => ({ inv: s.inv.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const save = () => {
    const name = f.draft.name.trim();
    if (!name) return;
    update((p) => ({ inv: saveEntry<Item>(p.inv, { name }, f.editingId, { qty: 1, eq: false }) }));
    f.close();
  };

  return (
    <div className="col gap-12">
      <div className="card gap-8">
        <span className="caps">MAGIC ITEM ATTUNEMENT · {c.attune.filter((x) => x && x.trim()).length} / 3</span>
        <div className="grid" style={{ '--min': '200px', gap: 8 } as CSSProperties}>
          {c.attune.map((v, i) => (
            <input key={i} type="text" className="input" aria-label={'Attunement slot ' + (i + 1)} value={v} placeholder="Empty slot"
              style={{ fontWeight: 600, background: 'transparent', border: v ? '1px solid var(--accent)' : '1px dashed var(--dash)' }}
              onChange={(e) => update((p) => { const a = p.attune.slice(); a[i] = e.target.value; return { attune: a }; })} />
          ))}
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
        {COINS.map(([k, label, color]) => (
          <label key={k} className="col gap-4" style={{ alignItems: 'center', fontSize: 12, fontWeight: 700, color }}>{label}
            <NumInput className="input" value={c.coins[k]} min={0} max={999999} style={{ font: '700 18px var(--sans)', textAlign: 'center', padding: '0 4px' }}
              onCommit={(v) => update((p) => ({ coins: { ...p.coins, [k]: v } }))} />
          </label>
        ))}
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
        {c.inv.map((it) => (
          <li key={it.id} className="row wrap gap-8" style={{ padding: '6px 6px 6px 14px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ flex: '1 1 160px', minWidth: 0 }}>{it.name}</span>
            <button type="button" aria-pressed={it.eq} onClick={() => patch(it.id, { eq: !it.eq })} style={{
              fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, minWidth: 92, padding: '0 10px', borderRadius: 10,
              border: '1px solid ' + (it.eq ? 'var(--accent)' : 'var(--line-2)'), background: 'transparent', color: it.eq ? 'var(--accent)' : 'var(--muted)'
            }}>{it.eq ? 'Equipped' : 'Carried'}</button>
            <div className="row gap-4">
              <button type="button" className="step" style={{ fontSize: 18 }} aria-label={'Decrease ' + it.name} onClick={() => patch(it.id, { qty: Math.max(0, it.qty - 1) })}>−</button>
              <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{it.qty}</span>
              <button type="button" className="step" style={{ fontSize: 18 }} aria-label={'Increase ' + it.name} onClick={() => patch(it.id, { qty: it.qty + 1 })}>+</button>
            </div>
            <EntryActions name={it.name} canEdit={edit} onEdit={() => f.openEdit(it.id, { name: it.name })}
              onRemove={() => update((p) => ({ inv: p.inv.filter((x) => x.id !== it.id) }))} />
          </li>
        ))}
        {c.res.filter((r) => r.inv).map((r) => (
          <li key={r.id} className="row between gap-8" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
            <span>{r.name} <span className="muted">· tracked in Resources</span></span><span style={{ fontWeight: 700 }}>{r.count}</span>
          </li>
        ))}
      </ul>

      {!f.isOpen && <AddButton onClick={f.openAdd}>+ Add item</AddButton>}
      {f.isOpen && (
        <EntryForm kind="item" title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
          <TextField label="Name" value={f.draft.name} placeholder="e.g. Rope (50 ft), Bag of Holding" onChange={(v) => f.set({ name: v })} />
        </EntryForm>
      )}
    </div>
  );
}
