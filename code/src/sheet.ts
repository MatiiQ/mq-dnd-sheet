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

// Centres a form on screen. In the two-column layout the tab column scrolls on its own, so scroll it, not the page,
// even when it is too short to move.
function scrollToForm(el: HTMLElement): void {
  const col = el.closest<HTMLElement>('#sec-tabs');
  if (col && getComputedStyle(col).overflowY !== 'visible') {
    const top = col.scrollTop + el.getBoundingClientRect().top - col.getBoundingClientRect().top - (col.clientHeight - el.offsetHeight) / 2;
    col.scrollTo({ top, behavior: 'smooth' });
  } else {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

// Draft state and open/close for one kind of add/edit form.
export function useEntryForm<D extends object>(kind: FormKind, blank: D, noun: string, addTitle: string) {
  const { form, setForm } = useSheet();
  const [draft, setDraft] = useState<D>(blank);
  const isOpen = form?.kind === kind;
  const editingId = isOpen ? form.id : null;
  const scroll = () => setTimeout(() => {
    const el = document.getElementById('form-' + kind);
    if (el) scrollToForm(el);
  }, 60);
  return {
    isOpen, editingId, draft,
    set: (p: Partial<D>) => setDraft((d) => ({ ...d, ...p })),
    openAdd: () => { setDraft(blank); setForm({ kind, id: null }); scroll(); },
    openEdit: (id: string, d: D) => { setDraft(d); setForm({ kind, id }); scroll(); },
    close: () => setForm(null),
    title: editingId ? 'Edit ' + noun : addTitle,
    saveLabel: editingId ? 'Save changes' : 'Add ' + noun
  };
}

// Adds a new entry, or merges the edit into the entry being edited.
export function saveEntry<E extends { id: string }>(list: E[], built: Omit<E, 'id'> | Partial<E>, editingId: string | null, extra: Partial<E> = {}): E[] {
  if (editingId) return patchEntry(list, editingId, built as Partial<E>);
  return [...list, { id: newId(), ...extra, ...built } as E];
}

export function removeEntry<E extends { id: string }>(list: E[], id: string): E[] {
  return list.filter((x) => x.id !== id);
}

// Merges a patch, or a function of the current entry, into the entry with this id.
export function patchEntry<E extends { id: string }>(list: E[], id: string, p: Partial<E> | ((e: E) => Partial<E>)): E[] {
  return list.map((x) => (x.id === id ? { ...x, ...(typeof p === 'function' ? p(x) : p) } : x));
}
