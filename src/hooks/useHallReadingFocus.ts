import { useEffect, useRef, type FocusEvent } from 'react';

/** Keep keyboard actions in the reading area between the pinned game controls. */
export function useHallReadingFocus() {
  const frame = useRef<number | null>(null);
  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
  }, []);
  return (event: FocusEvent<HTMLDivElement>) => {
    const control = event.target;
    if (!(control instanceof HTMLElement) || !control.matches('button:focus-visible')) return;
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    // Native focus scrolling runs first. Pointer focus must not move a held click.
    frame.current = window.requestAnimationFrame(() => {
      if (document.activeElement === control) {
        const header = document.querySelector<HTMLElement>('.game-header[data-pinned="true"]');
        const footer = document.querySelector<HTMLElement>('.sticky.bottom-0');
        const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
        const bottom = footer ? Math.min(window.innerHeight, footer.getBoundingClientRect().top) : window.innerHeight;
        const rect = control.getBoundingClientRect();
        if (bottom > top) window.scrollBy({ top: rect.top + rect.height / 2 - (top + bottom) / 2, behavior: 'instant' });
      }
      frame.current = null;
    });
  };
}
