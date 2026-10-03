# Runner API

Fastify/TypeScript service for numerical running summaries. It verifies Firebase Apple identity and App Check tokens before reserving quota or contacting Gemini. Analysis endpoints reject GPS coordinates, names, email addresses, and raw HealthKit samples. Separate consented history endpoints store measured history and optional precise routes; those routes are never passed to Gemini.

## Development

Use Node 22 or newer. Run `npm ci`, `npm run check`, `npm test`, and `npm run build`. Scripts explicitly invoke Node because the local parent directory contains a colon.

`npm test` exercises the production Fastify handlers and Firestore transaction implementation against an in-memory Firestore adapter: authentication, strict input validation, ownership, concurrent requests, cache expiry, daily and global limits, malformed provider output, provider failure, and deletion races. It does not replace testing against deployed Firebase services.

For local execution, provide Application Default Credentials for **runner-mdo-production** and the variables in `.env.example` through your process environment. Never commit a Gemini key or service-account JSON. `test/provider-smoke.ts` accepts `GEMINI_API_KEY` from the environment and sends synthetic data only.

## API

- `POST /v1/runs/analyze`: schema-versioned metrics, kilometer splits, quality flags, and compact historical baseline.
- `POST /v1/live/analyze`: current metrics and up to ten recent splits; responses expire after 60 seconds.
- `DELETE /v1/account`: delete cached analysis, quotas, synced history/routes, dashboard sessions, revoke refresh tokens, and delete the Firebase user. A minimal deletion tombstone prevents in-flight requests from restoring data.
- `GET /health`: public deployment health check. `/healthz` is also registered for container probes, but Cloud Run reserves that path at its public frontend.

Analysis and deletion require `Authorization: Bearer <Firebase ID token>` and `X-Firebase-AppCheck`. The ID token must come from Sign in with Apple; the App Check token must identify Runner's iOS Firebase app. No client-provided user ID is accepted.

`src/contracts.ts` defines the strict request and response contracts. Successful JSON reports include schema version 1, the supplied run/session UUID, exact measured metrics, bounded explanations with evidence keys, deterministic endurance eligibility, missing-data explanations, and generation time. Coordinates and unknown fields are rejected by the AI interfaces. Responses use `Cache-Control: no-store`.

Errors use stable codes: 400 invalid input, 401 authentication, 409 duplicate pending request, 413 oversized input, 429 quota, and 503 provider/spending availability. They never expose provider prompts, credentials, or submitted measurements.

## Deployed infrastructure

Project `runner-mdo-production` (42099202530), Cloud Run service `runner-api`, Firestore default database, and Artifact Registry `runner` are in `europe-west1`.

Endpoint: https://runner-api-lradqed2xa-ew.a.run.app

Runtime: 0 minimum / 2 maximum instances, 256 MiB, 1 CPU, concurrency 20, 60-second HTTP limit. Gemini model is server-configurable, initially `gemini-3.5-flash-lite`; provider calls have a 25-second deadline and at most two attempts. Model output is independently validated before caching or returning.

`runner-runtime` has Firestore access and only the Firebase user lifecycle permissions needed for deletion. It can read **only** `runner-gemini-api-key`. The separate `runner-apple-signin-key` backup is not accessible to the runtime; Firebase Authentication holds that configuration. Never embed either private key in a mobile app.

## Cost and retention

Initial limits are 3 completed-run and 24 live analyses per user per UTC day. Live calls are also spaced five minutes apart server-side. A per-user hash of validated input, mode, and model deduplicates identical requests. Transactions reserve quotas before calling Gemini and protect concurrent duplicates with a lease.

The application reserves ₺2 per provider request against a project-wide ₺300 monthly AI allowance. This conservative estimate includes retries and failed requests; it is **not measured billing** and does not reserve for Firestore, logging, images, or other cloud services. The ₺500 project-scoped monthly billing budget alerts at 50%, 80%, and 100%; it is not a hard billing cap. Review actual charges and adjust the estimate when model prices change. Set `AI_MONTHLY_BUDGET_TRY=0` to stop new model calls while keeping cached responses and health available.

Completed reports stop being served after 24 hours; live reports after 60 seconds. Firestore TTL is enabled on `analyses.expiresAt` and `quotas.expiresAt`; physical TTL deletion is asynchronous and can lag expiry. AI numerical summaries are processed transiently and excluded from application logs. Separately consented history is durable; it has no TTL and is retained until the user deletes it. The app keeps its own reports locally. All direct Firestore client reads and writes are denied by `infra/firestore.rules`.

## CI and credentials

`.github/workflows/deploy.yml` validates every pull request and deploys pushes to `main`. Google Workload Identity Federation trusts only GitHub repository ID **1403288993**, owner ID **10821064**, `refs/heads/main`, and push events. No long-lived Google service-account key is stored in GitHub.

The `runner-deploy` account can write images only to the Runner repository, update Cloud Run, and act as the Runner runtime account. The workflow deploys immutable commit-tagged images and verifies `/health`.

To rotate Gemini, create a Gemini-only restricted key, add a new Secret Manager version, update the version in the workflow, deploy, verify a synthetic request, then disable the previous version. Apple sign-in key rotation must also update Firebase's Apple code-flow configuration. Never print key material in a build log.

## Current release gates

Runner is linked to the selected funded billing account, with the project-scoped ₺500 budget and all three alert thresholds verified. A synthetic request to `gemini-3.5-flash-lite` passed response validation on October 3, 2026. GitHub Actions passed validation and deployed the production service using workload identity federation. Full mobile Apple authentication/App Attest and account deletion still require a signed physical device test. See the mobile repository's device validation checklist.

## Consented history database and dashboard

`GET /v1/history/preferences`, `PUT /v1/history/preferences`, `POST /v1/history/sync`, and `DELETE /v1/history` require the same Apple identity and iOS App Check verification as AI endpoints. Both history and GPS default off. Inputs accept a consent version and server privacy revision, never a user ID. Unknown fields, mismatched reports, conflicting UUIDs, and oversized details are rejected. UUIDs normalize to lowercase.

Firestore layout:

- `users/{uid}`: consent, privacy revision, and account-deletion guard.
- `users/{uid}/runs/{workoutUUID}`: small summaries for bounded dashboard pagination; deleted workouts remain tombstones.
- `users/{uid}/runs/{workoutUUID}/details/data`: splits, time-binned chart summaries, optional simplified routes, and saved AI reports. Unnecessary indexes on these large fields are disabled.
- `users/{uid}/measurements/{sampleUUID}`: dated VO₂ max and one-minute recovery, including deletion tombstones.
- `users/{uid}/historyQuotas/{UTCday}`: at most 25,000 submitted history changes per user/day, with 2-day expiry. Local checkpointing and server hashes avoid repeated detail writes.
- `dashboardLinks`, `dashboardSessions`, `dashboardRates`: hashed browser credentials and short-lived rate buckets. TTL expiry is asynchronous; application code independently enforces expiration.

History accepts batches of at most five runs, 100 measurements, and bounded deletions under a 2 MiB request limit. Each run has at most 1,500 chart bins and 3,000 filtered/simplified route points, with an 850 KB serialized detail limit below Firestore’s document cap. Large initial uploads resume through acknowledged local checkpoints. API quotas are separate from AI quotas; the ₺500 billing budget remains an alert, not a hard limit on durable database growth.

Privacy revisions reject uploads started before GPS withdrawal. The server hides routes immediately and purges stored coordinate arrays in bounded batches; an interrupted purge resumes on the phone’s persisted withdrawal retry. GPS cannot be re-enabled while a purge is pending. Empty delayed data does not erase a more complete recording. Explicit Health deletions are propagated; old phone copies cannot restore deleted workouts or routes. Clearing cloud history disables sync and removes history, measurements, and sync quota records. Account deletion first marks the account deleted to block in-flight writes, then clears all data and dashboard access.

`/dashboard` serves the bundled frontend with CSP, no-store caching, no external scripts/fonts/maps, and safe text rendering. The browser requests a random 10-character code and holds a separate 256-bit exchange secret in memory. Authenticated mobile endpoints preview and approve the pending browser. A one-use exchange issues a `__Host-` Secure/HttpOnly/SameSite=Strict cookie for a read-only account session. State-changing browser endpoints require the exact configured origin; no wildcard CORS is enabled. Sessions expire after 12 hours or 30 minutes without API activity. Codes expire after ten minutes, with per-IP and per-user issuance/approval limits. Passwords, GPS, samples, bearer tokens and prompts are excluded from application logs. Firestore client rules continue to deny direct reads/writes.

Dashboard browser API: `POST /v1/dashboard/link`, `POST /v1/dashboard/link/poll`, `GET /v1/dashboard/history`, `GET /v1/dashboard/runs/:id`, `POST /v1/dashboard/logout`. Mobile approval: `GET /v1/dashboard/link/:code` and `POST /v1/dashboard/approve`. Browser history scans bounded summary pages, then sorts by workout date; details load on selection. Date-filtered route density loads at most 100 routes per user action and counts each run once per grid cell. A matching pace comparison requires at least five prior comparable runs, using the same thresholds as RunCore.

`test/dashboard-preview.mts` starts a localhost-only synthetic UI preview after `npm run build`. Its fake identity is excluded from production startup and Docker. `test/history-firestore-smoke.mts` explicitly targets Runner with a selected admin account, uploads the Swift wire fixture into a disposable synthetic user namespace, tests real transactions and privacy/session behavior, and removes those test records. Neither test reads users’ Health data or creates Firebase users.

History dashboard validation: 16 RunCore tests and 16 iOS 18.5 simulator tests passed; the Swift history payload passed the backend Zod contract. Backend tests cover consent, database ownership, browser sessions, concurrent updates, deletion tombstones, quotas, and withdrawal. A disposable synthetic run also passed actual Firestore persistence/session/GPS purge testing. Real Apple sign-in, Health read permission, consent, and uploads on the connected iPhone remain unverified because of the device touchscreen and account/mirroring limitations.
