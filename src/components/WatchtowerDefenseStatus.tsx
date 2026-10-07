import { getMilitaryReadiness, type MilitaryReadinessState } from '../engine/militaryReadiness.ts';
import { WALLS_TRACK, GATE_TRACK, MOAT_TRACK, CRIMINAL_DEFENSE_THRESHOLD, SCOTTISH_DEFENSE_THRESHOLD } from '../data/military.ts';
import type { SavedRaidState } from '../save/savedRaid.ts';
import type { SavedWatchtowerState } from '../save/savedWatchtower.ts';

interface ReadinessViewState extends MilitaryReadinessState {
  raids?: SavedRaidState;
  watchtower?: Pick<SavedWatchtowerState, 'warnings'>;
}

export default function WatchtowerDefenseStatus({ state }: { state: ReadinessViewState }) {
  const readiness = getMilitaryReadiness(state);
  const { garrison, military, baseDefense, criminalDefense, scottishDefense,
    criminalDefended, scottishDefended, moraleLevel, forgeBonus, drillBonus } = readiness;
  const castleLevel = military.walls;
  const castleName = WALLS_TRACK[castleLevel].name;
  const raids = state.raids ?? {};
  const warnings = state.watchtower?.warnings ?? {};
  const morale = `${moraleLevel.label} (${military.morale}/100)`;

  // Active warnings
  const activeWarnings = [];
  if ((warnings.criminalRaidBonus ?? 0) > 0) activeWarnings.push({ icon: "\u2694", text: "Campfire smoke spotted \u2014 bandit threat" });
  if ((warnings.scottishRaidBonus ?? 0) > 0) activeWarnings.push({ icon: "\u2694", text: "Dust cloud spotted \u2014 riders approaching" });
  if ((warnings.raidRequirementReduction ?? 0) > 0) activeWarnings.push({ icon: "\u26A0", text: "Signal fire \u2014 allied warning active" });
  if (warnings.merchantPreview) activeWarnings.push({ icon: "\u2696", text: `Merchant caravan approaching: ${warnings.merchantPreview.name}` });

  return (
    <div
      className="watchtower-readiness rounded-lg border p-4"
      style={{ backgroundColor: "var(--bg-card, #231e16)", borderColor: "#3a4050" }}
    >
      <h3
        className="text-sm font-bold uppercase tracking-wider mb-3 text-center"
        style={{ fontFamily: "Cinzel, serif", color: "var(--gold, #c4a24a)" }}
      >
        Defense Status
      </h3>

      <p className="text-sm text-center mb-3" style={{ color: '#e8c44a' }}>Defense rating: {baseDefense}</p>
      {(forgeBonus > 0 || drillBonus > 0) && <p className="text-sm text-center mb-3" style={{ color: '#c8b090' }}>
        Equipment: +{forgeBonus}; Aldric's drill: +{drillBonus}
      </p>}
      <div className="watchtower-readiness-grid text-center text-sm mb-3">
        {/* Garrison */}
        <div
          className="rounded-lg p-2"
          style={{ backgroundColor: "#1a0e0e", border: "1px solid var(--royal-red, #8b1a1a)" }}
        >
          <div className="text-sm uppercase tracking-wide mb-1" style={{ color: "#ffaba3", fontFamily: "Cinzel, serif" }}>
            Garrison
          </div>
          <div className="text-xl font-bold" style={{ color: "var(--gold-bright, #e8c44a)", fontFamily: "Cinzel, serif" }}>
            {"\u2694"} {garrison}
          </div>
          <div className="text-sm" style={{ color: "#c8b090" }}>Morale: {morale}</div>
        </div>

        {/* Raid Defense */}
        <div
          className="rounded-lg p-2"
          style={{ backgroundColor: "#0e0e14", border: "1px solid #3a4050" }}
        >
          <div className="text-sm uppercase tracking-wide mb-1" style={{ color: "#8090a0", fontFamily: "Cinzel, serif" }}>
            Raid Defense
          </div>
          <div className="space-y-1 mt-1">
            <div className="text-sm">
              <span style={{ color: "#c8b090" }}>Outlaws: </span>
              <span
                className="font-bold"
                style={{ color: criminalDefended ? "#a4cd8c" : "#ffaba3" }}
              >
                {criminalDefense}/{CRIMINAL_DEFENSE_THRESHOLD} {criminalDefended ? "✓ Defended" : "✗ Vulnerable"}
              </span>
            </div>
            <div className="text-sm">
              <span style={{ color: "#c8b090" }}>Scots: </span>
              <span
                className="font-bold"
                style={{
                  color: scottishDefended ? "#a4cd8c" : "#ffaba3",

                }}
              >
                {scottishDefense}/{SCOTTISH_DEFENSE_THRESHOLD} {scottishDefended ? "✓ Defended" : "✗ Vulnerable"}
              </span>
            </div>
          </div>
        </div>

        {/* Fortifications */}
        <div
          className="rounded-lg p-2"
          style={{ backgroundColor: "#0e0e0a", border: "1px solid #4a4a3a" }}
        >
          <div className="text-sm uppercase tracking-wide mb-1" style={{ color: "var(--tan, #a89070)", fontFamily: "Cinzel, serif" }}>
            Fortifi<wbr />cations
          </div>
          <div className="text-sm space-y-1" style={{ color: "#c8b090" }}>
            <div>Walls: Lvl {castleLevel}</div>
            <div style={{ fontSize: "0.875rem", color: "#c8b090" }}>{castleName}</div>
            <div style={{ fontSize: "0.875rem", color: "#c8b090" }}>
              Gate: {GATE_TRACK[military.gate].name}; Moat: {MOAT_TRACK[military.moat].name}
            </div>
          </div>
        </div>
      </div>

      {/* Active Warnings */}
      {activeWarnings.length > 0 && (
        <div
          className="rounded-lg p-3 mb-3"
          style={{ backgroundColor: "#1a1a10", borderLeft: "3px solid var(--gold, #c4a24a)" }}
        >
          <div className="text-sm uppercase tracking-wide mb-1 font-bold" style={{ color: "var(--gold, #c4a24a)", fontFamily: "Cinzel, serif" }}>
            Active Warnings
          </div>
          {activeWarnings.map((w, i) => (
            <div key={i} className="text-sm" style={{ color: "#c8b090" }}>
              {w.icon} {w.text}
            </div>
          ))}
        </div>
      )}

      {/* Raid History */}
      <div className="text-sm" style={{ color: "#c8b090" }}>
        <span className="font-bold">Raid History:</span>{" "}
        Criminal: {raids.totalCriminalRaids ?? 0} (Won: {raids.criminalVictories ?? 0}, Lost: {raids.criminalDefeats ?? 0})
        {" \u00B7 "}
        Scottish: {raids.totalScottishRaids ?? 0} (Won: {raids.scottishVictories ?? 0}, Lost: {raids.scottishDefeats ?? 0})
        {((raids.totalDenariiLost ?? 0) > 0 || (raids.totalFoodLost ?? 0) > 0) && (
          <span>
            {" \u00B7 "}Total losses: {raids.totalDenariiLost ?? 0}d, {raids.totalFoodLost ?? 0} food
          </span>
        )}
      </div>
      <p className="text-sm mt-3" style={{ color: '#c8b090' }}>Threat ratings include active scouting. Seasonal changes may alter readiness.</p>
    </div>
  );
}
