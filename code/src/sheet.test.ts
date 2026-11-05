import { describe, expect, it } from 'vitest';
import { formAfterTabChange } from './sheet';

describe('formAfterTabChange', () => {
  it('closes a form that lives in a tab', () => {
    for (const kind of ['spell', 'item', 'feat', 'attack', 'rider', 'pick-spell', 'pick-item', 'pick-feat'] as const)
      expect(formAfterTabChange({ kind, id: 'x' })).toBeNull();
  });
  it('keeps a form in the left column open', () => {
    for (const kind of ['res', 'sense', 'acmod'] as const)
      expect(formAfterTabChange({ kind, id: null })).toEqual({ kind, id: null });
  });
});
