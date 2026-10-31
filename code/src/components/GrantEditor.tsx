import { useState, type CSSProperties } from 'react';
import { catalogId, grantErrors, type GrantKind, type GrantSpec } from '../catalog/schema';
import type { SourceKind } from '../links';
import { ABILITIES, DAMAGE_TYPES, SIZES, SKILLS, findUnlinked, newId, type GrantInput } from '../logic';
import { useSheet } from '../sheet';

interface FieldDef { key: string; label: string; type: 'text' | 'value' | 'bool' | 'select'; options?: [string, string][] }
const ABIL: [string, string][] = ABILITIES.map(([k, n]) => [k, n]);
const SKILL_OPTS: [string, string][] = SKILLS.map(([k, n]) => [k, n]);
const ABIL_CHECKS: [string, string][] = ABILITIES.map(([k, n]) => [k, n + ' (every check)']);
const RANGE: [string, string][] = [['', '—'], ['melee', 'Melee'], ['ranged', 'Ranged']];
const v = (key: string, label: string): FieldDef => ({ key, label, type: 'value' });
const t = (key: string, label: string): FieldDef => ({ key, label, type: 'text' });
const b = (key: string, label: string): FieldDef => ({ key, label, type: 'bool' });
const sel = (key: string, label: string, options: [string, string][]): FieldDef => ({ key, label, type: 'select', options });

// Every grant kind with its label and fields (the vocabulary in catalog/schema.ts). Values are numbers or formulas
// such as pb, wis>=1 or 2:2,6:3; dice where the kind rolls.
export const GRANT_KINDS: [GrantKind, string][] = [
  ['sense', 'Sense'], ['resource', 'Resource'], ['defense', 'Defense'], ['spell', 'Spell'], ['abil', 'Ability score +'],
  ['abilSet', 'Ability score set to'], ['prof', 'Proficiency'], ['saveBonus', 'Saving throw bonus'], ['checkBonus', 'Check bonus'],
  ['speed', 'Speed'], ['ac', 'Armor Class'], ['init', 'Initiative bonus'], ['hpLvl', 'HP per level'], ['size', 'Size'],
  ['carryUp', 'Carry as one size larger'], ['action', 'Action'], ['xdmg', 'Extra damage on a hit'], ['attacks', 'Attacks per Attack action'],
  ['unarmed', 'Unarmed Strike'], ['atkBonus', 'Attack bonus'], ['dmgBonus', 'Damage bonus'], ['lightExtra', 'Light weapon extra attack'],
  ['atkAbil', 'Attack ability'], ['casting', 'Spellcasting (subclass)'], ['crit', 'Critical hit range']
];
const WEAPON_FIELDS = [v('val', 'Bonus'), sel('wrange', 'Weapon', RANGE), sel('amode', 'Attack', RANGE), t('prop', 'Weapon property'), t('weapon', 'Weapon name'), b('oneHand', 'One-handed only')];
export const GRANT_FIELDS: Record<GrantKind, FieldDef[]> = {
  sense: [v('range', 'Range (ft)')],
  resource: [v('max', 'Maximum'), sel('recharge', 'Recharge', [['long', 'Long Rest'], ['short', 'Short Rest'], ['dawn', 'Dawn'], ['none', 'Manual']]),
    v('regain', 'Partial regain'), sel('regainOn', 'Regain on', [['', '—'], ['short', 'a Short Rest'], ['dawn', 'dawn']])],
  defense: [sel('def', 'Kind', [['res', 'Resistance'], ['vul', 'Vulnerability'], ['imm', 'Immunity'], ['adv', 'Advantage on saves']]), t('target', 'Against (e.g. Cold, vs Charmed)')],
  spell: [sel('spellLvl', 'Spell level', Array.from({ length: 10 }, (_, i) => [String(i), i ? 'Level ' + i : 'Cantrip'])), b('always', 'Always prepared'), sel('castAb', 'Casts with', [['', 'Spellcasting ability'], ...ABIL])],
  abil: [sel('ab', 'Ability', ABIL), v('val', 'Increase'), sel('cap', 'Up to', [['20', '20'], ['25', '25'], ['30', '30']])],
  abilSet: [sel('ab', 'Ability', ABIL), v('val', 'Score')],
  prof: [sel('cat', 'Kind', [['skill', 'Skill'], ['expertise', 'Expertise'], ['save', 'Saving throw'], ['armor', 'Armor'], ['weapon', 'Weapon'], ['tool', 'Tool'],
    ['language', 'Language'], ['mastery', 'Weapon Mastery'], ['half', 'Half proficiency (Jack of All Trades)']]), t('target', 'Which (e.g. Thieves’ Tools, Elvish)'), v('val', 'Count')],
  saveBonus: [sel('ab', 'Saves', [['all', 'All'], ...ABIL]), v('val', 'Bonus')],
  checkBonus: [t('target', 'Skill key or ability (e.g. arcana, int)'), v('val', 'Bonus')],
  speed: [sel('mode', 'Speed', [['walk', 'Walk'], ['climb', 'Climb'], ['swim', 'Swim'], ['fly', 'Fly'], ['burrow', 'Burrow']]), t('val', 'Feet, a formula, or walk'), b('hover', 'Can hover')],
  ac: [sel('acMode', 'Kind', [['bonus', 'Bonus'], ['unarmored', 'Unarmored base (10 + DEX + ability)']]), v('val', 'Bonus'), sel('ab', 'Ability (unarmored)', [['', '—'], ...ABIL]), b('shieldOk', 'Works with a Shield')],
  init: [v('val', 'Bonus')],
  hpLvl: [v('val', 'HP per level')],
  size: [sel('size', 'Size', SIZES.map(([k, n]) => [k, n]))],
  carryUp: [],
  action: [sel('econ', 'Takes', [['action', 'Action'], ['bonus', 'Bonus Action'], ['reaction', 'Reaction'], ['free', 'Free'], ['other', 'Other']]), t('note', 'Note'), v('dice', 'Dice')],
  xdmg: [v('dice', 'Dice'), sel('dtype', 'Type', [['', '—'], ...DAMAGE_TYPES.map((d): [string, string] => [d, d])]), t('on', 'When (e.g. a hit, target missing HP)'), b('perTurn', 'Once per turn')],
  attacks: [v('val', 'Attacks')],
  unarmed: [v('die', 'Damage die'), t('abs', 'Abilities (e.g. str,dex)')],
  atkBonus: WEAPON_FIELDS,
  dmgBonus: [...WEAPON_FIELDS, b('cantrip', 'Class cantrips')],
  lightExtra: [b('addMod', 'Adds the ability modifier')],
  atkAbil: [sel('ab', 'Ability', [['cast', 'Spellcasting ability'], ...ABIL]), t('weapons', 'Weapons (e.g. club,quarterstaff)'), sel('amode', 'Attack', RANGE), v('die', 'Damage die')],
  casting: [sel('ab', 'Ability', ABIL), t('list', 'Spell list'), v('cantrips', 'Cantrips'), v('prepared', 'Prepared'), v('s1', 'Level 1 slots'), v('s2', 'Level 2 slots'), v('s3', 'Level 3 slots'), v('s4', 'Level 4 slots'), v('s5', 'Level 5 slots')],
  crit: [v('val', 'Critical on')]
};
const COUNTABLE: GrantKind[] = ['abil', 'speed', 'init', 'hpLvl', 'ac'];
const LINKABLE: Partial<Record<GrantKind, 'resource' | 'spell' | 'action'>> = { resource: 'resource', spell: 'spell', action: 'action' };
const WHEN: [string, string][] = [['', 'Always'], ['armor', 'While wearing armor'], ['noHeavy', 'Not in Heavy armor'], ['noArmor', 'Without armor'],
  ['noShield', 'Without a Shield'], ['noArmorNoShield', 'Without armor or a Shield'], ['active', 'While switched on']];
const DEFAULTS: Record<string, string | boolean> = { shieldOk: true, recharge: 'long', def: 'res', ab: 'str', cap: '20', cat: 'skill', mode: 'walk', acMode: 'bonus', size: 'medium', econ: 'action', spellLvl: '0' };

// One form for every grant kind, driven by GRANT_FIELDS. Gives a spec ready for addGrants; Add stays off while
// grantErrors reports a problem.
export function GrantEditor({ fromKind, onAdd, onCancel }: { fromKind: SourceKind; onAdd: (g: GrantInput) => void; onCancel: () => void }) {
  const { c } = useSheet();
  const [kind, setKind] = useState<GrantKind>('sense');
  const [name, setName] = useState('');
  const [d, setD] = useState<Record<string, string | boolean>>({ ...DEFAULTS, needEq: fromKind === 'item' });
  const [counted, setCounted] = useState<boolean | null>(null);
  const [choice, setChoice] = useState<'link' | 'new' | null>(null);
  const set = (k: string, val: string | boolean) => setD((x) => ({ ...x, [k]: val }));
  // A skill or save target must be the rules' key ('arcana', 'int'): a typed name would match nothing, so pick it.
  const target = kind === 'checkBonus' ? sel('target', 'Skill or ability', [...SKILL_OPTS, ...ABIL_CHECKS])
    : kind === 'prof' && (d.cat === 'skill' || d.cat === 'expertise') ? sel('target', 'Skill', SKILL_OPTS)
      : kind === 'prof' && d.cat === 'save' ? sel('target', 'Saving throw', ABIL) : null;
  const fields = GRANT_FIELDS[kind].map((f) => (f.key === 'target' && target ? target : f));
  // A select shows its first option while its value isn't one of them, so that option is the value.
  const valOf = (f: FieldDef) => (f.type === 'select' && !f.options!.some(([k]) => k === d[f.key]) ? f.options![0][0] : d[f.key]);

  const spec: Record<string, unknown> = { id: newId(), kind, name: name.trim() };
  for (const f of fields) {
    const val = valOf(f);
    if (f.key === 'spellLvl' || val === '' || val === false || val === undefined) continue;
    if (kind === 'ac' && d.acMode !== 'unarmored' && (f.key === 'ab' || f.key === 'shieldOk')) continue;
    if (kind === 'ac' && d.acMode === 'unarmored' && f.key === 'val') continue;
    spec[f.key] = f.key === 'cap' ? Number(val) : typeof val === 'string' ? val.trim() : val;
  }
  if (kind === 'spell') spec.spell = catalogId('spell', name.trim() || 'spell');
  // Unarmored bases work with a Shield unless unticked (Monk, Dance lose it).
  if (kind === 'ac' && d.acMode === 'unarmored') spec.shieldOk = d.shieldOk ? undefined : false;
  if (d.when) spec.when = d.when;
  if (d.lvl) spec.lvl = Number(d.lvl);
  if (fromKind === 'item' && d.needEq) spec.needEq = true;
  if (fromKind === 'item' && d.needAtt) spec.needAtt = true;
  for (const k of Object.keys(spec)) if (spec[k] === undefined) delete spec[k];

  const countable = COUNTABLE.includes(kind) && (kind !== 'ac' || d.acMode === 'bonus');
  // "Already counted" starts on for an AC bonus when custom AC bonuses exist (an older sheet often holds it there).
  const countedNow = countable && (counted ?? (kind === 'ac' && c.acMods.length > 0));
  const linkKind = LINKABLE[kind];
  const found = linkKind && name.trim() ? findUnlinked(c, linkKind, name) : null;
  const linkNow = found ? choice ?? (kind === 'spell' ? null : 'link') : null;
  const { lvl, ...stored } = spec;
  const errs = name.trim() ? grantErrors({ ...stored, ...(lvl ? { minLvl: lvl } : {}) }, fromKind) : ['Name it'];
  const blocked = errs.length > 0 || (!!found && linkNow === null);
  const add = () => {
    if (blocked) return;
    onAdd({
      spec: spec as unknown as Omit<GrantSpec, 'opt'>,
      ...(linkNow === 'link' && found ? { link: found } : {}),
      ...(countedNow ? { counted: true } : {}),
      ...(kind === 'spell' && linkNow !== 'link' ? { spell: { name: name.trim(), lvl: Number(d.spellLvl) || 0, time: '', range: '' } } : {})
    });
  };

  const input = (f: FieldDef) => {
    const val = valOf(f);
    if (f.type === 'bool') return <label key={f.key} className="check"><input type="checkbox" checked={val === true} onChange={(e) => set(f.key, e.target.checked)} />{f.label}</label>;
    if (f.type === 'select') {
      return (
        <label key={f.key} className="field">{f.label}
          <select className="input" value={String(val ?? '')} onChange={(e) => set(f.key, e.target.value)}>
            {f.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      );
    }
    return (
      <label key={f.key} className="field">{f.label}
        <input type="text" className="input" value={String(val ?? '')} onChange={(e) => set(f.key, e.target.value)} />
      </label>
    );
  };

  return (
    <div className="col gap-8 dashed-box" role="group" aria-label="Add a grant">
      <div className="grid" style={{ '--min': '180px' } as CSSProperties}>
        <label className="field">Gives
          <select className="input" value={kind} onChange={(e) => { setKind(e.target.value as GrantKind); setCounted(null); setChoice(null); }}>
            {GRANT_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">Name
          <input type="text" className="input" value={name} placeholder={kind === 'spell' ? 'Spell name' : 'e.g. Darkvision 60 ft'} onChange={(e) => { setName(e.target.value); setChoice(null); }} />
        </label>
        {fields.map(input)}
        <label className="field">When
          <select className="input" value={String(d.when ?? '')} onChange={(e) => set('when', e.target.value)}>
            {WHEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">From character level
          <input type="text" inputMode="numeric" className="input" value={String(d.lvl ?? '')} placeholder="1" onChange={(e) => set('lvl', e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} />
        </label>
        {fromKind === 'item' && <label className="check"><input type="checkbox" checked={d.needEq === true} onChange={(e) => set('needEq', e.target.checked)} />Needs it equipped</label>}
        {fromKind === 'item' && <label className="check"><input type="checkbox" checked={d.needAtt === true} onChange={(e) => set('needAtt', e.target.checked)} />Needs attunement</label>}
        {countable && <label className="check"><input type="checkbox" checked={countedNow} onChange={(e) => setCounted(e.target.checked)} />Already counted in my numbers</label>}
      </div>
      {countable && kind === 'ac' && c.acMods.length > 0 && (
        <span className="small">Custom AC bonuses already on the sheet: {c.acMods.map((m) => m.name).join(', ')}. If this bonus is one of them, keep “Already counted” on.</span>
      )}
      {found && (
        <div role="radiogroup" aria-label="Link or add" className="row wrap gap-8">
          <label className="check"><input type="radio" checked={linkNow === 'link'} onChange={() => setChoice('link')} />Link my ‘{name.trim()}’</label>
          <label className="check"><input type="radio" checked={linkNow === 'new'} onChange={() => setChoice('new')} />Add a new one</label>
        </div>
      )}
      {errs.length > 0 && name.trim() && <span className="small" style={{ color: 'var(--danger)' }}>{errs.join(' · ')}</span>}
      <div className="row gap-8">
        <button type="button" className="btn" aria-disabled={blocked} onClick={add}>Add grant</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
