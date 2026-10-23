import type { CSSProperties } from 'react';
import { useSheet } from '../../sheet';
import type { NoteKey } from '../../types';

const NOTES: [NoteKey, string, string][] = [
  ['appearance', 'APPEARANCE', '[Describe your character]'], ['personality', 'PERSONALITY', '[Traits, ideals, bonds, flaws]'],
  ['backstory', 'BACKSTORY', '[Where they came from]'], ['session', 'SESSION NOTES', '[Quests, NPCs, loot]']
];

export function NotesTab() {
  const { c, update } = useSheet();
  return (
    <div className="grid" style={{ '--min': '260px', gap: 12 } as CSSProperties}>
      {NOTES.map(([k, label, placeholder]) => (
        <label key={k} className="caps col gap-6">{label}
          <textarea rows={6} value={c.notes[k]} placeholder={placeholder}
            onChange={(e) => update((p) => ({ notes: { ...p.notes, [k]: e.target.value } }))}
            style={{ font: '15px var(--sans)', letterSpacing: 'normal', color: 'var(--text)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 10, resize: 'vertical' }} />
        </label>
      ))}
    </div>
  );
}
