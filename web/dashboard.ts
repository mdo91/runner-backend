import { localize, dashboardLanguage, locale } from "./localization.js";
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
    language?: "en" | "de";
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
  view = localize("Dashboard.Copy.latestRun.text"),
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
  new Date(raw).toLocaleDateString(locale, {
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
  n === null ? "—" : (n / scale()).toLocaleString(locale, {minimumFractionDigits:2,maximumFractionDigits:2});
const pace = (n: number | null) =>
  n === null || n <= 0 ? "—" : duration((n * scale()) / 1000);
const number = (n: number | null, precision = 0) =>
  n === null ? "—" : n.toLocaleString(locale, {minimumFractionDigits:precision,maximumFractionDigits:precision});
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
        localize("Dashboard.Copy.yourSessionEndedApproveANewCodeIn.text"),
      );
    }
    throw new Error(
      result.status === 429
        ? localize("Dashboard.Copy.pleaseWaitAMinuteAndTryAgain.text")
        : result.status === 404
          ? localize("Dashboard.Copy.thisRunOrSignInCodeIsNo.text")
          : localize("Dashboard.Copy.theDashboardCouldNotLoadCheckYourConnection.text"),
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
    el("h1", localize("Dashboard.Copy.yourRunsOnePlace.text")),
    el(
      "p",
      localize("Dashboard.Copy.seeTheSameMeasuredPerformanceAsRunnerOn.text"),
      "subtle",
    ),
  );
  const panel = el("section", undefined, "panel");
  panel.append(
    el("h2", localize("Dashboard.Copy.signInWithYourIPhone.text")),
    el(
      "p",
      localize("Dashboard.Copy.signInWithAppleInRunnerThenOpen.text"),
      "subtle",
    ),
  );
  const b = button(
    localize("Dashboard.Copy.getASignInCode.text"),
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
      localize("Dashboard.Copy.historyAndPreciseGPSUploadsAreSeparateOpt.text"),
      "footer",
    ),
  );
  app.append(box);
}
function brand() {
  const b = el("div", undefined, "brand");
  b.append(el("span", "R", "mark"), el("span", localize("Dashboard.Copy.runner.text")));
  const language = el("a", dashboardLanguage === "de" ? "English" : "Deutsch");
  const destination = new URL(location.href);
  destination.searchParams.set("lang", dashboardLanguage === "de" ? "en" : "de");
  language.href = destination.toString();
  language.hreflang = dashboardLanguage === "de" ? "en" : "de";
  b.append(language);
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
      el("h2", localize("Dashboard.Copy.approveThisBrowserInRunner.text")),
      el("div", pair.code.slice(0, 5) + " " + pair.code.slice(5), "code"),
      el(
        "p",
        localize("Dashboard.Copy.openConnectDashboardOnYourIPhoneAndEnter.text"),
        "subtle",
      ),
      el(
        "p",
        localize("Dashboard.Copy.codeExpiresIn10MinutesWaitingForApproval.text"),
        "small subtle",
      ),
    );
    const poll = async () => {
      if (version !== generation) return;
      try {
        if (Date.now() >= Date.parse(pair.expiresAt))
          throw new Error(localize("Dashboard.Copy.theCodeExpiredGetANewCodeTo.text"));
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
  app.replaceChildren(el("main", localize("Dashboard.Copy.loadingYourRunningHistory.text"), "loading"));
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
      app.firstElementChild!.textContent = localize("Dashboard.Format.loadedRuns.text", all.length);
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
        button(localize("Dashboard.Copy.retry.text"), () => {
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
  nav.setAttribute("aria-label", localize("Dashboard.Copy.dashboard.text"));
  side.append(brand());
  for (const item of [localize("Dashboard.Copy.latestRun.text"), localize("Dashboard.Copy.history.text"), localize("Dashboard.Copy.trends.text"), localize("Dashboard.Copy.routes.text")]) {
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
        ? localize("Dashboard.Copy.historySyncEnabledOnIPhone.text")
        : localize("Dashboard.Copy.historySyncPausedSavedDataRemainsAvailable.text"),
      "sidefooter",
    ),
  );
  shell.append(side);
  const content = el("main", undefined, "content"),
    head = el("header", undefined, "topbar"),
    title = el("div");
  title.append(
    el("div", localize("Dashboard.Copy.rUNNERYOURPERFORMANCE.text"), "eyebrow"),
    el("h1", selected ? localize("Dashboard.Copy.runDetails.text") : view),
    el(
      "p",
      view === localize("Dashboard.Copy.latestRun.text")
        ? localize("Dashboard.Copy.yourLatestImportedRunMeasuredFromAppleHealth.text")
        : localize("Dashboard.Copy.aClearerViewOfTheWorkYouVe.text"),
      "subtle",
    ),
  );
  const actions = el("div", undefined, "row");
  actions.append(
    selector(
      localize("Dashboard.Copy.units.text"),
      [
        ["metric", localize("Dashboard.Copy.kilometers.text")],
        ["imperial", localize("Dashboard.Copy.miles.text")],
      ],
      unit,
      (v) => {
        unit = v;
        render();
      },
    ),
    button(localize("Dashboard.Copy.refresh.text"), () => {
      details.clear();
      void load();
    }),
    button(localize("Dashboard.Copy.signOut.text"), () => {
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
        localize("Dashboard.Copy.syncIsPausedEnableSyncRunningHistoryIn.text"),
      ),
    );
  if (!runs.length) {
    body.append(
      el(
        "div",
        localize("Dashboard.Copy.noSyncedRunsYetInTheIPhoneApp.text"),
        "empty",
      ),
    );
  } else if (selected || view === localize("Dashboard.Copy.latestRun.text")) {
    if (selected)
      body.append(
        button(
          localize("Dashboard.Copy.backToHistory.text"),
          () => {
            selected = null;
            view = localize("Dashboard.Copy.history.text");
            render();
          },
          "back",
        ),
      );
    void showRun(selected ?? runs[0]!.id, body);
  } else {
    body.append(
      selector(
        localize("Dashboard.Copy.dateRange.text"),
        [
          ["all", localize("Dashboard.Copy.allHistory.text")],
          ["30", localize("Dashboard.Copy.last30Days.text")],
          ["90", localize("Dashboard.Copy.last90Days.text")],
          ["365", localize("Dashboard.Copy.lastYear.text")],
        ],
        period,
        (v) => {
          period = v;
          render();
        },
      ),
    );
    if (view === localize("Dashboard.Copy.history.text")) showHistory(body);
    else if (view === localize("Dashboard.Copy.trends.text")) showTrends(body);
    else showRoutes(body);
  }
  content.append(
    el(
      "footer",
      localize("Dashboard.Copy.healthKitProvidesTheRecordedMeasurementsMissingValuesStay.text"),
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
    card(localize("Dashboard.Copy.runs.text"), String(list.length)),
    card(localize("Dashboard.Copy.recordedDistance.text"), distance(total), distanceUnit()),
    card(localize("Dashboard.Copy.movingTime.text"), duration(moving)),
    card(localize("Dashboard.Copy.routeRecordings.text"), String(list.filter((r) => r.hasRoute).length)),
  );
  body.append(cards);
  const p = panel(localize("Dashboard.Copy.runningHistory.text"));
  p.append(
    table(
      [
        localize("Dashboard.Copy.run.text"),
        localize("Dashboard.Copy.distance.text"),
        localize("Dashboard.Copy.movingTime.text"),
        localize("Dashboard.Copy.pace.text") + distanceUnit(),
        localize("Dashboard.Copy.heartRate.text"),
        localize("Dashboard.Copy.source.text"),
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
      localize("Dashboard.Format.rangeRuns.text", list.length),
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
    throw new Error(localize("Dashboard.Copy.yourSessionChangedReloadThisView.text"));
  details.set(id, r);
  return r;
}
async function showRun(id: string, body: HTMLElement) {
  const placeholder = el("p", localize("Dashboard.Copy.loadingRunDetails.text"), "subtle");
  body.append(placeholder);
  try {
    const r = await getRun(id);
    if (!body.isConnected) return;
    placeholder.remove();
    body.append(
      el(
        "div",
        date(r.start) + " · " + r.source + (r.indoor ? localize("Dashboard.Copy.indoorRun.text") : ""),
        "subtle",
      ),
    );
    const cards = el("div", undefined, "cards");
    cards.append(
      card(localize("Dashboard.Copy.distance.text"), distance(r.metrics.distanceMeters), distanceUnit()),
      card(
        localize("Dashboard.Copy.movingTime.text"),
        duration(r.metrics.movingSeconds),
        "",
        localize("Dashboard.Format.elapsed.text", duration(r.metrics.elapsedSeconds)),
      ),
      card(
        localize("Dashboard.Copy.averagePace.text"),
        pace(r.metrics.averagePaceSecondsPerKm),
        "/ " + distanceUnit(),
      ),
      card(
        localize("Dashboard.Copy.averageHeartRate.text"),
        number(r.metrics.averageHeartRate),
        localize("Dashboard.Copy.bpm.text"),
        localize("Dashboard.Format.coverage.text", Math.round(r.metrics.heartRateCoverage * 100)),
      ),
    );
    body.append(cards);
    const grid = el("div", undefined, "grid"),
      heart = panel(localize("Dashboard.Copy.heartRate.text")),
      pacing = panel(localize("Dashboard.Copy.pace2.text"));
    heart.append(
      chart(
        r.series.map((p) => ({ x: p.t / 60, y: p.heartRate })),
        (v) => number(v) + " bpm",
        localize("Dashboard.Copy.minutesIntoRun.text"),
        localize("Dashboard.Copy.recordedHeartRateDuringThisRun.text"),
      ),
    );
    pacing.append(
      chart(
        r.series.map((p) => ({ x: p.t / 60, y: p.paceSecondsPerKm })),
        pace,
        localize("Dashboard.Copy.minutesIntoRun.text"),
        localize("Dashboard.Copy.recordedPaceDuringThisRun.text"),
        true,
      ),
    );
    grid.append(heart, pacing);
    const route = panel(localize("Dashboard.Copy.route.text")),
      mapBox = el("div");
    route.append(mapBox);
    if (r.route?.length)
      route.append(
        selector(
          localize("Dashboard.Copy.colorBy.text"),
          [
            ["pace", localize("Dashboard.Copy.pace2.text")],
            ["heart", localize("Dashboard.Copy.heartRate.text")],
          ],
          "pace",
          (v) => drawRoute(r, mapBox, v),
        ),
      );
    drawRoute(r, mapBox, "pace");
    const stats = panel(localize("Dashboard.Copy.performance.text"));
    stats.append(
      table(
        [localize("Dashboard.Copy.measurement.text"), localize("Dashboard.Copy.recordedValue.text")],
        [
          [localize("Dashboard.Copy.activeEnergy.text"), number(r.metrics.activeEnergyKcal) + " kcal"],
          [
            localize("Dashboard.Copy.elevationGain.text"),
            r.metrics.elevationGainMeters === null
              ? "—"
              : unit === "metric"
                ? number(r.metrics.elevationGainMeters) + " m"
                : number(r.metrics.elevationGainMeters * 3.28084) + " ft",
          ],
          [localize("Dashboard.Copy.maximumHeartRate.text"), number(r.metrics.maxHeartRate) + " bpm"],
          [
            localize("Dashboard.Copy.pacingVariation.text"),
            r.metrics.pacingCoefficientOfVariation === null
              ? localize("Dashboard.Copy.insufficientSplits.text")
              : number(r.metrics.pacingCoefficientOfVariation * 100, 1) + "%",
          ],
          [
            localize("Dashboard.Copy.heartRateCoverage.text"),
            number(r.metrics.heartRateCoverage * 100) + "%",
          ],
        ],
      ),
    );
    grid.append(route, stats);
    body.append(grid);
    const splits = panel(localize("Dashboard.Copy.splits.text"));
    if (r.splits.length)
      splits.append(
        table(
          [
            localize("Dashboard.Copy.split.text"),
            localize("Dashboard.Copy.distance.text"),
            localize("Dashboard.Copy.movingTime.text"),
            localize("Dashboard.Copy.pace.text") + distanceUnit(),
            localize("Dashboard.Copy.heartRate.text"),
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
          localize("Dashboard.Copy.measuredKilometerSplitsDisplayedInYourSelectedUnits.text"),
        ),
      );
    else
      splits.append(
        el(
          "p",
          localize("Dashboard.Copy.distanceSamplesAreNotAvailableToCalculateSplits.text"),
          "subtle",
        ),
      );
    body.append(splits);
    const dynamic = el("div", undefined, "grid");
    for (const [key, label, suffix, factor] of [
      ["powerWatts", localize("Dashboard.Copy.runningPower.text"), "W", 1],
      ["strideMeters", localize("Dashboard.Copy.strideLength.text"), "m", 1],
      ["groundContactMilliseconds", localize("Dashboard.Copy.groundContact.text"), "ms", 1],
      ["verticalOscillationMeters", localize("Dashboard.Copy.verticalOscillation.text"), "cm", 100],
    ] as const) {
      if (!r.series.some((p) => p[key] !== null)) continue;
      const p = panel(label);
      p.append(
        chart(
          r.series.map((p) => ({
            x: p.t / 60,
            y: p[key] === null ? null : p[key]! * factor,
          })),
          (v) => number(v, label === localize("Dashboard.Copy.strideLength.text") ? 2 : 0) + " " + suffix,
          localize("Dashboard.Copy.minutesIntoRun.text"),
          label,
        ),
      );
      dynamic.append(p);
    }
    if (dynamic.childElementCount) body.append(dynamic);
    const ai = panel(localize("Dashboard.Copy.runAssessment.text"));
    if (r.report) {
      if ((r.report.language ?? "en") !== dashboardLanguage) ai.append(el("p", localize("Dashboard.Analysis.languageNotice.text"), "small subtle"));
      ai.append(el("p", r.report.explanation.summary, "subtle"));
      for (const insight of r.report.explanation.insights) {
        const block = el("div", undefined, "ai-insight");
        block.append(
          el("h3", insight.title),
          el("p", insight.detail),
          el("p", localize("Dashboard.Copy.basedOn.text") + insight.evidence.map(evidenceLabel).join(", "), "small subtle"),
        );
        ai.append(block);
      }
      ai.append(
        el("p", r.report.endurance.detail, "subtle"),
        el("h3", localize("Dashboard.Copy.nextRun.text")),
        el("p", r.report.explanation.nextRun, "subtle"),
        el("p", localize("Dashboard.Copy.aIReport.text") + date(r.report.generatedAt), "small subtle"),
      );
      for (const missing of r.report.missingData)
        ai.append(el("p", missing, "small subtle"));
    } else
      ai.append(
        el(
          "p",
          localize("Dashboard.Copy.noAIReportHasBeenSyncedForThis.text"),
          "subtle",
        ),
      );
    body.append(ai);
    const disclosure = el("details", undefined, "details");
    disclosure.append(
      el("summary", localize("Dashboard.Copy.viewChartData.text")),
      table(
        [
          localize("Dashboard.Copy.minutes.text"),
          localize("Dashboard.Copy.heartRateBpm.text"),
          localize("Dashboard.Copy.pace.text") + distanceUnit(),
          localize("Dashboard.Copy.powerW.text"),
          localize("Dashboard.Copy.strideM.text"),
        ],
        r.series.map((p) => [
          number(p.t / 60, 1),
          number(p.heartRate),
          pace(p.paceSecondsPerKm),
          number(p.powerWatts),
          number(p.strideMeters, 2),
        ]),
        localize("Dashboard.Copy.chartsUseTimeBinnedSummariesGapsIndicateUnavailable.text"),
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
    container.append(el("p", localize("Dashboard.Copy.noRecordedMeasurementsAvailable.text"), "empty"));
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
    t.textContent = `${xLabel.startsWith(localize("Dashboard.Copy.run.text")) ? date(new Date(p.x).toISOString()) : number(p.x, 1)}: ${format(p.y)}`;
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
    tick.textContent = (xLabel === localize("Dashboard.Copy.runDates.text") || xLabel === localize("Dashboard.Copy.runMeasurementDates.text"))
      ? new Date(value).toLocaleDateString(locale, {
          day: "numeric",
          month: "short",
        })
      : number(value) + " min";
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
          localize("Dashboard.Format.paceComparison.text", number(Math.abs(change), 1), change < 0 ? localize("Dashboard.Copy.faster.text") : localize("Dashboard.Copy.slower.text"), matches.length),
        ),
      );
    } else
      body.append(
        notice(
          localize("Dashboard.Format.baseline.text", matches.length),
        ),
      );
  }
  const list = filtered().slice().reverse(),
    grid = el("div", undefined, "grid");
  for (const [key, label, format, invert] of [
    [
      "distanceMeters",
      localize("Dashboard.Copy.distance.text"),
      (n: number | null) => distance(n) + " " + distanceUnit(),
      false,
    ],
    ["averagePaceSecondsPerKm", localize("Dashboard.Copy.averagePace.text"), pace, true],
    [
      "averageHeartRate",
      localize("Dashboard.Copy.averageHeartRate.text"),
      (n: number | null) => number(n) + " bpm",
      false,
    ],
  ] as const) {
    const p = panel(label);
    p.append(
      chart(
        list.map((r) => ({ x: Date.parse(r.start), y: r.metrics[key] })),
        format,
        localize("Dashboard.Copy.runDates.text"),
        label + localize("Dashboard.Copy.acrossRuns.text"),
        invert,
      ),
    );
    grid.append(p);
  }
  const endurance = panel(localize("Dashboard.Copy.cardiovascularEndurance.text")),
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
      localize("Dashboard.Copy.runMeasurementDates.text"),
      localize("Dashboard.Copy.recordedVOMaxMeasurements.text"),
    ),
  );
  endurance.append(
    el(
      "p",
      localize("Dashboard.Copy.vOMaxAndOneMinuteRecoveryAreShown.text"),
      "small subtle",
    ),
  );
  grid.append(endurance);
  body.append(grid);
  const dates = panel(localize("Dashboard.Copy.datedEnduranceMeasurements.text"));
  dates.append(
    table(
      [localize("Dashboard.Copy.date.text"), localize("Dashboard.Copy.measurement.text"), localize("Dashboard.Copy.value.text")],
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
          m.kind === "vo2Max" ? localize("Dashboard.Copy.vOMax.text") : localize("Dashboard.Copy.oneMinuteHeartRateRecovery.text"),
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
          ? localize("Dashboard.Copy.noRouteAvailableForThisRunIndoorWorkouts.text")
          : localize("Dashboard.Copy.gPSSharingIsOffEnableTheSeparateGPS.text"),
        "empty",
      ),
    );
    return;
  }
  const points = r.route,
    { s, project } = routeSurface(points, localize("Dashboard.Copy.runningRouteColoredBy.text") + (mode === "heart" ? localize("Dashboard.Copy.heartRate.text") : localize("Dashboard.Copy.pace.text"))),
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
    [points[0]!, localize("Dashboard.Copy.start.text"), "#74d6ae"],
    [points.at(-1)!, localize("Dashboard.Copy.end.text"), "#f2b468"],
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
        : localize("Dashboard.Copy.unavailable.text"),
    ),
    el("span", undefined, "gradient"),
    el(
      "span",
      values.length
        ? mode === "heart"
          ? number(max) + " bpm"
          : pace(max) + " / " + distanceUnit()
        : localize("Dashboard.Copy.unavailable.text"),
    ),
    el("span", localize("Dashboard.Copy.greenMarkerStartAmberEndGrayMissingData.text")),
  );
  box.append(
    legend,
    el(
      "p",
      localize("Dashboard.Copy.routeShapePathsAreSimplifiedGPSGapsAnd.text"),
      "small subtle",
    ),
  );
}
function showRoutes(body: HTMLElement) {
  const p = panel(localize("Dashboard.Copy.whereYouRun.text")),
    box = el("div");
  p.append(
    el(
      "p",
      localize("Dashboard.Copy.aHistoryDensityMapCountsEachRouteTraversal.text"),
      "subtle",
    ),
    box,
  );
  body.append(p);
  if (!prefs.gpsEnabled) {
    box.append(
      notice(
        localize("Dashboard.Copy.gPSSharingIsOffRoutesStayOnYour.text"),
      ),
    );
    return;
  }
  const list = filtered().filter((r) => r.hasRoute);
  box.append(
    el(
      "p",
      localize("Dashboard.Format.sharedRoutes.text", list.length),
      "subtle",
    ),
  );
  let next = 0;
  const loaded: Run[] = [];
  const b = button(
    localize("Dashboard.Copy.loadRouteMap.text"),
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
        next < list.length ? localize("Dashboard.Copy.loadNext100Routes.text") : localize("Dashboard.Copy.allRoutesLoaded.text");
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
    box.append(el("p", localize("Dashboard.Copy.noRoutesAvailable.text"), "empty"));
    return box;
  }
  const { s, project } = routeSurface(
      points,
      localize("Dashboard.Copy.historyDensityOfRouteTraversals.text"),
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
    title.textContent = c.count + localize("Dashboard.Copy.routeTraversals.text");
    circle.append(title);
    s.append(circle);
  }
  box.append(
    s,
    el(
      "p",
      localize("Dashboard.Format.loadedRoutes.text", records.length),
      "legend",
    ),
  );
  return box;
}
void load();

function evidenceLabel(key: string): string {
  const labels: Record<string, [string, string]> = {
  "distanceMeters": [
    "distance",
    "Distanz"
  ],
  "movingSeconds": [
    "moving time",
    "Bewegungszeit"
  ],
  "averagePaceSecondsPerKm": [
    "average pace",
    "Durchschnittstempo"
  ],
  "averageHeartRate": [
    "average heart rate",
    "durchschnittliche Herzfrequenz"
  ],
  "maxHeartRate": [
    "maximum heart rate",
    "maximale Herzfrequenz"
  ],
  "pacingCoefficientOfVariation": [
    "pacing variation",
    "Temposchwankung"
  ],
  "heartRateCoverage": [
    "heart-rate coverage",
    "Herzfrequenzabdeckung"
  ],
  "comparableRunCount": [
    "comparable runs",
    "vergleichbare Läufe"
  ],
  "paceChangePercent": [
    "pace change",
    "Tempoänderung"
  ],
  "vo2Max": [
    "recorded VO₂ max",
    "aufgezeichnete VO₂max"
  ],
  "previousVo2Max": [
    "previous VO₂ max",
    "vorherige VO₂max"
  ],
  "recoveryBpm": [
    "heart-rate recovery",
    "Herzfrequenzerholung"
  ]
};
  return labels[key]?.[dashboardLanguage === "de" ? 1 : 0] ?? (dashboardLanguage === "de" ? "Messwert" : "measurement");
}
