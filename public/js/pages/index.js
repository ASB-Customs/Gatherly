import { boot, api, renderRadar, esc } from "/js/app.js";
boot("/");

// live pulse + radar blips with scroll-driven parallax
let radarBlips = [];
api("/api/events?action=pulse").then((d) => {
  document.getElementById("liveCount").textContent = d.live;
  document.getElementById("pulseLabel").textContent =
    d.live === 1 ? "event live right now" : "events live right now";
  radarBlips = d.blips;
  renderRadar(document.getElementById("heroRadar"), d.blips, `${d.live} live · ${d.upcoming} upcoming`);
}).catch(() => renderRadar(document.getElementById("heroRadar"), [], "scanning"));

// Scroll-driven radar transform (Apple-style: radar zooms, tilts, and gains depth as you scroll)
const radarEl = document.getElementById("heroRadar");
if (radarEl) {
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const scrollY = window.scrollY;
      const heroHeight = document.querySelector(".hero")?.offsetHeight || 600;
      const progress = Math.min(scrollY / heroHeight, 1);
      const scale = 1 + progress * 0.18;
      const rotX = progress * 12;
      const rotZ = progress * -6;
      const opacity = 1 - progress * 0.4;
      const blur = progress * 3;
      radarEl.style.transform = `scale(${scale}) perspective(700px) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`;
      radarEl.style.opacity = opacity;
      radarEl.style.filter = `blur(${blur}px)`;
      // blips pulse faster as you scroll
      const sweepEl = radarEl.querySelector(".radar-sweep");
      if (sweepEl) {
        const duration = Math.max(1.5, 4.5 - progress * 3);
        sweepEl.style.animationDuration = `${duration}s`;
      }
      ticking = false;
    });
  }, { passive: true });
}

// Recently completed ticker - loops forever, each item is clickable
api("/api/events?action=recent").then((d) => {
  if (!d.events.length) return;
  const items = d.events.map((e) =>
    `<a href="/events" style="text-decoration:none;cursor:pointer">
      <span class="ticker-item" style="cursor:pointer"><b>${esc(e.title)}</b> · ${esc(e.scenario)} · ended ${new Date(e.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${e.peak ? ` · peaked at ${e.peak}` : ""}</span>
    </a>`).join("");
  // Triple the items so it never goes blank - seamless infinite loop
  const ticker = document.getElementById("ticker");
  ticker.innerHTML = items + items + items;
  document.getElementById("tickerWrap").hidden = false;

  // Recalculate animation duration based on content width
  const totalWidth = ticker.scrollWidth;
  const speed = 80; // px per second
  const duration = totalWidth / 3 / speed;
  ticker.style.animationDuration = `${duration}s`;
}).catch(() => {});

// admin-editable content blocks
fetch("/api/admin?action=content").then((r) => r.ok ? r.json() : null).then((d) => {
  if (!d || !d.content) return;
  if (d.content.heroHeadline) document.getElementById("heroHeadline").textContent = d.content.heroHeadline;
  if (d.content.heroSub) document.getElementById("heroSub").textContent = d.content.heroSub;
}).catch(() => {});
