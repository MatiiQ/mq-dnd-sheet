import { createContext, useContext, useState } from 'react';
import { newId } from './logic';
import type { Patch } from './storage';
import type { Character } from './types';

// Only one add/edit form is open at a time across the sheet.
export type FormKind = 'attack' | 'rider' | 'res' | 'spell' | 'item' | 'feat' | 'sense';
export type FormState = { kind: FormKind; id: string | null } | null;

export interface SheetCtx {
  c: Character;
  update: (p: Patch) => void;
  edit: boolean;
  form: FormState;
  setForm: (f: FormState) => void;
}

export const Sheet = createContext<SheetCtx | null>(null);
export function useSheet(): SheetCtx {
  const ctx = useContext(Sheet);
  if (!ctx) throw new Error('useSheet outside <Sheet.Provider>');
  return ctx;
}

// Draft state and open/close for one kind of add/edit form.
export function useEntryForm<D extends object>(kind: FormKind, blank: D, noun: string, label: string, addTitle: string) {
  const { form, setForm } = useSheet();
  const [draft, setDraft] = useState<D>(blank);
  const isOpen = form?.kind === kind;
  const editingId = isOpen ? form.id : null;
  const scroll = () => setTimeout(() => document.getElementById('form-' + kind)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  return {
    isOpen, editingId, draft,
    set: (p: Partial<D>) => setDraft((d) => ({ ...d, ...p })),
    openAdd: () => { setDraft(blank); setForm({ kind, id: null }); scroll(); },
    openEdit: (id: string, d: D) => { setDraft(d); setForm({ kind, id }); scroll(); },
    close: () => setForm(null),
    title: editingId ? 'EDIT ' + noun.toUpperCase() : addTitle,
    saveLabel: editingId ? 'Save changes' : 'Add ' + label
  };
}

// Adds a new entry, or merges the edit into the entry being edited.
export function saveEntry<E extends { id: string }>(list: E[], built: Omit<E, 'id'> | Partial<E>, editingId: string | null, extra: Partial<E> = {}): E[] {
  if (editingId) return list.map((x) => (x.id === editingId ? { ...x, ...built } : x));
  return [...list, { id: newId(), ...extra, ...built } as E];
}
