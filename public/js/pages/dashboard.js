  import { boot, api, esc, fmtLocal, renderRadar } from "/js/app.js";
  import { renderReport } from "/js/report.js";
  boot("/dashboard");

  const $ = (id) => document.getElementById(id);
  const say = (t, ok = false) => { $("msg").innerHTML = `<div class="alert ${ok ? "alert-ok" : "alert-err"}">${esc(t)}</div>`; };

  let me = null;
  try {
    me = (await api("/api/auth?action=me")).user;
    $("hello").textContent = `Signed in as ${me.username} · ${me.plan} plan.`;
  } catch {
    $("gate").hidden = false;
    $("eventsCard").hidden = true;
  }

  // ---------- my events ----------
  async function loadEvents() {
    if (!me) return;
    const { events } = await api("/api/events?action=mine");

    // streak: consecutive most-recent reported events scoring 70+
    let streak = 0;
    for (const e of events) {
      if (!e.lastReport) continue;
      if (e.lastReport.score >= 70) streak++; else break;
    }
    if (streak >= 3) {
      $("hostBadges").innerHTML = `<span class="badge badge-streak">🔥 ${streak}-event hot streak</span>`;
    }

    $("myEvents").innerHTML = events.length ? `
      <table class="tbl"><thead><tr>
        <th>Event</th><th>Starts</th><th>Length</th><th>Views</th><th>Status</th><th></th>
      </tr></thead><tbody>
      ${events.map((e) => `<tr>
        <td><b>${esc(e.title)}</b><br><span style="color:var(--muted);font-size:.8rem">${esc(e.scenario)} · code ${esc(e.joinCode)}</span></td>
        <td>${fmtLocal(e.startsAt)}</td>
        <td>${e.durationMin}m</td>
        <td>${e.views}</td>
        <td>${e.live ? `<span class="badge badge-live">Live</span>` : e.ended ? `<span class="badge">Ended</span>` : `<span class="badge badge-boost">Upcoming</span>`}</td>
        <td style="white-space:nowrap">
          ${e.ended || e.live ? `<button class="btn btn-ghost btn-sm" data-report="${esc(e.id)}">${e.lastReport ? "View report" : "Generate report"}</button>` : ""}
          <button class="btn btn-danger btn-sm" data-del="${esc(e.id)}">Delete</button>
        </td>
      </tr>`).join("")}
      </tbody></table>`
      : `<p>No events yet. Your first listing takes about two minutes - <a href="/advertise">advertise an event</a>.</p>`;

    $("myEvents").onclick = async (ev) => {
      const del = ev.target.closest("[data-del]");
      const rep = ev.target.closest("[data-report]");
      if (del) {
        if (!confirm("Delete this event? This cannot be undone.")) return;
        try { await api(`/api/events?action=delete&id=${encodeURIComponent(del.dataset.del)}`, { method: "POST" }); loadEvents(); }
        catch (e) { say(e.message); }
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
        } finally {
          $("reportLoading").hidden = true;
        }
      }
    };
  }
  loadEvents().catch(() => {});

  // ---------- heatmap ----------
  api("/api/events?action=heatmap").then(({ grid }) => {
    const flat = grid.flat().filter((v) => v != null);
    const max = Math.max(...flat, 1);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    $("heatmapWrap").innerHTML = flat.length === 0
      ? `<p class="note">The heatmap lights up as events report. Be one of the first hosts on the board.</p>`
      : grid.map((row, d) => `
        <div style="display:grid;grid-template-columns:40px 1fr;gap:8px;align-items:center;margin-bottom:3px">
          <span style="font-size:.72rem;color:var(--muted)">${days[d]}</span>
          <div class="heatmap">${row.map((v, h) => `
            <i style="${v != null ? `background:rgba(127,168,255,${(0.15 + 0.85 * v / max).toFixed(2)})` : ""}"
               title="${days[d]} ${String(h).padStart(2, "0")}:00 UTC${v != null ? ` · avg ${v} joins` : ""}"></i>`).join("")}
          </div>
        </div>`).join("");
  }).catch(() => { $("heatmapWrap").innerHTML = ""; });
