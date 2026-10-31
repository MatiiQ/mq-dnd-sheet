import { useState } from 'react';
import { addGrants, grantChips, removeRef, type Chip, type GrantInput } from '../logic';
import type { Character } from '../types';
import { useSheet } from '../sheet';
import type { SourceKind } from '../links';
import { GrantEditor } from './GrantEditor';
import { jumpTo } from './nav';
import { RemoveButton } from './ui';

// What a source gives, as chips. Tapping one jumps to where it lives; an inactive one says why.
export function SourceChips({ link }: { link: string }) {
  const { c, update } = useSheet();
  const chips = grantChips(c, link);
  if (!chips.length) return null;
  return (
    <div className="row wrap gap-6">
      {chips.map((x) => (
        <button key={x.ref.kind + x.ref.id} type="button" className={'grant-chip' + (x.active ? '' : ' inactive')}
          aria-label={x.label + (x.why ? ', inactive: ' + x.why : '') + '. Go to it.'} onClick={() => jumpTo(x.target, update)}>
          {x.label}{x.why && <span className="small">· {x.why}</span>}
        </button>
      ))}
    </div>
  );
}

// In a source's form: its chips, each removable, and "+ Add grant". For a source not saved yet, grants wait in
// `pending` and are added after the save.
export function GrantList({ link, fromKind, pending, setPending }: { link: string | null; fromKind: SourceKind; pending: GrantInput[]; setPending: (g: GrantInput[]) => void }) {
  const { c, update } = useSheet();
  const [adding, setAdding] = useState(false);
  const chips: Chip[] = link ? grantChips(c, link) : [];
  return (
    <div className="col gap-6" style={{ gridColumn: '1 / -1' }}>
      <span className="muted">Gives</span>
      <div className="row wrap gap-6">
        {chips.map((x) => (
          <span key={x.ref.kind + x.ref.id} className="prof-chip">{x.label}
            <RemoveButton name={x.label} onRemove={() => update((p) => removeRef(p, x.ref))} />
          </span>
        ))}
        {pending.map((g, i) => (
          <span key={i} className="prof-chip">{g.spec.name}
            <RemoveButton name={g.spec.name} onRemove={() => setPending(pending.filter((_, j) => j !== i))} />
          </span>
        ))}
        {!chips.length && !pending.length && <span className="small">Nothing yet</span>}
      </div>
      {adding
        ? <GrantEditor fromKind={fromKind} onCancel={() => setAdding(false)} onAdd={(g) => {
          if (link) update((p) => addTo(p, link, g)); else setPending([...pending, g]);
          setAdding(false);
        }} />
        : <button type="button" className="btn btn-add" onClick={() => setAdding(true)}>+ Add grant</button>}
    </div>
  );
}

const addTo = (c: Character, link: string, g: GrantInput) => addGrants(c, link, [g]);
