import { z } from 'zod';

const finite = (max: number) => z.number().finite().nonnegative().max(max);
const optional = (max: number) => finite(max).nullable();
export const metricsSchema = z.object({
  distanceMeters: optional(500_000), elapsedSeconds: finite(604_800), movingSeconds: finite(604_800),
  averagePaceSecondsPerKm: optional(7200), averageHeartRate: optional(250), maxHeartRate: optional(250),
  activeEnergyKcal: optional(30_000), elevationGainMeters: optional(30_000),
  pacingCoefficientOfVariation: optional(5), heartRateCoverage: z.number().min(0).max(1),
}).strict().refine(m => m.movingSeconds <= m.elapsedSeconds + 1, 'Moving time exceeds elapsed time');
export const baselineSchema = z.object({
  comparableRunCount: z.number().int().min(0).max(1000), averagePaceSecondsPerKm: optional(7200),
  averageHeartRate: optional(250), paceChangePercent: z.number().min(-100).max(100).nullable(),
  vo2Max: z.object({value: finite(100), measuredAt: z.iso.datetime()}).strict().nullable(),
  previousVo2Max: z.object({value: finite(100), measuredAt: z.iso.datetime()}).strict().nullable(),
  recoveryBpm: z.object({value: finite(150), measuredAt: z.iso.datetime()}).strict().nullable(),
}).strict();
const qualitySchema = z.object({
  hasRoute: z.boolean(), hasPauses: z.boolean(), distanceSamplesAvailable: z.boolean(),
  heartRateSamplesAvailable: z.boolean(), isIndoor: z.boolean(),
}).strict();
export const requestSchema = z.object({
  schemaVersion: z.literal(1), id: z.uuid(), consentVersion: z.literal('2026-10-03'),
  language: z.enum(['en', 'de']).default('en'),
  metrics: metricsSchema, baseline: baselineSchema, quality: qualitySchema,
  splits: z.array(z.object({index: z.number().int().min(1).max(500), distanceMeters: finite(1609.35),
    movingSeconds: finite(7200), averageHeartRate: optional(250)}).strict()).max(500),
}).strict();
export type AnalysisInput = z.infer<typeof requestSchema>;
export const evidenceKeys = ['distanceMeters','movingSeconds','averagePaceSecondsPerKm','averageHeartRate',
  'maxHeartRate','pacingCoefficientOfVariation','heartRateCoverage','comparableRunCount','paceChangePercent',
  'vo2Max','previousVo2Max','recoveryBpm'] as const;
export const explanationSchema = z.object({
  summary: z.string().min(1).max(350),
  insights: z.array(z.object({title: z.string().min(1).max(70), detail: z.string().min(1).max(300),
    evidence: z.array(z.enum(evidenceKeys)).min(1).max(4)}).strict()).max(4),
  nextRun: z.string().min(1).max(220),
}).strict();
export type Explanation = z.infer<typeof explanationSchema>;
export type AnalysisReport = {
  language?: 'en' | 'de';
  schemaVersion: 1; id: string; status: 'complete'; metrics: AnalysisInput['metrics'];
  explanation: Explanation; endurance: {status: 'insufficient_data' | 'available'; detail: string};
  missingData: string[]; generatedAt: string; expiresAt?: string;
};
export function reportFor(input: AnalysisInput, explanation: Explanation, now: Date, live: boolean): AnalysisReport {
  const text = (en: string, de: string) => input.language === 'de' ? de : en;
  const available = new Set<string>();
  for (const [key, value] of [...Object.entries(input.metrics),...Object.entries(input.baseline)]) if(value !== null) available.add(key);
  // A model cannot cite a measurement that was not supplied.
  if(explanation.insights.some(i => i.evidence.some(e => !available.has(e)))) throw new Error('invalid_evidence');
  const enough = input.baseline.comparableRunCount >= 5 && input.baseline.averageHeartRate !== null;
  return {schemaVersion:1,language:input.language ?? 'en',id:input.id,status:'complete',metrics:input.metrics,explanation,
    endurance:{status:enough ? 'available':'insufficient_data',detail:enough
      ? text('Comparison uses runs of similar distance and setting. Conditions and effort can affect pace and heart rate.', 'Der Vergleich nutzt Läufe mit ähnlicher Distanz und Umgebung. Bedingungen und Belastung können Tempo und Herzfrequenz beeinflussen.')
      : text('At least five comparable runs with heart-rate data are needed to assess a trend.', 'Für die Beurteilung eines Trends werden mindestens fünf vergleichbare Läufe mit Herzfrequenzdaten benötigt.')},
    missingData:[...(!input.quality.hasRoute ? [text('GPS route unavailable; numerical analysis remains available.', 'Keine GPS-Route verfügbar; die numerische Analyse bleibt verfügbar.')]:[]),
      ...(input.metrics.averageHeartRate === null ? [text('Heart-rate data is unavailable.', 'Herzfrequenzdaten sind nicht verfügbar.')]:[]),
      ...(input.metrics.heartRateCoverage < 0.5 ? [text('Heart-rate coverage is sparse; interpret averages cautiously.', 'Wenige Herzfrequenzdaten; interpretiere Durchschnittswerte vorsichtig.')]:[]),
      ...(!input.baseline.vo2Max ? [text('No recorded VO₂ max measurement.', 'Keine aufgezeichnete VO₂max-Messung.')]:[]),
      ...(!input.baseline.recoveryBpm ? [text('No recorded heart-rate recovery measurement.', 'Keine aufgezeichnete Messung der Herzfrequenzerholung.')]:[])],
    generatedAt:now.toISOString(),...(live ? {expiresAt:new Date(now.getTime()+60_000).toISOString()}: {})};
}
