/** Fields used by equipment readiness; crafted identity/content stays in the Forge domain. */
export interface EquippedItem {
  category: string;
  militaryBonus?: number | null;
  qualityScore?: number | null;
}

export function hasDefenseBonus(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
/** Broken and zero-effect legacy items stay owned, but do not function as arms. */
export function countFunctionalEquipment(equipped: readonly EquippedItem[]) {
  let weapon = 0, armor = 0;
  for (const item of equipped) {
    if (!hasDefenseBonus(item.militaryBonus)) continue;
    if (item.category === 'weapon') weapon++;
    else if (item.category === 'armor') armor++;
  }
  return { weapon, armor };
}

/** Preserve the authored arms/armor/quality weights and rounded flat defense bonus. */
export function calculateForgeReadiness(equipped: readonly EquippedItem[], garrison: number) {
  if (garrison <= 0) return { readiness: 0, armed: 0, armored: 0, quality: 0, defenseBonus: 0 };
  const functional = countFunctionalEquipment(equipped);
  const armed = Math.min(functional.weapon, garrison);
  const armored = Math.min(functional.armor, garrison);
  const militaryItems = equipped.filter(item => (item.militaryBonus ?? 0) > 0);
  const averageQuality = militaryItems.length > 0
    ? militaryItems.reduce((sum, item) => sum + (item.qualityScore ?? 50), 0) / militaryItems.length : 0;
  const readiness = Math.round((armed / garrison * 0.4 + armored / garrison * 0.3 + averageQuality / 100 * 0.3) * 100);
  const totalBonus = equipped.reduce((sum, item) => sum + (item.militaryBonus || 0), 0);
  return { readiness: Math.min(readiness, 100), armed, armored,
    quality: Math.round(averageQuality), defenseBonus: Math.round(totalBonus * 0.5) };
}
