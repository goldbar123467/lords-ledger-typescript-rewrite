import type { TabId } from './tabs.ts';

interface Hint { readonly maxTurn: number; readonly text: string }
export const HINTS: Partial<Record<TabId, readonly Hint[]>> = {
  estate: [
    { maxTurn: 2, text: "Start by building a Strip Farm or Pasture — they produce food to keep your people alive and attract new settlers." },
    { maxTurn: 4, text: "Watch your Net income at the top. If it's negative, you're losing money each season. Build wisely!" },
  ],
  market: [
    { maxTurn: 4, text: "Visit merchant stalls to haggle for better prices, or use Quick Trade for instant deals at the posted rate." },
    { maxTurn: 6, text: "Your reputation with merchants grows as you trade. Higher reputation means better opening offers when haggling." },
  ],
  military: [
    { maxTurn: 6, text: "Recruit soldiers to defend your estate. Upgrade your castle and install defenses for lasting protection." },
    { maxTurn: 8, text: "Soldiers cost upkeep each season and eat food. Don't recruit more than you can afford to feed!" },
  ],
  people: [
    { maxTurn: 2, text: "Set your tax rate here. Higher taxes bring more gold in autumn, but families may leave if pushed too hard." },
    { maxTurn: 6, text: "Donate to the Church — the Church reciprocates with economic support and helps attract new settlers." },
  ],
  chronicle: [
    { maxTurn: 2, text: "This is the history of your reign. Every action, event, and season is recorded here." },
  ],
};
