/** Fields used by equipment readiness; crafted identity/content stays in the Forge domain. */
export interface EquippedItem {
  category: string;
  militaryBonus?: number;
  qualityScore?: number;
}

/** Preserve the authored arms/armor/quality weights and rounded flat defense bonus. */
export function calculateForgeReadiness(equipped: readonly EquippedItem[], garrison: number) {
  if (garrison <= 0) return { readiness: 0, armed: 0, armored: 0, quality: 0, defenseBonus: 0 };
  const armed = Math.min(equipped.filter(item => item.category === 'weapon').length, garrison);
  const armored = Math.min(equipped.filter(item => item.category === 'armor').length, garrison);
  const militaryItems = equipped.filter(item => (item.militaryBonus ?? 0) > 0);
  const averageQuality = militaryItems.length > 0
    ? militaryItems.reduce((sum, item) => sum + (item.qualityScore ?? 50), 0) / militaryItems.length : 0;
  const readiness = Math.round((armed / garrison * 0.4 + armored / garrison * 0.3 + averageQuality / 100 * 0.3) * 100);
  const totalBonus = equipped.reduce((sum, item) => sum + (item.militaryBonus || 0), 0);
  return { readiness: Math.min(readiness, 100), armed, armored,
    quality: Math.round(averageQuality), defenseBonus: Math.round(totalBonus * 0.5) };
}
