// /js/pages/admin.js
import { boot, api, esc, fmtLocal } from "/js/app.js";

boot("/admin");

const $ = (id) => document.getElementById(id);
const gate = $("gate"), panel = $("panel"), msg = $("msg");
let me = null;
let chatTimer = null;
let openChatId = null;

const flash = (el, text, ok = false) => {
  el.innerHTML = `<div class="notice ${ok ? "ok" : "err"}">${esc(text)}</div>`;
  if (ok) setTimeout(() => { if (el.firstChild) el.innerHTML = ""; }, 3500);
};

init();
async function init() {
  try {
    me = await api("/api/admin?action=whoami");
    showPanel();
  } catch {
    showGate();
  }
}

function showGate() {
  panel.hidden = true;
  gate.hidden = false;
  gate.innerHTML = `
    <h3>Staff access</h3>
    <p style="margin:6px 0 16px">Enter an access code from an executive, claim the executive role with the setup code, or request admin access for review.</p>
    <label class="field">Access code
      <input id="accessCode" autocomplete="off" placeholder="GATH-XXXX-XXXX or executive setup code">
    </label>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" id="redeemBtn">Redeem code</button>
      <button class="btn btn-ghost btn-sm" id="claimExecBtn">Use as executive setup code</button>
      <button class="btn btn-ghost btn-sm" id="reqBtn">Request admin access</button>
    </div>
    <div id="gateMsg" style="margin-top:12px"></div>`;

  const gateMsg = $("gateMsg");
  const codeVal = () => $("accessCode").value.trim();

  $("redeemBtn").onclick = async () => {
    if (!codeVal()) return flash(gateMsg, "Enter your access code first.");
    try {
      const d = await api("/api/admin?action=redeem-code", { method: "POST", body: { code: codeVal() } });
      flash(gateMsg, `Access granted: ${d.role}. Loading panel…`, true);
      setTimeout(init, 700);
    } catch (e) { flash(gateMsg, e.message); }
  };
  $("claimExecBtn").onclick = async () => {
    if (!codeVal()) return flash(gateMsg, "Enter the executive setup code first.");
    try {
      const d = await api("/api/admin?action=claim-exec", { method: "POST", body: { code: codeVal() } });
      flash(gateMsg, `You are now ${d.role}. Loading panel…`, true);
      setTimeout(init, 700);
    } catch (e) { flash(gateMsg, e.message); }
  };
  $("reqBtn").onclick = async () => {
    try {
      await api("/api/admin?action=request-admin", { method: "POST", body: { note: "" } });
      flash(gateMsg, "Request sent. An executive will review it.", true);
    } catch (e) { flash(gateMsg, e.message); }
  };
}

function showPanel() {
  gate.hidden = true;
  panel.hidden = false;
  const exec = me.role === "executive";
  $("role").textContent = `Signed in as ${me.username} · ${me.role}. Every action is audit-logged.`;

  panel.innerHTML = `
    <div class="tabs" id="tabs">
      <button data-tab="support" class="tab active">Support <span class="tab-badge" id="supBadge" hidden>0</span></button>
      <button data-tab="users" class="tab">Users</button>
      <button data-tab="events" class="tab">Events</button>
      <button data-tab="site" class="tab">Site</button>
      ${exec ? `<button data-tab="exec" class="tab">Executive</button>` : ""}
      <button data-tab="audit" class="tab">Audit</button>
    </div>
    <div id="msg"></div>

    <!-- SUPPORT TAB -->
    <div class="tabpane" data-pane="support">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <h3>Support tickets</h3>
          <div class="seg" id="supFilter">
            <button data-status="open" class="seg-btn active">Open</button>
            <button data-status="closed" class="seg-btn">Closed</button>
          </div>
        </div>
        <div id="ticketList" style="margin-top:14px"><p>Loading…</p></div>
      </div>
      <div class="card" id="chatPanel" hidden>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 id="chatTitle">Chat</h3>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost btn-sm" id="closeTicket">Resolve</button>
            <button class="btn btn-ghost btn-sm" id="assignTicket">Assign to me</button>
            <button class="btn btn-ghost btn-sm" id="backTickets">← Back</button>
          </div>
        </div>
        <div id="chatMessages" style="margin-top:14px;display:grid;gap:8px;max-height:400px;overflow-y:auto"></div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <input id="chatInput" placeholder="Type a reply…" style="flex:1">
          <button class="btn btn-primary btn-sm" id="sendChat">Send</button>
        </div>
      </div>
    </div>

    <!-- USERS TAB -->
    <div class="tabpane" data-pane="users" hidden>
      <div class="card">
        <h3>User search</h3>
        <div style="display:flex;gap:8px;margin-top:12px">
          <input id="userSearchInput" placeholder="Search by username, Discord ID…" style="flex:1">
          <button class="btn btn-primary btn-sm" id="userSearchBtn">Search</button>
        </div>
        <div id="userSearchResults" style="margin-top:14px"></div>
      </div>
      <div class="card" id="userEditPanel" hidden>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>Edit user: <span id="editUsername"></span></h3>
          <button class="btn btn-ghost btn-sm" id="backUsers">← Back</button>
        </div>
        <div id="userEditContent" style="margin-top:14px"></div>
      </div>
      <div class="card" id="allUsersCard">
        <h3>All users</h3>
        <div id="userList" style="margin-top:14px"><p>Loading…</p></div>
      </div>
    </div>

    <!-- EVENTS TAB -->
    <div class="tabpane" data-pane="events" hidden>
      <div class="card">
        <h3>All events</h3>
        <div id="eventList" style="margin-top:14px"><p>Loading…</p></div>
      </div>
    </div>

    <!-- SITE TAB -->
    <div class="tabpane" data-pane="site" hidden>
      ${exec ? `
      <div class="card">
        <h3>Site content</h3>
        <label class="field">Announcement bar <small>Leave blank to hide</small>
          <input id="announcement" placeholder="Site-wide announcement text">
        </label>
        <label class="field">Hero headline
          <input id="heroHeadline" placeholder="Fill every session. Then prove it worked.">
        </label>
        <label class="field">Hero subtitle
          <input id="heroSub" placeholder="ER:LC event advertising with post-event analytics.">
        </label>
        <button class="btn btn-primary btn-sm" id="saveContent" style="margin-top:8px">Save content</button>
        <div id="contentMsg" style="margin-top:10px"></div>
      </div>` : `<div class="card"><p class="note">Site content editing is executive-only.</p></div>`}
    </div>

    <!-- EXECUTIVE TAB -->
    ${exec ? `
    <div class="tabpane" data-pane="exec" hidden>
      <div class="card">
        <h3>Access codes</h3>
        <p style="font-size:.85rem;margin:6px 0 14px">Generate codes for new staff. Codes can be revoked at any time.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="genAdmin">Generate admin code</button>
          <button class="btn btn-ghost btn-sm" id="genExec">Generate executive code</button>
        </div>
        <div id="newCode" style="margin-top:12px;font-size:.9rem;color:var(--signal);font-weight:600"></div>
        <div id="codeList" style="margin-top:14px"><p>Loading…</p></div>
      </div>
      <div class="card">
        <h3>Admin access requests</h3>
        <div id="reqList" style="margin-top:14px"><p>Loading…</p></div>
      </div>
    </div>` : ""}

    <!-- AUDIT TAB -->
    <div class="tabpane" data-pane="audit" hidden>
      <div class="card">
        <h3>Audit log</h3>
        <div id="auditList" style="margin-top:14px"><p>Loading…</p></div>
      </div>
    </div>`;

  // Tab switching
  document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tabpane").forEach((p) => p.hidden = true);
    const pane = document.querySelector(`[data-pane="${btn.dataset.tab}"]`);
    if (pane) pane.hidden = false;
    if (btn.dataset.tab === "support") loadTickets();
    if (btn.dataset.tab === "users") loadUsers();
    if (btn.dataset.tab === "events") loadEvents();
    if (btn.dataset.tab === "exec") loadExec();
    if (btn.dataset.tab === "audit") loadAudit();
  });

  // Initial load
  loadTickets();
  loadUsers();
  pollSupBadge();

  // ---- SUPPORT ----
  function loadTickets(status = "open") {
    const listEl = $("ticketList");
    if (!listEl) return;
    listEl.innerHTML = "<p>Loading…</p>";
    api(`/api/tickets?action=list&status=${status}`).then(({ tickets }) => {
      listEl.innerHTML = tickets.length ? tickets.map((t) => `
        <div class="row" style="cursor:pointer;padding:10px 0;border-bottom:1px solid var(--line)" data-ticket="${esc(t.id)}">
          <span><b>${esc(t.subject)}</b> <span style="color:var(--muted);font-size:.8rem">from @${esc(t.username)}</span></span>
          <span style="color:var(--muted);font-size:.8rem">${t.topic} · ${new Date(t.updatedAt).toLocaleDateString()}</span>
        </div>`).join("") : "<p>No tickets.</p>";
      listEl.querySelectorAll("[data-ticket]").forEach((row) => {
        row.onclick = () => openChat(row.dataset.ticket, tickets.find((t) => t.id === row.dataset.ticket));
      });
    }).catch(() => { listEl.innerHTML = "<p>Failed to load.</p>"; });
  }

  $("supFilter").addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    $("supFilter").querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    loadTickets(btn.dataset.status);
  });

  function openChat(ticketId, ticket) {
    openChatId = ticketId;
    $("ticketList").closest(".card").hidden = true;
    $("chatPanel").hidden = false;
    $("chatTitle").textContent = ticket?.subject || "Ticket";
    loadChatMessages(ticketId);
    clearInterval(chatTimer);
    chatTimer = setInterval(() => loadChatMessages(ticketId), 4000);
  }

  function loadChatMessages(ticketId) {
    api(`/api/tickets?action=get&id=${ticketId}`).then(({ ticket: t }) => {
      const msgs = $("chatMessages");
      if (!msgs) return;
      msgs.innerHTML = t.messages.map((m) => `
        <div style="padding:8px 12px;border-radius:8px;background:${m.from === "staff" ? "rgba(127,168,255,0.1)" : "rgba(255,255,255,0.04)"}">
          <span style="font-size:.78rem;color:var(--muted)">${m.from === "staff" ? "Staff" : "User"} · ${esc(m.by)} · ${new Date(m.at).toLocaleTimeString()}</span>
          <div style="margin-top:4px">${esc(m.text)}</div>
        </div>`).join("");
      msgs.scrollTop = msgs.scrollHeight;
    }).catch(() => {});
  }

  $("backTickets").onclick = () => {
    clearInterval(chatTimer);
    $("ticketList").closest(".card").hidden = false;
    $("chatPanel").hidden = true;
  };

  $("sendChat").onclick = async () => {
    const input = $("chatInput");
    const text = input.value.trim();
    if (!text || !openChatId) return;
    try {
      await api(`/api/tickets?action=reply`, { method: "POST", body: { id: openChatId, message: text } });
      input.value = "";
      loadChatMessages(openChatId);
    } catch (e) { flash($("msg"), e.message); }
  };

  $("closeTicket").onclick = async () => {
    if (!openChatId) return;
    try {
      await api("/api/tickets?action=close", { method: "POST", body: { id: openChatId } });
      flash($("msg"), "Ticket resolved.", true);
      $("backTickets").click();
      loadTickets();
    } catch (e) { flash($("msg"), e.message); }
  };

  $("assignTicket").onclick = async () => {
    if (!openChatId) return;
    try {
      await api("/api/tickets?action=assign", { method: "POST", body: { id: openChatId } });
      flash($("msg"), "Assigned to you.", true);
    } catch (e) { flash($("msg"), e.message); }
  };

  function pollSupBadge() {
    api("/api/tickets?action=counts").then(({ open }) => {
      const badge = $("supBadge");
      if (!badge) return;
      if (open > 0) { badge.textContent = open; badge.hidden = false; }
      else badge.hidden = true;
    }).catch(() => {});
    setTimeout(pollSupBadge, 15000);
  }

  // ---- USERS ----
  function loadUsers() {
    const listEl = $("userList");
    if (!listEl) return;
    api("/api/admin?action=users").then(({ users }) => {
      renderUserTable(listEl, users);
    }).catch(() => { listEl.innerHTML = "<p>Failed to load.</p>"; });
  }

  function renderUserTable(el, users) {
    el.innerHTML = users.length ? `
      <table class="tbl"><thead><tr>
        <th>Username</th><th>Plan</th><th>Credits</th><th>Role</th><th>Status</th><th></th>
      </tr></thead><tbody>
      ${users.map((u) => `<tr>
        <td><b>${esc(u.username)}</b></td>
        <td>${esc(u.plan)}</td>
        <td>${u.credits}</td>
        <td>${u.role ? `<span class="badge">${esc(u.role)}</span>` : "-"}</td>
        <td>${u.suspended ? `<span class="badge badge-bad">Suspended</span>` : `<span class="badge badge-good">Active</span>`}</td>
        <td><button class="btn btn-ghost btn-sm" data-edit="${esc(u.id)}" data-name="${esc(u.username)}">Edit</button></td>
      </tr>`).join("")}
      </tbody></table>` : "<p>No users found.</p>";

    el.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.onclick = () => openUserEdit(btn.dataset.edit, btn.dataset.name);
    });
  }

  $("userSearchBtn").onclick = async () => {
    const q = $("userSearchInput").value.trim();
    if (!q) return loadUsers();
    try {
      const { users } = await api(`/api/admin?action=users-search&q=${encodeURIComponent(q)}`);
      renderUserTable($("userSearchResults"), users);
      $("allUsersCard").hidden = true;
    } catch (e) { flash($("msg"), e.message); }
  };
  $("userSearchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("userSearchBtn").click(); });

  async function openUserEdit(userId, username) {
    $("allUsersCard").hidden = true;
    $("userEditPanel").hidden = false;
    $("editUsername").textContent = username;

    const content = $("userEditContent");
    content.innerHTML = "<p>Loading…</p>";
    try {
      const { user: u } = await api(`/api/admin?action=user-get&id=${encodeURIComponent(userId)}`);
      content.innerHTML = `
        <div class="grid grid-2" style="gap:14px;margin-bottom:16px">
          <div class="stat" style="padding:14px"><b>${u.credits}</b><span>Credits</span></div>
          <div class="stat" style="padding:14px"><b>${esc(u.plan)}</b><span>Current plan</span></div>
        </div>

        <div class="card" style="margin-bottom:12px">
          <h4 style="margin-bottom:10px">Credits</h4>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <label class="field" style="margin:0;flex:1">Amount
              <input id="creditAmt" type="number" min="0" placeholder="e.g. 5">
            </label>
            <button class="btn btn-primary btn-sm" id="addCredits">Add</button>
            <button class="btn btn-ghost btn-sm" id="removeCredits">Remove</button>
            <button class="btn btn-ghost btn-sm" id="setCredits">Set exactly</button>
          </div>
          <div id="creditMsg" style="margin-top:8px"></div>
        </div>

        <div class="card" style="margin-bottom:12px">
          <h4 style="margin-bottom:10px">Plan / Tier</h4>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select id="planSelect" style="flex:1;padding:9px 12px;background:var(--ink);border:1px solid var(--line-strong);border-radius:8px;color:var(--text)">
              <option value="patrol" ${u.plan === "patrol" ? "selected" : ""}>Patrol (Free)</option>
              <option value="sergeant" ${u.plan === "sergeant" ? "selected" : ""}>Sergeant</option>
              <option value="commander" ${u.plan === "commander" ? "selected" : ""}>Commander</option>
              <option value="network" ${u.plan === "network" ? "selected" : ""}>Network</option>
            </select>
            <button class="btn btn-primary btn-sm" id="setPlanBtn">Set plan</button>
          </div>
          <div id="planMsg" style="margin-top:8px"></div>
        </div>

        ${exec ? `
        <div class="card" style="margin-bottom:12px">
          <h4 style="margin-bottom:10px">Role (executive only)</h4>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select id="roleSelect" style="flex:1;padding:9px 12px;background:var(--ink);border:1px solid var(--line-strong);border-radius:8px;color:var(--text)">
              <option value="" ${!u.role ? "selected" : ""}>No role (regular user)</option>
              <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
              <option value="executive" ${u.role === "executive" ? "selected" : ""}>Executive</option>
            </select>
            <button class="btn btn-primary btn-sm" id="setRoleBtn">Set role</button>
          </div>
          <div id="roleMsg" style="margin-top:8px"></div>
        </div>` : ""}

        <div class="card">
          <h4 style="margin-bottom:10px">Account actions</h4>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="suspendBtn">${u.suspended ? "Unsuspend" : "Suspend"}</button>
          </div>
          <div id="actionMsg" style="margin-top:8px"></div>
        </div>`;

      $("addCredits").onclick = async () => {
        const amt = $("creditAmt").value;
        try { const d = await api("/api/admin?action=credits-add", { method: "POST", body: { userId, amount: amt } }); flash($("creditMsg"), `Credits added. New total: ${d.credits}`, true); } catch (e) { flash($("creditMsg"), e.message); }
      };
      $("removeCredits").onclick = async () => {
        const amt = $("creditAmt").value;
        try { const d = await api("/api/admin?action=credits-remove", { method: "POST", body: { userId, amount: amt } }); flash($("creditMsg"), `Credits removed. New total: ${d.credits}`, true); } catch (e) { flash($("creditMsg"), e.message); }
      };
      $("setCredits").onclick = async () => {
        const amt = $("creditAmt").value;
        try { const d = await api("/api/admin?action=credits-set", { method: "POST", body: { userId, amount: amt } }); flash($("creditMsg"), `Credits set to ${d.credits}`, true); } catch (e) { flash($("creditMsg"), e.message); }
      };
      $("setPlanBtn").onclick = async () => {
        const plan = $("planSelect").value;
        try { await api("/api/admin?action=set-plan", { method: "POST", body: { userId, plan } }); flash($("planMsg"), `Plan updated to ${plan}. Weekly credits granted.`, true); } catch (e) { flash($("planMsg"), e.message); }
      };
      if (exec) {
        $("setRoleBtn").onclick = async () => {
          const role = $("roleSelect").value || null;
          try { await api("/api/admin?action=set-role", { method: "POST", body: { userId, role } }); flash($("roleMsg"), "Role updated.", true); } catch (e) { flash($("roleMsg"), e.message); }
        };
      }
      $("suspendBtn").onclick = async () => {
        const suspended = !u.suspended;
        try { await api("/api/admin?action=suspend", { method: "POST", body: { userId, suspended } }); flash($("actionMsg"), suspended ? "User suspended." : "User unsuspended.", true); } catch (e) { flash($("actionMsg"), e.message); }
      };

    } catch (e) { content.innerHTML = `<p>${esc(e.message)}</p>`; }
  }

  $("backUsers").onclick = () => {
    $("userEditPanel").hidden = true;
    $("allUsersCard").hidden = false;
  };

  // ---- EVENTS ----
  function loadEvents() {
    const listEl = $("eventList");
    if (!listEl) return;
    api("/api/admin?action=events").then(({ events }) => {
      listEl.innerHTML = events.length ? `
        <table class="tbl"><thead><tr>
          <th>Event</th><th>Host</th><th>Starts</th><th>Status</th><th>Boosted</th><th></th>
        </tr></thead><tbody>
        ${events.map((e) => {
          const live = Date.now() >= new Date(e.startsAt).getTime() && Date.now() <= new Date(e.startsAt).getTime() + (e.durationMin || 60) * 60000;
          const ended = Date.now() > new Date(e.startsAt).getTime() + (e.durationMin || 60) * 60000;
          return `<tr>
            <td><b>${esc(e.title)}</b><br><span style="font-size:.8rem;color:var(--muted)">${esc(e.scenario)}</span></td>
            <td>${esc(e.hostUsername)}</td>
            <td>${fmtLocal(e.startsAt)}</td>
            <td>${live ? `<span class="badge badge-live">Live</span>` : ended ? `<span class="badge">Ended</span>` : `<span class="badge badge-boost">Upcoming</span>`}</td>
            <td>${e.boosted ? `<span class="badge badge-boost">Boosted</span>` : "-"}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" data-boost="${esc(e.id)}">${e.boosted ? "Unboost" : "Boost"}</button>
              ${!ended ? `<button class="btn btn-ghost btn-sm" data-end="${esc(e.id)}">End now</button>` : ""}
              <button class="btn btn-danger btn-sm" data-delete="${esc(e.id)}">Delete</button>
            </td>
          </tr>`;
        }).join("")}
        </tbody></table>` : "<p>No events.</p>";

      listEl.querySelectorAll("[data-boost]").forEach((btn) => {
        btn.onclick = async () => {
          try { const d = await api("/api/admin?action=boost", { method: "POST", body: { id: btn.dataset.boost } }); flash($("msg"), `Event ${d.boosted ? "boosted" : "unboosted"}.`, true); loadEvents(); } catch (e) { flash($("msg"), e.message); }
        };
      });
      listEl.querySelectorAll("[data-end]").forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm("End this event now?")) return;
          try { await api("/api/admin?action=end-event", { method: "POST", body: { id: btn.dataset.end } }); flash($("msg"), "Event ended.", true); loadEvents(); } catch (e) { flash($("msg"), e.message); }
        };
      });
      listEl.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm("Delete this event permanently?")) return;
          try { await api("/api/admin?action=delete-event", { method: "POST", body: { id: btn.dataset.delete } }); flash($("msg"), "Deleted.", true); loadEvents(); } catch (e) { flash($("msg"), e.message); }
        };
      });
    }).catch(() => { $("eventList").innerHTML = "<p>Failed to load.</p>"; });
  }

  // ---- SITE ----
  if (exec) {
    fetch("/api/admin?action=content").then((r) => r.json()).then(({ content: c }) => {
      if (!c) return;
      if ($("announcement") && c.announcement) $("announcement").value = c.announcement;
      if ($("heroHeadline") && c.heroHeadline) $("heroHeadline").value = c.heroHeadline;
      if ($("heroSub") && c.heroSub) $("heroSub").value = c.heroSub;
    }).catch(() => {});

    const saveContent = $("saveContent");
    if (saveContent) {
      saveContent.onclick = async () => {
        try {
          await api("/api/admin?action=set-content", { method: "POST", body: {
            announcement: $("announcement").value,
            heroHeadline: $("heroHeadline").value,
            heroSub: $("heroSub").value,
          }});
          flash($("contentMsg"), "Content saved.", true);
        } catch (e) { flash($("contentMsg"), e.message); }
      };
    }
  }

  // ---- EXEC ----
  function loadExec() {
    if (!exec) return;
    const codeList = $("codeList");
    const reqList = $("reqList");
    if (!codeList) return;

    api("/api/admin?action=codes").then(({ codes }) => {
      codeList.innerHTML = codes.length ? codes.map((c) => `
        <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
          <code style="color:var(--signal)">${esc(c.code)}</code>
          <span style="color:var(--muted);font-size:.8rem">${c.role} · ${c.redemptions?.length || 0} uses · ${c.revoked ? "revoked" : "active"}</span>
          ${!c.revoked ? `<button class="btn btn-danger btn-sm" data-revoke="${esc(c.code)}">Revoke</button>` : ""}
        </div>`).join("") : "<p>No codes yet.</p>";
      codeList.querySelectorAll("[data-revoke]").forEach((btn) => {
        btn.onclick = async () => {
          try { await api("/api/admin?action=revoke-code", { method: "POST", body: { code: btn.dataset.revoke } }); flash($("msg"), "Code revoked.", true); loadExec(); } catch (e) { flash($("msg"), e.message); }
        };
      });
    }).catch(() => {});

    api("/api/admin?action=admin-requests").then(({ requests }) => {
      if (!reqList) return;
      reqList.innerHTML = requests.length ? requests.map((r) => `
        <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
          <b>${esc(r.username)}</b>
          <span style="color:var(--muted);font-size:.8rem">${new Date(r.at).toLocaleDateString()}</span>
          <span style="color:var(--muted);font-size:.8rem">${esc(r.note || "No note")}</span>
        </div>`).join("") : "<p>No pending requests.</p>";
    }).catch(() => {});

    $("genAdmin").onclick = async () => {
      try { const d = await api("/api/admin?action=gen-code", { method: "POST", body: { role: "admin" } }); $("newCode").textContent = `Admin code: ${d.code}`; loadExec(); } catch (e) { flash($("msg"), e.message); }
    };
    $("genExec").onclick = async () => {
      try { const d = await api("/api/admin?action=gen-code", { method: "POST", body: { role: "executive" } }); $("newCode").textContent = `Executive code: ${d.code}`; loadExec(); } catch (e) { flash($("msg"), e.message); }
    };
  }

  // ---- AUDIT ----
  function loadAudit() {
    const el = $("auditList");
    if (!el) return;
    api("/api/admin?action=audit").then(({ entries }) => {
      el.innerHTML = entries.length ? `
        <table class="tbl"><thead><tr><th>Time</th><th>Actor</th><th>Action</th></tr></thead><tbody>
        ${entries.map((e) => `<tr>
          <td style="font-size:.8rem">${new Date(e.at).toLocaleString()}</td>
          <td>${esc(e.actor?.username || "system")}</td>
          <td><code style="font-size:.8rem">${esc(e.action)}</code></td>
        </tr>`).join("")}
        </tbody></table>` : "<p>No audit entries yet.</p>";
    }).catch(() => { el.innerHTML = "<p>Failed to load.</p>"; });
  }
}
