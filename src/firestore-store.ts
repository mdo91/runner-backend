import { randomUUID } from 'node:crypto';
import { Firestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { APIError, type AnalysisStore, type Claim, type Kind, type Reservation } from './store.js';
import type { AnalysisReport } from './contracts.js';
export class FirestoreStore implements AnalysisStore {
  constructor(private db:Firestore, private limits={run:3,live:24,monthlyTRY:300,reservationTRY:1}) {}
  async claim(uid:string,key:string,kind:Kind,now:number):Promise<Claim> {
    const user = this.db.doc(`users/${uid}`), item = user.collection('analyses').doc(key);
    const date = new Date(now).toISOString(), day = user.collection('quotas').doc(date.slice(0,10));
    const budget = this.db.doc(`spending/${date.slice(0,7)}`), owner = randomUUID();
    return this.db.runTransaction(async tx => {
      const [u,c,q,b] = await tx.getAll(user,item,day,budget);
      if(u?.data()?.deleted) throw new APIError(401,'account_deleted');
      const cache = c?.data();
      if(cache?.status==='complete' && cache.expiresAt.toMillis()>now) return {cached:cache.report as AnalysisReport};
      if(cache?.status==='pending' && cache.leaseUntil>now) throw new APIError(409,'analysis_pending',5);
      const used = q?.data()?.[kind] ?? 0;
      if(used>=this.limits[kind]) throw new APIError(429,'daily_limit',Math.ceil((Date.parse(date.slice(0,10)+'T00:00:00Z')+86400000-now)/1000));
      // A server-enforced five-minute gap also protects against modified mobile clients.
      if(kind==='live' && now-(u?.data()?.lastLiveAt ?? 0)<300_000) throw new APIError(429,'live_interval',300);
      if((b?.data()?.reservedTRY ?? 0)+this.limits.reservationTRY>this.limits.monthlyTRY) throw new APIError(503,'spending_guard',3600);
      tx.set(user,{deleted:false,...(kind==='live'?{lastLiveAt:now}:{})},{merge:true});
      tx.set(day,{[kind]:used+1,expiresAt:Timestamp.fromMillis(now+2*86400000)},{merge:true});
      tx.set(budget,{reservedTRY:FieldValue.increment(this.limits.reservationTRY)},{merge:true});
      tx.set(item,{status:'pending',owner,leaseUntil:now+120_000,expiresAt:Timestamp.fromMillis(now+86400000)});
      return {reservation:{uid,key,owner,kind,now}};
    });
  }
  async complete(r:Reservation,report:AnalysisReport,now:number) {
    const user = this.db.doc(`users/${r.uid}`), item = user.collection('analyses').doc(r.key);
    await this.db.runTransaction(async tx=>{
      const [u,c] = await tx.getAll(user,item);
      if(u?.data()?.deleted || c?.data()?.owner!==r.owner) throw new APIError(401,'account_deleted');
      tx.set(item,{status:'complete',report,expiresAt:Timestamp.fromMillis(now+(r.kind==='live'?60_000:86400000))});
    });
  }
  async fail(r:Reservation) {
    const item = this.db.doc(`users/${r.uid}/analyses/${r.key}`);
    await this.db.runTransaction(async tx=>{const c=await tx.get(item);if(c.data()?.owner===r.owner)tx.delete(item);});
    // Keep the reserved quota and spend: failed provider requests can still be billed.
  }
  async deleteAccount(uid:string) {
    const user = this.db.doc(`users/${uid}`);
    // Tombstone prevents an in-flight request from recreating analysis data.
    await user.set({deleted:true});
    for(const collection of ['analyses','quotas']) await this.db.recursiveDelete(user.collection(collection));
  }
}
