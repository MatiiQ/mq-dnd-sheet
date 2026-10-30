import { useState, type CSSProperties } from 'react';
import { ARMORS, CARRY_MULT, SIZES, carriedWeight, carryCapacity, detectArmor, effScore, fmt, parseWeight, removeItem } from '../../logic';
import { patchEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Coin, Item } from '../../types';
import { AddButton, EntryForm, EntryRow, NumInput, TextField } from '../ui';

const COINS: [Coin, string, string][] = [['cp', 'CP', 'var(--coin-cp)'], ['sp', 'SP', 'var(--coin-sp)'], ['ep', 'EP', 'var(--coin-ep)'], ['gp', 'GP', 'var(--accent)'], ['pp', 'PP', 'var(--coin-pp)']];
// armor: an ARMORS name or '' for None. wt: the weight as typed.
const BLANK = { name: '', armor: '', bonus: 0, wt: '', desc: '' };
// Weights show to one decimal place.
const lb = (n: number) => String(Math.round(n * 10) / 10);
const sizeName = (s: string) => SIZES.find(([k]) => k === s)?.[1] ?? s;

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
  const { c, update } = useSheet();
  const f = useEntryForm('item', BLANK, 'item', 'Add an item');
  const [carryOpen, setCarryOpen] = useState(false);
  const cap = carryCapacity(c), carried = carriedWeight(c), over = carried > cap.carry;
  const patch = (id: string, p: Partial<Item>) => update((s) => ({ inv: patchEntry(s.inv, id, p) }));
  const save = () => {
    const name = f.draft.name.trim();
    if (!name) return;
    const a = ARMORS.find(([n]) => n === f.draft.armor);
    // A new item named like armor (e.g. "+1 Chain Mail") fills itself in. Editing never re-detects, so None sticks.
    const found = !f.editingId && !a ? detectArmor(name) : null;
    // All keys always present: an undefined one clears the field when editing.
    const built = {
      name, armor: a?.[1] ?? found?.armor, acBase: a?.[2] ?? found?.acBase, acBonus: (f.draft.bonus || found?.acBonus) || undefined,
      wt: parseWeight(f.draft.wt), desc: f.draft.desc.trim() || undefined
    };
    update((p) => ({ inv: saveEntry<Item>(p.inv, built, f.editingId, { qty: 1, eq: false }) }));
    f.close();
  };
  const form = f.isOpen && (
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
      <div className="row wrap gap-6">
        <label className="field" style={{ flex: '1 1 100px' }}>Weight (lb each)
          <input type="text" inputMode="decimal" className="input" value={f.draft.wt} placeholder="e.g. 0.5" onChange={(e) => f.set({ wt: e.target.value })} />
        </label>
        <TextField label="Description" style={{ flex: '3 1 220px' }} value={f.draft.desc} placeholder="What it does" onChange={(v) => f.set({ desc: v })} />
      </div>
    </EntryForm>
  );

  return (
    <div className="col gap-12">
      <div className="block">
        <h3 className="block-title">Magic item attunement <span className="muted">· {c.attuneIds.filter(Boolean).length} / 3</span></h3>
        <div className="grid" style={{ '--min': '200px', gap: 8 } as CSSProperties}>
          {c.attuneIds.map((id, i) => {
            const item = c.inv.find((it) => it.id === id);
            // Equipped items not in another slot, plus this slot's own item (which may have been unequipped since).
            const choices = c.inv.filter((it) => it.id === id || (it.eq && !c.attuneIds.includes(it.id)));
            return (
              <div key={i} className="col gap-4">
                <select className={'input attune-slot' + (id ? ' filled' : '')} aria-label={'Attunement slot ' + (i + 1)} value={id}
                  onChange={(e) => update((p) => { const a = p.attuneIds.slice(); a[i] = e.target.value; return { attuneIds: a }; })}>
                  <option value="">Empty</option>
                  {choices.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
                {item && !item.eq && <span className="attune-note">not equipped</span>}
              </div>
            );
          })}
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

      <div className="block">
        <button type="button" className="well carry" aria-expanded={carryOpen} onClick={() => setCarryOpen(!carryOpen)}>
          <span className="row between gap-8">
            <strong>Carried</strong>
            <span><strong style={over ? { color: 'var(--danger)' } : undefined}>{lb(carried)}</strong> / {lb(cap.carry)} lb</span>
          </span>
          <span className="carry-track" aria-hidden="true">
            <span className={'carry-fill' + (over ? ' over' : '')} style={{ width: Math.min(100, cap.carry ? (carried / cap.carry) * 100 : 100) + '%' }} />
          </span>
        </button>
        {carryOpen && (
          <div className="grid speed-grid">
            <div className="tile"><span className="muted">Carry</span><span className="speed-value">{lb(cap.carry)} lb</span>
              <span className="muted">Strength {effScore(c, 'str')} × {CARRY_MULT[cap.size]} lb ({sizeName(cap.size)})</span></div>
            {c.carryUp && <div className="tile"><span className="muted">Counts as one size larger</span><span className="speed-value">{sizeName(cap.size)}</span>
              <span className="muted">Size {sizeName(c.size)}</span></div>}
            <div className="tile"><span className="muted">Drag, lift or push</span><span className="speed-value">{lb(cap.push)} lb</span>
              <span className="muted">Twice the carry limit</span></div>
            <div className="tile"><span className="muted">Coins</span><span className="speed-value">{lb(Object.values(c.coins).reduce((t, n) => t + n, 0) / 50)} lb</span>
              <span className="muted">50 coins weigh 1 lb</span></div>
          </div>
        )}
        {over && (
          <div role="status" className="notice notice-dead">
            Over capacity: this load is heavier than {c.ch.name.trim() || 'this character'} can carry. While dragging, lifting or pushing more than that, Speed is at most 5 ft.
          </div>
        )}
      </div>

      {/* Hidden only by the add form: while an entry below is edited it stays, so the list doesn't shift up. */}
      {(!f.isOpen || f.editingId) && <AddButton always onClick={f.openAdd}>+ Add item</AddButton>}
      {f.isOpen && !f.editingId && form}

      <ul className="col gap-6" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {c.inv.map((it) => (
          <li key={it.id}>
            {f.editingId === it.id ? form : (
              <EntryRow name={it.name}
                head={<>
                  <span>{it.name}</span>
                  {(acNote(it) || it.wt !== undefined) && <span className="muted">
                    {[acNote(it), it.wt !== undefined && lb(it.wt) + ' lb' + (it.qty > 1 ? ' each' : '')].filter(Boolean).join(' · ')}
                  </span>}
                </>}
                side={<div className="row gap-8" style={{ padding: '6px 0' }}>
                  <button type="button" aria-pressed={it.eq} onClick={() => patch(it.id, { eq: !it.eq })} style={{
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, minWidth: 92, padding: '0 10px', borderRadius: 22,
                    border: '1px solid ' + (it.eq ? 'var(--accent)' : 'var(--line-2)'), background: 'transparent', color: it.eq ? 'var(--accent)' : 'var(--muted)'
                  }}>{it.eq ? 'Equipped' : 'Carried'}</button>
                  <div className="row gap-4">
                    <button type="button" className="step" style={{ fontSize: 18 }} aria-label={'Decrease ' + it.name} onClick={() => patch(it.id, { qty: Math.max(0, it.qty - 1) })}>−</button>
                    <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{it.qty}</span>
                    <button type="button" className="step" style={{ fontSize: 18 }} aria-label={'Increase ' + it.name} onClick={() => patch(it.id, { qty: it.qty + 1 })}>+</button>
                  </div>
                </div>}
                body={it.desc ? <span>{it.desc}</span> : undefined}
                onEdit={() => f.openEdit(it.id, { name: it.name, armor: armorName(it), bonus: it.acBonus || 0, wt: it.wt === undefined ? '' : String(it.wt), desc: it.desc || '' })}
                onRemove={() => update((p) => removeItem(p, it.id))} />
            )}
          </li>
        ))}
      </ul>

    </div>
  );
}
