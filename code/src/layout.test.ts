import { describe, expect, it } from 'vitest';
import { isWide } from './layout';

describe('layout mode', () => {
  it('follows the screen in auto, and overrides it otherwise', () => {
    expect(isWide('auto', true)).toBe(true);
    expect(isWide('auto', false)).toBe(false);
    expect(isWide('one', true)).toBe(false);
    expect(isWide('two', false)).toBe(true);
  });
});
