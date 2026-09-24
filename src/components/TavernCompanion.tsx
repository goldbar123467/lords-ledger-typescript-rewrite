import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ALDRIC_MILITARY_COUNSEL, ALDRIC_SCRIBES_NOTE, ALDRIC_TRAINING_OFFERS,
  ALDRIC_WAR_STORIES, MARTA_MARKET_TIPS, MARTA_OFFERS, MARTA_SCRIBES_NOTE,
  MARTA_TRADE_STORIES,
} from '../data/tavern.js';
import type { CompanionId } from '../engine/tavernCompanion.ts';
import type { GameSnapshot } from '../save/saveGame.ts';

type ContentLine = string | ((state: GameSnapshot) => string);

interface Offer {
  id: string;
  title: string;
  description: string;
  warning?: string;
  costText: string;
  rewardText: string;
  canAccept: (state: GameSnapshot) => boolean;
  cantAcceptText: string;
}

interface Palette {
  panel: string;
  border: string;
  accent: string;
  panelShadow: string;
  speech: string;
  speechShadow: string;
  portrait: string;
  portraitShadow: string;
  subtitle: string;
  intro: string;
  accept: string;
  acceptHover: string;
  acceptBorder: string;
  talk: string;
  talkHover: string;
  talkHoverBorder: string;
  talkDisabled: string;
  talkDisabledBorder: string;
  talkDisabledColor: string;
  leaveBorder: string;
}

interface CompanionConfig {
  contentKey: 'martaCurrentContent' | 'aldricCurrentContent';
  scribesKey: 'martaScribesNoteSeen' | 'aldricScribesNoteSeen';
  title: string;
  subtitle: string;
  intro: string;
  icon: string;
  adviceLabel: string;
  storyLabel: string;
  rewardLabel: string;
  acceptedText: string;
  declinedText: string;
  scribesNote: string;
  advice: readonly ContentLine[];
  stories: readonly ContentLine[];
  offers: readonly Offer[];
  longWarProse: boolean;
  palette: Palette;
}

const COMPANIONS: Record<CompanionId, CompanionConfig> = {
  marta: {
    contentKey: 'martaCurrentContent', scribesKey: 'martaScribesNoteSeen',
    title: 'Marta of Cologne', subtitle: 'Femme Sole — Licensed Trader',
    intro: 'Information has value, my lord. I deal in both.', icon: '\u2696',
    adviceLabel: 'Market Intelligence', storyLabel: 'A Trade Story',
    rewardLabel: 'Reward', acceptedText: 'The deal is struck.',
    declinedText: 'Perhaps another time.', scribesNote: MARTA_SCRIBES_NOTE,
    advice: MARTA_MARKET_TIPS, stories: MARTA_TRADE_STORIES, offers: MARTA_OFFERS,
    longWarProse: false,
    palette: {
      panel: '#0e1a1a', border: '#1a5a5a', accent: '#3a9a8a',
      panelShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
      speech: '#1a2a2a', speechShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.3)',
      portrait: '#0e1a1a', portraitShadow: '0 0 12px rgba(26, 90, 90, 0.3)',
      subtitle: '#6a8a7a', intro: '#a89070',
      accept: 'linear-gradient(135deg, #1a5a5a 0%, #0e3a3a 50%, #1a5a5a 100%)',
      acceptHover: 'linear-gradient(135deg, #2a7a6a 0%, #1a5a5a 50%, #2a7a6a 100%)',
      acceptBorder: '#2a7a6a',
      talk: '#0e2020', talkHover: '#1a3030', talkHoverBorder: '#2a7a6a',
      talkDisabled: '#0a1010', talkDisabledBorder: '#1a3030', talkDisabledColor: '#2a4a4a',
      leaveBorder: '#3a4a4a',
    },
  },
  aldric: {
    contentKey: 'aldricCurrentContent', scribesKey: 'aldricScribesNoteSeen',
    title: 'Aldric One-Eye', subtitle: 'Veteran of the Siege of Acre',
    intro: 'War teaches what books cannot. Sit. Listen.', icon: '\u2694',
    adviceLabel: 'Military Counsel', storyLabel: 'A War Story',
    rewardLabel: 'Effect', acceptedText: 'It is done.',
    declinedText: 'As you wish, my lord.', scribesNote: ALDRIC_SCRIBES_NOTE,
    advice: ALDRIC_MILITARY_COUNSEL, stories: ALDRIC_WAR_STORIES,
    offers: ALDRIC_TRAINING_OFFERS, longWarProse: true,
    palette: {
      panel: '#120808', border: 'var(--royal-red, #8b1a1a)', accent: '#c44a4a',
      panelShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      speech: '#1a0e0e', speechShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.4)',
      portrait: '#120808', portraitShadow: '0 0 12px rgba(139, 26, 26, 0.3)',
      subtitle: '#8a6a5a', intro: '#8a7060',
      accept: 'linear-gradient(135deg, var(--royal-red, #8b1a1a) 0%, #4a0a0a 50%, var(--royal-red, #8b1a1a) 100%)',
      acceptHover: 'linear-gradient(135deg, #c44a4a 0%, #6a1a1a 50%, #c44a4a 100%)',
      acceptBorder: '#c44a4a',
      talk: '#1a0e0e', talkHover: '#2a1010', talkHoverBorder: '#c44a4a',
      talkDisabled: '#0a0505', talkDisabledBorder: '#3a1010', talkDisabledColor: '#4a2020',
      leaveBorder: '#4a3030',
    },
  },
};

export interface TavernCompanionProps {
  kind: CompanionId;
  state: GameSnapshot;
  onNext: () => void;
  onAcceptOffer: (offerId: string) => void;
  onDeclineOffer: (offerId: string) => void;
  onScribesNoteSeen: () => void;
  onBack: () => void;
}

function SpeechBubble({ children, animKey, palette }: {
  children: ReactNode; animKey: number; palette: Palette;
}) {
  return (
    <div key={animKey} className="quill-appear rounded-lg border-2 p-4 mt-3"
      style={{ backgroundColor: palette.speech, borderColor: palette.border, boxShadow: palette.speechShadow }}>
      {children}
    </div>
  );
}

function Portrait({ config }: { config: CompanionConfig }) {
  const { palette } = config;
  return (
    <div className="flex items-center justify-center rounded-lg border-2 mx-auto"
      style={{ width: 80, height: 80, borderColor: palette.border,
        backgroundColor: palette.portrait, boxShadow: palette.portraitShadow }}>
      <span style={{ fontSize: 36, color: palette.accent, fontFamily: 'serif', lineHeight: 1 }}>
        {config.icon}
      </span>
    </div>
  );
}

function OfferCard({ offer, state, accepted, onAccept, onDecline, config }: {
  offer: Offer;
  state: GameSnapshot;
  accepted: boolean | null;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  config: CompanionConfig;
}) {
  const { palette } = config;
  const canAccept = offer.canAccept(state);
  const proseStyle: CSSProperties = {
    color: '#c8b090', fontFamily: 'Crimson Text, serif',
    ...(config.longWarProse ? { lineHeight: 1.8 } : {}),
  };

  return (
    <div className="quill-appear rounded-lg border-2 p-4 mt-3"
      style={{ backgroundColor: palette.panel, borderColor: palette.border }}>
      <h4 className="text-sm font-bold uppercase tracking-wide mb-2"
        style={{ fontFamily: 'Cinzel, serif', color: palette.accent }}>
        {offer.title}
      </h4>
      <p className="text-sm leading-relaxed mb-3" style={proseStyle}>
        <span style={{ color: palette.accent, fontSize: '1.2em' }}>{'\u201C'}</span>
        {offer.description}
        {offer.warning && (
          <span className="block mt-1 italic" style={{ color: '#a89070' }}>{offer.warning}</span>
        )}
        <span style={{ color: palette.accent, fontSize: '1.2em' }}>{'\u201D'}</span>
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-sm"
        style={{ fontFamily: 'Crimson Text, serif' }}>
        <div>
          <span style={{ color: '#bca98a' }}>Cost: </span>
          <span style={{ color: offer.costText === 'Free' ? '#6dc858' : '#e57373' }}>{offer.costText}</span>
        </div>
        <div>
          <span style={{ color: '#bca98a' }}>{config.rewardLabel}: </span>
          <span style={{ color: '#6dc858' }}>{offer.rewardText}</span>
        </div>
      </div>
      {accepted !== null ? (
        <p className="text-sm italic"
          style={{ color: accepted ? '#6dc858' : '#a89070', fontFamily: 'Crimson Text, serif' }}>
          {accepted ? config.acceptedText : config.declinedText}
        </p>
      ) : !canAccept ? (
        <p className="text-sm italic" style={{ color: '#a89070', fontFamily: 'Crimson Text, serif' }}>
          {offer.cantAcceptText}
        </p>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => onAccept(offer.id)} className="px-4 py-2 rounded text-sm font-bold"
            style={{ minHeight: 44, background: palette.accept, color: '#e8c44a',
              border: `1px solid ${palette.acceptBorder}`, cursor: 'pointer' }}
            onMouseEnter={event => { event.currentTarget.style.background = palette.acceptHover; }}
            onMouseLeave={event => { event.currentTarget.style.background = palette.accept; }}>
            Accept
          </button>
          <button onClick={() => onDecline(offer.id)} className="px-4 py-2 rounded text-sm"
            style={{ minHeight: 44, backgroundColor: '#1a1208', color: '#c8b090',
              border: '1px solid #3a3020', cursor: 'pointer' }}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

export default function TavernCompanion({ kind, state, onNext, onAcceptOffer,
  onDeclineOffer, onScribesNoteSeen, onBack }: TavernCompanionProps) {
  const config = COMPANIONS[kind];
  const { palette } = config;
  const content = state.tavern[config.contentKey] ?? null;
  const [entryContent] = useState(() => content);
  const [advanceOnEntry] = useState(() =>
    content === null || content.type !== 'offer' || content.resolution !== null
  );
  const visibleContent = advanceOnEntry && content === entryContent ? null : content;
  const seededRef = useRef(false);
  const [animKey, setAnimKey] = useState(0);
  const [showScribesNote, setShowScribesNote] = useState(!state.tavern[config.scribesKey]);

  useEffect(() => {
    if (advanceOnEntry && !seededRef.current) {
      seededRef.current = true;
      onNext();
    }
  }, [advanceOnEntry, onNext]);

  function reroll() {
    onNext();
    setAnimKey(key => key + 1);
  }

  function dismissScribesNote() {
    setShowScribesNote(false);
    onScribesNoteSeen();
  }

  const offer = visibleContent?.type === 'offer'
    ? config.offers.find(item => item.id === visibleContent.offerId)
    : undefined;
  const accepted = visibleContent?.type === 'offer' && visibleContent.resolution !== null
    ? visibleContent.resolution === 'accepted' : null;
  const talkDisabled = Boolean(offer && accepted === null && offer.canAccept(state));

  let body: ReactNode = null;
  if (visibleContent?.type === 'advice' || visibleContent?.type === 'story') {
    const label = visibleContent.type === 'advice' ? config.adviceLabel : config.storyLabel;
    const raw = visibleContent.type === 'advice'
      ? config.advice[visibleContent.index] : config.stories[visibleContent.index];
    if (raw !== undefined) {
      const line = typeof raw === 'function' ? raw(state) : raw;
      body = (
        <SpeechBubble animKey={animKey} palette={palette}>
          <p className="text-xs uppercase tracking-wide mb-2"
            style={{ color: palette.accent, fontFamily: 'Cinzel, serif' }}>{label}</p>
          <p className="text-sm sm:text-base leading-relaxed"
            style={{ color: '#c8b090', fontFamily: 'Crimson Text, serif',
              ...(config.longWarProse ? { lineHeight: 1.8, letterSpacing: '0.3px' } : {}) }}>
            <span style={{ color: palette.accent, fontSize: '1.3em', lineHeight: 1 }}>{'\u201C'}</span>
            {line}
            <span style={{ color: palette.accent, fontSize: '1.3em', lineHeight: 1 }}>{'\u201D'}</span>
          </p>
        </SpeechBubble>
      );
    }
  } else if (visibleContent?.type === 'offer' && offer) {
    body = <OfferCard offer={offer} state={state} accepted={accepted}
      onAccept={onAcceptOffer} onDecline={onDeclineOffer} config={config} />;
  }

  return (
    <div className="rounded-lg border-2 p-4 sm:p-5 max-w-xl mx-auto"
      style={{ backgroundColor: palette.panel, borderColor: palette.border,
        boxShadow: palette.panelShadow }}>
      <h3 className="text-center text-lg sm:text-xl font-bold mb-1"
        style={{ fontFamily: 'Cinzel, serif', color: palette.accent }}>{config.title}</h3>
      <p className="text-center text-xs italic mb-3"
        style={{ color: palette.subtitle, fontFamily: 'Crimson Text, serif' }}>{config.subtitle}</p>
      <Portrait config={config} />
      <p className="text-center italic text-sm mt-3 mb-1"
        style={{ color: palette.intro, fontFamily: 'Crimson Text, serif' }}>{config.intro}</p>
      {showScribesNote && (
        <div className="rounded-lg border p-3 mt-3 mb-2"
          style={{ backgroundColor: '#1a2018', borderColor: '#4a6a3a' }}>
          <h4 className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: '#8a9a6a', fontFamily: 'Cinzel, serif' }}>Scribe{"'"}s Note</h4>
          <p className="text-sm leading-relaxed italic"
            style={{ color: '#a8a080', fontFamily: 'Crimson Text, serif' }}>{config.scribesNote}</p>
          <button onClick={dismissScribesNote} className="mt-2 px-3 py-1 rounded text-xs"
            style={{ minHeight: 44, backgroundColor: '#2a3a1a', color: '#8a9a6a',
              border: '1px solid #4a6a3a', cursor: 'pointer' }}>I understand</button>
        </div>
      )}
      <div className="decorative-rule" style={{ color: palette.border }}>{'\u25C6'}</div>
      {body}
      <div className="flex gap-3 mt-4">
        <button onClick={reroll} disabled={talkDisabled}
          className="flex-1 px-4 py-3 rounded-md border-2 font-semibold text-sm min-h-[44px]"
          style={{ backgroundColor: talkDisabled ? palette.talkDisabled : palette.talk,
            borderColor: talkDisabled ? palette.talkDisabledBorder : palette.border,
            color: talkDisabled ? palette.talkDisabledColor : palette.accent,
            fontFamily: 'Cinzel, serif', transition: 'all 200ms ease',
            cursor: talkDisabled ? 'not-allowed' : 'pointer' }}
          onMouseEnter={event => {
            if (!talkDisabled) {
              event.currentTarget.style.backgroundColor = palette.talkHover;
              event.currentTarget.style.borderColor = palette.talkHoverBorder;
            }
          }}
          onMouseLeave={event => {
            if (!talkDisabled) {
              event.currentTarget.style.backgroundColor = palette.talk;
              event.currentTarget.style.borderColor = palette.border;
            }
          }}>Talk Again</button>
        <button onClick={onBack}
          className="flex-1 px-4 py-3 rounded-md border-2 font-semibold text-sm min-h-[44px]"
          style={{ backgroundColor: palette.panel, borderColor: palette.leaveBorder,
            color: palette.subtitle, fontFamily: 'Cinzel, serif',
            transition: 'all 200ms ease', cursor: 'pointer' }}
          onMouseEnter={event => {
            event.currentTarget.style.backgroundColor = palette.speech;
            event.currentTarget.style.borderColor = palette.subtitle;
          }}
          onMouseLeave={event => {
            event.currentTarget.style.backgroundColor = palette.panel;
            event.currentTarget.style.borderColor = palette.leaveBorder;
          }}>Leave</button>
      </div>
    </div>
  );
}
