import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { RuleEntry } from '../catalog/schema';
import type { CatalogState } from '../catalog/useCatalog';
import { RuleNotesView } from './RuleNotes';

const rule = { id: 'rule/sap', kind: 'rule', name: 'Sap', src: 'srd', desc: 'Rule text.', cat: 'mastery' } as RuleEntry;
const cat = { list: [rule], byId: new Map([[rule.id, rule]]) };
const html = (state: CatalogState, pick = () => [rule]) => renderToString(<RuleNotesView state={state} pick={pick} />);

it('shows nothing until the catalog is ready, and no rule for an unknown name', () => {
  for (const state of [{ status: 'idle' }, { status: 'loading' }, { status: 'error', retry: () => {} }] as CatalogState[]) expect(html(state)).toBe('');
  expect(html({ status: 'ready', cat }, () => [])).toBe('');
});
it('shows each picked rule once the catalog is ready', () => {
  expect(html({ status: 'ready', cat })).toContain('Rule text.');
});
