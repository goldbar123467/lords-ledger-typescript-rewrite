import { useId, useState } from 'react';
import { Landmark, Lock, BookOpen, ArrowLeft } from 'lucide-react';
import type { CouncilAdvisorId, COUNCIL_TOPICS } from '../data/decrees.ts';
import { CivicSurface, HallButton, HallEffects, WaxSeal } from './HallUi.tsx';

type Topic = (typeof COUNCIL_TOPICS)[number];
type Choice = Topic['options'][number];
interface CouncilChamberProps {
  topic: Topic | null;
  isLocked: boolean;
  onVote: (topicId: Topic['id'], optionId: Choice['id']) => void;
  onReturn: () => void;
}
type CouncilView = { kind: 'debate' } | { kind: 'voted'; topic: Topic; option: Choice };
const ADVISORS = {
  edmund: { name: 'Edmund', title: 'Steward of the Hall', initial: 'E' },
  aldous: { name: 'Father Aldous', title: 'Parish Chaplain', initial: 'A' },
  wulf: { name: 'Sergeant Wulf', title: 'Captain of the Guard', initial: 'W' },
  margery: { name: 'Margery the Elder', title: 'Voice of the People', initial: 'M' },
} satisfies Record<CouncilAdvisorId, { name: string; title: string; initial: string }>;
const ADVISOR_ORDER: readonly CouncilAdvisorId[] = ['edmund', 'aldous', 'wulf', 'margery'];

export default function CouncilChamber({ topic, isLocked, onVote, onReturn }: CouncilChamberProps) {
  const [view, setView] = useState<CouncilView>({ kind: 'debate' });
  const [showHistory, setShowHistory] = useState(false);
  const historyId = useId();
  const currentTopic = view.kind === 'voted' ? view.topic : topic;
  const locked = isLocked && view.kind === 'debate';
  return <CivicSurface>
    <header className="civic-heading">
      {locked ? <Lock aria-hidden="true" /> : <Landmark aria-hidden="true" />}
      <h2>The Council Chamber</h2>
      <p>{locked ? 'The chamber opens in Season 4 or when People approval is above 70.' : 'Your advisors have gathered.'}</p>
    </header>
    {locked || !currentTopic ? <p className="civic-panel">
      {locked ? 'The advisors await the opening of the council.' : 'All available matters have been settled. The advisors sit quietly, awaiting your command.'}
    </p> : view.kind === 'debate' ? <>
      <section className="civic-panel">
        <p className="civic-caption">Matter before the council</p>
        <h3>{currentTopic.title}</h3><p>{currentTopic.description}</p>
      </section>
      <div className="civic-advisors">
        {ADVISOR_ORDER.map(id => {
          const advisor = ADVISORS[id], opinion = currentTopic.advisors[id];
          return <section className="civic-panel" key={id}>
            <div className="civic-advisor-heading">
              <span aria-hidden="true" className={'civic-portrait civic-portrait-' + id}>{advisor.initial}</span>
              <div><h3>{advisor.name}</h3><p className="civic-caption">{advisor.title}</p></div>
            </div>
            <p className={'civic-position civic-position-' + opinion.position}>{opinion.position}</p>
            <blockquote>{opinion.speech}</blockquote>
          </section>;
        })}
      </div>
      <section aria-label="Council choices" className="civic-choices">
        <h3>Your decision</h3>
        {currentTopic.options.map(option => <HallButton className="civic-choice" key={option.id} onClick={() => {
          onVote(currentTopic.id, option.id);
          setView({ kind: 'voted', topic: currentTopic, option });
        }}><span>{option.label}</span><HallEffects effects={option.consequences} /></HallButton>)}
      </section>
    </> : <>
      <section className="civic-panel civic-aftermath">
        <WaxSeal /><h3>The Council Has Decided</h3><p>{currentTopic.title}</p>
        <p className="civic-decision">{view.option.label}</p>
        <h4>What Follows</h4><p>{view.option.aftermath}</p>
        <HallEffects effects={view.option.consequences} />
      </section>
      <HallButton aria-expanded={showHistory} aria-controls={historyId} onClick={() => setShowHistory(!showHistory)}>
        <BookOpen aria-hidden="true" size={18} />{showHistory ? 'Hide Historical Context' : 'Show Historical Context'}
      </HallButton>
      {showHistory && <section id={historyId} className="civic-panel"><h3>Historical Context</h3><p>{currentTopic.historicalNote}</p></section>}
    </>}
    <HallButton onClick={onReturn}><ArrowLeft aria-hidden="true" size={18} />Return to Throne</HallButton>
  </CivicSurface>;
}
