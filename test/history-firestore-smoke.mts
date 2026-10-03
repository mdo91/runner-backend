// Explicit, synthetic integration smoke. No Health data or Firebase users are read.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Firestore } from "firebase-admin/firestore";
import { OAuth2Client } from "google-auth-library";
import { HistoryStore } from "../src/history-store.js";
import {
  historySyncSchema,
  historyConsentVersion,
} from "../src/history-contracts.js";
const project = "runner-mdo-production",
  account = process.env.RUNNER_ADMIN_ACCOUNT;
if (!account) throw Error("Set RUNNER_ADMIN_ACCOUNT explicitly");
const token = execFileSync(
  "/opt/homebrew/share/google-cloud-sdk/bin/gcloud",
  [
    "--configuration=runner",
    "--account=" + account,
    "auth",
    "print-access-token",
  ],
  { encoding: "utf8" },
).trim();
const authClient = new OAuth2Client();
authClient.setCredentials({
  access_token: token,
  expiry_date: Date.now() + 3000000,
});
const db = new Firestore({ projectId: project, authClient } as any),
  history = new HistoryStore(db),
  uid = "synthetic-history-smoke-" + randomUUID(),
  now = Date.now();
const run = JSON.parse(readFileSync("/tmp/runner-history-swift.json", "utf8"));
const request = (revision: number, runs: any[] = [run]) =>
  historySyncSchema.parse({
    schemaVersion: 1,
    consentVersion: historyConsentVersion,
    privacyRevision: revision,
    runs,
    measurements: [],
    deletedRunIDs: [],
    deletedMeasurementIDs: [],
  });
let pair: Awaited<ReturnType<HistoryStore["createLink"]>> | undefined;
try {
  const prefs = await history.configure(uid, true, true, now);
  await Promise.all([
    history.sync(uid, request(prefs.privacyRevision), now),
    history.sync(uid, request(prefs.privacyRevision), now),
  ]);
  assert.equal((await history.page(uid, undefined, 100)).runs.length, 1);
  assert.equal(
    (await history.detail(uid, run.id.toLowerCase())).route?.length,
    4,
  );
  pair = await history.createLink(
    "synthetic-smoke-" + uid,
    "Synthetic CLI test browser",
    now,
  );
  await history.approve(uid, pair.code, now);
  const approved = await history.poll(pair.code, pair.secret, now);
  assert.ok(approved.token);
  assert.equal(await history.session(approved.token!, now), uid);
  await history.logout(approved.token!);
  const next = await history.configure(uid, true, false, now + 1);
  assert.equal((await history.detail(uid, run.id.toLowerCase())).route, null);
  await assert.rejects(
    history.sync(uid, request(prefs.privacyRevision), now + 2),
  );
  const deleted = request(next.privacyRevision, []);
  deleted.deletedRunIDs = [run.id.toLowerCase()];
  await history.sync(uid, deleted, now + 2);
  assert.equal((await history.page(uid, undefined, 100)).runs.length, 0);
  console.log(
    "PASS: real Firestore persistence, concurrent duplicates, phone-approved session, GPS purge, stale revision rejection, workout deletion.",
  );
} finally {
  await history.deleteAccount(uid);
  await db.recursiveDelete(db.doc("users/" + uid));
  // Rate buckets contain no user data and expire via TTL.
  await db.terminate();
  console.log("Synthetic user history and dashboard session cleaned up.");
}
