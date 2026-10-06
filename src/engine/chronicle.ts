import type {EconomySeason} from './foodRequirement.ts';

export type ChronicleKind='action'|'event'|'system';
/** Older records retain their wording and may omit date/kind metadata. */
export interface SavedChronicleEntry {
 readonly text:string;
 readonly season?:string|null;
 readonly year?:number|null;
 readonly turn?:number|null;
 readonly type?:string|null;
}
export interface ChronicleEntry extends SavedChronicleEntry {
 readonly season:EconomySeason;
 readonly year:number;
 readonly turn:number;
 readonly type:ChronicleKind;
}
export function isChronicleKind(value:unknown):value is ChronicleKind {
 return value==='action'||value==='event'||value==='system';
}
export function addChronicle(chronicle:readonly SavedChronicleEntry[],text:string,season:EconomySeason,year:number,turn:number,type:ChronicleKind='system'):SavedChronicleEntry[] {
 const entry:ChronicleEntry={text,season,year,turn,type};
 return [...chronicle,entry];
}
function hasSerializer(value:object):boolean {
 const descriptor=Object.getOwnPropertyDescriptor(value,'toJSON');
 return descriptor!==undefined&&(!('value' in descriptor)||typeof descriptor.value==='function');
}
/** Validate persisted data without filtering, repairing or invoking field getters/serializers. */
export function isSavedChronicle(value:unknown):value is SavedChronicleEntry[] {
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||hasSerializer(value))return false;
 for(let index=0;index<value.length;index++){
  const element=Object.getOwnPropertyDescriptor(value,String(index));
  if(!element||!element.enumerable||!('value' in element))return false;
  const entry:unknown=element.value;
  if(typeof entry!=='object'||entry===null||Array.isArray(entry))return false;
  const prototype=Object.getPrototypeOf(entry);
  if((prototype!==Object.prototype&&prototype!==null)||hasSerializer(entry))return false;
  for(const key of ['text','season','year','turn','type']){
   const field=Object.getOwnPropertyDescriptor(entry,key);
   if(key==='text'&&!field)return false;
   if(field&&(!field.enumerable||!('value' in field)))return false;
  }
  if(!('text' in entry)||typeof entry.text!=='string')return false;
  for(const key of ['season','type'] as const){
   const field=Object.getOwnPropertyDescriptor(entry,key);
   const data:unknown=field?.value;
   if(data!==undefined&&data!==null&&typeof data!=='string')return false;
  }
  for(const key of ['year','turn'] as const){
   const field=Object.getOwnPropertyDescriptor(entry,key);
   const data:unknown=field?.value;
   if(data!==undefined&&data!==null&&(typeof data!=='number'||!Number.isFinite(data)))return false;
  }
 }
 return true;
}
