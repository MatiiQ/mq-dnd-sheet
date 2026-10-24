import { useSyncExternalStore } from 'react';

// Two-column landscape layout. styles.css repeats this string in its @media block; keep them the same.
export const WIDE_QUERY = '(min-width: 1100px) and (min-height: 780px)';

const subscribe = (cb: () => void) => {
  const mq = matchMedia(WIDE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

export function useWide(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(WIDE_QUERY).matches);
}
