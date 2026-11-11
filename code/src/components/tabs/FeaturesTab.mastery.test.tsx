// @vitest-environment happy-dom
// The Weapon Mastery line on the Features tab (spec 2026-11-10 §2.7): its own file, because it switches the catalog from
// loading to ready (sheet-ui.test.tsx mocks it as always ready).
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import srdEntries from '../../data/srd/index';
import { mergeCatalog } from '../../catalog/merge';
import { useCatalog } from '../../catalog/useCatalog';
import App from '../../App';
import { blankCharacter } from '../../defaults';
import { btn, mount, tap } from '../../test-dom';
import { withClasses } from '../../test-fixtures';
import type { Character, Feature, Grant } from '../../types';
import { firstMasteryFeature } from './FeaturesTab';

vi.mock('../../catalog/useCatalog', () => ({ useCatalog: vi.fn(() => ({ status: 'loading' })) }));
const ready = { status: 'ready', cat: mergeCatalog(srdEntries, null) };

const wm = (id: string): Feature => ({ id, g: 'class', name: 'Weapon Mastery ' + id, desc: 'Use weapon masteries.' });
const slots = (from: string, p: Partial<Grant> = {}): Grant => ({ id: 'g' + from, kind: 'prof', name: 'Weapon Mastery', cat: 'mastery', val: '2', from: 'feature:' + from, ...p });
const sheet = (p: Partial<Character> = {}): Character => ({
  ...withClasses(blankCharacter(), [{ name: 'Fighter', lvl: 1 }, { name: 'Barbarian', lvl: 1 }]),
  tab: 'features', mastery: ['greataxe'], feats: [wm('a'), wm('b')], grants: [slots('a'), slots('b')], ...p
});
const renderSheet = (c: Character) => {
  localStorage.setItem('dnd-index-v3', JSON.stringify({ active: 'x', list: [{ id: 'x', name: 'Test' }] }));
  localStorage.setItem('dnd-sheet-v3:x', JSON.stringify(c));
  mount(<App />);
};
const row = (id: string) => document.getElementById('feat-' + id)!;
const toggle = (id: string) => tap(row(id).querySelector('.entry-head'));

beforeEach(() => { localStorage.clear(); vi.mocked(useCatalog).mockReturnValue({ status: 'loading' } as never); });

describe('Weapon Mastery line on the feature', () => {
  it('shows the titled kind while loading, the mastery once ready, on the first feature only', () => {
    renderSheet(sheet());
    expect(row('a').textContent).not.toContain('Chosen:');
    toggle('a');
    expect(row('a').textContent).toContain('Chosen: Greataxe');
    expect(row('a').textContent).not.toContain('(Cleave)');
    act(() => { vi.mocked(useCatalog).mockReturnValue(ready as never); });
    toggle('a'); toggle('a');
    expect(row('a').textContent).toContain('Chosen: Greataxe (Cleave)');
    toggle('b');
    expect(row('b').textContent).not.toContain('Chosen:');
  });
  it('none chosen offers a jump to Actions', () => {
    renderSheet(sheet({ mastery: [] }));
    toggle('a');
    expect(row('a').textContent).toContain('None chosen');
    tap(btn('Choose in Actions'));
    expect(JSON.parse(localStorage.getItem('dnd-sheet-v3:x')!).tab).toBe('actions');
  });
  it('a feature whose slots wait for a later level is skipped', () => {
    const c = sheet({ feats: [wm('z'), wm('a')], grants: [slots('z', { minLvl: 5 }), slots('a')] });
    expect(firstMasteryFeature(c)).toBe('a');
    renderSheet(c);
    toggle('z');
    expect(row('z').textContent).not.toContain('Chosen:');
  });
});
