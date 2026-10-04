import { getVictoryTitle, victorySummary } from "../data/endings.ts";
import { getSynergyVictoryTitle, getActiveSynergyDisplay } from "../engine/synergyEngine.ts";

import type { ReignOutcomeState, VictoryNarrative } from "../data/endings.ts";
import { FinalResourceCards, OutcomeRestart, hasLowFinalResource } from "./OutcomeScreenParts.tsx";

interface VictoryScreenProps {
  state: ReignOutcomeState;
  onPlayAgain: () => void;
  activatedSynergies?: readonly string[];
}

function computeVictoryTitle(state: ReignOutcomeState, activatedSynergies?: readonly string[]): VictoryNarrative {
  // Tier 3 synergy title override takes priority
  const synergyTitle = getSynergyVictoryTitle(activatedSynergies ?? []);
  if (synergyTitle) return synergyTitle;

  return getVictoryTitle(state);
}

export default function VictoryScreen({ state, onPlayAgain, activatedSynergies }: VictoryScreenProps) {
  const title = computeVictoryTitle(state, activatedSynergies);
  const summary = victorySummary(state);

  const isFragileWin = hasLowFinalResource(state);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-4 py-6"
      style={{ backgroundColor: "#0f0d0a" }}
    >
      <div
        className="terminal-card w-full max-w-xl rounded-lg border-2 p-5 sm:p-8 shadow-2xl"
        style={{
          backgroundColor: "#1a1610",
          borderColor: "#c4a24a",
          boxShadow: "0 8px 32px rgba(196, 162, 74, 0.3)",
        }}
      >
        <div className="text-center mb-4">
          <div className="text-5xl mb-2" style={{ color: "#e8c44a" }}>{"\u265B"}</div>
          <h2
            className="font-heading text-3xl sm:text-4xl font-bold"
            style={{ color: "#e8c44a", textShadow: "0 0 12px rgba(232, 196, 74, 0.4)" }}
          >
            {title.title}
          </h2>
          <p className="text-base font-semibold mt-1" style={{ color: "#a89070" }}>
            {title.subtitle}
          </p>
          {isFragileWin && (
            <p
              className="text-sm italic mt-2"
              style={{
                color: "#ffaba3",
                fontFamily: "Crimson Text, serif",
                textShadow: "0 0 4px rgba(198, 40, 40, 0.3)",
              }}
            >
              You survived by the skin of your teeth.
            </p>
          )}
        </div>

        <div className="flex items-center justify-center my-4 gap-2">
          <div className="flex-1 h-0.5" style={{ backgroundColor: "#c4a24a" }} />
          <div className="text-sm" style={{ color: "#c4a24a" }}>{"\u25C6"}</div>
          <div className="flex-1 h-0.5" style={{ backgroundColor: "#c4a24a" }} />
        </div>

        <p className="text-base leading-relaxed mb-4" style={{ color: "#a89070" }}>
          {title.description}
        </p>

        <p className="text-base leading-relaxed mb-5" style={{ color: "#a89070" }}>
          {summary}
        </p>

        <FinalResourceCards state={state} emphasizeLow />

        {/* Strategy Paths */}
        {(() => {
          const synDisplay = getActiveSynergyDisplay(activatedSynergies ?? []);
          if (synDisplay.length === 0) return null;
          return (
            <div
              className="rounded-md border p-4 mb-5"
              style={{ borderColor: "#c4a24a", backgroundColor: "#231e16" }}
            >
              <h4
                className="font-heading text-sm font-bold uppercase tracking-wider mb-2"
                style={{ color: "#c4a24a" }}
              >
                Strategy Paths
              </h4>
              <div className="space-y-1.5">
                {synDisplay.map((s) => (
                  <div key={s.pathName} className="flex items-center gap-2 text-sm">
                    <span className="text-base" style={{ color: s.pathColor }} aria-hidden="true">{s.pathIcon}</span>
                    <span className="font-semibold" style={{ color: "#e8c44a" }}>{s.pathName}</span>
                    <span style={{ color: "#a89070" }}>
                      {"—"} Tier {s.tierLevel}: {s.tierTitle}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Historian's Note */}
        <div
          className="rounded-md border p-4 mb-5"
          style={{ borderColor: "#c4a24a", backgroundColor: "#231e16" }}
        >
          <h4
            className="font-heading text-sm font-bold uppercase tracking-wider mb-2"
            style={{ color: "#c4a24a" }}
          >
            Historian's Note
          </h4>
          <p className="text-sm leading-relaxed" style={{ color: "#a89070" }}>
            {title.historianNote}
          </p>
        </div>

        <OutcomeRestart onRestart={onPlayAgain} />
      </div>
    </div>
  );
}
