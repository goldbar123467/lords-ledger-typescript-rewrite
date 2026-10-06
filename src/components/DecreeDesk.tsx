import { useId, useState } from 'react';
import { ScrollText, ArrowLeft } from 'lucide-react';
import type { DECREE_OPTIONS } from '../data/decrees.ts';
import { CivicSurface, HallButton, HallEffects, WaxSeal } from './HallUi.tsx';

type Decree = (typeof DECREE_OPTIONS)[number];
interface DecreeDeskProps {
  decrees: readonly Decree[];
  activeDecreeIds: readonly Decree['id'][];
  decreeSlots: number;
  onIssue: (id: Decree['id']) => void;
  onRevoke: (id: Decree['id']) => void;
  onReturn: () => void;
}
type DecreeView = { kind: 'list' } | { kind: 'detail' | 'sealed' | 'revoking'; decree: Decree };
const durationLabel = (decree: Decree) => decree.duration === 'permanent' ? 'Permanent' : '1 Event';

export default function DecreeDesk({ decrees, activeDecreeIds, decreeSlots, onIssue, onRevoke, onReturn }: DecreeDeskProps) {
  const [view, setView] = useState<DecreeView>({ kind: 'list' });
  const descriptionId = useId();
  const remaining = Math.max(0, decreeSlots);
  const canSeal = view.kind === 'detail' && remaining > 0 && !activeDecreeIds.includes(view.decree.id);
  const returnToList = () => setView({ kind: 'list' });
  return <CivicSurface>
    <header className="civic-heading"><ScrollText aria-hidden="true" /><h2>The Decree Desk</h2><p>Seal your will into law.</p></header>
    <p className="civic-quota">Decrees remaining this season: <strong>{remaining}</strong></p>
    {view.kind === 'list' ? <>
      <section className="civic-list" aria-label="Active decrees"><h3>Active Decrees</h3>
        {activeDecreeIds.length === 0 && <p>No decrees are currently active.</p>}
        {decrees.filter(decree => activeDecreeIds.includes(decree.id)).map(decree => <article className="civic-panel" key={decree.id}>
          <div className="civic-decree-heading"><h4>{decree.name}</h4>
            {decree.revokable && <HallButton onClick={() => setView({ kind: 'revoking', decree })}>Revoke</HallButton>}
          </div>
          <p className="civic-caption">{durationLabel(decree)} · {decree.revokable ? 'Revokable' : 'Cannot Revoke'}</p><HallEffects effects={decree.effects} />
        </article>)}
      </section>
      <section className="civic-list" aria-label="Available decrees"><h3>Available Decrees</h3>
        {remaining === 0 && <p>The seasonal quota is spent. You can still read the decrees; another seal must wait until next season.</p>}
        {decrees.filter(decree => !activeDecreeIds.includes(decree.id)).map(decree => <article className="civic-panel" key={decree.id}>
          <h4>{decree.name}</h4><p>{decree.description}</p>
          <p className="civic-caption">{durationLabel(decree)} · {decree.revokable ? 'Revokable' : 'Cannot Revoke'}</p><HallEffects effects={decree.effects} />
          <HallButton aria-label={'View decree: ' + decree.name} onClick={() => setView({ kind: 'detail', decree })}>View decree</HallButton>
        </article>)}
      </section>
    </> : view.kind === 'revoking' ? <section className="civic-panel">
      <h3>Revoke Decree</h3><p>Are you certain you wish to revoke {view.decree.name}?</p>
      <p>This removes the decree from the active list. Approval changes already applied remain, and no seasonal decree slot is refunded.</p>
      <div className="civic-actions">
        <HallButton onClick={() => { onRevoke(view.decree.id); returnToList(); }}>Tear It Down</HallButton>
        <HallButton onClick={returnToList}>Keep the Decree</HallButton>
      </div>
    </section> : <section className="civic-panel civic-aftermath">
      {view.kind === 'sealed' && <><WaxSeal /><h3>By Decree of the Lord</h3></>}
      <h3>{view.decree.name}</h3><p className="civic-caption">{durationLabel(view.decree)} · {view.decree.revokable ? 'Revokable' : 'Cannot Revoke'}</p>
      <p id={descriptionId}>{view.kind === 'sealed' ? view.decree.flavor : view.decree.description}</p>
      <h4>{view.kind === 'sealed' ? 'Consequences' : 'Projected Impact'}</h4><HallEffects effects={view.decree.effects} />
      {view.kind === 'sealed' ? <HallButton onClick={returnToList}>Continue</HallButton> : <>
        {remaining === 0 && <p>The seasonal quota is spent.</p>}
        <div className="civic-actions">
          <HallButton disabled={!canSeal} aria-describedby={descriptionId} onClick={() => {
            if (!canSeal) return;
            onIssue(view.decree.id); setView({ kind: 'sealed', decree: view.decree });
          }}>Seal This Decree</HallButton>
          <HallButton onClick={returnToList}>Cancel</HallButton>
        </div>
      </>}
    </section>}
    {view.kind !== 'list' && <HallButton onClick={returnToList}><ArrowLeft aria-hidden="true" size={18} />Back to Decrees</HallButton>}
    <HallButton onClick={onReturn}><ArrowLeft aria-hidden="true" size={18} />Return to Throne</HallButton>
  </CivicSurface>;
}
