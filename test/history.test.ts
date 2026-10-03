import { test } from "node:test";
import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";
import { HistoryStore } from "../src/history-store.js";
import {
  historySyncSchema,
  historyConsentVersion,
} from "../src/history-contracts.js";
import { FirestoreStore } from "../src/firestore-store.js";
import { createApp } from "../src/app.js";
import { Documents } from "./documents.js";
const origin = "https://runner.test";
const run = {
  id: "27f937c4-bc4c-4e10-9a52-467039d8a428",
  start: "2026-10-03T10:00:00Z",
  end: "2026-10-03T10:30:00Z",
  source: "Apple Watch",
  indoor: false,
  metrics: {
    distanceMeters: 5000,
    elapsedSeconds: 1800,
    movingSeconds: 1500,
    averagePaceSecondsPerKm: 300,
    averageHeartRate: 145,
    maxHeartRate: 160,
    activeEnergyKcal: 400,
    elevationGainMeters: null,
    pacingCoefficientOfVariation: null,
    heartRateCoverage: 0.8,
  },
  splits: [],
  series: [],
  route: [
    {
      t: 0,
      latitude: 41,
      longitude: 29,
      altitude: 12,
      segment: 0,
      paceSecondsPerKm: null,
      heartRate: null,
    },
    {
      t: 10,
      latitude: 41.0001,
      longitude: 29.0001,
      altitude: 12,
      segment: 0,
      paceSecondsPerKm: 300,
      heartRate: 145,
    },
  ],
  report: null,
};
function batch(
  revision: number,
  runs: unknown[] = [run],
  deletedRunIDs: string[] = [],
) {
  return historySyncSchema.parse({
    schemaVersion: 1,
    consentVersion: historyConsentVersion,
    privacyRevision: revision,
    runs,
    measurements: [],
    deletedRunIDs,
    deletedMeasurementIDs: [],
  });
}
function setup() {
  const db = new Documents();
  const history = new HistoryStore(db as unknown as Firestore);
  let now = Date.parse("2026-10-03T12:00:00Z");
  const store = new FirestoreStore(db as unknown as Firestore, {
    run: 3,
    live: 24,
    monthlyTRY: 300,
    reservationTRY: 1,
  });
  const app = createApp({
    store,
    history,
    model: "test",
    dashboardOrigin: origin,
    now: () => now,
    identity: {
      verify: async (t, c) => {
        if (!["alice", "bob"].includes(t) || c !== "valid") throw Error();
        return t;
      },
      delete: async () => {},
    },
    provider: {
      explain: async () => {
        throw Error("unused");
      },
    },
  });
  const mobile = (
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    payload?: any,
    user = "alice",
  ) =>
    app.inject({
      method,
      url,
      payload,
      headers: {
        authorization: "Bearer " + user,
        "x-firebase-appcheck": "valid",
      },
    });
  return {
    db,
    history,
    app,
    mobile,
    now: () => now,
    advance: (ms: number) => (now += ms),
  };
}
async function login(s: ReturnType<typeof setup>, user = "alice") {
  const link = await s.app.inject({
    method: "POST",
    url: "/v1/dashboard/link",
    headers: { origin },
    payload: {},
  });
  assert.equal(link.statusCode, 200);
  const pair = link.json();
  assert.equal(
    (await s.mobile("POST", "/v1/dashboard/approve", { code: pair.code }, user))
      .statusCode,
    204,
  );
  const poll = await s.app.inject({
    method: "POST",
    url: "/v1/dashboard/link/poll",
    headers: { origin },
    payload: pairPayload(pair),
  });
  assert.equal(poll.statusCode, 200);
  const cookie = String(poll.headers["set-cookie"]);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.ok(!poll.body.includes("token"));
  return { cookie: cookie.split(";")[0]!, pair };
}
const pairPayload = (p: any) => ({ code: p.code, secret: p.secret });
test("history and GPS both require explicit consent and identity / attestation", async () => {
  const s = setup();
  assert.equal(
    (
      await s.app.inject({
        method: "POST",
        url: "/v1/history/sync",
        payload: batch(0),
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (await s.mobile("POST", "/v1/history/sync", batch(0))).statusCode,
    403,
  );
  const p = await s.history.configure("alice", true, false, s.now());
  assert.equal(
    (await s.mobile("POST", "/v1/history/sync", batch(p.privacyRevision)))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await s.mobile(
        "POST",
        "/v1/history/sync",
        batch(p.privacyRevision, [{ ...run, route: null }]),
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await s.mobile("PUT", "/v1/history/preferences", {
        consentVersion: historyConsentVersion,
        enabled: false,
        gpsEnabled: true,
      })
    ).statusCode,
    400,
  );
  await s.app.close();
});
test("database history persists, paginates, deduplicates IDs and isolates users", async () => {
  const s = setup(),
    p = await s.history.configure("alice", true, true, s.now());
  await Promise.all([
    s.history.sync("alice", batch(p.privacyRevision), s.now()),
    s.history.sync("alice", batch(p.privacyRevision), s.now()),
  ]);
  assert.equal((await s.history.page("alice", undefined, 100)).runs.length, 1);
  assert.equal((await s.history.page("bob", undefined, 100)).runs.length, 0);
  await assert.rejects(s.history.detail("bob", run.id), /run_not_found/);
  assert.equal((await s.history.detail("alice", run.id)).route?.length, 2);
  const first = await s.history.page("alice", undefined, 1);
  assert.equal(first.nextCursor, run.id);
  assert.equal(
    (await s.history.page("alice", first.nextCursor!, 1)).runs.length,
    0,
  );
  s.advance(2 * 86400000);
  assert.equal((await s.history.page("alice", undefined, 100)).runs.length, 1);
  await s.app.close();
});
test("GPS withdrawal purges stored coordinates and rejects in-flight stale uploads", async () => {
  const s = setup(),
    p = await s.history.configure("alice", true, true, s.now());
  await s.history.sync("alice", batch(p.privacyRevision), s.now());
  const next = await s.history.configure("alice", true, false, s.now());
  assert.equal(next.privacyRevision, p.privacyRevision + 1);
  assert.equal((await s.history.detail("alice", run.id)).route, null);
  assert.equal(
    s.db.data.get("users/alice/runs/" + run.id + "/details/data").route,
    null,
  );
  await assert.rejects(
    s.history.sync("alice", batch(p.privacyRevision), s.now()),
    /privacy_changed/,
  );
  await assert.rejects(
    s.history.sync("alice", batch(next.privacyRevision), s.now()),
    /gps_consent_required/,
  );
  await s.app.close();
});
test("deleted workouts are tombstoned across phones; delayed data does not erase routes", async () => {
  const s = setup(),
    p = await s.history.configure("alice", true, true, s.now());
  await s.history.sync("alice", batch(p.privacyRevision), s.now());
  await s.history.sync(
    "alice",
    batch(p.privacyRevision, [
      {
        ...run,
        route: [],
        metrics: {
          ...run.metrics,
          averageHeartRate: null,
          maxHeartRate: null,
          heartRateCoverage: 0,
        },
      },
    ]),
    s.now(),
  );
  assert.equal((await s.history.detail("alice", run.id)).route?.length, 2);
  assert.equal(
    (await s.history.detail("alice", run.id)).metrics.averageHeartRate,
    145,
  );
  await s.history.sync(
    "alice",
    batch(p.privacyRevision, [], [run.id]),
    s.now(),
  );
  assert.deepEqual(
    (await s.history.sync("alice", batch(p.privacyRevision), s.now())).deleted,
    [run.id],
  );
  assert.equal((await s.history.page("alice", undefined, 100)).runs.length, 0);
  await assert.rejects(s.history.detail("alice", run.id), /run_not_found/);
  await s.app.close();
});
test("codes require origin, phone approval and one-use browser secret; sessions expire", async () => {
  const s = setup();
  assert.equal(
    (
      await s.app.inject({
        method: "POST",
        url: "/v1/dashboard/link",
        headers: { origin: "https://evil.test" },
        payload: {},
      })
    ).statusCode,
    403,
  );
  assert.equal((await s.app.inject("/v1/dashboard/history")).statusCode, 401);
  const { cookie, pair } = await login(s);
  assert.equal(
    (await s.app.inject({ url: "/v1/dashboard/history", headers: { cookie } }))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await s.app.inject({
        method: "POST",
        url: "/v1/dashboard/link/poll",
        headers: { origin },
        payload: pairPayload(pair),
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await s.app.inject({
        method: "POST",
        url: "/v1/dashboard/logout",
        headers: { origin: "https://evil.test", cookie },
        payload: {},
      })
    ).statusCode,
    403,
  );
  s.advance(1800001);
  assert.equal(
    (await s.app.inject({ url: "/v1/dashboard/history", headers: { cookie } }))
      .statusCode,
    401,
  );
  const p = await s.history.createLink("127.0.0.1", "Browser", s.now());
  await assert.rejects(
    s.history.poll(p.code, "f".repeat(64), s.now()),
    /link_expired/,
  );
  s.advance(600001);
  await assert.rejects(
    s.history.approve("alice", p.code, s.now()),
    /link_expired/,
  );
  await s.app.close();
});
test("dashboard browser session cannot read another user; logout revokes access", async () => {
  const s = setup(),
    p = await s.history.configure("alice", true, true, s.now());
  await s.history.sync("alice", batch(p.privacyRevision), s.now());
  const bob = await login(s, "bob");
  assert.equal(
    (
      await s.app.inject({
        url: "/v1/dashboard/runs/" + run.id,
        headers: { cookie: bob.cookie },
      })
    ).statusCode,
    404,
  );
  const alice = await login(s);
  assert.equal(
    (
      await s.app.inject({
        url: "/v1/dashboard/runs/" + run.id,
        headers: { cookie: alice.cookie },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await s.app.inject({
        method: "POST",
        url: "/v1/dashboard/logout",
        headers: { cookie: alice.cookie, origin },
        payload: {},
      })
    ).statusCode,
    204,
  );
  assert.equal(
    (
      await s.app.inject({
        url: "/v1/dashboard/history",
        headers: { cookie: alice.cookie },
      })
    ).statusCode,
    401,
  );
  await s.app.close();
});
test("account deletion removes all database history and sessions, blocks stale sync", async () => {
  const s = setup(),
    p = await s.history.configure("alice", true, true, s.now());
  await s.history.sync("alice", batch(p.privacyRevision), s.now());
  const { cookie } = await login(s);
  assert.equal((await s.mobile("DELETE", "/v1/account")).statusCode, 204);
  assert.ok([...s.db.data.keys()].every((k) => !k.startsWith("users/alice/")));
  assert.equal(
    (await s.app.inject({ url: "/v1/dashboard/history", headers: { cookie } }))
      .statusCode,
    401,
  );
  await assert.rejects(
    s.history.sync("alice", batch(p.privacyRevision), s.now()),
    /account_deleted/,
  );
  await s.app.close();
});
test("history contract rejects mismatched reports, duplicate IDs, oversized details and missing values", () => {
  assert.throws(() => batch(1, [run, run]));
  assert.throws(() => batch(1, [{ ...run, end: "2026-10-03T10:01:00Z" }]));
  assert.throws(() => batch(1, [{ ...run, latitude: 41 }]));
  assert.throws(() =>
    batch(1, [{ ...run, series: [{ t: 1900, heartRate: 145 }] }]),
  );
});
test("clear cloud history disables sync and prevents stale restoration", async () => {
  const s = setup(),
    p = await s.history.configure("alice", true, true, s.now());
  await s.history.sync("alice", batch(p.privacyRevision), s.now());
  await s.history.clear("alice", s.now());
  assert.equal((await s.history.page("alice", undefined, 100)).runs.length, 0);
  assert.equal((await s.history.preferences("alice")).enabled, false);
  await assert.rejects(
    s.history.sync("alice", batch(p.privacyRevision), s.now()),
    /history_consent_required/,
  );
  await s.app.close();
});

test("route deletion cannot be restored by a phone with an old Health copy", async () => {
  const s = setup(),
    p = await s.history.configure("alice", true, true, s.now());
  await s.history.sync("alice", batch(p.privacyRevision), s.now());
  await s.history.sync(
    "alice",
    batch(p.privacyRevision, [{ ...run, route: null, routeDeleted: true }]),
    s.now(),
  );
  await s.history.sync("alice", batch(p.privacyRevision), s.now());
  assert.equal((await s.history.detail("alice", run.id)).route, null);
  await s.app.close();
});
test("concurrent privacy withdrawal and sync leave no stored GPS", async () => {
  const s = setup(),
    p = await s.history.configure("alice", true, true, s.now());
  await Promise.allSettled([
    s.history.sync("alice", batch(p.privacyRevision), s.now()),
    s.history.configure("alice", true, false, s.now()),
  ]);
  assert.equal((await s.history.preferences("alice")).gpsEnabled, false);
  const page = await s.history.page("alice", undefined, 100);
  if (page.runs.length)
    assert.equal((await s.history.detail("alice", run.id)).route, null);
  await s.app.close();
});
test("daily sync quota bounds database changes; duplicate payload does not rewrite detail", async () => {
  const s = setup(),
    p = await s.history.configure("alice", true, true, s.now());
  await s.history.sync("alice", batch(p.privacyRevision), s.now());
  const original = s.db.data.get(
    "users/alice/runs/" + run.id + "/details/data",
  );
  await s.history.sync("alice", batch(p.privacyRevision), s.now());
  assert.equal(
    s.db.data.get("users/alice/runs/" + run.id + "/details/data"),
    original,
  );
  s.db.data.set("users/alice/historyQuotas/2026-10-03", { writes: 25000 });
  assert.equal(
    (await s.mobile("POST", "/v1/history/sync", batch(p.privacyRevision)))
      .statusCode,
    429,
  );
  await s.app.close();
});
