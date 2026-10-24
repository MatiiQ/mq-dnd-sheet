import { describe, expect, it } from 'vitest';
import { blankCharacter, sampleCharacter } from './defaults';
import { addToStore, freshList, switchStore, type Store } from './storage';

const renamed = (): Store => ({
  id: 'a', list: [{ id: 'a', name: 'Ilyra Moonbrook' }, { id: 'b', name: 'Other' }],
  c: { ...sampleCharacter(), ch: { ...sampleCharacter().ch, name: 'Bob' } }
});

describe('character list', () => {
  it('shows the active character as it is now', () => {
    expect(freshList(renamed())[0]).toEqual({ id: 'a', name: 'Bob', info: 'Wood Elf · Ranger 5' });
  });
  it('keeps the renamed entry after switching to another character', () => {
    const s = switchStore(renamed(), 'b', blankCharacter());
    expect(s.id).toBe('b');
    expect(s.list[0].name).toBe('Bob');
  });
  it('keeps the renamed entry after adding a character', () => {
    const s = addToStore(renamed(), [{ id: 'c', c: blankCharacter() }]);
    expect(s.id).toBe('c');
    expect(s.list.map((x) => x.name)).toEqual(['Bob', 'Other', 'New character']);
  });
});
