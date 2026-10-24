import type { CSSProperties } from 'react';
import { rechargeOf } from '../../logic';
import { patchEntry, removeEntry, saveEntry, useEntryForm, useSheet } from '../../sheet';
import type { Recharge, Resource } from '../../types';
import { AddButton, EntryActions, EntryForm, Step, TextField } from '../ui';

const BLANK = { name: '', note: '', inv: false };
const RECHARGE_TEXT: Record<Recharge, string> = { none: 'Manual only', short: 'Refills on Short or Long Rest', long: 'Refills on Long Rest' };

export function ResourcesTab() {
  const { c, update, edit } = useSheet();
  const f = useEntryForm('res', BLANK, 'resource', 'ADD A RESOURCE');
  const patch = (id: string, p: Partial<Resource> | ((r: Resource) => Partial<Resource>)) =>
    update((s) => ({ res: patchEntry(s.res, id, p) }));
  const bump = (id: string, d: number) => patch(id, (r) => {
    let n = Math.max(0, r.count + d);
    if (r.max) n = Math.min(r.max, n);
    return { count: n };
  });
  const save = () => {
    const name = f.draft.name.trim();
    if (!name) return;
    update((p) => ({ res: saveEntry<Resource>(p.res, { name, note: f.draft.note.trim(), inv: f.draft.inv }, f.editingId, { count: 0 }) }));
    f.close();
  };

  return (
    <div className="col gap-12">
      <div className="grid" style={{ '--min': '240px', gap: 12 } as CSSProperties}>
        {c.res.map((r) => {
          const rc = rechargeOf(r);
          return (
            <div key={r.id} className="card gap-6">
              <div className="row between gap-4" style={{ alignItems: 'flex-start' }}>
                <span className="grow" style={{ fontWeight: 700, paddingTop: 10 }}>{r.name}</span>
                <EntryActions name={r.name} canEdit={edit} onEdit={() => f.openEdit(r.id, { name: r.name, note: r.note || '', inv: !!r.inv })}
                  onRemove={() => update((p) => ({ res: removeEntry(p.res, r.id) }))} />
              </div>
              <span className="muted">{r.note || 'Custom resource'}</span>
              {!edit && <span className="small">{RECHARGE_TEXT[rc]}</span>}
              {edit && (
                <>
                  <label className="row gap-8 muted">Recharges on
                    <select className="input grow" style={{ fontSize: 14, padding: '0 8px' }} value={rc}
                      onChange={(e) => patch(r.id, { recharge: e.target.value as Recharge, refill: false })}>
                      <option value="none">Never (manual)</option><option value="short">Short or Long Rest</option><option value="long">Long Rest</option>
                    </select>
                  </label>
                  <div className="row gap-6">
                    <span className="muted">Maximum</span>
                    <Step label={'Lower maximum for ' + r.name} onClick={() => patch(r.id, (x) => {
                      const m = Math.max(0, (x.max || 0) - 1);
                      return { max: m, count: m ? Math.min(x.count, m) : x.count };
                    })}>−</Step>
                    <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 700 }}>{r.max ? r.max : 'none'}</span>
                    <Step label={'Raise maximum for ' + r.name} onClick={() => patch(r.id, (x) => ({ max: x.max ? x.max + 1 : Math.max(1, x.count) }))}>+</Step>
                  </div>
                </>
              )}
              {rc !== 'none' && !r.max && <span style={{ fontSize: 12, color: 'var(--orange)' }}>Set a maximum (Edit) so a rest can refill it.</span>}
              <div className="row gap-8">
                <Step label={'Decrease ' + r.name} onClick={() => bump(r.id, -1)}>−</Step>
                <span style={{ fontSize: 22, fontWeight: 700, minWidth: 36, textAlign: 'center' }}>
                  {r.count}{!!r.max && <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)' }}> / {r.max}</span>}
                </span>
                <Step label={'Increase ' + r.name} onClick={() => bump(r.id, 1)}>+</Step>
              </div>
            </div>
          );
        })}
      </div>
      {!f.isOpen && <AddButton onClick={f.openAdd}>+ Add resource</AddButton>}
      {f.isOpen && (
        <EntryForm kind="res" title={f.title} saveLabel={f.saveLabel} onSave={save} onCancel={f.close}>
          <div className="grid" style={{ '--min': '200px' } as CSSProperties}>
            <TextField label="Name" value={f.draft.name} placeholder="e.g. Rations, Torches, Ki points" onChange={(v) => f.set({ name: v })} />
            <TextField label="Note (optional)" value={f.draft.note} placeholder="What it's for" onChange={(v) => f.set({ note: v })} />
            <label className="check"><input type="checkbox" checked={f.draft.inv} onChange={(e) => f.set({ inv: e.target.checked })} />Also list in Inventory</label>
          </div>
        </EntryForm>
      )}
    </div>
  );
}
