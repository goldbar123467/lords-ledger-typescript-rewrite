/** Synthetic accepted snapshots for seasonal ordering and interruption regression. */
import {createInitialState, gameReducer} from '../../src/engine/gameReducer.ts';
import {FORGE_SUPPLY_EVENTS} from '../../src/data/blacksmith.ts';
import {emptyInventory, present, snapshotFixture} from '../gameInput.ts';

const calendar = [
  {turn: 1, season: 'spring', year: 1},
  {turn: 7, season: 'autumn', year: 2},
  {turn: 16, season: 'winter', year: 4},
  {turn: 39, season: 'autumn', year: 10},
  {turn: 40, season: 'winter', year: 10},
] as const;

export function* seasonSimulationFixtures() {
  const disruption = present(FORGE_SUPPLY_EVENTS.find(event => event.id === 'iron_shortage'), 'supply fixture');
  for (const seed of [1, 104, 987654321]) for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const started = gameReducer(createInitialState(seed), {type: 'START_GAME', payload: {seed, difficulty}});
    for (const date of calendar) {
      const base = snapshotFixture({...started, ...date});
      const profiles = [
        ['ordinary', base],
        ['timed effects', snapshotFixture({...base,
          buildings: [{type: 'strip_farm', instanceId: 'wear-fixture', builtOnTurn: 0, condition: 26.8}],
          tavern: {...base.tavern, martaSpiceInvestment: true, aldricDrillActive: 1},
          blacksmith: {...base.blacksmith, ironVeinActive: true, activeSupplyEvent: disruption,
            supplyEventTurnsLeft: 1, usedSupplyEventIds: [disruption.id]},
        })],
        ['mutinous mixed garrison', snapshotFixture({...base, population: 4, garrison: 8,
          military: {...base.military, morale: 0, garrison: {levy: 5, menAtArms: 2, knights: 1}},
        })],
        ['bankruptcy and famine', snapshotFixture({...base, denarii: 0, food: 0,
          inventory: emptyInventory(base.inventory), bankruptcyTurns: 5, starvationTurns: 2,
        })],
      ] as const;
      for (const [profile, state] of profiles) yield {label: `${seed}/${difficulty}/${date.turn}/${profile}`, state};
    }
  }
}
