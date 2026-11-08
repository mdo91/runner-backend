export const dashboardLanguage: "en" | "de" = (new URLSearchParams(location.search).get("lang") || navigator.language).toLowerCase().startsWith("de") ? "de" : "en";
export const locale = dashboardLanguage === "de" ? "de-DE" : "en-US";
document.documentElement.lang = dashboardLanguage;
document.title = dashboardLanguage === "de" ? "Runner · Dein Laufverlauf" : "Runner · Your running history";
const messages: Record<string, { en: string; de: string }> = {
  "Dashboard.Copy.latestRun.text": {
    "en": "Latest Run",
    "de": "Letzter Lauf"
  },
  "Dashboard.Copy.yourSessionEndedApproveANewCodeIn.text": {
    "en": "Your session ended. Approve a new code in the iPhone app to sign in.",
    "de": "Deine Sitzung ist beendet. Gib in der iPhone-App einen neuen Code frei, um dich anzumelden."
  },
  "Dashboard.Copy.pleaseWaitAMinuteAndTryAgain.text": {
    "en": "Please wait a minute and try again.",
    "de": "Bitte warte eine Minute und versuche es erneut."
  },
  "Dashboard.Copy.thisRunOrSignInCodeIsNo.text": {
    "en": "This run or sign-in code is no longer available.",
    "de": "Dieser Lauf oder Anmeldecode ist nicht mehr verfügbar."
  },
  "Dashboard.Copy.theDashboardCouldNotLoadCheckYourConnection.text": {
    "en": "The dashboard could not load. Check your connection and try again.",
    "de": "Das Dashboard konnte nicht geladen werden. Prüfe deine Verbindung und versuche es erneut."
  },
  "Dashboard.Copy.yourRunsOnePlace.text": {
    "en": "Your runs. One place.",
    "de": "Deine Läufe. An einem Ort."
  },
  "Dashboard.Copy.seeTheSameMeasuredPerformanceAsRunnerOn.text": {
    "en": "See the same measured performance as Runner on your iPhone, with your history, trends, and shared routes.",
    "de": "Sieh dieselben gemessenen Leistungen wie in Runner auf deinem iPhone – mit Verlauf, Trends und freigegebenen Routen."
  },
  "Dashboard.Copy.signInWithYourIPhone.text": {
    "en": "Sign in with your iPhone",
    "de": "Mit deinem iPhone anmelden"
  },
  "Dashboard.Copy.signInWithAppleInRunnerThenOpen.text": {
    "en": "Sign in with Apple in Runner, then open Settings → Cloud history → Connect dashboard. Enter the code shown here and approve this browser.",
    "de": "Melde dich in Runner mit Apple an und öffne Einstellungen → Cloud-Verlauf → Dashboard verbinden. Gib den hier angezeigten Code ein und gib diesen Browser frei."
  },
  "Dashboard.Copy.getASignInCode.text": {
    "en": "Get a sign-in code",
    "de": "Anmeldecode anfordern"
  },
  "Dashboard.Copy.historyAndPreciseGPSUploadsAreSeparateOpt.text": {
    "en": "History and precise GPS uploads are separate opt-ins in the iPhone app. This browser never requests access to Apple Health.",
    "de": "Verlauf und genaue GPS-Daten werden in der iPhone-App separat freigegeben. Dieser Browser fordert niemals Zugriff auf Apple Health an."
  },
  "Dashboard.Copy.runner.text": {
    "en": "Runner",
    "de": "Runner"
  },
  "Dashboard.Copy.approveThisBrowserInRunner.text": {
    "en": "Approve this browser in Runner",
    "de": "Diesen Browser in Runner freigeben"
  },
  "Dashboard.Copy.openConnectDashboardOnYourIPhoneAndEnter.text": {
    "en": "Open Connect dashboard on your iPhone and enter this code. Approve only if you requested this sign-in.",
    "de": "Öffne „Dashboard verbinden“ auf deinem iPhone und gib diesen Code ein. Bestätige nur, wenn du diese Anmeldung angefordert hast."
  },
  "Dashboard.Copy.codeExpiresIn10MinutesWaitingForApproval.text": {
    "en": "Code expires in 10 minutes. Waiting for approval…",
    "de": "Der Code läuft in 10 Minuten ab. Warten auf Freigabe …"
  },
  "Dashboard.Copy.theCodeExpiredGetANewCodeTo.text": {
    "en": "The code expired. Get a new code to continue.",
    "de": "Der Code ist abgelaufen. Fordere einen neuen Code an."
  },
  "Dashboard.Copy.loadingYourRunningHistory.text": {
    "en": "Loading your running history…",
    "de": "Dein Laufverlauf wird geladen …"
  },
  "Dashboard.Copy.retry.text": {
    "en": "Retry",
    "de": "Erneut versuchen"
  },
  "Dashboard.Copy.dashboard.text": {
    "en": "Dashboard",
    "de": "Dashboard"
  },
  "Dashboard.Copy.history.text": {
    "en": "History",
    "de": "Verlauf"
  },
  "Dashboard.Copy.trends.text": {
    "en": "Trends",
    "de": "Trends"
  },
  "Dashboard.Copy.routes.text": {
    "en": "Routes",
    "de": "Routen"
  },
  "Dashboard.Copy.historySyncEnabledOnIPhone.text": {
    "en": "History sync enabled on iPhone.",
    "de": "Verlaufssynchronisierung auf dem iPhone aktiviert."
  },
  "Dashboard.Copy.historySyncPausedSavedDataRemainsAvailable.text": {
    "en": "History sync paused. Saved data remains available.",
    "de": "Verlaufssynchronisierung pausiert. Gespeicherte Daten bleiben verfügbar."
  },
  "Dashboard.Copy.rUNNERYOURPERFORMANCE.text": {
    "en": "RUNNER / YOUR PERFORMANCE",
    "de": "RUNNER / DEINE LEISTUNG"
  },
  "Dashboard.Copy.runDetails.text": {
    "en": "Run details",
    "de": "Laufdetails"
  },
  "Dashboard.Copy.yourLatestImportedRunMeasuredFromAppleHealth.text": {
    "en": "Your latest imported run, measured from Apple Health.",
    "de": "Dein letzter importierter Lauf mit Messwerten aus Apple Health."
  },
  "Dashboard.Copy.aClearerViewOfTheWorkYouVe.text": {
    "en": "A clearer view of the work you’ve put in.",
    "de": "Dein Einsatz, klar im Blick."
  },
  "Dashboard.Copy.units.text": {
    "en": "Units",
    "de": "Einheiten"
  },
  "Dashboard.Copy.kilometers.text": {
    "en": "Kilometers",
    "de": "Kilometer"
  },
  "Dashboard.Copy.miles.text": {
    "en": "Miles",
    "de": "Meilen"
  },
  "Dashboard.Copy.refresh.text": {
    "en": "Refresh",
    "de": "Aktualisieren"
  },
  "Dashboard.Copy.signOut.text": {
    "en": "Sign out",
    "de": "Abmelden"
  },
  "Dashboard.Copy.syncIsPausedEnableSyncRunningHistoryIn.text": {
    "en": "Sync is paused. Enable “Sync running history” in Runner’s Settings to upload new workouts.",
    "de": "Synchronisierung pausiert. Aktiviere „Laufverlauf synchronisieren“ in den Runner-Einstellungen, um neue Trainings hochzuladen."
  },
  "Dashboard.Copy.noSyncedRunsYetInTheIPhoneApp.text": {
    "en": "No synced runs yet. In the iPhone app, sign in with Apple, consent to history sync, and import your Apple Health workouts. GPS sharing is optional.",
    "de": "Noch keine synchronisierten Läufe. Melde dich in der iPhone-App mit Apple an, stimme der Verlaufssynchronisierung zu und importiere deine Apple-Health-Trainings. GPS-Freigabe ist optional."
  },
  "Dashboard.Copy.backToHistory.text": {
    "en": "← Back to history",
    "de": "← Zurück zum Verlauf"
  },
  "Dashboard.Copy.dateRange.text": {
    "en": "Date range",
    "de": "Zeitraum"
  },
  "Dashboard.Copy.allHistory.text": {
    "en": "All history",
    "de": "Gesamter Verlauf"
  },
  "Dashboard.Copy.last30Days.text": {
    "en": "Last 30 days",
    "de": "Letzte 30 Tage"
  },
  "Dashboard.Copy.last90Days.text": {
    "en": "Last 90 days",
    "de": "Letzte 90 Tage"
  },
  "Dashboard.Copy.lastYear.text": {
    "en": "Last year",
    "de": "Letztes Jahr"
  },
  "Dashboard.Copy.healthKitProvidesTheRecordedMeasurementsMissingValuesStay.text": {
    "en": "HealthKit provides the recorded measurements. Missing values stay unavailable. AI reports are fitness coaching, not a medical diagnosis. Routes are rendered locally in this browser without sending coordinates to a map provider.",
    "de": "HealthKit liefert die aufgezeichneten Messwerte. Fehlende Werte bleiben unverfügbar. KI-Berichte sind Fitnesscoaching, keine medizinische Diagnose. Routen werden lokal im Browser dargestellt, ohne Koordinaten an einen Kartenanbieter zu senden."
  },
  "Dashboard.Copy.runs.text": {
    "en": "Runs",
    "de": "Läufe"
  },
  "Dashboard.Copy.recordedDistance.text": {
    "en": "Recorded distance",
    "de": "Aufgezeichnete Distanz"
  },
  "Dashboard.Copy.movingTime.text": {
    "en": "Moving time",
    "de": "Bewegungszeit"
  },
  "Dashboard.Copy.routeRecordings.text": {
    "en": "Route recordings",
    "de": "Routenaufzeichnungen"
  },
  "Dashboard.Copy.runningHistory.text": {
    "en": "Running history",
    "de": "Laufverlauf"
  },
  "Dashboard.Copy.run.text": {
    "en": "Run",
    "de": "Lauf"
  },
  "Dashboard.Copy.distance.text": {
    "en": "Distance",
    "de": "Distanz"
  },
  "Dashboard.Copy.pace.text": {
    "en": "Pace / ",
    "de": "Tempo / "
  },
  "Dashboard.Copy.heartRate.text": {
    "en": "Heart rate",
    "de": "Herzfrequenz"
  },
  "Dashboard.Copy.source.text": {
    "en": "Source",
    "de": "Quelle"
  },
  "Dashboard.Copy.yourSessionChangedReloadThisView.text": {
    "en": "Your session changed. Reload this view.",
    "de": "Deine Sitzung hat sich geändert. Lade diese Ansicht neu."
  },
  "Dashboard.Copy.loadingRunDetails.text": {
    "en": "Loading run details…",
    "de": "Laufdetails werden geladen …"
  },
  "Dashboard.Copy.indoorRun.text": {
    "en": " · Indoor run",
    "de": " · Indoor-Lauf"
  },
  "Dashboard.Copy.averagePace.text": {
    "en": "Average pace",
    "de": "Durchschnittstempo"
  },
  "Dashboard.Copy.averageHeartRate.text": {
    "en": "Average heart rate",
    "de": "Durchschnittliche Herzfrequenz"
  },
  "Dashboard.Copy.bpm.text": {
    "en": "bpm",
    "de": "Schläge/min"
  },
  "Dashboard.Copy.pace2.text": {
    "en": "Pace",
    "de": "Tempo"
  },
  "Dashboard.Copy.minutesIntoRun.text": {
    "en": "Minutes into run",
    "de": "Minuten seit Laufbeginn"
  },
  "Dashboard.Copy.recordedHeartRateDuringThisRun.text": {
    "en": "Recorded heart rate during this run",
    "de": "Aufgezeichnete Herzfrequenz bei diesem Lauf"
  },
  "Dashboard.Copy.recordedPaceDuringThisRun.text": {
    "en": "Recorded pace during this run",
    "de": "Aufgezeichnetes Tempo bei diesem Lauf"
  },
  "Dashboard.Copy.route.text": {
    "en": "Route",
    "de": "Route"
  },
  "Dashboard.Copy.colorBy.text": {
    "en": "Color by",
    "de": "Einfärben nach"
  },
  "Dashboard.Copy.performance.text": {
    "en": "Performance",
    "de": "Leistung"
  },
  "Dashboard.Copy.measurement.text": {
    "en": "Measurement",
    "de": "Messwert"
  },
  "Dashboard.Copy.recordedValue.text": {
    "en": "Recorded value",
    "de": "Aufgezeichneter Wert"
  },
  "Dashboard.Copy.activeEnergy.text": {
    "en": "Active energy",
    "de": "Aktive Energie"
  },
  "Dashboard.Copy.elevationGain.text": {
    "en": "Elevation gain",
    "de": "Höhengewinn"
  },
  "Dashboard.Copy.maximumHeartRate.text": {
    "en": "Maximum heart rate",
    "de": "Maximale Herzfrequenz"
  },
  "Dashboard.Copy.pacingVariation.text": {
    "en": "Pacing variation",
    "de": "Temposchwankung"
  },
  "Dashboard.Copy.insufficientSplits.text": {
    "en": "Insufficient splits",
    "de": "Zu wenige Zwischenzeiten"
  },
  "Dashboard.Copy.heartRateCoverage.text": {
    "en": "Heart-rate coverage",
    "de": "Herzfrequenzabdeckung"
  },
  "Dashboard.Copy.splits.text": {
    "en": "Splits",
    "de": "Zwischenzeiten"
  },
  "Dashboard.Copy.split.text": {
    "en": "Split",
    "de": "Zwischenzeit"
  },
  "Dashboard.Copy.measuredKilometerSplitsDisplayedInYourSelectedUnits.text": {
    "en": "Measured kilometer splits, displayed in your selected units.",
    "de": "Gemessene Kilometer-Zwischenzeiten in deinen gewählten Einheiten."
  },
  "Dashboard.Copy.distanceSamplesAreNotAvailableToCalculateSplits.text": {
    "en": "Distance samples are not available to calculate splits.",
    "de": "Für die Berechnung von Zwischenzeiten fehlen Distanzmessungen."
  },
  "Dashboard.Copy.runningPower.text": {
    "en": "Running power",
    "de": "Laufleistung"
  },
  "Dashboard.Copy.strideLength.text": {
    "en": "Stride length",
    "de": "Schrittlänge"
  },
  "Dashboard.Copy.groundContact.text": {
    "en": "Ground contact",
    "de": "Bodenkontakt"
  },
  "Dashboard.Copy.verticalOscillation.text": {
    "en": "Vertical oscillation",
    "de": "Vertikale Bewegung"
  },
  "Dashboard.Copy.runAssessment.text": {
    "en": "Run assessment",
    "de": "Laufeinschätzung"
  },
  "Dashboard.Copy.basedOn.text": {
    "en": "Based on: ",
    "de": "Grundlage: "
  },
  "Dashboard.Copy.nextRun.text": {
    "en": "Next run",
    "de": "Nächster Lauf"
  },
  "Dashboard.Copy.aIReport.text": {
    "en": "AI report · ",
    "de": "KI-Bericht · "
  },
  "Dashboard.Copy.noAIReportHasBeenSyncedForThis.text": {
    "en": "No AI report has been synced for this run. You can request one in Runner on your iPhone with AI consent. Your measured stats remain available here.",
    "de": "Für diesen Lauf wurde kein KI-Bericht synchronisiert. Mit KI-Einwilligung kannst du in Runner auf deinem iPhone einen anfordern. Deine gemessenen Werte bleiben hier verfügbar."
  },
  "Dashboard.Copy.viewChartData.text": {
    "en": "View chart data",
    "de": "Diagrammdaten ansehen"
  },
  "Dashboard.Copy.minutes.text": {
    "en": "Minutes",
    "de": "Minuten"
  },
  "Dashboard.Copy.heartRateBpm.text": {
    "en": "Heart rate (bpm)",
    "de": "Herzfrequenz (Schläge/min)"
  },
  "Dashboard.Copy.powerW.text": {
    "en": "Power (W)",
    "de": "Leistung (W)"
  },
  "Dashboard.Copy.strideM.text": {
    "en": "Stride (m)",
    "de": "Schrittlänge (m)"
  },
  "Dashboard.Copy.chartsUseTimeBinnedSummariesGapsIndicateUnavailable.text": {
    "en": "Charts use time-binned summaries. Gaps indicate unavailable data.",
    "de": "Diagramme nutzen zeitlich zusammengefasste Messwerte. Lücken zeigen fehlende Daten."
  },
  "Dashboard.Copy.noRecordedMeasurementsAvailable.text": {
    "en": "No recorded measurements available.",
    "de": "Keine aufgezeichneten Messwerte verfügbar."
  },
  "Dashboard.Copy.faster.text": {
    "en": "faster",
    "de": "schneller"
  },
  "Dashboard.Copy.slower.text": {
    "en": "slower",
    "de": "langsamer"
  },
  "Dashboard.Copy.runDates.text": {
    "en": "Run dates",
    "de": "Laufdaten"
  },
  "Dashboard.Copy.acrossRuns.text": {
    "en": " across runs",
    "de": " über mehrere Läufe"
  },
  "Dashboard.Copy.cardiovascularEndurance.text": {
    "en": "Cardiovascular endurance",
    "de": "Herz-Kreislauf-Ausdauer"
  },
  "Dashboard.Copy.runMeasurementDates.text": {
    "en": "Run / measurement dates",
    "de": "Lauf- / Messdaten"
  },
  "Dashboard.Copy.recordedVOMaxMeasurements.text": {
    "en": "Recorded VO₂ max measurements",
    "de": "Aufgezeichnete VO₂max-Messungen"
  },
  "Dashboard.Copy.vOMaxAndOneMinuteRecoveryAreShown.text": {
    "en": "VO₂ max and one-minute recovery are shown only when Apple Health recorded them. Different conditions can change pace and heart rate; a single run does not establish an endurance trend.",
    "de": "VO₂max und Erholung nach einer Minute werden nur angezeigt, wenn Apple Health sie aufgezeichnet hat. Unterschiedliche Bedingungen können Tempo und Herzfrequenz verändern; ein einzelner Lauf belegt keinen Ausdauertrend."
  },
  "Dashboard.Copy.datedEnduranceMeasurements.text": {
    "en": "Dated endurance measurements",
    "de": "Datierte Ausdauermessungen"
  },
  "Dashboard.Copy.date.text": {
    "en": "Date",
    "de": "Datum"
  },
  "Dashboard.Copy.value.text": {
    "en": "Value",
    "de": "Wert"
  },
  "Dashboard.Copy.vOMax.text": {
    "en": "VO₂ max",
    "de": "VO₂max"
  },
  "Dashboard.Copy.oneMinuteHeartRateRecovery.text": {
    "en": "One-minute heart-rate recovery",
    "de": "Herzfrequenzerholung nach einer Minute"
  },
  "Dashboard.Copy.noRouteAvailableForThisRunIndoorWorkouts.text": {
    "en": "No route available for this run. Indoor workouts and runs without GPS still show their recorded measurements.",
    "de": "Für diesen Lauf ist keine Route verfügbar. Indoor-Trainings und Läufe ohne GPS zeigen weiterhin ihre aufgezeichneten Messwerte."
  },
  "Dashboard.Copy.gPSSharingIsOffEnableTheSeparateGPS.text": {
    "en": "GPS sharing is off. Enable the separate GPS consent in the iPhone app to see routes here.",
    "de": "GPS-Freigabe ist aus. Aktiviere die separate GPS-Einwilligung in der iPhone-App, um hier Routen zu sehen."
  },
  "Dashboard.Copy.runningRouteColoredBy.text": {
    "en": "Running route colored by ",
    "de": "Laufroute eingefärbt nach "
  },
  "Dashboard.Copy.start.text": {
    "en": "Start",
    "de": "Start"
  },
  "Dashboard.Copy.end.text": {
    "en": "End",
    "de": "Ende"
  },
  "Dashboard.Copy.unavailable.text": {
    "en": "Unavailable",
    "de": "Nicht verfügbar"
  },
  "Dashboard.Copy.greenMarkerStartAmberEndGrayMissingData.text": {
    "en": "Green marker: start · Amber: end · Gray: missing data",
    "de": "Grün: Start · Gelb: Ende · Grau: fehlende Daten"
  },
  "Dashboard.Copy.routeShapePathsAreSimplifiedGPSGapsAnd.text": {
    "en": "Route shape · Paths are simplified; GPS gaps and pauses are kept separate.",
    "de": "Routenform · Wege werden vereinfacht; GPS-Lücken und Pausen bleiben getrennt."
  },
  "Dashboard.Copy.whereYouRun.text": {
    "en": "Where you run",
    "de": "Wo du läufst"
  },
  "Dashboard.Copy.aHistoryDensityMapCountsEachRouteTraversal.text": {
    "en": "A history density map counts each route traversal once per 100-meter cell, so stationary GPS samples do not inflate popular areas.",
    "de": "Die Verlaufskarte zählt jede Routenpassage einmal pro 100-Meter-Zelle. GPS-Punkte im Stillstand erhöhen dadurch nicht die Häufigkeit beliebter Bereiche."
  },
  "Dashboard.Copy.gPSSharingIsOffRoutesStayOnYour.text": {
    "en": "GPS sharing is off. Routes stay on your iPhone unless you separately consent to upload them.",
    "de": "GPS-Freigabe ist aus. Routen bleiben auf deinem iPhone, sofern du dem Hochladen nicht separat zustimmst."
  },
  "Dashboard.Copy.loadRouteMap.text": {
    "en": "Load route map",
    "de": "Routenkarte laden"
  },
  "Dashboard.Copy.loadNext100Routes.text": {
    "en": "Load next 100 routes",
    "de": "Nächste 100 Routen laden"
  },
  "Dashboard.Copy.allRoutesLoaded.text": {
    "en": "All routes loaded",
    "de": "Alle Routen geladen"
  },
  "Dashboard.Copy.noRoutesAvailable.text": {
    "en": "No routes available.",
    "de": "Keine Routen verfügbar."
  },
  "Dashboard.Copy.historyDensityOfRouteTraversals.text": {
    "en": "History density of route traversals",
    "de": "Häufigkeit der Routenpassagen"
  },
  "Dashboard.Copy.routeTraversals.text": {
    "en": " route traversals",
    "de": " Routenpassagen"
  },
  "Dashboard.Format.loadedRuns.text": {
    "en": "Loaded {0} runs…",
    "de": "{0} Läufe geladen …"
  },
  "Dashboard.Format.rangeRuns.text": {
    "en": "{0} runs in this range. Select a date to view the full run.",
    "de": "{0} Läufe in diesem Zeitraum. Wähle ein Datum, um den ganzen Lauf anzusehen."
  },
  "Dashboard.Format.elapsed.text": {
    "en": "Elapsed {0}",
    "de": "Gesamtzeit {0}"
  },
  "Dashboard.Format.coverage.text": {
    "en": "{0}% recorded coverage",
    "de": "{0} % aufgezeichnete Abdeckung"
  },
  "Dashboard.Format.paceComparison.text": {
    "en": "{0}% {1} pace than {2} prior runs of similar distance, setting, and heart rate. Weather, terrain, and effort still influence this comparison.",
    "de": "{0} % {1}es Tempo als bei {2} früheren Läufen mit ähnlicher Distanz, Umgebung und Herzfrequenz. Wetter, Gelände und Belastung beeinflussen den Vergleich weiterhin."
  },
  "Dashboard.Format.baseline.text": {
    "en": "Building your baseline. At least five comparable runs with sufficient heart-rate coverage are needed before showing a pace trend. You have {0}.",
    "de": "Deine Vergleichsbasis entsteht. Für einen Tempotrend werden mindestens fünf vergleichbare Läufe mit ausreichenden Herzfrequenzdaten benötigt. Du hast {0}."
  },
  "Dashboard.Format.sharedRoutes.text": {
    "en": "{0} shared routes in this range. Load a page of up to 100 routes to explore their density.",
    "de": "{0} freigegebene Routen in diesem Zeitraum. Lade bis zu 100 Routen, um ihre Häufigkeit zu erkunden."
  },
  "Dashboard.Format.loadedRoutes.text": {
    "en": "{0} routes loaded · Blue: fewer traversals · Amber: more · Each cell is approximately 100 meters.",
    "de": "{0} Routen geladen · Blau: weniger Passagen · Gelb: mehr · Jede Zelle ist etwa 100 Meter groß."
  },
  "Dashboard.Analysis.languageNotice.text": {
    "en": "This saved report is in another language. Request a new one in Runner on your iPhone.",
    "de": "Dieser gespeicherte Bericht ist in einer anderen Sprache. Fordere in Runner auf deinem iPhone einen neuen an."
  }
};
export function localize(key: string, ...values: (string | number)[]): string {
  const text = messages[key]?.[dashboardLanguage] ?? messages[key]?.en ?? key;
  return text.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ""));
}
