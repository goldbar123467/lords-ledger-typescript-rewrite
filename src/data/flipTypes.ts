/** Shared contracts for authored perspective stories and their simulation. */
export const FLIP_STAT_IDS = [
  'authority', 'coin', 'danger', 'energy', 'family', 'health',
  'honor', 'household', 'hunger', 'reputation', 'safety',
] as const;
export type FlipStatId = typeof FLIP_STAT_IDS[number];
export type FlipStats = Partial<Record<FlipStatId, number>>;
export type FlipEffects = Partial<Record<'treasury' | 'people' | 'military' | 'faith', number>>;
export type FlipEnding = 'good' | 'medium' | 'bad';

export interface FlipStatDefinition {
  label: string;
  icon: string;
  initial: number;
  color: string;
}

export type FlipOption = {
  text: string;
  chance?: undefined;
  statEffects: FlipStats;
  outcome: string;
  consequenceFlags?: readonly string[];
} | {
  text: string;
  chance: number;
  successStatEffects: FlipStats;
  failureStatEffects: FlipStats;
  successOutcome: string;
  failureOutcome: string;
  consequenceFlags?: readonly string[] | { success?: readonly string[]; failure?: readonly string[] };
};

export interface FlipDecision {
  title: string;
  description: string;
  options: readonly FlipOption[];
  scribesNote?: string;
}

export interface FlipBase {
  id: string;
  character: string;
  title: string;
  colorScheme: { accent: string; light: string; background: string; text: string };
  triggerConditions: { minTurn: number };
  intro: { title: string; bridgeText: string; narrativeText: string };
  returnText: string;
  scribesNote: string;
}

export interface LinearFlip extends FlipBase {
  type?: undefined;
  characterStats: Partial<Record<FlipStatId, FlipStatDefinition>>;
  decisions: readonly FlipDecision[];
  consequences: { base: FlipEffects; flags: Record<string, FlipEffects> };
}

export type CyoaNode = {
  isEnding?: false;
  title: string;
  description: string;
  options: ReadonlyArray<{ text: string; goto: string }>;
} | {
  isEnding: true;
  endingType: FlipEnding;
  icon: string;
  title: string;
  description: string;
  historicalConnection: string;
};

export interface CyoaFlip extends FlipBase {
  type: 'cyoa';
  startNode: string;
  nodes: Record<string, CyoaNode>;
  consequences: Record<FlipEnding, FlipEffects>;
}

export type FlipDefinition = LinearFlip | CyoaFlip;

// Shape contracts permit different stories to define their own names. Authoring
// checks bind the literal references to each parent story rather than a global list.
type NodeTargets<Node> = Node extends { options: ReadonlyArray<{ goto: infer Id }> } ? Id : never;
export type InvalidCyoaReferences<Story extends CyoaFlip> =
  Exclude<Story['startNode'] | NodeTargets<Story['nodes'][keyof Story['nodes']]>, keyof Story['nodes']>;

type FlagNames<Flags> = Flags extends readonly string[] ? Flags[number]
  : Flags extends { success?: readonly string[]; failure?: readonly string[] }
    ? NonNullable<Flags['success']>[number] | NonNullable<Flags['failure']>[number] : never;
type OptionFlags<Option> = Option extends { consequenceFlags: infer Flags } ? FlagNames<Flags> : never;
export type InvalidLinearReferences<Story extends LinearFlip> = Exclude<
  OptionFlags<Story['decisions'][number]['options'][number]>, keyof Story['consequences']['flags']
>;
