// /api/admin - staff control surface.
//
// Role model:
//   executive : ultimate power. Generates/revokes admin codes, sets roles,
//               approves admin requests, edits site content, plus everything an admin can do.
//   admin     : moderation. Edit/reschedule/end/delete events, toggle boosts,
//               suspend users, revoke API keys, change plans, view audit log & support.
//
// Every action requires a staff role (stored server-side on the user record) and is
// written to the audit log. Non-staff get a 404, not a 403, so the endpoint does not
// advertise itself.

import {
  json, requireUser, isStaff, isExec, usersStore, eventsStore, miscStore,
  auditStore, codesStore, ticketsStore, audit, clampStr, adminCode,
} from "../lib/util.js";

const MAX_DURATION_MIN = 90;
const endMs = (ev) => new Date(ev.startsAt).getTime() + (ev.durationMin || 60) * 60000;

export default async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ---------- public read: site content (homepage renders it) ----------
  if (action === "content" && req.method === "GET") {
    const content = (await miscStore().get("siteContent", { type: "json" })) || {};
    return json({ content });
  }

  // ---------- self-service role claim / request (any logged-in user) ----------
  // These two are intentionally above the staff gate: a non-staff user uses them
  // to BECOME staff. They are still rate-limited and audit-logged.

  // Claim executive with the one-time env setup code (bootstraps the very first exec).
  if (action === "claim-exec" && req.method === "POST") {
    const user = await requireUser(req);
    if (!user) return json({ error: "Log in first." }, 401);
    const setup = process.env.EXEC_SETUP_CODE;
    if (!setup) return json({ error: "Executive setup is not enabled on this site." }, 400);
    const b = await req.json().catch(() => ({}));
    if (clampStr(b.code, 200) !== setup) {
      await audit(user, "exec.claim-failed", {});
      return json({ error: "That setup code is not correct." }, 403);
    }
    await usersStore().setJSON(user.id, { ...user, role: "executive", updatedAt: new Date().toISOString() });
    await audit({ ...user, role: "executive" }, "exec.claim-success", {});
    return json({ ok: true, role: "executive" });
  }

  // Redeem an executive-generated admin code (reusable until revoked).
  if (action === "redeem-code" && req.method === "POST") {
    const user = await requireUser(req);
    if (!user) return json({ error: "Log in first." }, 401);
    const b = await req.json().catch(() => ({}));
    const codeStr = clampStr(b.code, 40).toUpperCase();
    if (!codeStr) return json({ error: "Enter your access code." }, 400);

    const store = codesStore();
    const rec = await store.get(codeStr, { type: "json" });
    if (!rec || rec.revoked) {
      await audit(user, "code.redeem-failed", { code: codeStr });
      return json({ error: "That code is not valid or has been revoked." }, 403);
    }

    const grant = rec.role === "executive" ? "executive" : "admin";
    await usersStore().setJSON(user.id, { ...user, role: grant, updatedAt: new Date().toISOString() });

    // Track redemptions on the code for the executive's visibility.
    rec.redemptions = rec.redemptions || [];
    rec.redemptions.push({ userId: user.id, username: user.username, at: new Date().toISOString() });
    rec.lastRedeemedAt = new Date().toISOString();
    await store.setJSON(codeStr, rec);

    await audit({ ...user, role: grant }, "code.redeem-success", { code: codeStr, granted: grant });
    return json({ ok: true, role: grant });
  }

  // Request admin access (queued for an executive to approve). No role granted yet.
  if (action === "request-admin" && req.method === "POST") {
    const user = await requireUser(req);
    if (!user) return json({ error: "Log in first." }, 401);
    if (isStaff(user)) return json({ error: "You already have staff access." }, 400);
    const b = await req.json().catch(() => ({}));
    const reqs = (await miscStore().get("adminRequests", { type: "json" })) || {};
    reqs[user.id] = {
      userId: user.id, username: user.username,
      note: clampStr(b.note, 300), at: new Date().toISOString(),
    };
    await miscStore().setJSON("adminRequests", reqs);
    await audit(user, "admin.request", {});
    return json({ ok: true });
  }

  // ---------- everything below requires a staff role ----------
  const user = await requireUser(req);
  if (!isStaff(user)) return json({ error: "Not found." }, 404);

  const evStore = eventsStore();
  const uStore = usersStore();

  // Tell the frontend who it's talking to so it can show/hide exec tools.
  if (action === "whoami") {
    return json({ id: user.id, username: user.username, role: user.role });
  }

  // ---------- events ----------
  if (action === "events") {
    const { blobs } = await evStore.list();
    const events = (await Promise.all(blobs.map((b) => evStore.get(b.key, { type: "json" }))))
      .filter(Boolean)
      .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
      .map((e) => ({
        id: e.id, title: e.title, scenario: e.scenario, hostUsername: e.hostUsername,
        startsAt: e.startsAt, durationMin: e.durationMin, boosted: Boolean(e.boosted),
        views: e.views || 0, hasReport: Boolean(e.lastReport),
        ended: Date.now() > endMs(e),
      }));
    return json({ events });
  }

  if (action === "event-update" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const ev = await evStore.get(b.id || "", { type: "json" });
    if (!ev) return json({ error: "Event not found." }, 404);

    const update = { ...ev };
    if (b.title !== undefined) update.title = clampStr(b.title, 80);
    if (b.description !== undefined) update.description = clampStr(b.description, 400);
    if (b.scenario !== undefined) update.scenario = clampStr(b.scenario, 40);
    if (b.startsAt !== undefined) {
      const d = new Date(b.startsAt);
      if (isNaN(d.getTime())) return json({ error: "Invalid start time." }, 400);
      update.startsAt = d.toISOString();
    }
    if (b.durationMin !== undefined) {
      const dur = Math.round(Number(b.durationMin));
      if (!(dur >= 15 && dur <= MAX_DURATION_MIN)) return json({ error: `Duration must be 15-${MAX_DURATION_MIN} minutes.` }, 400);
      update.durationMin = dur;
    }
    if (b.boosted !== undefined) update.boosted = Boolean(b.boosted);
    await evStore.setJSON(ev.id, update);
    await audit(user, "admin.event-update", { eventId: ev.id, changes: Object.keys(b).filter((k) => k !== "id") });
    return json({ ok: true });
  }

  // End an event now: pull its start back so its end time is in the past, which
  // removes it from the discovery feed immediately (the feed filters ended events).
  if (action === "event-end" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const ev = await evStore.get(b.id || "", { type: "json" });
    if (!ev) return json({ error: "Event not found." }, 404);
    const dur = ev.durationMin || 60;
    const newStart = new Date(Date.now() - dur * 60000 - 1000).toISOString();
    await evStore.setJSON(ev.id, { ...ev, startsAt: newStart, endedEarlyBy: user.username });
    await audit(user, "admin.event-end", { eventId: ev.id, title: ev.title });
    return json({ ok: true });
  }

  if (action === "event-delete" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const ev = await evStore.get(b.id || "", { type: "json" });
    if (!ev) return json({ error: "Event not found." }, 404);
    await evStore.delete(ev.id);
    await audit(user, "admin.event-delete", { eventId: ev.id, title: ev.title, host: ev.hostUsername });
    return json({ ok: true });
  }

  // ---------- users ----------
  if (action === "users") {
    const { blobs } = await uStore.list();
    const users = (await Promise.all(blobs.map((b) => uStore.get(b.key, { type: "json" }))))
      .filter(Boolean)
      .map((u) => ({
        id: u.id, username: u.username, plan: u.plan || "basic", role: u.role || null,
        suspended: Boolean(u.suspended), hasErlcKey: Boolean(u.erlcKeyEnc),
        updatedAt: u.updatedAt,
      }));
    return json({ users });
  }

  if (action === "user-update" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const target = await uStore.get(b.id || "", { type: "json" });
    if (!target) return json({ error: "User not found." }, 404);
    if (target.role === "executive" && !isExec(user)) {
      return json({ error: "Only executives can modify executives." }, 403);
    }

    const update = { ...target, updatedAt: new Date().toISOString() };
    if (b.suspended !== undefined) update.suspended = Boolean(b.suspended);
    if (b.revokeErlcKey) update.erlcKeyEnc = null;
    if (b.plan !== undefined && ["basic", "sergeant", "commander"].includes(b.plan)) update.plan = b.plan;
    await uStore.setJSON(target.id, update);
    await audit(user, "admin.user-update", { userId: target.id, username: target.username, changes: Object.keys(b).filter((k) => k !== "id") });
    return json({ ok: true });
  }

  // ---------- editable site content blocks ----------
  if (action === "content-update" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const content = (await miscStore().get("siteContent", { type: "json" })) || {};
    const allowed = ["heroHeadline", "heroSub", "announcement"];
    for (const k of allowed) if (b[k] !== undefined) content[k] = clampStr(b[k], 200);
    await miscStore().setJSON("siteContent", content);
    await audit(user, "admin.content-update", { keys: Object.keys(b) });
    return json({ ok: true, content });
  }

  // ---------- audit log (newest first) ----------
  if (action === "audit") {
    const store = auditStore();
    const { blobs } = await store.list();
    const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 100);
    const entries = (await Promise.all(keys.map((k) => store.get(k, { type: "json" })))).filter(Boolean);
    return json({ entries });
  }

  // ==========================================================================
  //  EXECUTIVE-ONLY TOOLS
  // ==========================================================================
  const execOnly = [
    "set-role", "admin-requests", "approve-request", "deny-request",
    "codes", "code-create", "code-revoke",
  ];
  if (execOnly.includes(action) && !isExec(user)) {
    return json({ error: "Executive access required." }, 403);
  }

  // ---- set a role directly by username (admin / executive / none) ----
  if (action === "set-role" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const uname = clampStr(b.username, 60);
    const role = b.role;
    if (!["admin", "executive", "none"].includes(role)) return json({ error: "Unknown role." }, 400);

    const { blobs } = await uStore.list();
    const all = (await Promise.all(blobs.map((x) => uStore.get(x.key, { type: "json" })))).filter(Boolean);
    const target = all.find((u) => (u.username || "").toLowerCase() === uname.toLowerCase());
    if (!target) return json({ error: "No user with that username has signed in yet." }, 404);
    if (target.id === user.id && role !== "executive") {
      return json({ error: "You can't remove your own executive role here." }, 400);
    }

    const update = { ...target, updatedAt: new Date().toISOString() };
    if (role === "none") delete update.role; else update.role = role;
    await uStore.setJSON(target.id, update);
    await audit(user, "exec.set-role", { userId: target.id, username: target.username, role });
    return json({ ok: true });
  }

  // ---- admin access requests queue ----
  if (action === "admin-requests") {
    const reqs = (await miscStore().get("adminRequests", { type: "json" })) || {};
    return json({ requests: Object.values(reqs).sort((a, b) => new Date(b.at) - new Date(a.at)) });
  }

  if (action === "approve-request" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const reqs = (await miscStore().get("adminRequests", { type: "json" })) || {};
    const r = reqs[b.userId];
    if (!r) return json({ error: "Request not found." }, 404);
    const target = await uStore.get(b.userId, { type: "json" });
    if (!target) return json({ error: "User not found." }, 404);
    await uStore.setJSON(target.id, { ...target, role: "admin", updatedAt: new Date().toISOString() });
    delete reqs[b.userId];
    await miscStore().setJSON("adminRequests", reqs);
    await audit(user, "exec.approve-request", { userId: target.id, username: target.username });
    return json({ ok: true });
  }

  if (action === "deny-request" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const reqs = (await miscStore().get("adminRequests", { type: "json" })) || {};
    if (reqs[b.userId]) { delete reqs[b.userId]; await miscStore().setJSON("adminRequests", reqs); }
    await audit(user, "exec.deny-request", { userId: b.userId });
    return json({ ok: true });
  }

  // ---- admin codes (reusable until revoked) ----
  if (action === "codes") {
    const store = codesStore();
    const { blobs } = await store.list();
    const codes = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }))))
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((c) => ({
        code: c.code, label: c.label, role: c.role, revoked: Boolean(c.revoked),
        createdBy: c.createdBy, createdAt: c.createdAt,
        uses: (c.redemptions || []).length, lastRedeemedAt: c.lastRedeemedAt || null,
        redeemers: (c.redemptions || []).map((r) => r.username),
      }));
    return json({ codes });
  }

  if (action === "code-create" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const role = b.role === "executive" ? "executive" : "admin";
    const code = adminCode();
    const rec = {
      code, label: clampStr(b.label, 60) || "Untitled code", role,
      revoked: false, createdBy: user.username, createdAt: new Date().toISOString(),
      redemptions: [],
    };
    await codesStore().setJSON(code, rec);
    await audit(user, "exec.code-create", { code, role, label: rec.label });
    return json({ ok: true, code: rec });
  }

  if (action === "code-revoke" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const codeStr = clampStr(b.code, 40).toUpperCase();
    const rec = await codesStore().get(codeStr, { type: "json" });
    if (!rec) return json({ error: "Code not found." }, 404);
    rec.revoked = true;
    await codesStore().setJSON(codeStr, rec);
    await audit(user, "exec.code-revoke", { code: codeStr });
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 404);
};
