import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Firestore, Timestamp, FieldPath } from "firebase-admin/firestore";
import { APIError } from "./store.js";
import {
  historyConsentVersion,
  type HistoryBatch,
  type HistoryPreferences,
  type HistoryPage,
  type HistoryRun,
  type RunSummary,
} from "./history-contracts.js";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const defaults = (): HistoryPreferences => ({
  enabled: false,
  gpsEnabled: false,
  privacyRevision: 0,
  consentVersion: historyConsentVersion,
  updatedAt: null,
});
export interface HistoryRepository {
  preferences(uid: string): Promise<HistoryPreferences>;
  configure(
    uid: string,
    enabled: boolean,
    gpsEnabled: boolean,
    now: number,
  ): Promise<HistoryPreferences>;
  sync(
    uid: string,
    batch: HistoryBatch,
    now: number,
  ): Promise<{ accepted: string[]; deleted: string[] }>;
  page(
    uid: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<HistoryPage>;
  detail(uid: string, id: string): Promise<HistoryRun>;
  deleteAccount(uid: string): Promise<void>;
  clear(uid: string, now: number): Promise<void>;
  createLink(
    ip: string,
    agent: string,
    now: number,
  ): Promise<{ code: string; secret: string; expiresAt: string }>;
  linkInfo(
    code: string,
    now: number,
  ): Promise<{ agent: string; expiresAt: string }>;
  approve(uid: string, code: string, now: number): Promise<void>;
  poll(
    code: string,
    secret: string,
    now: number,
  ): Promise<{ status: "pending" | "approved"; token?: string }>;
  session(token: string, now: number): Promise<string>;
  logout(token: string): Promise<void>;
}
export class HistoryStore implements HistoryRepository {
  constructor(private db: Firestore) {}
  private user(uid: string) {
    return this.db.doc(`users/${uid}`);
  }
  private async active(uid: string) {
    const u = await this.user(uid).get();
    if (u.data()?.deleted) throw new APIError(401, "account_deleted");
    return u.data() ?? {};
  }
  async preferences(uid: string) {
    const u = await this.active(uid);
    return (u.historyPreferences ?? defaults()) as HistoryPreferences;
  }
  async configure(
    uid: string,
    enabled: boolean,
    gpsEnabled: boolean,
    now: number,
  ) {
    const user = this.user(uid);
    const result = await this.db.runTransaction(async (tx) => {
      const u = await tx.get(user);
      if (u.data()?.deleted) throw new APIError(401, "account_deleted");
      const old = (u.data()?.historyPreferences ??
        defaults()) as HistoryPreferences;
      if (u.data()?.historyPurging && gpsEnabled)
        throw new APIError(409, "privacy_change_pending");
      const changed = old.enabled !== enabled || old.gpsEnabled !== gpsEnabled;
      const prefs = {
        enabled,
        gpsEnabled,
        privacyRevision: old.privacyRevision + (changed ? 1 : 0),
        consentVersion: historyConsentVersion,
        updatedAt: new Date(now).toISOString(),
      };
      tx.set(
        user,
        {
          historyPreferences: prefs,
          historyPurging:
            !gpsEnabled && (old.gpsEnabled || !!u.data()?.historyPurging),
        },
        { merge: true },
      );
      return prefs;
    });
    // The revision change prevents in-flight uploads from restoring coordinates after withdrawal.
    if (!gpsEnabled) {
      const deadline = Date.now() + 20000;
      while (true) {
        const records = await user
          .collection("runs")
          .where("hasRoute", "==", true)
          .limit(100)
          .get();
        if (!records.docs.length) break;
        for (let offset = 0; offset < records.docs.length; offset += 10) {
          await Promise.all(
            records.docs.slice(offset, offset + 10).map((row) =>
              this.db.runTransaction(async (tx) => {
                const [u, s] = await tx.getAll(user, row.ref);
                if (
                  u?.data()?.deleted ||
                  u?.data()?.historyPreferences?.gpsEnabled ||
                  !s?.exists
                )
                  return;
                tx.set(
                  row.ref,
                  { hasRoute: false, inputHash: null },
                  { merge: true },
                );
                tx.set(
                  row.ref.collection("details").doc("data"),
                  { route: null },
                  { merge: true },
                );
              }),
            ),
          );
        }
        if (Date.now() > deadline)
          throw new APIError(409, "privacy_change_pending", 5);
      }
      await this.db.runTransaction(async (tx) => {
        const u = await tx.get(user);
        if (!u.data()?.deleted)
          tx.set(user, { historyPurging: false }, { merge: true });
      });
    }
    return result;
  }
  async sync(uid: string, batch: HistoryBatch, now: number) {
    const user = this.user(uid),
      quota = user
        .collection("historyQuotas")
        .doc(new Date(now).toISOString().slice(0, 10));
    return this.db.runTransaction(async (tx) => {
      const refs = batch.runs.map((r) => user.collection("runs").doc(r.id));
      const details = refs.map((r) => r.collection("details").doc("data"));
      const deletes = batch.deletedRunIDs.map((id) =>
        user.collection("runs").doc(id),
      );
      const measurements = batch.measurements.map((m) =>
        user.collection("measurements").doc(m.id),
      );
      const [u, q, ...snapshots] = await tx.getAll(
        user,
        quota,
        ...refs,
        ...details,
        ...deletes,
        ...measurements,
      );
      if (u?.data()?.deleted) throw new APIError(401, "account_deleted");
      const prefs = (u?.data()?.historyPreferences ??
        defaults()) as HistoryPreferences;
      if (!prefs.enabled) throw new APIError(403, "history_consent_required");
      if (prefs.privacyRevision !== batch.privacyRevision)
        throw new APIError(409, "privacy_changed");
      if (!prefs.gpsEnabled && batch.runs.some((r) => r.route?.length))
        throw new APIError(403, "gps_consent_required");
      const changes =
        batch.runs.length +
        batch.measurements.length +
        batch.deletedRunIDs.length +
        batch.deletedMeasurementIDs.length;
      if ((q?.data()?.writes ?? 0) + changes > 25000)
        throw new APIError(429, "history_daily_limit", 3600);
      const accepted: string[] = [],
        deleted: string[] = [];
      for (let i = 0; i < batch.runs.length; i++) {
        const incoming = batch.runs[i]!,
          old = snapshots[i]?.data(),
          oldDetail = snapshots[refs.length + i]?.data();
        if (old?.deleted) {
          deleted.push(incoming.id);
          continue;
        }
        const inputHash = digest(JSON.stringify(incoming));
        if (old?.inputHash === inputHash) {
          accepted.push(incoming.id);
          continue;
        }
        // A phone with delayed Health sync must not erase a more complete recording from another phone.
        const metrics = { ...incoming.metrics };
        for (const key of Object.keys(metrics) as (keyof typeof metrics)[])
          if (metrics[key] === null && old?.metrics?.[key] != null)
            (metrics as any)[key] = old.metrics[key];
        const oldCoverage = old?.metrics?.heartRateCoverage ?? 0;
        if (oldCoverage > metrics.heartRateCoverage) {
          metrics.heartRateCoverage = oldCoverage;
          metrics.averageHeartRate = old!.metrics.averageHeartRate;
          metrics.maxHeartRate = old!.metrics.maxHeartRate;
        }
        const sameMetrics =
          JSON.stringify(old?.metrics) === JSON.stringify(metrics);
        const record: HistoryRun = {
          ...incoming,
          metrics,
          splits: incoming.splits.length
            ? incoming.splits
            : (oldDetail?.splits ?? []),
          series: incoming.series.length
            ? incoming.series.map((point) => {
                const oldPoint = oldDetail?.series?.find(
                  (p: any) => p.t === point.t,
                );
                const merged = { ...point };
                if (oldPoint)
                  for (const key of [
                    "heartRate",
                    "paceSecondsPerKm",
                    "powerWatts",
                    "strideMeters",
                    "groundContactMilliseconds",
                    "verticalOscillationMeters",
                  ] as const)
                    if (merged[key] === null)
                      merged[key] = oldPoint[key] ?? null;
                return merged;
              })
            : (oldDetail?.series ?? []),
          route: prefs.gpsEnabled
            ? incoming.routeDeleted || oldDetail?.routeDeleted
              ? null
              : incoming.route?.length
                ? incoming.route
                : (oldDetail?.route ?? null)
            : null,
          routeDeleted: incoming.routeDeleted || !!oldDetail?.routeDeleted,
          report:
            JSON.stringify(incoming.metrics) === JSON.stringify(metrics)
              ? (incoming.report ??
                (sameMetrics ? (oldDetail?.report ?? null) : null))
              : sameMetrics
                ? (oldDetail?.report ?? null)
                : null,
        };
        const summary: RunSummary = {
          id: record.id,
          start: record.start,
          end: record.end,
          source: record.source,
          indoor: record.indoor,
          metrics,
          hasRoute: !!record.route?.length,
          hasReport: !!record.report,
          updatedAt: new Date(now).toISOString(),
        };
        tx.set(refs[i]!, { ...summary, deleted: false, inputHash });
        tx.set(details[i]!, {
          splits: record.splits,
          series: record.series,
          route: record.route,
          report: record.report,
          routeDeleted: record.routeDeleted,
        });
        accepted.push(record.id);
      }
      for (let i = 0; i < deletes.length; i++) {
        tx.set(deletes[i]!, {
          deleted: true,
          updatedAt: new Date(now).toISOString(),
        });
        tx.delete(deletes[i]!.collection("details").doc("data"));
        deleted.push(batch.deletedRunIDs[i]!);
      }
      for (let i = 0; i < measurements.length; i++)
        if (
          !snapshots[refs.length + details.length + deletes.length + i]?.data()
            ?.deleted
        )
          tx.set(measurements[i]!, {
            ...batch.measurements[i]!,
            deleted: false,
          });
      for (const id of batch.deletedMeasurementIDs)
        tx.set(user.collection("measurements").doc(id), { deleted: true });
      tx.set(quota, {
        writes: (q?.data()?.writes ?? 0) + changes,
        expiresAt: Timestamp.fromMillis(now + 2 * 86400000),
      });
      tx.set(
        user,
        { lastHistorySyncAt: new Date(now).toISOString() },
        { merge: true },
      );
      return { accepted, deleted };
    });
  }
  async page(uid: string, cursor: string | undefined, limit: number) {
    const preferences = await this.preferences(uid),
      user = this.user(uid);
    // Scan by UUID with a bounded cursor; the browser sorts by workout date. No composite index is needed.
    let query = user
      .collection("runs")
      .orderBy(FieldPath.documentId())
      .limit(limit);
    if (cursor) query = query.startAfter(cursor);
    const [records, measurements] = await Promise.all([
      query.get(),
      cursor
        ? Promise.resolve({ docs: [] })
        : user.collection("measurements").get(),
    ]);
    return {
      runs: records.docs
        .filter((d) => !d.data().deleted)
        .map((d) => {
          const { deleted, inputHash, ...data } = d.data();
          return {
            ...data,
            hasRoute: preferences.gpsEnabled && data.hasRoute,
          } as RunSummary;
        }),
      nextCursor:
        records.docs.length === limit ? records.docs.at(-1)!.id : null,
      measurements: measurements.docs
        .filter((d) => !d.data().deleted)
        .map((d) => {
          const { deleted, ...data } = d.data();
          return data as any;
        }),
      preferences,
    };
  }
  async detail(uid: string, id: string) {
    const u = await this.active(uid);
    const ref = this.user(uid).collection("runs").doc(id);
    const [s, d] = await Promise.all([
      ref.get(),
      ref.collection("details").doc("data").get(),
    ]);
    if (!s.exists || s.data()?.deleted || !d.exists)
      throw new APIError(404, "run_not_found");
    const { updatedAt, hasRoute, hasReport, deleted, inputHash, ...summary } =
      s.data()!;
    return {
      ...summary,
      ...d.data(),
      route: u.historyPreferences?.gpsEnabled
        ? (d.data()?.route ?? null)
        : null,
    } as HistoryRun;
  }
  async clear(uid: string, now: number) {
    await this.configure(uid, false, false, now);
    for (const name of ["runs", "measurements", "historyQuotas"])
      await this.db.recursiveDelete(this.user(uid).collection(name));
  }
  async deleteAccount(uid: string) {
    for (const name of ["runs", "measurements", "historyQuotas"])
      await this.db.recursiveDelete(this.user(uid).collection(name));
    for (const name of ["dashboardSessions", "dashboardLinks"]) {
      const items = await this.db
        .collection(name)
        .where("uid", "==", uid)
        .get();
      for (const item of items.docs) await item.ref.delete();
    }
  }
  async createLink(ip: string, agent: string, now: number) {
    const code = randomBytes(5).toString("hex").toUpperCase(),
      secret = randomBytes(32).toString("hex"),
      expiresAt = now + 600000;
    const rate = this.db.doc(
        `dashboardRates/${digest(ip + "-" + new Date(now).toISOString().slice(0, 13))}`,
      ),
      ref = this.db.doc(`dashboardLinks/${digest(code)}`);
    await this.db.runTransaction(async (tx) => {
      const r = await tx.get(rate);
      if ((r.data()?.count ?? 0) >= 20)
        throw new APIError(429, "link_limit", 3600);
      tx.set(rate, {
        count: (r.data()?.count ?? 0) + 1,
        expiresAt: Timestamp.fromMillis(now + 7200000),
      });
      tx.create(ref, {
        secretHash: digest(secret),
        agent: agent.slice(0, 180),
        expiresAt: Timestamp.fromMillis(expiresAt),
        status: "pending",
      });
    });
    return { code, secret, expiresAt: new Date(expiresAt).toISOString() };
  }
  async linkInfo(code: string, now: number) {
    const d = (
      await this.db.doc(`dashboardLinks/${digest(code)}`).get()
    ).data();
    if (!d || d.expiresAt.toMillis() <= now || d.status !== "pending")
      throw new APIError(404, "link_expired");
    return { agent: d.agent, expiresAt: d.expiresAt.toDate().toISOString() };
  }
  async approve(uid: string, code: string, now: number) {
    const user = this.user(uid),
      ref = this.db.doc(`dashboardLinks/${digest(code)}`),
      rate = user
        .collection("historyQuotas")
        .doc("dashboard-" + new Date(now).toISOString().slice(0, 13));
    await this.db.runTransaction(async (tx) => {
      const [u, d, r] = await tx.getAll(user, ref, rate);
      if (u?.data()?.deleted) throw new APIError(401, "account_deleted");
      if ((r?.data()?.count ?? 0) >= 20)
        throw new APIError(429, "link_limit", 3600);
      tx.set(rate, {
        count: (r?.data()?.count ?? 0) + 1,
        expiresAt: Timestamp.fromMillis(now + 7200000),
      });
      if (
        !d?.exists ||
        d.data()?.expiresAt.toMillis() <= now ||
        d.data()?.status !== "pending"
      )
        throw new APIError(404, "link_expired");
      tx.set(ref, { uid, status: "approved" }, { merge: true });
    });
  }
  async poll(code: string, secret: string, now: number) {
    const ref = this.db.doc(`dashboardLinks/${digest(code)}`),
      token = randomBytes(32).toString("hex");
    return this.db.runTransaction(async (tx) => {
      const d = await tx.get(ref),
        value = d.data();
      const supplied = Buffer.from(digest(secret));
      if (
        !value ||
        !timingSafeEqual(Buffer.from(value.secretHash), supplied) ||
        value.expiresAt.toMillis() <= now ||
        value.status === "used"
      )
        throw new APIError(404, "link_expired");
      if (value.status !== "approved") return { status: "pending" as const };
      const u = await tx.get(this.user(value.uid));
      if (u.data()?.deleted) throw new APIError(401, "account_deleted");
      tx.create(this.db.doc(`dashboardSessions/${digest(token)}`), {
        uid: value.uid,
        lastSeen: now,
        expiresAt: Timestamp.fromMillis(now + 12 * 3600000),
      });
      tx.set(ref, { status: "used" }, { merge: true });
      return { status: "approved" as const, token };
    });
  }
  async session(token: string, now: number) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new APIError(401, "dashboard_sign_in_required");
    const ref = this.db.doc(`dashboardSessions/${digest(token)}`);
    return this.db.runTransaction(async (tx) => {
      const d = await tx.get(ref),
        v = d.data();
      if (!v || v.expiresAt.toMillis() <= now || now - v.lastSeen > 1800000)
        throw new APIError(401, "dashboard_sign_in_required");
      const u = await tx.get(this.user(v.uid));
      if (u.data()?.deleted) throw new APIError(401, "account_deleted");
      if (now - v.lastSeen > 60000)
        tx.set(ref, { lastSeen: now }, { merge: true });
      return v.uid as string;
    });
  }
  async logout(token: string) {
    if (/^[a-f0-9]{64}$/.test(token))
      await this.db.doc(`dashboardSessions/${digest(token)}`).delete();
  }
}
