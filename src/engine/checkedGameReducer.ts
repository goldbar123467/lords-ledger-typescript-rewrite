import { gameReducer } from './gameReducer.js';
import { assertGameSnapshot, type GameSnapshot } from '../save/saveGame.ts';
import type { GameCommand } from './gameCommands.ts';

/** Temporary migration boundary: the JavaScript reducer body is still unchecked. */
export function checkedGameReducer(state: GameSnapshot, command: GameCommand): GameSnapshot {
  const next: unknown = gameReducer(state, command);
  assertGameSnapshot(next);
  return next;
}
