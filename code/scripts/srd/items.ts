// SRD equipment and magic items → ItemEntry. Tables come from the -layout text, prose from the column text.
import { withBase } from '../../src/catalog/base.ts';
import { catalogId, slug, type ItemEntry } from '../../src/catalog/schema.ts';
import { paragraphs, srdLines } from './text.ts';

const COST = '[\\d,]+ [GSC]P';
// '2 lb.', '1/4 lb.', '1½ lb.', '5 lb. (full)' → pounds; '—' and 'Varies' → undefined.
export function pounds(w: string): number | undefined {
  const m = /^(\d+)?(½)?(?:(\d+)\/(\d+))? lb\./.exec(w.trim());
  if (!m) return undefined;
  return Number(m[1] ?? 0) + (m[2] ? 0.5 : 0) + (m[3] ? Number(m[3]) / Number(m[4]) : 0);
}
const item = (name: string, fields: Omit<ItemEntry, 'id' | 'kind' | 'name' | 'src' | 'desc'> & { desc?: string }): ItemEntry =>
  ({ id: catalogId('item', name), kind: 'item', name, src: 'srd', desc: '', ...fields });
// "Clothes, Traveler’s" in the tables is the item players call "Traveler’s Clothes".
export const playName = (n: string) => (n.includes(', ') ? n.split(', ').reverse().join(' ') : n);
// Splits on commas outside parentheses.
const splitTop = (s: string) => s.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);

// "Finesse, Light, Thrown (Range 20/60)" → props 'finesse,light,thrown' and thrown '20/60'; versatile and ammunition alike.
export function weaponProps(e: ItemEntry, text: string): void {
  const names: string[] = [];
  for (const p of splitTop(text).filter((p) => p !== '—')) {
    const name = slug(p.replace(/\s*\(.*\)$/, '')), arg = /\((.*)\)/.exec(p)?.[1];
    names.push(name);
    if (name === 'thrown' && arg) e.thrown = arg.replace(/^Range /, '');
    if (name === 'versatile' && arg) e.vers = arg;
    if (name === 'ammunition' && arg) { const [r, kind] = arg.replace(/^Range /, '').split(';'); e.ammo = `${r.trim()};${slug(kind)}`; }
  }
  if (names.length) e.props = names.join(',');
}

const WEAPON_ROW = new RegExp(`^\\s+(.+?)\\s+(\\d+d\\d+|\\d+) (Bludgeoning|Piercing|Slashing)\\s+(.+?)\\s{2,}(Cleave|Graze|Nick|Push|Sap|Slow|Topple|Vex)\\s+(\\S+ lb\\.|—)\\s+(${COST})\\s*$`);
export function parseWeapons(layout: string): ItemEntry[] {
  const out: ItemEntry[] = [];
  let wcat: 'simple' | 'martial' = 'simple', wrange: 'melee' | 'ranged' = 'melee';
  const props: string[] = [];
  const finish = () => {
    const e = out[out.length - 1];
    if (e) weaponProps(e, props.join(' '));
    props.length = 0;
  };
  for (const line of layout.split('\n')) {
    const cat = /^\s+(Simple|Martial) (Melee|Ranged) Weapons\s*$/.exec(line);
    if (cat) { finish(); wcat = cat[1].toLowerCase() as typeof wcat; wrange = cat[2].toLowerCase() as typeof wrange; continue; }
    const m = WEAPON_ROW.exec(line);
    if (m) {
      finish();
      const wt = pounds(m[6]);
      out.push(item(m[1].trim(), { cat: 'weapon', wcat, wrange, dmg: m[2], dtype: m[3], mastery: slug(m[5]), cost: m[7], ...(wt === undefined ? {} : { wt }) }));
      props.push(m[4].trim());
    } else if (out.length && props.length && /^\s{20,}\S/.test(line) && !/Weapons|\d+\s+System Reference/.test(line)) props.push(line.trim());
    else if (!line.trim()) finish();
  }
  finish();
  return out;
}

const ARMOR_ROW = new RegExp(`^\\s+(.+?)\\s{2,}\\+?(\\d+)(?: \\+ Dex modifier(?: \\(max 2\\))?)?\\s{2,}(—|Str \\d+)\\s{2,}(—|Disadvantage)\\s+(\\S+ lb\\.)\\s+(${COST})\\s*$`);
export function parseArmor(layout: string): ItemEntry[] {
  const out: ItemEntry[] = [];
  let kind = 'light' as 'light' | 'medium' | 'heavy' | 'shield';
  for (const line of layout.split('\n')) {
    const cat = /^\s+(?:(Light|Medium|Heavy) Armor|(Shield)) \(/.exec(line);
    if (cat) { kind = (cat[1] ?? cat[2]).toLowerCase() as typeof kind; continue; }
    const m = ARMOR_ROW.exec(line);
    if (!m) continue;
    out.push(item(m[1].trim(), {
      cat: kind === 'shield' ? 'shield' : 'armor', armor: kind, acBase: Number(m[2]), wt: pounds(m[5]), cost: m[6],
      ...(m[3] === '—' ? {} : { strReq: Number(m[3].slice(4)) }), ...(m[4] === 'Disadvantage' ? { stealthDis: true } : {})
    }));
  }
  return out;
}

// Prose blocks headed "Name (cost)", as in the tool and gear descriptions.
interface Priced { name: string; cost: string; page: number; lines: string[] }
const PRICED = new RegExp(`^([A-Z].*?) \\((${COST}|Varies)\\)$`);
// A heading split over two lines, prices for two sizes: "Spell Scroll (Cantrip, 30 GP;" + "Level 1, 50 GP)".
const PRICED_TWO = new RegExp(`^([A-Z].*?) \\((.*${COST}.*)\\)$`);
function pricedBlocks(text: string): Priced[] {
  const out: Priced[] = [];
  const lines = srdLines(text);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], t = l.text.trim();
    const m = PRICED.exec(t);
    const two = !m && /\([^)]*$/.test(t) && lines[i + 1] ? PRICED_TWO.exec(`${t} ${lines[i + 1].text.trim()}`) : null;
    if (m) out.push({ name: m[1], cost: m[2], page: l.page, lines: [] });
    else if (two) { out.push({ name: two[1], cost: two[2], page: l.page, lines: [] }); i++; }
    else out[out.length - 1]?.lines.push(l.text);
  }
  return out;
}

const GEAR_CELL = new RegExp(`(\\S+(?: \\S+)*)\\s{2,}(Varies|—|[\\d½/]+ lb\\.(?: \\(full\\))?)\\s+(Varies|${COST})`, 'g');
const AMMO_ROW = new RegExp(`^\\s+([A-Z][\\w, ]+?)\\s{2,}(\\d+)\\s+(Quiver|Case|Pouch)\\s+([\\d½/]+ lb\\.)\\s+(${COST})`);
// A gear item's capacity: pounds and the volume they fit in ("holds up to 30 pounds within 1 cubic foot"), or else the
// volume or count it holds ("12 cubic feet of contents", "20 Arrows"), which `cap` (pounds) can't hold.
export function capacityOf(desc: string): Pick<ItemEntry, 'cap' | 'capVol'> {
  const lb = /holds up to (\d+) pounds within (.+?)\./.exec(desc);
  if (lb) return { cap: Number(lb[1]), capVol: lb[2] };
  const vol = /holds up to (.+?)\.(?:\s|$)/.exec(desc);
  return vol ? { capVol: vol[1] } : {};
}

// The Adventuring Gear table (and the Ammunition table, when the layout text holds it) with descriptions from the prose.
export function parseGear(text: string, layout: string): ItemEntry[] {
  const prose = new Map(pricedBlocks(text).map((b) => [b.name, b]));
  const out: ItemEntry[] = [];
  const add = (tableName: string, fields: Omit<ItemEntry, 'id' | 'kind' | 'name' | 'src' | 'desc'>) => {
    // "Spell Scroll (Cantrip)" in the table, one "Spell Scroll" block in the prose.
    const p = prose.get(tableName) ?? prose.get(tableName.replace(/ \(.*\)$/, ''));
    const desc = p ? paragraphs(p.lines).join('\n') : '';
    out.push(item(playName(tableName), { ...fields, desc, ...(p ? { page: p.page } : {}), ...capacityOf(desc) }));
  };
  for (const line of layout.split('\n')) {
    const a = AMMO_ROW.exec(line);
    if (a) { add(a[1], { cat: 'ammo', wt: pounds(a[4]), cost: a[5] }); continue; }
    for (const m of line.matchAll(GEAR_CELL)) {
      const name = m[1];
      if (name === 'Ammunition' || name === 'Item') continue;
      const cat = /’s Pack$/.test(name) ? 'pack' : /Focus$|^Holy Symbol$/.test(name) ? 'focus' : 'gear';
      const wt = pounds(m[2]);
      add(name, { cat, ...(wt === undefined ? {} : { wt }), ...(m[3] === 'Varies' ? {} : { cost: m[3] }) });
    }
  }
  return out;
}

// Tools: "Name (cost)" blocks followed by Ability, Weight, Utilize, Craft and Variants lines.
export function parseTools(text: string): ItemEntry[] {
  return pricedBlocks(text).filter((b) => /^Ability:/.test(b.lines.find((l) => l.trim())?.trim() ?? '')).map((b) => {
    const fields: string[] = [];
    for (const l of b.lines.map((x) => x.trim()).filter(Boolean)) {
      if (/^(Ability|Weight|Utilize|Craft|Variants):/.test(l) || !fields.length) fields.push(l.replace(/\s+/g, ' '));
      else fields[fields.length - 1] = /[a-z]-$/.test(fields[fields.length - 1]) ? fields[fields.length - 1].slice(0, -1) + l : `${fields[fields.length - 1]} ${l}`;
    }
    const wt = pounds(/^Weight: (.*)$/m.exec(fields.join('\n'))?.[1] ?? '');
    return item(b.name, { cat: 'tool', page: b.page, desc: fields.filter((f) => !f.startsWith('Weight:')).join('\n'),
      ...(b.cost === 'Varies' ? {} : { cost: b.cost }), ...(wt === undefined ? {} : { wt }) });
  });
}

const unbalanced = (s: string) => (s.match(/\(/g) ?? []).length > (s.match(/\)/g) ?? []).length;
const TYPE_START = /^(Armor|Weapon|Wondrous Item|Potion|Ring|Rod|Scroll|Staff|Wand)(,| \()/;
const RARITY = /(Common|Uncommon|Very Rare|Rare|Legendary|Artifact|Rarity Varies)/;
// Magic Items A–Z: a name line, then "Type, Rarity (Requires Attunement…)", which can wrap.
export function parseMagicItems(text: string): ItemEntry[] {
  const lines = srdLines(text);
  const next = (i: number) => { let j = i + 1; while (j < lines.length && !lines[j].text.trim()) j++; return j; };
  const head = (j: number) => {
    let h = lines[j]?.text.trim() ?? '', k = j;
    while (k < j + 4 && (!RARITY.test(h.slice(h.indexOf(','))) || unbalanced(h) || /(\bor|Very|,)$/.test(h) || /^\(/.test(lines[k + 1]?.text.trim() ?? '')) && lines[k + 1]?.text.trim()) h += ' ' + lines[++k].text.trim();
    return [h, k] as const;
  };
  // [first name line, last type line, type text, name]; a long name wraps onto a second line that starts in lower case.
  const starts: [number, number, string, string][] = [];
  // "Armor, +1, +2, or +3" is a name shaped like a type line; a real type line names a rarity.
  const nameLike = (t: string) => !!t && t.length <= 60 && !/[.,:;]$/.test(t) && !(TYPE_START.test(t) && RARITY.test(t));
  lines.forEach((l, i) => {
    const t = l.text.trim();
    if (!nameLike(t)) return;
    const j = next(i);
    if (!TYPE_START.test(lines[j]?.text.trim() ?? '')) return;
    const [h, k] = head(j);
    if (!h.includes(',') || !RARITY.test(h.slice(h.indexOf(',')))) return;
    const prev = lines[i - 1]?.text.trim() ?? '';
    if (/^[a-z]/.test(t) && /^[A-Z+]/.test(prev) && nameLike(prev)) starts.push([i - 1, k, h, `${prev} ${t}`]);
    else if (/^[A-Z+]/.test(t)) starts.push([i, k, h, t]);
  });
  return starts.map(([s, k, h, name], n) => {
    const desc = paragraphs(lines.slice(k + 1, starts[n + 1]?.[0] ?? lines.length).map((l) => l.text)).join('\n');
    const attune = /\(Requires Attunement[^)]*\)/.test(h);
    const rarity = splitTop(h.replace(/\s*\(Requires Attunement[^)]*\)/, '')).slice(1).join(', ');
    const e = item(name, { cat: 'magic', page: lines[s].page, desc, rarity, ...(attune ? { attune: true } : {}) });
    // "has 7 charges", "has 1d8 + 1 charges" (rolled when found), "starts with 10 charges", "1 of its 3 charges".
    const charges = /(?:has|have|starts with) (\d+d\d+(?: ?\+ ?\d+)?|\d+) charges/.exec(desc) ?? /\d+ of its (\d+) charges/.exec(desc);
    if (charges) e.charges = charges[1].replace(/ /g, '');
    const regain = /regains? (\d+d\d+(?: ?\+ ?\d+)?|\d+|all) expended charges? daily at dawn/.exec(desc);
    if (regain) { e.recharge = 'dawn'; if (regain[1] !== 'all') { e.regain = regain[1].replace(/ /g, ''); e.regainOn = 'dawn'; } }
    // Charges the text never gives back (Luck Blade, Gem of Brightness): the player resets them by hand.
    else if (charges) e.recharge = 'none';
    // "+3 bonus to attack and damage rolls" (the weapon's magic); a staff "wielded as a magic Quarterstaff" is one.
    const magic = /\+(\d) bonus to attack (?:rolls )?and damage rolls/.exec(desc);
    if (magic) e.magic = Number(magic[1]);
    if (/wielded as a magic Quarterstaff/.test(desc)) e.base = 'item/quarterstaff';
    const cap = /hold up to (\d+) pounds, not exceeding a volume of (\d+ cubic feet)/.exec(desc);
    if (cap) { e.xdim = true; e.cap = Number(cap[1]); e.capVol = cap[2]; }
    const wt = /weighs (\d+) pounds/.exec(desc);
    if (wt) e.wt = Number(wt[1]);
    return e;
  });
}

// A magic item whose `base` (set in the overlay) is an item id gets that item's weapon or armor fields (withBase, shared
// with the add flow). A base id that names no mundane weapon, armor or Shield fails the build, and so does a `baseOf`
// id that names no item of the kind its base allows (a weapon for 'weapon', armor for 'armor', ammunition for 'ammo').
const BASE_CAT: Record<string, ItemEntry['cat']> = { weapon: 'weapon', armor: 'armor', ammo: 'ammo' };
export function copyBase(entries: ItemEntry[]): ItemEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return entries.map((e) => {
    for (const id of e.baseOf?.split(',') ?? []) {
      if (byId.get(id)?.cat !== BASE_CAT[e.base ?? '']) throw new Error(`${e.id}: baseOf ${id} is no ${e.base}`);
    }
    if (!e.base?.startsWith('item/')) return e;
    const b = byId.get(e.base);
    if (!b) throw new Error(`${e.id}: base ${e.base} is no item`);
    return withBase(e, b);
  });
}
