interface VisitContext {readonly phase:string;readonly turn:number;readonly year:number;readonly season:string;readonly blacksmith?:unknown}
function record(value:unknown):value is Record<string,unknown> {return typeof value==='object' && value!==null && !Array.isArray(value);}
/** A saved lastVisitTurn is the receipt; remounts and Load must not award repeated respect. */
export function planForgeVisit(state:VisitContext) {
 if(state.phase!=='management' || !Number.isSafeInteger(state.turn) || state.turn<1 || state.turn>40 ||
    state.year!==Math.ceil(state.turn/4) || state.season!==['spring','summer','autumn','winter'][(state.turn-1)%4]) return null;
 const bs=state.blacksmith ?? {};if(!record(bs)) return null;
 const respect=bs.godricRespect ?? 50,last=bs.lastVisitTurn ?? 0;
 if(typeof respect!=='number' || !Number.isFinite(respect) || respect<0 || respect>100 ||
    typeof last!=='number' || !Number.isSafeInteger(last) || last<0 || last>state.turn || last===state.turn) return null;
 const delta=last>0 && state.turn-last>=3?-3:1;
 return {...bs,lastVisitTurn:state.turn,godricRespect:Math.max(0,Math.min(100,respect+delta))};
}
