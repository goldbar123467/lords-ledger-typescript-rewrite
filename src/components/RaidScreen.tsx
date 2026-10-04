/**
 * RaidScreen.tsx
 *
 * Full-screen raid warning, victory, and defeat overlays.
 * Interrupts the season flow when a raid triggers.
 */

import { useState, useEffect, type CSSProperties, type RefObject } from "react";
import type { ActiveRaid } from "../engine/raidEngine.ts";
import type { MilitaryDefenseState } from "../data/military.ts";
import { RAID_TYPES } from "../data/raids.ts";
import { CRIMINAL_DEFENSE_THRESHOLD, SCOTTISH_DEFENSE_THRESHOLD, calculateDefenseRating } from "../data/military.ts";
import { Skull, Swords } from "lucide-react";

type RaidStyle = CSSProperties & { "--raid-glow"?: string; "--px"?: string; "--py"?: string };
function raidStyle(style: RaidStyle): CSSProperties { return style; }

interface RaidScreenProps {
  raidState: ActiveRaid | null;
  garrison: number;
  military?: MilitaryDefenseState | null;
  onDefend: () => void;
  onContinue: () => void;
  actionRef?: RefObject<HTMLButtonElement | null>;
}

function DefenseComparison({ defenseRating, threshold, drillBonus = 0 }: { defenseRating: number; threshold: number; drillBonus?: number }) {
  const isReady = defenseRating >= threshold;
  return (
    <div
      className="rounded-lg p-4 my-4 text-center"
      style={{
        backgroundColor: "rgba(0,0,0,0.3)",
        border: `2px solid ${isReady ? "#4a8a3a" : "#c62828"}`,
      }}
    >
      <div className="flex items-center justify-center gap-4 text-3xl font-bold" style={{ fontFamily: "Cinzel, serif" }}>
        <div>
          <div className="text-sm uppercase tracking-wider mb-1" style={{ color: "#a89070" }}>Defense Rating</div>
          <span style={{ color: isReady ? "#4a8a3a" : "#c62828" }}>{defenseRating}</span>
        </div>
        <span style={{ color: "#6a5a42", fontSize: "1.5rem" }}>vs</span>
        <div>
          <div className="text-sm uppercase tracking-wider mb-1" style={{ color: "#a89070" }}>Required</div>
          <span style={{ color: isReady ? "#4a8a3a" : "#c62828" }}>{threshold}</span>
        </div>
      </div>
      <div
        className="mt-2 text-sm font-bold uppercase tracking-wider"
        style={{ color: isReady ? "#4a8a3a" : "#c62828" }}
      >
        {isReady ? "\u2713 DEFENSES HOLD" : "\u2717 DEFENSES INSUFFICIENT"}
      </div>
      {drillBonus > 0 && (
        <div className="mt-2 text-sm" style={{ color: "#e8c44a" }}>
          Aldric's drill: +{drillBonus} defense
        </div>
      )}
    </div>
  );
}

function makeParticles() {
  return Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const dist = 40 + Math.random() * 30;
    return {
      key: i,
      px: `${Math.cos(angle) * dist}px`,
      py: `${Math.sin(angle) * dist}px`,
      delay: `${Math.random() * 0.2}s`,
    };
  });
}

function GoldParticles() {
  const [particles] = useState(makeParticles);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.key}
          className="absolute w-2 h-2 rounded-sm"
          style={raidStyle({
            backgroundColor: "#c4a24a",
            "--px": p.px,
            "--py": p.py,
            animation: "raid-particle 0.8s ease-out forwards",
            animationDelay: p.delay,
          })}
        />
      ))}
    </div>
  );
}

function OutcomeLine({ text, delay, victory }: { text: string; delay: number; victory: boolean }) {
  return (
    <div
      className="text-base font-semibold py-1"
      style={{
        color: victory ? "#4a8a3a" : "#c62828",
        animation: `raid-${victory ? "fade-in" : "drop-in"} 0.3s ease-out ${delay}ms both`,
      }}
    >
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RaidScreen({ raidState, garrison, military, onDefend, onContinue, actionRef }: RaidScreenProps) {
  const [showShake, setShowShake] = useState(false);
  const [showParticles, setShowParticles] = useState(false);


  const type = raidState?.type;
  const phase = raidState?.phase;
  const result = raidState?.result;
  const def = type ? RAID_TYPES[type] : null;
  const isVictory = result?.victory ?? false;

  // Trigger visual effects when result phase appears
  useEffect(() => {
    if (phase !== "result" || !result) return;
    const raf = requestAnimationFrame(() => {
      if (isVictory) {
        setShowParticles(true);
      } else {
        setShowShake(true);
      }
    });
    const timer = setTimeout(() => {
      setShowParticles(false);
      setShowShake(false);
    }, isVictory ? 1000 : 300);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [phase, result, isVictory]);

  // Stable warning text for this mounted raid screen.
  const [warningText] = useState(() => {
    if (!def) return "";
    return def.warningText[Math.floor(Math.random() * def.warningText.length)] ?? "";
  });

  if (!raidState || !def) return null;

  const isCriminal = type === "criminal";
  const isScottish = type === "scottish";
  const glowColor = isCriminal ? "rgba(138, 106, 42, 0.5)" : "rgba(139, 26, 26, 0.6)";
  const borderColor = isCriminal ? "#8a6a2a" : "#8b1a1a";
  const RaidIcon = isCriminal ? Skull : Swords;

  // --- WARNING PHASE ---
  if (phase === "warning") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
        <div
          className="w-full max-w-lg rounded-lg raid-pulse-border relative flex flex-col"
          style={raidStyle({
            backgroundColor: "#1a1610",
            border: `3px solid ${borderColor}`,
            borderLeft: `6px solid ${borderColor}`,
            "--raid-glow": glowColor,
            maxHeight: "calc(100vh - 2rem)",
          })}
        >
          {/* Scrollable content area */}
          <div className="px-6 pt-6 pb-3 overflow-y-auto flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <RaidIcon size={isScottish ? 28 : 24} color={borderColor} />
              <h2
                className={`font-bold uppercase tracking-widest text-center ${isScottish ? "text-2xl" : "text-xl"}`}
                style={{ fontFamily: "Cinzel Decorative, Cinzel, serif", color: borderColor }}
              >
                {def.warningTitle}
              </h2>
              <RaidIcon size={isScottish ? 28 : 24} color={borderColor} />
            </div>

            {/* Description */}
            <p
              className={`text-center leading-relaxed mb-2 ${isScottish ? "text-lg" : "text-base"}`}
              style={{ color: "#c8b090" }}
            >
              {warningText}
            </p>

            {/* Defense comparison */}
            {(() => {
              const mil: MilitaryDefenseState = military || { garrison: { levy: garrison, menAtArms: 0, knights: 0 }, walls: 1, gate: 0, moat: 0, morale: 50 };
              const dr = raidState.defenseRating ?? calculateDefenseRating(mil, raidState.drillBonus ?? 0);
              const threshold = type === "criminal" ? CRIMINAL_DEFENSE_THRESHOLD : SCOTTISH_DEFENSE_THRESHOLD;
              return <DefenseComparison defenseRating={dr} threshold={threshold} drillBonus={raidState.drillBonus ?? 0} />;
            })()}
          </div>

          {/* Sticky action row — always visible at bottom of overlay */}
          <div
            className="px-6 py-3 text-center shrink-0"
            style={{
              backgroundColor: "#1a1610",
              borderTop: `1px solid ${borderColor}`,
              borderBottomLeftRadius: "0.5rem",
              borderBottomRightRadius: "0.5rem",
            }}
          >
            <button
              onClick={onDefend}
              ref={actionRef}
              className="px-8 py-3 rounded-md border-2 font-bold text-lg uppercase tracking-wider cursor-pointer transition-all duration-200"
              style={{
                background: `linear-gradient(135deg, ${borderColor}, #1a1610, ${borderColor})`,
                borderColor: "#c4a24a",
                color: "#e8c44a",
                fontFamily: "Cinzel, serif",
                letterSpacing: "2px",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#e8c44a"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#c4a24a"; }}
            >
              Defend the Estate
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RESULT PHASE (victory or defeat) ---
  if (phase === "result" && result) {
    // Build gain/loss lines
    const lines = [];
    if (isVictory) {
      if (result.denariiDelta > 0) lines.push(`+${result.denariiDelta}d recovered`);
      if (result.foodDelta > 0) lines.push(`+${result.foodDelta} food captured`);
      if (result.populationDelta > 0) lines.push(`+${result.populationDelta} families inspired`);
      if (result.garrisonDelta > 0) lines.push(`+${result.garrisonDelta} soldiers recruited`);
    } else {
      if (result.denariiDelta < 0) lines.push(`${result.denariiDelta}d stolen`);
      if (result.foodDelta < 0) lines.push(`${result.foodDelta} food pillaged`);
      if (result.tradeGoodLost) lines.push(`-${result.tradeGoodLost.amount} ${result.tradeGoodLost.resource} seized`);
      if (result.garrisonDelta < 0) lines.push(`${result.garrisonDelta} soldiers killed`);
      if (result.populationDelta < 0) lines.push(`${result.populationDelta} families fled`);
    }

    const resultBorder = isVictory ? "#c4a24a" : "#8b1a1a";
    const resultBg = isVictory ? "#282318" : "#281a18";

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
        {/* Red vignette flash for defeat */}
        {!isVictory && (
          <div
            className="fixed inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, transparent 40%, rgba(139, 26, 26, 0.4) 100%)",
              animation: "raid-red-vignette 0.5s ease-out forwards",
            }}
            aria-hidden="true"
          />
        )}

        {/* Gold flash for victory */}
        {isVictory && (
          <div
            className="fixed inset-0 pointer-events-none"
            style={{
              backgroundColor: "rgba(196, 162, 74, 0.15)",
              animation: "raid-gold-flash 0.5s ease-out forwards",
            }}
            aria-hidden="true"
          />
        )}

        <div
          className={`w-full max-w-lg rounded-lg relative flex flex-col ${!isVictory && showShake ? "raid-shake" : ""}`}
          style={{
            backgroundColor: "#1a1610",
            border: `3px solid ${resultBorder}`,
            background: `linear-gradient(135deg, #1a1610 0%, ${resultBg} 50%, #1a1610 100%)`,
            maxHeight: "calc(100vh - 2rem)",
          }}
        >
          {/* Particles for victory */}
          {isVictory && showParticles && <GoldParticles />}

          {/* Scrollable content */}
          <div className="px-6 pt-6 pb-3 overflow-y-auto flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-center gap-3 mb-3">
              <RaidIcon size={24} color={resultBorder} />
              <h2
                className="text-xl font-bold uppercase tracking-widest text-center"
                style={{ fontFamily: "Cinzel Decorative, Cinzel, serif", color: resultBorder }}
              >
                {isVictory ? "RAID REPELLED" : "RAID SUCCESSFUL"}
              </h2>
              <RaidIcon size={24} color={resultBorder} />
            </div>

            {/* Partial defense note */}
            {result.partial && (
              <p className="text-sm text-center mb-2 italic" style={{ color: "#a89070" }}>
                {garrison > 0
                  ? `Your ${garrison} soldiers fought bravely but were outnumbered. Losses were reduced but not prevented.`
                  : "Your fortifications slowed the raiders. Losses were reduced but not prevented."}
              </p>
            )}

            {/* Narrative */}
            <p className="text-base leading-relaxed mb-4 text-center" style={{ color: "#c8b090" }}>
              {result.narrativeLine}
            </p>

            {/* Gains / Losses */}
            <div
              className="rounded-md p-3"
              style={{ backgroundColor: "rgba(0,0,0,0.3)", border: `1px solid ${isVictory ? "#4a8a3a" : "#6a5a42"}` }}
            >
              <div className="text-xs uppercase tracking-wider mb-2 font-bold" style={{ color: "#a89070" }}>
                {isVictory ? "Spoils of Victory" : "Losses Sustained"}
              </div>
              {lines.map((line, i) => (
                <OutcomeLine key={line} text={line} delay={i * 200} victory={isVictory} />
              ))}
            </div>
          </div>

          {/* Sticky action row */}
          <div
            className="px-6 py-3 text-center shrink-0"
            style={{
              backgroundColor: "#1a1610",
              borderTop: `1px solid ${resultBorder}`,
              borderBottomLeftRadius: "0.5rem",
              borderBottomRightRadius: "0.5rem",
            }}
          >
            <button
              onClick={onContinue}
              ref={actionRef}
              className="px-8 py-3 rounded-md border-2 font-bold text-base uppercase tracking-wider cursor-pointer transition-all duration-200"
              style={{
                background: "linear-gradient(135deg, #2a2318, #1a1610)",
                borderColor: "#c4a24a",
                color: "#e8c44a",
                fontFamily: "Cinzel, serif",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#e8c44a"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#c4a24a"; }}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
