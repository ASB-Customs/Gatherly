// Gatherly shared frontend. No frameworks, no external scripts.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: opts.body instanceof Blob || opts.body instanceof ArrayBuffer ? {} : { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...opts,
    body: opts.body && !(opts.body instanceof Blob) && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Request failed (${r.status}).`);
  return d;
}

let CURRENT_USER = null;
export const currentUser = () => CURRENT_USER;

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
      <button class="nav-burger" aria-label="Menu" aria-expanded="false">&#9776;</button>
      <div class="nav-links" id="navLinks">
        ${links.map(([t, h]) => `<a href="${h}" class="${active === h ? "active" : ""}">${t}</a>`).join("")}
        <div class="nav-user-wrap" id="navUserWrap">
          <a class="btn btn-primary btn-sm nav-cta nav-login" id="navAuth" href="/login">Log in</a>
        </div>
      </div>
    </div>`;

  el.querySelector(".nav-burger").addEventListener("click", (e) => {
    const open = el.querySelector("#navLinks").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });

  document.addEventListener("click", (e) => {
    const dd = document.getElementById("navDropdown");
    if (dd && !dd.contains(e.target) && !document.getElementById("navAuth")?.contains(e.target)) dd.remove();
  });

  api("/api/auth?action=me").then((d) => {
    if (!d.user) return;
    CURRENT_USER = d.user;
    buildUserButton(el, d.user);
  }).catch(() => {});
}

function avatarMarkup(user, size = 28) {
  if (user.avatar) return `<img src="${esc(user.avatar)}" alt="" width="${size}" height="${size}" style="border-radius:50%;display:block;object-fit:cover">`;
  const letter = (user.username || "?")[0].toUpperCase();
  return `<span style="width:${size}px;height:${size}px;border-radius:50%;background:var(--signal-deep);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.42)}px;font-weight:700;color:#fff">${esc(letter)}</span>`;
}

function buildUserButton(el, user) {
  const wrap = el.querySelector("#navUserWrap");
  wrap.innerHTML = `
    ${user.role ? `<a href="/admin" class="nav-controlroom">Control room</a>` : ""}
    <button class="nav-user-btn" id="navAuth" type="button">
      ${avatarMarkup(user, 28)}
      <span class="nav-user-name">${esc(user.username)}</span>
      <span class="nav-user-caret">&#9662;</span>
    </button>`;

  el.querySelector("#navAuth").addEventListener("click", (e) => {
    e.stopPropagation();
    const existing = document.getElementById("navDropdown");
    if (existing) { existing.remove(); return; }
    const btn = document.getElementById("navAuth");
    const rect = btn.getBoundingClientRect();
    const dd = document.createElement("div");
    dd.id = "navDropdown";
    dd.className = "nav-dropdown";
    dd.style.top = `${rect.bottom + 8}px`;
    dd.style.right = `${window.innerWidth - rect.right}px`;
    dd.innerHTML = `
      <div class="ndd-head">
        ${avatarMarkup(user, 36)}
        <div>
          <div class="ndd-name">${esc(user.username)}</div>
          <div class="ndd-meta">${esc(planLabel(user.plan))} &middot; <b>${user.credits ?? 0} credits</b></div>
        </div>
      </div>
      <a href="/dashboard" class="ndd-item">Dashboard</a>
      <a href="/settings" class="ndd-item">Settings</a>
      <a href="/reports" class="ndd-item">My reports</a>
      ${user.role ? `<a href="/admin" class="ndd-item">Control room</a>` : ""}
      <div class="ndd-sep"></div>
      <button id="dropdownLogout" class="ndd-item ndd-danger" type="button">Sign out</button>`;
    document.body.appendChild(dd);
    document.getElementById("dropdownLogout").onclick = async () => {
      try { await api("/api/auth?action=logout", { method: "POST" }); } catch {}
      location.href = "/";
    };
  });
}

const PLAN_NAMES = { free: "Gatherly", pro: "Gatherly Pro", ultra: "Gatherly Ultra" };
const normPlan = (p) => ({ patrol: "free", sergeant: "pro", commander: "ultra", network: "ultra" }[p] || p || "free");
export const planLabel = (p) => PLAN_NAMES[normPlan(p)] || "Gatherly";
export const planRank = (p) => ({ free: 0, pro: 1, ultra: 2 }[normPlan(p)] ?? 0);

export function renderAnnouncements() {
  api("/api/admin?action=content").then((d) => {
    const list = d?.content?.announcements || [];
    if (!list.length) return;
    const nav = document.getElementById("nav");
    if (!nav) return;
    const bar = document.createElement("div");
    bar.className = "announce-bar";
    bar.innerHTML = `<div class="wrap announce-inner"><span class="announce-dot"></span><span class="announce-text" id="announceText"></span></div>`;
    nav.parentNode.insertBefore(bar, nav.nextSibling);
    const textEl = bar.querySelector("#announceText");
    let i = 0;
    const show = () => {
      const a = list[i % list.length];
      textEl.classList.remove("in");
      void textEl.offsetWidth;
      textEl.innerHTML = a.link ? `<a href="${esc(a.link)}">${esc(a.text)}</a>` : esc(a.text);
      textEl.classList.add("in");
      i++;
    };
    show();
    if (list.length > 1) setInterval(show, 10000);
  }).catch(() => {});
}

export function renderNotifications() {
  let dismissed = [];
  try { dismissed = JSON.parse(sessionStorage.getItem("gatherly_dismissed") || "[]"); } catch {}
  api("/api/admin?action=content").then((d) => {
    const list = (d?.content?.notifications || []).filter((n) => !dismissed.includes(n.id));
    if (!list.length) return;
    const n = list[0];
    const toast = document.createElement("div");
    toast.className = "g-toast";
    toast.innerHTML = `
      <button class="g-toast-x" aria-label="Dismiss" type="button">&times;</button>
      <div class="g-toast-title">${esc(n.title)}</div>
      ${n.body ? `<div class="g-toast-body">${esc(n.body)}</div>` : ""}
      ${n.link ? `<a class="g-toast-link" href="${esc(n.link)}">Open &rarr;</a>` : ""}`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("in"));
    toast.querySelector(".g-toast-x").onclick = () => {
      toast.classList.remove("in");
      setTimeout(() => toast.remove(), 300);
      try { dismissed.push(n.id); sessionStorage.setItem("gatherly_dismissed", JSON.stringify(dismissed)); } catch {}
    };
  }).catch(() => {});
}

export function initReveal() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

export function renderRadar(el, blips = [], label = "") {
  if (!el) return;
  const dots = blips.slice(0, 12).map((b, i) => {
    const a = (i * 137.5 * Math.PI) / 180;
    const r = 14 + (i % 5) * 16 + 8;
    const x = 100 + Math.cos(a) * r;
    const y = 100 + Math.sin(a) * r;
    const href = b.id ? `/events#${b.id}` : "/events";
    return `<a href="${href}">
      <circle class="radar-blip ${b.live ? "live" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${b.live ? "4.2" : "3.2"}" style="animation-delay:${(i * 0.55).toFixed(2)}s"><title>${esc(b.title)} - ${esc(b.scenario)}</title></circle>
      ${b.live ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="none" stroke="var(--live)" stroke-width="1" opacity="0.3" style="animation:radar-ping 2s ease-out infinite;animation-delay:${(i*0.4).toFixed(2)}s"/>` : ""}
    </a>`;
  }).join("");
  el.innerHTML = `
    <svg viewBox="0 0 200 200" role="img" aria-label="Radar of live and upcoming events" style="overflow:visible">
      ${[28, 56, 84].map((r) => `<circle class="radar-ring" cx="100" cy="100" r="${r}"/>`).join("")}
      <line class="radar-cross" x1="100" y1="14" x2="100" y2="186"/>
      <line class="radar-cross" x1="14" y1="100" x2="186" y2="100"/>
      ${dots}
    </svg>
    <div class="radar-sweep" aria-hidden="true"></div>
    ${label ? `<div class="radar-label">${esc(label)}</div>` : ""}`;
}

export function tickCountdowns() {
  const fmt = (ms) => {
    if (ms <= 0) return "now";
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };
  const update = () => document.querySelectorAll("[data-countdown]").forEach((el) => { el.textContent = fmt(new Date(el.dataset.countdown).getTime() - Date.now()); });
  update();
  setInterval(update, 1000);
}

export const fmtLocal = (iso) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });

export function initStatusDot() {
  const el = document.getElementById("prcStatus");
  if (!el) return;
  api("/api/erlc?action=status").then((d) => {
    el.classList.add(d.up ? "up" : "down");
    el.querySelector("span").textContent = d.up ? "ER:LC API operational" : "ER:LC API unreachable";
  }).catch(() => { el.classList.add("down"); el.querySelector("span").textContent = "ER:LC API status unknown"; });
}

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
        <div><h4>Platform</h4><a href="/events">Discover events</a><a href="/advertise">Advertise an event</a><a href="/reports">Engagement reports</a><a href="/pricing">Pricing</a></div>
        <div><h4>Account</h4><a href="/dashboard">Dashboard</a><a href="/settings">Settings</a><a href="/login">Log in</a></div>
        <div><h4>Company</h4><a href="/contact">Support</a><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a></div>
      </div>
      <div class="foot-base">
        <span>&copy; ${new Date().getFullYear()} Gatherly. Not affiliated with Police Roleplay Community or Roblox Corp.</span>
        <span class="status-dot" id="prcStatus"><i></i><span>Checking ER:LC API&hellip;</span></span>
      </div>
    </div>`;
  initStatusDot();
}

export function boot(active) {
  renderNav(active);
  renderAnnouncements();
  renderNotifications();
  renderFooter();
  initReveal();
  tickCountdowns();
}
