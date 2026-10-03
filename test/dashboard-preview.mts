// Synthetic UI preview only; excluded from production startup.
import { createApp } from "../dist/src/app.js";
import { HistoryStore } from "../dist/src/history-store.js";
import { FirestoreStore } from "../dist/src/firestore-store.js";
import {
  historySyncSchema,
  historyConsentVersion,
} from "../dist/src/history-contracts.js";
import { Documents } from "./documents.js";
import { randomUUID } from "node:crypto";
const db = new Documents(),
  history = new HistoryStore(db as any),
  uid = "synthetic-preview",
  now = Date.now();
const prefs = await history.configure(uid, true, true, now);
for (let n = 0; n < 18; n++) {
  const start = now - n * 3 * 86400000 - 3600000,
    distance = 5000 + (n % 3) * 1800,
    pace = 303 + (n % 5) * 9,
    duration = (distance / 1000) * pace;
  const metrics = {
      distanceMeters: distance,
      elapsedSeconds: duration + 45,
      movingSeconds: duration,
      averagePaceSecondsPerKm: pace,
      averageHeartRate: 148 + (n % 4) * 2,
      maxHeartRate: 173,
      activeEnergyKcal: 440,
      elevationGainMeters: 38,
      pacingCoefficientOfVariation: 0.05,
      heartRateCoverage: 0.88,
    },
    id = randomUUID();
  const series = Array.from({ length: Math.floor(duration / 30) }, (_, i) => ({
    t: i * 30,
    heartRate:
      i >= 15 && i <= 17
        ? null
        : 143 + (i / Math.floor(duration / 30)) * 18 + Math.sin(i / 3) * 4,
    paceSecondsPerKm: pace + Math.sin(i / 5) * 18,
    powerWatts: 238 + Math.sin(i / 8) * 20,
    strideMeters: 1.03,
    groundContactMilliseconds: 252,
    verticalOscillationMeters: 0.08,
  }));
  const route = Array.from({ length: 180 }, (_, i) => ({
    t: (i * duration) / 180,
    latitude: 41.042 + 0.009 * Math.sin((i / 179) * Math.PI * 2),
    longitude: 29.011 + 0.007 * Math.cos((i / 179) * Math.PI * 2),
    altitude: 30,
    segment: i < 85 ? 0 : 1,
    paceSecondsPerKm: pace + Math.sin(i / 10) * 25,
    heartRate: 145 + (i / 180) * 15,
  }));
  const splits = Array.from(
    { length: Math.floor(distance / 1000) },
    (_, i) => ({
      index: i + 1,
      distanceMeters: 1000,
      movingSeconds: pace + i * 2,
      averageHeartRate: 146 + i * 2,
    }),
  );
  const report = {
    schemaVersion: 1,
    id,
    status: "complete",
    metrics,
    explanation: {
      summary:
        "A steady effort with a controlled finish. Your measured pace stayed consistent across most of the run.",
      insights: [
        {
          title: "Consistent pacing",
          detail:
            "Recorded kilometer splits varied by about 5%. The last kilometer stayed close to your average pace.",
          evidence: ["pacingCoefficientOfVariation", "averagePaceSecondsPerKm"],
        },
        {
          title: "Heart-rate coverage",
          detail:
            "Heart rate was recorded for 88% of your moving time. Missing intervals are left blank in the chart.",
          evidence: ["heartRateCoverage"],
        },
      ],
      nextRun: "Keep your next easy run comfortable and allow time to recover.",
    },
    endurance: {
      status: "insufficient_data",
      detail:
        "Use several comparable runs and dated VO₂ max readings to assess changes in endurance.",
    },
    missingData: [],
    generatedAt: new Date(start + duration * 1000 + 100000).toISOString(),
  };
  await history.sync(
    uid,
    historySyncSchema.parse({
      schemaVersion: 1,
      consentVersion: historyConsentVersion,
      privacyRevision: prefs.privacyRevision,
      runs: [
        {
          id,
          start: new Date(start).toISOString(),
          end: new Date(start + (duration + 45) * 1000).toISOString(),
          source: "Synthetic Apple Watch fixture",
          indoor: n === 4,
          metrics,
          splits,
          series,
          route: n === 4 ? null : route,
          report,
        },
      ],
      measurements: [
        {
          id: randomUUID(),
          kind: "vo2Max",
          value: 42.2 + n * 0.06,
          measuredAt: new Date(start).toISOString(),
        },
        {
          id: randomUUID(),
          kind: "recoveryBpm",
          value: 28 + (n % 5),
          measuredAt: new Date(start + duration * 1000).toISOString(),
        },
      ],
      deletedRunIDs: [],
      deletedMeasurementIDs: [],
    }),
    now,
  );
}
const app = createApp({
  history,
  store: new FirestoreStore(db as any, {
    run: 3,
    live: 24,
    monthlyTRY: 0,
    reservationTRY: 1,
  }),
  dashboardOrigin: "http://localhost:8088",
  model: "preview",
  identity: {
    verify: async (t: string, c: string) => {
      if (t !== uid || c !== "preview") throw Error();
      return uid;
    },
    delete: async () => {},
  },
  provider: {
    explain: async () => {
      throw Error("No provider in fixture preview");
    },
  },
});
await app.listen({ port: 8088, host: "127.0.0.1" });
console.log("Synthetic dashboard preview: http://localhost:8088/dashboard");
