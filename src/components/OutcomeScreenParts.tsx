import type { OutcomeResources } from '../data/endings.ts';

const RESOURCES = [
  { key: 'denarii', label: 'Denarii', icon: '\u269C', low: 100 },
  { key: 'food', label: 'Food', icon: '\u2727', low: 20 },
  { key: 'population', label: 'Families', icon: '\u2302', low: 10 },
  { key: 'garrison', label: 'Garrison', icon: '\u2694', low: 3 },
] as const;

export function hasLowFinalResource(state: OutcomeResources): boolean {
  return RESOURCES.some(resource => (state[resource.key] || 0) < resource.low);
}

export function FinalResourceCards({ state, emphasizeLow = false }: { state: OutcomeResources; emphasizeLow?: boolean }) {
  return (
    <dl className="terminal-resources mb-5 text-center" aria-label="Final estate resources">
      {RESOURCES.map(resource => {
        const raw = state[resource.key] || 0;
        const low = emphasizeLow && raw < resource.low;
        return (
          <div key={resource.key} className={`terminal-resource py-2 rounded-md border ${low ? 'terminal-resource-low' : ''}`}>
            <div className="text-lg mb-0.5" aria-hidden="true">{resource.icon}</div>
            <dt className="font-heading font-semibold uppercase">{resource.label}</dt>
            <dd className="text-xl font-bold">{resource.key === 'denarii' ? `${raw}d` : raw}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function OutcomeRestart({ onRestart, defeat = false }: { onRestart: () => void; defeat?: boolean }) {
  return (
    <button onClick={onRestart}
      className="terminal-restart w-full py-3 rounded-md border-2 font-heading font-bold text-base uppercase tracking-wider cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
      {defeat ? 'Try Again' : 'Reign Again'}
    </button>
  );
}
