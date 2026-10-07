/**
 * Watchtower.tsx
 *
 * The Watchtower — military pillar made spatial.
 * Interactive location with Horizon Scan mini-game, Captain Roderic NPC,
 * Defense Status panel, and Signal Fire Log.
 *
 * Rendered as an overlay within the Map tab (same pattern as Tavern).
 */

import { useState, useEffect, useRef, useMemo, type CSSProperties } from "react";
import WatchtowerDefenseStatus from './WatchtowerDefenseStatus.tsx';
import {useHallReadingFocus} from '../hooks/useHallReadingFocus.ts';
import { createRandomCursor } from "../engine/random.ts";
import { createScanPlan, summarizeScan, type ScanAnomaly, type ScanPlan, type ScanReport } from "../engine/watchtowerScan.ts";
import {
  WATCHTOWER_SUBTITLES,
  type RodericState,
  RODERIC_DEFENSE_ASSESSMENTS,
  RODERIC_HISTORICAL_LESSONS,
  RODERIC_STRATEGIC_TIPS,
  RODERIC_SCRIBES_NOTE,
  SCAN_SCRIBES_NOTE,
  SCAN_DURATION_SECONDS,
} from "../data/watchtower.ts";


import type { SavedRaidState } from '../save/savedRaid.ts';
import type { SavedWatchtowerState } from '../save/savedWatchtower.ts';

interface WatchtowerViewState extends RodericState {
  phase: string;
  rngState: number;
  raids?: SavedRaidState;
  watchtower?: SavedWatchtowerState;
}
type WatchtowerCommand =
  | { type: 'WATCHTOWER_SCAN_SCRIBES_NOTE_SEEN' | 'WATCHTOWER_RODERIC_SCRIBES_NOTE_SEEN' | 'DISMISS_SCRIBES_NOTE' }
  | { type: 'WATCHTOWER_SCAN_COMPLETE'; payload: { scanSeed: number; foundKeys: string[] } };
interface SectionProps {
  state: WatchtowerViewState;
  dispatch: (command: WatchtowerCommand) => void;
  onBack: () => void;
}
interface VisibleAnomaly extends ScanAnomaly { found: boolean; missed: boolean }
interface LandscapeProps {
  anomalies: readonly VisibleAnomaly[];
  onClickAnomaly: (key: string) => void;
  timeLeft: number;
  scanActive: boolean;
  scanDone: boolean;
}
interface BriefingContent { type: 'assessment' | 'lesson' | 'recommendation'; text: string }
interface StationProps {
  title: string;
  subtitle: string;
  icon: string;
  borderColor: string;
  disabled: boolean;
  disabledText?: string;
  onClick: () => void;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffle<T,>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const left = copy[i];
    const right = copy[j];
    if (left === undefined || right === undefined) throw new Error('Invalid briefing shuffle index.');
    copy[i] = right;
    copy[j] = left;
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Watchtower Header
// ---------------------------------------------------------------------------

function WatchtowerHeader({ subtitle }: { subtitle: string }) {
  return <div className="watchtower-heading">
    <h2>The Watchtower</h2>
    <p>&ldquo;{subtitle}&rdquo;</p>
  </div>;
}

// ---------------------------------------------------------------------------
// Horizon Scan — SVG Landscape Scene
// ---------------------------------------------------------------------------

function LandscapeScene({ anomalies, onClickAnomaly, timeLeft, scanActive, scanDone }: LandscapeProps) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border-2"
      style={{
        height: "250px",
        borderColor: scanDone ? "var(--gold, #c4a24a)" : "#2a3040",
        transition: "border-color 300ms",
      }}
    >
      {/* Sky gradient */}
      <div
        style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, #1a2040 0%, #3a4a60 35%, #6a5a40 42%, #3a4a2a 43%, #2a3a1a 100%)",
        }}
      />

      {/* Distant hills — layer 1 */}
      <svg
        viewBox="0 0 700 250"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        preserveAspectRatio="none"
      >
        {/* Hill silhouettes */}
        <path
          d="M0,120 Q80,85 160,105 Q240,75 350,95 Q420,60 500,90 Q580,70 700,100 L700,130 L0,130 Z"
          fill="#2a3a2a"
          opacity="0.8"
        />
        <path
          d="M0,115 Q100,95 200,110 Q300,80 400,100 Q520,75 620,95 Q680,85 700,105 L700,135 L0,135 Z"
          fill="#1a2a1a"
          opacity="0.7"
        />

        {/* Tree line */}
        <path
          d="M0,125 L20,115 L25,125 L35,110 L40,125 L55,112 L60,125 L75,108 L80,125 L95,114 L100,125 L115,109 L120,125 L140,113 L145,125 L160,107 L165,125 L185,111 L190,125 L210,108 L215,125 L235,112 L240,125 L260,106 L265,125 L280,113 L285,125 L305,109 L310,125 L330,114 L335,125 L355,108 L360,125 L380,112 L385,125 L400,107 L405,125 L425,114 L430,125 L450,109 L455,125 L475,113 L480,125 L500,108 L505,125 L525,112 L530,125 L550,107 L555,125 L575,114 L580,125 L600,109 L605,125 L620,113 L625,125 L645,108 L650,125 L670,114 L675,125 L700,110 L700,135 L0,135 Z"
          fill="#1a3a1a"
          opacity="0.6"
        />

        {/* Fields — strip farming lines */}
        <g stroke="#3a4a2a" strokeWidth="0.5" opacity="0.3">
          <line x1="100" y1="155" x2="600" y2="155" />
          <line x1="80" y1="170" x2="620" y2="170" />
          <line x1="120" y1="185" x2="580" y2="185" />
          <line x1="90" y1="200" x2="610" y2="200" />
          <line x1="110" y1="215" x2="590" y2="215" />
        </g>

        {/* Road winding into distance */}
        <path
          d="M350,250 Q340,220 345,195 Q350,170 340,150 Q335,140 340,130"
          stroke="#5a4a3a"
          strokeWidth="3"
          fill="none"
          opacity="0.5"
          strokeLinecap="round"
        />
      </svg>

      {/* Timer bar */}
      {scanActive && (
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "4px",
            backgroundColor: "#1a1a1a", zIndex: 20,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(timeLeft / SCAN_DURATION_SECONDS) * 100}%`,
              backgroundColor:
                timeLeft > 10 ? "var(--food-green, #4a8a3a)" :
                timeLeft > 5 ? "var(--gold, #c4a24a)" :
                "var(--danger-red, #c62828)",
              transition: "width 1s linear, background-color 500ms",
            }}
          />
        </div>
      )}

      {/* Anomalies */}
      {scanActive && anomalies.map((a) => (
        <AnomalyElement key={a.key} anomaly={a} onClick={() => onClickAnomaly(a.key)} />
      ))}

      {/* Scan done flash */}
      {scanDone && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 15,
            border: "3px solid var(--gold, #c4a24a)",
            borderRadius: "6px",
            animation: "watchtower-flash 600ms ease-out",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual anomaly elements
// ---------------------------------------------------------------------------

function AnomalyElement({ anomaly, onClick }: { anomaly: VisibleAnomaly; onClick: () => void }) {
  const { id, x, y, found, missed } = anomaly;

  const baseStyle: CSSProperties = {
    position: "absolute",
    left: `${x}%`,
    top: `${y}%`,
    transform: "translate(-50%, -50%)",
    cursor: found ? "default" : "pointer",
    zIndex: 10,
    transition: "box-shadow 200ms",
    minWidth: "32px",
    minHeight: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: 0,
    padding: 0,
    background: "transparent",
  };

  if (missed) {
    return (
      <div
        style={{
          ...baseStyle,
          opacity: 0,
          animation: "watchtower-missed 600ms ease-out",
          pointerEvents: "none",
        }}
      >
        <div style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "rgba(198, 40, 40, 0.6)" }} />
      </div>
    );
  }

  const highlight = found
    ? { boxShadow: "0 0 8px var(--gold, #c4a24a)", borderRadius: "50%" }
    : {};

  // Render the authored anomaly ID.
  switch (id) {
    case "campfire":
      return (
        <button type="button" data-scan-anomaly={id} aria-label={`Spot ${anomaly.name}`} disabled={found} style={{ ...baseStyle, ...highlight }} onClick={onClick}>
          <div style={{ width: "30px", height: "40px", position: "relative" }}>
            {/* Smoke wisps */}
            <div style={{
              position: "absolute", left: "12px", bottom: "10px",
              width: "2px", height: "20px",
              background: "linear-gradient(to top, rgba(160,160,160,0.4), transparent)",
              animation: "watchtower-smoke 3s ease-out infinite",
            }} />
            <div style={{
              position: "absolute", left: "16px", bottom: "12px",
              width: "1.5px", height: "16px",
              background: "linear-gradient(to top, rgba(180,180,180,0.3), transparent)",
              animation: "watchtower-smoke 3s ease-out infinite 0.8s",
            }} />
          </div>
        </button>
      );

    case "dust":
      return (
        <button type="button" data-scan-anomaly={id} aria-label={`Spot ${anomaly.name}`} disabled={found} style={{ ...baseStyle, ...highlight }} onClick={onClick}>
          <div style={{
            width: "28px", height: "14px",
            borderRadius: "50%",
            backgroundColor: "rgba(160, 130, 80, 0.35)",
            filter: "blur(3px)",
            animation: "watchtower-pulse 2.5s ease-in-out infinite",
          }} />
        </button>
      );

    case "signal":
      return (
        <button type="button" data-scan-anomaly={id} aria-label={`Spot ${anomaly.name}`} disabled={found} style={{ ...baseStyle, ...highlight }} onClick={onClick}>
          <div style={{
            width: "10px", height: "10px",
            borderRadius: "50%",
            backgroundColor: "#c44a1a",
            animation: "watchtower-flicker 1.5s ease-in-out infinite",
            boxShadow: "0 0 6px rgba(196, 74, 26, 0.6)",
          }} />
        </button>
      );

    case "wagon":
      return (
        <button type="button" data-scan-anomaly={id} aria-label={`Spot ${anomaly.name}`} disabled={found} style={{ ...baseStyle, ...highlight }} onClick={onClick}>
          <div style={{ position: "relative", width: "32px", height: "16px" }}>
            {/* Wagon body */}
            <div style={{
              width: "20px", height: "10px",
              backgroundColor: "#4a3a2a",
              border: "1px solid #3a2a1a",
              borderRadius: "1px",
              animation: "watchtower-wagon 12s linear infinite",
            }} />
            {/* Wheel */}
            <div style={{
              position: "absolute", bottom: "-2px", left: "4px",
              width: "6px", height: "6px",
              borderRadius: "50%",
              border: "1px solid #5a4a3a",
              backgroundColor: "#3a2a1a",
            }} />
          </div>
        </button>
      );

    case "birds":
      return (
        <button type="button" data-scan-anomaly={id} aria-label={`Spot ${anomaly.name}`} disabled={found} style={{ ...baseStyle, ...highlight }} onClick={onClick}>
          <svg width="30" height="24" viewBox="0 0 30 24" style={{ overflow: "visible" }}>
            {/* V-shaped birds */}
            <path d="M4,16 L7,13 L10,16" stroke="#2a2a2a" strokeWidth="1.5" fill="none"
              style={{ animation: "watchtower-birds 4s ease-in-out infinite" }} />
            <path d="M14,12 L17,9 L20,12" stroke="#3a3a3a" strokeWidth="1.5" fill="none"
              style={{ animation: "watchtower-birds 4s ease-in-out infinite 0.5s" }} />
            <path d="M8,20 L11,17 L14,20" stroke="#2a2a2a" strokeWidth="1" fill="none"
              style={{ animation: "watchtower-birds 4s ease-in-out infinite 1.2s" }} />
            <path d="M20,14 L23,11 L26,14" stroke="#3a3a3a" strokeWidth="1" fill="none"
              style={{ animation: "watchtower-birds 4s ease-in-out infinite 0.8s" }} />
          </svg>
        </button>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Horizon Scan — Main Mini-Game Component
// ---------------------------------------------------------------------------

function HorizonScan({ state, dispatch, onBack }: SectionProps) {
  const wt = state.watchtower ?? {};
  const scannedThisSeason = wt.scannedThisSeason ?? false;
  const [showScribesNote, setShowScribesNote] = useState(!(wt.scanScribesNoteSeen ?? false));
  const [phase, setPhase] = useState<"ready" | "scanning" | "report">("ready"); // ready | scanning | report
  const [anomalies, setAnomalies] = useState<VisibleAnomaly[]>([]);
  const anomaliesRef = useRef<VisibleAnomaly[]>([]);
  const scanPlanRef = useRef<ScanPlan | null>(null);
  const scanSeedRef = useRef<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(SCAN_DURATION_SECONDS);
  const [report, setReport] = useState<ScanReport | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startScan() {
    if (state.phase !== "management" || scannedThisSeason) return;
    const scanSeed = state.rngState;
    const plan = createScanPlan(createRandomCursor(scanSeed).next);
    const newAnomalies = plan.anomalies.map((anomaly) => ({ ...anomaly, found: false, missed: false }));
    scanPlanRef.current = plan;
    scanSeedRef.current = scanSeed;
    anomaliesRef.current = newAnomalies;
    setAnomalies(newAnomalies);
    setTimeLeft(SCAN_DURATION_SECONDS);
    setPhase("scanning");

    // Scribe's note on first scan
    if (showScribesNote) {
      dispatch({ type: "WATCHTOWER_SCAN_SCRIBES_NOTE_SEEN" });
      setShowScribesNote(false);
      dispatch({ type: "DISMISS_SCRIBES_NOTE" });
      // Show scribe's note via the main overlay
      // Actually, we'll dispatch it properly
    }
  }

  function handleClickAnomaly(key: string) {
    if (phase !== "scanning") return;
    const updated = anomaliesRef.current.map((a) => (a.key === key && !a.found ? { ...a, found: true } : a));
    anomaliesRef.current = updated;
    setAnomalies(updated);
  }

  // Timer — use a ref to track remaining time so we don't nest state setters
  const timeLeftRef = useRef(SCAN_DURATION_SECONDS);

  useEffect(() => {
    if (phase !== "scanning") return;
    function clearScanTimer() {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    }

    function finishScan() {
      clearScanTimer();

      const final = anomaliesRef.current.map((a) => (a.found ? a : { ...a, missed: true }));
      anomaliesRef.current = final;
      setAnomalies(final);

      if (!scanPlanRef.current) return;
      const reportData = summarizeScan(scanPlanRef.current, final.filter((anomaly) => anomaly.found).map((anomaly) => anomaly.key));
      if (!reportData) return;
      setReport(reportData);
      setPhase("report");
    }

    timeLeftRef.current = SCAN_DURATION_SECONDS;
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1;
      setTimeLeft(timeLeftRef.current);
      if (timeLeftRef.current <= 0) {
        clearScanTimer();
        finishScan();
      }
    }, 1000);

    return () => clearScanTimer();
  }, [phase]);

  function acknowledgeReport() {
    if (!report || scanSeedRef.current === null) return;

    dispatch({
      type: "WATCHTOWER_SCAN_COMPLETE",
      payload: {
        scanSeed: scanSeedRef.current,
        foundKeys: anomaliesRef.current.filter((anomaly) => anomaly.found).map((anomaly) => anomaly.key),
      },
    });

    // Show scan scribe's note on first scan
    if (!(state.watchtower?.scanScribesNoteSeen)) {
      dispatch({ type: "DISMISS_SCRIBES_NOTE" }); // clear any existing
    }

    onBack();
  }

  // Already scanned
  if (scannedThisSeason) {
    return (
      <div className="max-w-xl mx-auto text-center py-8">
        <p
          className="text-base italic mb-4"
          style={{ color: "#8090a0", fontFamily: "Crimson Text, serif" }}
        >
          The horizon is quiet... for now.
        </p>
        <p className="text-xs" style={{ color: "#5a6a7a" }}>
          You have already scanned the horizon this season.
        </p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 rounded-md text-sm font-bold uppercase tracking-wider"
          style={{
            backgroundColor: "#1a1820",
            color: "#8090a0",
            border: "1px solid #3a4050",
            fontFamily: "Cinzel, serif",
            cursor: "pointer",
          }}
        >
          Return
        </button>
      </div>
    );
  }

  // Ready to scan
  if (phase === "ready") {
    return (
      <div className="max-w-2xl mx-auto">
        <h3
          className="text-center text-lg font-bold mb-3 uppercase tracking-wide"
          style={{ fontFamily: "Cinzel, serif", color: "var(--gold, #c4a24a)" }}
        >
          {"\u2680"} Horizon Scan
        </h3>

        {/* First scan scribe's note */}
        {showScribesNote && (
          <div
            className="rounded-lg border p-3 mb-4"
            style={{ backgroundColor: "#1a2018", borderColor: "#4a6a3a" }}
          >
            <h4
              className="text-xs font-bold uppercase tracking-widest mb-2"
              style={{ color: "#8a9a6a", fontFamily: "Cinzel, serif" }}
            >
              Scribe{"'"}s Note
            </h4>
            <p
              className="text-xs leading-relaxed italic"
              style={{ color: "#a8a080", fontFamily: "Crimson Text, serif" }}
            >
              {SCAN_SCRIBES_NOTE}
            </p>
          </div>
        )}

        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: "#8090a0", fontFamily: "Crimson Text, serif" }}>
            Survey the landscape for {SCAN_DURATION_SECONDS} seconds. Click any anomalies you spot
            on the horizon. Threats and opportunities appear small {"\u2014"} look carefully.
          </p>
          <button
            onClick={startScan}
            className="px-6 py-3 rounded-md border-2 font-bold text-sm uppercase tracking-wider"
            style={{
              background: "linear-gradient(135deg, #8b1a1a 0%, #4a0a0a 50%, #8b1a1a 100%)",
              border: "2px solid var(--gold, #c4a24a)",
              color: "#e8c44a",
              fontFamily: "Cinzel, serif",
              cursor: "pointer",
              letterSpacing: "2px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "linear-gradient(135deg, #c62828 0%, #6a1010 50%, #c62828 100%)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "linear-gradient(135deg, #8b1a1a 0%, #4a0a0a 50%, #8b1a1a 100%)";
            }}
          >
            Scan the Horizon
          </button>
        </div>

        <div className="mt-4">
          <button
            onClick={onBack}
            className="px-3 py-1 rounded text-xs"
            style={{
              backgroundColor: "#1a1820",
              color: "#6a7a8a",
              border: "1px solid #2a3040",
              cursor: "pointer",
            }}
          >
            Return
          </button>
        </div>
      </div>
    );
  }

  // Active scan
  if (phase === "scanning") {
    return (
      <div className="max-w-2xl mx-auto">
        <h3
          className="text-center text-sm font-bold mb-2 uppercase tracking-wide"
          style={{ fontFamily: "Cinzel, serif", color: "var(--gold, #c4a24a)" }}
        >
          Scanning... ({timeLeft}s)
        </h3>
        <LandscapeScene
          anomalies={anomalies}
          onClickAnomaly={handleClickAnomaly}
          timeLeft={timeLeft}
          scanActive={true}
          scanDone={false}
        />
        <p className="text-xs text-center mt-2 italic" style={{ color: "#6a7a8a" }}>
          Click anomalies on the landscape before time runs out.
        </p>
        <p aria-live="polite" className="text-xs text-center mt-2" style={{ color: "#c4a24a" }}>
          {anomalies.some((anomaly) => anomaly.found)
            ? `Spotted: ${anomalies.filter((anomaly) => anomaly.found).map((anomaly) => anomaly.name).join(", ")}`
            : "No anomalies spotted yet."}
        </p>
      </div>
    );
  }

  // Report
  if (phase === "report" && report) {
    return (
      <div className="watchtower-report max-w-xl mx-auto">
        <div
          data-watchtower-report className="rounded-lg border-2 p-4 flex flex-col"
          style={{
            backgroundColor: "var(--bg-card, #231e16)",
            borderColor: "var(--gold, #c4a24a)",
          }}
        >
          <h3
            className="text-center text-lg font-bold mb-3 uppercase tracking-wide"
            style={{ fontFamily: "Cinzel, serif", color: "var(--gold, #c4a24a)" }}
          >
            Scout{"'"}s Report
          </h3>

          <div className="watchtower-scan-summary watchtower-report-summary grid gap-2 mb-4 text-center text-sm" style={{ color: "#a89070" }}>
            <div>
              <span style={{ color: "var(--gold-bright, #e8c44a)", fontWeight: "bold", fontSize: "1.2em" }}>
                {report.found}/{report.total}
              </span>
              <br />Spotted
            </div>
            <div>
              <span style={{ color: "var(--food-green, #4a8a3a)", fontWeight: "bold", fontSize: "1.2em" }}>
                {report.threats}
              </span>
              <br />Threats
            </div>
            <div>
              <span style={{ color: "#5a8aaa", fontWeight: "bold", fontSize: "1.2em" }}>
                {report.opportunities}
              </span>
              <br />Opportunities
            </div>
          </div>

          {/* Rating */}
          <div className="text-center mb-4">
            <span
              className="inline-block max-w-full text-sm font-bold uppercase tracking-wider px-3 py-1 rounded"
              style={{
                backgroundColor:
                  report.rating.label === "Eagle-eyed" ? "rgba(74, 138, 58, 0.2)" :
                  report.rating.label === "Sharp-eyed" ? "rgba(196, 162, 74, 0.15)" :
                  "rgba(100, 120, 140, 0.15)",
                color:
                  report.rating.label === "Eagle-eyed" ? "var(--food-green, #4a8a3a)" :
                  report.rating.label === "Sharp-eyed" ? "var(--gold, #c4a24a)" :
                  "#8090a0",
                fontFamily: "Cinzel, serif",
              }}
            >
              Rating: {report.rating.label}
            </span>
          </div>

          <p className="text-xs text-center mb-1" style={{ color: "#a89070" }}>
            Scout observations (scroll to read all)
          </p>
          <div className="watchtower-report-findings rounded border px-2 py-1" role="region" tabIndex={0} aria-label="Scout's findings"
            style={{ backgroundColor: "#1a1713", borderColor: "#3a3228" }}>
          {/* Spotted anomalies */}
          {report.foundList.length > 0 && (
            <div className="space-y-2 mb-3">
              {report.foundList.map((item, i) => (
                <div key={i} className="text-sm" style={{ color: "var(--tan-light, #c8b090)" }}>
                  <span style={{ color: item.category === "threat" ? "#c44a4a" : item.category === "opportunity" ? "#5a8aaa" : "var(--gold, #c4a24a)" }}>
                    {item.category === "threat" ? "\u2694" : item.category === "opportunity" ? "\u2696" : "\u2727"}
                  </span>
                  {" "}{item.name} {"\u2014"} {item.description}
                  {item.id === "birds" && (
                    <span style={{ color: item.resolvedThreat ? "#c44a4a" : "var(--food-green, #4a8a3a)", fontSize: "0.85em" }}>
                      {" "}({item.resolvedThreat ? "Real threat!" : "False alarm \u2014 just startled birds."})
                    </span>
                  )}
                  <br />
                  <span className="text-xs" style={{ color: "var(--food-green, #4a8a3a)" }}>
                    ({item.reward})
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Missed anomalies */}
          {report.missedList.length > 0 && (
            <div className="space-y-1 mb-3">
              {report.missedList.map((item, i) => (
                <div
                  key={i}
                  className="text-sm"
                  style={{ color: "var(--danger-red, #c62828)", opacity: 0.7 }}
                >
                  {"\u2717"} Missed: {item.name}
                </div>
              ))}
            </div>
          )}
          </div>

          {/* Denarii bonus */}
          {report.rating.denariiBonus > 0 && (
            <p className="text-sm text-center mb-3" style={{ color: "var(--gold-bright, #e8c44a)" }}>
              +{report.rating.denariiBonus}d (scouts rewarded)
            </p>
          )}

          {/* Captain's assessment */}
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid #3a3228" }}>
            <p
              className="text-sm italic"
              style={{ color: "var(--tan, #a89070)", fontFamily: "Crimson Text, serif" }}
            >
              Captain{"'"}s assessment: &ldquo;{report.rating.captainLine}&rdquo;
            </p>
          </div>

          <div className="watchtower-report-actions text-center mt-2 pt-2 shrink-0" style={{ borderTop: "1px solid #3a3228" }}>
            <button
              onClick={acknowledgeReport}
              className="max-w-full px-3 py-2 rounded-md border-2 font-bold text-sm uppercase tracking-wider"
              style={{
                background: "linear-gradient(135deg, #8b1a1a 0%, #4a0a0a 50%, #8b1a1a 100%)",
                border: "2px solid var(--gold, #c4a24a)",
                color: "#e8c44a",
                fontFamily: "Cinzel, serif",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "linear-gradient(135deg, #c62828 0%, #6a1010 50%, #c62828 100%)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "linear-gradient(135deg, #8b1a1a 0%, #4a0a0a 50%, #8b1a1a 100%)";
              }}
            >
              Acknow<wbr />ledged
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Captain's Briefing — NPC Panel
// ---------------------------------------------------------------------------

function CaptainBriefing({ state, dispatch, onBack }: SectionProps) {
  const wt = state.watchtower ?? {};
  const scribesNoteSeen = wt.rodericScribesNoteSeen ?? false;
  const [showScribesNote, setShowScribesNote] = useState(!scribesNoteSeen);
  const [animKey, setAnimKey] = useState(0);

  // Shuffled queues for non-repeating content
  const lessonQueue = useRef(shuffle(Array.from({ length: RODERIC_HISTORICAL_LESSONS.length }, (_, i) => i)));
  const lessonIndex = useRef(0);

  function getAssessment(): BriefingContent {
    // Try each assessment function; skip nulls
    const shuffled = shuffle(RODERIC_DEFENSE_ASSESSMENTS);
    for (const fn of shuffled) {
      const result = typeof fn === "function" ? fn(state) : fn;
      if (result) return { type: "assessment", text: result };
    }
    return { type: "assessment", text: "The walls hold. For now." };
  }

  function getLesson(): BriefingContent {
    if (lessonIndex.current >= lessonQueue.current.length) {
      lessonQueue.current = shuffle(Array.from({ length: RODERIC_HISTORICAL_LESSONS.length }, (_, i) => i));
      lessonIndex.current = 0;
    }
    const idx = lessonQueue.current[lessonIndex.current++];
    const lesson = idx === undefined ? undefined : RODERIC_HISTORICAL_LESSONS[idx];
    if (lesson === undefined) throw new Error('Captain lesson queue is empty.');
    return { type: 'lesson', text: lesson };
  }

  function getRecommendation(): BriefingContent {
    const shuffled = shuffle(RODERIC_STRATEGIC_TIPS);
    for (const fn of shuffled) {
      const result = typeof fn === "function" ? fn(state) : fn;
      if (result) return { type: "recommendation", text: result };
    }
    return { type: "recommendation", text: "Maintain the garrison. Watch the horizon. Upgrade when you can afford it. Defense is patience, my lord." };
  }

  function makeContent(): BriefingContent {
    const roll = Math.random();
    if (roll < 0.40) return getAssessment();
    if (roll < 0.75) return getLesson();
    return getRecommendation();
  }

  // eslint-disable-next-line react-hooks/refs -- refs read intentionally in initializer on mount
  const [content, setContent] = useState(() => makeContent());

  // Watchtower-specific commentary
  const wtComment = useMemo(() => {
    if ((wt.perfectScans ?? 0) >= 3) return "Your eye is sharp, my lord. The men call you Eagle-Eye. It suits you.";
    if ((wt.totalAnomaliesMissed ?? 0) > (wt.totalAnomaliesSpotted ?? 0) && (wt.totalScans ?? 0) >= 2) {
      return "We\u2019ve missed more than we\u2019ve caught, my lord. The horizon demands patience.";
    }
    return null;
  }, [wt.perfectScans, wt.totalAnomaliesMissed, wt.totalAnomaliesSpotted, wt.totalScans]);

  function reroll() {
    setContent(makeContent());
    setAnimKey((k) => k + 1);
  }

  function handleDismissScribesNote() {
    setShowScribesNote(false);
    dispatch({ type: "WATCHTOWER_RODERIC_SCRIBES_NOTE_SEEN" });
  }

  const typeLabel = content.type === "assessment" ? "Defense Assessment"
    : content.type === "lesson" ? "A Military Lesson"
    : "Strategic Recommendation";

  return <section className="watchtower-captain">
    <h3>Captain Roderic</h3>
    <p className="watchtower-caption">Garrison Commander</p>
    <div className="watchtower-portrait" aria-hidden="true"><span>{"\u26E8"}</span></div>
    <p className="watchtower-motto">Duty. Vigilance. Stone and steel.</p>

    {showScribesNote && <section className="watchtower-note">
      <h4>Scribe{'\u0027'}s Note</h4>
      <p>{RODERIC_SCRIBES_NOTE}</p>
      <button onClick={handleDismissScribesNote} className="watchtower-action watchtower-action--note">I understand</button>
    </section>}
    <div className="decorative-rule watchtower-rule" aria-hidden="true">{"\u25C6"}</div>
    {wtComment && <p className="watchtower-comment">&ldquo;{wtComment}&rdquo;</p>}

    <div key={animKey} className="quill-appear watchtower-speech">
      <p className="watchtower-speech-type">{typeLabel}</p>
      <p><span className="watchtower-quote">{"\u201C"}</span>{content.text}<span className="watchtower-quote">{"\u201D"}</span></p>
    </div>
    <div className="watchtower-actions">
      <button onClick={reroll} className="watchtower-action watchtower-action--red">Hear More</button>
      <button onClick={onBack} className="watchtower-action">Dismiss</button>
    </div>
  </section>;
}
// ---------------------------------------------------------------------------
// Defense Status Panel
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Signal Fire Log
// ---------------------------------------------------------------------------

function SignalFireLog({ state }: { state: WatchtowerViewState }) {
  const log = state.watchtower?.signalLog ?? [];
  const revealFocusedEntries = useHallReadingFocus('[role="region"]:focus-visible');
  return <section className="watchtower-history">
    <h4><span aria-hidden="true">{"\u2668"}</span> Signal Fire Log</h4>
    <div className="watchtower-history-region" role="region" aria-label="Signal fire entries" tabIndex={0} onFocusCapture={revealFocusedEntries}>
      {log.length === 0 ? <p className="watchtower-history-empty">No entries yet. Scan the horizon to begin your watch.</p> :
        <ol>{[...log].reverse().map((entry, index) => <li key={index} data-kind={entry.type}>
          <span className="watchtower-history-date">{entry.season} Y{entry.year}:</span>{' '}{entry.text}
        </li>)}</ol>}
    </div>
  </section>;
}

// ---------------------------------------------------------------------------
// Station Cards for Watchtower sections
// ---------------------------------------------------------------------------

function WatchtowerStation({ title, subtitle, icon, borderColor, disabled, disabledText, onClick }: StationProps) {
  return <button onClick={onClick} disabled={disabled} className="watchtower-station" style={{borderColor: disabled ? '#8090a0' : borderColor}}>
    <span className="watchtower-station-icon" aria-hidden="true" style={{color: disabled ? '#c1def7' : borderColor}}>{icon}</span>
    <h3>{title}</h3>
    <p>{disabled ? disabledText : subtitle}</p>
  </button>;
}

// ---------------------------------------------------------------------------
// CSS Animations (injected via <style>)
// ---------------------------------------------------------------------------

const WATCHTOWER_STYLES = `
@keyframes watchtower-smoke {
  0% { opacity: 0.4; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-18px); }
}
@keyframes watchtower-pulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.5; }
}
@keyframes watchtower-flicker {
  0%, 100% { opacity: 0.4; }
  30% { opacity: 1; }
  60% { opacity: 0.5; }
  80% { opacity: 0.9; }
}
@keyframes watchtower-wagon {
  0% { transform: translateX(-4px); }
  100% { transform: translateX(8px); }
}
@keyframes watchtower-birds {
  0% { transform: translateY(0); opacity: 0.7; }
  100% { transform: translateY(-12px); opacity: 0.2; }
}
@keyframes watchtower-flash {
  0% { box-shadow: inset 0 0 30px rgba(196, 162, 74, 0.5); }
  100% { box-shadow: inset 0 0 0 rgba(196, 162, 74, 0); }
}
@keyframes watchtower-missed {
  0% { opacity: 0.8; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
}
@keyframes watchtower-label-in {
  0% { opacity: 0; transform: translateX(-50%) translateY(4px); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes watchtower-log-in {
  0% { opacity: 0; transform: translateY(-6px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes watchtower-enter {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
`;

// ---------------------------------------------------------------------------
// Main Watchtower Component
// ---------------------------------------------------------------------------

export default function Watchtower({ state, dispatch, onClose }: Omit<SectionProps, 'onBack'> & { onClose: () => void }) {
  const revealFocusedControl = useHallReadingFocus();
  const [activeSection, setActiveSection] = useState<"scan" | "roderic" | null>(null);
  const [entering, setEntering] = useState(true);

  const wt = state.watchtower ?? {};

  // Random subtitle picked once per mount
  const [subtitle] = useState(
    () => {
      const text = WATCHTOWER_SUBTITLES[Math.floor(Math.random() * WATCHTOWER_SUBTITLES.length)];
      if (text === undefined) throw new Error('Watchtower subtitle pool is empty.');
      return text;
    }
  );

  // Entry animation
  useEffect(() => {
    const timer = setTimeout(() => setEntering(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const scannedThisSeason = wt.scannedThisSeason ?? false;

  // Sub-views
  if (activeSection === "scan") {
    return (
      <div style={{ animation: "watchtower-enter 300ms ease-out" }}>
        <style>{WATCHTOWER_STYLES}</style>
        <HorizonScan state={state} dispatch={dispatch} onBack={() => setActiveSection(null)} />
      </div>
    );
  }

  if (activeSection === "roderic") {
    return (
      <div className="watchtower-reading" onFocusCapture={revealFocusedControl} style={{ animation: "watchtower-enter 300ms ease-out" }}>
        <style>{WATCHTOWER_STYLES}</style>
        <CaptainBriefing state={state} dispatch={dispatch} onBack={() => setActiveSection(null)} />
      </div>
    );
  }

  // Main watchtower view
  return (
    <div
      className="watchtower-reading watchtower-home w-full max-w-4xl mx-auto rounded-xl border-2 overflow-hidden relative"
      onFocusCapture={revealFocusedControl}
      style={{
        backgroundColor: "#0e0c14",
        borderColor: "#3a4050",
        backgroundImage: "linear-gradient(180deg, #121820 0%, #0e0c14 40%, #0f0d0a 100%)",
        animation: entering ? "watchtower-enter 300ms ease-out" : "none",
      }}
    >
      <style>{WATCHTOWER_STYLES}</style>

      {/* Grain texture */}
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          opacity: 0.03,
        }}
      />

      <div className="relative z-10 p-4 sm:p-6">
        {/* Header */}
        <WatchtowerHeader subtitle={subtitle} />

        {/* Station grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <WatchtowerStation
            title="Horizon Scan"
            subtitle="Survey the landscape for threats"
            icon={"\u2680"}
            borderColor="#5a7aaa"
            disabled={scannedThisSeason}
            disabledText="The horizon is quiet... for now."
            onClick={() => setActiveSection("scan")}
          />
          <WatchtowerStation
            title="Captain’s Briefing"
            subtitle="Hear your garrison commander’s report"
            icon={"\u26E8"}
            borderColor="var(--royal-red, #8b1a1a)"
            disabled={false}
            onClick={() => setActiveSection("roderic")}
          />
        </div>

        {/* Defense Status */}
        <div className="mb-4">
          <WatchtowerDefenseStatus state={state} />
        </div>

        {/* Signal Fire Log */}
        <div className="mb-4">
          <SignalFireLog state={state} />
        </div>

        {/* Footer */}
        <div className="watchtower-footer">
          <span>
            Garrison: {state.garrison} | Castle Lvl {state.castleLevel}
          </span>
          <button
            onClick={onClose}
            className="watchtower-action watchtower-action--blue"
          >
            Descend from Tower
          </button>
        </div>
      </div>

      {/* Cold ambient gradient at top */}
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: "80px",
          background: "linear-gradient(180deg, rgba(40, 60, 100, 0.08) 0%, transparent 100%)",
          pointerEvents: "none", zIndex: 0,
        }}
      />
    </div>
  );
}
