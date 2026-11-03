import { expect, it } from 'vitest';
import { GRANT_KINDS } from './GrantEditor';

// The form can't fill in what a Spellcasting grant needs; it comes from the catalog only.
it('offers no Spellcasting grant in the form', () => {
  expect(GRANT_KINDS.map(([k]) => k)).not.toContain('casting');
});
