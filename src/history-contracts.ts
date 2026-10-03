import { z } from "zod";
import { explanationSchema, metricsSchema } from "./contracts.js";
export const historyConsentVersion = "2026-10-03-history-v1";
const nullable = (max: number) =>
  z.number().finite().nonnegative().max(max).nullable();
const seriesPoint = z
  .object({
    t: z.number().min(0).max(604800),
    heartRate: nullable(250),
    paceSecondsPerKm: nullable(7200),
    powerWatts: nullable(3000),
    strideMeters: nullable(5),
    groundContactMilliseconds: nullable(2000),
    verticalOscillationMeters: nullable(1),
  })
  .strict();
const routePoint = z
  .object({
    t: z.number().min(0).max(604800),
    latitude: z.number().min(-85).max(85),
    longitude: z.number().min(-180).max(180),
    altitude: z.number().min(-1000).max(10000),
    segment: z.number().int().min(0).max(3000),
    paceSecondsPerKm: nullable(7200),
    heartRate: nullable(250),
  })
  .strict();
const reportSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.uuid().transform((x) => x.toLowerCase()),
    status: z.literal("complete"),
    metrics: metricsSchema,
    explanation: explanationSchema,
    endurance: z
      .object({
        status: z.enum(["available", "insufficient_data"]),
        detail: z.string().max(500),
      })
      .strict(),
    missingData: z.array(z.string().max(500)).max(20),
    generatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();
export const historyRunSchema = z
  .object({
    id: z.uuid().transform((x) => x.toLowerCase()),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    source: z.string().max(100),
    indoor: z.boolean(),
    metrics: metricsSchema,
    splits: z
      .array(
        z
          .object({
            index: z.number().int().min(1).max(500),
            distanceMeters: z.number().min(0).max(1609.35),
            movingSeconds: z.number().min(0).max(604800),
            averageHeartRate: nullable(250),
          })
          .strict(),
      )
      .max(500),
    series: z.array(seriesPoint).max(1500),
    route: z.array(routePoint).max(3000).nullable(),
    routeDeleted: z.boolean().default(false),
    report: reportSchema.nullable(),
  })
  .strict()
  .superRefine((run, ctx) => {
    if (
      Buffer.byteLength(
        JSON.stringify({
          splits: run.splits,
          series: run.series,
          route: run.route,
          report: run.report,
        }),
      ) > 850000
    )
      ctx.addIssue({ code: "custom", message: "Workout details too large" });
    const elapsed = (Date.parse(run.end) - Date.parse(run.start)) / 1000;
    if (
      elapsed < 0 ||
      elapsed > 604800 ||
      Math.abs(elapsed - run.metrics.elapsedSeconds) > 1
    )
      ctx.addIssue({ code: "custom", message: "Invalid workout interval" });
    for (const point of [...run.series, ...(run.route ?? [])])
      if (point.t > elapsed + 1)
        ctx.addIssue({ code: "custom", message: "Sample outside workout" });
    if (
      run.report &&
      (run.report.id !== run.id ||
        JSON.stringify(run.report.metrics) !== JSON.stringify(run.metrics))
    )
      ctx.addIssue({
        code: "custom",
        message: "Report measurements do not match workout",
      });
  });
export type HistoryRun = z.infer<typeof historyRunSchema>;
export const measurementSchema = z
  .object({
    id: z.uuid().transform((x) => x.toLowerCase()),
    kind: z.enum(["vo2Max", "recoveryBpm"]),
    value: z.number().finite().min(-100).max(150),
    measuredAt: z.iso.datetime(),
  })
  .strict()
  .refine((m) => m.kind === "recoveryBpm" || m.value > 0);
export type HistoryMeasurement = z.infer<typeof measurementSchema>;
export const historySyncSchema = z
  .object({
    schemaVersion: z.literal(1),
    consentVersion: z.literal(historyConsentVersion),
    privacyRevision: z.number().int().nonnegative(),
    runs: z.array(historyRunSchema).max(5),
    measurements: z.array(measurementSchema).max(100),
    deletedRunIDs: z.array(z.uuid().transform((x) => x.toLowerCase())).max(100),
    deletedMeasurementIDs: z
      .array(z.uuid().transform((x) => x.toLowerCase()))
      .max(100),
  })
  .strict()
  .superRefine((batch, ctx) => {
    if (
      new Set(batch.runs.map((r) => r.id)).size !== batch.runs.length ||
      new Set(batch.measurements.map((r) => r.id)).size !==
        batch.measurements.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate identifiers" });
    if (
      batch.runs.some((r) => batch.deletedRunIDs.includes(r.id)) ||
      batch.measurements.some((r) => batch.deletedMeasurementIDs.includes(r.id))
    )
      ctx.addIssue({ code: "custom", message: "Conflicting changes" });
  });
export type HistoryBatch = z.infer<typeof historySyncSchema>;
export const preferencesSchema = z
  .object({
    consentVersion: z.literal(historyConsentVersion),
    enabled: z.boolean(),
    gpsEnabled: z.boolean(),
  })
  .strict()
  .refine((p) => p.enabled || !p.gpsEnabled);
export type HistoryPreferences = {
  enabled: boolean;
  gpsEnabled: boolean;
  privacyRevision: number;
  consentVersion: string;
  updatedAt: string | null;
};
export type RunSummary = Pick<
  HistoryRun,
  "id" | "start" | "end" | "source" | "indoor" | "metrics"
> & { hasRoute: boolean; hasReport: boolean; updatedAt: string };
export type HistoryPage = {
  runs: RunSummary[];
  nextCursor: string | null;
  measurements: HistoryMeasurement[];
  preferences: HistoryPreferences;
};
export const codeSchema = z.string().regex(/^[A-F0-9]{10}$/);
export const linkPollSchema = z
  .object({ code: codeSchema, secret: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
