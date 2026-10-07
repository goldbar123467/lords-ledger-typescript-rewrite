import { gameReducer } from '../src/engine/gameReducer.ts';
import { assertGameSnapshot, type GameSnapshot } from '../src/save/saveGame.ts';
import assert from 'node:assert/strict';
import { ALL_RESOURCES, type Inventory } from '../src/data/economy.ts';

export function snapshotFixture(value: unknown): GameSnapshot {
  assertGameSnapshot(value);
  return value;
}

export function extraField(value: object, name: string): unknown {
  return Reflect.get(value, name);
}

/** Preserve the original inventory's keys and order while zeroing its owned goods. */
export function emptyInventory(source: Inventory): Inventory {
  const result = {...source};
  for (const id of ALL_RESOURCES) if (Object.hasOwn(result, id)) result[id] = 0;
  return result;
}

/** A test must prove an expected item/result exists rather than assert away optionality. */
export function present<Value>(value: Value, field: string): NonNullable<Value> {
  assert.ok(value !== null && value !== undefined, `${field} must be present`);
  return value;
}

/** A wholly invalid starting state has no promised output schema. Inspect only tested fields. */
export function invokeGameReducer(state: unknown, command: unknown): unknown {
  return Reflect.apply(gameReducer, undefined, [state, command]);
}

/** Exercise JavaScript callers with deliberately malformed inputs, without a typed-input cast. */
export function rawGameReducer(state: GameSnapshot, command: unknown): GameSnapshot;
export function rawGameReducer<State>(state: State, command: unknown): State | GameSnapshot;
export function rawGameReducer(state: unknown, command: unknown): unknown {
  const result = invokeGameReducer(state, command);
  // Invalid input may be returned unchanged. That does not make it a valid snapshot.
  if (result === state) return state;
  assertGameSnapshot(result);
  return result;
}
