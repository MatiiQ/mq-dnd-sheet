import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { blankCharacter } from '../defaults';
import { Sheet } from '../sheet';
import type { Character } from '../types';
import { Senses } from './Senses';

const render = (c: Character) => renderToString(<Sheet.Provider value={{ c, update: () => {}, edit: false, form: null, setForm: () => {} }}><Senses /></Sheet.Provider>);

// A closed row doesn't mount RuleNotes, so this only pins the rows; RuleNotes.test.tsx covers the catalog states.
it('renders a closed sense row without loading the catalog', () => {
  const html = render({ ...blankCharacter(), senses: [{ id: 's', name: 'Darkvision', range: '60 ft' }, { id: 't', name: 'Keen Hearing', range: '—' }] });
  expect(html).toContain('Darkvision');
  expect(html).toContain('Keen Hearing');
});
