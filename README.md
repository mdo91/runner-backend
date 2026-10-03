# Runner API

Fastify/TypeScript service for numerical running summaries. It verifies Firebase Apple identity and App Check tokens before reserving quota or contacting Gemini. It does not receive GPS coordinates, names, email addresses, or raw HealthKit samples.

## Development

Use Node 22 or newer. Run `npm ci`, `npm run check`, `npm test`, and `npm run build`. Scripts explicitly invoke Node because the local parent directory contains a colon.

`npm test` exercises the production Fastify handlers and Firestore transaction implementation against an in-memory Firestore adapter: authentication, strict input validation, ownership, concurrent requests, cache expiry, daily and global limits, malformed provider output, provider failure, and deletion races. It does not replace testing against deployed Firebase services.

For local execution, provide Application Default Credentials for **runner-mdo-production** and the variables in `.env.example` through your process environment. Never commit a Gemini key or service-account JSON. `test/provider-smoke.ts` accepts `GEMINI_API_KEY` from the environment and sends synthetic data only.

## API

- `POST /v1/runs/analyze`: schema-versioned metrics, kilometer splits, quality flags, and compact historical baseline.
- `POST /v1/live/analyze`: current metrics and up to ten recent splits; responses expire after 60 seconds.
- `DELETE /v1/account`: delete cached analysis and quotas, revoke refresh tokens, and delete the Firebase user. A minimal deletion tombstone prevents in-flight requests from restoring data.
- `GET /health`: public deployment health check. `/healthz` is also registered for container probes, but Cloud Run reserves that path at its public frontend.

Analysis and deletion require `Authorization: Bearer <Firebase ID token>` and `X-Firebase-AppCheck`. The ID token must come from Sign in with Apple; the App Check token must identify Runner's iOS Firebase app. No client-provided user ID is accepted.

`src/contracts.ts` defines the strict request and response contracts. Successful JSON reports include schema version 1, the supplied run/session UUID, exact measured metrics, bounded explanations with evidence keys, deterministic endurance eligibility, missing-data explanations, and generation time. Coordinates and unknown fields are rejected. Responses use `Cache-Control: no-store`.

Errors use stable codes: 400 invalid input, 401 authentication, 409 duplicate pending request, 413 oversized input, 429 quota, and 503 provider/spending availability. They never expose provider prompts, credentials, or submitted measurements.

## Deployed infrastructure

Project `runner-mdo-production` (42099202530), Cloud Run service `runner-api`, Firestore default database, and Artifact Registry `runner` are in `europe-west1`.

Endpoint: https://runner-api-lradqed2xa-ew.a.run.app

Runtime: 0 minimum / 2 maximum instances, 256 MiB, 1 CPU, concurrency 20, 60-second HTTP limit. Gemini model is server-configurable, initially `gemini-3.5-flash-lite`; provider calls have a 25-second deadline and at most two attempts. Model output is independently validated before caching or returning.

`runner-runtime` has Firestore access and only the Firebase user lifecycle permissions needed for deletion. It can read **only** `runner-gemini-api-key`. The separate `runner-apple-signin-key` backup is not accessible to the runtime; Firebase Authentication holds that configuration. Never embed either private key in a mobile app.

## Cost and retention

Initial limits are 3 completed-run and 24 live analyses per user per UTC day. Live calls are also spaced five minutes apart server-side. A per-user hash of validated input, mode, and model deduplicates identical requests. Transactions reserve quotas before calling Gemini and protect concurrent duplicates with a lease.

The application reserves ₺2 per provider request against a project-wide ₺300 monthly AI allowance. This conservative estimate includes retries and failed requests; it is **not measured billing** and does not reserve for Firestore, logging, images, or other cloud services. The ₺500 project-scoped monthly billing budget alerts at 50%, 80%, and 100%; it is not a hard billing cap. Review actual charges and adjust the estimate when model prices change. Set `AI_MONTHLY_BUDGET_TRY=0` to stop new model calls while keeping cached responses and health available.

Completed reports stop being served after 24 hours; live reports after 60 seconds. Firestore TTL is enabled on `analyses.expiresAt` and `quotas.expiresAt`; physical TTL deletion is asynchronous and can lag expiry. Numerical summaries are processed transiently and excluded from application logs. The app keeps its own reports locally. All direct Firestore client reads and writes are denied by `infra/firestore.rules`.

## CI and credentials

`.github/workflows/deploy.yml` validates every pull request and deploys pushes to `main`. Google Workload Identity Federation trusts only GitHub repository ID **1403288993**, owner ID **10821064**, `refs/heads/main`, and push events. No long-lived Google service-account key is stored in GitHub.

The `runner-deploy` account can write images only to the Runner repository, update Cloud Run, and act as the Runner runtime account. The workflow deploys immutable commit-tagged images and verifies `/health`.

To rotate Gemini, create a Gemini-only restricted key, add a new Secret Manager version, update the version in the workflow, deploy, verify a synthetic request, then disable the previous version. Apple sign-in key rotation must also update Firebase's Apple code-flow configuration. Never print key material in a build log.

## Current release gates

Runner is linked to the selected funded billing account, with the project-scoped ₺500 budget and all three alert thresholds verified. A synthetic request to `gemini-3.5-flash-lite` passed response validation on October 3, 2026. GitHub Actions passed validation and deployed the production service using workload identity federation. Full mobile Apple authentication/App Attest and account deletion still require a signed physical device test. See the mobile repository's device validation checklist.
