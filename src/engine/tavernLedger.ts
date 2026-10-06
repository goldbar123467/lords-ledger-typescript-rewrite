/** Ordinary ledger integers stay numeric; larger exact values use decimal JSON strings. */
declare const EXACT_DECIMAL: unique symbol;
export type TavernLedgerInteger = number | (string & { readonly [EXACT_DECIMAL]: true });
const LIMIT = BigInt(Number.MAX_SAFE_INTEGER);

export function isTavernLedgerInteger(value: unknown, nonnegative = false): value is TavernLedgerInteger {
  if (typeof value === 'number') return Number.isSafeInteger(value) && (!nonnegative || value >= 0);
  if (typeof value !== 'string' || !/^-?[1-9]\d*$/.test(value)) return false;
  const integer = BigInt(value);
  return (integer > LIMIT || integer < -LIMIT) && (!nonnegative || integer >= 0n);
}

export function addTavernLedgerInteger(value: unknown, delta: number, nonnegative = false): TavernLedgerInteger | null {
  if ((value !== undefined && !isTavernLedgerInteger(value, nonnegative)) || !Number.isSafeInteger(delta)) return null;
  const sum = BigInt(value ?? 0) + BigInt(delta);
  if (nonnegative && sum < 0n) return null;
  if (sum >= -LIMIT && sum <= LIMIT) return Number(sum);
  const encoded = sum.toString();
  return isTavernLedgerInteger(encoded, nonnegative) ? encoded : null;
}

export function tavernLedgerAtLeast(value: unknown, threshold: number): boolean {
  return (value === undefined || isTavernLedgerInteger(value)) && Number.isSafeInteger(threshold) &&
    BigInt(value ?? 0) >= BigInt(threshold);
}
