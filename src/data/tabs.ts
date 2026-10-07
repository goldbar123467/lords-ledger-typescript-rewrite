/** Navigation IDs and labels, shared by views, guidance, and browser tests. */
export const TAB_CONFIG = [
  { id: "estate",    label: "Estate" },
  { id: "map",       label: "Map" },
  { id: "market",    label: "Market" },
  { id: "military",  label: "Military" },
  { id: "people",    label: "People" },
  { id: "hall",      label: "Hall" },
  { id: "chapel",    label: "Chapel" },
  { id: "forge",     label: "Forge" },
  { id: "chronicle", label: "Chronicle" },
] as const;

export type TabId = typeof TAB_CONFIG[number]['id'];
export function isTabId(value: unknown): value is TabId {
  return typeof value === 'string' && TAB_CONFIG.some(tab => tab.id === value);
}
