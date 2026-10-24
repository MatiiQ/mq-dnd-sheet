import type { CSSProperties } from 'react';
import { useSheet } from '../../sheet';
import type { NoteKey } from '../../types';

const NOTES: [NoteKey, string, string][] = [
  ['appearance', 'Appearance', '[Describe your character]'], ['personality', 'Personality', '[Traits, ideals, bonds, flaws]'],
  ['backstory', 'Backstory', '[Where they came from]'], ['session', 'Session notes', '[Quests, NPCs, loot]']
];

export function NotesTab() {
  const { c, update } = useSheet();
  return (
    <div className="grid" style={{ '--min': '260px', gap: 12 } as CSSProperties}>
      {NOTES.map(([k, label, placeholder]) => (
        <label key={k} className="label col gap-6">{label}
          <textarea rows={6} value={c.notes[k]} placeholder={placeholder}
            onChange={(e) => update((p) => ({ notes: { ...p.notes, [k]: e.target.value } }))}
            style={{ font: '15px var(--sans)', color: 'var(--text)', background: 'var(--well)', border: 'none', borderRadius: 12, padding: 10, resize: 'vertical' }} />
        </label>
      ))}
    </div>
  );
}
