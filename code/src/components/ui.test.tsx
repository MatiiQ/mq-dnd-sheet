// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import css from '../styles.css?raw';
import { btn, label, mount, tap } from '../test-dom';
import { ChoiceTile, firstSentence, Stepper } from './ui';

describe('ChoiceTile', () => {
  it('More toggles without selecting; no button inside a button; both ≥ 44 px', () => {
    const onSelect = vi.fn();
    mount(<ChoiceTile title="Alert" body="Short" more="Long text" selected={false} onSelect={onSelect} />);
    expect(document.body.textContent).not.toContain('Long text');
    tap(btn('More'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Long text');
    expect(document.querySelector('button button')).toBeNull();
    for (const b of document.querySelectorAll('.tile button')) expect(b.className).toMatch(/^tile-(pick|more)$/);
    expect(css).toMatch(/\.tile-pick[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.tile-more[^}]*min-height:\s*44px/);
  });
  it('held: aria-disabled and labelled; with picked, a tap still reaches onSelect', () => {
    const onSelect = vi.fn();
    mount(<ChoiceTile title="Alert" selected held picked onSelect={onSelect} />);
    const b = label('Alert, on your sheet, tap to remove')!;
    expect(b.getAttribute('aria-disabled')).toBe('true');
    tap(b);
    expect(onSelect).toHaveBeenCalled();
  });
  it('held without picked reads "already on your sheet"', () => {
    mount(<ChoiceTile title="Alert" selected={false} held onSelect={() => {}} />);
    expect(label('Alert, already on your sheet')).toBeTruthy();
  });
  it('with an unmet prerequisite stays selectable', () => {
    const onSelect = vi.fn();
    mount(<ChoiceTile title="Grappler" meta="Needs Strength 13" warn selected={false} onSelect={onSelect} />);
    expect(document.querySelector('.picker-warn')?.textContent).toBe('Needs Strength 13');
    const b = document.querySelector('.tile-pick')!;
    expect(b.getAttribute('aria-disabled')).toBeNull();
    tap(b);
    expect(onSelect).toHaveBeenCalled();
  });
  it('selected adds .active and aria-pressed; count shows ×N above 1; no onSelect gives no select button', () => {
    mount(<ChoiceTile title="DEX +1" count={2} selected onSelect={() => {}} />);
    expect(document.querySelector('.tile.active')).toBeTruthy();
    expect(document.querySelector('.tile-pick')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.body.textContent).toContain('×2');
  });
  it('a tile without onSelect has no select button', () => {
    mount(<ChoiceTile title="Fighting Style" body="Feature" selected={false} />);
    expect(document.querySelector('.tile-pick')).toBeNull();
    expect(document.body.textContent).toContain('Fighting Style');
  });
});

describe('firstSentence', () => {
  it('cuts at the first ". " or the first line', () => {
    expect(firstSentence('One. Two.')).toBe('One.');
    expect(firstSentence('Line one\nLine two')).toBe('Line one');
    expect(firstSentence('Whole')).toBe('Whole');
  });
});

describe('Stepper', () => {
  it('labels, states, disabled stages do not jump', () => {
    const onJump = vi.fn();
    mount(<Stepper line="Origin · Background (1 of 7)" onJump={onJump} stages={[
      { id: 'class', label: 'Class', state: 'done', enabled: true },
      { id: 'origin', label: 'Origin', state: 'current', enabled: true },
      { id: 'details', label: 'Details', state: 'ahead', enabled: false }]} />);
    tap(label('Class, done'));
    expect(onJump).toHaveBeenCalledWith('class');
    expect(label('Origin, current')).toBeTruthy();
    const d = label('Details, not available yet')!;
    expect(d.getAttribute('aria-disabled')).toBe('true');
    tap(d);
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.stepper')).toBeTruthy();
    expect(document.body.textContent).toContain('Origin · Background (1 of 7)');
  });
});
