export const WATCHTOWER_COUNTER_KEYS = ['totalScans', 'totalAnomaliesSpotted', 'totalAnomaliesMissed', 'perfectScans'] as const;
export const SCOUT_BONUS_KEYS = ['criminalRaidBonus', 'scottishRaidBonus', 'raidRequirementReduction'] as const;
export interface SavedScanWarnings extends Partial<Record<typeof SCOUT_BONUS_KEYS[number], number | null>> {
  merchantPreview?: { name?: string | null } | null;
}
export interface SavedSignalEntry {
  season?: string | null; year?: number | null; text?: string | null; type?: string | null;
}
/** Historical display/default fields are distinct from a newly generated scan report. */
export interface SavedWatchtowerState extends Partial<Record<typeof WATCHTOWER_COUNTER_KEYS[number], number | null>> {
  scannedThisSeason?: boolean | null; scanScribesNoteSeen?: boolean | null; rodericScribesNoteSeen?: boolean | null;
  warnings?: SavedScanWarnings | null;
  signalLog?: readonly SavedSignalEntry[] | null;
  /** No gameplay/view consumer reads this older report; retain its opaque metadata. */
  lastScanResult?: unknown;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function finiteOrNull(value: unknown): boolean { return value == null || (typeof value === 'number' && Number.isFinite(value)); }
function textOrNull(value: unknown): boolean { return value == null || typeof value === 'string'; }
export function validateWatchtowerState(value: unknown): string | null {
  if (!record(value)) return 'Save watchtower state is invalid.';
  for (const key of WATCHTOWER_COUNTER_KEYS) if (!finiteOrNull(value[key])) return `Save watchtower ${key} must be a finite number or null.`;
  for (const key of ['scannedThisSeason', 'scanScribesNoteSeen', 'rodericScribesNoteSeen']) {
    if (value[key] != null && typeof value[key] !== 'boolean') return `Save watchtower ${key} must be true, false or null.`;
  }
  const warnings = value.warnings;
  if (warnings != null) {
    if (!record(warnings)) return 'Save watchtower warnings are invalid.';
    for (const key of SCOUT_BONUS_KEYS) if (!finiteOrNull(warnings[key])) return `Save watchtower warning ${key} must be a finite number or null.`;
    const merchant = warnings.merchantPreview;
    if (merchant != null && (!record(merchant) || !textOrNull(merchant.name))) return 'Save watchtower merchant preview is invalid.';
  }
  const log = value.signalLog;
  if (log != null) {
    if (!Array.isArray(log)) return 'Save watchtower signal log must be a dense entry list or null.';
    for (let index = 0; index < log.length; index++) {
      const entry: unknown = log[index];
      if (!Object.hasOwn(log, index) || !record(entry) || !finiteOrNull(entry.year) ||
          !textOrNull(entry.season) || !textOrNull(entry.text) || !textOrNull(entry.type)) return `Save watchtower signal log entry ${index} is invalid.`;
    }
  }
  return null;
}
