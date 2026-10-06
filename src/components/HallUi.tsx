import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Scale } from 'lucide-react';
import type { HallMeterEffects } from '../data/decrees.ts';
import { hallMeterKeys } from '../engine/hallMeters.ts';
import { useHallReadingFocus } from '../hooks/useHallReadingFocus.ts';

export function CivicSurface({ children }: { children: ReactNode }) {
  const revealFocusedControl = useHallReadingFocus();
  return <div className="civic-view" onFocusCapture={revealFocusedControl}>{children}</div>;
}

export function HallButton({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={'civic-button ' + className} {...props}>{children}</button>;
}

export function HallEffects({ effects }: { effects: Readonly<HallMeterEffects> }) {
  return <span className="civic-effects">
    {hallMeterKeys.filter(key => effects[key] !== 0).map(key =>
      <span key={key} className={effects[key] > 0 ? 'civic-positive' : 'civic-negative'}>
        {key[0]?.toUpperCase() + key.slice(1)} {effects[key] > 0 ? '+' : ''}{effects[key]}
      </span>)}
  </span>;
}

export function WaxSeal() {
  return <div className="civic-seal" aria-hidden="true"><Scale size={24} /></div>;
}
