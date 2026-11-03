import { useState, type ReactNode } from 'react';
import { addGrants, grantChips, removalSummary, removeChip, type Chip, type GrantInput, type Ref } from '../logic';
import { useSheet } from '../sheet';
import type { SourceKind } from '../links';
import type { Character } from '../types';
import { GrantEditor } from './GrantEditor';
import { jumpTo } from './nav';
import { RemoveButton } from './ui';

// What a removal confirm lists: everything else that goes, and what stays for the player to fix.
export function removalNote(c: Character, ref: Ref): ReactNode {
  const { goes, keep } = removalSummary(c, ref);
  if (!goes.length && !keep.length) return undefined;
  return <>{goes.length > 0 && <span>Also removes: {goes.join(', ')}</span>}{keep.map((k) => <span key={k}>{k}</span>)}</>;
}

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
            <RemoveButton name={x.label} onRemove={() => update((p) => removeChip(p, x.ref))} />
          </span>
        ))}
        {pending.map((g, i) => (
          <span key={i} className="prof-chip">{g.spec.name}
            <RemoveButton name={g.spec.name} onRemove={() => setPending(pending.filter((_, j) => j !== i))} />
          </span>
        ))}
        {!chips.length && !pending.length && <span className="small">Nothing yet</span>}
      </div>
      {link && <span className="small">Grants save at once; Cancel doesn’t undo them.</span>}
      {adding
        ? <GrantEditor fromKind={fromKind} onCancel={() => setAdding(false)} onAdd={(g) => {
          if (link) update((p) => addGrants(p, link, [g])); else setPending([...pending, g]);
          setAdding(false);
        }} />
        : <button type="button" className="btn btn-add" onClick={() => setAdding(true)}>+ Add grant</button>}
    </div>
  );
}
