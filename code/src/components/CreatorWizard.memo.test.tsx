// @vitest-environment happy-dom
// The creator's screen list is memoized on the catalog and the answers without the details (spec §2 "Performance"):
// its own file, so the creatorScreens spy affects nothing else.
import { act, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { mergeCatalog } from '../catalog/merge';
import type { ClassEntry, Entry } from '../catalog/schema';
import { creatorScreens, type CreatorAnswers } from '../creator';
import { mount, type } from '../test-dom';
import { CreatorWizard, NEW_ANSWERS } from './CreatorWizard';

vi.mock('../creator', async (orig) => { const m = await orig<typeof import('../creator')>(); return { ...m, creatorScreens: vi.fn(m.creatorScreens) }; });

const ranger: ClassEntry = { id: 'class/ranger', kind: 'class', name: 'Ranger', src: 'srd', desc: '', hd: 10, saves: 'str,dex', armor: '', weapons: '',
  skills: { kind: 'choice', id: 'skills', name: 'Skills', pick: 1, pool: 'skill:stealth|insight' } };
const entries: Entry[] = [ranger, { id: 'prof/common', kind: 'prof', name: 'Common', src: 'srd', desc: '', cat: 'language' } as Entry];
const answers: CreatorAnswers = { ...NEW_ANSWERS(), cls: 'class/ranger' };

describe('creatorScreens memo', () => {
  it('a new cat with the same answers recomputes; typing the name does not', () => {
    let swap = () => {};
    function H() {
      const [cat, setCat] = useState(() => mergeCatalog(entries, null));
      swap = () => setCat(mergeCatalog(entries, null));
      return <CreatorWizard cat={cat} initial={{ v: 1, step: 'details', answers }} onCreate={() => {}} onClose={() => {}} />;
    }
    mount(<H />);
    const calls = () => vi.mocked(creatorScreens).mock.calls.length;
    const before = calls();
    type(document.querySelector('input[type="text"]'), 'Thorin');
    expect(calls()).toBe(before);
    act(() => swap());
    expect(calls()).toBe(before + 1);
  });
});
