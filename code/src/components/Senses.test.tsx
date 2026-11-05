import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { blankCharacter } from '../defaults';
import { Sheet } from '../sheet';
import type { Character } from '../types';
import { Senses } from './Senses';

const render = (c: Character) => renderToString(<Sheet.Provider value={{ c, update: () => {}, edit: false, form: null, setForm: () => {}, focus: null, reveal: () => {}, markFocusUsed: () => {} }}><Senses /></Sheet.Provider>);

// A closed row doesn't mount RuleNotes, so this only pins the rows; RuleNotes.test.tsx covers the catalog states.
it('renders known and typed sense rows', () => {
  const html = render({ ...blankCharacter(), senses: [{ id: 's', name: 'Darkvision', range: '60 ft' }, { id: 't', name: 'Keen Hearing', range: '—' }] });
  expect(html).toContain('Darkvision');
  expect(html).toContain('Keen Hearing');
});

it('makes each passive score a button that opens its breakdown', () => {
  const html = render(blankCharacter()).replace(/<!-- -->/g, '');
  for (const label of ['Passive Perception', 'Passive Investigation', 'Passive Insight']) expect(html).toMatch(new RegExp('<button[^>]*aria-expanded="false"[^>]*>(?:(?!</button>).)*' + label + '(?:(?!</button>).)*>10<'));
});
