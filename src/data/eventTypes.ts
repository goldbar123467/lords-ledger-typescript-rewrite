import type { AuthoredEffects, AuthoredIndicators } from '../engine/meterUtils.ts';

export type EventSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type EventMeterGate = 'military' | 'faith' | null;

export interface EventOption {
  readonly text: string;
  readonly effects: AuthoredEffects;
  readonly chronicle: string;
  readonly indicators: AuthoredIndicators;
}

/** Shared authored event body; both event kinds use the same choice settlement. */
export interface EventDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly options: readonly [EventOption, ...EventOption[]];
  readonly scribesNote: string | null;
}

export interface SeasonalEvent<S extends EventSeason = EventSeason> extends EventDefinition {
  readonly season: S;
  readonly tutorialSafe?: boolean;
}

/** Each seasonal array may contain only events for that parent season. */
export type SeasonalEventRegistry = { readonly [S in EventSeason]: readonly SeasonalEvent<S>[] };

/** Economic/social events are ungated; military and religious events unlock later. */
export type RandomEvent = EventDefinition & (
  | { readonly category: 'economic' | 'social'; readonly requiresMeter: null }
  | { readonly category: 'military'; readonly requiresMeter: 'military' }
  | { readonly category: 'religious'; readonly requiresMeter: 'faith' }
);
