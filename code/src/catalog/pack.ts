// The PHB pack file built by `npm run pack` and imported from the menu: checked before anything is stored.
import { rekeyPack } from './merge';
import { KINDS, validateEntry, type Entry, type Kind } from './schema';

export type PackResult = { ok: true; entries: Entry[] } | { ok: false; error: string };

// Header first, then re-keying with today's aliases, then every entry; two entries re-keyed onto one id reject the file.
export function parsePackFile(text: string): PackResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'This file isn’t valid JSON. It may be incomplete; send it again.' }; }
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  if (d.app !== 'dnd-character-sheet' || d.kind !== 'catalog-pack') {
    return { ok: false, error: Array.isArray(d.characters) ? 'This is a character backup, not PHB data. Import it under Backup.' : 'This file isn’t PHB data for this app.' };
  }
  if (d.version !== 1) return { ok: false, error: `This PHB data is version ${String(d.version)}; this app reads version 1. Build it again with npm run pack.` };
  if (!Array.isArray(d.entries)) return { ok: false, error: 'This PHB data file has no entries.' };
  let entries: Entry[];
  try { entries = rekeyPack(d.entries as Entry[]); } catch { return { ok: false, error: 'The PHB data has a broken entry.' }; }
  for (const e of entries) {
    const errs = validateEntry(e);
    if (errs.length) return { ok: false, error: `The PHB data has a broken entry: ${errs[0]}` };
    if (e.src !== 'phb') return { ok: false, error: `${e.id} isn’t PHB data.` };
  }
  const ids = entries.map((e) => e.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) return { ok: false, error: `Two entries of the PHB data share the id ${dup}.` };
  return { ok: true, entries };
}

const PLURAL: Record<Kind, [string, string]> = {
  spell: ['spell', 'spells'], item: ['item', 'items'], feat: ['feat', 'feats'], background: ['background', 'backgrounds'], species: ['species', 'species'],
  trait: ['trait', 'traits'], class: ['class', 'classes'], subclass: ['subclass', 'subclasses'], feature: ['feature', 'features'],
  prof: ['proficiency', 'proficiencies'], rule: ['rule', 'rules']
};
// The pack's own entries by kind: 'PHB data: 52 spells, 58 feats, … loaded'.
export function packSummary(entries: Entry[]): string {
  const parts = KINDS.map((k) => [k, entries.filter((e) => e.kind === k).length] as const).filter(([, n]) => n)
    .map(([k, n]) => `${n} ${PLURAL[k][n === 1 ? 0 : 1]}`);
  return `PHB data: ${parts.join(', ')} loaded`;
}
