// Gatherly shared frontend. No frameworks, no external scripts.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
        <div class="nav-user-wrap" id="navUserWrap">
          <a class="btn btn-primary btn-sm nav-cta" id="navAuth" href="/login">Log in</a>
        </div>
      </div>
    </div>`;

  el.querySelector(".nav-burger").addEventListener("click", (e) => {
    const open = el.querySelector("#navLinks").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });

  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("navDropdown");
    if (dropdown && !dropdown.contains(e.target) && !document.getElementById("navAuth")?.contains(e.target)) {
      dropdown.remove();
    }
  });

  api("/api/auth?action=me").then((d) => {
    if (d.user) {
      const wrap = el.querySelector("#navUserWrap");
      const creditsLabel = d.user.credits != null ? ` · ${d.user.credits} credits` : "";
      wrap.innerHTML = `
        ${d.user.role ? `<a href="/admin" style="color:var(--text);font-size:.88rem;margin-right:4px">Control room</a>` : ""}
        <button class="nav-user-btn" id="navAuth" style="background:none;border:1px solid rgba(148,170,205,0.25);color:#ffffff;font-size:.88rem;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:border-color .2s,background .2s;">
          <span style="width:28px;height:28px;border-radius:50%;background:var(--signal-deep);display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;color:#fff">${esc(d.user.username[0].toUpperCase())}</span>
          <span>${esc(d.user.username)}</span>
          <span style="font-size:.75rem;color:rgba(255,255,255,0.5)">▾</span>
        </button>`;

      document.getElementById("navAuth").addEventListener("click", (e) => {
        e.stopPropagation();
        const existing = document.getElementById("navDropdown");
        if (existing) { existing.remove(); return; }
        const btn = document.getElementById("navAuth");
        const rect = btn.getBoundingClientRect();
        const dropdown = document.createElement("div");
        dropdown.id = "navDropdown";
        dropdown.style.cssText = `position:fixed;top:${rect.bottom + 8}px;right:${window.innerWidth - rect.right}px;background:rgba(14,20,30,0.97);backdrop-filter:blur(20px);border:1px solid rgba(148,170,205,0.18);border-radius:12px;padding:8px;z-index:9999;min-width:200px;box-shadow:0 20px 60px rgba(0,0,0,0.5)`;
        dropdown.innerHTML = `
          <div style="padding:8px 12px 10px;border-bottom:1px solid rgba(148,170,205,0.1);margin-bottom:6px">
            <div style="font-size:.78rem;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:.08em">Signed in as</div>
            <div style="color:#fff;font-weight:600;font-size:.92rem">${esc(d.user.username)}</div>
            <div style="color:var(--signal);font-size:.8rem;margin-top:2px">${d.user.plan || "Patrol"} plan · <b>${d.user.credits ?? 0} credits</b></div>
          </div>
          <a href="/dashboard" style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:8px;color:rgba(255,255,255,0.85);font-size:.9rem;text-decoration:none;transition:background .15s" onmouseover="this.style.background='rgba(127,168,255,0.1)'" onmouseout="this.style.background='none'">📊 Dashboard</a>
          <a href="/settings" style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:8px;color:rgba(255,255,255,0.85);font-size:.9rem;text-decoration:none;transition:background .15s" onmouseover="this.style.background='rgba(127,168,255,0.1)'" onmouseout="this.style.background='none'">⚙️ Settings</a>
          <a href="/reports" style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:8px;color:rgba(255,255,255,0.85);font-size:.9rem;text-decoration:none;transition:background .15s" onmouseover="this.style.background='rgba(127,168,255,0.1)'" onmouseout="this.style.background='none'">📈 My reports</a>
          <div style="height:1px;background:rgba(148,170,205,0.1);margin:6px 0"></div>
          <button id="dropdownLogout" style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:8px;color:rgba(255,100,100,0.85);font-size:.9rem;background:none;border:none;cursor:pointer;width:100%;text-align:left;transition:background .15s" onmouseover="this.style.background='rgba(255,100,100,0.08)'" onmouseout="this.style.background='none'">🚪 Sign out</button>`;
        document.body.appendChild(dropdown);
        document.getElementById("dropdownLogout").onclick = async () => {
          try { await api("/api/auth?action=logout", { method: "POST" }); } catch {}
          location.href = "/";
        };
      });
    }
  }).catch(() => {});
}

export function renderAnnouncement() {
  api("/api/admin?action=content").then((d) => {
    const text = d?.content?.announcement;
    if (!text) return;
    const bar = document.createElement("div");
    bar.className = "announce-bar";
    bar.innerHTML = `<div class="wrap">${esc(text)}</div>`;
    const nav = document.getElementById("nav");
    nav?.parentNode?.insertBefore(bar, nav.nextSibling);
  }).catch(() => {});
}

export function initReveal() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
}

// blips: [{title, scenario, live, startsAt, id}]
export function renderRadar(el, blips = [], label = "") {
  if (!el) return;
  const dots = blips.slice(0, 12).map((b, i) => {
    const a = (i * 137.5 * Math.PI) / 180;
    const r = 14 + (i % 5) * 16 + 8;
    const x = 100 + Math.cos(a) * r;
    const y = 100 + Math.sin(a) * r;
    const href = b.id ? `/events#${b.id}` : "/events";
    return `<a href="${href}" style="cursor:pointer">
      <circle class="radar-blip ${b.live ? "live" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${b.live ? "4.2" : "3.2"}"
        style="animation-delay:${(i * 0.55).toFixed(2)}s"><title>${esc(b.title)} - ${esc(b.scenario)}</title></circle>
      ${b.live ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="none" stroke="var(--live)" stroke-width="1" opacity="0.3" style="animation:radar-ping 2s ease-out infinite;animation-delay:${(i*0.4).toFixed(2)}s"/>` : ""}
    </a>`;
  }).join("");
  el.innerHTML = `
    <svg viewBox="0 0 200 200" role="img" aria-label="Radar of live and upcoming events" style="overflow:visible">
      <defs>
        <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="rgba(127,168,255,0.05)"/>
          <stop offset="100%" stop-color="transparent"/>
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="98" fill="url(#radarGlow)"/>
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

export function boot(active) {
  renderNav(active);
  renderAnnouncement();
  renderFooter();
  initReveal();
  tickCountdowns();
}
