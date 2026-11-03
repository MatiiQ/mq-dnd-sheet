import { useState } from 'react';
import { linkOf, SRC_KINDS, srcKindOfLink, wouldLoop, type SourceKind } from '../links';
import { useSheet } from '../sheet';
import type { Linked, SrcKind } from '../types';

type Value = Pick<Linked, 'from' | 'srcKind' | 'srcName'>;

// Where an entry came from: one of the character's features, items or spells (a link, shown on that source), or
// "Other…" with a kind and a name typed by hand. Never offers the entry itself or a source that would close a loop.
// noKind: the form has its own kind field (Resources' Type), so Other… asks only for the name.
export function SourcePicker({ self, value, onChange, noKind }: { self?: string; value: Value; onChange: (v: Value) => void; noKind?: boolean }) {
  const { c } = useSheet();
  const ok = (link: string) => !self || !wouldLoop(c, self, link);
  const groups: [string, SourceKind, { id: string; name: string }[]][] = [
    ['Features', 'feature', c.feats], ['Items', 'item', c.inv], ['Spells', 'spell', c.spells]
  ];
  // Other… stays open while its name is still empty.
  const [otherOpen, setOtherOpen] = useState(!value.from && (!!value.srcKind || !!value.srcName));
  const sel = value.from ?? (otherOpen ? 'other' : '');
  const pick = (v: string) => {
    setOtherOpen(v === 'other');
    if (v === '') onChange({ from: undefined, srcKind: undefined, srcName: undefined });
    else if (v === 'other') onChange({ from: undefined, srcKind: value.srcKind ?? (noKind ? undefined : 'other'), srcName: value.srcName ?? '' });
    else onChange({ from: v, srcKind: srcKindOfLink(c, v) ?? undefined, srcName: undefined });
  };
  return (
    <>
      <label className="field">Source
        <select className="input" value={sel} onChange={(e) => pick(e.target.value)}>
          <option value="">—</option>
          {groups.map(([label, kind, list]) => {
            const opts = list.map((x) => [linkOf(kind, x.id), x.name]).filter(([l]) => ok(l));
            return opts.length > 0 && (
              <optgroup key={kind} label={label}>
                {opts.map(([l, name]) => <option key={l} value={l}>{name}</option>)}
              </optgroup>
            );
          })}
          <option value="other">Other…</option>
        </select>
      </label>
      {sel === 'other' && !noKind && (
        <label className="field">Source kind
          <select className="input" value={value.srcKind ?? ''} onChange={(e) => onChange({ ...value, srcKind: (e.target.value || undefined) as SrcKind | undefined })}>
            <option value="">—</option>
            {SRC_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
      )}
      {sel === 'other' && (
        <label className="field">Source name
          <input type="text" className="input" value={value.srcName ?? ''} placeholder="e.g. Wood Elf" onChange={(e) => onChange({ ...value, srcName: e.target.value })} />
        </label>
      )}
    </>
  );
}
