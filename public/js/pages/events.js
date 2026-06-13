import { boot, api, esc, fmtLocal, tickCountdowns } from "/js/app.js";
boot("/events");

const feed = document.getElementById("feed");

function card(e) {
  const live = e.live;
  const boostedBorder = e.boosted ? "border: 2px solid rgba(255,80,80,0.7) !important; box-shadow: 0 0 24px rgba(255,60,60,0.18), inset 0 0 0 1px rgba(255,100,100,0.12);" : "";
  return `
  <article class="card event-card reveal in" id="event-${esc(e.id)}" style="${boostedBorder}">
    ${e.boosted ? `<div style="background:linear-gradient(90deg,rgba(255,60,60,0.18),rgba(255,60,60,0.06));border-bottom:1px solid rgba(255,80,80,0.25);padding:6px 14px;margin:-26px -26px 16px;border-radius:13px 13px 0 0;font-size:.75rem;font-weight:700;color:#ff6060;letter-spacing:.08em;text-transform:uppercase;display:flex;align-items:center;gap:6px"><span style="width:6px;height:6px;border-radius:50%;background:#ff4040;animation:pulse 1.2s infinite"></span>BOOSTED · Featured at the top</div>` : ""}
    <div class="event-banner">
      ${e.bannerUrl ? `<img src="${esc(e.bannerUrl)}" alt="" loading="lazy">` : ""}
      <div class="badges">
        ${live ? `<span class="badge badge-live">Live</span>` : ""}
        ${e.boosted ? `<span class="badge" style="color:#ff6060;border-color:rgba(255,80,80,0.4)">Boosted</span>` : ""}
      </div>
    </div>
    <div class="event-body">
      <span class="badge">${esc(e.scenario)}</span>
      <h3>${esc(e.title)}</h3>
      ${e.description ? `<p style="font-size:.88rem">${esc(e.description)}</p>` : ""}
      <div class="event-meta">
        <span>Host <b>${esc(e.hostUsername)}</b></span>
        <span>${fmtLocal(e.startsAt)}</span>
        <span><b>${e.durationMin}m</b></span>
        ${live
          ? `<span>Ends in <b class="countdown" data-countdown="${esc(e.endsAt)}"></b></span>`
          : `<span>Starts in <b class="countdown" data-countdown="${esc(e.startsAt)}"></b></span>`}
      </div>
      ${live && e.playerCount != null ? `<div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:.82rem;color:var(--good);font-weight:600"><span style="width:7px;height:7px;border-radius:50%;background:var(--good);display:inline-block"></span>${e.playerCount} in-game right now</div>` : ""}
      <button class="btn ${live ? "btn-primary" : "btn-ghost"} btn-sm" data-join="${esc(e.id)}" style="margin-top:auto;align-self:flex-start">
        ${live ? "Get join code" : "Join code at start"}
      </button>
      <div class="alert alert-ok" hidden data-code="${esc(e.id)}"></div>
    </div>
  </article>`;
}

async function load() {
  try {
    const { events } = await api("/api/events?action=list");
    feed.innerHTML = events.length
      ? events.map(card).join("")
      : `<div class="card"><h3>No events on the board</h3><p>The radar is clear. <a href="/advertise">List the first event</a> and it will appear here instantly.</p></div>`;
    tickCountdowns();

    // Scroll to anchored event if URL has hash
    if (location.hash) {
      const target = document.querySelector(location.hash.replace("#", "#event-"));
      if (target) setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }

    feed.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-join]");
      if (!btn) return;
      const id = btn.dataset.join;
      fetch(`/api/events?action=view&id=${encodeURIComponent(id)}`, { method: "POST" }).catch(() => {});
      const out = feed.querySelector(`[data-code="${CSS.escape(id)}"]`);
      try {
        const d = await api(`/api/events?action=join&id=${encodeURIComponent(id)}`);
        out.textContent = `Private server code: ${d.joinCode}`;
        out.className = "alert alert-ok"; out.hidden = false;
      } catch (e) {
        out.textContent = e.message;
        out.className = "alert alert-err"; out.hidden = false;
      }
    });
  } catch {
    feed.innerHTML = `<div class="card"><h3>Feed unavailable</h3><p>The events feed could not load. Refresh to try again.</p></div>`;
  }
}
load();
