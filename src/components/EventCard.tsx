import type { EventDefinition } from '../data/eventTypes.ts';
import { translateIndicators, type AuthoredIndicators, type EffectDirection, type ResourceIndicators } from '../engine/meterUtils.ts';

const RESOURCE_LABELS = {
  denarii: { icon: '\u269C', name: 'Denarii' },
  food: { icon: '\u2727', name: 'Food' },
  population: { icon: '\u2302', name: 'Families' },
  garrison: { icon: '\u2694', name: 'Garrison' },
} satisfies Record<keyof ResourceIndicators, { icon: string; name: string }>;
const INDICATOR_TONES = {
  up: 'border-[#8dba6e] bg-[rgba(74,138,58,0.15)] text-[#8dba6e]',
  down: 'border-[#e59a91] bg-[rgba(198,40,40,0.15)] text-[#e59a91]',
} satisfies Record<EffectDirection, string>;

type IndicatorResource = keyof ResourceIndicators;
interface IndicatorEntry { resource: IndicatorResource; direction: EffectDirection }
function isIndicatorResource(value: string): value is IndicatorResource {
  return Object.hasOwn(RESOURCE_LABELS, value);
}

/** Preserve the translator's insertion order for both labels and accessible names. */
function indicatorEntries(indicators: AuthoredIndicators): IndicatorEntry[] {
  const translated = translateIndicators(indicators) ?? {};
  const entries: IndicatorEntry[] = [];
  for (const resource of Object.keys(translated)) {
    if (!isIndicatorResource(resource)) continue;
    const direction = translated[resource];
    if (direction) entries.push({ resource, direction });
  }
  return entries;
}

function IndicatorPills({ entries }: { entries: readonly IndicatorEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {entries.map(({ resource, direction }) => (
        <span key={resource} className={`inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded-full border ${INDICATOR_TONES[direction]}`}>
          <span aria-hidden="true">{RESOURCE_LABELS[resource].icon}</span>
          {RESOURCE_LABELS[resource].name}
          <span aria-hidden="true">{direction === 'up' ? '\u2191' : '\u2193'}</span>
        </span>
      ))}
    </div>
  );
}

interface EventCardProps {
  event?: EventDefinition | null;
  onChoose: (optionIndex: number) => void;
  phaseLabel?: string;
}

export default function EventCard({ event, onChoose, phaseLabel }: EventCardProps) {
  if (!event) return null;
  return (
    <div className="mx-auto w-full max-w-xl rounded-lg border-2 border-gold-dim bg-bg-card p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
      {phaseLabel && (
        <div className="text-xs uppercase tracking-widest font-heading font-semibold text-gold mb-2">{phaseLabel}</div>
      )}
      <h3 className="font-heading text-lg sm:text-xl font-bold text-gold-bright mb-2">{event.title}</h3>
      <p className="text-base leading-relaxed text-tan mb-4">{event.description}</p>
      <div className="flex flex-col gap-2" role="group" aria-label="Choose your response">
        {event.options.map((option, index) => {
          const entries = indicatorEntries(option.indicators);
          const consequences = entries.map(({ resource, direction }) =>
            `${RESOURCE_LABELS[resource].name} ${direction === 'up' ? 'increase' : 'decrease'}`).join(', ');
          const choiceLabel = option.text.trim().replace(/[.!?]+$/, '');
          return (
            <button key={index} onClick={() => onChoose(index)}
              className="w-full text-left px-4 py-4 rounded-md border-2 border-tan-dark bg-bg-dark text-tan-light cursor-pointer min-h-[44px] transition-colors duration-200 hover:bg-bg-elevated hover:border-gold"
              aria-label={`Option ${index + 1}: ${choiceLabel}${consequences ? `. Expected effects: ${consequences}.` : ''}`}>
              <div className="font-semibold text-base">{option.text}</div>
              <IndicatorPills entries={entries} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
