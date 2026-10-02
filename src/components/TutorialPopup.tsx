import { useId, type RefObject } from 'react';
import { Landmark, Map, Store, Shield, Users, Scale, Church, Hammer, ScrollText, type LucideIcon } from 'lucide-react';
import { TUTORIALS } from '../data/tutorials.ts';
import type { TabId } from '../data/tabs.ts';
import { useNoticeDialog } from '../hooks/useNoticeDialog.ts';

const TAB_ICONS = {
  estate: Landmark, map: Map, market: Store, military: Shield, people: Users,
  hall: Scale, chapel: Church, forge: Hammer, chronicle: ScrollText,
} satisfies Record<TabId, LucideIcon>;

interface TutorialPopupProps {
  tab: TabId;
  onDismiss: () => void;
  fallbackFocusRef?: RefObject<HTMLButtonElement | null>;
}

export default function TutorialPopup({ tab, onDismiss, fallbackFocusRef }: TutorialPopupProps) {
  const tutorial = TUTORIALS[tab];
  const { dialogRef, headingRef, actionRef, onKeyDown } = useNoticeDialog(tutorial ? tab : null, fallbackFocusRef);
  const titleId = useId();
  const subtitleId = useId();
  if (!tutorial) return null;
  const Icon = TAB_ICONS[tab];

  return (
    <dialog ref={dialogRef} aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitleId}
      className="fixed inset-0 z-50 m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded-lg border-2 border-gold bg-bg-dark p-0 text-tan-light shadow-[0_0_40px_rgba(196,162,74,0.2),inset_0_1px_0_rgba(196,162,74,0.1)] backdrop:bg-black/85 motion-safe:animate-[tutorial-enter_400ms_ease-out]"
      onKeyDown={onKeyDown} onCancel={event => { event.preventDefault(); onDismiss(); }}
      onClick={event => {
        const box = event.currentTarget.getBoundingClientRect();
        if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right
          || event.clientY < box.top || event.clientY > box.bottom)) onDismiss();
      }}>
      <div className="px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 text-center border-b border-[#3a3228] bg-[linear-gradient(180deg,rgba(196,162,74,0.08)_0%,transparent_100%)]">
        <div className="flex justify-center mb-2 sm:mb-3" aria-hidden="true">
          <div className="rounded-full p-2 sm:p-3 bg-gold/10 border border-tan-dark"><Icon size={28} className="text-gold" strokeWidth={1.5} /></div>
        </div>
        <h2 ref={headingRef} id={titleId} tabIndex={-1}
          style={{ fontFamily: 'var(--font-display)' }}
          className="text-2xl font-bold uppercase tracking-widest text-gold-bright [text-shadow:0_0_12px_rgba(196,162,74,0.3)]">{tutorial.title}</h2>
        <p id={subtitleId} className="text-sm mt-1 italic text-tan">{tutorial.subtitle}</p>
      </div>
      <div className="px-6 py-4 space-y-3">
        {tutorial.sections.map(section => (
          <section key={section.heading}>
            <h3 className="font-heading text-sm font-bold uppercase tracking-wider mb-1 text-gold">{section.heading}</h3>
            <p className="text-base leading-relaxed">{section.text}</p>
          </section>
        ))}
      </div>
      <div className="mx-6 mb-4 rounded-md border border-gold-dim bg-gold/[0.06] p-3 text-tan">
        <span className="font-heading font-bold uppercase text-xs tracking-wider mr-1.5 text-gold">{'\u2756'} Tip:</span>
        <span className="text-base">{tutorial.tip}</span>
      </div>
      <div className="px-3 sm:px-6 pb-6 text-center">
        <button ref={actionRef} onClick={onDismiss}
          className="w-full sm:w-auto max-w-full px-0 sm:px-8 py-3 min-h-[44px] [overflow-wrap:anywhere] rounded-md border-2 border-gold font-heading font-bold text-base text-gold-bright uppercase tracking-normal sm:tracking-[2px] cursor-pointer transition-all duration-200 bg-[linear-gradient(135deg,#8b1a1a_0%,#4a0a0a_50%,#8b1a1a_100%)] hover:bg-[linear-gradient(135deg,#c62828_0%,#6a1010_50%,#c62828_100%)] hover:[text-shadow:0_0_8px_rgba(232,196,74,0.5)]">
          I Understand
        </button>
        <p className="text-sm mt-2 italic text-tan">This guide will not appear again for this tab</p>
      </div>
    </dialog>
  );
}
