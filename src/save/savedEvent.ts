import type { EventDefinition, EventOption } from '../data/eventTypes.ts';
import type { CompatibleAuthoredIndicators } from '../engine/meterUtils.ts';

/** Loaded prose remains historical; authored effects are checked by the save boundary. */
export interface SavedEventOption extends Pick<EventOption, 'text' | 'effects' | 'chronicle'> {
  readonly indicators: CompatibleAuthoredIndicators;
  readonly scribesNote?: string | null;
  readonly causeChainSummary?: string | null;
}
export interface SavedEvent extends Pick<EventDefinition, 'id' | 'title' | 'description'> {
  readonly options: readonly [SavedEventOption, ...SavedEventOption[]];
  readonly scribesNote?: string | null;
  /** Older gate metadata is used only in an explicit equality comparison. */
  readonly requiresMeter?: unknown;
}
