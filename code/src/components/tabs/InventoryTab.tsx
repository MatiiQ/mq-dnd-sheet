import { useState, type CSSProperties } from 'react';
import { armorBaseMissing, BLANK_ITEM, catForKind, draftFromItem, itemFromForm, itemStats, withDetectedArmor, WEAPON_PROPS, type ItemDraft, type ItemKind, type WeaponProp } from '../../catalog/copy';
import { isValue } from '../../catalog/value';
import { CARRY_MULT, DAMAGE_TYPES, SIZES, maxFields, maxOf, rechargeOf, carriedWeight, carryCapacity, carryUpOf, sizeOf, effScore, fmt, addGrants, grantChips, isContainer, newId, removeItem, type GrantInput } from '../../logic';
import {
  addSection, containerLoad, DEFAULT_SECTION, inventoryGroups, moveInto, moveSection, removeContainer, removeContainerSummary, removeSection, renameSection,
  setItemSection, takeOut
} from '../../inventory';
import { equipShield, setHands } from '../../hands';
import { isEquipped, linkOf } from '../../links';
import { GrantList, SourceChips } from '../Chips';
import { ItemPicker } from '../pickers/ItemPicker';
import { scrollToEntry } from '../pickers/usePicker';
import { patchEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { ArmorKind, Character, Coin, Item, Recharge, Section } from '../../types';
import { AddButton, EntryForm, EntryRow, MenuIcon, NumInput, TextField, useArmed, useNoteUntilChange } from '../ui';

const COINS: [Coin, string, string][] = [['cp', 'CP', 'var(--coin-cp)'], ['sp', 'SP', 'var(--coin-sp)'], ['ep', 'EP', 'var(--coin-ep)'], ['gp', 'GP', 'var(--accent)'], ['pp', 'PP', 'var(--coin-pp)']];
// The item form's draft (catalog/copy.ts) plus the grants of a new item (pending), added once it exists.
type Draft = ItemDraft & { pending: GrantInput[] };
const BLANK: Draft = { ...BLANK_ITEM, pending: [] };
const RECHARGE_NAMES: Record<Recharge, string> = { none: 'Manual', short: 'Short Rest', long: 'Long Rest', dawn: 'Dawn' };
const KINDS: [ItemKind, string][] = [['none', 'None'], ['weapon', 'Weapon'], ['armor', 'Armor or Shield'], ['container', 'Container']];
const ARMOR_KINDS: [ArmorKind, string][] = [['light', 'Light armor'], ['medium', 'Medium armor'], ['heavy', 'Heavy armor'], ['shield', 'Shield']];
const PROP_NAMES: Record<WeaponProp, string> = {
  finesse: 'Finesse', light: 'Light', thrown: 'Thrown', versatile: 'Versatile', ammunition: 'Ammunition', loading: 'Loading', reach: 'Reach', 'two-handed': 'Two-Handed', heavy: 'Heavy'
};
const MASTERIES = ['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex'];
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// Weights show to one decimal place.
const lb = (n: number) => String(Math.round(n * 10) / 10);
const sizeName = (s: string) => SIZES.find(([k]) => k === s)?.[1] ?? s;

const acNote = (it: Item) => {
  const bonus = it.acBonus ? fmt(it.acBonus) : '';
  if (!it.armor) return bonus && bonus + ' AC';
  const base = it.armor === 'shield' ? 'Shield +' + it.acBase
    : 'AC ' + it.acBase + (it.armor === 'light' ? ' + DEX' : it.armor === 'medium' ? ' + DEX (max 2)' : '');
  return base + (bonus && ' · ' + bonus);
};
// A weapon's line in the list: damage, versatile die and properties, as a catalog weapon and a custom one alike.
const weaponNote = (it: Item) => !it.dmg ? '' : [
  it.dmg + (it.magic ? ' ' + fmt(it.magic) : '') + (it.dtype ? ' ' + it.dtype : ''),
  it.props && it.props.split(',').map((p) => PROP_NAMES[p as WeaponProp] ?? p).join(', ')
].filter(Boolean).join(' · ');

export function InventoryTab() {
  const { c, update, form: openForm, setForm } = useSheet();
  const f = useEntryForm('item', BLANK, 'item', 'Add a custom item');
  const picking = openForm?.kind === 'pick-item';
  const [carryOpen, setCarryOpen] = useState(false);
  // What equipping a Shield put away ("Put away: Longbow"), shown under its row until the next action (spec): the next
  // change to the character hides it.
  const [awayMsg, setAwayMsg] = useNoteUntilChange<{ id: string; names: string[] }>();
  // Sections and containers (plan 6), UI state only: the section a new item goes in (null: the default list), what
  // removing each bag does with its contents, the open section menu, a section being renamed, a new section's name.
  const [addSec, setAddSec] = useState<string | null>(null);
  const [bagRemove, setBagRemove] = useState<Record<string, 'out' | 'remove'>>({});
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [newSec, setNewSec] = useState<string | null>(null);
  // A section removed while its add form is open: the form falls back to the default list.
  const target = addSec && c.sections.some((x) => x.id === addSec) ? addSec : null;
  const containers = c.inv.filter(isContainer);
  const holds = (bag: Item) => c.inv.some((i) => i.in === bag.id) || COINS.some(([k]) => (bag[k] ?? 0) > 0);
  const removeMode = (bag: Item) => (holds(bag) ? bagRemove[bag.id] ?? 'out' : 'out');
  const cap = carryCapacity(c), carried = carriedWeight(c), over = carried > cap.carry;
  const patch = (id: string, p: Partial<Item>) => { setAwayMsg(null); update((s) => ({ inv: patchEntry(s.inv, id, p) })); };
  // The equip toggle: a Shield takes a hand (equipShield trims hands and names what went); unequipping lets go of it.
  const toggleEq = (it: Item) => {
    setAwayMsg(null);
    if (!it.eq && it.armor === 'shield') {
      const r = equipShield(c, it.id);
      if (r.away.length) setAwayMsg({ id: it.id, names: r.away });
      update(() => r.c);
      return;
    }
    update((s) => { const next = { ...s, inv: patchEntry(s.inv, it.id, { eq: !it.eq }) }; return it.eq ? setHands(next, next.hands) : next; });
  };
  const d = f.draft;
  const editing = f.editingId ? c.inv.find((i) => i.id === f.editingId) : undefined;
  // An AC bonus left on an item that isn't armor isn't counted (its AC is a grant); saving clears it.
  const oldBonus = editing && !editing.armor && editing.acBonus ? editing.acBonus : 0;
  const maxErr = d.charges && d.chMaxKind !== 'none' && maxFields(d.chMaxKind, d.chMaxText) === null;
  const regainErr = d.charges && !!d.chRegain.trim() && !isValue(d.chRegain.trim());
  const save = () => {
    if (!d.name.trim() || maxErr || regainErr || armorBaseMissing(d)) return;
    // A new item named like armor (e.g. "+1 Chain Mail") fills itself in. Editing never re-detects, so None sticks.
    const built = itemFromForm(f.editingId ? d : withDetectedArmor(d));
    const id = f.editingId ?? newId();
    update((p) => {
      const next: Character = { ...p, inv: saveEntry<Item>(p.inv, built, f.editingId, { eq: false, id, ...(target ? { sec: target } : {}) }) };
      return !f.editingId && d.pending.length ? addGrants(next, linkOf('item', id), d.pending) : next;
    });
    f.close();
  };
  // The kind switch is the only place the item's category changes (catalog-only, no input of its own).
  const setKind = (kind: ItemKind) => f.set({ kind, cat: kind === d.kind ? d.cat : catForKind(kind, d.armor) });
  const setArmor = (armor: ArmorKind) => f.set({ armor, cat: (armor === 'shield') !== (d.armor === 'shield') ? catForKind('armor', armor) : d.cat });
  const toggleProp = (p: WeaponProp, on: boolean) => f.set({ props: on ? [...d.props.filter((x) => x !== p), p] : d.props.filter((x) => x !== p) });
  const has = (p: WeaponProp) => d.props.includes(p);
  const text = (label: string, key: keyof ItemDraft, placeholder?: string, flex = '1 1 120px') => (
    <TextField label={label} style={{ flex }} value={String(d[key] ?? '')} placeholder={placeholder} onChange={(v) => f.set({ [key]: v } as Partial<Draft>)} />
  );

  // ---- sections ----
  const groups = inventoryGroups(c);
  const adding = (f.isOpen && !f.editingId) || picking;
  const addButtons = (sec: Section | null) => !adding && (
    <div className="row wrap gap-8">
      <AddButton always onClick={() => { setAddSec(sec?.id ?? null); setForm({ kind: 'pick-item', id: null }); }}>+ Add item</AddButton>
      <AddButton always onClick={() => { setAddSec(sec?.id ?? null); f.openAdd(); }}>Custom item</AddButton>
    </div>
  );
  // The picker and the add form open in the block whose button was tapped, so the player sees where the item lands.
  const addHere = (sec: Section | null) => adding && (sec?.id ?? null) === target && <>
    {f.isOpen && !f.editingId && form}
    {picking && <ItemPicker sec={target ?? undefined} onClose={() => setForm(null)} />}
  </>;
  const sectionHead = (sec: Section | null, n: number) => {
    if (!sec) return <h3 className="block-title">{DEFAULT_SECTION} <span className="muted">· {n}</span></h3>;
    const i = c.sections.findIndex((x) => x.id === sec.id);
    return <>
      <div className="sec-head">
        {renaming?.id === sec.id ? (
          <form className="row wrap gap-6 sec-rename" onSubmit={(e) => { e.preventDefault(); update((p) => renameSection(p, sec.id, renaming.name)); setRenaming(null); }}>
            <TextField label="Section name" value={renaming.name} style={{ flex: '1 1 160px' }} onChange={(name) => setRenaming({ id: sec.id, name })} />
            <button type="submit" className="btn btn-sm btn-primary">Save</button>
            <button type="button" className="btn btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
          </form>
        ) : <h3 className="block-title">{sec.name} <span className="muted">· {n}</span></h3>}
        <button type="button" className="icon-btn" aria-label={'Section options for ' + sec.name} aria-expanded={menuOpen === sec.id}
          onClick={() => setMenuOpen(menuOpen === sec.id ? null : sec.id)}><MenuIcon /></button>
      </div>
      {menuOpen === sec.id && (
        <SectionMenu first={i === 0} last={i === c.sections.length - 1}
          onRename={() => { setRenaming({ id: sec.id, name: sec.name }); setMenuOpen(null); }}
          onMove={(dir) => update((p) => moveSection(p, sec.id, dir))}
          onRemove={() => { setMenuOpen(null); update((p) => removeSection(p, sec.id)); }} />
      )}
    </>;
  };
  const newSectionField = newSec === null ? (
    <div className="row wrap gap-8"><AddButton always onClick={() => setNewSec('')}>+ New section</AddButton></div>
  ) : (
    <form className="row wrap gap-6 dashed-box" onSubmit={(e) => { e.preventDefault(); update((p) => addSection(p, newSec)); setNewSec(null); }}>
      <TextField label="New section" value={newSec} placeholder="e.g. Weapons, Armour, Magic items" style={{ flex: '1 1 200px' }} onChange={setNewSec} />
      <button type="submit" className="btn btn-sm btn-primary" disabled={!newSec.trim()}>Add</button>
      <button type="button" className="btn btn-sm" onClick={() => setNewSec(null)}>Cancel</button>
    </form>
  );

  // ---- items ----
  // "Move to": a section, the default list, or into a container (not for a container itself, never into its own one).
  // An item inside a container shows where it is as a first, disabled option, so picking any section takes it out.
  const moveTo = (it: Item, v: string) => update((p) => (v.startsWith('in:') ? moveInto(p, it.id, v.slice(3)) : setItemSection(p, it.id, v.slice(4) || null)));
  const moveControls = (it: Item) => {
    const into = isContainer(it) ? [] : containers.filter((b) => b.id !== it.in);
    if (!c.sections.length && !into.length && !it.in) return null;
    const own = it.sec && c.sections.some((x) => x.id === it.sec) ? it.sec : '';
    return (
      <div className="row wrap gap-8 move-to">
        <label className="field" style={{ flex: '1 1 200px' }}>Move to
          <select className="input" value={it.in ? 'here' : 'sec:' + own} onChange={(e) => moveTo(it, e.target.value)}>
            {it.in && <option value="here" disabled>In {c.inv.find((b) => b.id === it.in)?.name ?? 'a container'}</option>}
            {c.sections.map((x) => <option key={x.id} value={'sec:' + x.id}>{x.name}</option>)}
            <option value="sec:">{DEFAULT_SECTION}</option>
            {into.map((b) => <option key={b.id} value={'in:' + b.id}>Into {b.name}</option>)}
          </select>
        </label>
        {it.in && <button type="button" className="btn btn-sm" onClick={() => update((p) => takeOut(p, it.id))}>Take out</button>}
      </div>
    );
  };
  // A container that holds items or coins: the confirm names what goes and where the rest ends up.
  const bagConfirm = (bag: Item) => {
    const mode = removeMode(bag), { goes, keep } = removeContainerSummary(c, bag.id, mode);
    return <>
      {goes.length > 0 && <span>Also removes: {goes.join(', ')}</span>}
      {keep.map((k) => <span key={k}>{k}</span>)}
      <span>{mode === 'out' ? 'Contents and coins go to your items and purse' : 'Contents and the bag’s coins are removed too'}</span>
    </>;
  };
  const row = (it: Item) => (
    <li key={it.id}>
      {f.editingId === it.id ? form : (
        <EntryRow id={'item-' + it.id} name={it.name}
          head={<>
            <span>{it.name}</span>
            {(weaponNote(it) || acNote(it) || it.wt !== undefined || it.count !== undefined) && <span className="muted">
              {[weaponNote(it), acNote(it), it.wt !== undefined && lb(it.wt) + ' lb' + (it.qty > 1 ? ' each' : ''),
                it.count !== undefined && (it.qty !== 1 ? '× ' + it.qty + ' · ' : '') + 'charges: ' + RECHARGE_NAMES[rechargeOf(it)] + (it.regain ? ' +' + it.regain : '')].filter(Boolean).join(' · ')}
            </span>}
          </>}
          side={<div className="row gap-8" style={{ padding: '6px 0' }}>
            {/* An item inside a container is never equipped (plan 6): no toggle while it is there. */}
            {!it.in && <button type="button" aria-pressed={it.eq} onClick={() => toggleEq(it)} style={{
              fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, minWidth: 92, padding: '0 10px', borderRadius: 22,
              border: '1px solid ' + (it.eq ? 'var(--accent)' : 'var(--line-2)'), background: 'transparent', color: it.eq ? 'var(--accent)' : 'var(--muted)'
            }}>{it.eq ? 'Equipped' : 'Carried'}</button>}
            {/* An item with charges counts its charges here instead of its quantity (charged items come one at a time). */}
            {it.count !== undefined ? (
              <div className="row gap-4">
                <button type="button" className="step" style={{ fontSize: 18 }} aria-label={'Use a charge of ' + it.name} onClick={() => patch(it.id, { count: Math.max(0, it.count! - 1) })}>−</button>
                <span style={{ minWidth: 44, textAlign: 'center', fontWeight: 700 }}>{it.count}{maxOf(c, it) !== null && <span className="muted"> / {maxOf(c, it)}</span>}</span>
                <button type="button" className="step" style={{ fontSize: 18 }} aria-label={'Restore a charge of ' + it.name}
                  onClick={() => patch(it.id, { count: Math.min(maxOf(c, it) ?? Infinity, it.count! + 1) })}>+</button>
              </div>
            ) : (
              <div className="row gap-4">
                <button type="button" className="step" style={{ fontSize: 18 }} aria-label={'Decrease ' + it.name} onClick={() => patch(it.id, { qty: Math.max(0, it.qty - 1) })}>−</button>
                <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 700 }}>{it.qty}</span>
                <button type="button" className="step" style={{ fontSize: 18 }} aria-label={'Increase ' + it.name} onClick={() => patch(it.id, { qty: it.qty + 1 })}>+</button>
              </div>
            )}
          </div>}
          body={(it.desc || itemStats(it) || moveControls(it)) ? <>{(it.desc || itemStats(it)) && <span className="entry-desc">{it.desc || itemStats(it)}</span>}{moveControls(it)}</> : undefined}
          onEdit={() => f.openEdit(it.id, { ...draftFromItem(it), pending: [] })}
          onRemove={() => update((p) => (isContainer(it) ? removeContainer(p, it.id, removeMode(it)) : removeItem(p, it.id)))}
          removeConfirm={isContainer(it) && holds(it) ? bagConfirm(it) : undefined}>
          {(grantChips(c, linkOf('item', it.id)).length > 0 || awayMsg?.id === it.id) && <>
            {grantChips(c, linkOf('item', it.id)).length > 0 && <SourceChips link={linkOf('item', it.id)} />}
            {awayMsg?.id === it.id && <span role="status" className="small muted">Put away: {awayMsg.names.join(', ')}</span>}
          </>}
        </EntryRow>
      )}
    </li>
  );

  // ---- containers ----
  // One block per extradimensional container: its load against its capacity, its own coins and its contents.
  const bagBlock = (bag: Item) => {
    const load = containerLoad(c, bag.id), contents = c.inv.filter((i) => i.in === bag.id);
    const full = load.cap !== null && load.total > load.cap;
    return (
      <div key={bag.id} className="col gap-8">
        <h3 className="block-title">
          <button type="button" className="bag-link" onClick={() => scrollToEntry('item-' + bag.id)}>{bag.name}</button> <span className="muted">· {contents.length}</span>
        </h3>
        <div className="well col gap-8 bag-load">
          <span className="row between gap-8">
            <strong>Holds</strong>
            <span><strong style={full ? { color: 'var(--danger)' } : undefined}>{lb(load.total)}</strong>{load.cap !== null && ' / ' + lb(load.cap)} lb</span>
          </span>
          {load.cap !== null && (
            <span className="carry-track" aria-hidden="true">
              <span className={'carry-fill' + (full ? ' over' : '')} style={{ width: Math.min(100, load.cap ? (load.total / load.cap) * 100 : 100) + '%' }} />
            </span>
          )}
          {bag.capVol && <span className="small muted">{bag.capVol}</span>}
          <span className="small muted">Its contents and coins don’t count toward your load; the {bag.name} itself does.</span>
        </div>
        <div className="coin-grid">
          {COINS.map(([k, label, color]) => (
            <label key={k} className="well col gap-4 coin-cell" style={{ color }}>{label}
              <NumInput className="input" aria-label={label + ' in ' + bag.name} value={bag[k] ?? 0} min={0} max={999999}
                onCommit={(v) => update((p) => ({ inv: patchEntry(p.inv, bag.id, { [k]: v } as Partial<Item>) }))} />
            </label>
          ))}
        </div>
        {holds(bag) && (
          <div role="group" aria-label={'If ' + bag.name + ' is removed'} className="row wrap gap-4">
            <span className="label" style={{ flex: '1 1 100%' }}>If this bag is removed</span>
            <button type="button" className="filter-btn tall" aria-pressed={removeMode(bag) === 'out'} onClick={() => setBagRemove({ ...bagRemove, [bag.id]: 'out' })}>Take contents and coins out</button>
            <button type="button" className="filter-btn tall" aria-pressed={removeMode(bag) === 'remove'} onClick={() => setBagRemove({ ...bagRemove, [bag.id]: 'remove' })}>Remove them too</button>
          </div>
        )}
        {contents.length > 0 ? <ul className="col gap-6 inv-list">{contents.map(row)}</ul> : <span className="muted small">Empty. Put an item in with “Move to” on its row.</span>}
      </div>
    );
  };

  const form = f.isOpen && (
    <EntryForm kind="item" title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
      <TextField label="Name" value={d.name} placeholder="e.g. Rope (50 ft), +1 Dagger" onChange={(v) => f.set({ name: v })} />
      <div className="row wrap gap-6">
        {text('Weight (lb each)', 'wt', 'e.g. 0.5', '1 1 100px')}
        <label className="field" style={{ flex: '1 1 90px' }}>Quantity
          <NumInput className="input" value={d.qty} min={0} max={9999} onCommit={(qty) => f.set({ qty })} />
        </label>
        <label className="check" style={{ flex: '1 1 180px' }}><input type="checkbox" checked={d.attune} onChange={(e) => f.set({ attune: e.target.checked })} />Requires attunement</label>
      </div>
      <label className="field">Description
        <textarea className="input textarea" rows={3} value={d.desc} placeholder="What it does" onChange={(e) => f.set({ desc: e.target.value })} />
      </label>
      <div role="group" aria-label="Kind of item" className="row wrap gap-4">
        <span className="label" style={{ flex: '1 1 100%' }}>It is</span>
        {KINDS.map(([k, label]) => <button key={k} type="button" className="filter-btn" aria-pressed={d.kind === k} onClick={() => setKind(k)}>{label}</button>)}
      </div>
      {d.kind === 'weapon' && (
        <div className="col gap-6 dashed-box">
          <div className="row wrap gap-6">
            <label className="field" style={{ flex: '1 1 120px' }}>Category
              <select className="input" value={d.wcat} onChange={(e) => f.set({ wcat: e.target.value as Draft['wcat'] })}>
                <option value="simple">Simple</option><option value="martial">Martial</option>
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 120px' }}>Range
              <select className="input" value={d.wrange} onChange={(e) => f.set({ wrange: e.target.value as Draft['wrange'] })}>
                <option value="melee">Melee</option><option value="ranged">Ranged</option>
              </select>
            </label>
            {text('Damage die', 'dmg', 'e.g. 1d8', '1 1 90px')}
            <label className="field" style={{ flex: '1 1 130px' }}>Damage type
              <select className="input" value={d.dtype} onChange={(e) => f.set({ dtype: e.target.value })}>
                {['', ...DAMAGE_TYPES, ...(d.dtype && !DAMAGE_TYPES.includes(d.dtype) ? [d.dtype] : [])].map((t) => <option key={t} value={t}>{t || '—'}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 110px' }}>Mastery
              <select className="input" value={d.mastery} onChange={(e) => f.set({ mastery: e.target.value })}>
                {['', ...MASTERIES].map((m) => <option key={m} value={m}>{m ? title(m) : '—'}</option>)}
              </select>
            </label>
            {text('Magic bonus', 'magic', 'e.g. 1', '1 1 90px')}
          </div>
          <div role="group" aria-label="Weapon properties" className="row wrap gap-6">
            {WEAPON_PROPS.map((p) => (
              <label key={p} className="check" style={{ flex: '0 1 auto' }}><input type="checkbox" checked={has(p)} onChange={(e) => toggleProp(p, e.target.checked)} />{PROP_NAMES[p]}</label>
            ))}
          </div>
          {(has('thrown') || has('versatile') || has('ammunition')) && (
            <div className="row wrap gap-6">
              {has('thrown') && text('Thrown range (normal/long)', 'thrownRange', 'e.g. 20/60')}
              {has('versatile') && text('Versatile die', 'versDie', 'e.g. 1d10')}
              {has('ammunition') && text('Range (normal/long)', 'ammoRange', 'e.g. 150/600')}
              {has('ammunition') && text('Ammunition', 'ammoType', 'e.g. arrow')}
            </div>
          )}
        </div>
      )}
      {d.kind === 'armor' && (
        <div className="row wrap gap-6 dashed-box">
          <label className="field" style={{ flex: '1 1 140px' }}>Kind
            <select className="input" value={d.armor} onChange={(e) => setArmor(e.target.value as ArmorKind)}>
              {ARMOR_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          {text(d.armor === 'shield' ? 'Shield bonus' : 'Base AC', 'acBase', d.armor === 'shield' ? '2' : 'e.g. 14', '1 1 90px')}
          {text('Magic bonus', 'acBonus', 'e.g. 1', '1 1 90px')}
          {d.armor !== 'shield' && text('Strength needed', 'strReq', 'e.g. 13', '1 1 100px')}
          {d.armor !== 'shield' && <label className="check"><input type="checkbox" checked={d.stealthDis} onChange={(e) => f.set({ stealthDis: e.target.checked })} />Disadvantage on Stealth</label>}
          {armorBaseMissing(d) && <span className="small" style={{ flex: '1 1 100%', color: 'var(--danger)' }}>Armor needs a base AC, such as 14.</span>}
        </div>
      )}
      {d.kind === 'container' && (
        <div className="row wrap gap-6 dashed-box">
          {text('Holds (lb)', 'cap', 'e.g. 30', '1 1 90px')}
          {text('Volume', 'capVol', 'e.g. 1 cubic foot', '2 1 140px')}
          <label className="check"><input type="checkbox" checked={d.xdim} onChange={(e) => f.set({ xdim: e.target.checked })} />Extradimensional</label>
        </div>
      )}
      {editing && isContainer(editing) && holds(editing) && (
        <span className="small muted">Unticking “Extradimensional” or changing the kind takes its contents out and moves its coins to your purse; ticking it again won’t put them back.</span>
      )}
      {oldBonus !== 0 && d.kind !== 'armor' && (
        <span className="small" style={{ color: 'var(--danger)' }}>An old AC bonus of {oldBonus} isn’t counted. Add an Armor Class grant below; saving clears the old value.</span>
      )}
      {/* An AC bonus, resistance, sense or charge-based spell of a magic item: grants that follow equip and attunement. */}
      <GrantList link={f.editingId ? linkOf('item', f.editingId) : null} fromKind="item" pending={d.pending} setPending={(pending) => f.set({ pending })} />
      <label className="check"><input type="checkbox" checked={d.charges} onChange={(e) => f.set({ charges: e.target.checked })} />Has charges</label>
      {d.charges && (
        <div className="row wrap gap-6">
          <label className="field" style={{ flex: '1 1 110px' }}>Maximum
            <select className="input" value={d.chMaxKind} onChange={(e) => f.set({ chMaxKind: e.target.value as Draft['chMaxKind'] })}>
              <option value="none">None</option><option value="number">Number</option><option value="formula">Formula</option>
            </select>
          </label>
          {d.chMaxKind !== 'none' && (
            <label className="field" style={{ flex: '1 1 100px' }}>{d.chMaxKind === 'number' ? 'Charges' : 'Formula'}
              <input type="text" className="input" value={d.chMaxText} placeholder={d.chMaxKind === 'number' ? 'e.g. 7' : 'e.g. pb'} onChange={(e) => f.set({ chMaxText: e.target.value })} />
            </label>
          )}
          <label className="field" style={{ flex: '1 1 90px' }}>Charges left
            <NumInput className="input" value={d.chCount} min={0} max={999} onCommit={(chCount) => f.set({ chCount })} />
          </label>
          <label className="field" style={{ flex: '1 1 120px' }}>Recharge
            <select className="input" value={d.chRecharge} onChange={(e) => f.set({ chRecharge: e.target.value as Recharge })}>
              {(['dawn', 'long', 'short', 'none'] as Recharge[]).map((k) => <option key={k} value={k}>{RECHARGE_NAMES[k]}</option>)}
            </select>
          </label>
          {(d.chRecharge === 'dawn' || d.chRecharge === 'long') && (
            <label className="field" style={{ flex: '1 1 120px' }}>{d.chRecharge === 'dawn' ? 'Regain at dawn' : 'Regain on a Short Rest'}
              <input type="text" className="input" value={d.chRegain} placeholder={d.chRecharge === 'dawn' ? 'e.g. 1d6+1 (empty = all)' : 'e.g. 1'}
                onChange={(e) => f.set({ chRegain: e.target.value })} />
            </label>
          )}
          {(maxErr || regainErr) && <span className="small" style={{ flex: '1 1 100%', color: 'var(--danger)' }}>{maxErr ? 'The maximum needs a whole number of 1 or more, or a formula without dice.' : 'The regain needs a number or dice, such as 1d6+1.'}</span>}
        </div>
      )}
    </EntryForm>
  );

  return (
    <div className="col gap-12">
      <div className="block">
        <h3 className="block-title">Magic item attunement <span className="muted">· {c.attuneIds.filter(Boolean).length} / 3</span></h3>
        <div className="grid" style={{ '--min': '200px', gap: 8 } as CSSProperties}>
          {c.attuneIds.map((id, i) => {
            const item = c.inv.find((it) => it.id === id);
            // Equipped items not in another slot (an item inside a container never is), plus this slot's own item (which
            // may have been unequipped or put in a container since).
            const choices = c.inv.filter((it) => it.id === id || (isEquipped(it) && !c.attuneIds.includes(it.id)));
            return (
              <div key={i} className="col gap-4">
                <select className={'input attune-slot' + (id ? ' filled' : '')} aria-label={'Attunement slot ' + (i + 1)} value={id}
                  onChange={(e) => update((p) => { const a = p.attuneIds.slice(); a[i] = e.target.value; return { attuneIds: a }; })}>
                  <option value="">Empty</option>
                  {choices.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
                {item && !isEquipped(item) && <span className="attune-note">not equipped</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="coin-grid">
        {COINS.map(([k, label, color]) => (
          <label key={k} className="well col gap-4 coin-cell" style={{ color }}>{label}
            <NumInput className="input" value={c.coins[k]} min={0} max={999999}
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
            {carryUpOf(c) && <div className="tile"><span className="muted">Counts as one size larger</span><span className="speed-value">{sizeName(cap.size)}</span>
              <span className="muted">Size {sizeName(sizeOf(c))}</span></div>}
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

      {groups.map(({ sec, items }, gi) => (
        <div key={sec?.id ?? 'default'} className="col gap-8">
          {(sec || c.sections.length > 0) && <div className="block">{sectionHead(sec, items.length)}</div>}
          {addButtons(sec)}
          {addHere(sec)}
          {items.length > 0 ? <ul className="col gap-6 inv-list">{items.map(row)}</ul> : sec && <span className="muted small">No items yet.</span>}
          {/* New sections go under the last one, or under the list while there are none. */}
          {gi === groups.length - (c.sections.length ? 2 : 1) && newSectionField}
        </div>
      ))}

      {containers.map(bagBlock)}
    </div>
  );
}

// A section's options, without Edit mode: rename, move, remove (tap twice; its items go to the default list).
function SectionMenu({ first, last, onRename, onMove, onRemove }: { first: boolean; last: boolean; onRename: () => void; onMove: (dir: -1 | 1) => void; onRemove: () => void }) {
  const [armed, tap] = useArmed(6000);
  return (
    <div role="group" aria-label="Section options" className="row wrap gap-6 dashed-box">
      <button type="button" className="btn btn-sm" onClick={onRename}>Rename</button>
      <button type="button" className="btn btn-sm" aria-disabled={first || undefined} onClick={() => !first && onMove(-1)}>Move up</button>
      <button type="button" className="btn btn-sm" aria-disabled={last || undefined} onClick={() => !last && onMove(1)}>Move down</button>
      <button type="button" className={'btn btn-sm btn-danger' + (armed ? ' armed' : '')} onClick={() => tap(onRemove)}>{armed ? 'Tap again to remove' : 'Remove'}</button>
      {armed && <span role="status" className="small">Its items move to {DEFAULT_SECTION}.</span>}
    </div>
  );
}
