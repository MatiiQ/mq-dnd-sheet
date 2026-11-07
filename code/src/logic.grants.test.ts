import { describe, expect, it } from 'vitest';
import { blankCharacter, sampleCharacter } from './defaults';
import type { GrantSpec } from './catalog/schema';
import { castAbOf, removeChip, grantChips, addGrants, findUnlinked, removalChain, removalSummary, normalize, mergedDefenses, removeRef, modeSpeed, effScore, armorClass, longRest, activeAuras, preparedCount, saveMod, spellUsable } from './logic';
import { migrate } from './migrate';
import { inactiveReason, isActive } from './links';
import type { Character, Grant, Item, Spell } from './types';
import { AOP, haAura, holyAvenger, paladin, withClass, make, ac, it_ } from './test-fixtures';

describe('grants and links', () => {
  describe('adding grants', () => {
    const custom = (c: Character, id = 'fx'): Character => ({ ...c, feats: [...c.feats, { id, g: 'other', name: 'Custom Gift', desc: '' }] });
    const spec = (p: Partial<GrantSpec> & Pick<GrantSpec, 'kind'>): Omit<GrantSpec, 'opt'> => ({ id: 'g-' + p.kind, name: 'G ' + p.kind, ...p } as Omit<GrantSpec, 'opt'>);
    const LISTS = ['senses', 'defenses', 'res', 'spells', 'grants'] as const;
    it('puts each grant in its list with the source set, and removing the source takes them back', () => {
      const c = custom(make());
      const n = addGrants(c, 'feature:fx', [
        { spec: spec({ kind: 'sense', name: 'Tremorsense 30 ft', range: '30' }) },
        { spec: spec({ kind: 'defense', def: 'res', target: 'Cold' }) },
        { spec: spec({ kind: 'resource', name: 'Gift', max: '2', recharge: 'long' }) },
        { spec: spec({ kind: 'spell', name: 'Bless', spell: 'spell/bless' }), spell: { name: 'Bless', lvl: 1, time: 'Action', range: '30 ft' } },
        { spec: spec({ kind: 'abil', ab: 'wis', val: '1', cap: 20 }) },
        { spec: spec({ kind: 'action', econ: 'bonus', res: 'g-resource' }) }
      ]);
      expect(n.senses.at(-1)).toMatchObject({ name: 'Tremorsense', range: '30 ft', from: 'feature:fx', srcKind: 'other' });
      expect(n.defenses.at(-1)).toMatchObject({ kind: 'res', name: 'Cold', from: 'feature:fx' });
      const gift = n.res.at(-1)!;
      expect(gift).toMatchObject({ name: 'Gift', max: 2, count: 2, recharge: 'long', from: 'feature:fx' });
      expect(n.spells.at(-1)).toMatchObject({ name: 'Bless', lvl: 1, from: 'feature:fx', prep: false });
      const added = n.grants.slice(c.grants.length);
      expect(added.map((g) => [g.kind, g.from])).toEqual([['abil', 'feature:fx'], ['action', 'feature:fx']]);
      expect(added[1].res).toBe(gift.id);
      expect(effScore(n, 'wis')).toBe(15);
      const back = removeRef(n, { kind: 'feature', id: 'fx' });
      for (const k of LISTS) expect(back[k]).toEqual(c[k]);
    });
    it('links an entry the character already has instead of adding a second (Resourceful)', () => {
      const c = custom(make({ res: [{ id: 'hi', name: 'Heroic Inspiration', count: 1, max: 1, recharge: 'long' }] }), 'rs');
      expect(findUnlinked(c, 'resource', 'heroic inspiration')).toBe('hi');
      const linked = addGrants(c, 'feature:rs', [{ spec: spec({ kind: 'resource', name: 'Heroic Inspiration', max: '1', recharge: 'long' }), link: 'hi' }]);
      expect(linked.res).toEqual([{ id: 'hi', name: 'Heroic Inspiration', count: 1, max: 1, recharge: 'long', from: 'feature:rs', srcKind: 'other', linked: true }]);
      expect(addGrants(c, 'feature:rs', [{ spec: spec({ kind: 'resource', name: 'Heroic Inspiration', max: '1', recharge: 'long' }) }]).res).toHaveLength(2);
      const sum = removalSummary(linked, { kind: 'feature', id: 'rs' });
      expect(sum.keep).toEqual(['Heroic Inspiration stays (it was on the sheet before Custom Gift)']);
      const back = removeRef(linked, { kind: 'feature', id: 'rs' });
      expect(back.res).toEqual([{ id: 'hi', name: 'Heroic Inspiration', count: 1, max: 1, recharge: 'long' }]);
      const made = addGrants(c, 'feature:rs', [{ spec: spec({ kind: 'resource', name: 'Heroic Inspiration', max: '1', recharge: 'long' }) }]);
      expect(removeRef(made, { kind: 'feature', id: 'rs' }).res).toEqual(c.res);
    });
    it('a linked spell keeps its resources and its Concentration when the source goes', () => {
      const c = custom(make({ conc: { id: 'sp4', name: 'Hunter’s Mark' }, res: [{ id: 'mine', name: 'Mine', count: 1, from: 'spell:sp4' }] }), 'fe');
      const n = addGrants(c, 'feature:fe', [{ spec: spec({ kind: 'spell', name: 'Hunter’s Mark', spell: 'spell/hunters-mark', always: true }), link: 'sp4' }]);
      expect(n.spells.find((x) => x.id === 'sp4')).toMatchObject({ from: 'feature:fe', linked: true });
      const r = removeRef(n, { kind: 'feature', id: 'fe' });
      expect(r.spells.find((x) => x.id === 'sp4')!.from).toBeUndefined();
      expect(r.res.map((x) => x.id)).toEqual(['mine']);
      expect(r.conc).toEqual({ id: 'sp4', name: 'Hunter’s Mark' });
    });
    it('a spell granted from a level gates the spell and its free cast, not the spell level', () => {
      const c = custom(withClass(make({ spells: [], res: [] }), { lvl: 2 }), 'el');
      const n = addGrants(c, 'feature:el', [
        { spec: spec({ kind: 'spell', id: 'ls', name: 'Longstrider', spell: 'spell/longstrider', lvl: 3, always: true }), spell: { name: 'Longstrider', lvl: 1, time: 'Action', range: 'Touch' } },
        { spec: spec({ kind: 'resource', name: 'Longstrider', max: '1', recharge: 'long', casts: 'ls' }) }]);
      expect(n.spells[0]).toMatchObject({ lvl: 1, minLvl: 3, always: true });
      expect(n.res[0]).toMatchObject({ minLvl: 3, casts: n.spells[0].id });
      expect([isActive(n, n.spells[0]), isActive(n, n.res[0])]).toEqual([false, false]);
    });
    it('a granted spell without always is unprepared, and stays so on load', () => {
      const n = addGrants(custom(make()), 'feature:fx', [{ spec: spec({ kind: 'spell', name: 'Bless', spell: 'spell/bless' }), spell: { name: 'Bless', lvl: 1, time: 'Action', range: '30 ft' } }]);
      expect(migrate(n).spells.at(-1)!.prep).toBe(false);
    });
    it('a maximum of 0 is a formula; a whole number is a number', () => {
      const add = (max: string) => addGrants(custom(make({ res: [] })), 'feature:fx', [{ spec: spec({ kind: 'resource', name: 'R', max, recharge: 'long' }) }]).res[0];
      expect(add('0')).toMatchObject({ maxV: '0', count: 0 });
      expect(add('0').max).toBeUndefined();
      expect(add('3')).toMatchObject({ max: 3, count: 3 });
    });
    it('resolves a free cast to the spell of the batch, a linked spell or an existing one', () => {
      const c = custom(make({ res: [] }), 'fe');
      const hmSpec = { spec: spec({ kind: 'spell', id: 'hm', name: 'Hunter’s Mark', spell: 'spell/hunters-mark', always: true }), spell: { name: 'Hunter’s Mark', lvl: 1, time: 'Bonus Action', range: '90 ft' } };
      const fav = { spec: spec({ kind: 'resource', id: 'fav', name: 'Favored Enemy', max: '1:2,5:3', recharge: 'long', casts: 'spell/hunters-mark' }) };
      const a = addGrants(c, 'feature:fe', [hmSpec, fav]);
      expect(a.res[0].casts).toBe(a.spells.at(-1)!.id);
      const b = addGrants(c, 'feature:fe', [{ ...hmSpec, link: 'sp4' }, fav]);
      expect(b.res[0].casts).toBe('sp4');
      const d = addGrants(c, 'feature:fe', [{ spec: spec({ kind: 'resource', name: 'X', max: '1', recharge: 'long', casts: 'spell/nothing' }) }]);
      expect(d.res[0].casts).toBeUndefined();
      const e = addGrants(c, 'feature:fe', [{ spec: spec({ kind: 'resource', name: 'X', max: '1', recharge: 'long', casts: 'sp5' }) }]);
      expect(e.res[0].casts).toBe('sp5');
    });
    it('a second copy of a spell is still possible', () => {
      const c = custom(make());
      expect(findUnlinked(c, 'spell', 'cure wounds')).toBe('sp5');
      expect(findUnlinked(c, 'spell', 'guidance')).toBeNull(); // Magic Initiate's: already linked
      const n = addGrants(c, 'feature:fx', [{ spec: spec({ kind: 'spell', name: 'Cure Wounds', spell: 'spell/cure-wounds' }), spell: { name: 'Cure Wounds', lvl: 1, time: 'Action', range: 'Touch' } }]);
      expect(n.spells.filter((x) => x.name === 'Cure Wounds')).toHaveLength(2);
    });
  });
  describe('a catalog spell', () => {
    const sp: Omit<Spell, 'id'> = { name: 'Goodberry', lvl: 1, time: 'Action', range: 'Self', prep: true, cid: 'spell/goodberry' };
    const c = { ...blankCharacter(), feats: [{ id: 'f1', g: 'feat' as const, name: 'Magic Initiate (Druid)', desc: '' }] };
    it('an always-prepared spell keeps no prep flag', () => {
      const out = addGrants(c, 'feature:f1', [{ spec: { id: 'g2', kind: 'spell', name: 'Level 1 spell', spell: 'spell/goodberry', always: true }, spell: sp }]);
      expect(out.spells[0].always).toBe(true);
      expect('prep' in out.spells[0]).toBe(false);
    });
  });
  describe('a free cast finds its spell', () => {
    const cast = { id: 'g1', kind: 'resource' as const, name: 'Misty Step (free casts)', max: '1', recharge: 'long' as const, casts: 'spell/misty-step' };
    const misty = { id: 's1', cid: 'spell/misty-step', name: 'Misty Step', lvl: 2, time: 'Bonus Action', range: '30 ft', prep: true };
    it('links a sheet spell by its catalog id; a batch spell with the same id still wins', () => {
      expect(addGrants({ ...blankCharacter(), spells: [misty] }, 'feature:f1', [{ spec: cast }]).res[0].casts).toBe('s1');
      const out = addGrants({ ...blankCharacter(), spells: [misty] }, 'feature:f1', [{ spec: { id: 'g0', kind: 'spell', name: 'Misty Step', spell: 'spell/misty-step' } }, { spec: cast }]);
      expect(out.res[0].casts).toBe(out.spells[out.spells.length - 1].id);
      expect(out.res[0].casts).not.toBe('s1');
    });
  });
  describe('casting grants', () => {
    const feat = { id: 'f', g: 'class' as const, name: 'Spellcasting', desc: '' };
    const casting = { id: 'g', kind: 'casting' as const, name: 'Spellcasting', ab: 'int', list: 'wizard' };
    it('sets the casting ability from a casting grant', () => {
      const none = addGrants({ ...blankCharacter(), feats: [feat] }, 'feature:f', [{ spec: casting }]);
      expect(none.castAb).toBe('int');
      const wis = addGrants({ ...blankCharacter(), castAb: 'wis', feats: [feat] }, 'feature:f', [{ spec: casting }]);
      expect(wis.castAb).toBe('wis');
      expect(grantChips(none, 'feature:f')[0].label).toContain('set slots by hand');
    });
    it('says the casting ability stays when its grant is removed', () => {
      const none = addGrants({ ...blankCharacter(), feats: [feat] }, 'feature:f', [{ spec: casting }]);
      expect(removalSummary(none, { kind: 'feature', id: 'f' }).keep).toEqual(['Spellcasting ability stays Intelligence; change it in Edit details']);
    });
  });
  describe('links keep what they promise', () => {
    const feat = { id: 'f', g: 'class' as const, name: 'Domain', desc: '' };
    const bless: Spell = { id: 'b', name: 'Bless', lvl: 1, time: 'Action', range: '30 ft', prep: false };
    const base = (sp: Spell, p: Partial<Character> = {}): Character => ({ ...blankCharacter(), castAb: 'wis', usePrep: true, feats: [feat], spells: [sp], ...p });
    const link = (c: Character, spec: Partial<GrantSpec>) => addGrants(c, 'feature:f', [{ spec: { id: 'g', kind: 'spell', name: 'Bless', ...spec } as GrantSpec, link: c.spells[0].id }]);
    it('a linked always-prepared grant makes the spell always prepared (PHB p.235)', () => {
      const c = link(base(bless), { always: true });
      expect(c.spells[0].always).toBe(true);
      expect(spellUsable(c, c.spells[0])).toBe(true);
      const prepared = base({ ...bless, prep: true });
      expect(preparedCount(prepared)).toBe(1);
      expect(preparedCount(link(prepared, { always: true }))).toBe(0);
    });
    it('a linked grant sets the casting ability', () => {
      const light: Spell = { id: 'l', name: 'Light', lvl: 0, time: 'Action', range: 'Touch' };
      const c = link(base(light), { castAb: 'cha' });
      expect(castAbOf(c, c.spells[0])).toBe('cha');
    });
    it('removing the feature restores the spell', () => {
      const gone = (c: Character) => removeRef(c, { kind: 'feature', id: 'f' }).spells[0];
      const a = gone(link(base(bless), { always: true, castAb: 'cha' }));
      expect(a).toEqual(bless);
      const own = gone(link(base({ ...bless, castAb: 'int' }), { castAb: 'cha' }));
      expect(own.castAb).toBe('int');
      expect(own).not.toHaveProperty('linkCastAb');
      const already = gone(link(base({ ...bless, always: true }), { always: true }));
      expect(already.always).toBe(true);
    });
    it('the link fields survive save and reload', () => {
      const c = link(base(bless), { always: true, castAb: 'cha' });
      const back = migrate(JSON.parse(JSON.stringify(c)));
      expect(back.spells[0]).toMatchObject({ linkAlways: true, linkCastAb: 'none' });
      const bad = JSON.parse(JSON.stringify(c));
      bad.spells[0].linkCastAb = 'x';
      expect(migrate(bad).spells[0]).not.toHaveProperty('linkCastAb');
    });
    it('removing a linked chip drops only the link', () => {
      const ki = { id: 'k', name: 'Ki', count: 3, max: 5, recharge: 'long' as const };
      const c: Character = addGrants({ ...base(bless), res: [ki] }, 'feature:f', [{ spec: { id: 'g', kind: 'resource', name: 'Ki' } as GrantSpec, link: 'k' }]);
      const after = removeChip(c, { kind: 'res', id: 'k' });
      expect(after.res).toEqual([ki]);
      const sp = link(base(bless), { always: true });
      expect(removeChip(sp, { kind: 'spell', id: 'b' }).spells).toEqual([bless]);
    });
    it('removing an unlinked chip removes the entry', () => {
      const c: Character = { ...base(bless), senses: [{ id: 's', name: 'Darkvision', range: '60 ft', from: 'feature:f' }] };
      expect(removeChip(c, { kind: 'sense', id: 's' }).senses).toEqual([]);
    });
    it('words counted speeds by their own kind', () => {
      const c: Character = { ...base(bless), speedBase: 35, speeds: { climb: 30, swim: 0, fly: 60, burrow: 0 } };
      const keep = (g: Partial<Grant>) => removalSummary({ ...c, grants: [{ id: 'g', kind: 'speed', name: 'X', counted: true, from: 'feature:f', ...g } as Grant] }, { kind: 'feature', id: 'f' }).keep[0];
      expect(keep({ mode: 'walk', val: '5' })).toBe('Speed 35 ft still includes +5 ft from Domain; lower it by hand');
      expect(keep({ mode: 'climb', val: 'walk' })).toBe('Climb 30 ft still includes this grant');
      expect(keep({ mode: 'fly', val: '60' })).toBe('Fly 60 ft still includes this grant');
      expect(keep({ mode: 'walk', val: 'walk2' })).toBe('Speed 35 ft still includes the doubling from Domain; lower it by hand');
    });
  });
  describe('removal cascade', () => {
    // Ilyra: Guide (f20) → Magic Initiate (f9) → Guidance, Produce Flame, Goodberry and Goodberry's free cast.
    it('removes everything whose chain leads to the source, and ends Concentration on it', () => {
      const c = make({ conc: { id: 'sp2', name: 'Guidance' } });
      const r = removeRef(c, { kind: 'feature', id: 'f20' });
      expect(r.feats.some((f) => f.id === 'f20' || f.id === 'f9')).toBe(false);
      expect(r.spells.some((x) => ['sp2', 'sp3', 'sp8'].includes(x.id))).toBe(false);
      expect(r.res.some((x) => x.id === 'fc8')).toBe(false);
      expect(r.grants.some((g) => g.from === 'feature:f20')).toBe(false);
      expect(r.conc).toBeNull();
      expect(removalSummary(c, { kind: 'feature', id: 'f20' }).goes).toEqual(['Magic Initiate (Druid)', 'Stealth', 'Survival', 'Cartographer’s Tools', 'Guidance', 'Produce Flame', 'Goodberry', 'Goodberry']);
    });
    it('removing a spell keeps a feature’s resource that casts it, without casts', () => {
      const c = make({ res: [{ id: 'favored', name: 'Favored Enemy', count: 2, max: 3, recharge: 'long', from: 'feature:f2', casts: 'sp4' }] });
      expect(removeRef(c, { kind: 'spell', id: 'sp4' }).res).toEqual([{ id: 'favored', name: 'Favored Enemy', count: 2, max: 3, recharge: 'long', from: 'feature:f2' }]);
    });
    it('removing a resource clears an action grant that spends it, and empties its pills', () => {
      const c = make({ grants: [{ id: 'a', kind: 'action', name: 'Wild Shape', econ: 'bonus', res: 'favored', from: 'feature:f2' }] });
      const r = removeRef(c, { kind: 'res', id: 'favored' });
      expect(r.grants[0].res).toBeUndefined();
      expect(r.pills).toEqual(['hp', 'ac', '']);
      expect(migrate({ ...c, res: [] }).grants[0].res).toBeUndefined();
    });
    it('never hangs on a loop', () => {
      const c = make({ feats: [{ id: 'A', g: 'other', name: 'A', desc: '', from: 'feature:B' }, { id: 'B', g: 'other', name: 'B', desc: '', from: 'feature:A' },
        { id: 'S', g: 'other', name: 'S', desc: '', from: 'feature:S' }] });
      expect(removalChain(c, { kind: 'feature', id: 'A' })).toEqual([{ kind: 'feature', id: 'A' }, { kind: 'feature', id: 'B' }]);
      expect(removalChain(c, { kind: 'feature', id: 'S' })).toEqual([{ kind: 'feature', id: 'S' }]);
      expect(removeRef(c, { kind: 'feature', id: 'A' }).feats.map((f) => f.id)).toEqual(['S']);
    });
    it('lists the numbers a counted grant stays in', () => {
      const c = make({ grants: [{ id: 'g', kind: 'abil', name: 'DEX +2', ab: 'dex', val: '2', cap: 20, counted: true, from: 'feature:f10' },
        { id: 'h', kind: 'ac', name: 'Defense', acMode: 'bonus', val: '1', counted: true, from: 'feature:f10' }] });
      const keep = removalSummary(c, { kind: 'feature', id: 'f10' }).keep;
      expect(keep[0]).toBe('DEX 18 still includes +2 from Ability Score Improvement; lower it by hand');
      expect(keep[1]).toMatch(/^AC 16 still includes \+1 from Ability Score Improvement/);
    });
    it('removing an item empties its slot and removes its grants', () => {
      const s = make({ grants: [{ id: 'g', kind: 'ac', name: '+1 AC', acMode: 'bonus', val: '1', from: 'item:i9', needEq: true }] });
      const r = removeRef(s, { kind: 'item', id: 'i9' });
      expect(r.attuneIds).toEqual(['', '', '']);
      expect(r.grants).toEqual([]);
    });
  });
  describe('grantChips', () => {
    it('lists what a feature gives, with labels and where each lives', () => {
      const s = make();
      const c = { ...s, spells: s.spells.map((x) => (x.id === 'sp4' ? { ...x, from: 'feature:f2' } : x)),
        res: s.res.map((r) => (r.id === 'favored' ? { ...r, max: undefined, maxV: '1:2,5:3,9:4,13:5,17:6', from: 'feature:f2', casts: 'sp4' } : r)) };
      const chips = grantChips(c, 'feature:f2');
      expect(chips.map((x) => x.label)).toEqual(['Hunter’s Mark', '3 × Favored Enemy / Long Rest']);
      expect(chips.map((x) => x.target)).toEqual([{ tab: 'spells' }, { sec: 'sec-resources' }]);
      expect(chips.every((x) => x.active)).toBe(true);
    });
    it('labels every grant kind and marks counted and inactive ones', () => {
      const g = (p: Partial<Grant> & Pick<Grant, 'kind'>): Grant => ({ id: 'g' + p.kind, name: 'N ' + p.kind, from: 'item:i9', ...p } as Grant);
      const c = make({ senses: [{ id: 's', name: 'Darkvision', range: '60 ft', from: 'item:i9' }],
        defenses: [{ id: 'd', kind: 'res', name: 'Cold', from: 'item:i9' }, { id: 'e', kind: 'adv', name: 'vs Charmed', from: 'item:i9' }],
        grants: [g({ kind: 'abil', ab: 'wis', val: '1', cap: 20 }), g({ kind: 'prof', cat: 'skill', target: 'stealth' }),
          g({ kind: 'prof', name: 'Weapon Mastery: 2 kinds of weapons', cat: 'mastery', val: '2' }), g({ kind: 'speed', mode: 'walk', val: '5', counted: true }),
          g({ kind: 'speed', id: 'gc', mode: 'climb', val: 'walk' }), g({ kind: 'ac', acMode: 'bonus', val: '1', needEq: true }), g({ kind: 'init', val: '3' }),
          g({ kind: 'hpLvl', val: '2' }), g({ kind: 'xdmg', dice: '1d8', on: 'hit' })] });
      expect(grantChips(c, 'item:i9').map((x) => x.label)).toEqual(['Darkvision 60 ft', 'Resistance · Cold', 'Advantage · vs Charmed', '+1 WIS', 'Stealth',
        'Weapon Mastery: 2 kinds of weapons', 'Speed +5 ft (counted)', 'Climb = Speed', '+1 AC', 'Initiative +3', '+2 HP per level', 'N xdmg']);
      const off = { ...c, inv: c.inv.map((i) => (i.id === 'i9' ? { ...i, eq: false } : i)) };
      expect(grantChips(off, 'item:i9').find((x) => x.label === '+1 AC')).toMatchObject({ active: false, why: 'not equipped' });
    });
  });
});

describe('items', () => {
  describe('items inside a container never count as equipped', () => {
    const bag: Item = { id: 'bag', name: 'Bag of Holding', qty: 1, eq: false, xdim: true, cap: 500, wt: 5 };
    it('armorClass ignores armor, a Shield and a Ring of Protection inside the bag', () => {
      const inside = [
        bag,
        it_({ id: 'mail', name: 'Chain Mail', armor: 'heavy', acBase: 16, in: 'bag' }),
        it_({ id: 'sh', name: 'Shield', armor: 'shield', acBase: 2, in: 'bag' }),
        it_({ id: 'ring', name: 'Ring of Protection', attune: true, in: 'bag' })
      ];
      const ring: Grant = { id: 'g', kind: 'ac', name: 'Ring of Protection', acMode: 'bonus', val: '1', from: 'item:ring', needEq: true, needAtt: true };
      const c = ac({ abil: { ...sampleCharacter().abil, dex: 10 }, inv: inside, grants: [ring], attuneIds: ['ring', '', ''] });
      expect(c.total).toBe(10);
    });

    it('a resource granted by an item inside is inactive and keeps its count', () => {
      const c = make({ inv: [bag, it_({ id: 'wand', name: 'Wand', in: 'bag' })], res: [{ id: 'r', name: 'Wand charges', count: 3, max: 7, recharge: 'dawn', from: 'item:wand', srcKind: 'item', needEq: true }] });
      expect(isActive(c, c.res[0])).toBe(false);
      expect(normalize(c).res[0].count).toBe(3);
    });
  });
  describe('a quantity 0 item counts as gone', () => {
    const dex14 = { ...blankCharacter(), abil: { ...blankCharacter().abil, dex: 14 }, profs: [{ id: 'p', cat: 'armor' as const, name: 'Shields' }, { id: 'h', cat: 'armor' as const, name: 'Heavy armor' }] };
    it('adds no AC from armor or a Shield', () => {
      const inv: Item[] = [{ id: 'a', name: 'Plate Armor', qty: 0, eq: true, armor: 'heavy', acBase: 18 }, { id: 's', name: 'Shield', qty: 0, eq: true, armor: 'shield', acBase: 2 }];
      expect(armorClass({ ...dex14, inv }).total).toBe(12);
    });
    it('unloads ammunition that ran out', () => {
      const bow: Item = { id: 'b', name: 'Longbow', qty: 1, eq: true, cat: 'weapon', props: 'ammunition', ammo: '150/600;arrow', load: 'x' };
      const arrows: Item = { id: 'x', name: '+2 Arrows', qty: 3, eq: false, cat: 'ammo', cid: 'item/arrows' };
      expect(normalize({ ...dex14, inv: [bow, arrows] }).inv[0].load).toBe('x');
      expect(normalize({ ...dex14, inv: [bow, { ...arrows, qty: 0 }] }).inv[0].load).toBeUndefined();
    });
  });
  describe('a drunk potion', () => {
    const potion = (over = {}, grant = {}) => ({ ...blankCharacter(), speedBase: 30, effectsOn: ['item:p'],
      inv: [{ id: 'p', name: 'Potion of Climbing', qty: 0, eq: false, ...over }],
      grants: [{ id: 'g', kind: 'speed', name: 'Climb', mode: 'climb', val: 'walk', when: 'active', from: 'item:p', ...grant }] }) as unknown as Character;
    it('keeps a drunk potion’s switched-on effect at quantity 0', () => {
      expect(modeSpeed(potion(), 'climb').base).toBe(30);
      const off = { ...potion(), effectsOn: [] };
      expect(modeSpeed(off, 'climb').base).toBe(0);
      expect(inactiveReason(off, off.grants[0])).toBe('none left');
    });
    it('still turns off what a switch doesn’t cover at quantity 0', () => {
      const plain = potion({}, { when: undefined });
      expect(inactiveReason(plain, plain.grants[0])).toBe('none left');
      const worn = potion({}, { needEq: true });
      expect(inactiveReason(worn, worn.grants[0])).toBe('not equipped');
      const bagged = potion({ in: 'b' });
      expect(inactiveReason(bagged, bagged.grants[0])).toMatch(/^in /);
    });
    it('ends a drunk potion’s effect on a Long Rest', () => {
      expect(modeSpeed(longRest(potion()), 'climb').base).toBe(0);
    });
  });
});

// Aura of Protection: a 10-ft Emanation from level 6, inactive while Incapacitated; Aura Expansion makes it 30 ft at
// level 18; Aura of Courage works only while in it (PHB p.111). Holy Avenger: while you hold the drawn weapon, 10 ft,
// 30 ft with 17+ Paladin levels (SRD 5.2.1). Class levels are read as character level (a stated simplification).

describe('auras', () => {
  it('runs Protection from level 6 at 10 ft, 30 ft at 18', () => {
    expect(activeAuras(paladin(6))).toEqual([expect.objectContaining({ range: 10, why: null })]);
    expect(activeAuras(paladin(18))[0].range).toBe(30);
  });
  it('lists no aura below its level, Unconscious or not', () => {
    expect(activeAuras(paladin(5))).toEqual([]);
    const ko = paladin(5, { conds: { Unconscious: true } });
    expect(activeAuras(ko)).toEqual([]);
    expect(inactiveReason(ko, ko.grants[0])).toBe('from level 6');
  });
  it('stops a looping needAura without overflowing', () => {
    const c = paladin(6);
    const loop = { ...c, grants: c.grants.map((g) => (g.id === 'g2' ? { ...g, needAura: AOP } : g)) };
    expect(inactiveReason(loop, loop.grants[1])).toBe('aura not active');
  });
  it('labels the aura chip and points it at Conditions', () => {
    const chip = grantChips(paladin(6), 'feature:p').find((x) => x.ref.id === 'g2')!;
    expect(chip.label).toBe('10-ft aura');
    expect(chip.target).toEqual({ sec: 'sec-conditions' });
  });
  for (const cond of ['Incapacitated', 'Unconscious', 'Stunned']) {
    it('stops the aura and what rides on it while ' + cond, () => {
      const on = paladin(10), off = paladin(10, { conds: { [cond]: true } });
      expect(activeAuras(off)).toEqual([expect.objectContaining({ why: 'Incapacitated' })]);
      expect(saveMod(on, 'wis')).toBe(saveMod(off, 'wis') + 3);
      expect(mergedDefenses(on, 'imm').map((d) => d.name)).toContain('Frightened');
      expect(mergedDefenses(off, 'imm').map((d) => d.name)).not.toContain('Frightened');
    });
  }
  it('needs the Holy Avenger-like item in hand', () => {
    const c = (level: number, hands: string[]) => (withClass({ ...blankCharacter(), inv: [holyAvenger()], attuneIds: ['ha', '', ''], hands, grants: [haAura] }, { lvl: level }));
    expect(inactiveReason(c(16, []), haAura)).toBe('not in hand');
    expect(activeAuras(c(16, ['ha']))[0].range).toBe(10);
    expect(activeAuras(c(17, ['ha']))[0].range).toBe(30);
  });
  it('runs a spell aura only while concentrating', () => {
    const sg = { id: 'sg', name: 'Guardians', lvl: 3, time: 'Action', range: 'Self', c: true };
    const g: Grant = { id: 'gs', kind: 'aura', name: 'Guardians', range: '15', when: 'active', from: 'spell:sg' };
    const c = { ...blankCharacter(), spells: [sg], grants: [g] };
    expect(activeAuras(c)).toEqual([]);
    expect(activeAuras({ ...c, conc: { id: 'sg', name: 'Guardians' } })).toHaveLength(1);
  });
  it('keeps needAura and needHand through addGrants', () => {
    const c = { ...blankCharacter(), feats: [{ id: 'f', g: 'class' as const, name: 'F', desc: '' }], inv: [holyAvenger()] };
    const a = addGrants(c, 'feature:f', [{ spec: { id: 'x', kind: 'defense', name: 'Frightened', def: 'imm', target: 'Frightened', needAura: AOP } }]);
    expect(a.defenses[0].needAura).toBe(AOP);
    const b = addGrants(c, 'item:ha', [{ spec: { id: 'y', kind: 'aura', name: 'A', range: '10', needHand: true } }]);
    expect(b.grants[0].needHand).toBe(true);
  });
});
