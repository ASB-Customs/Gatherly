  import { boot, api, esc, fmtLocal, tickCountdowns } from "/js/app.js";
  boot("/events");

  const feed = document.getElementById("feed");

  function card(e) {
    const live = e.live;
    return `
    <article class="card event-card reveal in">
      <div class="event-banner">
        ${e.bannerUrl ? `<img src="${esc(e.bannerUrl)}" alt="" loading="lazy">` : ""}
        <div class="badges">
          ${live ? `<span class="badge badge-live">Live</span>` : ""}
          ${e.boosted ? `<span class="badge badge-boost">Boosted</span>` : ""}
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

      feed.addEventListener("click", async (ev) => {
        const btn = ev.target.closest("[data-join]");
        if (!btn) return;
        const id = btn.dataset.join;
        // funnel stage 1: this person engaged with the listing
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
