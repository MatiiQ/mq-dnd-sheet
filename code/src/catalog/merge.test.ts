import { describe, expect, it } from 'vitest';
import srdEntries from '../data/srd/index';
import { mergeCatalog, rekeyPack } from './merge';
import { catalogId, PHB_TO_SRD, slug, type BackgroundEntry, type Entry, type FeatEntry } from './schema';

// A minimal spell whose name slugs back to the id's last part, as the builders make it.
const entry = (id: string, src: 'srd' | 'phb'): Entry => ({ id, kind: 'spell', name: id.split('/').pop()!, src, desc: 'x', lvl: 1, school: 'Abjuration',
  classes: 'wizard', time: 'Action', range: 'Self', comp: 'V', dur: 'Instantaneous', conc: false, ritual: false, fx: 'other' });
const spellAlias = () => Object.entries(PHB_TO_SRD).find(([, s]) => srdEntries.some((e) => e.id === catalogId('spell', s)))!;

describe('mergeCatalog', () => {
  it('keeps the SRD entry unless the pack entry is marked to replace it', () => {
    const srd = [entry('spell/aid', 'srd'), entry('spell/bless', 'srd')];
    expect(mergeCatalog(srd, [entry('spell/aid', 'phb')]).byId.get('spell/aid')!.src).toBe('srd');
    expect(mergeCatalog(srd, [{ ...entry('spell/aid', 'phb'), replace: true }]).byId.get('spell/aid')!.src).toBe('phb');
    expect(mergeCatalog(srd, null).list).toHaveLength(2);
  });
  it('lists entries by kind, then name', () => {
    const feat = { id: 'feat/alert', kind: 'feat', name: 'Alert', src: 'srd', desc: 'x', cat: 'origin', grants: [] } as Entry;
    expect(mergeCatalog([entry('spell/bless', 'srd'), feat, entry('spell/aid', 'srd')], null).list.map((e) => e.id)).toEqual(['feat/alert', 'spell/aid', 'spell/bless']);
  });
  it('re-keys a pack built before an alias existed, so the entry is not listed twice', () => {
    const [phb, srdName] = spellAlias();
    const stale = { ...entry('spell/' + slug(phb), 'phb'), name: phb }; // id from a build without the alias
    const srd = [{ ...entry(catalogId('spell', srdName), 'srd'), name: srdName }];
    const cat = mergeCatalog(srd, [stale]);
    expect(cat.list).toHaveLength(1);
    expect(cat.byId.has('spell/' + slug(phb))).toBe(false);
  });
  it('re-keys references to an aliased spell inside pack entries', () => {
    const [phb, srdName] = spellAlias();
    const old = 'spell/' + slug(phb); // the id an older pack build used
    const feat = { id: 'feat/star-gazer', kind: 'feat', name: 'Star Gazer', src: 'phb', desc: 'x', cat: 'general', grants: [ // invented entry
      { id: 'g1', kind: 'spell', name: phb, spell: old },
      { id: 'g2', kind: 'resource', name: 'Free cast', max: '1', recharge: 'long', casts: old },
      { kind: 'choice', id: 'c1', name: 'Spell', pick: 1, options: [{ id: 'o1', kind: 'spell', name: phb, spell: old }] },
      { id: 'g3', kind: 'spell', name: 'Chosen', spell: '$c1' }] } as Entry;
    const bg = { ...entry('background/stargazer', 'phb'), kind: 'background', name: 'Stargazer', feat: 'feat/star-gazer:wizard' } as unknown as Entry; // feat id kept with its option
    const [f, b] = rekeyPack([feat, bg]) as [FeatEntry, BackgroundEntry];
    const id = catalogId('spell', srdName);
    expect(f.grants).toMatchObject([{ spell: id }, { casts: id }, { options: [{ spell: id }] }, { spell: '$c1' }]);
    expect(b.feat).toBe('feat/star-gazer:wizard');
  });
  it('maps every alias to an SRD entry and never lists two aliases of one entry', () => {
    const ids = new Set(srdEntries.map((e) => e.id));
    expect(Object.keys(PHB_TO_SRD).length).toBeGreaterThan(0); // the Task 1 alias test now checks something
    for (const srdName of Object.values(PHB_TO_SRD)) expect(ids.has(catalogId('spell', srdName)) || ids.has(catalogId('item', srdName)) || ids.has(catalogId('feat', srdName))).toBe(true);
    expect(new Set(Object.values(PHB_TO_SRD)).size).toBe(Object.keys(PHB_TO_SRD).length);
  });
});
