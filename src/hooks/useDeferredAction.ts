import { useCallback, useEffect, useRef, useState } from 'react';

/** Own one deferred view action, including cancellation before a game-state replacement. */
export function useDeferredAction() {
  const frame = useRef<number | null>(null);
  const [pending, setPending] = useState(false);
  const cancel = useCallback(() => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    setPending(false);
  }, []);
  const schedule = useCallback((action: () => void) => {
    if (frame.current !== null) return;
    setPending(true);
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      setPending(false);
      action();
    });
  }, []);
  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  return { pending, schedule, cancel };
}
