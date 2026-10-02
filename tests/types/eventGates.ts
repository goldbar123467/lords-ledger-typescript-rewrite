import type randomEvents from '../../src/data/randomEvents.ts';
import type { EventMeterGate, RandomEvent } from '../../src/data/eventTypes.ts';

type Body = Omit<(typeof randomEvents)[0], 'category' | 'requiresMeter'>;
type Accepts<Category extends RandomEvent['category'], Gate extends EventMeterGate> =
  Body & { category: Category; requiresMeter: Gate } extends RandomEvent ? true : false;
type Accepted<T extends true> = T;
type Rejected<T extends false> = T;

/** G-EVT-01: every category/gate pairing is checked by the project typecheck. */
export type EventGateContracts = [
  Accepted<Accepts<'economic', null>>,
  Accepted<Accepts<'social', null>>,
  Accepted<Accepts<'military', 'military'>>,
  Accepted<Accepts<'religious', 'faith'>>,
  Rejected<Accepts<'economic', 'military'>>,
  Rejected<Accepts<'economic', 'faith'>>,
  Rejected<Accepts<'social', 'military'>>,
  Rejected<Accepts<'social', 'faith'>>,
  Rejected<Accepts<'military', null>>,
  Rejected<Accepts<'military', 'faith'>>,
  Rejected<Accepts<'religious', null>>,
  Rejected<Accepts<'religious', 'military'>>,
];
