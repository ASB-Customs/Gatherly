import { boot, api, esc, fmtLocal, tickCountdowns } from "/js/app.js";
boot("/events");

const $ = (id) => document.getElementById(id);
const feed = $("feed");
let state = { q: "", filter: "all" };
let debounce = null;

function card(e) {
  const live = e.live;
  return `
  <article class="card event-card reveal in ${e.boosted ? "boosted" : ""}" id="event-${esc(e.id)}">
    ${e.boosted ? `<div style="margin:-26px -26px 16px;padding:7px 16px;border-radius:13px 13px 0 0;background:linear-gradient(90deg,rgba(255,60,60,0.18),rgba(255,60,60,0.05));border-bottom:1px solid rgba(255,80,80,0.25)"><span class="boost-flag"><span class="bdot"></span>Boosted &middot; featured</span></div>` : ""}
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
        ${live ? `<span>Ends in <b class="countdown" data-countdown="${esc(e.endsAt)}"></b></span>` : `<span>Starts in <b class="countdown" data-countdown="${esc(e.startsAt)}"></b></span>`}
      </div>
      ${live && e.playerCount != null ? `<div class="live-count"><span class="ldot"></span>${e.playerCount} in-game right now</div>` : ""}
      <button class="btn ${live ? "btn-primary" : "btn-ghost"} btn-sm" data-join="${esc(e.id)}" style="margin-top:auto;align-self:flex-start">${live ? "Get join code" : "Join code at start"}</button>
      <div class="alert alert-ok" hidden data-code="${esc(e.id)}"></div>
    </div>
  </article>`;
}

async function load() {
  feed.innerHTML = `<p style="color:var(--muted)">Scanning the feed&hellip;</p>`;
  try {
    const params = new URLSearchParams({ action: "list", q: state.q, filter: state.filter });
    const { events } = await api(`/api/events?${params}`);
    feed.innerHTML = events.length
      ? events.map(card).join("")
      : `<div class="card"><h3>Nothing matches</h3><p>${state.q || state.filter !== "all" ? "Try a different search or filter." : "The radar is clear."} <a href="/advertise">List an event</a> and it appears here instantly.</p></div>`;
    tickCountdowns();
    if (location.hash) {
      const target = document.querySelector(location.hash.replace("#", "#event-"));
      if (target) setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  } catch {
    feed.innerHTML = `<div class="card"><h3>Feed unavailable</h3><p>Refresh to try again.</p></div>`;
  }
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

$("searchInput").addEventListener("input", (e) => {
  state.q = e.target.value.trim();
  clearTimeout(debounce);
  debounce = setTimeout(load, 280);
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.filter = chip.dataset.filter;
    load();
  });
});

load();
setInterval(load, 45000);
