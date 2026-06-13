import { boot, api, esc, fmtLocal, renderRadar, currentUser, planLabel, planRank } from "/js/app.js";
import { renderReport } from "/js/report.js";
boot("/dashboard");

const $ = (id) => document.getElementById(id);
const say = (t, ok = false) => { $("msg").innerHTML = `<div class="alert ${ok ? "alert-ok" : "alert-err"}">${esc(t)}</div>`; };

let me = null;
try { me = (await api("/api/auth?action=me")).user; } catch {}

if (!me) {
  $("gate").hidden = false;
  $("body").hidden = true;
} else {
  const rank = planRank(me.plan);
  const credits = me.credits ?? 0;
  $("hello").innerHTML = `Signed in as <b>${esc(me.username)}</b> &middot; <span style="color:var(--signal)">${esc(planLabel(me.plan))}</span> &middot; <span style="color:var(--live);font-weight:600">${credits} boost credit${credits === 1 ? "" : "s"}</span>`;

  if (rank < 2) {
    $("upgradeBanner").hidden = false;
    $("upgradeBanner").innerHTML = `
      <div>
        <div style="font-weight:700;color:var(--text)">Unlock the full platform</div>
        <div style="color:var(--muted);font-size:.88rem;margin-top:4px">You're on <b style="color:var(--text)">${esc(planLabel(me.plan))}</b>. ${rank === 0 ? "Upgrade to Gatherly Pro for full analytics and benchmarks, or Ultra for AI reports, forecasting, and 6 boost credits a week." : "Upgrade to Gatherly Ultra for AI report summaries, predictive forecasting, staff intelligence, and 6 boost credits a week."}</div>
      </div>
      <a href="/pricing" class="btn btn-primary btn-sm" style="white-space:nowrap">Upgrade plan</a>`;
  }

  $("creditsCard").innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div>
        <h3>Boost credits</h3>
        <p style="font-size:.85rem;margin-top:4px">Spend a credit to pin an event to the top of discovery with a red highlight, on a future event or one that's already live.</p>
      </div>
      <div style="text-align:right">
        <div style="font-size:2rem;font-weight:700;color:var(--live);font-family:var(--font-display)" id="creditCount">${credits}</div>
        <div style="font-size:.78rem;color:var(--muted)">available</div>
      </div>
    </div>
    <div style="margin-top:14px"><a href="/pricing" class="btn btn-primary btn-sm">Get more credits</a></div>`;

  loadEvents();
  loadHeatmap();
  loadLiveSnapshot();
}

async function loadEvents() {
  const { events } = await api("/api/events?action=mine");
  let streak = 0;
  for (const e of events) { if (!e.lastReport) break; if (e.lastReport.score >= 70) streak++; else break; }
  if (streak >= 3) $("hostBadges").innerHTML = `<span class="badge badge-streak">${streak}-event hot streak</span>`;

  $("myEvents").innerHTML = events.length ? `
    <table class="tbl"><thead><tr><th>Event</th><th>Starts</th><th>Len</th><th>Views</th><th>Status</th><th></th></tr></thead><tbody>
    ${events.map((e) => `<tr>
      <td><b>${esc(e.title)}</b><br><span style="color:var(--muted);font-size:.8rem">${esc(e.scenario)} &middot; code ${esc(e.joinCode)}</span></td>
      <td>${fmtLocal(e.startsAt)}</td><td>${e.durationMin}m</td><td>${e.views}</td>
      <td>${e.live ? `<span class="badge badge-live">Live</span>` : e.ended ? `<span class="badge">Ended</span>` : `<span class="badge badge-boost">Upcoming</span>`}</td>
      <td style="white-space:nowrap;display:flex;gap:6px;flex-wrap:wrap">
        ${!e.ended && !e.boosted ? `<button class="btn btn-ghost btn-sm" data-boost="${esc(e.id)}" style="border-color:rgba(255,80,80,0.4);color:#ff8080">Boost</button>` : ""}
        ${e.boosted ? `<span class="badge" style="color:#ff6060;border-color:rgba(255,80,80,0.4)">Boosted</span>` : ""}
        ${e.ended || e.live ? `<button class="btn btn-ghost btn-sm" data-report="${esc(e.id)}">${e.lastReport ? "View report" : "Generate report"}</button>` : ""}
        <button class="btn btn-danger btn-sm" data-del="${esc(e.id)}">Delete</button>
      </td></tr>`).join("")}
    </tbody></table>`
    : `<p>No events yet. Your first listing takes about two minutes - <a href="/advertise">advertise an event</a>.</p>`;

  $("myEvents").onclick = async (ev) => {
    const del = ev.target.closest("[data-del]"), rep = ev.target.closest("[data-report]"), boost = ev.target.closest("[data-boost]");
    if (del) {
      if (!confirm("Delete this event? This cannot be undone.")) return;
      try { await api(`/api/events?action=delete&id=${encodeURIComponent(del.dataset.del)}`, { method: "POST" }); loadEvents(); } catch (e) { say(e.message); }
    }
    if (boost) {
      try {
        const d = await api(`/api/events?action=boost&id=${encodeURIComponent(boost.dataset.boost)}`, { method: "POST" });
        say("Event boosted. It now sits at the top of discovery with a red highlight.", true);
        $("creditCount").textContent = d.creditsRemaining;
        loadEvents();
      } catch (e) { say(e.message); }
    }
    if (rep) {
      const cached = events.find((e) => e.id === rep.dataset.report)?.lastReport;
      $("reportLoading").hidden = false;
      renderRadar($("reportRadar"), [{ title: "Pulling data", scenario: "ER:LC API", live: true }]);
      $("reportOut").innerHTML = "";
      try {
        const d = await api(`/api/erlc?action=report&eventId=${encodeURIComponent(rep.dataset.report)}`, { method: "POST" });
        renderReport($("reportOut"), d.report);
        $("reportOut").scrollIntoView({ behavior: "smooth" });
      } catch (e) {
        if (cached) { renderReport($("reportOut"), cached); say("Live pull failed (" + e.message + ") - showing the last saved report.", false); }
        else say(e.message);
      } finally { $("reportLoading").hidden = true; }
    }
  };
}

async function loadHeatmap() {
  const rank = planRank(me.plan);
  const wrap = $("heatmapWrap");
  try {
    const { grid, reportedCount } = await api("/api/events?action=heatmap");
    const flat = grid.flat().filter((v) => v != null);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const max = Math.max(...flat, 1);
    const accuracyNote = reportedCount < 3 ? `<p class="note" style="margin-bottom:12px">You have ${reportedCount} reported event${reportedCount === 1 ? "" : "s"}. The heatmap may be inaccurate until you have 3 or more.</p>` : "";
    const inner = flat.length === 0
      ? `<p class="note">The heatmap lights up as events report. Run your first event to start the board.</p>`
      : `${accuracyNote}<div style="overflow-x:auto"><div style="display:grid;grid-template-columns:40px repeat(24,1fr);gap:3px;min-width:600px;align-items:center">
        <div></div>${hours.map((h) => `<div style="font-size:.6rem;color:var(--faint);text-align:center">${String(h).padStart(2, "0")}</div>`).join("")}
        ${grid.map((row, d) => `<div style="font-size:.72rem;color:var(--muted);font-weight:500">${days[d]}</div>${row.map((v, h) => {
          const intensity = v != null ? (0.12 + 0.88 * v / max) : 0;
          const bg = v != null ? `rgba(127,168,255,${intensity.toFixed(2)})` : "rgba(148,170,205,0.05)";
          return `<div style="aspect-ratio:1;border-radius:3px;background:${bg}" title="${days[d]} ${String(h).padStart(2, "0")}:00 UTC${v != null ? ` &middot; avg ${v} joins` : ""}"></div>`;
        }).join("")}`).join("")}
      </div><div style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:.78rem;color:var(--muted)"><span>Fewer</span><div style="display:flex;gap:2px">${[0.1,0.25,0.45,0.65,0.85,1].map((v) => `<div style="width:14px;height:14px;border-radius:3px;background:rgba(127,168,255,${v})"></div>`).join("")}</div><span>More</span><span style="margin-left:auto;color:var(--faint)">UTC</span></div></div>`;
    if (rank < 1) {
      wrap.innerHTML = `<div class="locked"><div class="locked-inner">${inner}</div>
        <div class="locked-overlay"><span class="lock-badge">Gatherly Pro</span><div class="lock-title">Best time to host</div><div class="lock-sub">See platform-wide busy hours so you schedule when players are online. Available on Gatherly Pro and Ultra.</div><a href="/pricing" class="btn btn-primary btn-sm">Unlock</a></div></div>`;
    } else { wrap.innerHTML = inner; }
  } catch { wrap.innerHTML = `<p class="note">Heatmap unavailable right now.</p>`; }
}

async function loadLiveSnapshot() {
  const rank = planRank(me.plan);
  const wrap = $("liveSnapshot");
  try {
    const { data } = await api("/api/erlc?action=live-data");
    const inner = !data
      ? `<p class="note">Connect your ER:LC key in <a href="/settings">Settings</a> to see your live server here.</p>`
      : `<div class="grid grid-3">
          <div class="stat" style="padding:14px"><b style="font-size:1.5rem">${data.playerCount ?? "--"}</b><span>Players in-server</span></div>
          <div class="stat" style="padding:14px"><b style="font-size:1.5rem">${data.maxPlayers ?? "--"}</b><span>Capacity</span></div>
          <div class="stat" style="padding:14px"><b style="font-size:1.5rem;color:${data.queueCount > 0 ? "var(--live)" : "var(--text)"}">${data.queueCount ?? "--"}</b><span>In queue</span></div>
        </div>${data.staffOnline ? `<p style="margin-top:10px;font-size:.85rem;color:var(--muted)">Staff online: <b style="color:var(--text)">${data.staffOnline}</b></p>` : ""}`;
    if (rank < 1) {
      wrap.innerHTML = `<div class="locked"><div class="locked-inner">${inner}</div>
        <div class="locked-overlay"><span class="lock-badge">Gatherly Pro</span><div class="lock-title">Live server snapshot</div><div class="lock-sub">Watch your in-game player count, capacity, queue, and staff online in real time. Available on Gatherly Pro and Ultra.</div><a href="/pricing" class="btn btn-primary btn-sm">Unlock</a></div></div>`;
    } else { wrap.innerHTML = inner; }
  } catch { wrap.innerHTML = `<p class="note">Live snapshot unavailable.</p>`; }
}
