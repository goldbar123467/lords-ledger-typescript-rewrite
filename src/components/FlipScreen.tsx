/** Perspective-story introduction, choices, outcomes, and estate consequences. */
import type { ReactNode } from 'react';
import { FLIP_STAT_IDS, type FlipDefinition, type FlipEffects, type FlipStats, type LinearFlip } from '../data/flipTypes.ts';
import { translateEffects } from '../engine/meterUtils.ts';

interface FlipScreenProps {
  phase: 'flip_intro' | 'flip_decision' | 'flip_outcome' | 'flip_summary';
  flipData: FlipDefinition | null;
  currentFlipStats: FlipStats | null;
  currentDecisionIndex: number;
  currentFlipOutcome: string | null;
  flipOutcomeWasSuccess: boolean | null;
  consequences: FlipEffects | null;
  prevStats: FlipStats | null;
  currentCyoaNodeId: string | null;
  onDismissIntro: () => void;
  onSelectOption: (index: number) => void;
  onContinue: () => void;
  onDismissSummary: () => void;
}

type ColorScheme = FlipDefinition['colorScheme'];
const RESOURCE_LABELS: Record<string, string> = {
  denarii: '\u269C Denarii', food: '\u2727 Food', population: '\u2302 Families',
  garrison: '\u2694 Garrison', morale: 'Morale',
};
const ENDING_STYLES = {
  good: { label: 'Prosperous Ending', background: 'rgba(74, 138, 58, 0.15)', border: '#4a8a3a', text: '#316523' },
  medium: { label: 'Survival Ending', background: 'rgba(180, 140, 20, 0.15)', border: '#b48c14', text: '#704c00' },
  bad: { label: 'Downfall Ending', background: 'rgba(198, 40, 40, 0.15)', border: '#c62828', text: '#a41e1e' },
};

function ChangePills({ changes }: { changes: Array<{ key: string; label: string; delta: number }> }) {
  const visible = changes.filter(change => change.delta !== 0);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 justify-center mt-3">
      {visible.map(({ key, label, delta }) => {
        const tone = delta > 0 ? ENDING_STYLES.good : ENDING_STYLES.bad;
        return (
          <span key={key} className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full border font-semibold"
            style={{ borderColor: tone.border, backgroundColor: tone.background, color: tone.text }}>
            {label} {delta > 0 ? `+${delta}` : delta}
          </span>
        );
      })}
    </div>
  );
}

function ConsequencePills({ consequences }: { consequences: FlipEffects | null }) {
  if (!consequences) return null;
  return <ChangePills changes={Object.entries(translateEffects(consequences)).map(([key, delta]) => ({
    key, delta, label: RESOURCE_LABELS[key] ?? key,
  }))} />;
}

function StatChangeSummary({ prevStats, nextStats, characterStats }: {
  prevStats: FlipStats | null;
  nextStats: FlipStats | null;
  characterStats: LinearFlip['characterStats'];
}) {
  if (!prevStats || !nextStats) return null;
  return <ChangePills changes={Object.entries(characterStats).flatMap(([name, definition]) => {
    const key = FLIP_STAT_IDS.find(id => id === name);
    if (!key) return [];
    const previous = prevStats[key];
    const next = nextStats[key];
    if (!definition || previous === undefined || next === undefined) return [];
    return [{ key, label: `${definition.icon} ${definition.label}`, delta: next - previous }];
  })} />;
}

function StoryNote({ children, label = "Scribe's Note", className }: {
  children: ReactNode; label?: string; className: string;
}) {
  return (
    <div className={`${className} p-3 rounded-md border text-sm leading-relaxed italic`}
      style={{ backgroundColor: '#231e16', borderColor: '#6a5a42', color: '#a89070' }}>
      <span className="font-heading font-semibold not-italic" style={{ color: '#c4a24a' }}>{label}:</span>{' '}
      {children}
    </div>
  );
}

function StoryButton({ children, colorScheme, onClick }: {
  children: ReactNode; colorScheme: ColorScheme; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="px-8 py-3 rounded-md border-2 font-heading font-bold text-lg uppercase tracking-wider transition-all duration-200 cursor-pointer"
      style={{ backgroundColor: colorScheme.accent, borderColor: colorScheme.accent, color: '#faf3e3', outlineColor: colorScheme.accent }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = colorScheme.light; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = colorScheme.accent; }}>
      {children}
    </button>
  );
}

export default function FlipScreen({
  phase, flipData, currentFlipStats, currentDecisionIndex, currentFlipOutcome, flipOutcomeWasSuccess,
  consequences, prevStats, onDismissIntro, onSelectOption, onContinue, onDismissSummary, currentCyoaNodeId,
}: FlipScreenProps) {
  if (!flipData) {
    return (
      <div className="mx-auto w-full max-w-xl rounded-lg border-2 p-5 shadow-lg"
        style={{ backgroundColor: '#231e16', borderColor: '#8a7a3a' }}>
        <p style={{ color: '#a89070' }}>This perspective shift is unavailable.</p>
        <button onClick={onDismissSummary} className="mt-4 px-6 py-2 rounded-md border cursor-pointer"
          style={{ backgroundColor: '#2a2318', borderColor: '#6a5a42', color: '#c8b090' }}>
          Return to Your Reign
        </button>
      </div>
    );
  }

  const { colorScheme } = flipData;
  const cardStyle = {
    backgroundColor: colorScheme.background, borderColor: colorScheme.accent,
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
  };
  const captionClass = 'text-xs uppercase tracking-widest font-heading font-semibold';
  const cardClass = 'mx-auto w-full max-w-xl rounded-lg border-2 shadow-lg';

  if (phase === 'flip_intro') {
    return (
      <div className={`${cardClass} p-5 sm:p-6`} style={cardStyle}>
        <div className={`${captionClass} mb-3`} style={{ color: colorScheme.accent }}>Perspective Shift</div>
        <h2 className="font-heading text-2xl sm:text-3xl font-bold mb-3" style={{ color: colorScheme.text }}>
          {flipData.intro.title}
        </h2>
        <p className="italic text-base leading-relaxed mb-4" style={{ color: colorScheme.accent }}>
          {flipData.intro.bridgeText}
        </p>
        <p className="text-base leading-relaxed mb-6" style={{ color: colorScheme.text }}>
          {flipData.intro.narrativeText}
        </p>
        <div className="text-center">
          <StoryButton colorScheme={colorScheme} onClick={onDismissIntro}>Begin</StoryButton>
        </div>
      </div>
    );
  }

  if (phase === 'flip_decision') {
    const decision = flipData.type === 'cyoa'
      ? (currentCyoaNodeId ? flipData.nodes[currentCyoaNodeId] : undefined)
      : flipData.decisions[currentDecisionIndex];
    if (!decision || ('isEnding' in decision && decision.isEnding)) return null;
    return (
      <div className={`${cardClass} p-4 sm:p-5`} style={cardStyle}>
        <div className={`${captionClass} mb-2`} style={{ color: colorScheme.accent }}>
          {flipData.type === 'cyoa' ? 'Choose Your Path' : `Decision ${currentDecisionIndex + 1} of ${flipData.decisions.length}`}
        </div>
        <h3 className="font-heading text-lg sm:text-xl font-bold mb-2" style={{ color: colorScheme.text }}>{decision.title}</h3>
        <p className="text-base leading-relaxed mb-4" style={{ color: colorScheme.text }}>{decision.description}</p>
        <div className="flex flex-col gap-2" role="group" aria-label={flipData.type === 'cyoa' ? 'Choose your path' : 'Choose your response'}>
          {decision.options.map((option, index) => (
            <button key={index} onClick={() => onSelectOption(index)}
              className="w-full text-left px-4 py-4 rounded-md border-2 transition-all duration-200 cursor-pointer min-h-[44px]"
              style={{ backgroundColor: colorScheme.background, borderColor: colorScheme.light, color: colorScheme.text, outlineColor: colorScheme.accent }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = colorScheme.background + 'dd';
                e.currentTarget.style.borderColor = colorScheme.accent;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = colorScheme.background;
                e.currentTarget.style.borderColor = colorScheme.light;
              }}
              aria-label={`Option ${index + 1}: ${option.text}`}
              aria-describedby={'chance' in option && option.chance !== undefined ? `flip-chance-${index}` : undefined}>
              <div className="font-semibold text-base">{option.text}</div>
              {'chance' in option && option.chance !== undefined && (
                <div id={`flip-chance-${index}`} className="text-sm mt-1" style={{ color: colorScheme.accent }}>
                  {Math.round(option.chance * 100)}% chance of success
                </div>
              )}
            </button>
          ))}
        </div>
        {'scribesNote' in decision && decision.scribesNote && <StoryNote className="mt-4">{decision.scribesNote}</StoryNote>}
      </div>
    );
  }

  if (phase === 'flip_outcome') {
    // Branching stories proceed directly to an ending; only linear choices have outcomes.
    if (flipData.type === 'cyoa') return null;
    const isLast = currentDecisionIndex >= flipData.decisions.length - 1;
    return (
      <div className={`${cardClass} p-4 sm:p-5`} style={cardStyle}>
        <div className={`${captionClass} mb-2`} style={{ color: colorScheme.accent }}>
          {flipOutcomeWasSuccess === true ? 'Success!' : flipOutcomeWasSuccess === false ? 'Things didn\u2019t go as planned\u2026' : 'Outcome'}
        </div>
        <p className="text-base leading-relaxed mb-4" style={{ color: colorScheme.text }}>{currentFlipOutcome}</p>
        <StatChangeSummary prevStats={prevStats} nextStats={currentFlipStats} characterStats={flipData.characterStats} />
        <div className="text-center mt-5">
          <StoryButton colorScheme={colorScheme} onClick={onContinue}>{isLast ? 'See the Consequences' : 'Continue'}</StoryButton>
        </div>
      </div>
    );
  }

  if (phase === 'flip_summary') {
    const node = flipData.type === 'cyoa' && currentCyoaNodeId ? flipData.nodes[currentCyoaNodeId] : undefined;
    const ending = node?.isEnding ? node : undefined;
    const tone = ENDING_STYLES[ending?.endingType ?? 'medium'];
    return (
      <div className={`${cardClass} p-5 sm:p-6`} style={cardStyle}>
        {flipData.type === 'cyoa' ? <>
          <div className="inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full border font-semibold mb-4"
            style={{ borderColor: tone.border, backgroundColor: tone.background, color: tone.text }}>
            <span className="text-lg">{ending?.icon}</span>{tone.label}
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl font-bold mb-3" style={{ color: colorScheme.text }}>{ending?.title}</h2>
          <p className="text-base leading-relaxed mb-4" style={{ color: colorScheme.text }}>{ending?.description}</p>
          {ending?.historicalConnection && <StoryNote label="Historical Connection" className="mb-4">{ending.historicalConnection}</StoryNote>}
        </> : <div className={`${captionClass} mb-3`} style={{ color: colorScheme.accent }}>Returning to Your Reign</div>}
        <p className="italic text-base leading-relaxed mb-4" style={{ color: colorScheme.accent }}>{flipData.returnText}</p>
        <StoryNote className="mb-4">{flipData.scribesNote}</StoryNote>
        <p className="text-sm font-heading font-semibold text-center mb-1" style={{ color: colorScheme.text }}>
          The consequences ripple back to your estate&hellip;
        </p>
        <ConsequencePills consequences={consequences} />
        <div className="text-center mt-5">
          <StoryButton colorScheme={colorScheme} onClick={onDismissSummary}>Return to Your Reign</StoryButton>
        </div>
      </div>
    );
  }

  return null;
}
