/**
 * ChapelTab.tsx
 *
 * The Chapel of St. Dunstan — Faith pillar of Lord's Ledger.
 * Sub-views: Nave (hub), Father Anselm (tithe), Brother Caedmon (shop),
 * Scriptorium (manuscript mini-game), Moral Dilemmas.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { CSSProperties, Dispatch, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { ChapelItem } from "../data/chapel.ts";
import type { ChapelAction, ChapelView, ChapelViewState } from "../engine/chapelState.ts";

interface ChapelProps {
  state: { denarii: number; chapel?: ChapelViewState | null };
  dispatch: Dispatch<ChapelAction>;
}
interface ChapelNavigation {
  onSetView: (view: ChapelView) => void;
  onStartManuscript: () => void;
}

import {
  Church, Cross, BookOpen, ShoppingBag, Scale, Heart,
  Shield, AlertTriangle, Eye, Star, Scroll, ChevronRight,
  Coins, X, MessageSquare,
} from "lucide-react";
import {
  ANSELM_GREETINGS,
  CAEDMON_GREETINGS, SHOP_ITEMS,
  MORAL_DILEMMAS, MANUSCRIPT_SYMBOLS,
  PIETY_FLAVOR,
} from "../data/chapel.ts";
import { isPositivePrice } from "../engine/transactionValidation.ts";
import { chapelChoiceCost, canAffordChapelChoice } from "../engine/chapelChoices.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickRandom(arr: readonly string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

/** Map dilemma choice icon names to lucide components */
const ICON_MAP = {
  Heart, Scale, Coins, Star, Eye, BookOpen, Shield, Cross,
  Church, MessageSquare, AlertTriangle, Scroll, X,
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SYMBOL_DESCRIPTIONS = [
  "Cross of Jerusalem", "Four-pointed star", "Shamrock", "Fleur-de-lis",
  "Maltese cross", "Diamond", "Four diamonds", "Church",
] as const;

const COLORS = {
  bg: "#0d0b0e",
  cardBg: "linear-gradient(135deg, rgba(35, 30, 25, 0.95), rgba(28, 24, 20, 0.98))",
  cardBorder: "rgba(140, 110, 70, 0.25)",
  text: "var(--chapel-text)",
  dim: "var(--chapel-secondary)",
  muted: "var(--chapel-secondary)",
  gold: "#c9a84c",
  faithBlue: "#7eb8d4",
  piety: "#b89adb",
  happiness: "#8dba6e",
  danger: "#d4726a",
};

const cardStyle: CSSProperties = {
  background: COLORS.cardBg,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: "4px",
};

const speechBubble: CSSProperties = {
  background: "linear-gradient(135deg, rgba(40, 32, 24, 0.95), rgba(30, 25, 18, 0.98))",
  border: "1px solid rgba(160, 130, 70, 0.2)",
  borderLeft: "3px solid rgba(160, 130, 70, 0.4)",
  borderRadius: "2px 6px 6px 2px",
  padding: "16px 20px",
  fontStyle: "italic",
  lineHeight: "1.7",
  fontFamily: "'Crimson Text', serif",
  color: COLORS.text,
};

const goldButton: CSSProperties = {
  background: "linear-gradient(135deg, #8a7a3a 0%, #c9a84c 50%, #8a7a3a 100%)",
  color: "#1a1510",
  border: "1px solid rgba(201, 168, 76, 0.6)",
  borderRadius: "4px",
  fontFamily: "'Cinzel', serif",
  fontWeight: 700,
  letterSpacing: "1px",
  cursor: "pointer",
  transition: "all 200ms ease",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChapelNav({ view, onSetView, onStartManuscript }: ChapelNavigation & { view: ChapelView }) {
  const tabs: { id: ChapelView; label: string; Icon: LucideIcon }[] = [
    { id: "nave", label: "The Nave", Icon: Church },
    { id: "anselm", label: "Father Anselm", Icon: Cross },
    { id: "caedmon", label: "Brother Caedmon", Icon: ShoppingBag },
    { id: "manuscript", label: "Scriptorium", Icon: BookOpen },
  ];
  return (
    <nav aria-label="Chapel" className="chapel-nav mb-4">
      {tabs.map((tab) => {
        const active = view === tab.id;
        return (
          <button
            key={tab.id}
            aria-current={active ? "page" : undefined}
            onClick={() => {
              if (tab.id === "manuscript") {
                onStartManuscript();
              } else {
                onSetView(tab.id);
              }
            }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs uppercase tracking-wider transition-all duration-200"
            style={{
              fontFamily: "'Cinzel', serif",
              fontWeight: 600,
              background: active ? "rgba(201, 168, 76, 0.15)" : "transparent",
              borderBottom: active ? `2px solid ${COLORS.gold}` : "2px solid transparent",
              color: active ? COLORS.gold : COLORS.dim,
              cursor: "pointer",
              borderRadius: "2px 2px 0 0",
            }}
          >
            <tab.Icon size={14} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function NpcPortrait({ symbol, borderColor, name, subtitle }: { symbol: string; borderColor: string; name: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 48, height: 48, borderRadius: "50%",
          border: `2px solid ${borderColor}`,
          background: "rgba(20, 16, 12, 0.8)",
          fontSize: "1.5rem", color: borderColor,
        }}
      >
        {symbol}
      </div>
      <div>
        <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 700, color: borderColor, fontSize: "1.125rem" }}>
          {name}
        </div>
        <div style={{ fontFamily: "'Crimson Text', serif", color: COLORS.dim, fontSize: "1rem", fontStyle: "italic" }}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function MeterBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = clamp((value / max) * 100, 0, 100);
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1" style={{ fontFamily: "'Cinzel', serif" }}>
        <span style={{ color }}>{label}</span>
        <span style={{ color: COLORS.dim }}>{value}/{max}</span>
      </div>
      <div role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} style={{ height: 8, background: "rgba(20, 16, 12, 0.8)", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 4,
            transition: "width 400ms ease",
          }}
        />
      </div>
    </div>
  );
}

function HistoricalContext({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div
      className="mt-4 p-4"
      style={{
        background: "linear-gradient(135deg, rgba(30, 22, 40, 0.6), rgba(25, 18, 35, 0.8))",
        border: "1px solid rgba(184, 154, 219, 0.2)",
        borderRadius: "4px",
      }}
    >
      <div className="text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ fontFamily: "'Cinzel', serif", color: COLORS.piety }}>
        <span>{"\u2726"}</span> {title || "Historical Context"}
      </div>
      <div style={{ fontFamily: "'Crimson Text', serif", color: COLORS.dim, fontSize: "1.125rem", lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

function EffectBadge({ label, value }: { label: string; value: number }) {
  const isPositive = value > 0;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold mr-1 mb-1"
      style={{
        background: isPositive ? "rgba(141, 186, 110, 0.15)" : "rgba(212, 114, 106, 0.15)",
        color: isPositive ? COLORS.happiness : COLORS.danger,
        border: `1px solid ${isPositive ? "rgba(141, 186, 110, 0.3)" : "rgba(212, 114, 106, 0.3)"}`,
        fontFamily: "'Cinzel', serif",
      }}
    >
      {isPositive ? "+" : ""}{value} {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Nave View
// ---------------------------------------------------------------------------

function NaveView({ state, onSetView, onStartManuscript, onStartDilemma }: Pick<ChapelProps, "state"> & ChapelNavigation & { onStartDilemma: () => void }) {
  const chapel = state.chapel;
  const dilemmasRemaining = MORAL_DILEMMAS.length - (chapel?.dilemmasCompleted?.length ?? 0);
  const faith = chapel?.faith ?? 50;
  const piety = chapel?.piety ?? 30;

  const pietyFlavor = PIETY_FLAVOR.find((f) => piety < f.max)?.text ?? "";

  const actions = [
    {
      label: "Speak with Father Anselm",
      desc: "Tithe and counsel",
      Icon: Cross,
      onClick: () => onSetView("anselm"),
    },
    {
      label: "Visit Brother Caedmon",
      desc: "Goods and gossip",
      Icon: ShoppingBag,
      onClick: () => onSetView("caedmon"),
    },
    {
      label: "Enter the Scriptorium",
      desc: "Copy manuscripts for coin",
      Icon: BookOpen,
      onClick: onStartManuscript,
    },
    {
      label: "Moral Dilemma",
      desc: dilemmasRemaining > 0 ? `${dilemmasRemaining} remaining` : "All resolved",
      Icon: Scale,
      onClick: onStartDilemma,
      disabled: dilemmasRemaining <= 0,
    },
  ];

  return (
    <div>
      {/* Chapel header */}
      <div className="text-center mb-6">
        <div style={{ fontSize: "2rem", color: COLORS.gold, marginBottom: "4px" }}>{"\u26EA"}</div>
        <h2 style={{ fontFamily: "'Uncial Antiqua', 'Cinzel', serif", color: COLORS.gold, fontSize: "1.625rem", margin: 0 }}>
          The Chapel of St. Dunstan
        </h2>
        <p style={{ fontFamily: "'Crimson Text', serif", color: COLORS.dim, fontSize: "1.125rem", fontStyle: "italic", marginTop: "6px" }}>
          Stone walls echo with whispered prayers. Candlelight flickers across weathered saints.
        </p>
      </div>

      {/* Action cards 2x2 */}
      <div className="chapel-actions mb-6">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            disabled={a.disabled}
            className="p-4 text-left transition-all duration-200"
            style={{
              ...cardStyle,
              borderStyle: a.disabled ? "dashed" : "solid",
              cursor: a.disabled ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!a.disabled) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.borderColor = "rgba(201, 168, 76, 0.5)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.borderColor = COLORS.cardBorder;
            }}
          >
            <a.Icon size={20} style={{ color: COLORS.gold, marginBottom: "8px" }} />
            <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, color: COLORS.text, fontSize: "1rem" }}>
              {a.label}
            </div>
            <div style={{ fontFamily: "'Crimson Text', serif", color: COLORS.dim, fontSize: ".875rem", marginTop: "2px" }}>
              {a.desc}
            </div>
          </button>
        ))}
      </div>

      {/* Faith & Piety meters */}
      <div className="p-4" style={cardStyle}>
        <MeterBar label="Faith" value={faith} max={100} color={COLORS.faithBlue} />
        <MeterBar label="Piety" value={piety} max={100} color={COLORS.piety} />
        {pietyFlavor && (
          <p className="mt-2 text-xs" style={{ fontFamily: "'Crimson Text', serif", color: COLORS.piety, fontStyle: "italic" }}>
            {pietyFlavor}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Father Anselm View
// ---------------------------------------------------------------------------

function AnselmView({ state, dispatch }: ChapelProps) {
  const chapel = state.chapel;
  const greeting = chapel?.anselmGreeting ?? pickRandom(ANSELM_GREETINGS);
  const [titheInput, setTitheInput] = useState("");
  const titheResponse = chapel?.titheResponse;
  const suggestedTithe = Math.floor(state.denarii * 0.1);
  const titheAmount = Number(titheInput);
  const canGive = isPositivePrice(titheAmount) && titheAmount <= state.denarii;

  function handleTithe(amount: number) {
    if (!isPositivePrice(amount) || amount > state.denarii) return;
    dispatch({ type: "CHAPEL_PAY_TITHE", payload: { amount } });
    setTitheInput("");
  }

  const presets = [
    { label: "Generous (10%)", pct: 0.10 },
    { label: "Modest (5%)", pct: 0.05 },
    { label: "Token (1%)", pct: 0.01 },
  ];

  return (
    <div>
      <NpcPortrait symbol={"\u271D"} borderColor={COLORS.gold} name="Father Anselm" subtitle="Parish Priest of St. Dunstan's" />

      <div style={speechBubble} className="mb-4">
        {greeting}
      </div>

      {/* Tithe system */}
      <div className="p-4 mb-4" style={cardStyle}>
        <div className="text-xs uppercase tracking-wider mb-3" style={{ fontFamily: "'Cinzel', serif", color: COLORS.gold }}>
          {"\u271D"} Tithe Offering
        </div>

        <label htmlFor="chapel-tithe-amount" className="block mb-2 text-sm" style={{ color: COLORS.text }}>
          Donation amount (denarii)
        </label>
        <div className="flex gap-2 mb-3 flex-wrap">
          <input
            id="chapel-tithe-amount"
            step="any"
            type="number"
            min="0"
            max={state.denarii}
            value={titheInput}
            onChange={(e) => setTitheInput(e.target.value)}
            placeholder={`${suggestedTithe}d (10%)`}
            className="flex-1 min-w-0 px-3 py-2 rounded text-sm"
            style={{
              background: "rgba(15, 12, 10, 0.8)",
              border: `1px solid ${COLORS.cardBorder}`,
              color: COLORS.text,
              fontFamily: "'Crimson Text', serif",
            }}
          />
          <button
            onClick={() => handleTithe(titheAmount)}
            disabled={!canGive}
            className="px-4 py-2 text-xs uppercase tracking-wider"
            style={{
              ...goldButton,
              opacity: canGive ? 1 : 0.5,
            }}
          >
            Give
          </button>
        </div>

        <div className="flex gap-2 mb-3 flex-wrap">
          {presets.map((p) => {
            const amt = Math.max(1, Math.floor(state.denarii * p.pct));
            return (
              <button
                key={p.label}
                onClick={() => setTitheInput(String(amt))}
                className="px-3 py-1.5 text-xs rounded transition-all duration-200"
                style={{
                  background: "rgba(201, 168, 76, 0.1)",
                  border: `1px solid rgba(201, 168, 76, 0.3)`,
                  color: COLORS.gold,
                  fontFamily: "'Cinzel', serif",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201, 168, 76, 0.2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(201, 168, 76, 0.1)"; }}
              >
                {p.label} ({amt}d)
              </button>
            );
          })}
        </div>

        {titheResponse && (
          <div style={{ ...speechBubble, marginTop: "12px", fontSize: "1.125rem" }}>
            {titheResponse}
          </div>
        )}
      </div>

      <HistoricalContext title="The Medieval Tithe">
        <p className="mb-2">
          The word "tithe" means "one-tenth." Medieval Christians were expected to give 10% of all they produced to the Church. In practice, tithes were collected as grain, livestock, or coin.
        </p>
        <p className="mb-2">
          The parish priest was the most important person in village life after the lord. He performed baptisms, marriages, and funerals. He settled disputes, kept records, and served as counselor to rich and poor alike.
        </p>
        <p>
          Refusing to tithe could result in excommunication — being cut off from the Church entirely. In medieval Europe, this was a social death sentence. You couldn't receive sacraments, and many believed your soul would be damned.
        </p>
      </HistoricalContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brother Caedmon View
// ---------------------------------------------------------------------------

function CaedmonView({ state, dispatch }: ChapelProps) {
  const chapel = state.chapel;
  const greeting = chapel?.caedmonGreeting ?? pickRandom(CAEDMON_GREETINGS);
  const ownedItems = chapel?.inventory ?? [];

  function handleBuy(item: ChapelItem) {
    if (state.denarii < item.cost) return;
    if (ownedItems.includes(item.id)) return;
    dispatch({ type: "CHAPEL_BUY_ITEM", payload: { itemId: item.id } });
  }

  return (
    <div>
      <NpcPortrait symbol={"\u2618"} borderColor={COLORS.happiness} name="Brother Caedmon" subtitle="Traveling Monk & Merchant" />

      <div style={speechBubble} className="mb-4">
        {greeting}
      </div>

      {/* Shop */}
      <div className="mb-4">
        <div className="text-xs uppercase tracking-wider mb-3" style={{ fontFamily: "'Cinzel', serif", color: COLORS.happiness }}>
          {"\u2618"} Monastery Goods
        </div>

        <div className="space-y-2">
          {SHOP_ITEMS.map((item) => {
            const owned = ownedItems.includes(item.id);
            const canAfford = state.denarii >= item.cost;
            return (
              <div
                key={item.id}
                className="chapel-shop-item gap-3 p-3 transition-all duration-200"
                style={{
                  ...cardStyle,
                  borderColor: owned ? "rgba(141, 186, 110, 0.45)" : COLORS.cardBorder,
                }}
              >
                {/* Icon */}
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 36, height: 36, borderRadius: "4px",
                    background: "rgba(15, 12, 10, 0.8)",
                    border: `1px solid ${COLORS.cardBorder}`,
                    fontSize: "1.375rem", color: COLORS.gold,
                  }}
                >
                  {item.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 600, color: COLORS.text, fontSize: "1rem" }}>
                      {item.name}
                    </span>
                    <span style={{ fontFamily: "'Cinzel', serif", color: COLORS.gold, fontSize: ".875rem" }}>
                      {item.cost}d
                    </span>
                  </div>
                  <div style={{ fontFamily: "'Crimson Text', serif", color: COLORS.dim, fontSize: ".875rem", fontStyle: "italic" }}>
                    {item.description}
                  </div>
                  <div style={{ fontFamily: "'Crimson Text', serif", color: COLORS.faithBlue, fontSize: ".875rem", marginTop: "2px" }}>
                    {item.effectText}
                  </div>
                </div>

                {/* Buy button */}
                <div className="chapel-shop-action">
                  {owned ? (
                    <span className="text-xs font-semibold" style={{ color: COLORS.happiness, fontFamily: "'Cinzel', serif" }}>
                      {"\u2713"} Owned
                    </span>
                  ) : (
                    <button
                      onClick={() => handleBuy(item)}
                      disabled={!canAfford}
                      className="px-3 py-1.5 text-xs uppercase tracking-wider"
                      style={{
                        ...goldButton,
                        background: canAfford ? goldButton.background : "#302a20",
                        color: canAfford ? goldButton.color : COLORS.text,
                        cursor: canAfford ? "pointer" : "not-allowed",
                        fontSize: ".875rem",
                      }}
                    >
                      Buy
                    </button>
                  )}
                  {!owned && !canAfford && (
                    <p className="text-xs mt-2" style={{ color: COLORS.danger }}>
                      Requires {item.cost}d · Treasury: {state.denarii}d
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <HistoricalContext title="Monks and Commerce">
        <p className="mb-2">
          Traveling monks were vital links between villages. They carried news, traded monastery goods, and spread knowledge along medieval roads.
        </p>
        <p className="mb-2">
          Monasteries were economic powerhouses. Monks brewed beer, made cheese, cultivated herbs, and produced the finest manuscripts in Europe. Their goods were prized for quality.
        </p>
        <p>
          The relic trade was enormous — and enormously sketchy. There were enough alleged pieces of the True Cross traveling medieval Europe to build an entire ship, and enough saints' finger bones to staff a skeleton army.
        </p>
      </HistoricalContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scriptorium View (Manuscript Mini-Game)
// ---------------------------------------------------------------------------

function ScriptoriumView({ state, dispatch }: ChapelProps) {
  const chapel = state.chapel;
  const msPhase = chapel?.msPhase ?? "idle";
  const rawPattern = chapel?.msPattern;
  const msPattern = useMemo(() => rawPattern ?? [], [rawPattern]);
  const msPlayerInput = chapel?.msPlayerInput ?? [];
  const msRound = chapel?.msRound ?? 1;
  const msMaxRound = chapel?.msMaxRound ?? 4;
  const msActiveSymbol = chapel?.msActiveSymbol;
  const msFact = chapel?.msFact;
  const msReward = chapel?.msReward ?? 0;
  const hasQuill = (chapel?.inventory ?? []).includes("quill_ink");

  const showingRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);

  // Flash sequence during "showing" phase
  useEffect(() => {
    if (msPhase !== "showing" || showingRef.current) return;
    showingRef.current = true;

    const clear = () => {
      timeoutsRef.current.forEach(window.clearTimeout);
      timeoutsRef.current = [];
    };

    clear();

    msPattern.forEach((symbolIdx, i) => {
      const flashDelay = i * 850;
      const clearDelay = flashDelay + 500;

      timeoutsRef.current.push(
        window.setTimeout(() => dispatch({ type: "CHAPEL_MS_FLASH", payload: { index: symbolIdx } }), flashDelay)
      );
      timeoutsRef.current.push(
        window.setTimeout(() => dispatch({ type: "CHAPEL_MS_CLEAR_FLASH" }), clearDelay)
      );
    });

    // Transition to input phase after sequence
    const totalTime = msPattern.length * 850 + 200;
    timeoutsRef.current.push(
      window.setTimeout(() => {
        dispatch({ type: "CHAPEL_MS_DONE_SHOWING" });
        showingRef.current = false;
      }, totalTime)
    );

    return () => {
      clear();
      showingRef.current = false;
    };
  }, [msPhase, msPattern, dispatch]);

  // Reset showingRef when phase changes away from showing
  useEffect(() => {
    if (msPhase !== "showing") {
      showingRef.current = false;
    }
  }, [msPhase]);

  function handleSymbolClick(index: number) {
    if (msPhase !== "input") return;
    dispatch({ type: "CHAPEL_MS_INPUT", payload: { index } });
  }

  const statusColors = {
    idle: COLORS.dim,
    showing: COLORS.gold,
    input: COLORS.faithBlue,
    success: COLORS.happiness,
    fail: COLORS.danger,
  };

  const statusText = {
    idle: "Prepare to copy...",
    showing: "Watch the pattern carefully...",
    input: "Now repeat the sequence!",
    success: "Excellent work, scribe!",
    fail: "The ink smudges... try again.",
  };

  // Round indicator dots
  const roundDots = Array.from({ length: msMaxRound }, (_, i) => (
    <span
      key={i}
      className="inline-block mx-0.5"
      style={{
        width: 8, height: 8, borderRadius: "50%",
        background: i < msRound - 1 ? COLORS.gold : (i === msRound - 1 && (msPhase === "success" || msPhase === "fail") ? (msPhase === "success" ? COLORS.happiness : COLORS.danger) : "rgba(201, 168, 76, 0.2)"),
        border: `1px solid ${COLORS.gold}`,
      }}
    />
  ));

  return (
    <div>
      <div className="text-center mb-4">
        <h3 style={{ fontFamily: "'Uncial Antiqua', 'Cinzel', serif", color: COLORS.gold, fontSize: "1.375rem" }}>
          The Scriptorium
        </h3>
        <p style={{ fontFamily: "'Crimson Text', serif", color: COLORS.dim, fontSize: "1rem", fontStyle: "italic" }}>
          Copy the illuminated symbols in order. The patterns grow longer each round.
        </p>
      </div>

      {/* Status */}
      <div role="status" aria-live="polite" className="text-center mb-3">
        <div aria-hidden="true" className="mb-1">{roundDots}</div>
        <p className="text-xs mb-2" style={{ color: COLORS.dim }}>Round {msRound} of {msMaxRound}</p>
        <span className="text-sm" style={{ fontFamily: "'Cinzel', serif", color: statusColors[msPhase] }}>
          {statusText[msPhase]}
        </span>
        {msPhase === "input" && (
          <span className="ml-2 text-xs" style={{ color: COLORS.dim }}>
            ({msPlayerInput.length}/{msPattern.length})
          </span>
        )}
      </div>

      {/* Symbol grid */}
      <div className="grid grid-cols-4 gap-3 max-w-xs mx-auto mb-4">
        {MANUSCRIPT_SYMBOLS.map((sym, idx) => {
          const isFlashing = msActiveSymbol === idx;
          const isClickable = msPhase === "input";
          return (
            <button
              key={idx}
              aria-description={SYMBOL_DESCRIPTIONS[idx]}
              onClick={() => handleSymbolClick(idx)}
              disabled={!isClickable}
              className="flex items-center justify-center transition-all duration-200"
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: "6px",
                fontSize: "1.75rem",
                background: isFlashing
                  ? "rgba(201, 168, 76, 0.3)"
                  : "rgba(20, 16, 12, 0.8)",
                border: isFlashing
                  ? `2px solid ${COLORS.gold}`
                  : `1px solid ${COLORS.cardBorder}`,
                color: isFlashing ? COLORS.gold : COLORS.dim,
                boxShadow: isFlashing
                  ? `0 0 16px rgba(201, 168, 76, 0.4), inset 0 0 8px rgba(201, 168, 76, 0.1)`
                  : "none",
                transform: isFlashing ? "scale(1.08)" : "scale(1)",
                cursor: isClickable ? "pointer" : "default",
              }}
            >
              {sym}
            </button>
          );
        })}
      </div>

      {/* Completion panel */}
      {(msPhase === "success" || msPhase === "fail") && (
        <section role="region" aria-label="Manuscript result" tabIndex={0} className="chapel-result p-4 mb-4" style={cardStyle}>
          {msPhase === "success" && (
            <div className="text-center mb-3">
              <div className="text-lg mb-1" style={{ color: COLORS.happiness, fontFamily: "'Cinzel', serif", fontWeight: 700 }}>
                Manuscript Copied Successfully!
              </div>
              <div className="flex justify-center gap-2 flex-wrap">
                <EffectBadge label="Denarii" value={msReward} />
                <EffectBadge label="Faith" value={5} />
                <EffectBadge label="Piety" value={3} />
              </div>
              {hasQuill && (
                <p className="text-xs mt-2" style={{ color: COLORS.happiness, fontStyle: "italic" }}>
                  {"\u2726"} Quill & Ink bonus active: +5d on successful copies
                </p>
              )}
            </div>
          )}

          {msPhase === "fail" && (
            <div className="text-center mb-3">
              <div className="text-lg mb-1" style={{ color: COLORS.danger, fontFamily: "'Cinzel', serif" }}>
                The ink smudges...
              </div>
              <p style={{ fontFamily: "'Crimson Text', serif", color: COLORS.dim, fontSize: "1rem" }}>
                No penalty — even the best scribes make mistakes. Try again!
              </p>
            </div>
          )}

          {/* Educational fact */}
          {msFact && (
            <div
              className="p-3 mt-3"
              style={{
                background: "rgba(126, 184, 212, 0.08)",
                border: `1px solid rgba(126, 184, 212, 0.2)`,
                borderRadius: "4px",
              }}
            >
              <div className="text-xs uppercase mb-1" style={{ fontFamily: "'Cinzel', serif", color: COLORS.faithBlue }}>
                {"\u2726"} Did You Know?
              </div>
              <p style={{ fontFamily: "'Crimson Text', serif", color: COLORS.text, fontSize: "1rem", lineHeight: 1.6 }}>
                {msFact}
              </p>
            </div>
          )}

          <div className="flex justify-center gap-3 mt-4 flex-wrap">
            <button
              onClick={() => dispatch({ type: "CHAPEL_MS_START" })}
              className="px-4 py-2 text-xs uppercase tracking-wider"
              style={goldButton}
            >
              Try Again
            </button>
            <button
              onClick={() => dispatch({ type: "CHAPEL_SET_VIEW", payload: { view: "nave" } })}
              className="px-4 py-2 text-xs uppercase tracking-wider"
              style={{
                ...goldButton,
                background: "transparent",
                color: COLORS.dim,
                border: `1px solid ${COLORS.cardBorder}`,
              }}
            >
              Return to Chapel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dilemma View
// ---------------------------------------------------------------------------

function DilemmaView({ state, dispatch }: ChapelProps) {
  const chapel = state.chapel;
  // Resolve stored identity against current authored copy, including older Bishop wording.
  const dilemma = MORAL_DILEMMAS.find(item => item.id === chapel?.currentDilemma?.id);
  const result = chapel?.dilemmaResult;

  if (!dilemma) return null;

  function handleChoice(choiceIndex: number) {
    dispatch({ type: "CHAPEL_RESOLVE_DILEMMA", payload: { choiceIndex } });
  }

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-4">
        <Scale size={28} style={{ color: COLORS.gold, margin: "0 auto 8px" }} />
        <h3 style={{ fontFamily: "'Uncial Antiqua', 'Cinzel', serif", color: COLORS.gold, fontSize: "1.5rem" }}>
          {dilemma.title}
        </h3>
      </div>

      {/* Narrative */}
      <div className="p-4 mb-4" style={cardStyle}>
        <p style={{ fontFamily: "'Crimson Text', serif", color: COLORS.text, fontSize: "1.125rem", lineHeight: 1.7 }}>
          {dilemma.narrative}
        </p>
      </div>

      {/* Choices or Result */}
      {!result ? (
        <div className="space-y-2">
          {dilemma.choices.map((choice, i) => {
            const IconComp = ICON_MAP[choice.iconName] || ChevronRight;
            const affordable = canAffordChapelChoice(choice, state.denarii);
            const cost = chapelChoiceCost(choice);
            return (
              <button
                key={i}
                disabled={!affordable}
                onClick={() => handleChoice(i)}
                className="w-full flex items-center gap-3 p-4 text-left transition-all duration-200 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                style={cardStyle}
                onMouseEnter={(e) => {
                  if (!affordable) return;
                  e.currentTarget.style.transform = "translateX(4px)";
                  e.currentTarget.style.borderColor = "rgba(201, 168, 76, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.borderColor = COLORS.cardBorder;
                }}
              >
                <IconComp size={20} style={{ color: COLORS.gold, flexShrink: 0 }} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold" style={{ fontFamily: "'Cinzel', serif", color: COLORS.text }}>
                    {choice.label}
                  </span>
                  {cost > 0 && <span className="block text-sm mt-1" style={{ color: affordable ? COLORS.text : "#ffb3aa" }}>
                    {affordable ? `Cost: ${cost}d` : `Requires ${cost}d · Treasury: ${state.denarii}d`}
                  </span>}
                </span>
                <ChevronRight size={16} style={{ color: COLORS.muted, marginLeft: "auto", flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="p-4 mb-4" style={cardStyle}>
          <p className="mb-3" style={{ fontFamily: "'Crimson Text', serif", color: COLORS.text, fontSize: "1.125rem", lineHeight: 1.7 }}>
            {result.text}
          </p>
          <div className="flex flex-wrap">
            {Object.entries(result.effects).map(([key, val]) => (
              <EffectBadge key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} value={val} />
            ))}
          </div>
          <div className="text-center mt-4">
            <button
              onClick={() => dispatch({ type: "CHAPEL_SET_VIEW", payload: { view: "nave" } })}
              className="px-6 py-2 text-xs uppercase tracking-wider"
              style={goldButton}
            >
              Return to Chapel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChapelTab Component
// ---------------------------------------------------------------------------

export default function ChapelTab({ state, dispatch }: ChapelProps) {
  const chapel = state.chapel;
  const view = chapel?.view ?? "nave";

  const handleSetView = useCallback((v: ChapelView) => {
    dispatch({ type: "CHAPEL_SET_VIEW", payload: { view: v } });
  }, [dispatch]);

  const handleStartManuscript = useCallback(() => {
    dispatch({ type: "CHAPEL_MS_START" });
  }, [dispatch]);

  const handleStartDilemma = useCallback(() => {
    dispatch({ type: "CHAPEL_START_DILEMMA" });
  }, [dispatch]);

  return (
    <div
      className="chapel w-full max-w-2xl mx-auto"
      onFocusCapture={(event) => {
        if (event.target.matches(":focus-visible")) {
          event.target.scrollIntoView({ block: "center", behavior: "instant" });
        }
      }}
      style={{
        background: "linear-gradient(170deg, #0d0b0e 0%, #1a1520 40%, #12100e 100%)",
        minHeight: "60vh",
        position: "relative",
      }}
    >
      {/* Stained glass glow */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "300px",
          height: "120px",
          background: "radial-gradient(ellipse at center, rgba(126, 184, 212, 0.06) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Faith/Piety now shown in main Dashboard */}

      {/* Navigation tabs */}
      {view !== "dilemma" && (
        <ChapelNav
          view={view}
          onSetView={handleSetView}
          onStartManuscript={handleStartManuscript}
        />
      )}

      {/* Sub-view content */}
      {view === "nave" && (
        <NaveView
          state={state}
          onSetView={handleSetView}
          onStartManuscript={handleStartManuscript}
          onStartDilemma={handleStartDilemma}
        />
      )}
      {view === "anselm" && <AnselmView state={state} dispatch={dispatch} />}
      {view === "caedmon" && <CaedmonView state={state} dispatch={dispatch} />}
      {view === "manuscript" && <ScriptoriumView state={state} dispatch={dispatch} />}
      {view === "dilemma" && <DilemmaView state={state} dispatch={dispatch} />}

      {/* Footer */}
      <div className="text-center mt-8 pb-4">
        <p style={{ fontFamily: "'Crimson Text', serif", color: COLORS.muted, fontSize: ".875rem", fontStyle: "italic" }}>
          "The Church forgets nothing, forgives selectively, and charges for both." — Father Anselm
        </p>
      </div>
    </div>
  );
}
