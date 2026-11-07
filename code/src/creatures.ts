// Companions and forms: creatures the character commands (pet) and forms the character takes (form), their numbers
// typed by hand. Pure functions, Character → Character. logic.ts calls only fixCreatures (in normalize()); the
// functions here run at call time only, so the import cycle with logic.ts is safe (no top-level use of its exports).
import { inactiveReason, INCAPACITATING, parseLink, sourceOf, srcKindOfLink } from './links';
import { abilityMod, freeCastsOf, isDead, itemOfSpell, newId, pactLeft, setConc, slotsLeft, spellUsable } from './logic';
import type { Character, Creature, Spell } from './types';

const list = (c: Character): Creature[] => c.creatures ?? [];
const withList = (c: Character, creatures: Creature[]): Character => ({ ...c, creatures });
const mapOne = (c: Character, id: string, f: (k: Creature) => Creature): Character => withList(c, list(c).map((k) => (k.id === id ? f(k) : k)));

// The source's current name and kind on a linked card (R22), so a card whose source goes later still names it.
function withSrc(c: Character, k: Creature): Creature {
  const src = k.from ? sourceOf(c, k.from) : null;
  return src ? { ...k, srcName: src.name, srcKind: srcKindOfLink(c, k.from!) ?? k.srcKind } : k;
}

// The Druid level: the Druid row's level, 0 with no Druid row. Not levelIn, which falls back to the character level.
export const druidLevel = (c: Character): number => c.classes.find((r) => r.clsId === 'class/druid')?.lvl ?? 0;
// Circle of the Moon, read from the subclass id only: a row typed by hand without subId isn't read as Moon
// (simplification: matchId normally sets it).
export const isMoon = (c: Character): boolean => c.classes.some((r) => r.clsId === 'class/druid' && r.subId === 'subclass/druid/circle-of-the-moon');

// A copy's name (R48): a trailing number goes, then the lowest n ≥ 2 such that "<base> n" names no card.
export function copyName(c: Character, name: string): string {
  const base = name.replace(/ \d+$/, '');
  let n = 2;
  while (list(c).some((k) => k.name === base + ' ' + n)) n++;
  return base + ' ' + n;
}

// A form is always added off (assumeForm is the only way one turns on); a pet keeps the draft's `on`.
export function addCreature(c: Character, draft: Omit<Creature, 'id'> & { id?: string }): Character {
  const k: Creature = withSrc(c, { ...draft, id: draft.id ?? newId(), ...(draft.kind === 'form' ? { on: false } : {}) });
  return withList(c, [...list(c), k]);
}
const copyOf = (c: Character, k: Creature): Creature =>
  ({ ...withSrc(c, k), id: newId(), name: copyName(c, k.name), on: false, atk: k.atk.map((a) => ({ ...a, id: newId() })) });
// A copy with new ids for the card and its attacks, added off.
export function duplicateCreature(c: Character, id: string): Character {
  const k = list(c).find((x) => x.id === id);
  return k ? withList(c, [...list(c), copyOf(c, k)]) : c;
}
// The pets linked to a source, in list order.
export const linkedCreatures = (c: Character, from: string): Creature[] => list(c).filter((k) => k.kind === 'pet' && k.from === from);

// Damage and healing on a pet that is out: Temporary HP first; at 0 HP it is dismissed (most summons vanish at 0 HP;
// simplification: no death saves for companions). Nothing on a card that is off or away.
const hurtable = (k: Creature | undefined): k is Creature => !!k && k.on && !k.away && k.kind === 'pet';
export function damageCreature(c: Character, id: string, n: number): Character {
  if (!hurtable(list(c).find((k) => k.id === id)) || n <= 0) return c;
  return mapOne(c, id, (k) => {
    const fromTemp = Math.min(k.temp, n), hp = Math.max(0, k.hp - (n - fromTemp));
    return { ...k, temp: k.temp - fromTemp, hp, on: hp > 0 };
  });
}
export function healCreature(c: Character, id: string, n: number): Character {
  if (!hurtable(list(c).find((k) => k.id === id)) || n <= 0) return c;
  return mapOne(c, id, (k) => ({ ...k, hp: Math.min(k.maxHp, k.hp + n) }));
}

// Brings cards back: on, out of the pocket, HP refilled, Temporary HP and conditions cleared, the slot level when given.
// No Concentration change: the cast that led here already set it.
const refill = (k: Creature, lvl?: number): Creature => ({ ...k, on: true, away: false, hp: k.maxHp, temp: 0, conds: {}, ...(lvl ? { lvl } : {}) });
export const summon = (c: Character, ids: string[], lvl?: number): Character =>
  withList(c, list(c).map((k) => (ids.includes(k.id) ? refill(k, lvl) : k)));
// n copies of a card (as duplicateCreature), summoned: the picker's "+ New from".
export function summonCopies(c: Character, id: string, n: number, lvl?: number): Character {
  const k = list(c).find((x) => x.id === id);
  let out = c;
  for (let i = 0; k && i < n; i++) out = withList(out, [...list(out), refill(copyOf(out, k), lvl)]);
  return out;
}
export const dismiss = (c: Character, id: string): Character => mapOne(c, id, (k) => ({ ...k, on: false, away: false }));
// Find Familiar's pocket dimension (PHB p.272): a Magic action, no cast, so HP, Temporary HP and conditions are kept.
const canPocket = (k: Creature) => k.on && !!k.pocket;
export const sendAway = (c: Character, id: string): Character => mapOne(c, id, (k) => (canPocket(k) ? { ...k, away: true } : k));
export const recall = (c: Character, id: string): Character => mapOne(c, id, (k) => (canPocket(k) ? { ...k, away: false } : k));

const incapacitated = (c: Character) => INCAPACITATING.some((n) => c.conds[n]);
const spellOf = (k: Creature) => { const p = parseLink(k.from); return p?.kind === 'spell' ? p.id : null; };
// The Temporary HP a form gives on assume: Wild Shape the Druid level (PHB p.81), three times it for a Moon druid
// (Circle Forms, PHB p.86); Polymorph and Shapechange the beast's HP (PHB p.306, p.315).
const formTempOf = (c: Character, k: Creature) =>
  k.formTemp === 'wildshape' ? druidLevel(c) * (isMoon(c) ? 3 : 1) : k.formTemp === 'hp' ? k.maxHp : 0;
// The only way a form turns on. Refused while Incapacitated or dead (Wild Shape ends then, PHB p.80), and for a form
// that ends with Concentration whose spell isn't the current one (it comes up after its cast, or later to switch
// forms: Shapechange, PHB p.315). Every other form goes off. Temporary HP aren't cumulative (PHB p.29): you keep the
// old or take the new; simplification: the higher, since keeping the lower is never better.
export function assumeForm(c: Character, id: string): Character {
  const f = list(c).find((k) => k.id === id && k.kind === 'form');
  if (!f || incapacitated(c) || isDead(c)) return c;
  const sp = spellOf(f);
  if (f.ends === 'conc' && sp && c.conc?.id !== sp) return c;
  return {
    ...withList(c, list(c).map((k) => (k.kind !== 'form' ? k : { ...k, on: k.id === id }))),
    temp: Math.max(c.temp, formTempOf(c, f))
  };
}
// A form's AC: the beast's, or for a Moon druid's Wild Shape form 13 + WIS modifier when higher (PHB p.86).
export const formAc = (c: Character, k: Creature): number =>
  k.formTemp === 'wildshape' && isMoon(c) ? Math.max(k.ac, 13 + abilityMod(c, 'wis')) : k.ac;
// Off; the character's Temporary HP is left as it is.
export const endForm = (c: Character, id: string): Character => mapOne(c, id, (k) => (k.kind === 'form' ? { ...k, on: false } : k));

// The creature rules normalize() runs (before fixCastFx and dropSpentScrolls: it reads spell links before a spent
// scroll's row goes, and a Concentration it ends clears that spell's castFx in the same pass). Returns c itself when
// nothing changes.
export function fixCreatures(c: Character): Character {
  if (!('creatures' in c)) return c;
  if (!Array.isArray(c.creatures) || !c.creatures.length) { const { creatures: _, ...rest } = c; return rest; }
  let conc = c.conc, concCheck = c.concCheck;
  let formOn = false;
  const dead = incapacitated(c) || isDead(c);
  const out = c.creatures.map((k0) => {
    let k = k0;
    const set = (p: Partial<Creature>) => { k = { ...k, ...p }; };
    // Numbers in range.
    const hp = Math.min(Math.max(0, k.hp), k.maxHp), temp = Math.max(0, k.temp);
    if (hp !== k.hp || temp !== k.temp) set({ hp, temp });
    // A source that is gone: the link goes and the card switches off, as removeRef does (normalize() doesn't run
    // fixLinks). srcName and srcKind stay, so the card still names it.
    if (k.from && !sourceOf(c, k.from)) { const { from: _, ...rest } = k; k = { ...rest, on: false }; }
    if (k.kind === 'pet') {
      if (k.on && k.hp === 0) set({ on: false });
      if (k.away && !(k.on && k.pocket)) set({ away: false });
    } else if (k.on) {
      // One form at a time (only a damaged save has two); none while Incapacitated or dead (PHB p.80).
      if (formOn || dead) set({ on: false });
      // Polymorph ends early with no Temporary HP left (PHB p.306), and its Concentration with it. Simplification: the
      // sheet reads the one Temporary HP pool, so if the character held more than the beast's HP before, the form lasts
      // until the whole pool is gone.
      else if (k.formTemp === 'hp' && c.temp === 0) {
        set({ on: false });
        const sp = spellOf(k);
        if (sp && conc?.id === sp) { concCheck = 'Concentration on ' + conc.name + ' ended (no Temporary HP left).'; conc = null; }
      }
      if (k.on) formOn = true;
    }
    return k;
  });
  // Last, so it sees a Concentration the rule above ended: a card that ends with Concentration on its spell goes off.
  const fixed = out.map((k) => (k.on && k.ends === 'conc' && spellOf(k) && conc?.id !== spellOf(k) ? { ...k, on: false } : k));
  const same = fixed.every((k, i) => k === c.creatures![i]) && conc === c.conc;
  if (same) return c;
  return { ...c, creatures: fixed, ...(conc !== c.conc ? { ...setConc(null), concCheck } : {}) };
}


// The Companions section shows when there is a creature, a spell or feature that makes one, edit mode (with
// "+ Add companion"), or the creature editor open (the scroll case has no source row left and no creature yet).
export const showCompanions = (c: Character, edit: boolean, form: { kind: string; id: string | null } | null): boolean =>
  !!list(c).length || edit || form?.kind === 'creature' || c.spells.some((s) => s.makes) || c.feats.some((f) => f.makes);

// Why a dismissed card's "Cast again" can't cast its spell now, with the tests the spell row uses: not prepared, or no
// slot, pact slot or free cast left (an item's spell: the reason it doesn't count). null when the row can cast it.
export function castAgainBlock(c: Character, sp: Spell): string | null {
  if (itemOfSpell(c, sp)) return inactiveReason(c, sp);
  if (sp.lvl > 0 && !spellUsable(c, sp)) return 'Not prepared';
  if (freeCastsOf(c, sp.id).some((r) => r.count > 0)) return null;
  if (sp.lvl === 0) return null;
  for (let l = sp.lvl; l <= 9; l++) if (slotsLeft(c, l) > 0) return null;
  if (c.pactMax > 0 && c.pactLvl >= sp.lvl && pactLeft(c) > 0) return null;
  return 'No slot left';
}
