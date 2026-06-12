  import { boot, renderRadar } from "/js/app.js";
  import { renderReport } from "/js/report.js";
  boot("/reports");

  renderRadar(document.getElementById("loadRadar"), [{ title: "Compiling", scenario: "report", live: true }], "");

  const t0 = Date.now();
  const SAMPLE = {
    eventTitle: "Friday Night Border Patrol",
    serverName: "Liberty County RP",
    scenario: "Border patrol",
    score: 78,
    joinsInWindow: 87, uniquePlayers: 71, peakConcurrent: 42, avgSessionMin: 61, retained30: 49,
    staffOnline: 9, modCalls: 4, commands: 57, queue: 6, maxPlayers: 50,
    conversionPct: 4.2,
    windowStart: new Date(t0 - 2 * 3600000).toISOString(),
    windowEnd: new Date(t0 - 0.5 * 3600000).toISOString(),
    generatedAt: new Date(t0).toISOString(),
    timeline: Array.from({ length: 10 }, (_, i) => ({
      t: new Date(t0 - (2 - i * 0.166) * 3600000).toISOString(),
      n: [12, 21, 28, 35, 42, 40, 36, 34, 27, 19][i],
    })),
    funnel: { views: 820, reveals: 64, entries: 87, retained30: 49 },
    benchmark: { cohortSize: 23, peakPercentile: 71, sessionPercentile: 84, platformAvgSessionMin: 43 },
    forecast: {
      projectedJoins: [55, 70], projectedPeak: [38, 45], basedOnEvents: 4,
      recommendedStartLocal: new Date(t0 + 5 * 86400000).toISOString(),
    },
    momentum: { direction: "up", changePct: 18 },
    staff: {
      avgModResponseMin: 2.4,
      leaderboard: [
        { name: "Deputy_Marsh", commands: 18 }, { name: "Sgt_Okafor", commands: 14 },
        { name: "Trooper_Lane", commands: 11 }, { name: "Cpl_Vance", commands: 8 },
      ],
      idle: ["Cadet_Reyes"],
    },
    aiSummary: "This was your strongest border patrol in a month: 87 joins against a projected 55 to 70, with peak concurrency of 42 filling 84 percent of the server. Retention was the standout, with 49 players staying past 30 minutes and an average session of 61 minutes, 18 above the platform norm for this scenario. The weak point sits at the top of the funnel, where only 64 of 820 listing viewers revealed the join code, suggesting the banner or description is underselling the event. Across your last four Fridays peak attendance has climbed steadily, which is why your momentum index reads up 18 percent. For the next session, hold the Friday 7pm slot, refresh the banner, and consider one extra staff member to keep mod-call response under two minutes.",
  };

  setTimeout(() => {
    document.getElementById("loading").hidden = true;
    const el = document.getElementById("report");
    el.hidden = false;
    renderReport(el, SAMPLE);
  }, 1100);
