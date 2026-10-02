import { Landmark, Map, Store, Shield, Users, Scale, Church, Hammer, ScrollText, type LucideIcon } from 'lucide-react';
import type { TabId } from '../data/tabs.ts';

/** Keep navigation and first-visit guidance paired with the same authored icon. */
export const TAB_ICONS = {
  estate: Landmark, map: Map, market: Store, military: Shield, people: Users,
  hall: Scale, chapel: Church, forge: Hammer, chronicle: ScrollText,
} satisfies Record<TabId, LucideIcon>;
