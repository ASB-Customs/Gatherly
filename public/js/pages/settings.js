  import { boot, api, esc } from "/js/app.js";
  boot("/settings");

  const $ = (id) => document.getElementById(id);
  const say = (t, ok = false) => { $("msg").innerHTML = `<div class="alert ${ok ? "alert-ok" : "alert-err"}">${esc(t)}</div>`; window.scrollTo({ top: 0, behavior: "smooth" }); };

  let me = null;
  try {
    me = (await api("/api/auth?action=me")).user;
    if (me.hasErlcKey) $("erlcKey").placeholder = "A key is saved (hidden). Paste a new one to replace it.";
    if (me.hasWebhook) $("webhook").placeholder = "A webhook is saved (hidden). Paste a new one to replace it.";
    $("dmOptIn").checked = Boolean(me.dmOptIn);
  } catch {
    $("gate").hidden = false;
    document.querySelectorAll(".card:not(#gate)").forEach((c) => c.hidden = true);
  }

  $("saveKey").onclick = async () => {
    const k = $("erlcKey").value.trim();
    if (!k) return say("Paste a key first.");
    try { await api("/api/auth?action=connection", { method: "POST", body: { erlcKey: k } }); $("erlcKey").value = ""; say("API key saved and encrypted.", true); }
    catch (e) { say(e.message); }
  };

  $("testKey").onclick = async () => {
    $("keyStatus").innerHTML = `<div class="alert">Testing…</div>`;
    try {
      const d = await api("/api/erlc?action=test", { method: "POST", body: { erlcKey: $("erlcKey").value.trim() } });
      $("keyStatus").innerHTML = `<div class="alert alert-ok">Connected to ${esc(d.serverName)} - ${d.players}/${d.maxPlayers} players online.</div>`;
    } catch (e) {
      $("keyStatus").innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`;
    }
  };

  $("removeKey").onclick = async () => {
    try { await api("/api/auth?action=disconnect", { method: "POST", body: { erlcKey: true } }); say("API key removed.", true); }
    catch (e) { say(e.message); }
  };

  $("saveDelivery").onclick = async () => {
    try {
      await api("/api/auth?action=connection", { method: "POST", body: { discordWebhook: $("webhook").value.trim(), dmOptIn: $("dmOptIn").checked } });
      say("Delivery settings saved.", true);
    } catch (e) { say(e.message); }
  };

  $("removeWebhook").onclick = async () => {
    try { await api("/api/auth?action=disconnect", { method: "POST", body: { discordWebhook: true } }); $("webhook").value = ""; say("Webhook removed.", true); }
    catch (e) { say(e.message); }
  };

  $("runDiag").onclick = async () => {
    $("diagOut").innerHTML = `<div class="alert">Running checks…</div>`;
    try {
      const d = await api("/api/erlc?action=diag");
      const rows = [
        ["Logged in", d.checks.loggedIn],
        ["ER:LC key saved", d.checks.keySaved],
        ["Key decrypts correctly", d.checks.keyDecrypts],
        ["PRC API reachable with your key", d.prcReachable],
        ["Discord webhook saved", d.checks.webhookSaved],
        ["Bot DMs opted in", d.checks.dmOptIn],
        ["Gatherly bot configured", d.checks.botConfigured],
        ["AI summaries configured", d.checks.aiConfigured],
      ];
      $("diagOut").innerHTML = `
        <table class="tbl"><tbody>
          ${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v ? `<span class="badge badge-good">OK</span>` : `<span class="badge badge-bad">No</span>`}</td></tr>`).join("")}
        </tbody></table>
        ${d.prcMessage ? `<p class="note" style="margin-top:12px">${esc(d.prcMessage)}</p>` : ""}`;
    } catch (e) {
      $("diagOut").innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`;
    }
  };

  $("logout").onclick = async () => { await api("/api/auth?action=logout", { method: "POST" }).catch(() => {}); location.href = "/"; };

  $("deleteAccount").onclick = async () => {
    if (!confirm("Delete your account, your encrypted key, and every event you have listed? This cannot be undone.")) return;
    try { await api("/api/auth?action=delete-account", { method: "POST" }); location.href = "/"; }
    catch (e) { say(e.message); }
  };
