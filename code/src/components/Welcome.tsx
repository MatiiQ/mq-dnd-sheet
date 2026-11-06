// The welcome screen (spec 2026-11-06 §5): shown when no character is open, and from Menu › Characters. Character cards
// read only the index (name, info, an HP bar), never the sheets. Delete and duplicate stay in the menu, for the open sheet.
import { useRef, useState, type ReactNode } from 'react';
import { charInfo, charName, EXAMPLES, type CharacterStore } from '../storage';

export function Welcome({ store, draft, onOpen, onNew, onBack, onImported }: {
  store: CharacterStore; draft: ReactNode; onOpen: (id: string) => void; onNew: () => void; onBack?: () => void; onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { added, failed } = store.importAll(JSON.parse(await file.text()));
      setMsg('Imported ' + added + (added === 1 ? ' character.' : ' characters.') + (failed ? ' ' + failed + ' could not be imported.' : ''));
      if (added) onImported();
    } catch (e) {
      setMsg(e instanceof Error && e.message.includes('backup') ? e.message : 'That file could not be read as a backup.');
    }
  };
  return (
    <main className="wizard welcome" aria-label="Characters">
      <div className="wizard-head row between gap-8">
        <h1 className="block-title">Characters</h1>
        {onBack && store.c && <button type="button" className="btn btn-sm" onClick={onBack}>Back to {charName(store.c)}</button>}
      </div>
      <div className="col gap-12">
        {draft}
        {msg && <div role="status" className="notice notice-blue">{msg}</div>}
        {store.list.length > 0 && (
          <div className="col gap-8">
            {store.list.map((x) => (
              <button key={x.id} type="button" className="welcome-card char-btn" onClick={() => onOpen(x.id)}>
                <span className="col grow" style={{ textAlign: 'left' }}>
                  <span className="ellipsis">{x.name}</span>
                  {x.info && <span className="small ellipsis">{x.info}</span>}
                  {x.hp && (
                    <span className="hp-bar" role="img" aria-label={'HP ' + x.hp[0] + ' of ' + x.hp[1]}>
                      <span style={{ width: Math.max(0, Math.min(100, (100 * x.hp[0]) / Math.max(1, x.hp[1]))) + '%' }} />
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="row wrap gap-8">
          <button type="button" className="btn btn-primary" onClick={onNew}>+ New character</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Backup file" onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <span className="label">Examples</span>
        <div className="col gap-8">
          {EXAMPLES.map(({ id, make }) => {
            const ex = make();
            return (
              <button key={id} type="button" className="char-btn" onClick={() => onOpen(id)}>
                <span className="col grow" style={{ textAlign: 'left' }}><span className="ellipsis">{charName(ex)}</span><span className="small ellipsis">{charInfo(ex)}</span></span>
                <span className="small">example</span>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
