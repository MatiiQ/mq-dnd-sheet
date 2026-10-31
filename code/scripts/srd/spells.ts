// SRD spell descriptions → SpellEntry. Input: the plain pdftotext output (reading order).
import { catalogId, DAMAGE_TYPES, slug, type SpellEntry } from '../../src/catalog/schema.ts';
import type { Ability } from '../../src/types.ts';
import { paragraphs, srdLines } from './text.ts';

const LEVEL = /^(?:Level (\d) (\w+)|(\w+) Cantrip) \(/;
const FIELD = /^(Casting Time|Range|Components?|Duration): ?(.*)$/;
export const ABILITY_NAMES: Record<string, Ability> = { Strength: 'str', Dexterity: 'dex', Constitution: 'con', Intelligence: 'int', Wisdom: 'wis', Charisma: 'cha' };
// The damage types as a regex alternation (Acid|Bludgeoning|…), for both spell builders.
export const DAMAGE_ALT = DAMAGE_TYPES.join('|');
const DICE = '(\\d+d\\d+(?: ?\\+ ?\\d+)?)';
const DAMAGE = new RegExp(`${DICE} (${DAMAGE_ALT}) damage`);
// The damage wordings, most specific first (an earlier pattern wins at the same place in the text).
const DAMAGE_WORDINGS: RegExp[] = [
  // "3d8 Radiant damage (if …) or 3d8 Necrotic damage (if …)": one roll, the type chosen (Spirit Guardians).
  new RegExp(`${DICE} (${DAMAGE_ALT}) damage \\([^)]*\\) or \\1 (${DAMAGE_ALT}) damage`),
  // "5d10 Radiant or Necrotic damage", "5d8 Acid, Cold, Fire, Lightning, or Thunder damage".
  new RegExp(`${DICE} ((?:(?:${DAMAGE_ALT}), )*(?:${DAMAGE_ALT}),? or (?:${DAMAGE_ALT})) damage`),
  // "3d8 damage of the chosen type", "1d8 damage of a type you choose: …", "8d8 damage of the spirit’s type".
  new RegExp(`${DICE} damage of (?:the chosen type|a type you choose|the spirit[’']s type)`),
  // "Force damage equal to 1d8 plus your spellcasting ability modifier".
  new RegExp(`(${DAMAGE_ALT}) damage equal to ${DICE}( plus your spellcasting ability modifier)?`),
  DAMAGE
];
const typesIn = (s: string) => [...new Set([...s.matchAll(new RegExp(`\\b(${DAMAGE_ALT})\\b`, 'g'))].map((m) => m[1]))];
// The first damage the text names: where, its dice, and its type or the list a type is chosen from.
function damageOf(body: string): { at: number; dice: string; dtype?: string; dtypes?: string; dmgMod?: true } | null {
  let best: RegExpExecArray | null = null, k = -1;
  DAMAGE_WORDINGS.forEach((re, i) => { const m = re.exec(body); if (m && (!best || m.index < best.index)) { best = m; k = i; } });
  if (!best) return null;
  const m: RegExpExecArray = best, dice = (k === 3 ? m[2] : m[1]).replace(/ /g, '');
  if (k === 0) return { at: m.index, dice, dtypes: [m[2], m[3]].join(',') };
  if (k === 1) return { at: m.index, dice, dtypes: typesIn(m[2]).join(',') };
  if (k === 2) {
    // The types the text offers, up to the end of the sentence that deals the damage.
    const end = body.indexOf('.', m.index + m[0].length);
    return { at: m.index, dice, dtypes: typesIn(body.slice(0, end < 0 ? undefined : end)).join(',') };
  }
  if (k === 3) return { at: m.index, dice, dtype: m[1], ...(m[3] ? { dmgMod: true as const } : {}) };
  return { at: m.index, dice, dtype: m[2] };
}
const HEALING = /regains? (?:a number of )?Hit Points equal to (\d+d\d+)|regains? (\d+d\d+(?: ?\+ ?\d+)?) Hit Points|regains? .{0,40}Hit Points/;
const unbalanced = (s: string) => (s.match(/\(/g) ?? []).length > (s.match(/\)/g) ?? []).length;
const first = (text: string, res: RegExp[]) => res.map((re) => re.exec(text)).map((m) => m?.index ?? Infinity);

export function parseSpells(text: string): SpellEntry[] {
  const lines = srdLines(text);
  const nextText = (i: number) => { for (let j = i + 1; j < lines.length; j++) if (lines[j].text.trim()) return [j, lines[j].text] as const; return [-1, ''] as const; };
  const starts: number[] = [];
  lines.forEach((l, i) => { if (l.text.trim() && !LEVEL.test(l.text) && LEVEL.test(nextText(i)[1])) starts.push(i); });
  return starts.map((s, n) => {
    const block = lines.slice(s, starts[n + 1] ?? lines.length).map((l) => l.text);
    let i = block.findIndex((l, k) => k > 0 && LEVEL.test(l));
    let head = block[i];
    while (unbalanced(head)) head += ' ' + block[++i].trim();
    const m = LEVEL.exec(head)!;
    const classes = head.slice(head.indexOf('(') + 1, head.lastIndexOf(')')).split(',').map((c) => slug(c)).join(',');
    const f: Record<string, string> = {};
    let last = '';
    for (i++; i < block.length; i++) {
      const l = block[i].trim();
      if (!l) { if (f.Duration !== undefined) break; continue; }
      const fm = FIELD.exec(l);
      if (fm) f[(last = fm[1].replace(/^Component$/, 'Components'))] = fm[2];
      // Before Duration every other line continues a field; after it only a lower-case line or an open parenthesis does.
      else if (last && (f.Duration === undefined || /^[a-z]/.test(l) || unbalanced(f[last]))) f[last] += ' ' + l;
      else break;
    }
    const paras = paragraphs(block.slice(i));
    const body = paras.join('\n');
    const lvl = m[1] ? Number(m[1]) : 0;
    const higherP = paras.find((p) => p.startsWith('Using a Higher-Level Spell Slot.'));
    const higher = higherP?.replace(/^Using a Higher-Level Spell Slot\.\s*/, '');
    const ritual = / or Ritual$/.test(f['Casting Time']);
    const [atkAt, saveAt] = first(body, [/(melee|ranged) spell attack/, /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/]);
    const [healAt] = first(body, [HEALING]);
    const dmg = damageOf(body), heal = HEALING.exec(body), dmgAt = dmg?.at ?? Infinity;
    const fx = dmgAt === Infinity && healAt === Infinity ? 'other' : dmgAt <= healAt ? 'damage' : 'healing';
    const dice = fx === 'damage' ? dmg!.dice : fx === 'healing' ? (heal![1] ?? heal![2])?.replace(/ /g, '') : undefined;
    const slotDice = higher && /increases? by (\d+d\d+) for each spell slot level above/.exec(higher)?.[1];
    const scale = lvl === 0 ? (/^Cantrip Upgrade\..*\b5\b/m.test(body) ? 'cantrip' : undefined) : slotDice ? `${slotDice}/slot` : undefined;
    const name = block[0].trim();
    const e: SpellEntry = {
      id: catalogId('spell', name), kind: 'spell', name, src: 'srd', page: lines[s].page, desc: body,
      lvl, school: m[2] ?? m[3], classes,
      time: f['Casting Time'].replace(/ or Ritual$/, ''), range: f.Range, comp: f.Components, dur: f.Duration,
      conc: /^Concentration/.test(f.Duration), ritual, fx
    };
    if (atkAt < saveAt) e.atk = /(melee|ranged) spell attack/.exec(body)![1] as 'melee' | 'ranged';
    else if (saveAt < atkAt) e.save = ABILITY_NAMES[/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/.exec(body)![1]];
    if (dice) e.dice = dice;
    if (fx === 'damage' && dmg!.dtype) e.dtype = dmg!.dtype;
    if (fx === 'damage' && dmg!.dtypes) e.dtypes = dmg!.dtypes;
    if (fx === 'damage' && dmg!.dmgMod) e.dmgMod = true;
    if (scale) e.scale = scale;
    if (higher) e.higher = higher;
    // Healing that adds the modifier: "regains Hit Points equal to 2d8 plus your spellcasting ability modifier".
    if (fx === 'healing' && /Hit Points equal to [^.]*?plus your spellcasting ability modifier/.test(body)) e.healMod = true;
    return e;
  });
}
