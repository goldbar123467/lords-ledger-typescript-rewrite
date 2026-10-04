/** Estate resources and perspective meters, with one shared resource cell. */
import { Coins, Wheat, Users, Swords, Cross, Church, Heart } from 'lucide-react';
import { getMoraleLevel } from '../data/military.ts';
import type { FlipStatDefinition, FlipStatId } from '../data/flipTypes.ts';
import type { ResourceEffects } from '../engine/meterUtils.ts';
import type { EconomySeason } from '../engine/foodRequirement.ts';
import { BANKRUPTCY_SEASONS } from '../engine/endConditions.ts';

const RESOURCE_THEMES = {
  denarii: { label: 'Denarii', color: '#c4a24a', Icon: Coins },
  food: { label: 'Food', color: '#4a8a3a', Icon: Wheat },
  families: { label: 'Families', color: '#2962a8', Icon: Users },
  garrison: { label: 'Garrison', color: '#8b1a1a', Icon: Swords },
  morale: { label: 'Morale', color: '#d48a2a', Icon: Heart },
  faith: { label: 'Faith', color: '#7eb8d4', Icon: Cross },
  piety: { label: 'Piety', color: '#b89adb', Icon: Church },
};
const MORALE_TEXT_COLORS = {
  Mutinous: 'var(--color-status-negative)', Disgruntled: '#efc07c',
  Adequate: 'var(--color-tan-light)', Good: 'var(--color-status-positive)', Fierce: 'var(--color-gold-bright)',
};
const SEASON_SYMBOLS: Record<EconomySeason, string> = { spring: '❁', summer: '☀', autumn: '❧', winter: '❄' };

interface CoreResources { denarii: number; food: number; population: number; garrison: number; bankruptcyTurns?: number }
interface FlipDisplayStat extends Pick<FlipStatDefinition, 'label' | 'icon' | 'color'> { key: FlipStatId; value: number }
interface DashboardProps extends CoreResources {
  morale?: number | null;
  faith: number;
  piety: number;
  season: EconomySeason;
  year: number;
  turn: number;
  resourceDeltas?: Partial<ResourceEffects> | null;
  flipMode?: boolean;
  flipStats?: readonly FlipDisplayStat[] | null;
}
interface ResourceStatProps {
  resourceKey: keyof typeof RESOURCE_THEMES;
  value: number | string;
  warning?: boolean;
  delta?: number;
  description?: string;
  accentColor?: string;
  valueColor?: string;
}

function ResourceStat({ resourceKey, value, warning, delta, description, accentColor, valueColor }: ResourceStatProps) {
  const { label, color, Icon } = RESOURCE_THEMES[resourceKey];
  return (
    <div className={`resource-stat${warning ? ' critical-pulse' : ''}`} style={{ borderBottomColor: accentColor ?? color }}>
      <dt className="resource-stat-heading">{label}</dt>
      <dd>
        <div className="resource-stat-reading">
          <Icon size={16} aria-hidden="true" />
          <span data-testid={`resource-${resourceKey}`} className="resource-stat-value"
            style={{ color: valueColor }} aria-label={description ? `${label} ${value}, ${description}` : undefined}>
            {value}
          </span>
          {delta !== undefined && delta !== 0 && (
            <span className="resource-stat-delta" data-direction={delta > 0 ? 'gain' : 'loss'}>{delta > 0 ? `+${delta}` : delta}</span>
          )}
        </div>
        {description && <span className="resource-morale-label" style={{ color: valueColor }}>{description}</span>}
      </dd>
    </div>
  );
}

function FlipStatBar({ flipStats }: { flipStats: readonly FlipDisplayStat[] }) {
  return (
    <div className="flip-stat-grid">
      {flipStats.map(stat => (
        <div key={stat.key} className="flip-stat" role="meter" aria-label={`${stat.label}: ${stat.value} out of 100`}
          aria-valuenow={stat.value} aria-valuemin={0} aria-valuemax={100}>
          <div className="flip-stat-heading"><span aria-hidden="true">{stat.icon}</span> {stat.label}</div>
          <div className="flip-stat-track" style={{ borderColor: stat.color }}>
            <div style={{ width: `${stat.value}%`, backgroundColor: stat.color }} />
          </div>
          <span>{stat.value}</span>
        </div>
      ))}
    </div>
  );
}

function ResourceWarningBanner({ denarii, food, population, garrison, bankruptcyTurns }: CoreResources) {
  const warnings: string[] = [];
  if (population <= 5) warnings.push('Population is critically low! Build farms to grow food and attract settlers.');
  if (food <= 0) warnings.push('No food! Your people will starve and leave. Buy grain or build farms immediately.');
  if (denarii <= 0) {
    const turnsLeft = BANKRUPTCY_SEASONS - (bankruptcyTurns || 0);
    warnings.push(`Treasury is empty! ${turnsLeft > 0 ? `${turnsLeft} more season${turnsLeft === 1 ? '' : 's'} and creditors seize your estate.` : 'Creditors are at the gate!'} Sell goods or cut spending.`);
  }
  if (garrison <= 0) warnings.push('No garrison! Your fortifications must carry the defense; a breach brings extra losses.');
  if (warnings.length === 0) return null;
  return (
    <ul className="dashboard-warnings" aria-label="Resource warnings">
      {warnings.map(warning => <li key={warning}>{warning}</li>)}
    </ul>
  );
}

function TurnProgressBar({ turn }: { turn: number }) {
  const progress = `${((turn - 1) / 39) * 100}%`;
  return (
    <div className="turn-progress" role="progressbar" aria-label="Reign progress"
      aria-valuemin={1} aria-valuemax={40} aria-valuenow={turn} aria-valuetext={`Turn ${turn} of 40`}>
      <div className="turn-progress-fill" style={{ width: progress }} />
      <span style={{ left: progress }} aria-hidden="true">◆</span>
    </div>
  );
}

export default function Dashboard({ denarii, food, population, garrison, morale = 50, faith, piety,
  season, year, turn, resourceDeltas, bankruptcyTurns, flipMode, flipStats }: DashboardProps) {
  const seasonLabel = season.charAt(0).toUpperCase() + season.slice(1);
  const deltas = resourceDeltas ?? {};
  const moraleValue = morale ?? 50;
  const level = getMoraleLevel(moraleValue);
  return (
    <section className="dashboard" aria-label={flipMode ? 'Perspective resources' : 'Estate resources'}>
      {flipMode && flipStats ? <FlipStatBar flipStats={flipStats} /> : (
        <dl className="resource-grid">
          <ResourceStat resourceKey="denarii" value={`${denarii}d`} warning={denarii <= 0} delta={deltas.denarii} />
          <ResourceStat resourceKey="food" value={food} warning={food <= 0} delta={deltas.food} />
          <ResourceStat resourceKey="families" value={population} warning={population <= 5} delta={deltas.population} />
          <ResourceStat resourceKey="garrison" value={garrison} warning={garrison <= 0} delta={deltas.garrison} />
          <ResourceStat resourceKey="morale" value={moraleValue} warning={moraleValue <= 20} description={level.label}
            accentColor={level.color} valueColor={MORALE_TEXT_COLORS[level.label]} />
          <ResourceStat resourceKey="faith" value={faith} />
          <ResourceStat resourceKey="piety" value={piety} />
        </dl>
      )}
      {!flipMode && <>
        <ResourceWarningBanner denarii={denarii} food={food} population={population} garrison={garrison} bankruptcyTurns={bankruptcyTurns} />
        <div className="dashboard-season-row">
          <span><span aria-hidden="true">{SEASON_SYMBOLS[season]}</span> {seasonLabel}, Year {year} (Turn {turn}/40)</span>
          <TurnProgressBar turn={turn} />
        </div>
      </>}
    </section>
  );
}
