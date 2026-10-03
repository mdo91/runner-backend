// Explicit, synthetic-only smoke test. The API key is supplied through the environment.
import { GeminiProvider } from '../src/gemini.js';
import { requestSchema } from '../src/contracts.js';
const provider=new GeminiProvider(process.env.GEMINI_API_KEY!,process.env.GEMINI_MODEL??'gemini-3.5-flash-lite');
const input=requestSchema.parse({schemaVersion:1,id:'27f937c4-bc4c-4e10-9a52-467039d8a428',consentVersion:'2026-10-03',metrics:{distanceMeters:5000,elapsedSeconds:1600,movingSeconds:1500,averagePaceSecondsPerKm:300,averageHeartRate:145,maxHeartRate:160,activeEnergyKcal:400,elevationGainMeters:null,pacingCoefficientOfVariation:null,heartRateCoverage:0.8},baseline:{comparableRunCount:0,averagePaceSecondsPerKm:null,averageHeartRate:null,paceChangePercent:null,vo2Max:null,previousVo2Max:null,recoveryBpm:null},quality:{hasRoute:false,hasPauses:true,distanceSamplesAvailable:false,heartRateSamplesAvailable:true,isIndoor:false},splits:[]});
try {const response=await provider.explain(input,false);console.log(JSON.stringify({valid:true,insights:response.insights.length}));}
catch(error) {console.error(error instanceof Error ? error.message:'Provider failed');process.exitCode=1;}
