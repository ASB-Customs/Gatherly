import { boot, api, esc, currentUser, planRank } from "/js/app.js";
boot("/pricing");

const $ = (id) => document.getElementById(id);

const PLANS = {
  free: {
    id: "free", name: "Gatherly", tagline: "Everything you need to start filling sessions.",
    prices: { monthly: 0, annual: 0, lifetime: 0 },
    credits: 0,
    features: ["Unlimited event listings", "Discovery feed placement", "Core report: joins, peak, sessions", "One-click join-code reveal", "Live in-game player counts"],
  },
  pro: {
    id: "pro", name: "Gatherly Pro", tagline: "Full analytics and the tools to grow.",
    prices: { monthly: 6.99, annual: 75, lifetime: 179 },
    credits: 2,
    features: ["Everything in Gatherly", "Full Health Score and funnel", "Scenario benchmarking", "Discord webhook delivery", "2 boost credits per week", "Best-time-to-host heatmap"],
  },
  ultra: {
    id: "ultra", name: "Gatherly Ultra", tagline: "The complete intelligence suite.", popular: true,
    prices: { monthly: 14.99, annual: 140, lifetime: 349 },
    robuxMonthly: 2500,
    credits: 6,
    features: ["Everything in Gatherly Pro", "AI report summaries", "Predictive forecasting + momentum", "Staff intelligence panel", "Bot DM delivery + extra recipient", "6 boost credits per week", "Priority support"],
  },
};
const ORDER = ["free", "pro", "ultra"];
let cycle = "monthly";

function priceLabel(plan) {
  const p = PLANS[plan];
  if (plan === "free") return `<div class="price">Free</div>`;
  const v = p.prices[cycle];
  const monthlyEquiv = cycle === "annual" ? (v / 12) : null;
  const unit = cycle === "lifetime" ? " one-time" : cycle === "annual" ? " /year" : " /month";
  let old = "";
  if (cycle === "annual") { const fullYear = (p.prices.monthly * 12).toFixed(0); old = `<span class="plan-old">$${fullYear}</span>`; }
  return `<div class="price">${old}$${v}<small>${unit}</small></div>
    ${monthlyEquiv ? `<div style="font-size:.8rem;color:var(--muted);margin-top:2px">that's $${monthlyEquiv.toFixed(2)}/mo</div>` : ""}
    ${plan === "ultra" && cycle === "monthly" ? `<div style="font-size:.8rem;color:var(--signal);margin-top:2px">or ${p.robuxMonthly.toLocaleString()} Robux /month</div>` : ""}`;
}

function planCard(plan) {
  const p = PLANS[plan];
  const me = currentUser();
  const isCurrent = me && planRank(me.plan) === planRank(plan);
  return `
  <div class="card plan reveal in ${p.popular ? "featured" : ""}" style="display:flex;flex-direction:column">
    ${p.popular ? `<span class="flag">Most popular</span>` : ""}
    <h3>${esc(p.name)}</h3>
    <p style="font-size:.85rem;min-height:38px;margin:4px 0 6px">${esc(p.tagline)}</p>
    ${priceLabel(plan)}
    <ul style="margin:16px 0">${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    ${plan === "free"
      ? (isCurrent ? `<span class="btn btn-ghost btn-sm" style="margin-top:auto;opacity:.6;pointer-events:none">Your current plan</span>` : `<a class="btn btn-ghost btn-sm" href="/advertise" style="margin-top:auto">Start free</a>`)
      : (isCurrent ? `<span class="btn btn-ghost btn-sm" style="margin-top:auto;opacity:.6;pointer-events:none">Your current plan</span>` : `<button class="btn ${p.popular ? "btn-primary" : "btn-ghost"} btn-sm" data-buy="${plan}" style="margin-top:auto">Choose ${esc(p.name)}</button>`)}
  </div>`;
}

function render() {
  $("planGrid").innerHTML = ORDER.map(planCard).join("");
  $("planGrid").querySelectorAll("[data-buy]").forEach((b) => b.onclick = () => openModal(b.dataset.buy));
}

function setCycle(c) {
  cycle = c;
  document.querySelectorAll(".billing-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.cycle === c));
  render();
}

function openModal(plan) {
  const chosen = PLANS[plan];
  const upsellId = plan === "pro" ? "ultra" : null;
  const upsell = upsellId ? PLANS[upsellId] : null;

  const tierBlock = (p, highlight) => {
    const v = p.prices[cycle];
    const unit = cycle === "lifetime" ? " one-time" : cycle === "annual" ? " /year" : " /month";
    let struck = "";
    if (highlight && cycle === "annual") struck = `<span class="plan-old">$${(p.prices.monthly * 12).toFixed(0)}</span>`;
    if (highlight && cycle === "monthly") struck = `<span class="plan-old">$${(p.prices.monthly + 3).toFixed(2)}</span>`;
    return `
      <div class="modal-tier ${highlight ? "hi" : "dim"}">
        ${highlight ? `<span class="badge badge-boost" style="margin-bottom:8px">Best value</span>` : ""}
        <h3>${esc(p.name)}</h3>
        <div class="price" style="font-size:1.6rem;margin:8px 0">${struck}$${v}<small>${unit}</small></div>
        <ul style="margin:10px 0 16px;font-size:.85rem">${p.features.slice(0, 4).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        <button class="btn ${highlight ? "btn-primary" : "btn-ghost"} btn-sm" data-confirm="${p.id}" style="width:100%">Continue with ${esc(p.name)}</button>
        ${p.id === "ultra" && cycle === "monthly" ? `<button class="btn btn-ghost btn-sm" data-robux="ultra" style="width:100%;margin-top:8px">Pay ${p.robuxMonthly.toLocaleString()} Robux instead</button>` : ""}
      </div>`;
  };

  const back = document.createElement("div");
  back.className = "g-modal-backdrop";
  back.innerHTML = `
    <div class="g-modal">
      <button class="g-modal-x" id="modalX" type="button">&times;</button>
      <h2 style="font-size:1.5rem">Choose your plan</h2>
      <p style="font-size:.9rem;margin-top:6px">${upsell ? "You picked " + esc(chosen.name) + ". Most hosts go a step up for the full toolkit." : "Confirm your " + esc(chosen.name) + " plan."}</p>
      <div class="modal-tiers">
        ${tierBlock(chosen, false)}
        ${upsell ? tierBlock(upsell, true) : ""}
      </div>
      <p class="note" style="margin-top:16px">Billed ${cycle}. Card payments run on Stripe's secure checkout. Cancel any time.</p>
      <div id="modalMsg" style="margin-top:10px"></div>
    </div>`;
  document.body.appendChild(back);
  requestAnimationFrame(() => back.classList.add("in"));

  const close = () => { back.classList.remove("in"); setTimeout(() => back.remove(), 250); };
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  back.querySelector("#modalX").onclick = close;

  back.querySelectorAll("[data-confirm]").forEach((btn) => btn.onclick = () => checkout(btn.dataset.confirm, back.querySelector("#modalMsg")));
  back.querySelectorAll("[data-robux]").forEach((btn) => btn.onclick = () => robuxFlow(btn.dataset.robux, back.querySelector("#modalMsg")));
}

async function checkout(plan, msgEl) {
  if (!currentUser()) { msgEl.innerHTML = `<div class="alert alert-err">Log in first to subscribe. <a href="/api/auth?action=start">Continue with Discord</a></div>`; return; }
  msgEl.innerHTML = `<div class="alert alert-ok">Opening secure checkout&hellip;</div>`;
  try {
    const d = await api("/api/billing?action=checkout", { method: "POST", body: { plan, cycle } });
    if (d.url) location.href = d.url;
  } catch (e) { msgEl.innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`; }
}

async function robuxFlow(plan, msgEl) {
  if (!currentUser()) { msgEl.innerHTML = `<div class="alert alert-err">Log in first.</div>`; return; }
  const robloxId = prompt("Buy the 2500 Robux gamepass on Roblox first. Then enter your Roblox user ID (found in your profile URL):");
  if (!robloxId) return;
  msgEl.innerHTML = `<div class="alert alert-ok">Verifying your purchase&hellip;</div>`;
  try {
    await api("/api/billing?action=verify-robux", { method: "POST", body: { plan, robloxId } });
    msgEl.innerHTML = `<div class="alert alert-ok">Verified. You are now on Gatherly Ultra. Redirecting&hellip;</div>`;
    setTimeout(() => location.href = "/dashboard", 1200);
  } catch (e) { msgEl.innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`; }
}

document.querySelectorAll(".billing-toggle button").forEach((b) => b.onclick = () => setCycle(b.dataset.cycle));
render();
