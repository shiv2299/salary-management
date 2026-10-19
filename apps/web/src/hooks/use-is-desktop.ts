import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const list = window.matchMedia(QUERY);
  list.addEventListener('change', onChange);
  return () => {
    list.removeEventListener('change', onChange);
  };
}

function getSnapshot() {
  return typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : true;
}

/** True at the `md` breakpoint and above (docs/design.md §7); assumes desktop on the server. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
