import { useSyncExternalStore } from 'react';

// Screens that get the two-column layout in auto mode. styles.css keys its two-column rules on `.sheet.wide`.
const WIDE_QUERY = '(min-width: 1100px) and (min-height: 780px)';

// Manual override from the menu. Saved per device, not per character.
export type LayoutMode = 'auto' | 'one' | 'two';
const MODE_KEY = 'dnd-layout';

export const isWide = (mode: LayoutMode, screenMatches: boolean) => (mode === 'auto' ? screenMatches : mode === 'two');

let mq: MediaQueryList | null = null;
const query = () => (mq ??= matchMedia(WIDE_QUERY));
const subscribeScreen = (cb: () => void) => {
  query().addEventListener('change', cb);
  return () => query().removeEventListener('change', cb);
};

let mode: LayoutMode | null = null;
const modeListeners = new Set<() => void>();
const getMode = (): LayoutMode => {
  if (!mode) {
    let saved: string | null = null;
    try { saved = localStorage.getItem(MODE_KEY); } catch { /* storage blocked */ }
    mode = saved === 'one' || saved === 'two' ? saved : 'auto';
  }
  return mode;
};
const subscribeMode = (cb: () => void) => { modeListeners.add(cb); return () => { modeListeners.delete(cb); }; };

export function setLayoutMode(m: LayoutMode): void {
  mode = m;
  try { localStorage.setItem(MODE_KEY, m); } catch { /* storage blocked */ }
  modeListeners.forEach((cb) => cb());
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(subscribeMode, getMode);
}

export function useWide(): boolean {
  const m = useLayoutMode();
  const screen = useSyncExternalStore(subscribeScreen, () => query().matches);
  return isWide(m, screen);
}
