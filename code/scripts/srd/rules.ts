// SRD Rules Glossary → RuleEntry for the 12 actions, Opportunity Attack and the four senses; the weapon properties and
// masteries; and the language tables.
import { catalogId, type RuleEntry } from '../../src/catalog/schema.ts';
import { paragraphs, srdLines } from './text.ts';

const ACTIONS = ['Attack', 'Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Influence', 'Magic', 'Ready', 'Search', 'Study', 'Utilize'];
const SENSES = ['Blindsight', 'Darkvision', 'Tremorsense', 'Truesight'];
// A glossary heading: a short title on its own line after a blank line.
const HEADING = /^[A-Z][\w’' -]*(?: \[[\w ]+\])?$/;

export function parseRules(text: string): RuleEntry[] {
  const L = srdLines(text), lines = L.map((l) => l.text.trim());
  const isHead = (i: number) => lines[i].length <= 40 && HEADING.test(lines[i]) && (i === 0 || !lines[i - 1]);
  const out: RuleEntry[] = [];
  lines.forEach((l, i) => {
    const action = /^(\w+) \[Action\]$/.exec(l)?.[1];
    const name = action && ACTIONS.includes(action) ? action : l === 'Opportunity Attacks' ? 'Opportunity Attack' : SENSES.includes(l) ? l : '';
    if (!name) return;
    const body: string[] = [];
    let stray = false;
    for (let k = i + 1; k < lines.length && !isHead(k); k++) {
      // A lower-case line after a finished sentence was cut in from another entry by the column crop; so is the rest
      // of its paragraph.
      if (lines[k] && /^[a-z]/.test(lines[k]) && /[.!?][”)]*$/.test(body.filter(Boolean).pop() ?? '')) stray = true;
      if (!lines[k]) stray = false;
      if (!stray) body.push(lines[k]);
    }
    out.push({ id: catalogId('rule', name), kind: 'rule', name, src: 'srd', cat: SENSES.includes(name) ? 'sense' : 'action',
      desc: paragraphs(body).join('\n') });
  });
  return out;
}

const PROPERTIES = ['Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Reach', 'Thrown', 'Two-Handed', 'Versatile'];
const MASTERIES = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex'];
// The Equipment section's Properties text. Range is explained in the weapon's own row, and the two last headings aren't rules.
export function parseWeaponRules(text: string): RuleEntry[] {
  const lines = srdLines(text).map((l) => l.text.trim()), names = [...PROPERTIES, ...MASTERIES];
  const stops = [...names, 'Range', 'Mastery Properties', 'Improvised Weapons'];
  return lines.flatMap((name, i) => {
    if (!names.includes(name)) return [];
    const end = lines.findIndex((l, k) => k > i && stops.includes(l));
    const body = lines.slice(i + 1, end < 0 ? lines.length : end);
    return [{ id: catalogId('rule', name), kind: 'rule', name, src: 'srd', cat: PROPERTIES.includes(name) ? 'property' : 'mastery', desc: paragraphs(body).join('\n') } satisfies RuleEntry];
  });
}

// The Standard and Rare Languages tables: every line that is only capitalised words, without dice ranges and footnote marks.
export function parseLanguages(text: string): string[] {
  const lines = srdLines(text).map((l) => l.text.trim());
  const a = lines.indexOf('Standard Languages'), b = lines.findIndex((l) => l.startsWith('*'));
  return lines.slice(a + 1, b).map((l) => l.replace(/^[\d–]+\s+/, '').replace(/\*$/, ''))
    .filter((l) => l && !['Language', 'Rare Languages', '1d12', '—'].includes(l) && /^[A-Z][\w’']*(?: [A-Z][\w’']*)*$/.test(l));
}
