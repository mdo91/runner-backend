import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { getFirestore } from 'firebase-admin/firestore';
import { createApp } from './app.js';
import { FirestoreStore } from './firestore-store.js';
import { HistoryStore } from './history-store.js';
import { GeminiProvider } from './gemini.js';
const project=process.env.GOOGLE_CLOUD_PROJECT;
const key=process.env.GEMINI_API_KEY;
if(!project||!key)throw new Error('Required runtime configuration missing');
initializeApp({credential:applicationDefault(),projectId:project});
const model=process.env.GEMINI_MODEL??'gemini-3.5-flash-lite';
const positive = (name:string,fallback:number) => { const value=Number(process.env[name]??fallback); if(!Number.isFinite(value)||value<0)throw new Error('Invalid quota configuration'); return value; };
const app=createApp({model,history:new HistoryStore(getFirestore()),dashboardOrigin:process.env.DASHBOARD_ORIGIN,provider:new GeminiProvider(key,model),store:new FirestoreStore(getFirestore(),{run:positive('RUN_DAILY_LIMIT',3),live:positive('LIVE_DAILY_LIMIT',24),monthlyTRY:positive('AI_MONTHLY_BUDGET_TRY',300),reservationTRY:positive('AI_RESERVATION_TRY',2)}),identity:{
  async verify(token,appCheckToken) {
    const [identity,attestation]=await Promise.all([getAuth().verifyIdToken(token,true),getAppCheck().verifyToken(appCheckToken)]);
    if(identity.firebase.sign_in_provider!=='apple.com')throw new Error('Apple sign-in required');
    const allowed=process.env.FIREBASE_APP_ID;
    if(!allowed||attestation.appId!==allowed)throw new Error('Invalid app');
    return identity.uid;
  },
  async delete(uid){await getAuth().revokeRefreshTokens(uid);await getAuth().deleteUser(uid);}
}});
await app.listen({port:Number(process.env.PORT??8080),host:'0.0.0.0'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
