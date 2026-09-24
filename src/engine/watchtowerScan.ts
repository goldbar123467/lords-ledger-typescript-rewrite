/** Pure Horizon Scan plan and scoring shared by the view and reducer. */
import {
  ANOMALY_TYPES, FOREIGN_TRADERS, SCAN_MAX_ANOMALIES,
  SCAN_MIN_ANOMALIES, SCAN_RATINGS,
} from '../data/watchtower.js';

type RandomSource = () => number;
type WarningKey = 'criminalRaidBonus' | 'scottishRaidBonus' | 'raidRequirementReduction' | 'merchantPreview';

interface ScanDefinition {
  id: string;
  name: string;
  label: string;
  description: string;
  reward: string;
  category: 'threat' | 'opportunity' | 'ambiguous';
  warningKey: WarningKey | null;
}

export interface ScanAnomaly extends ScanDefinition {
  key: string;
  x: number;
  y: number;
  resolvedThreat: boolean;
}

interface MerchantPreview { name: string; specialty: string }
interface ScanRating { min: number; max: number; label: string; denariiBonus: number; captainLine: string }

export interface ScanPlan {
  anomalies: ScanAnomaly[];
  merchantPreview: MerchantPreview;
}

export interface ScanWarnings {
  criminalRaidBonus: number;
  scottishRaidBonus: number;
  raidRequirementReduction: number;
  merchantPreview: MerchantPreview | null;
}

export interface ScanReport {
  total: number;
  found: number;
  missed: number;
  threats: number;
  opportunities: number;
  foundList: Array<Pick<ScanAnomaly, 'name' | 'description' | 'reward' | 'category' | 'id' | 'resolvedThreat'>>;
  missedList: Array<Pick<ScanAnomaly, 'name' | 'id'>>;
  rating: ScanRating;
  warnings: ScanWarnings;
}

function isScanDefinition(value: unknown): value is ScanDefinition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string' && typeof entry.name === 'string' &&
    typeof entry.label === 'string' && typeof entry.description === 'string' &&
    typeof entry.reward === 'string' &&
    (entry.category === 'threat' || entry.category === 'opportunity' || entry.category === 'ambiguous') &&
    (entry.warningKey === null || entry.warningKey === 'criminalRaidBonus' ||
      entry.warningKey === 'scottishRaidBonus' || entry.warningKey === 'raidRequirementReduction' ||
      entry.warningKey === 'merchantPreview');
}

const definitions: readonly ScanDefinition[] = ANOMALY_TYPES.map((entry: unknown) => {
  if (!isScanDefinition(entry)) throw new Error('Invalid authored Horizon Scan anomaly.');
  return entry;
});
const traders: readonly MerchantPreview[] = FOREIGN_TRADERS;
const ratings: readonly ScanRating[] = SCAN_RATINGS;

function draw(random: RandomSource): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('Random source must return a finite value in [0, 1).');
  }
  return value;
}

function pick<T>(items: readonly T[], random: RandomSource): T {
  const item = items[Math.floor(draw(random) * items.length)];
  if (item === undefined) throw new Error('Horizon Scan selection pool is empty.');
  return item;
}

function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(draw(random) * (index + 1));
    const previous = copy[index];
    const replacement = copy[swapIndex];
    if (previous === undefined || replacement === undefined) throw new Error('Invalid scan shuffle index.');
    copy[index] = replacement;
    copy[swapIndex] = previous;
  }
  return copy;
}

export function createScanPlan(random: RandomSource): ScanPlan {
  const count = SCAN_MIN_ANOMALIES + Math.floor(draw(random) * (SCAN_MAX_ANOMALIES - SCAN_MIN_ANOMALIES + 1));
  const threats = definitions.filter(anomaly => anomaly.category === 'threat');
  const nonThreats = definitions.filter(anomaly => anomaly.category !== 'threat');
  const selected = [pick(threats, random), pick(nonThreats, random)];
  const remaining = shuffle(definitions.filter(anomaly => !selected.some(chosen => chosen.id === anomaly.id)), random);
  selected.push(...remaining.slice(0, count - selected.length));

  // Five shuffled lanes keep 32px hit targets separate even on a narrow landscape.
  const xSlots = shuffle([10, 30, 50, 70, 90], random);
  const anomalies = shuffle(selected, random).map((anomaly, index) => {
    const xSlot = xSlots[index];
    if (xSlot === undefined) throw new Error('Horizon Scan has more anomalies than lanes.');
    return {
      ...anomaly,
      key: `${anomaly.id}-${index}`,
      x: xSlot + (draw(random) - 0.5) * 5,
      y: anomaly.id === 'signal' ? 15 + draw(random) * 20 :
        anomaly.id === 'wagon' ? 55 + draw(random) * 25 : 20 + draw(random) * 55,
      resolvedThreat: anomaly.id === 'birds' && draw(random) < 0.5,
    };
  });

  return { anomalies, merchantPreview: pick(traders, random) };
}

export function summarizeScan(plan: ScanPlan, foundKeys: unknown): ScanReport | null {
  if (!Array.isArray(foundKeys)) return null;
  const keys: string[] = [];
  for (const value of foundKeys) {
    if (typeof value !== 'string') return null;
    keys.push(value);
  }
  const foundSet = new Set(keys);
  const availableKeys = new Set(plan.anomalies.map(anomaly => anomaly.key));
  if (foundSet.size !== keys.length || keys.some(key => !availableKeys.has(key))) return null;

  const found = plan.anomalies.filter(anomaly => foundSet.has(anomaly.key));
  const missed = plan.anomalies.filter(anomaly => !foundSet.has(anomaly.key));
  const rating = ratings.find(candidate => found.length >= candidate.min && found.length <= candidate.max);
  if (!rating) throw new Error('Horizon Scan rating is missing.');

  const warnings: ScanWarnings = {
    criminalRaidBonus: 0,
    scottishRaidBonus: 0,
    raidRequirementReduction: 0,
    merchantPreview: null,
  };
  for (const anomaly of found) {
    if (anomaly.warningKey === 'criminalRaidBonus') warnings.criminalRaidBonus = 2;
    if (anomaly.warningKey === 'scottishRaidBonus') warnings.scottishRaidBonus = 2;
    if (anomaly.warningKey === 'raidRequirementReduction') warnings.raidRequirementReduction = 2;
    if (anomaly.warningKey === 'merchantPreview') warnings.merchantPreview = plan.merchantPreview;
    if (anomaly.id === 'birds' && anomaly.resolvedThreat) warnings.criminalRaidBonus = 2;
  }

  return {
    total: plan.anomalies.length,
    found: found.length,
    missed: missed.length,
    threats: found.filter(anomaly => anomaly.category === 'threat' || (anomaly.id === 'birds' && anomaly.resolvedThreat)).length,
    opportunities: found.filter(anomaly => anomaly.category === 'opportunity').length,
    foundList: found.map(({ name, description, reward, category, id, resolvedThreat }) =>
      ({ name, description, reward, category, id, resolvedThreat })),
    missedList: missed.map(({ name, id }) => ({ name, id })),
    rating,
    warnings,
  };
}
