import type {ForgeSaveState} from '../engine/forgeState.ts';
import { useEffect, useLayoutEffect, useRef, useState, type Dispatch } from 'react';
import { Scale, Users, ScrollText, Landmark, Utensils, Shield, AlertTriangle, Star, BookOpen } from 'lucide-react';
import { AMBIENT_TEXTS, DEFAULT_METERS, selectEdmundLine, getTrustTier, getEdmundMood, REPUTATION_TRACKS, COMPOUND_RULES } from '../data/greatHall.ts';
import type { Dispute, DisputeId } from '../data/disputes.ts';
import type { SEASON_INFO } from '../data/economy.ts';
import AUDIENCE_ENCOUNTERS from '../data/audience.ts';
import { DECREE_OPTIONS, FEAST_DATA } from '../data/decrees.ts';
import { getAvailableDisputes, type DisputeAction } from '../engine/disputeActions.ts';
import type { AudienceAction } from '../engine/audienceActions.ts';
import { getAvailableCouncilTopic, isCouncilUnlocked, type HallCivicAction } from '../engine/hallCivic.ts';
import { hasFeastedInSeason, type FeastSelection } from '../engine/feast.ts';
import { hallMeterDeltas } from '../engine/hallConsequences.ts';
import { hallMeterKeys } from '../engine/hallMeters.ts';
import type { HallSaveState } from '../engine/hallAudienceState.ts';
import type { HallPendingEvent } from '../engine/hallConsequenceState.ts';
import { useHallReadingFocus } from '../hooks/useHallReadingFocus.ts';
import { HallButton } from './HallUi.tsx';
import DisputeScreen from './DisputeScreen.tsx';
import AudienceChamber from './AudienceChamber.tsx';
import DecreeDesk from './DecreeDesk.tsx';
import CouncilChamber from './CouncilChamber.tsx';
import FeastHall from './FeastHall.tsx';

export interface GreatHallState {
  readonly blacksmith?: Readonly<ForgeSaveState>;
  readonly season: keyof typeof SEASON_INFO;
  readonly turn: number;
  readonly year: number;
  readonly rngState: number;
  readonly greatHall: Readonly<HallSaveState>;
}
export type GreatHallAction = DisputeAction | AudienceAction | HallCivicAction |
  { type: 'HALL_FEAST_COMPLETE'; payload: FeastSelection } | { type: 'HALL_DISMISS_EVENT' };
interface GreatHallProps { state: GreatHallState; dispatch: Dispatch<GreatHallAction> }
const HALL_VIEWS = [
  { id: 'throne', label: 'Throne', Icon: Scale }, { id: 'audience', label: 'Audience', Icon: Users },
  { id: 'decrees', label: 'Decrees', Icon: ScrollText }, { id: 'council', label: 'Council', Icon: Landmark },
  { id: 'feast', label: 'Feast', Icon: Utensils }, { id: 'summary', label: 'Summary', Icon: BookOpen },
] as const;
type HallView = typeof HALL_VIEWS[number]['id'];
type SelectedDispute = Dispute & { readonly id: DisputeId };
type HallScreen = { kind: HallView } | { kind: 'dispute'; dispute: SelectedDispute };
const meterLabels = { people: 'People', treasury: 'Treasury', church: 'Church', military: 'Military' };
const signed = (value: number) => (value > 0 ? '+' : '') + value;

function Torch() {
  return <span className="hall-torch torch-glow" aria-hidden="true"><span /><i /></span>;
}
function TrustBar({ trust }: { trust: number }) {
  const tier = getTrustTier(trust);
  return <div className="hall-trust">
    <p>Trust: {tier.label} <strong>{trust}/100</strong></p>
    <div className="hall-bar" role="meter" aria-label="Edmund's trust" aria-valuemin={0} aria-valuemax={100} aria-valuenow={trust}>
      <span style={{ width: trust + '%' }} />
    </div>
    <p className="hall-caption">{tier.desc}</p>
  </div>;
}
function HallEventBanner({ event, onDismiss }: { event: HallPendingEvent; onDismiss: () => void }) {
  const crisis = event.type === 'crisis', Icon = crisis ? AlertTriangle : Star;
  return <section className={'hall-event hall-panel ' + (crisis ? 'hall-crisis' : 'hall-peak')} aria-label="Hall event">
    <h3><Icon aria-hidden="true" /> {crisis ? 'CRISIS' : 'PEAK'}: {event.meter}</h3>
    <p>{event.text}</p>
    <div className="hall-effects">{hallMeterKeys.filter(key => event.effects?.[key]).map(key => {
      const value = event.effects?.[key] ?? 0;
      return <span key={key} className={value > 0 ? 'civic-positive' : 'civic-negative'}>{meterLabels[key]} {signed(value)}</span>;
    })}</div>
    <HallButton onClick={onDismiss}>Acknowledge</HallButton>
  </section>;
}
function SeasonSummary({ state, onReturn }: { state: GreatHallState; onReturn: () => void }) {
  const hall = state.greatHall, meters = hall.meters ?? DEFAULT_METERS, history = hall.meterHistory ?? [];
  const previous = history.length >= 2 ? history[history.length - 2]?.meters ?? DEFAULT_METERS : DEFAULT_METERS;
  const deltas = hallMeterDeltas(meters, previous);
  const log = (hall.hallLog ?? []).filter(entry => entry.season === state.season && entry.year === state.year);
  const compounds = COMPOUND_RULES.filter(rule => hall.compoundFlags?.[rule.flag]);
  return <div className="hall-summary">
    <h3>Season Summary</h3>
    <section className="hall-panel"><h4><BookOpen aria-hidden="true" /> Meter Changes</h4>
      <div className="hall-meter-grid">{hallMeterKeys.map(key => <div className="hall-meter" key={key}>
        <p><span>{meterLabels[key]}</span><strong className={deltas[key] > 0 ? 'civic-positive' : deltas[key] < 0 ? 'civic-negative' : ''}>{signed(deltas[key])}</strong></p>
        <div className={'hall-bar hall-bar-' + key} aria-hidden="true"><span style={{width: meters[key] + '%'}} /></div>
        <p className="hall-caption">{meters[key]}/100</p>
      </div>)}</div>
    </section>
    {log.length > 0 && <section className="hall-panel"><h4>Hall Actions This Season</h4>{log.map((entry, index) =>
      <article className="hall-log" key={index}><span className="hall-caption">{entry.type}</span><p>{entry.text}</p></article>)}</section>}
    {compounds.length > 0 && <section className="hall-panel"><h4>Ripple Effects</h4>{compounds.map(rule => <p className="hall-ripple" key={rule.flag}>{rule.label}</p>)}</section>}
    <HallButton onClick={onReturn}>Return to Throne</HallButton>
  </div>;
}
function ThroneRoom({ state, line, disputes, onSelect }: {
  state: GreatHallState; line: string; disputes: readonly SelectedDispute[]; onSelect: (dispute: SelectedDispute) => void;
}) {
  const trust = state.greatHall.stewardTrust ?? 50, mood = getEdmundMood(state.greatHall.meters.treasury);
  const track = state.greatHall.reputationTrack;
  return <div className="hall-throne">
    <header className="hall-seat"><Scale aria-hidden="true" /><h3>The Seat of Judgment</h3>
      <p>From this throne, the lord hears the disputes of the land and shapes the fate of the manor.</p>
      {track && <p className="hall-caption"><Shield aria-hidden="true" /> {REPUTATION_TRACKS[track].label} Path</p>}
    </header>
    <div className="hall-throne-panels">
      <section className="hall-panel hall-steward">
        <div className="hall-steward-heading"><span className="hall-portrait" aria-hidden="true">E</span><div><h4>Edmund</h4><p className="hall-caption">Steward of the Hall</p><p className="hall-mood">{mood.label}</p></div></div>
        <blockquote>&ldquo;{line}&rdquo;</blockquote><TrustBar trust={trust} />
      </section>
      <section className="hall-panel hall-queue"><h4><ScrollText aria-hidden="true" /> Today&rsquo;s Queue</h4>
        {disputes.length === 0 ? <p>No disputes await your judgment this season.</p> : <>
          {disputes.map(dispute => <HallButton key={dispute.id} className="hall-case" onClick={() => onSelect(dispute)}>
            <span>{dispute.title}</span><span className="hall-caption">{dispute.difficulty}</span>
          </HallButton>)}<p className="hall-caption">Select a dispute to hear the case.</p>
        </>}
      </section>
    </div>
  </div>;
}

/** The shell owns presentation only; commands and saved effects stay in the engine. */
export default function GreatHall({ state, dispatch }: GreatHallProps) {
  const [screen, setScreen] = useState<HallScreen>({kind: 'throne'});
  const hall = state.greatHall, trust = hall.stewardTrust ?? 50;
  const [line, setLine] = useState(() => selectEdmundLine(state, 'throne', trust));
  const [ambientIndex, setAmbientIndex] = useState(0), [ambientVisible, setAmbientVisible] = useState(true);
  const nav = useRef<HTMLElement>(null), activeTab = useRef<HTMLButtonElement>(null);
  const revealFocusedControl = useHallReadingFocus();
  const switchView = (kind: HallView) => { setScreen({kind}); setLine(selectEdmundLine(state, kind, trust)); };
  const selectDispute = (dispute: SelectedDispute) => { setScreen({kind:'dispute',dispute}); setLine(selectEdmundLine(state, 'dispute', trust)); };
  const toThrone = () => switchView('throne');
  const resolvedAudience = hall.audienceResolved ?? [];
  const availableAudience = AUDIENCE_ENCOUNTERS.filter(encounter => !resolvedAudience.includes(encounter.id)).slice(0, 5);
  const availableDisputes = getAvailableDisputes(state.season, hall.rulingHistory);

  useLayoutEffect(() => {
    const align = () => {
      const bar = nav.current, focused = document.activeElement;
      // Late font/size notifications must keep the keyboard target in view.
      const button = focused instanceof HTMLButtonElement && bar?.contains(focused) && focused.matches(':focus-visible')
        ? focused : activeTab.current;
      if (!bar || !button) return;
      const viewport = bar.getBoundingClientRect(), target = button.getBoundingClientRect();
      if (target.left < viewport.left + 6) bar.scrollLeft -= viewport.left + 6 - target.left;
      else if (target.right > viewport.right - 6) bar.scrollLeft += target.right - viewport.right + 6;
    };
    align();
    const observer = new ResizeObserver(align);
    if (nav.current) observer.observe(nav.current);
    if (activeTab.current) observer.observe(activeTab.current);
    window.addEventListener('resize', align);
    return () => { observer.disconnect(); window.removeEventListener('resize', align); };
  }, [screen.kind]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let interval: number | undefined, fade: number | undefined;
    const stop = () => { window.clearInterval(interval); window.clearTimeout(fade); };
    const configure = () => {
      stop(); setAmbientVisible(true);
      if (!preference.matches) interval = window.setInterval(() => {
        setAmbientVisible(false);
        fade = window.setTimeout(() => { setAmbientIndex(index => (index + 1) % AMBIENT_TEXTS.length); setAmbientVisible(true); }, 500);
      }, 8000);
    };
    configure(); preference.addEventListener('change', configure);
    return () => { stop(); preference.removeEventListener('change', configure); };
  }, []);

  return <div className="great-hall" onFocusCapture={event => {
    // Existing subviews own their focus geometry; the shell handles its controls.
    if (!event.target.closest('.civic-view, .dispute-screen')) revealFocusedControl(event);
  }}>
    <header className="hall-heading"><Torch /><div><h2>The Great Hall</h2>
      <p><span>{hall.reputation || 'Unknown Lord'}</span> &mdash; {state.season.charAt(0).toUpperCase() + state.season.slice(1)}, Year {state.year}</p>
    </div><Torch /></header>
    <div className="hall-content">
      {hall.pendingHallEvent && <HallEventBanner event={hall.pendingHallEvent} onDismiss={() => dispatch({type:'HALL_DISMISS_EVENT'})} />}
      {screen.kind === 'throne' && <ThroneRoom state={state} line={line} disputes={availableDisputes} onSelect={selectDispute} />}
      {screen.kind === 'dispute' && <DisputeScreen dispute={screen.dispute} onRule={(disputeId,rulingId) => dispatch({type:'HALL_RULE_DISPUTE',payload:{disputeId,rulingId}})} onReturn={toThrone} />}
      {screen.kind === 'audience' && <AudienceChamber encounters={availableAudience} resolvedIds={resolvedAudience} onRespond={(encounterId,responseIndex) => dispatch({type:'HALL_AUDIENCE_RESPOND',payload:{encounterId,responseIndex}})} onReturn={toThrone} />}
      {screen.kind === 'decrees' && <DecreeDesk decrees={DECREE_OPTIONS} activeDecreeIds={hall.activeDecrees ?? []} decreeSlots={2-(hall.decreeSlotsUsed ?? 0)} onIssue={decreeId => dispatch({type:'HALL_ISSUE_DECREE',payload:{decreeId}})} onRevoke={decreeId => dispatch({type:'HALL_REVOKE_DECREE',payload:{decreeId}})} onReturn={toThrone} />}
      {screen.kind === 'council' && <CouncilChamber topic={getAvailableCouncilTopic(hall.councilResolved)} isLocked={!isCouncilUnlocked(state.turn,hall.meters.people)} onVote={(topicId,optionId) => dispatch({type:'HALL_COUNCIL_VOTE',payload:{topicId,optionId}})} onReturn={toThrone} />}
      {screen.kind === 'feast' && <FeastHall feastData={FEAST_DATA} rngState={state.rngState} blacksmith={state.blacksmith} hasFeastedThisSeason={hasFeastedInSeason(hall,state.season,state.year)} onComplete={payload => dispatch({type:'HALL_FEAST_COMPLETE',payload})} onReturn={toThrone} />}
      {screen.kind === 'summary' && <SeasonSummary state={state} onReturn={toThrone} />}
    </div>
    <nav className="hall-navigation" aria-label="Great Hall" ref={nav} onFocusCapture={event => {
      if (!event.target.matches('button:focus-visible')) return;
      const bar = event.currentTarget, viewport = bar.getBoundingClientRect(), target = event.target.getBoundingClientRect();
      if (target.left < viewport.left + 8) bar.scrollLeft -= viewport.left + 8 - target.left;
      else if (target.right > viewport.right - 8) bar.scrollLeft += target.right - viewport.right + 8;
    }}>{HALL_VIEWS.map(view =>
      <HallButton key={view.id} ref={screen.kind === view.id ? activeTab : null} aria-current={screen.kind === view.id ? 'page' : undefined} onClick={() => switchView(view.id)}>
        <view.Icon size={18} aria-hidden="true" /><span>{view.label}</span>
      </HallButton>)}</nav>
    <footer className="hall-ambient"><p style={{opacity: ambientVisible ? 1 : 0}}>&#9656; {AMBIENT_TEXTS[ambientIndex]}</p></footer>
  </div>;
}
