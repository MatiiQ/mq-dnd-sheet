// @vitest-environment happy-dom
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from '../catalog/merge';
import type { ChoiceSpec, ClassEntry, Entry, GrantSpec } from '../catalog/schema';
import { creatorScreens, replaySteps, type CreatorAnswers } from '../creator';
import { label, mount, tap, type, unmount } from '../test-dom';
import { Bonus, ClassTiles, Equipment, Languages, OriginChoice, Scores, type ScreenProps } from './CreatorScreens';

const skills: ChoiceSpec = { kind: 'choice', id: 'skills', name: 'Skills', pick: 2, pool: 'skill:arcana|history|insight' };
const wizard: ClassEntry = { id: 'class/wizard', kind: 'class', name: 'Wizard', src: 'srd', desc: '', hd: 6, saves: 'int,wis', skills, armor: '', weapons: '', castAb: 'int',
  primary: 'int', blurb: 'A scholar of spells.', equipA: 'Rope', gpB: 55 };
const fighter: ClassEntry = { ...wizard, id: 'class/fighter', name: 'Fighter', hd: 10, castAb: undefined, primary: 'str|dex', blurb: 'A weapon master.', likes: 'Weapons', complexity: 'Low' };
const abil = (id: string, ab: 'int' | 'wis' | 'cha'): GrantSpec => ({ id, kind: 'abil', name: ab.toUpperCase() + ' +1', ab, val: '1', cap: 20 });
const mi: Entry = { id: 'feat/mi', kind: 'feat', name: 'Magic Initiate', src: 'srd', desc: '', cat: 'origin', grants: [
  { kind: 'choice', id: 'ab', name: 'Spellcasting ability', pick: 1, pool: 'ability:int|wis|cha' },
  { id: 'g1', kind: 'spell', name: 'Light', spell: 'Light', castAb: '$ab' }] } as Entry;
const sage: Entry = { id: 'background/sage', kind: 'background', name: 'Sage', src: 'srd', desc: '', feat: 'feat/mi', equip: '', equipA: 'Book', gpB: 50,
  grants: [{ kind: 'choice', id: 'abil', name: 'Ability scores', pick: 3, repeat: true, options: [abil('o1', 'int'), abil('o2', 'wis'), abil('o3', 'cha')] }] } as Entry;
const lang = (name: string) => ({ id: 'prof/' + name.toLowerCase(), kind: 'prof', name, src: 'srd', desc: '', cat: 'language' } as Entry);
const cat = mergeCatalog([wizard, fighter, mi, sage, lang('Common'), lang('Elvish'), lang('Dwarvish'), lang('Abyssal')], null);
const A = (p: Partial<CreatorAnswers> = {}): CreatorAnswers => ({ cls: 'class/wizard', start: 1, background: 'background/sage', bgFlow: {}, spFlow: {}, skills: [], languages: [],
  method: 'array', scores: { str: 8, dex: 12, con: 13, int: 15, wis: 14, cha: 10 }, details: { name: '', align: '', appearance: '', notes: '' }, first: { flows: {}, spells: {} }, levels: [], ...p });
const withAbil = (picks?: string[]) => A({ bgFlow: picks ? { '': { picks: { abil: picks }, counted: {}, links: {} } } : {} });
// Renders a screen holding the answers in state; `seen` follows them.
let seen: CreatorAnswers;
function render(Screen: (p: ScreenProps) => ReactNode, a: CreatorAnswers, set?: (f: (x: CreatorAnswers) => CreatorAnswers) => void) {
  function H() {
    const [x, setX] = useState(a);
    seen = x;
    return <Screen cat={cat} a={x} set={set ?? setX} r={replaySteps(cat, x, { fill: true })} />;
  }
  mount(<H />);
}
const tile = (t: string) => [...document.querySelectorAll('.tile-pick')].find((b) => b.textContent?.startsWith(t));

describe('creator screens', () => {
  it("an older draft's rare language takes no slot: a Standard Language can still be picked", () => {
    render(Languages, A({ languages: ['Abyssal', 'Elvish'] }));
    expect(tile('Abyssal')).toBeUndefined();
    expect(document.body.textContent).toContain('1 of 2 chosen');
    tap(tile('Dwarvish'));
    expect(seen.languages).toEqual(['Elvish', 'Dwarvish']);
    expect(creatorScreens(cat, seen, { fill: true }).screens.find((s) => s.key === 'origin/languages')!.ready).toBe(true);
  });
  it('class tile shows likes and complexity from the pack, else the blurb', () => {
    render(ClassTiles, A({ cls: '' }));
    expect(tile('Fighter')!.textContent).toContain('Likes Weapons · Low complexity');
    expect(tile('Wizard')!.textContent).toContain('A scholar of spells.');
    expect(tile('Wizard')!.textContent).toContain('d6 · Primary: Intelligence · Saves: INT, WIS');
    tap(tile('Fighter'));
    expect(seen.cls).toBe('class/fighter');
  });
  it('scores: select and tile show base score and modifier with the bonus unanswered, partly and fully answered', () => {
    for (const picks of [undefined, ['o1', 'o1'], ['o1', 'o1', 'o2']]) {
      render(Scores, withAbil(picks));
      expect((label('Intelligence score') as HTMLSelectElement).value).toBe('15');
      expect(document.body.textContent).toContain('Modifier +2');
      expect(document.body.textContent).toContain('before your background bonus');
      expect(document.body.textContent).not.toContain('16');
      unmount();
    }
  });
  it('a draft score not in the pool shows an empty select', () => {
    render(Scores, A({ scores: { str: 9, dex: 12, con: 13, int: 15, wis: 14, cha: 10 } }));
    expect((label('Strength score') as HTMLSelectElement).value).toBe('');
  });
  it('choosing a held value swaps the two scores', () => {
    render(Scores, A());
    const sel = label('Strength score') as HTMLSelectElement;
    sel.value = '15';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect([seen.scores.str, seen.scores.int]).toEqual([15, 8]);
  });
  it('six totals: partial or out-of-range typing changes nothing and shows the hint', () => {
    const set = vi.fn();
    render(Scores, A({ method: 'rolled', scores: {} }), set);
    type(label('Six totals'), '15 14 1');
    type(label('Six totals'), '15 14 13 12 10 19');
    expect(set).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Six totals from 3 to 18');
    type(label('Six totals'), '15 14 13 12 10 9');
    expect(set).toHaveBeenCalledTimes(1);
  });
  it('bonus screen final scores follow a half-answered "+2 and +1" without temporary +1s', () => {
    render(Bonus, withAbil(['o1', 'o1']));
    expect(document.body.textContent).toContain('Background bonus (Sage: INT, WIS, CHA)');
    const finals = () => [...document.querySelectorAll('.well strong')].map((x) => x.textContent);
    expect(finals()).toEqual(['8', '12', '13', '17', '14', '10']);
    tap([...document.querySelectorAll('.tile-pick')].filter((b) => b.textContent === '+1')[1]);
    expect(seen.bgFlow[''].picks.abil).toEqual(['o1', 'o1', 'o2']);
    expect(finals()).toEqual(['8', '12', '13', '17', '15', '10']);
    tap(tile('+1 to all three'));
    expect(seen.bgFlow[''].picks.abil).toEqual(['o1', 'o2', 'o3']);
  });
  it('Equipment: an old none shows the class group\'s None selected', () => {
    render(Equipment, A({ equip: 'none' }));
    expect(document.body.textContent).toContain('You get both: your class’s and your background’s (PHB p.36).');
    const group = document.querySelector('[aria-label="Wizard starting equipment"]')!;
    expect([...group.querySelectorAll('.tile-pick')].find((b) => b.textContent?.startsWith('None'))!.getAttribute('aria-pressed')).toBe('true');
    expect(document.body.textContent).toContain('Gold only (55 GP)');
  });
  it('Magic Initiate in Origin: the spellcasting ability hint names the class', () => {
    const a = A();
    const s = creatorScreens(cat, a, { fill: true }).screens.find((x) => x.key === 'origin/bg/>feat/mi/ab')!;
    expect(s).toBeTruthy();
    const body = s.body as Extract<typeof s.body, { kind: 'origin-choice' }>;
    function H() {
      const [x, setX] = useState(a);
      seen = x;
      return <OriginChoice cat={cat} a={x} set={setX} r={replaySteps(cat, x, { fill: true })} source="bg" step={body.step} c={body.c} />;
    }
    mount(<H />);
    expect(document.body.textContent).toContain('Your Wizard casts with Intelligence.');
    expect(seen.bgFlow['>feat/mi'].picks.ab).toEqual(['int']);
  });
});
