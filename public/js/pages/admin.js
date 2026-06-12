  import { boot, api, esc, fmtLocal } from "/js/app.js";
  boot("/admin");

  const $ = (id) => document.getElementById(id);
  const say = (t, ok = false) => { $("msg").innerHTML = `<div class="alert ${ok ? "alert-ok" : "alert-err"}">${esc(t)}</div>`; };
  let me = null, eventsCache = [], editing = null;

  try { me = (await api("/api/auth?action=me")).user; } catch { location.href = "/login"; }

  if (!me?.role) {
    $("gate").hidden = false;
  } else {
    $("panel").hidden = false;
    $("role").textContent = `Signed in as ${me.username} (${me.role}). Every action here is written to the audit log.`;
    if (me.role === "executive") { $("execTools").hidden = false; loadRequests(); }
    loadContent(); loadEvents(); loadUsers();
  }

  // ---------- gate actions ----------
  $("claimExec")?.addEventListener("click", async () => {
    try {
      await api("/api/auth?action=claim-executive", { method: "POST", body: { code: $("execCode").value } });
      location.reload();
    } catch (e) { $("gateMsg").innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`; }
  });
  $("reqAdmin")?.addEventListener("click", async () => {
    try {
      await api("/api/auth?action=request-admin", { method: "POST" });
      $("gateMsg").innerHTML = `<div class="alert alert-ok">Request sent. An executive will review it.</div>`;
    } catch (e) { $("gateMsg").innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`; }
  });

  // ---------- content ----------
  async function loadContent() {
    const { content } = await api("/api/admin?action=content");
    $("heroHeadline").value = content.heroHeadline || "";
    $("heroSub").value = content.heroSub || "";
  }
  $("saveContent").onclick = async () => {
    try {
      await api("/api/admin?action=content-update", { method: "POST", body: { heroHeadline: $("heroHeadline").value, heroSub: $("heroSub").value } });
      say("Content saved. The homepage updates immediately.", true);
    } catch (e) { say(e.message); }
  };

  // ---------- events ----------
  async function loadEvents() {
    const { events } = await api("/api/admin?action=events");
    eventsCache = events;
    $("evTable").innerHTML = events.length ? `
      <table class="tbl"><thead><tr><th>Event</th><th>Host</th><th>Starts</th><th>Len</th><th>Views</th><th>Flags</th><th></th></tr></thead><tbody>
      ${events.map((e) => `<tr>
        <td><b>${esc(e.title)}</b><br><span style="color:var(--muted);font-size:.8rem">${esc(e.scenario)}</span></td>
        <td>${esc(e.hostUsername)}</td>
        <td>${fmtLocal(e.startsAt)}</td>
        <td>${e.durationMin}m</td>
        <td>${e.views}</td>
        <td>${e.boosted ? `<span class="badge badge-boost">Boost</span>` : ""}${e.hasReport ? ` <span class="badge">Report</span>` : ""}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" data-edit="${esc(e.id)}">Edit</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(e.id)}">Delete</button>
        </td></tr>`).join("")}
      </tbody></table>` : `<p>No events on the platform.</p>`;
  }

  $("evTable").addEventListener("click", async (ev) => {
    const edit = ev.target.closest("[data-edit]"), del = ev.target.closest("[data-del]");
    if (edit) {
      editing = eventsCache.find((e) => e.id === edit.dataset.edit);
      $("eTitle").value = editing.title; $("eScenario").value = editing.scenario;
      $("eDesc").value = editing.description || "";
      $("eDuration").value = editing.durationMin; $("eBoosted").checked = editing.boosted;
      const d = new Date(editing.startsAt);
      $("eStartsAt").value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      $("evEdit").hidden = false; $("evEdit").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (del) {
      if (!confirm("Delete this event for its host? This cannot be undone.")) return;
      try { await api("/api/admin?action=event-delete", { method: "POST", body: { id: del.dataset.del } }); say("Event deleted.", true); loadEvents(); }
      catch (e) { say(e.message); }
    }
  });

  $("saveEvent").onclick = async () => {
    try {
      await api("/api/admin?action=event-update", { method: "POST", body: {
        id: editing.id, title: $("eTitle").value, scenario: $("eScenario").value,
        description: $("eDesc").value, durationMin: Number($("eDuration").value),
        startsAt: $("eStartsAt").value ? new Date($("eStartsAt").value).toISOString() : undefined,
        boosted: $("eBoosted").checked,
      } });
      say("Event updated.", true); $("evEdit").hidden = true; loadEvents();
    } catch (e) { say(e.message); }
  };
  $("cancelEdit").onclick = () => { $("evEdit").hidden = true; };

  // ---------- users ----------
  async function loadUsers() {
    const { users } = await api("/api/admin?action=users");
    $("userTable").innerHTML = `
      <table class="tbl"><thead><tr><th>User</th><th>Plan</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr>
        <td><b>${esc(u.username)}</b>${u.hasErlcKey ? ` <span class="badge">Key</span>` : ""}</td>
        <td>
          <select data-plan="${esc(u.id)}" style="margin:0;width:auto;padding:6px 8px">
            ${["basic", "sergeant", "commander"].map((p) => `<option ${u.plan === p ? "selected" : ""}>${p}</option>`).join("")}
          </select>
        </td>
        <td>${u.role ? `<span class="badge badge-boost">${esc(u.role)}</span>` : "-"}</td>
        <td>${u.suspended ? `<span class="badge badge-bad">Suspended</span>` : `<span class="badge badge-good">Active</span>`}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" data-suspend="${esc(u.id)}" data-to="${u.suspended ? 0 : 1}">${u.suspended ? "Unsuspend" : "Suspend"}</button>
          <button class="btn btn-danger btn-sm" data-revoke="${esc(u.id)}">Revoke key</button>
        </td></tr>`).join("")}
      </tbody></table>`;
  }

  $("userTable").addEventListener("click", async (ev) => {
    const sus = ev.target.closest("[data-suspend]"), rev = ev.target.closest("[data-revoke]");
    try {
      if (sus) { await api("/api/admin?action=user-update", { method: "POST", body: { id: sus.dataset.suspend, suspended: sus.dataset.to === "1" } }); loadUsers(); }
      if (rev) {
        if (!confirm("Revoke this user's stored ER:LC key?")) return;
        await api("/api/admin?action=user-update", { method: "POST", body: { id: rev.dataset.revoke, revokeErlcKey: true } });
        say("Key revoked.", true); loadUsers();
      }
    } catch (e) { say(e.message); }
  });
  $("userTable").addEventListener("change", async (ev) => {
    const sel = ev.target.closest("[data-plan]");
    if (!sel) return;
    try { await api("/api/admin?action=user-update", { method: "POST", body: { id: sel.dataset.plan, plan: sel.value } }); say("Plan updated.", true); }
    catch (e) { say(e.message); loadUsers(); }
  });

  // ---------- executive: roles + requests ----------
  $("setRole")?.addEventListener("click", async () => {
    try {
      const d = await api("/api/auth?action=set-role", { method: "POST", body: { username: $("roleUser").value.trim(), role: $("roleSel").value } });
      say(`${d.username} is now ${d.role || "a regular user"}.`, true); loadUsers();
    } catch (e) { say(e.message); }
  });

  async function loadRequests() {
    try {
      const { requests } = await api("/api/auth?action=admin-requests");
      $("adminReqs").innerHTML = requests.length ? `
        <h4 style="font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:10px">Pending admin requests</h4>
        ${requests.map((r) => `<div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
          <b style="flex:1">${esc(r.username)}</b>
          <button class="btn btn-primary btn-sm" data-decide="${esc(r.id)}" data-accept="1">Accept</button>
          <button class="btn btn-ghost btn-sm" data-decide="${esc(r.id)}" data-accept="0">Deny</button>
        </div>`).join("")}` : "";
      $("adminReqs").onclick = async (ev) => {
        const b = ev.target.closest("[data-decide]");
        if (!b) return;
        await api("/api/auth?action=admin-request-decide", { method: "POST", body: { userId: b.dataset.decide, accept: b.dataset.accept === "1" } });
        loadRequests(); loadUsers();
      };
    } catch {}
  }

  // ---------- audit ----------
  $("loadAudit").onclick = async () => {
    $("auditOut").innerHTML = "<p>Loading…</p>";
    try {
      const { entries } = await api("/api/admin?action=audit");
      $("auditOut").innerHTML = entries.length ? `
        <table class="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>
        ${entries.map((e) => `<tr>
          <td style="white-space:nowrap">${fmtLocal(e.at)}</td>
          <td>${esc(e.actor?.username || "system")}</td>
          <td>${esc(e.action)}</td>
          <td style="color:var(--muted);font-size:.8rem">${esc(JSON.stringify(e.detail))}</td>
        </tr>`).join("")}
        </tbody></table>` : `<p>No audit entries yet.</p>`;
    } catch (e) { $("auditOut").innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`; }
  };
