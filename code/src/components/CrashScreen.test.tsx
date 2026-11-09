// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankCharacter } from '../defaults';
import { btn, mount } from '../test-dom';
import { CrashScreen } from './CrashScreen';

function Boom(): never { throw new Error('boom'); }

describe('CrashScreen', () => {
  beforeEach(() => { localStorage.clear(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  it('reads "Open an example" with a saved character, and shows the list hint', () => {
    localStorage.setItem('dnd-sheet-v3:a1', JSON.stringify(blankCharacter()));
    mount(<CrashScreen><Boom /></CrashScreen>);
    expect(btn('Open an example')).toBeTruthy();
    expect(document.body.textContent).toContain('Your characters stay in the list');
  });
  it('reads "Open the characters screen" with none, without the list hint', () => {
    mount(<CrashScreen><Boom /></CrashScreen>);
    expect(btn('Open the characters screen')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Your characters stay in the list');
  });
});
