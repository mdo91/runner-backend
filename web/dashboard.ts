type Metrics = {
  distanceMeters: number | null;
  elapsedSeconds: number;
  movingSeconds: number;
  averagePaceSecondsPerKm: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  activeEnergyKcal: number | null;
  elevationGainMeters: number | null;
  pacingCoefficientOfVariation: number | null;
  heartRateCoverage: number;
};
type Summary = {
  id: string;
  start: string;
  end: string;
  source: string;
  indoor: boolean;
  metrics: Metrics;
  hasRoute: boolean;
  hasReport: boolean;
  updatedAt: string;
};
type Series = {
  t: number;
  heartRate: number | null;
  paceSecondsPerKm: number | null;
  powerWatts: number | null;
  strideMeters: number | null;
  groundContactMilliseconds: number | null;
  verticalOscillationMeters: number | null;
};
type Route = {
  t: number;
  latitude: number;
  longitude: number;
  altitude: number;
  segment: number;
  paceSecondsPerKm: number | null;
  heartRate: number | null;
};
type Run = Summary & {
  splits: {
    index: number;
    distanceMeters: number;
    movingSeconds: number;
    averageHeartRate: number | null;
  }[];
  series: Series[];
  route: Route[] | null;
  report: {
    explanation: {
      summary: string;
      insights: { title: string; detail: string; evidence: string[] }[];
      nextRun: string;
    };
    endurance: { status: string; detail: string };
    missingData: string[];
    generatedAt: string;
  } | null;
};
type Measurement = {
  id: string;
  kind: "vo2Max" | "recoveryBpm";
  value: number;
  measuredAt: string;
};
type Preferences = { enabled: boolean; gpsEnabled: boolean };
const app = document.querySelector<HTMLDivElement>("#app")!;
let runs: Summary[] = [],
  measurements: Measurement[] = [],
  prefs: Preferences = { enabled: false, gpsEnabled: false },
  view = "Latest Run",
  unit = "metric",
  period = "all",
  selected: string | null = null,
  session = true,
  hasLoaded = false,
  generation = 0,
  pollTimer: number | undefined;
const details = new Map<string, Run>();
const el = <K extends keyof HTMLElementTagNameMap>(
  name: K,
  text?: string,
  cls?: string,
) => {
  const node = document.createElement(name);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
function button(text: string, action: () => void, cls?: string) {
  const b = el("button", text, cls);
  b.addEventListener("click", action);
  return b;
}
function svg(name: string, attrs: Record<string, string | number> = {}) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}
function notice(text: string, error = false) {
  return el("div", text, "notice" + (error ? " error" : ""));
}
const date = (raw: string) =>
  new Date(raw).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const duration = (seconds: number) => {
  const n = Math.max(0, Math.round(seconds));
  return n >= 3600
    ? `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
    : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};
const scale = () => (unit === "metric" ? 1000 : 1609.344);
const distance = (n: number | null) =>
  n === null ? "—" : (n / scale()).toFixed(2);
const pace = (n: number | null) =>
  n === null || n <= 0 ? "—" : duration((n * scale()) / 1000);
const number = (n: number | null, precision = 0) =>
  n === null ? "—" : n.toFixed(precision);
const distanceUnit = () => (unit === "metric" ? "km" : "mi");
async function api<T>(path: string, body?: unknown): Promise<T> {
  const result = await fetch("/v1/dashboard/" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!result.ok) {
    if (result.status === 401) {
      session = false;
      throw new Error(
        "Your session ended. Approve a new code in the iPhone app to sign in.",
      );
    }
    throw new Error(
      result.status === 429
        ? "Please wait a minute and try again."
        : result.status === 404
          ? "This run or sign-in code is no longer available."
          : "The dashboard could not load. Check your connection and try again.",
    );
  }
  return result.status === 204
    ? (undefined as T)
    : ((await result.json()) as T);
}
function clearSession() {
  runs = [];
  measurements = [];
  details.clear();
  selected = null;
  generation++;
  if (pollTimer) clearTimeout(pollTimer);
}
function signIn(message?: string) {
  clearSession();
  app.replaceChildren();
  const box = el("main", undefined, "login");
  box.append(
    brand(),
    el("h1", "Your runs. One place."),
    el(
      "p",
      "See the same measured performance as Runner on your iPhone, with your history, trends, and shared routes.",
      "subtle",
    ),
  );
  const panel = el("section", undefined, "panel");
  panel.append(
    el("h2", "Sign in with your iPhone"),
    el(
      "p",
      "Sign in with Apple in Runner, then open Settings → Cloud history → Connect dashboard. Enter the code shown here and approve this browser.",
      "subtle",
    ),
  );
  const b = button(
    "Get a sign-in code",
    () => {
      void link(panel, b);
    },
    "primary",
  );
  panel.append(b);
  if (message) panel.append(notice(message, true));
  box.append(
    panel,
    el(
      "p",
      "History and precise GPS uploads are separate opt-ins in the iPhone app. This browser never requests access to Apple Health.",
      "footer",
    ),
  );
  app.append(box);
}
function brand() {
  const b = el("div", undefined, "brand");
  b.append(el("span", "R", "mark"), el("span", "Runner"));
  return b;
}
async function link(panel: HTMLElement, b: HTMLButtonElement) {
  b.disabled = true;
  const version = generation;
  try {
    const pair = await api<{ code: string; secret: string; expiresAt: string }>(
      "link",
      {},
    );
    if (version !== generation) return;
    panel.replaceChildren(
      el("h2", "Approve this browser in Runner"),
      el("div", pair.code.slice(0, 5) + " " + pair.code.slice(5), "code"),
      el(
        "p",
        "Open Connect dashboard on your iPhone and enter this code. Approve only if you requested this sign-in.",
        "subtle",
      ),
      el(
        "p",
        "Code expires in 10 minutes. Waiting for approval…",
        "small subtle",
      ),
    );
    const poll = async () => {
      if (version !== generation) return;
      try {
        if (Date.now() >= Date.parse(pair.expiresAt))
          throw new Error("The code expired. Get a new code to continue.");
        const result = await api<{ status: string }>("link/poll", {
          code: pair.code,
          secret: pair.secret,
        });
        if (version !== generation) return;
        if (result.status === "approved") {
          session = true;
          await load();
        } else
          pollTimer = window.setTimeout(() => {
            void poll();
          }, 4000);
      } catch (error) {
        if (version === generation) signIn((error as Error).message);
      }
    };
    pollTimer = window.setTimeout(() => {
      void poll();
    }, 4000);
  } catch (error) {
    panel.append(notice((error as Error).message, true));
    b.disabled = false;
  }
}
async function load() {
  const version = ++generation;
  app.replaceChildren(el("main", "Loading your running history…", "loading"));
  try {
    const all: Summary[] = [],
      ms: Measurement[] = [];
    let cursor: string | null = null;
    do {
      const page: {
        runs: Summary[];
        measurements: Measurement[];
        preferences: Preferences;
        nextCursor: string | null;
      } = await api(
        "history" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      );
      if (version !== generation) return;
      all.push(...page.runs);
      ms.push(...page.measurements);
      prefs = page.preferences;
      cursor = page.nextCursor;
      app.firstElementChild!.textContent = `Loaded ${all.length} runs…`;
    } while (cursor);
    runs = all.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
    hasLoaded = true;
    measurements = ms.sort(
      (a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt),
    );
    session = true;
    render();
  } catch (error) {
    if (version !== generation) return;
    if (!session) signIn(hasLoaded ? (error as Error).message : undefined);
    else {
      app.replaceChildren(
        notice((error as Error).message, true),
        button("Retry", () => {
          void load();
        }),
      );
    }
  }
}
function filtered() {
  if (period === "all") return runs;
  const cutoff = Date.now() - Number(period) * 86400000;
  return runs.filter((r) => Date.parse(r.start) >= cutoff);
}
function selector(
  label: string,
  options: [string, string][],
  value: string,
  change: (v: string) => void,
) {
  const l = el("label", label),
    s = el("select");
  s.setAttribute("aria-label", label);
  for (const [v, t] of options) {
    const o = el("option", t);
    o.value = v;
    s.append(o);
  }
  s.value = value;
  s.addEventListener("change", () => change(s.value));
  l.append(s);
  return l;
}
function render() {
  app.replaceChildren();
  const shell = el("div", undefined, "shell"),
    side = el("aside", undefined, "sidebar"),
    nav = el("nav");
  nav.setAttribute("aria-label", "Dashboard");
  side.append(brand());
  for (const item of ["Latest Run", "History", "Trends", "Routes"]) {
    const b = button(
      item,
      () => {
        view = item;
        selected = null;
        render();
      },
      "nav" + (view === item ? " active" : ""),
    );
    if (view === item) b.setAttribute("aria-current", "page");
    nav.append(b);
  }
  side.append(
    nav,
    el(
      "div",
      prefs.enabled
        ? "History sync enabled on iPhone."
        : "History sync paused. Saved data remains available.",
      "sidefooter",
    ),
  );
  shell.append(side);
  const content = el("main", undefined, "content"),
    head = el("header", undefined, "topbar"),
    title = el("div");
  title.append(
    el("div", "RUNNER / YOUR PERFORMANCE", "eyebrow"),
    el("h1", selected ? "Run details" : view),
    el(
      "p",
      view === "Latest Run"
        ? "Your latest imported run, measured from Apple Health."
        : "A clearer view of the work you’ve put in.",
      "subtle",
    ),
  );
  const actions = el("div", undefined, "row");
  actions.append(
    selector(
      "Units",
      [
        ["metric", "Kilometers"],
        ["imperial", "Miles"],
      ],
      unit,
      (v) => {
        unit = v;
        render();
      },
    ),
    button("Refresh", () => {
      details.clear();
      void load();
    }),
    button("Sign out", () => {
      void api("logout", {})
        .then(() => signIn())
        .catch((error) =>
          content.prepend(notice((error as Error).message, true)),
        );
    }),
  );
  head.append(title, actions);
  content.append(head);
  const body = el("div");
  content.append(body);
  if (!prefs.enabled)
    body.append(
      notice(
        "Sync is paused. Enable “Sync running history” in Runner’s Settings to upload new workouts.",
      ),
    );
  if (!runs.length) {
    body.append(
      el(
        "div",
        "No synced runs yet. In the iPhone app, sign in with Apple, consent to history sync, and import your Apple Health workouts. GPS sharing is optional.",
        "empty",
      ),
    );
  } else if (selected || view === "Latest Run") {
    if (selected)
      body.append(
        button(
          "← Back to history",
          () => {
            selected = null;
            view = "History";
            render();
          },
          "back",
        ),
      );
    void showRun(selected ?? runs[0]!.id, body);
  } else {
    body.append(
      selector(
        "Date range",
        [
          ["all", "All history"],
          ["30", "Last 30 days"],
          ["90", "Last 90 days"],
          ["365", "Last year"],
        ],
        period,
        (v) => {
          period = v;
          render();
        },
      ),
    );
    if (view === "History") showHistory(body);
    else if (view === "Trends") showTrends(body);
    else showRoutes(body);
  }
  content.append(
    el(
      "footer",
      "HealthKit provides the recorded measurements. Missing values stay unavailable. AI reports are fitness coaching, not a medical diagnosis. Routes are rendered locally in this browser without sending coordinates to a map provider.",
      "footer",
    ),
  );
  shell.append(content);
  app.append(shell);
}
function card(label: string, value: string, suffix = "", detail?: string) {
  const c = el("div", undefined, "card"),
    v = el("div", value, "metric");
  v.append(el("small", suffix));
  c.append(el("div", label, "small subtle"), v);
  if (detail) c.append(el("div", detail, "small subtle"));
  return c;
}
function panel(title: string) {
  const p = el("section", undefined, "panel");
  p.append(el("h2", title));
  return p;
}
function table(
  headers: string[],
  rows: (string | HTMLElement)[][],
  caption?: string,
) {
  const wrap = el("div", undefined, "tablewrap"),
    t = el("table");
  if (caption) t.append(el("caption", caption));
  const h = el("thead"),
    tr = el("tr");
  for (const text of headers) {
    const th = el("th", text);
    th.scope = "col";
    tr.append(th);
  }
  h.append(tr);
  t.append(h);
  const body = el("tbody");
  for (const cells of rows) {
    const r = el("tr");
    for (const text of cells) {
      const c = el("td");
      typeof text === "string" ? (c.textContent = text) : c.append(text);
      r.append(c);
    }
    body.append(r);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}
function showHistory(body: HTMLElement) {
  const list = filtered(),
    cards = el("div", undefined, "cards");
  const total = list.reduce((n, r) => n + (r.metrics.distanceMeters ?? 0), 0),
    moving = list.reduce((n, r) => n + r.metrics.movingSeconds, 0);
  cards.append(
    card("Runs", String(list.length)),
    card("Recorded distance", distance(total), distanceUnit()),
    card("Moving time", duration(moving)),
    card("Route recordings", String(list.filter((r) => r.hasRoute).length)),
  );
  body.append(cards);
  const p = panel("Running history");
  p.append(
    table(
      [
        "Run",
        "Distance",
        "Moving time",
        "Pace / " + distanceUnit(),
        "Heart rate",
        "Source",
      ],
      list.map((r) => [
        button(date(r.start), () => {
          selected = r.id;
          render();
        }),
        distance(r.metrics.distanceMeters) + " " + distanceUnit(),
        duration(r.metrics.movingSeconds),
        pace(r.metrics.averagePaceSecondsPerKm),
        number(r.metrics.averageHeartRate) + " bpm",
        r.source + (r.indoor ? " · Indoor" : ""),
      ]),
      `${list.length} runs in this range. Select a date to view the full run.`,
    ),
  );
  body.append(p);
}
async function getRun(id: string) {
  const version = generation;
  const cached = details.get(id);
  if (cached) return cached;
  const r = await api<Run>("runs/" + encodeURIComponent(id));
  if (version !== generation)
    throw new Error("Your session changed. Reload this view.");
  details.set(id, r);
  return r;
}
async function showRun(id: string, body: HTMLElement) {
  const placeholder = el("p", "Loading run details…", "subtle");
  body.append(placeholder);
  try {
    const r = await getRun(id);
    if (!body.isConnected) return;
    placeholder.remove();
    body.append(
      el(
        "div",
        date(r.start) + " · " + r.source + (r.indoor ? " · Indoor run" : ""),
        "subtle",
      ),
    );
    const cards = el("div", undefined, "cards");
    cards.append(
      card("Distance", distance(r.metrics.distanceMeters), distanceUnit()),
      card(
        "Moving time",
        duration(r.metrics.movingSeconds),
        "",
        `Elapsed ${duration(r.metrics.elapsedSeconds)}`,
      ),
      card(
        "Average pace",
        pace(r.metrics.averagePaceSecondsPerKm),
        "/ " + distanceUnit(),
      ),
      card(
        "Average heart rate",
        number(r.metrics.averageHeartRate),
        "bpm",
        `${Math.round(r.metrics.heartRateCoverage * 100)}% recorded coverage`,
      ),
    );
    body.append(cards);
    const grid = el("div", undefined, "grid"),
      heart = panel("Heart rate"),
      pacing = panel("Pace");
    heart.append(
      chart(
        r.series.map((p) => ({ x: p.t / 60, y: p.heartRate })),
        (v) => number(v) + " bpm",
        "Minutes into run",
        "Recorded heart rate during this run",
      ),
    );
    pacing.append(
      chart(
        r.series.map((p) => ({ x: p.t / 60, y: p.paceSecondsPerKm })),
        pace,
        "Minutes into run",
        "Recorded pace during this run",
        true,
      ),
    );
    grid.append(heart, pacing);
    const route = panel("Route"),
      mapBox = el("div");
    route.append(mapBox);
    if (r.route?.length)
      route.append(
        selector(
          "Color by",
          [
            ["pace", "Pace"],
            ["heart", "Heart rate"],
          ],
          "pace",
          (v) => drawRoute(r, mapBox, v),
        ),
      );
    drawRoute(r, mapBox, "pace");
    const stats = panel("Performance");
    stats.append(
      table(
        ["Measurement", "Recorded value"],
        [
          ["Active energy", number(r.metrics.activeEnergyKcal) + " kcal"],
          [
            "Elevation gain",
            r.metrics.elevationGainMeters === null
              ? "—"
              : unit === "metric"
                ? number(r.metrics.elevationGainMeters) + " m"
                : number(r.metrics.elevationGainMeters * 3.28084) + " ft",
          ],
          ["Maximum heart rate", number(r.metrics.maxHeartRate) + " bpm"],
          [
            "Pacing variation",
            r.metrics.pacingCoefficientOfVariation === null
              ? "Insufficient splits"
              : (r.metrics.pacingCoefficientOfVariation * 100).toFixed(1) + "%",
          ],
          [
            "Heart-rate coverage",
            (r.metrics.heartRateCoverage * 100).toFixed(0) + "%",
          ],
        ],
      ),
    );
    grid.append(route, stats);
    body.append(grid);
    const splits = panel("Splits");
    if (r.splits.length)
      splits.append(
        table(
          [
            "Split",
            "Distance",
            "Moving time",
            "Pace / " + distanceUnit(),
            "Heart rate",
          ],
          r.splits.map((s) => [
            String(s.index),
            distance(s.distanceMeters) + " " + distanceUnit(),
            duration(s.movingSeconds),
            pace(
              s.distanceMeters > 0
                ? (s.movingSeconds / s.distanceMeters) * 1000
                : null,
            ),
            number(s.averageHeartRate) + " bpm",
          ]),
          "Measured kilometer splits, displayed in your selected units.",
        ),
      );
    else
      splits.append(
        el(
          "p",
          "Distance samples are not available to calculate splits.",
          "subtle",
        ),
      );
    body.append(splits);
    const dynamic = el("div", undefined, "grid");
    for (const [key, label, suffix, factor] of [
      ["powerWatts", "Running power", "W", 1],
      ["strideMeters", "Stride length", "m", 1],
      ["groundContactMilliseconds", "Ground contact", "ms", 1],
      ["verticalOscillationMeters", "Vertical oscillation", "cm", 100],
    ] as const) {
      if (!r.series.some((p) => p[key] !== null)) continue;
      const p = panel(label);
      p.append(
        chart(
          r.series.map((p) => ({
            x: p.t / 60,
            y: p[key] === null ? null : p[key]! * factor,
          })),
          (v) => number(v, label === "Stride length" ? 2 : 0) + " " + suffix,
          "Minutes into run",
          label,
        ),
      );
      dynamic.append(p);
    }
    if (dynamic.childElementCount) body.append(dynamic);
    const ai = panel("Run assessment");
    if (r.report) {
      ai.append(el("p", r.report.explanation.summary, "subtle"));
      for (const insight of r.report.explanation.insights) {
        const block = el("div", undefined, "ai-insight");
        block.append(
          el("h3", insight.title),
          el("p", insight.detail),
          el("p", "Based on: " + insight.evidence.join(", "), "small subtle"),
        );
        ai.append(block);
      }
      ai.append(
        el("p", r.report.endurance.detail, "subtle"),
        el("h3", "Next run"),
        el("p", r.report.explanation.nextRun, "subtle"),
        el("p", "AI report · " + date(r.report.generatedAt), "small subtle"),
      );
      for (const missing of r.report.missingData)
        ai.append(el("p", missing, "small subtle"));
    } else
      ai.append(
        el(
          "p",
          "No AI report has been synced for this run. You can request one in Runner on your iPhone with AI consent. Your measured stats remain available here.",
          "subtle",
        ),
      );
    body.append(ai);
    const disclosure = el("details", undefined, "details");
    disclosure.append(
      el("summary", "View chart data"),
      table(
        [
          "Minutes",
          "Heart rate (bpm)",
          "Pace / " + distanceUnit(),
          "Power (W)",
          "Stride (m)",
        ],
        r.series.map((p) => [
          (p.t / 60).toFixed(1),
          number(p.heartRate),
          pace(p.paceSecondsPerKm),
          number(p.powerWatts),
          number(p.strideMeters, 2),
        ]),
        "Charts use time-binned summaries. Gaps indicate unavailable data.",
      ),
    );
    body.append(disclosure);
  } catch (error) {
    placeholder.remove();
    if (!session) {
      signIn((error as Error).message);
      return;
    }
    if (body.isConnected) body.append(notice((error as Error).message, true));
  }
}
function chart(
  points: { x: number; y: number | null }[],
  format: (n: number | null) => string,
  xLabel: string,
  label: string,
  invert = false,
) {
  const container = el("div"),
    valid = points.filter(
      (p): p is { x: number; y: number } =>
        p.y !== null && Number.isFinite(p.y),
    );
  if (!valid.length) {
    container.append(el("p", "No recorded measurements available.", "empty"));
    return container;
  }
  const w = 560,
    h = 230,
    pad = 48,
    minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(minX + 1, ...points.map((p) => p.x)),
    minY = Math.min(...valid.map((p) => p.y)),
    maxY = Math.max(minY + 1, ...valid.map((p) => p.y)),
    margin = (maxY - minY) * 0.12;
  const X = (n: number) => pad + ((n - minX) / (maxX - minX)) * (w - pad - 18),
    Y = (n: number) => {
      const ratio = (n - (minY - margin)) / (maxY - minY + 2 * margin);
      return invert ? 22 + ratio * (h - 68) : h - pad - ratio * (h - 68);
    };
  const s = svg("svg", {
    viewBox: `0 0 ${w} ${h}`,
    class: "chart",
    role: "img",
    "aria-label": label,
  });
  const title = svg("title");
  title.textContent = label;
  s.append(title);
  for (let i = 0; i < 3; i++) {
    const value = minY + ((maxY - minY) * i) / 2,
      y = Y(value);
    s.append(
      svg("line", { x1: pad, y1: y, x2: w - 18, y2: y, class: "gridline" }),
    );
    const text = svg("text", { x: 2, y: y + 4 });
    text.textContent = format(value);
    s.append(text);
  }
  let path = "",
    start = true;
  for (const point of points) {
    if (point.y === null) {
      start = true;
      continue;
    }
    path +=
      (start ? "M" : "L") +
      X(point.x).toFixed(1) +
      " " +
      Y(point.y).toFixed(1) +
      " ";
    start = false;
  }
  s.append(svg("path", { d: path, class: "line" }));
  for (const p of valid) {
    const dot = svg("circle", { cx: X(p.x), cy: Y(p.y), r: 3, class: "dot" }),
      t = svg("title");
    t.textContent = `${xLabel.startsWith("Run") ? date(new Date(p.x).toISOString()) : p.x.toFixed(1)}: ${format(p.y)}`;
    dot.append(t);
    s.append(dot);
  }
  const text = svg("text", { x: w / 2, y: h - 8, "text-anchor": "middle" });
  text.textContent = xLabel;
  s.append(text);
  for (const [x, anchor, value] of [
    [pad, "start", minX],
    [w - 18, "end", maxX],
  ] as const) {
    const tick = svg("text", { x, y: h - 27, "text-anchor": anchor });
    tick.textContent = xLabel.includes("dates")
      ? new Date(value).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        })
      : value.toFixed(0) + " min";
    s.append(tick);
  }
  container.append(s);
  return container;
}
function showTrends(body: HTMLElement) {
  const latest = runs[0];
  if (latest) {
    const m = latest.metrics,
      matches = runs.filter(
        (r) =>
          r.id !== latest.id &&
          Date.parse(r.end) < Date.parse(latest.start) &&
          Date.parse(latest.start) - Date.parse(r.start) < 90 * 86400000 &&
          r.indoor === latest.indoor &&
          m.distanceMeters !== null &&
          r.metrics.distanceMeters !== null &&
          Math.abs(r.metrics.distanceMeters - m.distanceMeters) <=
            m.distanceMeters * 0.2 &&
          m.averageHeartRate !== null &&
          r.metrics.averageHeartRate !== null &&
          Math.abs(r.metrics.averageHeartRate - m.averageHeartRate) <= 10 &&
          m.heartRateCoverage >= 0.5 &&
          r.metrics.heartRateCoverage >= 0.5,
      );
    const paces = matches
      .map((r) => r.metrics.averagePaceSecondsPerKm)
      .filter((n): n is number => n !== null && n > 0);
    if (
      matches.length >= 5 &&
      paces.length &&
      m.averagePaceSecondsPerKm !== null
    ) {
      const average = paces.reduce((a, b) => a + b, 0) / paces.length,
        change = ((m.averagePaceSecondsPerKm - average) / average) * 100;
      body.append(
        notice(
          `${Math.abs(change).toFixed(1)}% ${change < 0 ? "faster" : "slower"} pace than ${matches.length} prior runs of similar distance, setting, and heart rate. Weather, terrain, and effort still influence this comparison.`,
        ),
      );
    } else
      body.append(
        notice(
          `Building your baseline. At least five comparable runs with sufficient heart-rate coverage are needed before showing a pace trend. You have ${matches.length}.`,
        ),
      );
  }
  const list = filtered().slice().reverse(),
    grid = el("div", undefined, "grid");
  for (const [key, label, format, invert] of [
    [
      "distanceMeters",
      "Distance",
      (n: number | null) => distance(n) + " " + distanceUnit(),
      false,
    ],
    ["averagePaceSecondsPerKm", "Average pace", pace, true],
    [
      "averageHeartRate",
      "Average heart rate",
      (n: number | null) => number(n) + " bpm",
      false,
    ],
  ] as const) {
    const p = panel(label);
    p.append(
      chart(
        list.map((r) => ({ x: Date.parse(r.start), y: r.metrics[key] })),
        format,
        "Run dates",
        label + " across runs",
        invert,
      ),
    );
    grid.append(p);
  }
  const endurance = panel("Cardiovascular endurance"),
    ms = measurements.filter(
      (m) =>
        m.kind === "vo2Max" &&
        (period === "all" ||
          Date.parse(m.measuredAt) >= Date.now() - Number(period) * 86400000),
    );
  endurance.append(
    chart(
      ms.map((m) => ({ x: Date.parse(m.measuredAt), y: m.value })),
      (v) => number(v, 1),
      "Run / measurement dates",
      "Recorded VO₂ max measurements",
    ),
  );
  endurance.append(
    el(
      "p",
      "VO₂ max and one-minute recovery are shown only when Apple Health recorded them. Different conditions can change pace and heart rate; a single run does not establish an endurance trend.",
      "small subtle",
    ),
  );
  grid.append(endurance);
  body.append(grid);
  const dates = panel("Dated endurance measurements");
  dates.append(
    table(
      ["Date", "Measurement", "Value"],
      measurements
        .filter(
          (m) =>
            period === "all" ||
            Date.parse(m.measuredAt) >= Date.now() - Number(period) * 86400000,
        )
        .slice()
        .reverse()
        .map((m) => [
          date(m.measuredAt),
          m.kind === "vo2Max" ? "VO₂ max" : "One-minute heart-rate recovery",
          number(m.value, 1) + (m.kind === "vo2Max" ? " ml/kg/min" : " bpm"),
        ]),
    ),
  );
  body.append(dates);
}
function routeSurface(points: Route[], label: string) {
  const w = 560,
    h = 330,
    pad = 25,
    latitude = points.reduce((n, p) => n + p.latitude, 0) / points.length,
    cos = Math.cos((latitude * Math.PI) / 180);
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.longitude * cos);
    maxX = Math.max(maxX, p.longitude * cos);
    minY = Math.min(minY, p.latitude);
    maxY = Math.max(maxY, p.latitude);
  }
  const factor = Math.min(
    (w - 2 * pad) / Math.max(maxX - minX, 0.0001),
    (h - 2 * pad) / Math.max(maxY - minY, 0.0001),
  );
  const project = (p: Route) => ({
    x: w / 2 + (p.longitude * cos - (maxX + minX) / 2) * factor,
    y: h / 2 - (p.latitude - (maxY + minY) / 2) * factor,
  });
  const s = svg("svg", {
    viewBox: `0 0 ${w} ${h}`,
    class: "map",
    role: "img",
    "aria-label": label,
  });
  for (let x = 0; x < w; x += 40)
    s.append(svg("line", { x1: x, y1: 0, x2: x, y2: h, stroke: "#1d2735" }));
  for (let y = 0; y < h; y += 40)
    s.append(svg("line", { x1: 0, y1: y, x2: w, y2: y, stroke: "#1d2735" }));
  return { s, project };
}
function drawRoute(r: Run, box: HTMLElement, mode: string) {
  box.replaceChildren();
  if (!r.route?.length) {
    box.append(
      el(
        "p",
        prefs.gpsEnabled
          ? "No route available for this run. Indoor workouts and runs without GPS still show their recorded measurements."
          : "GPS sharing is off. Enable the separate GPS consent in the iPhone app to see routes here.",
        "empty",
      ),
    );
    return;
  }
  const points = r.route,
    { s, project } = routeSurface(points, "Running route colored by " + mode),
    values = points
      .map((p) => (mode === "heart" ? p.heartRate : p.paceSecondsPerKm))
      .filter((n): n is number => n !== null && n > 0),
    min = Math.min(...values),
    max = Math.max(min + 1, ...values);
  const color = (n: number | null) => {
    if (n === null || n <= 0 || !values.length) return "#66758a";
    const ratio = (n - min) / (max - min);
    return ratio < 0.33 ? "#619fff" : ratio < 0.67 ? "#74d6ae" : "#f2b468";
  };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    if (a.segment !== b.segment) continue;
    const A = project(a),
      B = project(b);
    s.append(
      svg("line", {
        x1: A.x,
        y1: A.y,
        x2: B.x,
        y2: B.y,
        stroke: color(mode === "heart" ? b.heartRate : b.paceSecondsPerKm),
        "stroke-width": 3.5,
        "stroke-linecap": "round",
      }),
    );
  }
  for (const [p, label, c] of [
    [points[0]!, "Start", "#74d6ae"],
    [points.at(-1)!, "End", "#f2b468"],
  ] as const) {
    const a = project(p),
      dot = svg("circle", {
        cx: a.x,
        cy: a.y,
        r: 6,
        fill: c,
        stroke: "#0f151e",
        "stroke-width": 2,
      }),
      title = svg("title");
    title.textContent = label;
    dot.append(title);
    s.append(dot);
  }
  box.append(s);
  const legend = el("div", undefined, "legend");
  legend.append(
    el(
      "span",
      values.length
        ? mode === "heart"
          ? number(min) + " bpm"
          : pace(min) + " / " + distanceUnit()
        : "Unavailable",
    ),
    el("span", undefined, "gradient"),
    el(
      "span",
      values.length
        ? mode === "heart"
          ? number(max) + " bpm"
          : pace(max) + " / " + distanceUnit()
        : "Unavailable",
    ),
    el("span", "Green marker: start · Amber: end · Gray: missing data"),
  );
  box.append(
    legend,
    el(
      "p",
      "Route shape · Paths are simplified; GPS gaps and pauses are kept separate.",
      "small subtle",
    ),
  );
}
function showRoutes(body: HTMLElement) {
  const p = panel("Where you run"),
    box = el("div");
  p.append(
    el(
      "p",
      "A history density map counts each route traversal once per 100-meter cell, so stationary GPS samples do not inflate popular areas.",
      "subtle",
    ),
    box,
  );
  body.append(p);
  if (!prefs.gpsEnabled) {
    box.append(
      notice(
        "GPS sharing is off. Routes stay on your iPhone unless you separately consent to upload them.",
      ),
    );
    return;
  }
  const list = filtered().filter((r) => r.hasRoute);
  box.append(
    el(
      "p",
      `${list.length} shared routes in this range. Load a page of up to 100 routes to explore their density.`,
      "subtle",
    ),
  );
  let next = 0;
  const loaded: Run[] = [];
  const b = button(
    "Load route map",
    () => {
      void update();
    },
    "primary",
  );
  box.append(b);
  const map = el("div");
  box.append(map);
  async function update() {
    b.disabled = true;
    try {
      for (const r of list.slice(next, next + 100)) {
        loaded.push(await getRun(r.id));
        next++;
        if (!box.isConnected) return;
      }
      map.replaceChildren(density(loaded));
      b.textContent =
        next < list.length ? "Load next 100 routes" : "All routes loaded";
      b.disabled = next >= list.length;
    } catch (error) {
      map.append(notice((error as Error).message, true));
      b.disabled = false;
      if (!session) signIn((error as Error).message);
    }
  }
}
function density(records: Run[]) {
  const box = el("div"),
    points = records.flatMap((r) => r.route ?? []);
  if (!points.length) {
    box.append(el("p", "No routes available.", "empty"));
    return box;
  }
  const { s, project } = routeSurface(
      points,
      "History density of route traversals",
    ),
    lat = points[0]!.latitude,
    cos = Math.cos((lat * Math.PI) / 180),
    cells = new Map<string, { point: Route; count: number }>();
  for (const r of records) {
    const seen = new Map<string, Route>(),
      route = r.route ?? [];
    for (let i = 0; i < route.length; i++) {
      const p = route[i]!,
        a = route[i - 1],
        dx =
          a && a.segment === p.segment
            ? (p.longitude - a.longitude) * 111320 * cos
            : 0,
        dy =
          a && a.segment === p.segment ? (p.latitude - a.latitude) * 111320 : 0,
        steps = Math.min(100, Math.max(1, Math.ceil(Math.hypot(dx, dy) / 25)));
      for (let k = 1; k <= steps; k++) {
        const point = {
          ...p,
          latitude:
            dy && a
              ? a.latitude + ((p.latitude - a.latitude) * k) / steps
              : p.latitude,
          longitude:
            dx && a
              ? a.longitude + ((p.longitude - a.longitude) * k) / steps
              : p.longitude,
        };
        seen.set(
          Math.floor((point.longitude * 111320 * cos) / 100) +
            ":" +
            Math.floor((point.latitude * 111320) / 100),
          point,
        );
      }
    }
    for (const [key, point] of seen) {
      const old = cells.get(key);
      cells.set(key, { point, count: (old?.count ?? 0) + 1 });
    }
  }
  const max = Array.from(cells.values()).reduce(
    (m, v) => Math.max(m, v.count),
    1,
  );
  for (const c of cells.values()) {
    const p = project(c.point),
      circle = svg("circle", {
        cx: p.x,
        cy: p.y,
        r: 5,
        fill:
          c.count / max > 0.66
            ? "#f2b468"
            : c.count / max > 0.33
              ? "#74d6ae"
              : "#619fff",
        opacity: 0.7,
      }),
      title = svg("title");
    title.textContent = c.count + " route traversals";
    circle.append(title);
    s.append(circle);
  }
  box.append(
    s,
    el(
      "p",
      `${records.length} routes loaded · Blue: fewer traversals · Amber: more · Each cell is approximately 100 meters.`,
      "legend",
    ),
  );
  return box;
}
void load();
