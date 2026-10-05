/**
 * AudienceChamber.tsx
 *
 * The Audience Chamber — one-on-one NPC conversations within the Great Hall.
 * Queue of visitors, typewriter speech reveal, response selection with
 * consequence previews, aftermath with historical context toggle.
 *
 * Flow: queue -> herald -> speech -> response -> aftermath -> queue
 */

import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from "react";
import type { AudienceEncounter, AudienceResponse, AudiencePetitionerType, AudienceTone } from '../data/audience.ts';
import type { HallMeterEffects } from '../data/decrees.ts';

interface AudienceChamberProps {
  encounters: readonly AudienceEncounter[];
  resolvedIds: readonly string[];
  onRespond: (encounterId: string, responseIndex: number) => void;
  onReturn: () => void;
}
type AudienceView = { kind: 'queue' } | { kind: 'active'; encounter: AudienceEncounter }
  | { kind: 'aftermath'; encounter: AudienceEncounter; response: AudienceResponse };
type PortraitType = AudiencePetitionerType | 'peasant' | 'clergy' | 'military';
type PortraitTone = AudienceTone | 'neutral' | 'light' | 'mysterious';
import { Users, ChevronRight, BookOpen, ArrowLeft } from "lucide-react";

// ─── Color Palette ───────────────────────────────────────────────

const HALL = {
  stone:      "#2a2520",
  stoneLight: "#3d3630",
  torchGold:  "#d4a44c",
  parchment:  "#e8dcc8",
  inkBrown:   "#3d2b1a",
  bloodRed:   "#8b2020",
  forestGreen:"#2d5a2d",
  dimText:    "#c1b49b",
  bodyText:   "#c8b090",
  mutedText:  "#b8a78a",
};

// ─── Type badge color map ────────────────────────────────────────

const TYPE_COLORS: Record<AudiencePetitionerType | 'clergy' | 'military', string> = {
  beggar:        "#c5a47f",
  merchant:      "#8fbc84",
  priest:        "#b69bd5",
  clergy:        "#b69bd5",
  monk:          "#b69bd5",
  soldier:       "#e8a29a",
  military:      "#e8a29a",
  gossip:        "#c8b090",
  inventor:      "#c4a24a",
  child:         "#8fbc84",
  healer:        "#8fbc84",
  criminal:      "#efa39b",
  entertainer:   "#ddb075",
  petitioner:    "#c1b49b",
  advisor:       "#d4a44c",
  mystery:       "#a9a7ce",
  tradition:     "#c1b49b",
  staff:         "#c8b090",
  collective:    "#c5b399",
  specialist:    "#d3bb83",
  dispute_light: "#ddb075",
};

// ─── Portrait background map ────────────────────────────────────

const PORTRAIT_BG: Partial<Record<PortraitType, string>> = {
  peasant:    "linear-gradient(135deg, #4a3728, #2d2018)",
  beggar:     "linear-gradient(135deg, #4a3728, #2d2018)",
  child:      "linear-gradient(135deg, #4a3728, #2d2018)",
  gossip:     "linear-gradient(135deg, #4a3728, #2d2018)",
  petitioner: "linear-gradient(135deg, #4a3728, #2d2018)",
  collective: "linear-gradient(135deg, #4a3728, #2d2018)",
  entertainer:"linear-gradient(135deg, #4a3728, #2d2018)",
  healer:     "linear-gradient(135deg, #4a3728, #2d2018)",
  merchant:   "linear-gradient(135deg, #2d4a28, #1a2d14)",
  specialist: "linear-gradient(135deg, #2d4a28, #1a2d14)",
  inventor:   "linear-gradient(135deg, #2d4a28, #1a2d14)",
  clergy:     "linear-gradient(135deg, #3a2850, #221838)",
  priest:     "linear-gradient(135deg, #3a2850, #221838)",
  monk:       "linear-gradient(135deg, #3a2850, #221838)",
  military:   "linear-gradient(135deg, #3a3a40, #222228)",
  soldier:    "linear-gradient(135deg, #3a3a40, #222228)",
  criminal:   "linear-gradient(135deg, #3a3a40, #222228)",
  mystery:    "linear-gradient(135deg, #2a2a3a, #181828)",
  advisor:    "linear-gradient(135deg, #4a3a10, #2d2408)",
  staff:      "linear-gradient(135deg, #3a3020, #252018)",
};

const MOOD_BORDER: Partial<Record<PortraitTone, string>> = {
  serious:    "#a89070",
  neutral:    "#d4a44c",
  light:      "#44aa88",
  tense:      "#c44444",
  mysterious: "#6688aa",
};

// ─── Typewriter Text ─────────────────────────────────────────────

function TypewriterText({ text, speed = 25, onComplete }: { text: string; speed?: number; onComplete?: (focusResponse: boolean) => void }) {
  const [len, setLen] = useState(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setLen(0);
    completedRef.current = false;

    let i = 0;
    const timer = setInterval(() => {
      if (completedRef.current) {
        clearInterval(timer);
        return;
      }
      i++;
      if (i >= text.length) {
        setLen(text.length);
        clearInterval(timer);
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.(false);
        }
      } else {
        setLen(i);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed]);

  const skip = (focusResponse = false) => {
    setLen(text.length);
    if (!completedRef.current) {
      completedRef.current = true;
      onCompleteRef.current?.(focusResponse);
    }
  };

  const isDone = len >= text.length;

  return (
    <>
      <p style={{
        fontFamily: "Crimson Text, serif", fontStyle: "italic", fontSize: "1rem",
        color: HALL.bodyText, lineHeight: 1.6, margin: 0,
      }}>
        &ldquo;<span
          onClick={!isDone ? () => skip() : undefined}
          style={{ cursor: isDone ? "default" : "pointer" }}
        >
          {text.slice(0, len)}
          {!isDone && <span className="dispute-cursor">|</span>}
        </span>&rdquo;
      </p>
      {!isDone && (
        <button className="audience-skip" onClick={e => skip(e.currentTarget.matches(':focus-visible'))}>
          Reveal full petition
        </button>
      )}
    </>
  );
}

// ─── NPC Portrait ────────────────────────────────────────────────

function NpcPortrait({ initial, type = "peasant", tone = "neutral", size = 64 }: { initial: string; type?: PortraitType; tone?: PortraitTone; size?: number }) {
  const bg = PORTRAIT_BG[type] || PORTRAIT_BG.peasant;
  const borderColor = MOOD_BORDER[tone] || MOOD_BORDER.neutral;

  return (
    <div
      style={{
        width: size,
        height: size,
        border: `3px solid ${borderColor}`,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Cinzel Decorative, Cinzel, serif",
        fontSize: size * 0.35,
        color: HALL.parchment,
        background: bg,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

// ─── Type Badge ──────────────────────────────────────────────────

function TypeBadge({ type }: { type: AudiencePetitionerType }) {
  const color = TYPE_COLORS[type] || TYPE_COLORS.petitioner;
  return (
    <span
      style={{
        fontFamily: "Cinzel, serif",
        fontSize: "0.875rem",
        color,
        letterSpacing: "2px",
        textTransform: "uppercase",
        border: `1px solid ${color}55`,
        borderRadius: 3,
        padding: "1px 6px",
        backgroundColor: `${color}15`,
      }}
    >
      {type}
    </span>
  );
}

// ─── Consequence Preview (arrows on hover) ───────────────────────

function ConsequencePreview({ consequences }: { consequences: Readonly<HallMeterEffects> }) {
  const labels: Record<keyof HallMeterEffects, { name: string; color: string }> = {
    people:   { name: "People",   color: HALL.forestGreen },
    treasury: { name: "Treasury", color: "#c4a24a" },
    church:   { name: "Church",   color: "#6a4a8a" },
    military: { name: "Military", color: HALL.bloodRed },
  };

  const items = (['people', 'treasury', 'church', 'military'] as const)
    .filter(key => consequences[key] !== 0).map(key => [key, consequences[key]] as const);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" style={{ marginTop: 6 }}>
      {items.map(([key, val]) => {
        const info = labels[key];
        if (!info) return null;
        const isPositive = val > 0;
        const magnitude = Math.abs(val) >= 5 ? 2 : 1;
        const arrow = isPositive ? "\u25B2" : "\u25BC";
        const arrows = magnitude === 2 ? arrow + arrow : arrow;
        return (
          <span
            key={key}
            style={{
              fontSize: "0.875rem",
              fontFamily: "Cinzel, serif",
              color: isPositive ? "var(--audience-positive)" : "var(--audience-negative)",
              letterSpacing: "1px",
            }}
          >
            {info.name} {arrows}
          </span>
        );
      })}
    </div>
  );
}

// ─── Consequence Result (shows actual numbers in aftermath) ──────

function ConsequenceResult({ consequences }: { consequences: Readonly<HallMeterEffects> }) {
  const colors: Record<keyof HallMeterEffects, string> = {
    people:   HALL.forestGreen,
    treasury: "#c4a24a",
    church:   "#6a4a8a",
    military: HALL.bloodRed,
  };

  const items = (['people', 'treasury', 'church', 'military'] as const)
    .filter(key => consequences[key] !== 0).map(key => [key, consequences[key]] as const);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3" style={{ marginTop: 6 }}>
      {items.map(([key, val]) => {
        const isPos = val > 0;
        return (
          <span
            key={key}
            style={{
              fontFamily: "Cinzel, serif",
              fontSize: "0.875rem",
              color: isPos ? "var(--audience-positive)" : "var(--audience-negative)",
              padding: "2px 8px",
              borderRadius: 3,
              border: `1px solid ${colors[key] || HALL.stoneLight}`,
              backgroundColor: "rgba(26,23,20,0.5)",
            }}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}{" "}
            {isPos ? "+" : ""}{val}
          </span>
        );
      })}
    </div>
  );
}

// ─── Styled Button ───────────────────────────────────────────────

function HallButton({ children, onClick, variant = "primary", style: extraStyle }: { children: ReactNode; onClick: () => void; variant?: "primary" | "secondary"; style?: CSSProperties }) {
  const isPrimary = variant === "primary";
  const baseColor = isPrimary ? HALL.torchGold : HALL.dimText;

  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "Cinzel, serif",
        fontSize: "0.875rem",
        color: baseColor,
        background: "none",
        border: `1px solid ${baseColor}`,
        padding: "8px 24px",
        borderRadius: 4,
        cursor: "pointer",
        transition: "all 200ms ease",
        ...extraStyle,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = `${baseColor}26`;
        e.currentTarget.style.borderColor = isPrimary ? HALL.torchGold : HALL.mutedText;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.borderColor = baseColor;
      }}
    >
      {children}
    </button>
  );
}

// ─── QUEUE VIEW ──────────────────────────────────────────────────

function QueueView({ encounters, resolvedIds, onSelectEncounter, onReturn }: Pick<AudienceChamberProps, 'encounters' | 'resolvedIds' | 'onReturn'> & { onSelectEncounter: (encounter: AudienceEncounter) => void }) {
  const pendingCount = encounters.filter((e) => !resolvedIds.includes(e.id)).length;
  const allDone = pendingCount === 0;

  return (
    <div>
      {/* Header */}
      <div className="text-center" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64,
            height: 64,
            border: `2px solid ${HALL.torchGold}`,
            borderRadius: 8,
            background:
              "linear-gradient(135deg, #2a2520 0%, #1a1714 50%, #2a2520 100%)",
            boxShadow:
              "0 0 20px rgba(212,164,76,0.15), inset 0 0 20px rgba(0,0,0,0.3)",
            marginBottom: 8,
          }}
        >
          <Users size={28} style={{ color: HALL.torchGold }} />
        </div>
        <h3
          style={{
            fontFamily: "Cinzel Decorative, Cinzel, serif",
            fontSize: "0.95rem",
            color: HALL.torchGold,
            letterSpacing: "2px",
            textTransform: "uppercase",
            margin: "4px 0",
          }}
        >
          Audience Chamber
        </h3>
        <p
          style={{
            fontFamily: "Crimson Text, serif",
            fontStyle: "italic",
            fontSize: "0.875rem",
            color: HALL.mutedText,
            margin: 0,
          }}
        >
          {allDone
            ? "All visitors have been heard. The chamber falls quiet."
            : `Hold court with your people. ${pendingCount} visitor${pendingCount !== 1 ? "s" : ""} await${pendingCount === 1 ? "s" : ""}.`}
        </p>
      </div>

      {/* Visitor Queue */}
      <div
        style={{
          border: `1px solid ${HALL.stoneLight}`,
          borderRadius: 6,
          backgroundColor: "rgba(42,37,32,0.5)",
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        {encounters.map((enc, i) => {
          const isResolved = resolvedIds.includes(enc.id);
          return (
            <button
              key={enc.id}
              onClick={() => !isResolved && onSelectEncounter(enc)}
              disabled={isResolved}
              className="w-full flex items-start gap-3 text-left"
              style={{
                padding: "12px 14px",
                borderTop: i > 0 ? `1px solid ${HALL.stone}` : "none",
                background: "none",
                borderLeft: "none",
                borderRight: "none",
                borderBottom: "none",
                cursor: isResolved ? "default" : "pointer",
                opacity: 1,
                transition: "all 200ms ease",
              }}
              onMouseEnter={(e) => {
                if (!isResolved) {
                  e.currentTarget.style.backgroundColor = "rgba(42,37,32,0.8)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {/* Portrait */}
              <NpcPortrait
                initial={enc.name.charAt(0)}
                type={enc.type}
                tone={enc.tone}
                size={48}
              />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 3 }}>
                  <span
                    style={{
                      fontFamily: "Cinzel, serif",
                      fontSize: "0.875rem",
                      color: isResolved ? HALL.dimText : HALL.torchGold,
                      textDecoration: isResolved ? "line-through" : "none",
                    }}
                  >
                    {enc.name}
                  </span>
                  <TypeBadge type={enc.type} />
                </div>
                <p
                  style={{
                    fontFamily: "Crimson Text, serif",
                    fontSize: "0.875rem",
                    color: isResolved ? HALL.dimText : HALL.mutedText,
                    fontStyle: "italic",
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  {enc.preview}
                </p>
              </div>

              {/* Arrow */}
              {!isResolved && (
                <ChevronRight
                  size={16}
                  style={{ color: HALL.torchGold, flexShrink: 0, marginTop: 4 }}
                />
              )}
              {isResolved && (
                <span
                  style={{
                    fontFamily: "Cinzel, serif",
                    fontSize: "0.875rem",
                    color: HALL.dimText,
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                    flexShrink: 0,
                    marginTop: 4,
                  }}
                >
                  Heard
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Return button */}
      <div className="text-center">
        <HallButton onClick={onReturn} variant="secondary">
          <ArrowLeft size={14} className="inline-block" style={{ marginRight: 6, verticalAlign: "middle" }} />
          Return to Throne
        </HallButton>
      </div>
    </div>
  );
}

// ─── ACTIVE ENCOUNTER VIEW ───────────────────────────────────────

function ActiveEncounter({ encounter, onSelectResponse }: { encounter: AudienceEncounter; onSelectResponse: (index: number) => void }) {
  const [speechDone, setSpeechDone] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const firstResponse = useRef<HTMLButtonElement>(null);
  const focusResponse = useRef(false);
  const handleSpeechComplete = useCallback((keyboard: boolean) => {
    focusResponse.current = keyboard;
    setSpeechDone(true);
  }, []);
  useEffect(() => {
    if (speechDone && focusResponse.current) {
      focusResponse.current = false;
      firstResponse.current?.focus();
    }
  }, [speechDone]);

  return (
    <div>
      {/* Title */}
      <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
        <Users size={14} style={{ color: HALL.torchGold }} />
        <span
          style={{
            fontFamily: "Cinzel, serif",
            fontSize: "0.875rem",
            color: HALL.torchGold,
            letterSpacing: "2px",
            textTransform: "uppercase",
          }}
        >
          Audience with {encounter.name}
        </span>
      </div>

      {/* NPC card */}
      <div
        className="herald-fade"
        style={{
          padding: 14,
          borderRadius: 6,
          border: `1px solid ${HALL.stoneLight}`,
          backgroundColor: "rgba(42,37,32,0.5)",
          marginBottom: 16,
        }}
      >
        {/* Portrait row */}
        <div className="flex items-start gap-3" style={{ marginBottom: 12 }}>
          <NpcPortrait
            initial={encounter.name.charAt(0)}
            type={encounter.type}
            tone={encounter.tone}
            size={64}
          />
          <div>
            <h4
              style={{
                fontFamily: "Cinzel, serif",
                fontSize: "0.875rem",
                color: HALL.torchGold,
                margin: "0 0 3px",
              }}
            >
              {encounter.name}
            </h4>
            <TypeBadge type={encounter.type} />
          </div>
        </div>

        {/* Speech — typewriter reveal */}
        <TypewriterText text={encounter.speech} speed={25} onComplete={handleSpeechComplete} />
      </div>

      {/* Responses — appear after speech completes */}
      {speechDone && (
        <div className="evidence-reveal">
          <h4
            style={{
              fontFamily: "Cinzel Decorative, Cinzel, serif",
              fontSize: "0.875rem",
              color: HALL.torchGold,
              letterSpacing: "2px",
              textTransform: "uppercase",
              textAlign: "center",
              margin: "0 0 12px",
            }}
          >
            Your Response
          </h4>

          <div className="flex flex-col gap-3">
            {encounter.responses.map((resp, idx) => (
              <button
                key={idx}
                className="ruling-card"
                ref={idx === 0 ? firstResponse : null}
                onFocus={() => setHoveredIdx(idx)}
                onBlur={() => setHoveredIdx(null)}
                onClick={() => onSelectResponse(idx)}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={e => { if (e.currentTarget !== document.activeElement) setHoveredIdx(null); }}
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderRadius: 6,
                  border: `1px solid ${HALL.stoneLight}`,
                  backgroundColor:
                    hoveredIdx === idx
                      ? "rgba(42,37,32,0.7)"
                      : "rgba(42,37,32,0.4)",
                  cursor: "pointer",
                  transition: "all 200ms ease",
                }}
              >
                <h5
                  style={{
                    fontFamily: "Cinzel, serif",
                    fontSize: "0.875rem",
                    color: HALL.torchGold,
                    margin: "0 0 4px",
                  }}
                >
                  {resp.label}
                </h5>
                <p
                  style={{
                    fontFamily: "Crimson Text, serif",
                    fontSize: "0.875rem",
                    color: HALL.mutedText,
                    lineHeight: 1.3,
                    margin: 0,
                  }}
                >
                  {resp.text}
                </p>
                {hoveredIdx === idx && (
                  <ConsequencePreview consequences={resp.consequences} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AFTERMATH VIEW ──────────────────────────────────────────────

function AftermathView({ encounter, response, onNext, onReturn, hasMore }: { encounter: AudienceEncounter; response: AudienceResponse; onNext: () => void; onReturn: () => void; hasMore: boolean }) {
  const [showHistNote, setShowHistNote] = useState(false);

  return (
    <div>
      {/* Decree */}
      <div
        className="decree-appear"
        style={{
          padding: 16,
          borderRadius: 6,
          border: `2px solid ${HALL.torchGold}55`,
          backgroundColor: "rgba(232,220,200,0.06)",
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontFamily: "Cinzel, serif",
            fontSize: "0.875rem",
            color: HALL.dimText,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          Your Decree
        </span>
        <p
          style={{
            fontFamily: "Crimson Text, serif",
            fontSize: "1rem",
            color: HALL.parchment,
            lineHeight: 1.5,
            margin: "6px 0 0",
          }}
        >
          &ldquo;{response.text}&rdquo;
        </p>
      </div>

      {/* Aftermath */}
      <div
        style={{
          padding: 12,
          borderRadius: 6,
          border: `1px solid ${HALL.stoneLight}`,
          backgroundColor: "rgba(42,37,32,0.5)",
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontFamily: "Cinzel, serif",
            fontSize: "0.875rem",
            color: HALL.dimText,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          What Follows
        </span>
        <p
          style={{
            fontFamily: "Crimson Text, serif",
            fontSize: "1rem",
            color: HALL.bodyText,
            lineHeight: 1.5,
            margin: "6px 0 0",
          }}
        >
          {response.aftermath}
        </p>
      </div>

      {/* Consequences */}
      <div
        style={{
          padding: 12,
          borderRadius: 6,
          border: `1px solid ${HALL.stone}`,
          backgroundColor: "rgba(26,23,20,0.5)",
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontFamily: "Cinzel, serif",
            fontSize: "0.875rem",
            color: HALL.dimText,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          Consequences
        </span>
        <ConsequenceResult consequences={response.consequences} />
      </div>

      {/* Historical Note Toggle */}
      {encounter.historicalNote && (
        <div style={{ maxWidth: 500, margin: "0 auto 16px" }}>
          <button
            onClick={() => setShowHistNote(!showHistNote)}
            className="flex items-center gap-2"
            style={{
              margin: "0 auto",
              fontFamily: "Cinzel, serif",
              fontSize: "0.875rem",
              color: HALL.dimText,
              background: "none",
              border: `1px solid ${HALL.stoneLight}`,
              padding: "6px 14px",
              borderRadius: 4,
              cursor: "pointer",
              display: "flex",
              transition: "all 200ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = HALL.dimText;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = HALL.stoneLight;
            }}
          >
            <BookOpen size={14} />
            {showHistNote ? "Hide" : "Show"} Historical Context
          </button>
          {showHistNote && (
            <div
              className="evidence-reveal"
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 6,
                border: `1px solid ${HALL.stoneLight}`,
                backgroundColor: "rgba(42,37,32,0.5)",
                textAlign: "left",
              }}
            >
              <p
                style={{
                  fontFamily: "Crimson Text, serif",
                  fontSize: "0.875rem",
                  color: HALL.bodyText,
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {encounter.historicalNote}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {hasMore && (
          <HallButton onClick={onNext}>
            Next Visitor
          </HallButton>
        )}
        <HallButton onClick={onReturn} variant={hasMore ? "secondary" : "primary"}>
          <ArrowLeft size={14} className="inline-block" style={{ marginRight: 6, verticalAlign: "middle" }} />
          Return to Queue
        </HallButton>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────

export default function AudienceChamber({ encounters, resolvedIds, onRespond, onReturn }: AudienceChamberProps) {
  const [view, setView] = useState<AudienceView>({ kind: 'queue' });
  const sessionEncounters = encounters.slice(0, 5);
  const returnToQueue = () => setView({ kind: 'queue' });
  const selectResponse = (index: number) => {
    if (view.kind !== 'active') return;
    const response = view.encounter.responses[index];
    if (!response) return;
    onRespond(view.encounter.id, index);
    setView({ kind: 'aftermath', encounter: view.encounter, response });
  };

  return (
    <div className="audience-view" onFocusCapture={event => {
      if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) {
        event.target.scrollIntoView({ block: 'center' });
      }
    }}>
      {view.kind === 'queue' && (
        <QueueView encounters={sessionEncounters} resolvedIds={resolvedIds}
          onSelectEncounter={encounter => setView({ kind: 'active', encounter })} onReturn={onReturn} />
      )}
      {view.kind === 'active' && (
        <ActiveEncounter encounter={view.encounter} onSelectResponse={selectResponse} />
      )}
      {view.kind === 'aftermath' && (
        <AftermathView encounter={view.encounter} response={view.response}
          onNext={returnToQueue} onReturn={returnToQueue}
          hasMore={sessionEncounters.some(encounter => encounter.id !== view.encounter.id && !resolvedIds.includes(encounter.id))} />
      )}
    </div>
  );
}
