import { useEffect, useState, type ReactNode } from 'react';
import { addFromCatalog, type AddChoices } from '../../catalog/copy';
import { onCatalogReset } from '../../catalog/load';
import type { Catalog } from '../../catalog/merge';
import type { Entry } from '../../catalog/schema';
import type { CatalogState } from '../../catalog/useCatalog';
import { useSheet } from '../../sheet';
import type { Character } from '../../types';

// The add flow of a picker: the entry being added, and a message (an error, or the catalog swapped mid-flow). A pack
// import or removal while a flow is open closes it: its picks may no longer resolve. addFromCatalog runs in a try, so
// a refusal shows its text instead of the crash screen and leaves the character unchanged.
export function usePickerFlow() {
  const { c, update } = useSheet();
  const [flow, setFlow] = useState<{ entry: Entry; preset?: Record<string, string[]> } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!flow) return;
    return onCatalogReset(() => { setFlow(null); setMsg('The rules data changed. Start again.'); });
  }, [flow]);
  return {
    flow, msg,
    start: (entry: Entry, preset?: Record<string, string[]>) => { setMsg(null); setFlow({ entry, preset }); },
    cancel: () => setFlow(null),
    // Adds the entry; returns the character before and the one saved, or null when it was refused. after: a follow-up
    // step on the added character (the Inventory tab puts new items in a section), saved in the same update.
    finish: (cat: Catalog, ans: AddChoices, after?: (before: Character, next: Character) => Character): { before: Character; next: Character } | null => {
      if (!flow) return null;
      try {
        const added = addFromCatalog(c, cat, flow.entry, ans);
        const next = after ? after(c, added) : added;
        update(next);
        setFlow(null);
        return { before: c, next };
      } catch (e) {
        setFlow(null);
        setMsg(e instanceof Error ? e.message : String(e));
        return null;
      }
    }
  };
}

// The picker's frame: its title and close button, the message, and the catalog's loading or error state.
export function PickerFrame({ title, state, msg, onClose, children }: {
  title: string; state: CatalogState; msg: string | null; onClose: () => void; children: (cat: Catalog) => ReactNode;
}) {
  return (
    <div className="entry-form picker" role="region" aria-label={title}>
      <div className="row between gap-8">
        <span className="label">{title}</span>
        <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
      </div>
      {msg && <div role="status" className="notice notice-blue">{msg}</div>}
      {state.status === 'ready' ? children(state.cat) : state.status === 'error' ? (
        <div role="status" className="row wrap gap-8">
          <span className="muted">The rules data couldn’t be loaded. If Retry fails, close and reopen the app. Custom entries still work.</span>
          <button type="button" className="btn btn-sm" onClick={state.retry}>Retry</button>
        </div>
      ) : <span className="muted">Loading the rules…</span>}
    </div>
  );
}

// Scrolls a newly added entry into view once it has rendered.
export const scrollToEntry = (id: string) => setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
