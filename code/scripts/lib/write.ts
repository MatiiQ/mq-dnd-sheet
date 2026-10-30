// Writes catalog entries as pretty JSON, sorted by id, after validating every one of them.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { validateEntry, type Entry } from '../../src/catalog/schema.ts';

export function writeEntries(path: string, entries: Entry[]): void {
  const errs = entries.flatMap((e) => validateEntry(e));
  const ids = entries.map((e) => e.id);
  errs.push(...ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => `${id}: id used twice`));
  if (errs.length) throw new Error(`${path}: ${errs.length} errors\n${errs.join('\n')}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify([...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), null, 2) + '\n');
}
