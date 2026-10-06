import { useId, useLayoutEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Sparkles, Utensils } from 'lucide-react';
import type { FEAST_DATA, HallMeterEffects } from '../data/decrees.ts';
import { resolveFeast, type FeastSelection } from '../engine/feast.ts';
import { hallMeterKeys } from '../engine/hallMeters.ts';
import { CivicSurface, HallButton, HallEffects } from './HallUi.tsx';

type FeastData = typeof FEAST_DATA;
type Guest = FeastData['guestOptions'][number];
type Entertainment = FeastData['entertainmentOptions'][number];
type Course = FeastData['courseOptions'][number];
interface Selections {
  readonly guest: Guest | null;
  readonly entertainment: Entertainment | null;
  readonly course: Course | null;
}
// Later steps require the preceding choices; Back preserves all selections.
type FeastView = Selections & (
  { readonly step: 0 } |
  { readonly step: 1; readonly guest: Guest } |
  { readonly step: 2; readonly guest: Guest; readonly entertainment: Entertainment } |
  { readonly step: 3; readonly guest: Guest; readonly entertainment: Entertainment; readonly course: Course }
);
interface FeastHallProps {
  feastData: FeastData | null;
  rngState: number;
  hasFeastedThisSeason: boolean;
  onComplete: (selection: FeastSelection) => void;
  onReturn: () => void;
}
interface OptionView {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly effects: Readonly<HallMeterEffects>;
}
function FeastChoices<T extends OptionView>({ options, selected, onSelect }: {
  options: readonly T[]; selected: T | null; onSelect: (option: T) => void;
}) {
  const prefix = useId();
  return <div className="civic-choices">
    {options.map(option => <article className="feast-option" key={option.id}>
      <HallButton className="civic-choice" aria-pressed={selected?.id === option.id}
        aria-describedby={option.description ? prefix + option.id : undefined} onClick={() => onSelect(option)}>
        <span>{option.label}</span><HallEffects effects={option.effects} />
      </HallButton>
      {option.description && <p id={prefix + option.id}>{option.description}</p>}
    </article>)}
  </div>;
}
function runningEffects(selections: Selections): HallMeterEffects {
  const total = { people: 0, treasury: 0, church: 0, military: 0 };
  for (const option of [selections.guest, selections.entertainment, selections.course]) {
    if (option) for (const key of hallMeterKeys) total[key] += option.effects[key];
  }
  return total;
}
const STEP_SUBTITLES = ['Select your honored guests for the evening', 'How shall the hall be entertained?', "What fare shall grace the lord's table?"] as const;
const STEP_TITLES = ['Who Shall Attend?', 'Choose Entertainment', 'The Main Course', 'The Feast Begins'] as const;

export default function FeastHall({ feastData, rngState, hasFeastedThisSeason, onComplete, onReturn }: FeastHallProps) {
  const [view, setView] = useState<FeastView>({ step: 0, guest: null, entertainment: null, course: null });
  // Keep the new step's heading beneath the game navigation, as before.
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [view.step, hasFeastedThisSeason]);
  // Preview is recomputed from the live saved cursor; rendering never spends it.
  const outcome = view.step === 3 ? resolveFeast({ guestId: view.guest.id,
    entertainmentId: view.entertainment.id, courseId: view.course.id, seed: rngState }, rngState) : null;
  const canAdvance = view.step === 0 ? view.guest !== null : view.step === 1 ? view.entertainment !== null : view.step === 2 && view.course !== null;
  function next() {
    if (view.step === 0 && view.guest) setView({ ...view, step: 1, guest: view.guest });
    else if (view.step === 1 && view.entertainment) setView({ ...view, step: 2, entertainment: view.entertainment });
    else if (view.step === 2 && view.course) setView({ ...view, step: 3, course: view.course });
  }
  function back() {
    if (view.step === 1) setView({ ...view, step: 0 });
    else if (view.step === 2) setView({ ...view, step: 1 });
  }
  return <CivicSurface>
    <header className="civic-heading"><Utensils aria-hidden="true" />
      <h2>{view.step === 3 && !hasFeastedThisSeason ? 'The Feast Begins' : 'The Feast Hall'}</h2>
      {!hasFeastedThisSeason && view.step < 3 && <p>Prepare a grand celebration</p>}
    </header>
    {hasFeastedThisSeason ? <>
      <section className="civic-panel">
        <p>The tables have been cleared and the revelers have gone home. The hall still smells of roast meat and spilled ale.</p>
        <p>You have already held a feast this season.</p>
      </section>
      <HallButton onClick={onReturn}><ArrowLeft aria-hidden="true" size={18} />Return to Throne</HallButton>
    </> : !feastData ? <>
      <p>No feast preparations available.</p><HallButton onClick={onReturn}>Return to Throne</HallButton>
    </> : view.step !== 3 ? <>
      <nav className="feast-progress" aria-label="Feast preparation">
        {STEP_TITLES.map((title, step) => <span key={title} aria-current={step === view.step ? 'step' : undefined}>{step + 1}. {title}</span>)}
      </nav>
      <h3>Step {view.step + 1}: {STEP_TITLES[view.step]}</h3>
      <p className="civic-caption">{STEP_SUBTITLES[view.step]}</p>
      {view.step === 0 ? <FeastChoices options={feastData.guestOptions} selected={view.guest} onSelect={guest => setView({ ...view, guest })} /> :
        view.step === 1 ? <FeastChoices options={feastData.entertainmentOptions} selected={view.entertainment} onSelect={entertainment => setView({ ...view, entertainment })} /> :
          <FeastChoices options={feastData.courseOptions} selected={view.course} onSelect={course => setView({ ...view, course })} />}
      {(view.guest || view.entertainment || view.course) && <section className="civic-panel" aria-label="Running Total">
        <h3>Running Total</h3><HallEffects effects={runningEffects(view)} />
      </section>}
      <div className="civic-actions">
        {view.step > 0 ? <HallButton onClick={back}><ArrowLeft aria-hidden="true" size={18} />Back</HallButton> :
          <HallButton onClick={onReturn}><ArrowLeft aria-hidden="true" size={18} />Leave Hall</HallButton>}
        <HallButton disabled={!canAdvance} onClick={next}>{view.step === 2 ? 'Begin the Feast' : 'Next'}<ChevronRight aria-hidden="true" size={18} /></HallButton>
      </div>
    </> : <>
      <section className="civic-panel">
        <dl className="feast-summary"><div><dt>Guests</dt><dd>{view.guest.label}</dd></div>
          <div><dt>Entertainment</dt><dd>{view.entertainment.label}</dd></div>
          <div><dt>Course</dt><dd>{view.course.label}</dd></div></dl>
        <p>The hall fills with laughter and the clatter of wooden cups. Torchlight dances across the faces of your guests as the evening unfolds...</p>
      </section>
      {outcome ? <>
        <section className="civic-panel" aria-label="A Feast Event">
          <h3><Sparkles aria-hidden="true" size={20} /> A Feast Event</h3>
          <p>{outcome.event.text}</p><HallEffects effects={outcome.event.effects} />
        </section>
        <section className="civic-panel" aria-label="Total Impact"><h3>Total Impact</h3><HallEffects effects={outcome.totalEffects} /></section>
        <HallButton onClick={() => onComplete(outcome.selection)}><ArrowLeft aria-hidden="true" size={18} />Return to Throne</HallButton>
      </> : <p>The feast cannot be prepared from this saved state.</p>}
    </>}
  </CivicSurface>;
}
