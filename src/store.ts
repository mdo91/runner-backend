import { createHash } from 'node:crypto';
import type { AnalysisInput, AnalysisReport } from './contracts.js';
export type Kind = 'run'|'live';
export class APIError extends Error { constructor(public status:number, public code:string, public retryAfter?:number) {super(code);} }
export type Reservation = {uid:string; key:string; owner:string; kind:Kind; now:number};
export type Claim = {cached:AnalysisReport} | {reservation:Reservation};
export interface AnalysisStore {
  claim(uid:string,key:string,kind:Kind,now:number):Promise<Claim>;
  complete(reservation:Reservation,report:AnalysisReport,now:number):Promise<void>;
  fail(reservation:Reservation):Promise<void>;
  deleteAccount(uid:string):Promise<void>;
}
function canonical(value:unknown):string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function inputHash(input:AnalysisInput,kind:Kind,model:string):string {
  return createHash('sha256').update(canonical({input,kind,model})).digest('hex');
}
