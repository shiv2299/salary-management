import { useState, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function read(key: string): boolean | undefined {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === 'true' ? true : stored === 'false' ? false : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A boolean remembered in this browser. The server and the first client render use `initial`; the
 * stored value is adopted after hydration. When the browser refuses access to storage the flag
 * keeps working in memory for as long as the component lives.
 */
export function useStoredFlag(key: string, initial: boolean): [boolean, (next: boolean) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => undefined,
  );
  const [inMemory, setInMemory] = useState<boolean | undefined>(undefined);

  function update(next: boolean) {
    try {
      window.localStorage.setItem(key, String(next));
      setInMemory(undefined);
      listeners.forEach((notify) => {
        notify();
      });
    } catch {
      setInMemory(next);
    }
  }

  return [inMemory ?? stored ?? initial, update];
}
