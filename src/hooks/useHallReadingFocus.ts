import { useEffect, useRef, type FocusEvent } from 'react';

/** Keep keyboard actions in the reading area between the pinned game controls. */
export function useHallReadingFocus(selector = 'button:focus-visible') {
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => () => cleanup.current(), []);
  return (event: FocusEvent<HTMLDivElement>) => {
    const control = event.target;
    if (!(control instanceof HTMLElement) || !control.matches(selector)) return;
    cleanup.current();
    let frame: number | null = null;
    let disposed = false;
    const stop = () => {
      if (disposed) return;
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', queue);
      document.removeEventListener('focusin', releaseFocus);
      document.fonts.removeEventListener('loadingdone', queue);
      cleanup.current = () => {};
    };
    const reveal = () => {
      frame = null;
      if (document.activeElement !== control || !control.matches(selector)) {
        stop();
        return;
      }
      const header = document.querySelector<HTMLElement>('.game-header[data-pinned="true"]');
      const footer = document.querySelector<HTMLElement>('.sticky.bottom-0');
      const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
      const bottom = footer ? Math.min(window.innerHeight, footer.getBoundingClientRect().top) : window.innerHeight;
      const rect = control.getBoundingClientRect();
      const delta = rect.top + rect.height / 2 - (top + bottom) / 2;
      if (bottom > top && Math.abs(delta) > .5) window.scrollBy({ top: delta, behavior: 'instant' });
    };
    const queue = () => {
      if (disposed) return;
      if (frame !== null) window.cancelAnimationFrame(frame);
      // Native focus scrolling and layout run before measuring the reading area.
      frame = window.requestAnimationFrame(reveal);
    };
    const releaseFocus = () => {
      if (document.activeElement !== control) stop();
    };
    const observer = new ResizeObserver(queue);
    cleanup.current = stop;
    observer.observe(control);
    observer.observe(document.body);
    for (const chrome of document.querySelectorAll('.game-header, .sticky.bottom-0')) {
      observer.observe(chrome);
    }
    window.addEventListener('resize', queue);
    document.addEventListener('focusin', releaseFocus);
    document.fonts.addEventListener('loadingdone', queue);
    // Only keyboard-visible focus starts tracking; pointer clicks keep their position.
    queue();
  };
}
