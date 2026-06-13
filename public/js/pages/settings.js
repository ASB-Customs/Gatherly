import { boot, api, esc } from "/js/app.js";

boot("/settings");

const $ = (id) => document.getElementById(id);
const flash = (el, text, ok = false) => {
  el.innerHTML = `<div class="notice ${ok ? "ok" : "err"}">${esc(text)}</div>`;
  if (ok) setTimeout(() => { if (el.firstChild) el.innerHTML = ""; }, 3500);
};

let me = null;
init();
async function init() {
  try {
    const d = await api("/api/auth?action=me");
    me = d.user;
  } catch { me = null; }
  if (!me) { $("gate").hidden = false; return; }
  $("staffCard").hidden = false;
  renderStaffStatus();
  loadDelivery();
}

function renderStaffStatus() {
  const status = $("staffStatus");
  if (me.role === "executive" || me.role === "admin") {
    status.innerHTML = `<div class="notice ok">You have ${esc(me.role)} access.
      <a href="/admin" style="margin-left:6px"><b>Open the control room →</b></a></div>`;
  } else {
    status.innerHTML = `<p style="font-size:.85rem;color:var(--muted);margin-bottom:0">If you have been issued a staff access code, redeem it below.</p>`;
  }
}

const staffCode = () => $("staffCode").value.trim();
$("redeemStaff").onclick = async () => {
  const sm = $("staffMsg");
  if (!staffCode()) return flash(sm, "Enter your access code first.");
  try {
    const d = await api("/api/admin?action=redeem-code", { method: "POST", body: { code: staffCode() } });
    flash(sm, `Access granted: ${d.role}. Redirecting to the control room…`, true);
    setTimeout(() => location.href = "/admin", 900);
  } catch (e) { flash(sm, e.message); }
};
$("claimExecStaff").onclick = async () => {
  const sm = $("staffMsg");
  if (!staffCode()) return flash(sm, "Enter the executive setup code first.");
  try {
    const d = await api("/api/admin?action=claim-exec", { method: "POST", body: { code: staffCode() } });
    flash(sm, `You are now ${d.role}. Redirecting…`, true);
    setTimeout(() => location.href = "/admin", 900);
  } catch (e) { flash(sm, e.message); }
};

$("saveKey").onclick = async () => {
  const key = $("erlcKey").value.trim();
  if (!key) return flash($("keyStatus"), "Paste your server key first.");
  try {
    await api("/api/erlc?action=save-key", { method: "POST", body: { key } });
    $("erlcKey").value = "";
    flash($("keyStatus"), "Key saved and encrypted with AES-256.", true);
  } catch (e) { flash($("keyStatus"), e.message); }
};
$("testKey").onclick = async () => {
  flash($("keyStatus"), "Testing…", true);
  try {
    const d = await api("/api/erlc?action=test-key");
    flash($("keyStatus"), d.ok ? `Connected to ${d.serverName || "your server"}.` : (d.error || "Connection failed."), Boolean(d.ok));
  } catch (e) { flash($("keyStatus"), e.message); }
};
$("removeKey").onclick = async () => {
  if (!confirm("Remove your stored ER:LC key?")) return;
  try { await api("/api/erlc?action=remove-key", { method: "POST" }); flash($("keyStatus"), "Key removed.", true); }
  catch (e) { flash($("keyStatus"), e.message); }
};

async function loadDelivery() {
  try {
    const d = await api("/api/erlc?action=delivery");
    if (d.webhook) $("webhook").value = d.webhook;
    $("dmOptIn").checked = Boolean(d.dmOptIn);
  } catch { }
}
$("saveDelivery").onclick = async () => {
  try {
    await api("/api/erlc?action=save-delivery", { method: "POST", body: { webhook: $("webhook").value.trim(), dmOptIn: $("dmOptIn").checked } });
    flash($("deliveryMsg"), "Delivery settings saved.", true);
  } catch (e) { flash($("deliveryMsg"), e.message); }
};
$("removeWebhook").onclick = async () => {
  try { await api("/api/erlc?action=save-delivery", { method: "POST", body: { webhook: "", dmOptIn: $("dmOptIn").checked } }); $("webhook").value = ""; flash($("deliveryMsg"), "Webhook removed.", true); }
  catch (e) { flash($("deliveryMsg"), e.message); }
};

$("runDiag").onclick = async () => {
  const out = $("diagOut");
  out.innerHTML = `<p class="note">Running…</p>`;
  try {
    const d = await api("/api/erlc?action=diagnostics");
    const rows = Object.entries(d.checks || {}).map(([k, v]) =>
      `<div class="row"><span>${esc(k)}</span><b style="color:${v.ok ? "var(--good)" : "var(--bad)"}">${v.ok ? "OK" : esc(v.detail || "failed")}</b></div>`);
    out.innerHTML = `<div class="mock">${rows.join("") || `<p class="note">No checks returned.</p>`}</div>`;
  } catch (e) { out.innerHTML = `<p class="note">${esc(e.message)}</p>`; }
};

$("logout").onclick = async () => {
  try { await api("/api/auth?action=logout", { method: "POST" }); } catch {}
  location.href = "/";
};
$("deleteAccount").onclick = async () => {
  if (!confirm("Permanently delete your account, your encrypted key, and all your events? This cannot be undone.")) return;
  try { await api("/api/erlc?action=delete-account", { method: "POST" }); location.href = "/"; }
  catch (e) { flash($("msg"), e.message); }
};
