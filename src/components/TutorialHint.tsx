import { HINTS } from '../data/tutorialHints.ts';
import type { TabId } from '../data/tabs.ts';

/** Contextual guidance keeps the original first-matching turn threshold. */
export default function TutorialHint({ tab, turn }: { tab: TabId; turn: number }) {
  const activeHint = HINTS[tab]?.find(hint => turn <= hint.maxTurn);
  if (!activeHint) return null;
  return (
    <div className="rounded-md border border-gold-dim bg-gold/[0.08] p-3 mb-4 text-sm text-tan">
      <span className="font-heading font-bold uppercase text-xs tracking-wider mr-1.5 text-gold">{'\u2756'} Tip:</span>
      {activeHint.text}
    </div>
  );
}
