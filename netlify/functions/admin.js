// /api/admin - control room: users, credits, plans, roles, events,
// announcements (cycling banners), notifications (dismissable toast), audit, codes.
import {
  json, requireUser, isStaff, isExec, usersStore, eventsStore, miscStore,
  auditStore, codesStore, audit, clampStr, adminCode, normalizePlan, PLAN_INFO,
} from "../lib/util.js";

export default async (req) => {
  try { return await handler(req); }
  catch (e) { return json({ error: "Server error: " + (e?.message || "unknown") }, 500); }
};

async function handler(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "content" && req.method === "GET") {
    const content = (await miscStore().get("siteContent", { type: "json" })) || {};
    const now = Date.now();
    const announcements = (content.announcements || []).filter((a) => !a.expiresAt || new Date(a.expiresAt).getTime() > now);
    const notifications = (content.notifications || []).filter((n) => !n.expiresAt || new Date(n.expiresAt).getTime() > now);
    return json({ content: { ...content, announcements, notifications } });
  }

  if (action === "redeem-code" && req.method === "POST") {
    const user = await requireUser(req);
    if (!user) return json({ error: "Log in first." }, 401);
    const b = await req.json().catch(() => ({}));
    const codeStr = clampStr(b.code, 40).toUpperCase();
    if (!codeStr) return json({ error: "Enter your access code." }, 400);
    const store = codesStore();
    const rec = await store.get(codeStr, { type: "json" });
    if (!rec || rec.revoked) { await audit(user, "code.redeem-failed", { code: codeStr }); return json({ error: "That code is not valid or has been revoked." }, 403); }
    const grant = "admin";
    await usersStore().setJSON(user.id, { ...user, role: grant, updatedAt: new Date().toISOString() });
    rec.redemptions = rec.redemptions || [];
    rec.redemptions.push({ userId: user.id, username: user.username, at: new Date().toISOString() });
    rec.lastRedeemedAt = new Date().toISOString();
    await store.setJSON(codeStr, rec);
    await audit({ ...user, role: grant }, "code.redeem-success", { code: codeStr, granted: grant });
    return json({ ok: true, role: grant });
  }

  if (action === "claim-exec" && req.method === "POST") {
    const user = await requireUser(req);
    if (!user) return json({ error: "Log in first." }, 401);
    const setup = process.env.EXEC_SETUP_CODE;
    if (!setup) return json({ error: "Executive setup is not enabled on this site." }, 400);
    const b = await req.json().catch(() => ({}));
    if (clampStr(b.code, 200) !== setup) { await audit(user, "exec.claim-failed", {}); return json({ error: "That setup code is not correct." }, 403); }
    await usersStore().setJSON(user.id, { ...user, role: "executive", updatedAt: new Date().toISOString() });
    await audit({ ...user, role: "executive" }, "exec.claim-success", {});
    return json({ ok: true, role: "executive" });
  }

  const user = await requireUser(req);
  if (!isStaff(user)) return json({ error: "Not found." }, 404);
  const evStore = eventsStore();
  const uStore = usersStore();

  if (action === "whoami") return json({ id: user.id, username: user.username, role: user.role });

  if (action === "users" || action === "users-search") {
    const q = (url.searchParams.get("q") || "").toLowerCase().trim();
    const { blobs } = await uStore.list();
    const all = await Promise.all(blobs.map((b) => uStore.get(b.key, { type: "json" })));
    let users = all.filter(Boolean);
    if (q) users = users.filter((u) => (u.username?.toLowerCase().includes(q) || u.id?.toLowerCase().includes(q) || u.discordId?.toLowerCase().includes(q)));
    users = users.slice(0, 50).map((u) => ({ id: u.id, username: u.username, plan: normalizePlan(u.plan), role: u.role || null, credits: u.credits ?? 0, suspended: Boolean(u.suspended), createdAt: u.createdAt, discordId: u.discordId, avatar: u.avatar || null }));
    return json({ users });
  }

  if (action === "user-get") {
    const u = await uStore.get(url.searchParams.get("id"), { type: "json" });
    if (!u) return json({ error: "User not found." }, 404);
    return json({ user: { id: u.id, username: u.username, plan: normalizePlan(u.plan), role: u.role || null, credits: u.credits ?? 0, suspended: Boolean(u.suspended), discordId: u.discordId, avatar: u.avatar || null } });
  }

  if ((action === "credits-add" || action === "credits-remove" || action === "credits-set") && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const target = await uStore.get(b.userId, { type: "json" });
    if (!target) return json({ error: "User not found." }, 404);
    const amount = parseInt(b.amount, 10);
    if (!Number.isFinite(amount) || amount < 0) return json({ error: "Enter a valid number." }, 400);
    let credits = target.credits ?? 0;
    if (action === "credits-add") credits += amount;
    else if (action === "credits-remove") credits = Math.max(0, credits - amount);
    else credits = amount;
    await uStore.setJSON(b.userId, { ...target, credits, updatedAt: new Date().toISOString() });
    await audit(user, action, { targetId: b.userId, amount, newTotal: credits });
    return json({ ok: true, credits });
  }

  if (action === "set-plan" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const target = await uStore.get(b.userId, { type: "json" });
    if (!target) return json({ error: "User not found." }, 404);
    const plan = normalizePlan(b.plan);
    const grant = PLAN_INFO[plan].weeklyCredits;
    await uStore.setJSON(b.userId, { ...target, plan, planVia: "admin", planSetAt: new Date().toISOString(), credits: (target.credits ?? 0) + grant, updatedAt: new Date().toISOString() });
    await audit(user, "user.set-plan", { targetId: b.userId, plan, creditsGranted: grant });
    return json({ ok: true, plan });
  }

  if (action === "set-role" && req.method === "POST") {
    if (!isExec(user)) return json({ error: "Executive only." }, 403);
    const b = await req.json().catch(() => ({}));
    const target = await uStore.get(b.userId, { type: "json" });
    if (!target) return json({ error: "User not found." }, 404);
    if (![null, "admin", "executive"].includes(b.role)) return json({ error: "Invalid role." }, 400);
    await uStore.setJSON(b.userId, { ...target, role: b.role || null, updatedAt: new Date().toISOString() });
    await audit(user, "user.set-role", { targetId: b.userId, role: b.role });
    return json({ ok: true });
  }

  if (action === "suspend" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const target = await uStore.get(b.userId, { type: "json" });
    if (!target) return json({ error: "User not found." }, 404);
    await uStore.setJSON(b.userId, { ...target, suspended: Boolean(b.suspended), suspendReason: clampStr(b.reason, 200) || null, updatedAt: new Date().toISOString() });
    await audit(user, b.suspended ? "user.suspend" : "user.unsuspend", { targetId: b.userId, reason: b.reason });
    return json({ ok: true, suspended: Boolean(b.suspended) });
  }

  if (action === "wipe-listings" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const { blobs } = await evStore.list();
    const all = await Promise.all(blobs.map((x) => evStore.get(x.key, { type: "json" })));
    let removed = 0;
    for (const e of all) if (e && e.userId === b.userId) { await evStore.delete(e.id); removed++; }
    await audit(user, "user.wipe-listings", { targetId: b.userId, removed });
    return json({ ok: true, removed });
  }

  if (action === "events") {
    const { blobs } = await evStore.list();
    const events = (await Promise.all(blobs.map((b) => evStore.get(b.key, { type: "json" })))).filter(Boolean);
    return json({ events: events.sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt)).slice(0, 200) });
  }

  if (action === "boost" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const ev = await evStore.get(b.id, { type: "json" });
    if (!ev) return json({ error: "Event not found." }, 404);
    ev.boosted = !ev.boosted; ev.boostedAt = ev.boosted ? new Date().toISOString() : null;
    await evStore.setJSON(b.id, ev);
    await audit(user, ev.boosted ? "event.boost" : "event.unboost", { eventId: b.id });
    return json({ ok: true, boosted: ev.boosted });
  }

  if (action === "end-event" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const ev = await evStore.get(b.id, { type: "json" });
    if (!ev) return json({ error: "Event not found." }, 404);
    ev.startsAt = new Date(Date.now() - (ev.durationMin || 60) * 60000 - 1000).toISOString();
    await evStore.setJSON(b.id, ev);
    await audit(user, "event.end", { eventId: b.id });
    return json({ ok: true });
  }

  if (action === "delete-event" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    await evStore.delete(b.id);
    await audit(user, "event.delete", { eventId: b.id });
    return json({ ok: true });
  }

  if (action === "announce-add" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const text = clampStr(b.text, 240);
    if (!text) return json({ error: "Announcement text is required." }, 400);
    const content = (await miscStore().get("siteContent", { type: "json" })) || {};
    content.announcements = content.announcements || [];
    const mins = parseInt(b.durationMin, 10);
    content.announcements.push({ id: adminCode().slice(5), text, link: clampStr(b.link, 300) || null, expiresAt: Number.isFinite(mins) && mins > 0 ? new Date(Date.now() + mins * 60000).toISOString() : null, by: user.username, at: new Date().toISOString() });
    await miscStore().setJSON("siteContent", content);
    await audit(user, "announce.add", { text });
    return json({ ok: true, announcements: content.announcements });
  }

  if (action === "announce-remove" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const content = (await miscStore().get("siteContent", { type: "json" })) || {};
    content.announcements = (content.announcements || []).filter((a) => a.id !== b.id);
    await miscStore().setJSON("siteContent", content);
    await audit(user, "announce.remove", { id: b.id });
    return json({ ok: true, announcements: content.announcements });
  }

  if (action === "announce-list") {
    const content = (await miscStore().get("siteContent", { type: "json" })) || {};
    return json({ announcements: content.announcements || [] });
  }

  if (action === "notify-add" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const title = clampStr(b.title, 80), body = clampStr(b.body, 300);
    if (!title) return json({ error: "Notification title is required." }, 400);
    const content = (await miscStore().get("siteContent", { type: "json" })) || {};
    content.notifications = content.notifications || [];
    const mins = parseInt(b.durationMin, 10);
    content.notifications.push({ id: adminCode().slice(5), title, body, link: clampStr(b.link, 300) || null, expiresAt: Number.isFinite(mins) && mins > 0 ? new Date(Date.now() + mins * 60000).toISOString() : null, by: user.username, at: new Date().toISOString() });
    await miscStore().setJSON("siteContent", content);
    await audit(user, "notify.add", { title });
    return json({ ok: true, notifications: content.notifications });
  }

  if (action === "notify-remove" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const content = (await miscStore().get("siteContent", { type: "json" })) || {};
    content.notifications = (content.notifications || []).filter((n) => n.id !== b.id);
    await miscStore().setJSON("siteContent", content);
    await audit(user, "notify.remove", { id: b.id });
    return json({ ok: true, notifications: content.notifications });
  }

  if (action === "set-content" && req.method === "POST") {
    if (!isExec(user)) return json({ error: "Executive only." }, 403);
    const b = await req.json().catch(() => ({}));
    const current = (await miscStore().get("siteContent", { type: "json" })) || {};
    if (typeof b.heroHeadline === "string") current.heroHeadline = clampStr(b.heroHeadline, 120);
    if (typeof b.heroSub === "string") current.heroSub = clampStr(b.heroSub, 200);
    await miscStore().setJSON("siteContent", current);
    await audit(user, "site.content-update", {});
    return json({ ok: true });
  }

  if (action === "gen-code" && req.method === "POST") {
    if (!isExec(user)) return json({ error: "Executive only." }, 403);
    const b = await req.json().catch(() => ({}));
    const code = adminCode();
    const role = b.role === "executive" ? "executive" : "admin";
    await codesStore().setJSON(code, { code, role, createdBy: user.id, createdAt: new Date().toISOString(), revoked: false, redemptions: [] });
    await audit(user, "code.generate", { code, role });
    return json({ ok: true, code });
  }

  if (action === "revoke-code" && req.method === "POST") {
    if (!isExec(user)) return json({ error: "Executive only." }, 403);
    const b = await req.json().catch(() => ({}));
    const rec = await codesStore().get(b.code, { type: "json" });
    if (!rec) return json({ error: "Code not found." }, 404);
    await codesStore().setJSON(b.code, { ...rec, revoked: true, revokedAt: new Date().toISOString() });
    await audit(user, "code.revoke", { code: b.code });
    return json({ ok: true });
  }

  if (action === "codes") {
    if (!isExec(user)) return json({ error: "Executive only." }, 403);
    const { blobs } = await codesStore().list();
    const codes = await Promise.all(blobs.map((b) => codesStore().get(b.key, { type: "json" })));
    return json({ codes: codes.filter(Boolean) });
  }

  if (action === "audit") {
    const { blobs } = await auditStore().list();
    const entries = (await Promise.all(blobs.map((b) => auditStore().get(b.key, { type: "json" })))).filter(Boolean);
    return json({ entries: entries.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 200) });
  }

  return json({ error: "Unknown action." }, 404);
}
