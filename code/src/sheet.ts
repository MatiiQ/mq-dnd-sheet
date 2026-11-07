import { createContext, useContext, useState } from 'react';
import { newId } from './logic';
import type { Patch } from './storage';
import type { RevealTarget } from './components/nav';
import type { Character, Creature, Tab } from './types';

// Only one add/edit form is open at a time across the sheet.
// pick-*: the catalog pickers, which count as a form (opening one closes any other).
// creature: the companion editor in the Companions section. summon: the summon step under a source row (the picker or
// the pre-linked editor); its id is the source link ('spell:<id>' / 'feature:<id>'), never an entry id.
export type FormKind = 'attack' | 'rider' | 'res' | 'spell' | 'item' | 'feat' | 'sense' | 'acmod' | 'pick-spell' | 'pick-item' | 'pick-feat' | 'creature' | 'summon';
// lvl: the cast's slot level (summon; absent for a feature's Summon). draft: prefilled creature fields the editor reads
// once when it opens (the scroll case, whose source row is gone). Transient, never saved.
export type FormState = { kind: FormKind; id: string | null; lvl?: number; draft?: Partial<Creature> } | null;

// A tab's draft goes when its tab unmounts, so its form closes too: reopened, it would be blank and saving would overwrite the entry.
// Left-column forms stay mounted and keep their text.
export const formAfterTabChange = (form: FormState): FormState =>
  form && ['res', 'sense', 'acmod', 'creature'].includes(form.kind) ? form : null;

export interface SheetCtx {
  c: Character;
  update: (p: Patch) => void;
  edit: boolean;
  form: FormState;
  setForm: (f: FormState) => void;
  // The row a shortcut asked to open (transient, never saved). n counts reveals, so the same row can open twice;
  // used turns true once the row opened, so a row that mounts again later stays closed; tab is the tab the reveal switched to.
  focus: Focus | null;
  reveal: (t: RevealTarget) => void;
  markFocusUsed: (n: number) => void;
}
// cast: a spell row opens its upcast list too ("Cast again" on a dismissed companion).
export type Focus = { id: string; n: number; tab?: Tab; used: boolean; cast?: true };

export const Sheet = createContext<SheetCtx | null>(null);
export function useSheet(): SheetCtx {
  const ctx = useContext(Sheet);
  if (!ctx) throw new Error('useSheet outside <Sheet.Provider>');
  return ctx;
}

// Centres a form on screen, unless it is already fully in view (it opens where the entry was, so the page stays put).
// In the two-column layout the tab column scrolls on its own, so scroll it, not the page, even when it is too short to move.
function scrollToForm(el: HTMLElement): void {
  const col = el.closest<HTMLElement>('#sec-tabs');
  const ownScroll = !!col && getComputedStyle(col).overflowY !== 'visible';
  const r = el.getBoundingClientRect();
  const top = ownScroll ? col!.getBoundingClientRect().top : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 0;
  const bottom = Math.min(window.innerHeight, ownScroll ? col!.getBoundingClientRect().bottom : Infinity);
  if (r.top >= top && r.bottom <= bottom) return;
  if (col && ownScroll) {
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
