import type { TabId } from './tabs.ts';

interface Tutorial {
  readonly title: string;
  readonly subtitle: string;
  readonly sections: readonly [{ readonly heading: string; readonly text: string }, ...{ readonly heading: string; readonly text: string }[]];
  readonly tip: string;
}

export const TUTORIALS = {
  estate: {
    title: "The Estate",
    subtitle: "Your Land, Your Legacy",
    sections: [
      {
        heading: "Buildings",
        text: "Construct farms, workshops, and mills on your limited land plots. Each building produces resources each season — but also costs upkeep.",
      },
      {
        heading: "Condition",
        text: "Buildings degrade over time, especially in winter. Repair them before they fall to ruin, or their output drops to nothing.",
      },
      {
        heading: "Inventory",
        text: "Everything your estate produces flows into your inventory — grain, livestock, iron, wool, and more. Manage it wisely; your people eat from it each season.",
      },
    ],
    tip: "Start with a Strip Farm or Pasture to feed your people. Watch your net income — if it turns red, you're spending more than you earn.",
  },

  map: {
    title: "The Map",
    subtitle: "A Bird's-Eye View",
    sections: [
      {
        heading: "Your Domain",
        text: "See your estate laid out before you — every building, field, and path. Peasants go about their daily work across the land.",
      },
      {
        heading: "The Tavern",
        text: "Visit the tavern to gamble, hear rumors, meet travelling merchants, and encounter mysterious strangers. Fortune favors the bold — but beware the cost.",
      },
      {
        heading: "The Watchtower",
        text: "Send scouts to scan the horizon for threats. Spotting raiders early gives your garrison a defensive advantage when the attack comes.",
      },
    ],
    tip: "Check the watchtower regularly — early warning of raids can mean the difference between victory and ruin.",
  },

  market: {
    title: "The Market",
    subtitle: "Trade & Commerce",
    sections: [
      {
        heading: "Buying & Selling",
        text: "Sell surplus goods from your inventory or buy what you need. Prices fluctuate each season — buy low, sell high.",
      },
      {
        heading: "Haggling",
        text: "Visit merchant stalls to haggle for better prices. Each merchant has a different personality and tolerance for negotiation.",
      },
      {
        heading: "Reputation",
        text: "Fair dealing builds your merchant reputation over time. Higher reputation means better opening offers and access to rare goods.",
      },
    ],
    tip: "Sell excess grain after a good harvest, and stockpile food before winter when production drops sharply.",
  },

  military: {
    title: "The Military",
    subtitle: "Defend Your Realm",
    sections: [
      {
        heading: "Garrison",
        text: "Recruit levy, men-at-arms, or knights. Each type has different costs, upkeep, and combat strength. Knights are powerful but expensive.",
      },
      {
        heading: "Fortifications",
        text: "Upgrade your walls, gate, and moat. These provide passive defense that protects you even when your garrison is small.",
      },
      {
        heading: "Morale",
        text: "Well-fed, well-paid soldiers fight harder. Morale affects your defense rating — hungry, unpaid troops may desert entirely.",
      },
    ],
    tip: "Balance your garrison size with your food supply. Soldiers eat and cost wages — an army you can't feed is worse than no army at all.",
  },

  people: {
    title: "The People",
    subtitle: "Your Subjects & Workforce",
    sections: [
      {
        heading: "Social Tiers",
        text: "Your population is divided into serfs, freemen, and skilled workers. Each tier has different abilities and loyalties.",
      },
      {
        heading: "Labor Allocation",
        text: "Assign your people to farming, garrison duty, or church service. The right balance keeps food flowing and defenses strong.",
      },
      {
        heading: "Taxes & Morale",
        text: "Set tax rates carefully — high taxes fill your coffers but drive people away. Low taxes keep folk happy but may leave you short of coin.",
      },
      {
        heading: "Notable Families",
        text: "Four prominent families live on your estate. Keep them loyal and they provide powerful bonuses. Neglect them and they may depart.",
      },
    ],
    tip: "Watch the morale gauge closely. If it drops too low, freemen will flee and your workforce shrinks — a spiral that's hard to reverse.",
  },

  hall: {
    title: "The Great Hall",
    subtitle: "Justice, Council & Ceremony",
    sections: [
      {
        heading: "Disputes",
        text: "Settle disputes between your subjects. Your rulings shape your reputation — merciful, stern, wealthy, pious, or militant.",
      },
      {
        heading: "Audiences & Decrees",
        text: "Hear petitioners who come seeking aid, then issue decrees that shape the future of your estate.",
      },
      {
        heading: "Council & Feasts",
        text: "Convene your council for advice on pressing matters, and host feasts to boost morale and strengthen bonds.",
      },
      {
        heading: "Steward Edmund",
        text: "Your trusted steward Edmund offers counsel based on the state of your realm. Build his trust through wise governance.",
      },
    ],
    tip: "Your rulings have lasting consequences. Patterns of mercy or harshness unlock compound events later in the game.",
  },

  chapel: {
    title: "The Chapel",
    subtitle: "Faith & Piety",
    sections: [
      {
        heading: "Tithes",
        text: "Give tithes to Father Anselm to increase your faith and piety. The Church reciprocates with economic support and blessings.",
      },
      {
        heading: "The Shop",
        text: "Brother Caedmon sells relics and religious items that provide lasting benefits to your estate.",
      },
      {
        heading: "Moral Dilemmas",
        text: "Face difficult moral choices that test your character. There are no easy answers — only consequences.",
      },
      {
        heading: "The Scriptorium",
        text: "Try your hand at manuscript illumination. Match symbols to earn piety and preserve knowledge for future generations.",
      },
    ],
    tip: "Regular tithes build faith steadily. High faith attracts settlers and provides economic benefits each season.",
  },

  forge: {
    title: "The Forge",
    subtitle: "Steel & Fire",
    sections: [
      {
        heading: "Commissions",
        text: "Take orders from the commission desk. Each item requires specific materials and skill to forge.",
      },
      {
        heading: "The Forging Game",
        text: "Time your hammer strikes to the rhythm of the bellows. Better timing means higher quality weapons and armor.",
      },
      {
        heading: "Armory & Storefront",
        text: "Equip forged items for defense bonuses, or sell them to seasonal buyers for profit. Quality affects price.",
      },
      {
        heading: "Godric the Smith",
        text: "Earn Godric's respect through quality work. Higher respect unlocks better commissions and his trust.",
      },
    ],
    tip: "Forge materials (iron, steel, coal, leather, wood) come from your estate inventory. Build the right workshops to keep supplies flowing.",
  },

  chronicle: {
    title: "The Chronicle",
    subtitle: "History of Your Reign",
    sections: [
      {
        heading: "Your Record",
        text: "Every action you take, every event that befalls your estate, and every season that passes is recorded here.",
      },
      {
        heading: "Entry Types",
        text: "Gold entries mark your decisions, purple entries mark random events, and brown entries record seasonal changes.",
      },
      {
        heading: "Seasonal Events",
        text: "When the season is simulated, events appear here for you to respond to. Choose wisely — your choices shape the chronicle.",
      },
    ],
    tip: "Review your chronicle to spot patterns — if food keeps dropping each winter, you may need more farms or a grain stockpile.",
  },
} as const satisfies Record<TabId, Tutorial>;
