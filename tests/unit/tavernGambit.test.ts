import assert from 'node:assert/strict';
import test from 'node:test';
import { gameReducer, initialState } from '../../src/engine/gameReducer.js';
import { resolveGambitRound } from '../../src/engine/tavernGambit.ts';
import { readV2Save, writeV2Save } from '../../src/save/saveGame.ts';

test('authored gambit weights and weapon advantage resolve from one supplied draw', () => {
  assert.deepEqual(resolveGambitRound(null, 'sword', () => 0.7),
    { player: 'sword', opponent: 'arrow', outcome: 'win' });
  assert.deepEqual(resolveGambitRound(null, 'arrow', () => 0.1),
    { player: 'arrow', opponent: 'sword', outcome: 'lose' });
  assert.deepEqual(resolveGambitRound('sword', 'shield', () => 0.2),
    { player: 'shield', opponent: 'shield', outcome: 'draw' });
  assert.deepEqual(resolveGambitRound('sword', 'shield', () => 0.6),
    { player: 'shield', opponent: 'sword', outcome: 'win' });
  assert.equal(resolveGambitRound(null, 'forged', () => 0.5), null);
  assert.throws(() => resolveGambitRound(null, 'sword', () => 1), RangeError);
});

test('untrusted legacy gambit results cannot mint money or set arbitrary last choices', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  assert.strictEqual(gameReducer(started, {
    type: 'TAVERN_GAMBIT_RESULT', payload: { result: 'win', wager: 1_000_000 },
  }), started);
  assert.strictEqual(gameReducer(started, {
    type: 'TAVERN_GAMBIT_SET_LAST', payload: { choice: 'forged' },
  }), started);
});

test('a saved seeded wager resolves once with validated choice, price, and phase', () => {
  const started = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 1 } });
  const action = { type: 'TAVERN_GAMBIT_PLAY', payload: { choice: 'sword', wager: 25, seed: started.rngState } };
  const played = gameReducer(started, action);
  assert.equal(played.denarii, 725);
  assert.equal(played.tavern.gambitRoundsThisSeason, 1);
  assert.equal(played.tavern.gambitLastChoice, 'sword');
  assert.equal(played.tavern.gambitTotalWins, 1);
  assert.equal(played.tavern.gambitNetEarnings, 25);
  assert.equal(played.rngState, 312129686);
  assert.deepEqual(gameReducer(started, action), played);
  assert.deepEqual(started.tavern.gambitRoundsThisSeason, 0);

  const saved = readV2Save(writeV2Save(played));
  assert.equal(saved.ok, true);
  if (saved.ok) assert.deepEqual(saved.state, JSON.parse(JSON.stringify(played)));
  assert.strictEqual(gameReducer(played, action), played, 'a stale seed cannot spend twice');

  const forged = gameReducer(started, { type: 'TAVERN_GAMBIT_PLAY', payload: {
    choice: 'shield', wager: 25, seed: started.rngState, result: 'win', denariiBonus: 1_000_000,
  } });
  assert.equal(forged.denarii, 675, 'the saved draw and weapon matchup decide the loss');
  assert.equal(forged.tavern.gambitTotalWins, 0);
  assert.equal(forged.tavern.gambitTotalLosses, 1);

  for (const payload of [
    { ...action.payload, wager: 1_000_000 },
    { ...action.payload, wager: -25 },
    { ...action.payload, wager: 26 },
    { ...action.payload, choice: 'forged' },
    { ...action.payload, seed: started.rngState + 1 },
  ]) assert.strictEqual(gameReducer(started, { type: 'TAVERN_GAMBIT_PLAY', payload }), started);
  const poor = { ...started, denarii: 9 };
  assert.strictEqual(gameReducer(poor, { type: 'TAVERN_GAMBIT_PLAY',
    payload: { ...action.payload, wager: 10 } }), poor);
  assert.strictEqual(gameReducer(initialState, {
    type: 'TAVERN_GAMBIT_PLAY', payload: { ...action.payload, seed: initialState.rngState },
  }), initialState);
});

test('the five-round seasonal limit is enforced by the reducer', () => {
  let state = gameReducer(initialState, { type: 'START_GAME', payload: { difficulty: 'easy', seed: 9 } });
  for (let round = 0; round < 5; round++) {
    const next = gameReducer(state, { type: 'TAVERN_GAMBIT_PLAY',
      payload: { choice: 'sword', wager: 10, seed: state.rngState } });
    assert.notStrictEqual(next, state);
    state = next;
  }
  assert.equal(state.tavern.gambitRoundsThisSeason, 5);
  assert.strictEqual(gameReducer(state, { type: 'TAVERN_GAMBIT_PLAY',
    payload: { choice: 'sword', wager: 10, seed: state.rngState } }), state);
});
