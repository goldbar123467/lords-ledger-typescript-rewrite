import {useEffect,useRef} from 'react';
import {Hammer,Sparkles,Info} from 'lucide-react';
import {isChronicleKind,type SavedChronicleEntry} from '../engine/chronicle.ts';
import type {EconomySeason} from '../engine/foodRequirement.ts';

const SEASON_ICONS = {spring:'\u2741',summer:'\u2600',autumn:'\u2767',winter:'\u2744'} satisfies Record<EconomySeason,string>;
const TYPE_ICONS = {action:Hammer,event:Sparkles,system:Info};

export default function Chronicle({entries}:{entries:readonly SavedChronicleEntry[]}) {
  const logRef=useRef<HTMLDivElement>(null);
  // New entries return the local ledger to its newest row without moving the page.
  useEffect(()=>{if(logRef.current)logRef.current.scrollTop=0;},[entries.length]);
  const reversed=[...entries].reverse();

  return <section className="chronicle-ui">
    <h2>Chronicle of Your Reign</h2>
    <div ref={logRef} className="chronicle-log" role="region" aria-label="Chronicle entries" tabIndex={0}>
      <ol>
        {reversed.map((entry,index)=>{
          const season=entry.season??'';
          const icon=Object.entries(SEASON_ICONS).find(([key])=>key===entry.season)?.[1]??'';
          const kind=isChronicleKind(entry.type)?entry.type:'system';
          const TypeIcon=TYPE_ICONS[kind];
          return <li key={entries.length-1-index} className={`chronicle-entry chronicle-entry--${kind}`}>
            <TypeIcon size={14} aria-hidden="true" />
            <span className="chronicle-date">{icon} {entry.year==null?'Unknown year':`Y${entry.year}`} {season?season.charAt(0).toUpperCase()+season.slice(1):'Unknown season'}</span>
            <span>{entry.text}</span>
          </li>;
        })}
      </ol>
      {entries.length<3&&<p className="chronicle-hint">New entries appear after each simulated season. Click {'\u2694'} Simulate Season to continue your reign.</p>}
    </div>
  </section>;
}
