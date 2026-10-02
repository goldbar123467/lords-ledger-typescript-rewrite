import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

function restoreFocus(previous: Element | null, fallback?: RefObject<HTMLButtonElement | null>) {
  // Read the fallback at dismissal: a cellar intro action mounts only after its note closes.
  const target = previous instanceof HTMLElement && previous !== document.body
    && previous.isConnected && !previous.matches(':disabled') ? previous : fallback?.current;
  target?.focus();
}

/** Native modal lifecycle for an informational notice with exactly one action. */
export function useNoticeDialog(contentKey: string | null | undefined, fallbackFocusRef?: RefObject<HTMLButtonElement | null>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!contentKey || !dialog) return;
    const previousFocus = document.activeElement;
    dialog.showModal(); // Native modal state makes background pointer and keyboard input inert.
    headingRef.current?.focus(); // Long content starts at its heading, not its final action.
    return () => {
      dialog.close();
      restoreFocus(previousFocus, fallbackFocusRef);
    };
  }, [contentKey, fallbackFocusRef]);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Tab') { event.preventDefault(); actionRef.current?.focus(); }
  }
  return { dialogRef, headingRef, actionRef, onKeyDown };
}
