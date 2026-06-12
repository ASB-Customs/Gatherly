  import { boot, api, renderRadar, esc } from "/js/app.js";
  boot("/");

  // live pulse + radar blips
  api("/api/events?action=pulse").then((d) => {
    document.getElementById("liveCount").textContent = d.live;
    document.getElementById("pulseLabel").textContent =
      d.live === 1 ? "event live right now" : "events live right now";
    renderRadar(document.getElementById("heroRadar"), d.blips, `${d.live} live · ${d.upcoming} upcoming`);
  }).catch(() => renderRadar(document.getElementById("heroRadar"), [], "scanning"));

  // recently completed ticker
  api("/api/events?action=recent").then((d) => {
    if (!d.events.length) return;
    const items = d.events.map((e) =>
      `<span><b>${esc(e.title)}</b> · ${esc(e.scenario)} · ended ${new Date(e.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${e.peak ? ` · peaked at ${e.peak}` : ""}</span>`).join("");
    document.getElementById("ticker").innerHTML = items + items; // loop seam
    document.getElementById("tickerWrap").hidden = false;
  }).catch(() => {});

  // admin-editable content blocks
  fetch("/api/admin?action=content").then((r) => r.ok ? r.json() : null).then((d) => {
    if (!d || !d.content) return;
    if (d.content.heroHeadline) document.getElementById("heroHeadline").textContent = d.content.heroHeadline;
    if (d.content.heroSub) document.getElementById("heroSub").textContent = d.content.heroSub;
  }).catch(() => {});
