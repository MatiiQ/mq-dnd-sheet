import type { CSSProperties } from 'react';
import { isValue } from '../catalog/value';
import { inactiveReason, SRC_KINDS, sourceLabel } from '../links';
import { maxFields, maxKindOf, maxOf, rechargeOf, regainEvent, removeResource, resourceGroups, type MaxKind } from '../logic';
import { patchEntry, saveEntry, useEntryForm, useSheet } from '../sheet';
import type { Recharge, Resource, SrcKind } from '../types';
import { SourcePicker } from './SourcePicker';
import { AddButton, EntryForm, EntryRow, NumInput, StarIcon, Step, TextField } from './ui';

const BLANK = {
  name: '', note: '', type: '' as SrcKind | 'custom' | '', typeName: '', count: 0, maxKind: 'none' as MaxKind, maxText: '',
  recharge: 'long' as Recharge, regain: '', casts: '', from: undefined as string | undefined, srcName: undefined as string | undefined
};
type Draft = typeof BLANK;
const RECHARGE_TEXT: Record<Recharge, string> = { none: 'Manual only', short: 'Refills on Short or Long Rest', long: 'Refills on Long Rest', dawn: 'Refills at dawn' };

const toDraft = (r: Resource): Draft => ({
  name: r.name, note: r.note || '', type: r.typeName ? 'custom' : r.srcKind || '', typeName: r.typeName || '', count: r.count,
  maxKind: maxKindOf(r), maxText: r.maxV ?? (r.max ? String(r.max) : ''),
  recharge: rechargeOf(r), regain: r.regain || '', casts: r.casts || '', from: r.from, srcName: r.srcName
});

export function Resources() {
  const { c, update } = useSheet();
  const f = useEntryForm('res', BLANK, 'resource', 'Add a resource');
  const d = f.draft;
  const patch = (id: string, p: Partial<Resource> | ((r: Resource) => Partial<Resource>)) =>
    update((s) => ({ res: patchEntry(s.res, id, p) }));
  const bump = (id: string, by: number) => patch(id, (r) => ({ count: Math.max(0, r.count + by) }));
  const maxNow = maxFields(d.maxKind, d.maxText);
  // Regain is a Value (number or die): on a Short Rest for a Long Rest counter, at dawn for a Dawn counter.
  const regainOn = regainEvent(d.recharge);
  const regainOk = !d.regain.trim() || isValue(d.regain.trim());
  const save = () => {
    const name = d.name.trim();
    if (!name || !maxNow || !regainOk) return;
    const regain = regainOn && d.regain.trim();
    // All keys always present: undefined clears a field when editing.
    const built: Partial<Resource> = {
      name, note: d.note.trim() || undefined, count: d.count,
      srcKind: d.type && d.type !== 'custom' ? d.type : undefined, typeName: d.type === 'custom' ? d.typeName.trim() || undefined : undefined,
      max: maxNow.max, maxV: maxNow.maxV, recharge: d.recharge,
      regain: regain || undefined, regainOn: regain ? regainOn : undefined, casts: d.casts || undefined,
      from: d.from, srcName: d.srcName?.trim() || undefined
    };
    update((p) => ({ res: saveEntry<Resource>(p.res, built, f.editingId, { count: 0 }) }));
    f.close();
  };
  const form = f.isOpen && (
    <EntryForm kind="res" title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
      <div className="grid" style={{ '--min': '200px' } as CSSProperties}>
        <TextField label="Name" value={d.name} placeholder="e.g. Rations, Torches, Ki points" onChange={(v) => f.set({ name: v })} />
        <TextField label="Description" value={d.note} placeholder="What it's for" onChange={(v) => f.set({ note: v })} />
        <label className="field">Type
          <select className="input" value={d.type} onChange={(e) => f.set({ type: e.target.value as Draft['type'] })}>
            <option value="">—</option>
            {SRC_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            <option value="custom">Custom…</option>
          </select>
        </label>
        {d.type === 'custom' && <TextField label="Type name" value={d.typeName} placeholder="e.g. Channel Divinity" onChange={(v) => f.set({ typeName: v })} />}
        <label className="field">Current
          <NumInput className="input" value={d.count} min={0} max={999} onCommit={(count) => f.set({ count })} />
        </label>
        <label className="field">Maximum
          <select className="input" value={d.maxKind} onChange={(e) => f.set({ maxKind: e.target.value as MaxKind, maxText: e.target.value === 'number' ? '1' : '' })}>
            <option value="none">None</option><option value="number">Number</option><option value="formula">Formula</option>
          </select>
        </label>
        {d.maxKind === 'number' && (
          <label className="field">Number (1 or more)
            <NumInput className="input" value={Number(d.maxText) || 1} min={1} max={999} onCommit={(v) => f.set({ maxText: String(v) })} />
          </label>
        )}
        {d.maxKind === 'formula' && (
          <label className="field">Formula
            <input type="text" className="input" value={d.maxText} placeholder="e.g. wis>=1, pb, 2:2,6:3, 0" onChange={(e) => f.set({ maxText: e.target.value })} />
            <span className="small" style={maxNow ? undefined : { color: 'var(--danger)' }}>{maxNow ? 'Now ' + maxOf(c, maxNow) : 'Not a formula (dice are not allowed)'}</span>
          </label>
        )}
        <label className="field">Recharge
          <select className="input" value={d.recharge} onChange={(e) => f.set({ recharge: e.target.value as Recharge })}>
            <option value="short">Short Rest</option><option value="long">Long Rest</option><option value="dawn">Dawn</option><option value="none">Manual</option>
          </select>
        </label>
        {regainOn && (
          <label className="field">{regainOn === 'short' ? 'Regain on a Short Rest' : 'Regain at dawn'}
            <input type="text" className="input" value={d.regain} placeholder={regainOn === 'short' ? 'e.g. 1' : 'e.g. 1d6+1 (empty = all)'} onChange={(e) => f.set({ regain: e.target.value })} />
            {!regainOk && <span className="small" style={{ color: 'var(--danger)' }}>A number or dice, e.g. 1 or 1d6+1</span>}
          </label>
        )}
        {/* Type sets the kind; the picker links a source or names one. A linked source's kind wins unless Type is set. */}
        <SourcePicker noKind value={{ from: d.from, srcKind: d.type && d.type !== 'custom' ? d.type : undefined, srcName: d.srcName }}
          onChange={(v) => f.set({ from: v.from, srcName: v.srcName, ...(v.from && v.srcKind ? { type: v.srcKind } : {}) })} />
        <label className="field">Casts
          <select className="input" value={d.casts} onChange={(e) => f.set({ casts: e.target.value })}>
            <option value="">—</option>
            {c.spells.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
        </label>
      </div>
    </EntryForm>
  );

  return (
    <section id="sec-resources" aria-label="Resources" className="block section">
      <h2 className="block-title area-title">Resources</h2>
      {/* The table's Inspiration counter (house rule, see migrate()). Heroic Inspiration by the rules is added as a resource. */}
      <div className="well row gap-10">
        <span aria-hidden="true" className={'bar-icon' + (c.insp ? ' on' : '')}><StarIcon /></span>
        <span className="col grow">
          <strong>Inspiration</strong>
          <span className="muted">The table’s counter, no limit.</span>
        </span>
        <Step label="Spend Inspiration" onClick={() => update((p) => ({ insp: Math.max(0, p.insp - 1) }))}>−</Step>
        <span style={{ fontSize: 22, fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{c.insp}</span>
        <Step label="Gain Inspiration" onClick={() => update((p) => ({ insp: p.insp + 1 }))}>+</Step>
      </div>
      {resourceGroups(c).map((g) => (
        <div key={g.title} className="col gap-6">
          <span className="muted">{g.title}</span>
          <div className="grid" style={{ '--min': '240px', gap: 12 } as CSSProperties}>
            {g.list.map((r) => {
              const rc = rechargeOf(r), m = maxOf(c, r), why = inactiveReason(c, r), src = sourceLabel(c, r);
              return (
                f.editingId === r.id ? <div key={r.id}>{form}</div> : (
                <EntryRow key={r.id} name={r.name} className={why ? 'inactive' : undefined}
                  head={<><strong>{r.name}</strong><span className="muted">{why ? 'Inactive: ' + why : r.note || 'Custom resource'}</span></>}
                  side={
                    <div className="row gap-8">
                      <Step label={'Decrease ' + r.name} onClick={() => bump(r.id, -1)}>−</Step>
                      <span style={{ fontSize: 22, fontWeight: 700, minWidth: 36, textAlign: 'center' }}>
                        {r.count}{m !== null && <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)' }}> / {m}</span>}
                      </span>
                      <Step label={'Increase ' + r.name} onClick={() => bump(r.id, 1)}>+</Step>
                    </div>
                  }
                  body={<>
                    <span className="small">{RECHARGE_TEXT[rc]}{r.regain ? ' · regain ' + r.regain + (r.regainOn === 'dawn' ? ' at dawn' : ' on a Short Rest') : ''}</span>
                    {why && r.note && <span className="small">{r.note}</span>}
                    {src && <span className="muted">Source: {src}</span>}
                  </>}
                  onEdit={() => f.openEdit(r.id, toDraft(r))}
                  onRemove={() => update((p) => removeResource(p, r.id))}>
                  {rc !== 'none' && m === null && <span style={{ fontSize: 12, color: 'var(--danger)' }}>Set a maximum (Edit) so a rest can refill it.</span>}
                </EntryRow>
                )
              );
            })}
          </div>
        </div>
      ))}
      {!f.isOpen && <AddButton onClick={f.openAdd}>+ Add resource</AddButton>}
      {f.isOpen && !f.editingId && form}
    </section>
  );
}
