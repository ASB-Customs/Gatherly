// Gatherly shared frontend. No frameworks, no external scripts.

// ---------- XSS-safe text ----------
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- API helper ----------
export async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: opts.body instanceof Blob || opts.body instanceof ArrayBuffer
      ? {} : { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...opts,
    body: opts.body && !(opts.body instanceof Blob) && typeof opts.body !== "string"
      ? JSON.stringify(opts.body) : opts.body,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status}).`);
  return d;
}

// ---------- nav ----------
export function renderNav(active = "") {
  const el = document.getElementById("nav");
  if (!el) return;
  const links = [
    ["Discover", "/events"], ["Advertise", "/advertise"], ["Dashboard", "/dashboard"],
    ["Reports", "/reports"], ["Pricing", "/pricing"], ["Support", "/contact"],
  ];
  el.className = "nav";
  el.innerHTML = `
    <div class="wrap nav-inner">
      <a class="brand" href="/"><img src="/assets/logo-white.webp" alt="" width="26" height="31">Gatherly</a>
      <button class="nav-burger" aria-label="Menu" aria-expanded="false">☰</button>
      <div class="nav-links" id="navLinks">
        ${links.map(([t, h]) => `<a href="${h}" class="${active === h ? "active" : ""}">${t}</a>`).join("")}
        <a class="btn btn-primary btn-sm nav-cta" id="navAuth" href="/login">Log in</a>
      </div>
    </div>`;
  el.querySelector(".nav-burger").addEventListener("click", (e) => {
    const open = el.querySelector("#navLinks").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });
  // session-aware CTA
  api("/api/auth?action=me").then((d) => {
    if (d.user) {
      const a = el.querySelector("#navAuth");
      a.textContent = d.user.username;
      a.href = "/dashboard";
      if (d.user.role) {
        const adm = document.createElement("a");
        adm.href = "/admin"; adm.textContent = "Admin";
        el.querySelector("#navLinks").insertBefore(adm, a);
      }
    }
  }).catch(() => {});
}

// ---------- scroll reveal ----------
export function initReveal() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

// ---------- radar ----------
// blips: [{title, scenario, live, startsAt}]
export function renderRadar(el, blips = [], label = "") {
  if (!el) return;
  const dots = blips.slice(0, 12).map((b, i) => {
    // deterministic spiral placement
    const a = (i * 137.5 * Math.PI) / 180;
    const r = 14 + (i % 5) * 16 + 8;
    const x = 100 + Math.cos(a) * r;
    const y = 100 + Math.sin(a) * r;
    return `<circle class="radar-blip ${b.live ? "live" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2"
      style="animation-delay:${(i * 0.55).toFixed(2)}s"><title>${esc(b.title)} - ${esc(b.scenario)}</title></circle>`;
  }).join("");
  el.innerHTML = `
    <svg viewBox="0 0 200 200" role="img" aria-label="Radar of live and upcoming events">
      ${[28, 56, 84].map((r) => `<circle class="radar-ring" cx="100" cy="100" r="${r}"/>`).join("")}
      <line class="radar-cross" x1="100" y1="14" x2="100" y2="186"/>
      <line class="radar-cross" x1="14" y1="100" x2="186" y2="100"/>
      ${dots}
    </svg>
    <div class="radar-sweep" aria-hidden="true"></div>
    ${label ? `<div class="radar-label">${esc(label)}</div>` : ""}`;
}

// ---------- countdowns ----------
export function tickCountdowns() {
  const fmt = (ms) => {
    if (ms <= 0) return "now";
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };
  const update = () => {
    document.querySelectorAll("[data-countdown]").forEach((el) => {
      el.textContent = fmt(new Date(el.dataset.countdown).getTime() - Date.now());
    });
  };
  update();
  setInterval(update, 1000);
}

export const fmtLocal = (iso) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

// ---------- PRC API status dot ----------
export function initStatusDot() {
  const el = document.getElementById("prcStatus");
  if (!el) return;
  api("/api/erlc?action=status").then((d) => {
    el.classList.add(d.up ? "up" : "down");
    el.querySelector("span").textContent = d.up ? "ER:LC API operational" : "ER:LC API unreachable";
  }).catch(() => {
    el.classList.add("down");
    el.querySelector("span").textContent = "ER:LC API status unknown";
  });
}

// ---------- footer ----------
export function renderFooter() {
  const el = document.getElementById("footer");
  if (!el) return;
  el.innerHTML = `
    <div class="wrap">
      <div class="foot-grid">
        <div>
          <a class="brand" href="/" style="margin-bottom:12px"><img src="/assets/logo-white.webp" alt="" width="24" height="28">Gatherly</a>
          <p style="font-size:.88rem;max-width:300px">The event layer for ER:LC roleplay. Advertise sessions, fill your server, and measure what happened with verified API data.</p>
        </div>
        <div><h4>Platform</h4>
          <a href="/events">Discover events</a><a href="/advertise">Advertise an event</a>
          <a href="/reports">Engagement reports</a><a href="/pricing">Pricing</a></div>
        <div><h4>Account</h4>
          <a href="/dashboard">Dashboard</a><a href="/settings">Settings</a><a href="/login">Log in</a></div>
        <div><h4>Company</h4>
          <a href="/contact">Support</a><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a></div>
      </div>
      <div class="foot-base">
        <span>© ${new Date().getFullYear()} Gatherly. Not affiliated with Police Roleplay Community or Roblox Corp.</span>
        <span class="status-dot" id="prcStatus"><i></i><span>Checking ER:LC API…</span></span>
      </div>
    </div>`;
  initStatusDot();
}

// ---------- boot ----------
export function boot(active) {
  renderNav(active);
  renderFooter();
  initReveal();
  tickCountdowns();
}
