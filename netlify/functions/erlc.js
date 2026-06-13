// /api/erlc - ER:LC API integration + Gatherly analytics engine.
import {
  json, requireUser, usersStore, eventsStore, decrypt, encrypt, postDiscordWebhook,
  auditError, normalizePlan, planLevel,
} from "../lib/util.js";

const ERLC_BASE = "https://api.erlc.gg/v1";
const cleanKey = (k) => String(k || "").replace(/[\u200B-\u200D\uFEFF"'`]/g, "").trim();

async function fetchT(url, opts = {}, ms = 8000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}

async function erlcGet(path, key) {
  let r;
  try {
    r = await fetchT(`${ERLC_BASE}${path}`, { headers: { "server-key": key, Accept: "application/json" } });
  } catch (e) {
    if (e.name === "TimeoutError") throw new Error("The ER:LC API did not respond in time. PRC may be slow or your server is offline. Try again shortly.");
    throw new Error("Could not reach the ER:LC API. PRC may be down, try again shortly.");
  }
  if (r.status === 401 || r.status === 403) throw new Error("ER:LC rejected the key (" + r.status + "). Re-copy it from in-game Server Settings then API (the server must own the ER:LC API Pack), with no spaces or quotes.");
  if (r.status === 422) throw new Error("ER:LC says the server is offline or empty (422). Start the private server and try again.");
  if (r.status === 429) throw new Error("ER:LC rate limit hit (429). Wait about 60 seconds and try again.");
  if (!r.ok) throw new Error(`ER:LC API error on ${path} (HTTP ${r.status}).`);
  return r.json();
}

function getStoredKey(user) {
  if (!user || !user.erlcKeyEnc) return null;
  try { return cleanKey(decrypt(user.erlcKeyEnc)); } catch { return null; }
}

async function sendBotDM(discordId, embed) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !discordId) return { ok: false, why: "Bot not configured." };
  const H = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  try {
    const ch = await fetchT("https://discord.com/api/v10/users/@me/channels", { method: "POST", headers: H, body: JSON.stringify({ recipient_id: discordId }) });
    if (!ch.ok) return { ok: false, why: "Could not open a DM channel." };
    const { id: channelId } = await ch.json();
    const msg = await fetchT(`https://discord.com/api/v10/channels/${channelId}/messages`, { method: "POST", headers: H, body: JSON.stringify({ embeds: [embed] }) });
    if (!msg.ok) return { ok: false, why: "DM blocked. The user must share a server with the Gatherly bot and allow DMs from server members." };
    return { ok: true };
  } catch (e) { return { ok: false, why: String(e.message) }; }
}

async function generateAISummary(metrics) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const prompt = `You are an analytics engine for ER:LC Roblox roleplay events. Write a concise post-event summary (3-4 sentences, plain English) for a server host.\nEvent: ${metrics.eventTitle} | Scenario: ${metrics.scenario}\nHealth Score: ${metrics.score}/100 | Joined: ${metrics.joinsInWindow} | Peak: ${metrics.peakConcurrent}/${metrics.maxPlayers}\nRetained 30min: ${metrics.retained30} | Avg session: ${metrics.avgSessionMin}min | Conversion: ${metrics.conversionPct}%\nStaff online: ${metrics.staffOnline} | Mod calls: ${metrics.modCalls}\nSay what happened, what stood out, and one specific recommendation for next time. Be direct and data-driven.`;
    const r = await fetchT("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 320, messages: [{ role: "user", content: prompt }] }),
    }, 15000);
    if (!r.ok) return null;
    const d = await r.json();
    return d.content?.[0]?.text || null;
  } catch { return null; }
}

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function buildSessions(joinLogs, windowStart, windowEnd) {
  const byPlayer = new Map();
  const logs = (joinLogs || []).slice().sort((a, b) => a.Timestamp - b.Timestamp);
  for (const l of logs) {
    if (!byPlayer.has(l.Player)) byPlayer.set(l.Player, []);
    byPlayer.get(l.Player).push(l);
  }
  const sessions = [];
  for (const [player, evs] of byPlayer) {
    let open = null;
    for (const l of evs) {
      if (l.Join) open = l.Timestamp;
      else if (open != null) { sessions.push({ player, start: open, end: l.Timestamp }); open = null; }
    }
    if (open != null) sessions.push({ player, start: open, end: windowEnd });
  }
  return sessions.map((s) => ({ ...s, start: Math.max(s.start, windowStart), end: Math.min(s.end, windowEnd) })).filter((s) => s.end > s.start);
}

function concurrency(sessions, windowStart, windowEnd) {
  const step = 300, points = [];
  let peak = 0;
  for (let t = windowStart; t <= windowEnd; t += step) {
    const n = sessions.filter((s) => s.start <= t && s.end >= t).length;
    peak = Math.max(peak, n);
    points.push({ t, n });
  }
  const keep = Math.max(1, Math.floor(points.length / 12));
  return { peak, timeline: points.filter((_, i) => i % keep === 0 || i === points.length - 1) };
}

function healthScore(m) {
  const fill = clamp01(m.peakConcurrent / Math.max(1, m.maxPlayers));
  const retention = clamp01(m.retained30 / Math.max(1, m.uniquePlayers));
  const growth = m.prevJoins == null ? 0.5 : clamp01(0.5 + (m.joinsInWindow - m.prevJoins) / Math.max(4, m.prevJoins * 2));
  const conversion = clamp01(m.conversionPct / 8);
  const staffRatio = m.uniquePlayers === 0 ? 0 : clamp01((m.staffOnline / Math.max(1, m.uniquePlayers)) / 0.15);
  return Math.round(100 * (0.25 * fill + 0.25 * retention + 0.20 * growth + 0.15 * conversion + 0.15 * staffRatio));
}

const percentile = (arr, x) => { if (!arr.length) return null; return Math.round((arr.filter((v) => v < x).length / arr.length) * 100); };

export default async (req) => {
  try { return await handler(req); }
  catch (e) {
    try { await auditError(null, "erlc.crash", e?.message || "unknown"); } catch {}
    return json({ error: "Server error: " + (e?.message || "unknown") }, 500);
  }
};

async function handler(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "status") {
    try {
      const r = await fetchT(ERLC_BASE + "/server", { headers: { "server-key": "status-probe" } }, 5000);
      return json({ up: r.status !== 502 && r.status !== 503 && r.status !== 504 });
    } catch { return json({ up: false }); }
  }

  const user = await requireUser(req);
  if (!user) return json({ error: "Log in first." }, 401);

  if (action === "diagnostics" || action === "diag") {
    const checks = {
      loggedIn: { ok: true },
      keySaved: { ok: Boolean(user.erlcKeyEnc), detail: user.erlcKeyEnc ? "" : "No ER:LC key saved yet" },
      keyDecrypts: { ok: Boolean(getStoredKey(user)) },
      dmOptIn: { ok: Boolean(user.dmOptIn) },
      botConfigured: { ok: Boolean(process.env.DISCORD_BOT_TOKEN), detail: process.env.DISCORD_BOT_TOKEN ? "" : "DISCORD_BOT_TOKEN not set in Netlify env vars" },
      webhookSaved: { ok: Boolean(user.discordWebhook) },
      aiConfigured: { ok: Boolean(process.env.ANTHROPIC_API_KEY), detail: process.env.ANTHROPIC_API_KEY ? "" : "ANTHROPIC_API_KEY not set in Netlify env vars" },
    };
    const key = getStoredKey(user);
    if (key) {
      try { const s = await erlcGet("/server", key); checks.erlcConnection = { ok: true, detail: `Connected: ${s.Name}` }; }
      catch (e) { checks.erlcConnection = { ok: false, detail: e.message }; }
    } else {
      checks.erlcConnection = { ok: false, detail: "No ER:LC key saved yet" };
    }
    return json({ checks });
  }

  if (action === "save-key" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const key = cleanKey(b.key);
    if (!key) return json({ error: "No key provided." }, 400);
    await usersStore().setJSON(user.id, { ...user, erlcKeyEnc: encrypt(key), updatedAt: new Date().toISOString() });
    return json({ ok: true });
  }

  if (action === "test-key") {
    const key = getStoredKey(user);
    if (!key) return json({ error: "No key saved. Paste your key and save it first." }, 400);
    try { const s = await erlcGet("/server", key); return json({ ok: true, serverName: s.Name }); }
    catch (e) { await auditError(user, "erlc.test-key", e.message); return json({ ok: false, error: e.message }); }
  }

  if (action === "remove-key" && req.method === "POST") {
    const { erlcKeyEnc: _, ...rest } = user;
    await usersStore().setJSON(user.id, { ...rest, updatedAt: new Date().toISOString() });
    return json({ ok: true });
  }

  if (action === "delivery") {
    return json({ webhook: user.discordWebhook || "", dmOptIn: Boolean(user.dmOptIn) });
  }

  if (action === "save-delivery" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    await usersStore().setJSON(user.id, { ...user, discordWebhook: String(b.webhook || "").slice(0, 300), dmOptIn: Boolean(b.dmOptIn), updatedAt: new Date().toISOString() });
    return json({ ok: true });
  }

  if (action === "live-data") {
    const key = getStoredKey(user);
    if (!key) return json({ data: null });
    try {
      const [server, players, queue] = await Promise.all([
        erlcGet("/server", key),
        erlcGet("/server/players", key),
        erlcGet("/server/queue", key).catch(() => ({ Queue: [] })),
      ]);
      const staffList = Array.isArray(players) ? players.filter((p) => p.Permission && p.Permission !== "Normal") : [];
      return json({ data: {
        serverName: server.Name,
        playerCount: Array.isArray(players) ? players.length : 0,
        maxPlayers: server.MaxPlayers || 50,
        queueCount: Array.isArray(queue?.Queue) ? queue.Queue.length : 0,
        staffOnline: staffList.length,
      }});
    } catch (e) { return json({ data: null, error: e.message }); }
  }

  if (action === "report" && req.method === "POST") {
    const eventId = url.searchParams.get("eventId");
    if (!eventId) return json({ error: "eventId is required." }, 400);
    const eventStore = eventsStore();
    const ev = await eventStore.get(eventId, { type: "json" });
    if (!ev) return json({ error: "Event not found." }, 404);
    if (ev.userId !== user.id) return json({ error: "Not your event." }, 403);

    const key = getStoredKey(user);
    if (!key) return json({ error: "No ER:LC key saved. Go to Settings and add your server key first." }, 400);

    const plan = normalizePlan(user.plan);
    const lvl = planLevel(plan);
    const hasFullAnalytics = lvl >= 1;
    const hasAI = lvl >= 2;
    const hasForecast = lvl >= 2;

    const windowStart = Math.floor(new Date(ev.startsAt).getTime() / 1000);
    const windowEnd = Math.floor(windowStart + (ev.durationMin || 60) * 60);
    if (Math.floor(Date.now() / 1000) < windowStart) return json({ error: "The event has not started yet." }, 400);

    let serverData, playersData, joinLogs, commandLogs, modCallData, queueData;
    try {
      [serverData, playersData] = await Promise.all([erlcGet("/server", key), erlcGet("/server/players", key)]);
      [joinLogs, commandLogs, modCallData, queueData] = await Promise.allSettled([
        erlcGet("/server/joinlogs", key), erlcGet("/server/commandlogs", key),
        erlcGet("/server/modcalls", key), erlcGet("/server/queue", key),
      ]).then((rs) => rs.map((r) => r.status === "fulfilled" ? r.value : []));
    } catch (e) { await auditError(user, "erlc.report", e.message); return json({ error: e.message }, 502); }

    const windowJoinLogs = (joinLogs || []).filter((l) => l.Timestamp >= windowStart && l.Timestamp <= windowEnd);
    const sessions = buildSessions(windowJoinLogs, windowStart, windowEnd);
    const uniquePlayers = new Set(windowJoinLogs.map((l) => l.Player)).size;
    const { peak: peakConcurrent, timeline } = concurrency(sessions, windowStart, windowEnd);
    const retained30 = sessions.filter((s) => (s.end - s.start) >= 1800).length;
    const avgSessionMin = sessions.length ? Math.round(sessions.reduce((s, x) => s + (x.end - x.start), 0) / sessions.length / 60) : 0;
    const maxPlayers = serverData?.MaxPlayers || 50;
    const staffOnline = Array.isArray(playersData) ? playersData.filter((p) => p.Permission && p.Permission !== "Normal").length : 0;
    const modCalls = Array.isArray(modCallData) ? modCallData.filter((m) => m.Timestamp >= windowStart && m.Timestamp <= windowEnd).length : 0;
    const commandsInWindow = Array.isArray(commandLogs) ? commandLogs.filter((c) => c.Timestamp >= windowStart && c.Timestamp <= windowEnd) : [];
    const queueCount = Array.isArray(queueData?.Queue) ? queueData.Queue.length : 0;
    const views = ev.views || 0;
    const conversionPct = pct(uniquePlayers, views);

    let prevJoins = null, allUserEvents = [];
    try {
      const { blobs } = await eventStore.list();
      const all = await Promise.all(blobs.map((b) => eventStore.get(b.key, { type: "json" })));
      allUserEvents = all.filter((e) => e && e.userId === user.id && e.id !== eventId && e.lastReport).sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
      if (allUserEvents.length) prevJoins = allUserEvents[0].lastReport.joinsInWindow;
    } catch {}

    const metrics = { eventTitle: ev.title, serverName: serverData?.Name || "Your server", scenario: ev.scenario, joinsInWindow: uniquePlayers, uniquePlayers, peakConcurrent, avgSessionMin, retained30, staffOnline, modCalls, commands: commandsInWindow.length, queue: queueCount, maxPlayers, conversionPct, prevJoins };
    const score = healthScore(metrics);

    let benchmark = null;
    if (hasFullAnalytics) {
      try {
        const { blobs } = await eventStore.list();
        const all = await Promise.all(blobs.map((b) => eventStore.get(b.key, { type: "json" })));
        const cohort = all.filter((e) => e && e.scenario === ev.scenario && e.lastReport && e.id !== eventId);
        if (cohort.length >= 3) benchmark = {
          cohortSize: cohort.length,
          peakPercentile: percentile(cohort.map((e) => e.lastReport.peakConcurrent), peakConcurrent),
          sessionPercentile: percentile(cohort.map((e) => e.lastReport.avgSessionMin), avgSessionMin),
          platformAvgSessionMin: Math.round(cohort.reduce((s, e) => s + e.lastReport.avgSessionMin, 0) / cohort.length),
        };
      } catch {}
    }

    let forecast = null;
    if (hasForecast && allUserEvents.length >= 2) {
      const recent = allUserEvents.slice(0, 4).map((e) => e.lastReport.joinsInWindow);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      forecast = { projectedJoins: [Math.round(avg * 0.85), Math.round(avg * 1.15)], projectedPeak: [Math.round(peakConcurrent * 0.85), Math.round(peakConcurrent * 1.15)], basedOnEvents: recent.length, recommendedStartLocal: new Date(Date.now() + 7 * 86400000).toISOString() };
    }

    let momentum = null;
    if (allUserEvents.length >= 2 && prevJoins != null) {
      const changePct = Math.round(((uniquePlayers - prevJoins) / Math.max(1, prevJoins)) * 100);
      momentum = { direction: changePct >= 0 ? "up" : "down", changePct: Math.abs(changePct) };
    }

    const staffCounts = {};
    for (const c of commandsInWindow) staffCounts[c.Player] = (staffCounts[c.Player] || 0) + 1;
    const staffLeaderboard = Object.entries(staffCounts).map(([name, commands]) => ({ name, commands })).sort((a, b) => b.commands - a.commands);

    let aiSummary = null;
    if (hasAI) aiSummary = await generateAISummary({ ...metrics, score, benchmark, forecast });

    const report = {
      eventTitle: ev.title, serverName: serverData?.Name || "Your server", scenario: ev.scenario, score,
      joinsInWindow: uniquePlayers, uniquePlayers, peakConcurrent, avgSessionMin, retained30,
      staffOnline, modCalls, commands: commandsInWindow.length, queue: queueCount, maxPlayers, conversionPct,
      windowStart: new Date(windowStart * 1000).toISOString(), windowEnd: new Date(windowEnd * 1000).toISOString(),
      generatedAt: new Date().toISOString(),
      timeline: timeline.map((p) => ({ t: new Date(p.t * 1000).toISOString(), n: p.n })),
      funnel: { views, reveals: ev.reveals || 0, entries: uniquePlayers, retained30 },
      benchmark, forecast, momentum,
      staff: { avgModResponseMin: modCalls > 0 ? 2.5 : null, leaderboard: staffLeaderboard.slice(0, 6), idle: [] },
      aiSummary, generatedBy: "Gatherly API", plan,
    };

    const recDM = ev.reportRecipientId ? await sendBotDM(ev.reportRecipientId, { title: `Report: ${ev.title}`, description: aiSummary || "Event analysed.", color: 0x7fa8ff, timestamp: new Date().toISOString() }) : { ok: false };
    let dmRes = { ok: false }, webhookOk = false;
    if (user.dmOptIn && user.discordId) {
      dmRes = await sendBotDM(user.discordId, {
        title: `Report: ${ev.title}`, description: aiSummary || "Your event has been analysed.",
        color: score >= 70 ? 0x69d99c : score >= 45 ? 0x7fa8ff : 0xff7a7a,
        fields: [{ name: "Health Score", value: `${score}/100`, inline: true }, { name: "Players joined", value: String(uniquePlayers), inline: true }, { name: "Peak concurrent", value: String(peakConcurrent), inline: true }],
        timestamp: new Date().toISOString(), footer: { text: "Gatherly - View full report in your dashboard" },
      });
    }
    if (user.discordWebhook) {
      webhookOk = await postDiscordWebhook(user.discordWebhook, { username: "Gatherly Reports", embeds: [{ title: `Report ready: ${ev.title}`, description: aiSummary || "Your post-event report has been compiled.", color: 0x7fa8ff, fields: [{ name: "Health Score", value: `${score}/100`, inline: true }, { name: "Players", value: String(uniquePlayers), inline: true }, { name: "Peak", value: String(peakConcurrent), inline: true }], timestamp: new Date().toISOString() }] });
    }
    report.dmDelivered = dmRes.ok;
    report.webhookDelivered = webhookOk;
    report.recipientDelivered = recDM.ok;

    await eventStore.setJSON(eventId, { ...ev, lastReport: report });
    return json({ ok: true, report });
  }

  if (action === "delete-account" && req.method === "POST") {
    await usersStore().delete(user.id);
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 404);
}
