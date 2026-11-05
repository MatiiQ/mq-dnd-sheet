// Values in catalog grants: a number, a formula of PB, level and ability modifiers with an optional minimum
// ('wis>=1'), dice ('1d6+1'), or a level table ('2:2,6:3,17:4', '1:1d8,5:1d10'). Stored as flat strings.
import type { Ability } from '../types';

// hlvl: half the level, rounded down (PHB p.15; the sheet is single-class, so level is the class level).
// magic: the +N of the item a grant comes from (Wand of the War Mage), 0 when none; a grant-only term.
export interface ValueCtx { level: number; pb: number; mod: (a: Ability) => number; magic?: number }

const INT = '\\d+', DIE = '\\d*d\\d+';
const TERM = `(?:${DIE}|${INT}|pb|lvl|hlvl|magic|str|dex|con|int|wis|cha)`;
const EXPR = new RegExp(`^-?${TERM}(?:[+-]${TERM})*(?:>=${INT})?$`);
const STEP = new RegExp(`^(${INT}):(${DIE}|${INT})$`);
// No other term has a "d" followed by a digit (dex has none).
export const hasDice = (v: string): boolean => /d\d/.test(v);

// Level-table steps, or null when v is not a well-formed table.
function steps(v: string): [number, string][] | null {
  if (!v.includes(':')) return null;
  const out: [number, string][] = [];
  for (const part of v.split(',')) {
    const m = STEP.exec(part);
    if (!m || (out.length && Number(m[1]) <= out[out.length - 1][0])) return null;
    out.push([Number(m[1]), m[2]]);
  }
  return out.every(([, a]) => hasDice(a) === hasDice(out[0][1])) ? out : null;
}

export function isValue(v: string): boolean {
  return typeof v === 'string' && (v.includes(':') ? steps(v) !== null : EXPR.test(v));
}

// A number, or a dice string such as '1d6+1' or '2d6'. A table below its first level gives 0.
export function valueAt(v: string, ctx: ValueCtx): number | string {
  const table = steps(v);
  if (table) {
    const hit = table.filter(([l]) => l <= ctx.level).pop();
    if (!hit) return 0;
    return hasDice(hit[1]) ? hit[1] : Number(hit[1]);
  }
  const [body, min] = v.split('>=');
  let sum = 0;
  const dice: string[] = [];
  for (const [, sign, term] of body.matchAll(/([+-]?)([^+-]+)/g)) {
    const neg = sign === '-';
    if (hasDice(term)) { dice.push((neg ? '-' : dice.length ? '+' : '') + term); continue; }
    const n = term === 'pb' ? ctx.pb : term === 'lvl' ? ctx.level : term === 'hlvl' ? Math.floor(ctx.level / 2) : term === 'magic' ? ctx.magic ?? 0 : /^\d+$/.test(term) ? Number(term) : ctx.mod(term as Ability);
    sum += neg ? -n : n;
  }
  if (dice.length) return dice.join('') + (sum > 0 ? `+${sum}` : sum < 0 ? `${sum}` : '');
  return min === undefined ? sum : Math.max(sum, Number(min));
}

// The lowest and highest total of rolled dice with whole-number terms ('1d3' → [1, 3], '1d8+1' → [2, 9]); null for
// anything else, a value with no dice included (Luck Blade's starting charges are rolled when found).
export function diceRange(v: string): [number, number] | null {
  if (!/^\d*d\d+(?:[+-]\d*d?\d+)*$/.test(v) && !/^\d+(?:[+-]\d*d?\d+)+$/.test(v)) return null;
  let lo = 0, hi = 0, dice = false;
  for (const [, sign, term] of v.matchAll(/([+-]?)([^+-]+)/g)) {
    const k = sign === '-' ? -1 : 1, d = /^(\d*)d(\d+)$/.exec(term);
    if (d) {
      const n = Number(d[1] || 1), m = Number(d[2]);
      dice = true;
      if (k > 0) { lo += n; hi += n * m; } else { lo -= n * m; hi -= n; }
    } else { lo += k * Number(term); hi += k * Number(term); }
  }
  return dice ? [lo, hi] : null;
}
