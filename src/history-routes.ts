import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { APIError } from "./store.js";
import {
  codeSchema,
  historySyncSchema,
  linkPollSchema,
  preferencesSchema,
} from "./history-contracts.js";
import type { HistoryRepository } from "./history-store.js";
const cookieName = "__Host-runner_session";
const cookie = (token: string, age = 43200) =>
  `${cookieName}=${token}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
export function historyRoutes(
  app: FastifyInstance,
  history: HistoryRepository,
  authenticate: (headers: Record<string, unknown>) => Promise<string>,
  now: () => number,
  origin: string,
) {
  const assets = new Map<string, { type: string; file: string }>([
    ["/dashboard", { type: "text/html; charset=utf-8", file: "index.html" }],
    [
      "/dashboard/dashboard.js",
      { type: "text/javascript; charset=utf-8", file: "dashboard.js" },
    ],
    [
      "/dashboard/dashboard.css",
      { type: "text/css; charset=utf-8", file: "dashboard.css" },
    ],
  ]);
  const loaded = new Map<string, Buffer>();
  const limits = new Map<string, { count: number; until: number }>();
  function parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new APIError(400, "invalid_input");
    return result.data;
  }
  function sameOrigin(headers: Record<string, unknown>) {
    if (headers.origin !== origin) throw new APIError(403, "origin_required");
  }
  function token(headers: Record<string, unknown>) {
    const value = typeof headers.cookie === "string" ? headers.cookie : "";
    const found =
      value
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1) ?? "";
    return /^[a-f0-9]{64}$/.test(found) ? found : "";
  }
  function ip(headers: Record<string, unknown>, fallback: string) {
    const forwarded =
      typeof headers["x-forwarded-for"] === "string"
        ? headers["x-forwarded-for"].split(",").at(-1)?.trim()
        : undefined;
    return forwarded && isIP(forwarded) ? forwarded : fallback;
  }
  function rate(key: string, max: number) {
    const time = now();
    const state = limits.get(key);
    if (state && state.until > time) {
      if (++state.count > max) throw new APIError(429, "dashboard_limit", 60);
    } else {
      if (limits.size >= 10000) {
        for (const [k, v] of limits) if (v.until <= time) limits.delete(k);
        if (limits.size >= 10000) throw new APIError(503, "dashboard_busy", 60);
      }
      limits.set(key, { count: 1, until: time + 60000 });
    }
  }
  app.addHook("onSend", async (request, reply, payload) => {
    if (
      request.url.startsWith("/v1/history") ||
      request.url.startsWith("/v1/dashboard") ||
      request.url.startsWith("/dashboard")
    )
      reply
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .header(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
        );
    return payload;
  });
  for (const [path, asset] of assets)
    app.get(path, async (_, reply) => {
      let data = loaded.get(asset.file);
      if (!data) {
        data = await readFile(new URL("../web/" + asset.file, import.meta.url));
        loaded.set(asset.file, data);
      }
      return reply.type(asset.type).send(data);
    });
  app.get("/dashboard/", async (_, reply) => reply.redirect("/dashboard"));
  app.get("/v1/history/preferences", async (request) =>
    history.preferences(await authenticate(request.headers)),
  );
  app.put("/v1/history/preferences", async (request) => {
    const uid = await authenticate(request.headers),
      p = parse(preferencesSchema, request.body);
    return history.configure(uid, p.enabled, p.gpsEnabled, now());
  });
  app.post(
    "/v1/history/sync",
    { bodyLimit: 2 * 1024 * 1024 },
    async (request) => {
      const uid = await authenticate(request.headers);
      return history.sync(uid, parse(historySyncSchema, request.body), now());
    },
  );
  app.delete("/v1/history", async (request, reply) => {
    await history.clear(await authenticate(request.headers), now());
    return reply.code(204).send();
  });
  app.post("/v1/dashboard/link", async (request) => {
    sameOrigin(request.headers);
    const address = ip(request.headers, request.ip);
    rate("link-" + address, 20);
    return history.createLink(
      address,
      String(request.headers["user-agent"] ?? "Browser"),
      now(),
    );
  });
  app.post("/v1/dashboard/link/poll", async (request, reply) => {
    sameOrigin(request.headers);
    rate("poll-" + ip(request.headers, request.ip), 30);
    const p = parse(linkPollSchema, request.body);
    const result = await history.poll(p.code, p.secret, now());
    if (result.token) reply.header("Set-Cookie", cookie(result.token));
    return { status: result.status };
  });
  app.get("/v1/dashboard/link/:code", async (request) => {
    await authenticate(request.headers);
    const p = parse(z.object({ code: codeSchema }), request.params);
    return history.linkInfo(p.code, now());
  });
  app.post("/v1/dashboard/approve", async (request, reply) => {
    const uid = await authenticate(request.headers);
    const p = parse(z.object({ code: codeSchema }).strict(), request.body);
    await history.approve(uid, p.code, now());
    return reply.code(204).send();
  });
  app.get("/v1/dashboard/history", async (request) => {
    rate("read-" + token(request.headers), 120);
    const uid = await history.session(token(request.headers), now());
    const p = parse(
      z
        .object({
          cursor: z.uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(100),
        })
        .strict(),
      request.query,
    );
    return history.page(uid, p.cursor, p.limit);
  });
  app.get("/v1/dashboard/runs/:id", async (request) => {
    rate("read-" + token(request.headers), 120);
    const uid = await history.session(token(request.headers), now());
    const p = parse(
      z.object({ id: z.uuid().transform((x) => x.toLowerCase()) }),
      request.params,
    );
    return history.detail(uid, p.id);
  });
  app.post("/v1/dashboard/logout", async (request, reply) => {
    sameOrigin(request.headers);
    await history.logout(token(request.headers));
    return reply.header("Set-Cookie", cookie("", 0)).code(204).send();
  });
}
