import { boot, api, esc, fmtLocal } from "/js/app.js";
boot("/admin");

const $ = (id) => document.getElementById(id);
const gate = $("gate"), panel = $("panel");
let me = null, chatTimer = null, openChatId = null;

const flash = (el, text, ok = false) => {
  if (!el) return;
  el.innerHTML = `<div class="alert ${ok ? "alert-ok" : "alert-err"}">${esc(text)}</div>`;
  if (ok) setTimeout(() => { if (el.firstChild) el.innerHTML = ""; }, 3500);
};

init();
async function init() {
  try { me = await api("/api/admin?action=whoami"); showPanel(); }
  catch { showGate(); }
}

function showGate() {
  panel.hidden = true;
  gate.hidden = false;
  gate.innerHTML = `
    <h3>Staff access</h3>
    <p style="margin:6px 0 16px">Enter an access code from an executive to unlock the control room.</p>
    <label class="field">Access code <input id="accessCode" autocomplete="off" placeholder="GATH-XXXX-XXXX"></label>
    <button class="btn btn-primary btn-sm" id="redeemBtn">Redeem code</button>
    <div id="gateMsg" style="margin-top:12px"></div>`;
  $("redeemBtn").onclick = async () => {
    const code = $("accessCode").value.trim();
    if (!code) return flash($("gateMsg"), "Enter your access code first.");
    try { await api("/api/admin?action=redeem-code", { method: "POST", body: { code } }); flash($("gateMsg"), "Access granted. Loading...", true); setTimeout(init, 700); }
    catch (e) { flash($("gateMsg"), e.message); }
  };
}

function showPanel() {
  gate.hidden = true;
  panel.hidden = false;
  const exec = me.role === "executive";
  $("role").textContent = `Signed in as ${me.username} (${me.role}). Every action is audit-logged.`;

  panel.innerHTML = `
    <div class="tabs" id="tabs">
      <button data-tab="support" class="tab active">Support <span class="tab-badge" id="supBadge" hidden>0</span></button>
      <button data-tab="users" class="tab">Users</button>
      <button data-tab="events" class="tab">Events</button>
      <button data-tab="announce" class="tab">Announcements</button>
      <button data-tab="notify" class="tab">Notifications</button>
      ${exec ? `<button data-tab="exec" class="tab">Executive</button>` : ""}
      <button data-tab="audit" class="tab">Audit</button>
    </div>
    <div id="amsg"></div>

    <div class="tabpane" data-pane="support">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <h3>Support tickets</h3>
          <div class="filter-chips" id="supFilter"><button class="chip active" data-status="open">Open</button><button class="chip" data-status="closed">Closed</button></div>
        </div>
        <div id="ticketList" style="margin-top:14px"><p>Loading...</p></div>
      </div>
      <div class="card" id="chatPanel" hidden style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <h3 id="chatTitle">Chat</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="assignTicket">Assign to me</button>
            <button class="btn btn-ghost btn-sm" id="closeTicket">Resolve</button>
            <button class="btn btn-ghost btn-sm" id="backTickets">Back</button>
          </div>
        </div>
        <div id="chatMessages" style="margin-top:14px;display:grid;gap:8px;max-height:420px;overflow-y:auto"></div>
        <div style="margin-top:12px;display:flex;gap:8px"><input id="chatInput" placeholder="Type a reply, sent to the user's DM..." style="flex:1"><button class="btn btn-primary btn-sm" id="sendChat">Send</button></div>
      </div>
    </div>

    <div class="tabpane" data-pane="users" hidden>
      <div class="card">
        <h3>Find a user</h3>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <input id="userSearchInput" placeholder="Search by username or Discord ID..." style="flex:1;min-width:220px">
          <button class="btn btn-primary btn-sm" id="userSearchBtn">Search</button>
          <button class="btn btn-ghost btn-sm" id="userAllBtn">Show all</button>
        </div>
        <div id="userList" style="margin-top:14px"><p>Loading...</p></div>
      </div>
      <div class="card" id="userEditPanel" hidden style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center"><h3>Edit: <span id="editUsername"></span></h3><button class="btn btn-ghost btn-sm" id="backUsers">Back</button></div>
        <div id="userEditContent" style="margin-top:14px"></div>
      </div>
    </div>

    <div class="tabpane" data-pane="events" hidden>
      <div class="card"><h3>All events</h3><div id="eventList" style="margin-top:14px"><p>Loading...</p></div></div>
    </div>

    <div class="tabpane" data-pane="announce" hidden>
      <div class="card">
        <h3>Cycling announcement banner</h3>
        <p style="font-size:.85rem;margin:6px 0 14px">Shows a glass banner across the top of every page. Multiple banners cycle every 10 seconds. Any admin can post one. Leave duration blank for no expiry.</p>
        <label class="field">Message <input id="annText" maxlength="240" placeholder="Scheduled maintenance tonight at 9pm UTC"></label>
        <div class="grid grid-2">
          <label class="field">Duration in minutes <small>Blank = stays until removed</small><input id="annDuration" type="number" min="1" placeholder="e.g. 120"></label>
          <label class="field">Link (optional) <small>Clicking the banner opens this</small><input id="annLink" placeholder="https://..."></label>
        </div>
        <button class="btn btn-primary btn-sm" id="annAdd">Post announcement</button>
        <div id="annMsg" style="margin-top:10px"></div>
        <div id="annList" style="margin-top:16px"></div>
      </div>
    </div>

    <div class="tabpane" data-pane="notify" hidden>
      <div class="card">
        <h3>Server-wide notification</h3>
        <p style="font-size:.85rem;margin:6px 0 14px">Shows a dismissable card in the bottom-right of the screen, once per visitor, until they close it. Use sparingly.</p>
        <label class="field">Title <input id="notTitle" maxlength="80" placeholder="New feature: live player counts"></label>
        <label class="field">Body <small>Optional</small><textarea id="notBody" rows="2" maxlength="300"></textarea></label>
        <div class="grid grid-2">
          <label class="field">Duration in minutes <small>Blank = stays until removed</small><input id="notDuration" type="number" min="1" placeholder="e.g. 1440"></label>
          <label class="field">Link (optional)<input id="notLink" placeholder="https://..."></label>
        </div>
        <button class="btn btn-danger btn-sm" id="notAdd" style="border-color:rgba(255,120,120,0.5);color:#ff9a9a">Make a server-wide notification (Dangerous)</button>
        <div id="notMsg" style="margin-top:10px"></div>
        <div id="notList" style="margin-top:16px"></div>
      </div>
    </div>

    ${exec ? `
    <div class="tabpane" data-pane="exec" hidden>
      <div class="card">
        <h3>Access codes</h3>
        <p style="font-size:.85rem;margin:6px 0 14px">Generate codes for new staff. Public redemption only ever grants admin; executive is set per-user in the Users tab.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="genAdmin">Generate admin code</button>
          <button class="btn btn-ghost btn-sm" id="genExec">Generate executive code</button>
        </div>
        <div id="newCode" style="margin-top:12px;font-weight:600;color:var(--signal)"></div>
        <div id="codeList" style="margin-top:14px"></div>
      </div>
      <div class="card" style="margin-top:18px">
        <h3>Homepage text</h3>
        <label class="field">Hero headline <input id="heroHeadline" placeholder="Fill every session. Then prove it worked."></label>
        <label class="field">Hero subtitle <input id="heroSub" placeholder="ER:LC event advertising with post-event analytics."></label>
        <button class="btn btn-primary btn-sm" id="saveContent">Save homepage text</button>
        <div id="contentMsg" style="margin-top:10px"></div>
      </div>
    </div>` : ""}

    <div class="tabpane" data-pane="audit" hidden>
      <div class="card"><h3>Audit log</h3><p style="font-size:.85rem;margin:6px 0 14px">Every staff action and any system error, with a plain-English diagnosis and fix for failures.</p><div id="auditList"><p>Loading...</p></div></div>
    </div>`;

  $("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tabpane").forEach((p) => p.hidden = true);
    document.querySelector(`[data-pane="${btn.dataset.tab}"]`).hidden = false;
    const map = { support: loadTickets, users: loadUsers, events: loadEvents, announce: loadAnnouncements, notify: loadNotifications, exec: loadExec, audit: loadAudit };
    map[btn.dataset.tab]?.();
  });

  loadTickets();
  pollSupBadge();
  wireUsers();
  wireAnnounce();
  wireNotify();
  if (exec) wireExec();
}

function loadTickets(status = "open") {
  const el = $("ticketList");
  if (!el) return;
  el.innerHTML = "<p>Loading...</p>";
  api(`/api/tickets?action=list&status=${status}`).then(({ tickets }) => {
    el.innerHTML = tickets.length ? tickets.map((t) => `
      <div class="row" style="cursor:pointer;padding:10px 0;border-bottom:1px solid var(--line)" data-ticket="${esc(t.id)}">
        <span><b>${esc(t.subject)}</b> <span style="color:var(--muted);font-size:.8rem">@${esc(t.username)}</span></span>
        <span style="color:var(--muted);font-size:.8rem">${esc(t.topic)} &middot; ${new Date(t.updatedAt).toLocaleDateString()}</span>
      </div>`).join("") : "<p>No tickets here.</p>";
    el.querySelectorAll("[data-ticket]").forEach((row) => row.onclick = () => openChat(row.dataset.ticket, tickets.find((t) => t.id === row.dataset.ticket)));
  }).catch(() => { el.innerHTML = "<p>Failed to load.</p>"; });
}

document.addEventListener("click", (e) => {
  const chip = e.target.closest("#supFilter .chip");
  if (!chip) return;
  document.querySelectorAll("#supFilter .chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  loadTickets(chip.dataset.status);
});

function openChat(id, ticket) {
  openChatId = id;
  $("ticketList").closest(".card").hidden = true;
  $("chatPanel").hidden = false;
  $("chatTitle").textContent = ticket?.subject || "Ticket";
  loadChat(id);
  clearInterval(chatTimer);
  chatTimer = setInterval(() => loadChat(id), 4000);
  $("sendChat").onclick = async () => {
    const text = $("chatInput").value.trim();
    if (!text) return;
    try { await api("/api/tickets?action=reply", { method: "POST", body: { id, message: text } }); $("chatInput").value = ""; loadChat(id); }
    catch (e) { flash($("amsg"), e.message); }
  };
  $("closeTicket").onclick = async () => { try { await api("/api/tickets?action=close", { method: "POST", body: { id } }); flash($("amsg"), "Ticket resolved.", true); backToTickets(); loadTickets(); } catch (e) { flash($("amsg"), e.message); } };
  $("assignTicket").onclick = async () => { try { await api("/api/tickets?action=assign", { method: "POST", body: { id } }); flash($("amsg"), "Assigned to you.", true); } catch (e) { flash($("amsg"), e.message); } };
  $("backTickets").onclick = backToTickets;
}
function backToTickets() { clearInterval(chatTimer); $("ticketList").closest(".card").hidden = false; $("chatPanel").hidden = true; }
function loadChat(id) {
  api(`/api/tickets?action=get&id=${id}`).then(({ ticket: t }) => {
    const m = $("chatMessages");
    if (!m) return;
    m.innerHTML = t.messages.map((msg) => `
      <div style="padding:8px 12px;border-radius:8px;background:${msg.from === "staff" ? "rgba(127,168,255,0.1)" : "rgba(255,255,255,0.04)"}">
        <span style="font-size:.78rem;color:var(--muted)">${msg.from === "staff" ? "Staff" : "User"} &middot; ${esc(msg.by)} &middot; ${new Date(msg.at).toLocaleTimeString()}</span>
        <div style="margin-top:4px">${esc(msg.text)}</div></div>`).join("");
    m.scrollTop = m.scrollHeight;
  }).catch(() => {});
}
function pollSupBadge() {
  api("/api/tickets?action=counts").then(({ open }) => {
    const b = $("supBadge");
    if (!b) return;
    if (open > 0) { b.textContent = open; b.hidden = false; } else b.hidden = true;
  }).catch(() => {});
  setTimeout(pollSupBadge, 15000);
}

function wireUsers() {
  $("userSearchBtn").onclick = async () => {
    const q = $("userSearchInput").value.trim();
    try { const { users } = await api(`/api/admin?action=users-search&q=${encodeURIComponent(q)}`); renderUserTable(users); } catch (e) { flash($("amsg"), e.message); }
  };
  $("userAllBtn").onclick = loadUsers;
  $("userSearchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("userSearchBtn").click(); });
  $("backUsers").onclick = () => { $("userEditPanel").hidden = true; };
}
function loadUsers() {
  api("/api/admin?action=users").then(({ users }) => renderUserTable(users)).catch(() => { $("userList").innerHTML = "<p>Failed to load.</p>"; });
}
function renderUserTable(users) {
  const el = $("userList");
  el.innerHTML = users.length ? `
    <table class="tbl"><thead><tr><th>User</th><th>Plan</th><th>Credits</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
    ${users.map((u) => `<tr>
      <td><b>${esc(u.username)}</b></td><td>${esc(u.plan)}</td><td>${u.credits}</td>
      <td>${u.role ? `<span class="badge">${esc(u.role)}</span>` : "-"}</td>
      <td>${u.suspended ? `<span class="badge badge-bad">Suspended</span>` : `<span class="badge badge-good">Active</span>`}</td>
      <td><button class="btn btn-ghost btn-sm" data-edit="${esc(u.id)}" data-name="${esc(u.username)}">Edit</button></td>
    </tr>`).join("")}</tbody></table>` : "<p>No users found.</p>";
  el.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => openUserEdit(b.dataset.edit, b.dataset.name));
}
async function openUserEdit(userId, username) {
  $("userEditPanel").hidden = false;
  $("editUsername").textContent = username;
  $("userEditPanel").scrollIntoView({ behavior: "smooth" });
  const c = $("userEditContent");
  c.innerHTML = "<p>Loading...</p>";
  const exec = me.role === "executive";
  try {
    const { user: u } = await api(`/api/admin?action=user-get&id=${encodeURIComponent(userId)}`);
    c.innerHTML = `
      <div class="grid grid-2" style="gap:14px;margin-bottom:16px">
        <div class="stat" style="padding:14px"><b>${u.credits}</b><span>Credits</span></div>
        <div class="stat" style="padding:14px"><b>${esc(u.plan)}</b><span>Plan</span></div>
      </div>
      <div class="card" style="margin-bottom:12px">
        <h4 style="margin-bottom:10px">Credits</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <label class="field" style="margin:0;flex:1;min-width:120px">Amount<input id="creditAmt" type="number" min="0" placeholder="5"></label>
          <button class="btn btn-primary btn-sm" id="addCredits">Add</button>
          <button class="btn btn-ghost btn-sm" id="removeCredits">Remove</button>
          <button class="btn btn-ghost btn-sm" id="setCredits">Set</button>
        </div>
        <div id="creditMsg" style="margin-top:8px"></div>
      </div>
      <div class="card" style="margin-bottom:12px">
        <h4 style="margin-bottom:10px">Plan / Tier <small style="font-weight:400;color:var(--muted)">grants that tier's weekly credits automatically</small></h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="planSelect" style="flex:1;min-width:160px;padding:9px 12px;background:var(--ink);border:1px solid var(--line-strong);border-radius:8px;color:var(--text)">
            <option value="free" ${u.plan === "free" ? "selected" : ""}>Gatherly (free)</option>
            <option value="pro" ${u.plan === "pro" ? "selected" : ""}>Gatherly Pro</option>
            <option value="ultra" ${u.plan === "ultra" ? "selected" : ""}>Gatherly Ultra</option>
          </select>
          <button class="btn btn-primary btn-sm" id="setPlanBtn">Apply plan</button>
        </div>
        <div id="planMsg" style="margin-top:8px"></div>
      </div>
      ${exec ? `
      <div class="card" style="margin-bottom:12px">
        <h4 style="margin-bottom:10px">Role <small style="font-weight:400;color:var(--muted)">executive only</small></h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="roleSelect" style="flex:1;min-width:160px;padding:9px 12px;background:var(--ink);border:1px solid var(--line-strong);border-radius:8px;color:var(--text)">
            <option value="" ${!u.role ? "selected" : ""}>No role (regular user)</option>
            <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
            <option value="executive" ${u.role === "executive" ? "selected" : ""}>Executive</option>
          </select>
          <button class="btn btn-primary btn-sm" id="setRoleBtn">Apply role</button>
        </div>
        <div id="roleMsg" style="margin-top:8px"></div>
      </div>` : ""}
      <div class="card">
        <h4 style="margin-bottom:10px">Moderation</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" id="suspendBtn">${u.suspended ? "Unsuspend" : "Suspend"}</button>
          <button class="btn btn-danger btn-sm" id="wipeBtn">Wipe all their listings</button>
        </div>
        <div id="actionMsg" style="margin-top:8px"></div>
      </div>`;

    const num = () => $("creditAmt").value;
    $("addCredits").onclick = async () => { try { const d = await api("/api/admin?action=credits-add", { method: "POST", body: { userId, amount: num() } }); flash($("creditMsg"), `Added. New total: ${d.credits}`, true); } catch (e) { flash($("creditMsg"), e.message); } };
    $("removeCredits").onclick = async () => { try { const d = await api("/api/admin?action=credits-remove", { method: "POST", body: { userId, amount: num() } }); flash($("creditMsg"), `Removed. New total: ${d.credits}`, true); } catch (e) { flash($("creditMsg"), e.message); } };
    $("setCredits").onclick = async () => { try { const d = await api("/api/admin?action=credits-set", { method: "POST", body: { userId, amount: num() } }); flash($("creditMsg"), `Set to ${d.credits}`, true); } catch (e) { flash($("creditMsg"), e.message); } };
    $("setPlanBtn").onclick = async () => { try { await api("/api/admin?action=set-plan", { method: "POST", body: { userId, plan: $("planSelect").value } }); flash($("planMsg"), "Plan applied and weekly credits granted.", true); } catch (e) { flash($("planMsg"), e.message); } };
    if (exec) $("setRoleBtn").onclick = async () => { try { await api("/api/admin?action=set-role", { method: "POST", body: { userId, role: $("roleSelect").value || null } }); flash($("roleMsg"), "Role applied.", true); } catch (e) { flash($("roleMsg"), e.message); } };
    $("suspendBtn").onclick = async () => { const suspend = !u.suspended; try { await api("/api/admin?action=suspend", { method: "POST", body: { userId, suspended: suspend } }); flash($("actionMsg"), suspend ? "User suspended." : "User unsuspended.", true); u.suspended = suspend; $("suspendBtn").textContent = suspend ? "Unsuspend" : "Suspend"; } catch (e) { flash($("actionMsg"), e.message); } };
    $("wipeBtn").onclick = async () => { if (!confirm("Delete every listing this user has? Cannot be undone.")) return; try { const d = await api("/api/admin?action=wipe-listings", { method: "POST", body: { userId } }); flash($("actionMsg"), `Removed ${d.removed} listing(s).`, true); } catch (e) { flash($("actionMsg"), e.message); } };
  } catch (e) { c.innerHTML = `<p>${esc(e.message)}</p>`; }
}

function loadEvents() {
  const el = $("eventList");
  api("/api/admin?action=events").then(({ events }) => {
    el.innerHTML = events.length ? `
      <table class="tbl"><thead><tr><th>Event</th><th>Host</th><th>Starts</th><th>Boosted</th><th></th></tr></thead><tbody>
      ${events.map((e) => {
        const ended = Date.now() > new Date(e.startsAt).getTime() + (e.durationMin || 60) * 60000;
        return `<tr>
          <td><b>${esc(e.title)}</b><br><span style="font-size:.8rem;color:var(--muted)">${esc(e.scenario)}</span></td>
          <td>${esc(e.hostUsername)}</td><td>${fmtLocal(e.startsAt)}</td>
          <td>${e.boosted ? `<span class="badge badge-boost">Boosted</span>` : "-"}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm" data-boost="${esc(e.id)}">${e.boosted ? "Unboost" : "Boost"}</button>
            ${!ended ? `<button class="btn btn-ghost btn-sm" data-end="${esc(e.id)}">End now</button>` : ""}
            <button class="btn btn-danger btn-sm" data-del="${esc(e.id)}">Delete</button>
          </td></tr>`;
      }).join("")}</tbody></table>` : "<p>No events.</p>";
    el.querySelectorAll("[data-boost]").forEach((b) => b.onclick = async () => { try { await api("/api/admin?action=boost", { method: "POST", body: { id: b.dataset.boost } }); loadEvents(); } catch (e) { flash($("amsg"), e.message); } });
    el.querySelectorAll("[data-end]").forEach((b) => b.onclick = async () => { if (!confirm("End now?")) return; try { await api("/api/admin?action=end-event", { method: "POST", body: { id: b.dataset.end } }); loadEvents(); } catch (e) { flash($("amsg"), e.message); } });
    el.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { if (!confirm("Delete permanently?")) return; try { await api("/api/admin?action=delete-event", { method: "POST", body: { id: b.dataset.del } }); loadEvents(); } catch (e) { flash($("amsg"), e.message); } });
  }).catch(() => { el.innerHTML = "<p>Failed to load.</p>"; });
}

function wireAnnounce() {
  $("annAdd").onclick = async () => {
    const text = $("annText").value.trim();
    if (!text) return flash($("annMsg"), "Enter the announcement text.");
    try { await api("/api/admin?action=announce-add", { method: "POST", body: { text, durationMin: $("annDuration").value, link: $("annLink").value.trim() } }); flash($("annMsg"), "Posted.", true); $("annText").value = ""; $("annDuration").value = ""; $("annLink").value = ""; loadAnnouncements(); } catch (e) { flash($("annMsg"), e.message); }
  };
}
function loadAnnouncements() {
  api("/api/admin?action=announce-list").then(({ announcements }) => {
    const el = $("annList");
    el.innerHTML = announcements.length ? announcements.map((a) => `
      <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <span>${esc(a.text)} ${a.expiresAt ? `<span style="color:var(--muted);font-size:.78rem">until ${new Date(a.expiresAt).toLocaleString()}</span>` : `<span style="color:var(--muted);font-size:.78rem">no expiry</span>`}</span>
        <button class="btn btn-danger btn-sm" data-rm="${esc(a.id)}">Remove</button>
      </div>`).join("") : "<p class='note'>No active announcements.</p>";
    el.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async () => { try { await api("/api/admin?action=announce-remove", { method: "POST", body: { id: b.dataset.rm } }); loadAnnouncements(); } catch (e) { flash($("annMsg"), e.message); } });
  }).catch(() => {});
}

function wireNotify() {
  $("notAdd").onclick = async () => {
    const title = $("notTitle").value.trim();
    if (!title) return flash($("notMsg"), "Enter a title.");
    if (!confirm("This shows a notification to every visitor of the site. Continue?")) return;
    try { await api("/api/admin?action=notify-add", { method: "POST", body: { title, body: $("notBody").value.trim(), durationMin: $("notDuration").value, link: $("notLink").value.trim() } }); flash($("notMsg"), "Notification live.", true); $("notTitle").value = ""; $("notBody").value = ""; $("notDuration").value = ""; $("notLink").value = ""; loadNotifications(); } catch (e) { flash($("notMsg"), e.message); }
  };
}
function loadNotifications() {
  api("/api/admin?action=content").then(({ content }) => {
    const list = content.notifications || [];
    const el = $("notList");
    el.innerHTML = list.length ? list.map((n) => `
      <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <span><b>${esc(n.title)}</b> ${n.body ? `<span style="color:var(--muted);font-size:.8rem">${esc(n.body)}</span>` : ""}</span>
        <button class="btn btn-danger btn-sm" data-rmn="${esc(n.id)}">Remove</button>
      </div>`).join("") : "<p class='note'>No active notifications.</p>";
    el.querySelectorAll("[data-rmn]").forEach((b) => b.onclick = async () => { try { await api("/api/admin?action=notify-remove", { method: "POST", body: { id: b.dataset.rmn } }); loadNotifications(); } catch (e) { flash($("notMsg"), e.message); } });
  }).catch(() => {});
}

function wireExec() {
  $("genAdmin").onclick = async () => { try { const d = await api("/api/admin?action=gen-code", { method: "POST", body: { role: "admin" } }); $("newCode").textContent = `Admin code: ${d.code}`; loadExec(); } catch (e) { flash($("amsg"), e.message); } };
  $("genExec").onclick = async () => { try { const d = await api("/api/admin?action=gen-code", { method: "POST", body: { role: "executive" } }); $("newCode").textContent = `Executive code: ${d.code}`; loadExec(); } catch (e) { flash($("amsg"), e.message); } };
  $("saveContent").onclick = async () => { try { await api("/api/admin?action=set-content", { method: "POST", body: { heroHeadline: $("heroHeadline").value, heroSub: $("heroSub").value } }); flash($("contentMsg"), "Saved.", true); } catch (e) { flash($("contentMsg"), e.message); } };
  api("/api/admin?action=content").then(({ content }) => { if (content.heroHeadline) $("heroHeadline").value = content.heroHeadline; if (content.heroSub) $("heroSub").value = content.heroSub; }).catch(() => {});
}
function loadExec() {
  api("/api/admin?action=codes").then(({ codes }) => {
    const el = $("codeList");
    el.innerHTML = codes.length ? codes.map((c) => `
      <div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <code style="color:var(--signal)">${esc(c.code)}</code>
        <span style="color:var(--muted);font-size:.8rem">${esc(c.role)} &middot; ${c.redemptions?.length || 0} uses &middot; ${c.revoked ? "revoked" : "active"}</span>
        ${!c.revoked ? `<button class="btn btn-danger btn-sm" data-revoke="${esc(c.code)}">Revoke</button>` : ""}
      </div>`).join("") : "<p class='note'>No codes yet.</p>";
    el.querySelectorAll("[data-revoke]").forEach((b) => b.onclick = async () => { try { await api("/api/admin?action=revoke-code", { method: "POST", body: { code: b.dataset.revoke } }); loadExec(); } catch (e) { flash($("amsg"), e.message); } });
  }).catch(() => {});
}

function loadAudit() {
  const el = $("auditList");
  api("/api/admin?action=audit").then(({ entries }) => {
    el.innerHTML = entries.length ? entries.map((e) => {
      const isErr = e.level === "error" || e.detail?.error;
      return `<div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <span><code style="font-size:.82rem;color:${isErr ? "var(--bad)" : "var(--text)"}">${esc(e.action)}</code> <span style="color:var(--muted);font-size:.8rem">by ${esc(e.actor?.username || "system")}</span></span>
          <span style="color:var(--faint);font-size:.78rem">${new Date(e.at).toLocaleString()}</span>
        </div>
        ${isErr ? `<div style="margin-top:6px;background:rgba(255,122,122,0.06);border:1px solid rgba(255,122,122,0.25);border-radius:8px;padding:8px 12px">
          <div style="color:var(--bad);font-size:.82rem"><b>Error:</b> ${esc(e.detail.error)}</div>
          ${e.detail.diagnosis ? `<div style="color:var(--muted);font-size:.82rem;margin-top:3px"><b>Cause:</b> ${esc(e.detail.diagnosis)}</div>` : ""}
          ${e.detail.fix ? `<div style="color:var(--good);font-size:.82rem;margin-top:3px"><b>Fix:</b> ${esc(e.detail.fix)}</div>` : ""}
        </div>` : ""}
      </div>`;
    }).join("") : "<p>No audit entries yet.</p>";
  }).catch(() => { el.innerHTML = "<p>Failed to load.</p>"; });
}
