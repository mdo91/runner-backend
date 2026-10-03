import Fastify from 'fastify';
import { requestSchema, reportFor, explanationSchema } from './contracts.js';
import { APIError, inputHash, type AnalysisStore, type Kind } from './store.js';
import type { Provider } from './gemini.js';
export interface Identity {verify(idToken:string,appCheckToken:string):Promise<string>; delete(uid:string):Promise<void>}
export function createApp(deps:{identity:Identity;store:AnalysisStore;provider:Provider;model:string;now?:()=>number}) {
  const app=Fastify({bodyLimit:32*1024,logger:false,requestTimeout:60_000,connectionTimeout:10_000});
  const now=deps.now??Date.now;
  app.setErrorHandler((error,_,reply)=>{
    if(error instanceof APIError) {if(error.retryAfter)reply.header('Retry-After',error.retryAfter);return reply.code(error.status).send({error:error.code});}
    const status=(error as {statusCode?:number}).statusCode;
    return reply.code(status && status<500 ? status : 500).send({error:status===413?'input_too_large':'request_failed'});
  });
  async function authenticate(headers:Record<string,unknown>) {
    const auth=headers.authorization,check=headers['x-firebase-appcheck'];
    if(typeof auth!=='string'||!auth.startsWith('Bearer ')||typeof check!=='string'||auth.length>8192||check.length>8192)throw new APIError(401,'authentication_required');
    try{return await deps.identity.verify(auth.slice(7),check);}catch{throw new APIError(401,'invalid_credentials');}
  }
  // Cloud Run's public frontend reserves /healthz; keep it for container probes and expose /health.
  for(const path of ['/healthz','/health']) app.get(path,async()=>({status:'ok',schemaVersion:1}));
  for(const [path,kind] of [['/v1/runs/analyze','run'],['/v1/live/analyze','live']] as const) {
    app.post(path,async(request,reply)=>{
      const uid=await authenticate(request.headers);
      const parsed=requestSchema.safeParse(request.body);
      if(!parsed.success)throw new APIError(400,'invalid_input');
      if(kind==='live' && parsed.data.splits.length>10)throw new APIError(400,'invalid_input');
      const claim=await deps.store.claim(uid,inputHash(parsed.data,kind,deps.model),kind,now());
      if('cached' in claim)return reply.header('Cache-Control','no-store').send(claim.cached);
      try {
        const explanation=explanationSchema.parse(await deps.provider.explain(parsed.data,kind==='live'));
        const report=reportFor(parsed.data,explanation,new Date(now()),kind==='live');
        await deps.store.complete(claim.reservation,report,now());
        return reply.header('Cache-Control','no-store').send(report);
      } catch(error) {
        await deps.store.fail(claim.reservation);
        if(error instanceof APIError)throw error;
        throw new APIError(503,'analysis_unavailable',60);
      }
    });
  }
  app.delete('/v1/account',async(request,reply)=>{
    const uid=await authenticate(request.headers);
    await deps.store.deleteAccount(uid);
    await deps.identity.delete(uid);
    return reply.code(204).send();
  });
  return app;
}
