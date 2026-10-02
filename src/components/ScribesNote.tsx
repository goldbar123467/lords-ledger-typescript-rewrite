import { useEffect, useId, useRef, type RefObject } from 'react';

interface ScribesNoteProps {
  text?: string | null;
  onDismiss: () => void;
  fallbackFocusRef?: RefObject<HTMLButtonElement | null>;
}

function restoreFocus(previous: Element | null, fallback?: ScribesNoteProps['fallbackFocusRef']) {
  // Read the fallback at dismissal: a cellar intro action mounts only after its note closes.
  const target = previous instanceof HTMLElement && previous !== document.body
    && previous.isConnected && !previous.matches(':disabled') ? previous : fallback?.current;
  target?.focus();
}

export default function ScribesNote({ text, onDismiss, fallbackFocusRef }: ScribesNoteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!text || !dialog) return;
    const previousFocus = document.activeElement;
    dialog.showModal(); // The browser makes background controls inert, including pointer input.
    headingRef.current?.focus(); // Start at the beginning of long notes, before the scrollable action.
    return () => {
      dialog.close();
      restoreFocus(previousFocus, fallbackFocusRef);
    };
  }, [text, fallbackFocusRef]);

  if (!text) return null;
  return (
    <dialog ref={dialogRef} aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
      className="fixed inset-0 z-50 m-auto w-[calc(100%_-_2rem)] max-w-md max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded-lg border-2 border-gold bg-bg-dark p-5 text-tan shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop:bg-black/60"
      onCancel={event => { event.preventDefault(); onDismiss(); }}
      onKeyDown={event => {
        // This dialog has one interactive control; keep forward/backward Tab on it.
        if (event.key === 'Tab') { event.preventDefault(); continueRef.current?.focus(); }
      }}>
      <div className="flex items-center gap-2 mb-3 text-gold">
        <span className="text-2xl" aria-hidden="true">{'\u273D'}</span>
        <h4 ref={headingRef} id={titleId} tabIndex={-1} className="font-heading text-lg font-bold">Scribe's Note</h4>
      </div>
      <p id={descriptionId} className="text-base leading-relaxed mb-4">{text}</p>
      <button ref={continueRef} onClick={onDismiss}
        className="w-full min-h-[44px] py-2 rounded-md border-2 border-gold bg-bg-elevated text-gold font-heading font-semibold text-sm uppercase tracking-wider cursor-pointer transition-colors duration-200 hover:bg-[#3a3228]">
        Continue
      </button>
    </dialog>
  );
}
