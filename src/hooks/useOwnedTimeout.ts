import { useCallback, useEffect, useRef } from 'react';

/** Own view timeouts and cancel pending callbacks on unmount. */
export function useOwnedTimeout() {
  const ownedTimeouts = useRef(new Set<number>());
  const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
    const pending = ownedTimeouts.current;
    const handle = window.setTimeout(() => {
      pending.delete(handle);
      callback();
    }, delay);
    pending.add(handle);
  }, []);

  useEffect(() => {
    const pending = ownedTimeouts.current;
    return () => {
      for (const handle of pending) window.clearTimeout(handle);
      pending.clear();
    };
  }, []);

  return scheduleTimeout;
}
