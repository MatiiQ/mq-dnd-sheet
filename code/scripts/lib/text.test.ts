import { expect, it } from 'vitest';
import { normText } from './text.ts';

it('normalises case, whitespace, curly quotes and JSON escapes', () => {
  expect(normText('The  Fox’s\n“Den”')).toBe('the fox\'s "den"');
  expect(normText('the fox\\u2019s \\"den\\"')).toBe(normText('The  Fox’s\n“Den”'));
});
