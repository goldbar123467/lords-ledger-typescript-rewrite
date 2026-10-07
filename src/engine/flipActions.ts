/** Pure perspective-story transitions and atomic estate settlement. */
import type {GameSnapshot} from '../save/saveGame.ts';
import type {GameCommand} from './gameCommands.ts';
import type {RandomSource} from './eventSelector.ts';
import {ALL_FLIPS, isFlipId, computeCyoaConsequences, resolveFlipOption, computeFlipConsequences} from './flipEngine.ts';
import {translateEffects, applyResourceEffects, checkGameOver} from './meterUtils.ts';
import {MAX_GARRISON} from '../data/economy.ts';
import {removeFromGarrison} from '../data/military.ts';
import {MAX_TURNS, turnToSeasonYear} from './gameCalendar.ts';
import {addChronicle} from './chronicle.ts';
import {checkSynergies, applySynergyMeterEffects} from './synergyEngine.ts';
import {SYNERGY_TIER_MAP} from '../data/synergies.ts';

const MAX_CAUSE_CHAIN = 4;

// Every completed/recovered story gets its own fresh flag array.
function clearedFlip(): Pick<GameSnapshot,
  'currentFlipId' | 'currentFlipStats' | 'currentDecisionIndex' | 'flipConsequenceFlags' |
  'currentFlipOutcome' | 'currentCyoaNodeId' | 'cyoaEndingType'> {
  return {
    currentFlipId: null,
    currentFlipStats: null,
    currentDecisionIndex: 0,
    flipConsequenceFlags: [],
    currentFlipOutcome: null,
    currentCyoaNodeId: null,
    cyoaEndingType: null,
  };
}

function recoverMissingFlip(state: GameSnapshot): GameSnapshot {
  return {...state, phase: 'management', ...clearedFlip()};
}

export function reduceFlipAction(state: GameSnapshot, action: GameCommand, random: RandomSource): GameSnapshot {
  switch (action.type) {
    case "DISMISS_FLIP_INTRO": {
      if (state.phase !== "flip_intro") return state;
      const flipForIntro = isFlipId(state.currentFlipId) ? ALL_FLIPS[state.currentFlipId] : null;
      // BUG-04 guard: if flip data is missing, recover to management
      if (!flipForIntro) {
        return recoverMissingFlip(state);
      }
      if (flipForIntro.type === "cyoa") {
        return { ...state, phase: "flip_decision", currentCyoaNodeId: flipForIntro.startNode };
      }
      return { ...state, phase: "flip_decision" };
    }

    case "SELECT_FLIP_OPTION": {
      if (state.phase !== "flip_decision") return state;
      const { optionIndex } = action.payload ?? {};
      if (typeof optionIndex !== 'number' || !Number.isSafeInteger(optionIndex) || optionIndex < 0) return state;
      if (!isFlipId(state.currentFlipId)) return state;
      const flip = ALL_FLIPS[state.currentFlipId];
      if (!flip) return state;

      // --- CYOA branching flow ---
      if (flip.type === "cyoa") {
        if (state.currentCyoaNodeId === null) return state;
        const node = flip.nodes[state.currentCyoaNodeId];
        if (!node || node.isEnding) return state;
        const option = node.options?.[optionIndex];
        if (!option) return state;

        const targetNode = flip.nodes[option.goto];
        if (!targetNode) return state;

        if (targetNode.isEnding) {
          return {
            ...state,
            phase: "flip_summary",
            currentCyoaNodeId: option.goto,
            cyoaEndingType: targetNode.endingType,
            currentFlipOutcome: null,
          };
        }

        return {
          ...state,
          currentCyoaNodeId: option.goto,
          // Stay in flip_decision phase - go directly to next scene
        };
      }

      // --- Existing linear flow ---
      const decision = flip.decisions[state.currentDecisionIndex];
      if (!decision) return state;

      const option = decision.options[optionIndex];
      if (!option) return state;

      if (state.currentFlipStats === null) return state;
      const { nextStats, consequenceFlags, outcome, wasSuccess } = resolveFlipOption(
        option,
        state.currentFlipStats,
        random,
      );

      return {
        ...state,
        phase: "flip_outcome",
        currentFlipStats: nextStats,
        flipConsequenceFlags: [...state.flipConsequenceFlags, ...consequenceFlags],
        currentFlipOutcome: outcome,
        flipOutcomeWasSuccess: wasSuccess,
      };
    }

    case "CONTINUE_FLIP": {
      if (state.phase !== "flip_outcome") return state;
      if (!isFlipId(state.currentFlipId)) return state;
      const flip = ALL_FLIPS[state.currentFlipId];
      if (!flip || flip.type === 'cyoa') return state;

      const nextIndex = state.currentDecisionIndex + 1;

      if (nextIndex >= flip.decisions.length) {
        return {
          ...state,
          phase: "flip_summary",
          currentFlipOutcome: null,
        };
      }

      return {
        ...state,
        phase: "flip_decision",
        currentDecisionIndex: nextIndex,
        currentFlipOutcome: null,
      };
    }

    case "DISMISS_FLIP_SUMMARY": {
      if (state.phase !== "flip_summary") return state;

      const { currentFlipId, flipConsequenceFlags, turn, chronicle } = state;
      const flip = isFlipId(currentFlipId) ? ALL_FLIPS[currentFlipId] : null;
      // BUG-04 guard: if flip data is missing, recover to management
      if (!flip) {
        return recoverMissingFlip(state);
      }

      // Compute consequences: CYOA uses endingType, linear uses consequence flags
      let consequences;
      if (flip.type === "cyoa") {
        consequences = computeCyoaConsequences(currentFlipId, state.cyoaEndingType);
      } else {
        consequences = computeFlipConsequences(currentFlipId, flipConsequenceFlags);
      }
      const resourceEffects = translateEffects(consequences);
      const applied = applyResourceEffects(state, resourceEffects, MAX_GARRISON);

      // Reconcile typed garrison
      const flipGarrisonDelta = applied.garrison - state.garrison;
      let flipMilitary = applied.military || state.military;
      if (flipGarrisonDelta !== 0 && flipMilitary) {
        const mg = { ...flipMilitary.garrison };
        if (flipGarrisonDelta > 0) {
          mg.levy = Math.min((mg.levy || 0) + flipGarrisonDelta, MAX_GARRISON);
          flipMilitary = { ...flipMilitary, garrison: mg };
        } else {
          flipMilitary = { ...flipMilitary, garrison: removeFromGarrison(mg, Math.abs(flipGarrisonDelta)) };
        }
      }

      // SIMULATE_SEASON owns elapsed bankruptcy seasons. A story can restore
      // solvency, but returning to management does not complete another season.
      const flipBankruptcyTurns = applied.denarii > 0 ? 0 : (state.bankruptcyTurns || 0);

      const newState = {
        ...state,
        denarii: applied.denarii,
        population: applied.population,
        garrison: applied.garrison,
        inventory: applied.inventory,
        food: applied.food,
        military: flipMilitary,
        bankruptcyTurns: flipBankruptcyTurns,
      };
      const gameOverReason = checkGameOver(newState);

      // Chronicle entry
      const { season: flipSeason, year: flipYear } = turnToSeasonYear(turn);
      const chronicleText = `You experienced life as ${flip.character} and saw your manor through their eyes.`;
      let nextChronicle = addChronicle(chronicle, chronicleText, flipSeason, flipYear, turn, "event");

      // BUG-15: Add cause chain entry for flip consequences
      const flipCauseEntry = {
        turn, season: flipSeason, year: flipYear,
        summary: `Perspective flip: ${flip.character}`,
        effects: resourceEffects,
      };
      const nextCauseChain = [...(state.causeChain || []), flipCauseEntry].slice(-MAX_CAUSE_CHAIN);

      // Mark flip as fired
      if (!isFlipId(currentFlipId)) return state;
      const nextPerspectiveFlips = { ...state.perspectiveFlips, [currentFlipId]: true };

      if (gameOverReason) {
        return {
          ...state,
          ...newState,
          phase: "game_over",
          chronicle: nextChronicle,
          causeChain: nextCauseChain,
          gameOverReason,
          perspectiveFlips: nextPerspectiveFlips,
          ...clearedFlip(),
        };
      }

      // BUG-01 FIX: Do NOT increment turn — ADVANCE_TURN already did it.
      // The flip happens on the current turn, not a new one.

      // BUG-05 FIX: Victory check uses current turn (already incremented by ADVANCE_TURN)
      if (turn >= MAX_TURNS) {
        const isPyrrhic = (newState.population ?? state.population) < 3;
        const victoryText = isPyrrhic
          ? "Ten years have passed, but at what cost? Your estate barely clings to life. " +
            "The chronicles will note your survival, though few remain to read them."
          : "Ten years have passed. Your reign has endured through war, famine, and feast. " +
            "The chronicles will remember your name.";
        return {
          ...state,
          ...newState,
          phase: "victory",
          pyrrhicVictory: isPyrrhic,
          chronicle: addChronicle(nextChronicle, victoryText, flipSeason, flipYear, turn, "system"),
          causeChain: nextCauseChain,
          perspectiveFlips: nextPerspectiveFlips,
          ...clearedFlip(),
          currentEvent: null,
          currentRandomEvent: null,
          scribesNote: null,
        };
      }

      // ADVANCE_TURN already counted this completed season before the flip.
      const flipUpdatedSynergies = state.synergies ?? {};
      const flipStateForSynergyCheck = { ...newState, synergies: flipUpdatedSynergies };
      const flipNewSynergyIds = checkSynergies(flipStateForSynergyCheck);
      let flipSynergiesAfterCheck = flipUpdatedSynergies;
      const flipSynNotifications = [];
      if (flipNewSynergyIds.length > 0) {
        flipSynergiesAfterCheck = {
          ...flipUpdatedSynergies,
          activated: [...(flipUpdatedSynergies.activated ?? []), ...flipNewSynergyIds],
        };
        for (const tierId of flipNewSynergyIds) {
          const entry = SYNERGY_TIER_MAP[tierId];
          if (entry?.tier.chronicle) {
            nextChronicle = addChronicle(nextChronicle, entry.tier.chronicle, flipSeason, flipYear, turn, "event");
          }
          flipSynNotifications.push({
            tierId,
            tier: entry?.tier.tier ?? 1,
            title: entry?.tier.title ?? "",
            description: entry?.tier.description ?? "",
            pathName: entry?.path.name ?? "",
            pathIcon: entry?.path.icon ?? "",
            pathColor: entry?.path.color ?? "#b8860b",
            scribesNote: entry?.tier.scribesNote ?? null,
          });
        }
      }

      const flipBonuses = applySynergyMeterEffects(
        state.greatHall?.meters ?? { people: 50, treasury: 50, church: 50, military: 50 },
        state.chapel?.faith ?? 50, flipNewSynergyIds,
      );

      const zeroDeltas = { denarii: 0, food: 0, population: 0, garrison: 0 };

      return {
        ...state,
        ...newState,
        phase: "management",
        // BUG-01 FIX: use current turn, not turn + 1
        turn,
        season: flipSeason,
        year: flipYear,
        chronicle: nextChronicle,
        causeChain: nextCauseChain,
        perspectiveFlips: nextPerspectiveFlips,
        activeTab: "estate",
        seasonReport: [],
        resourceDeltas: zeroDeltas,
        currentEvent: null,
        currentRandomEvent: null,
        scribesNote: null,
        ...clearedFlip(),
        // Seasonal work belongs to SIMULATE_SEASON and ADVANCE_TURN, not story dismissal.
        greatHall: { ...state.greatHall, meters: flipBonuses.meters },
        chapel: { ...state.chapel, faith: flipBonuses.faith },
        synergies: flipSynergiesAfterCheck,
        pendingSynergyNotifications: [...(state.deferredSynergyNotifications ?? []), ...flipSynNotifications],
        deferredSynergyNotifications: [],
      };
    }

    default: return state;
  }
}
