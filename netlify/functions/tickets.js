// /api/tickets - support tickets with live chat threads.
//
//   USER  : create, mine, get, reply
//   STAFF : list (open/closed), reply, close, reopen, assign, counts
//
// "Live chat" is polling-based: the frontend fetches `get` every few seconds while a
// thread is open, so new staff/user messages appear without a refresh. New-ticket
// notifications can ping a staff Discord channel via the optional STAFF_DISCORD_WEBHOOK
// env var. The admin panel polls `counts` to badge the Support tab.

import { json, ticketsStore, requireUser, id, postDiscordWebhook } from "../lib/util.js";

const isStaff = (u) => u && (u.role === "admin" || u.role === "executive");

async function allTickets() {
  const store = ticketsStore();
  const { blobs } = await store.list();
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}

const SAFE = (t) => ({
  id: t.id, userId: t.userId, username: t.username, topic: t.topic,
  subject: t.subject, status: t.status, createdAt: t.createdAt,
  updatedAt: t.updatedAt, messages: t.messages,
  assignedTo: t.assignedTo || null, assignedToName: t.assignedToName || null,
});

export default async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const store = ticketsStore();

  const user = await requireUser(req);
  if (!user) return json({ error: "Log in to use support." }, 401);

  // ---- create a ticket (opens a live chat) ----
  if (action === "create" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    if (!b.topic || !b.subject || !b.message) {
      return json({ error: "Topic, subject, and message are all required." }, 400);
    }
    const t = {
      id: id(),
      userId: user.id,
      username: user.username,
      topic: String(b.topic).slice(0, 40),
      subject: String(b.subject).slice(0, 100),
      status: "open",
      assignedTo: null,
      assignedToName: null,
      messages: [{ from: "user", by: user.username, text: String(b.message).slice(0, 2000), at: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.setJSON(t.id, t);
    if (process.env.STAFF_DISCORD_WEBHOOK) {
      postDiscordWebhook(process.env.STAFF_DISCORD_WEBHOOK, {
        username: "Gatherly Support",
        embeds: [{
          title: `New chat: ${t.subject}`,
          description: t.messages[0].text.slice(0, 500),
          color: 0x7fa8ff,
          fields: [{ name: "From", value: `@${t.username}`, inline: true }, { name: "Topic", value: t.topic, inline: true }],
          timestamp: t.createdAt,
        }],
      });
    }
    return json({ ok: true, ticket: SAFE(t) });
  }

  // ---- my tickets ----
  if (action === "mine") {
    const items = (await allTickets()).filter((t) => t.userId === user.id)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return json({ tickets: items.map(SAFE) });
  }

  // ---- fetch one (owner or staff) - used for live chat polling ----
  if (action === "get") {
    const t = await store.get(url.searchParams.get("id") || "", { type: "json" });
    if (!t) return json({ error: "Chat not found." }, 404);
    if (t.userId !== user.id && !isStaff(user)) return json({ error: "Not your chat." }, 403);
    return json({ ticket: SAFE(t) });
  }

  // ---- reply (owner or staff; closed chats are read-only) ----
  if (action === "reply" && req.method === "POST") {
    const t = await store.get(url.searchParams.get("id") || "", { type: "json" });
    if (!t) return json({ error: "Chat not found." }, 404);
    if (t.userId !== user.id && !isStaff(user)) return json({ error: "Not your chat." }, 403);
    if (t.status === "closed") return json({ error: "This chat is closed." }, 400);
    const b = await req.json().catch(() => ({}));
    if (!b.text) return json({ error: "Message text required." }, 400);
    const fromStaff = t.userId !== user.id;
    t.messages.push({
      from: fromStaff ? "staff" : "user",
      by: user.username,
      text: String(b.text).slice(0, 2000),
      at: new Date().toISOString(),
    });
    // First staff reply auto-claims the chat if unassigned.
    if (fromStaff && !t.assignedTo) { t.assignedTo = user.id; t.assignedToName = user.username; }
    t.updatedAt = new Date().toISOString();
    await store.setJSON(t.id, t);
    return json({ ok: true, ticket: SAFE(t) });
  }

  // ================= STAFF =================

  // ---- list by status ----
  if (action === "list") {
    if (!isStaff(user)) return json({ error: "Staff only." }, 403);
    const status = url.searchParams.get("status") || "open";
    const items = (await allTickets()).filter((t) => t.status === status)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return json({ tickets: items.map(SAFE) });
  }

  // ---- counts for the panel badge ----
  if (action === "counts") {
    if (!isStaff(user)) return json({ error: "Staff only." }, 403);
    const items = await allTickets();
    const open = items.filter((t) => t.status === "open");
    return json({
      open: open.length,
      unassigned: open.filter((t) => !t.assignedTo).length,
    });
  }

  // ---- claim / assign a chat to the current staff member ----
  if (action === "assign" && req.method === "POST") {
    if (!isStaff(user)) return json({ error: "Staff only." }, 403);
    const t = await store.get(url.searchParams.get("id") || "", { type: "json" });
    if (!t) return json({ error: "Chat not found." }, 404);
    t.assignedTo = user.id;
    t.assignedToName = user.username;
    t.updatedAt = new Date().toISOString();
    await store.setJSON(t.id, t);
    return json({ ok: true, ticket: SAFE(t) });
  }

  // ---- close a chat (mark resolved) ----
  if (action === "close" && req.method === "POST") {
    if (!isStaff(user)) return json({ error: "Only staff can close chats." }, 403);
    const t = await store.get(url.searchParams.get("id") || "", { type: "json" });
    if (!t) return json({ error: "Chat not found." }, 404);
    t.status = "closed";
    t.messages.push({ from: "staff", by: user.username, text: "— Chat marked resolved —", at: new Date().toISOString() });
    t.updatedAt = new Date().toISOString();
    await store.setJSON(t.id, t);
    return json({ ok: true, ticket: SAFE(t) });
  }

  // ---- reopen a closed chat ----
  if (action === "reopen" && req.method === "POST") {
    if (!isStaff(user)) return json({ error: "Only staff can reopen chats." }, 403);
    const t = await store.get(url.searchParams.get("id") || "", { type: "json" });
    if (!t) return json({ error: "Chat not found." }, 404);
    t.status = "open";
    t.messages.push({ from: "staff", by: user.username, text: "— Chat reopened —", at: new Date().toISOString() });
    t.updatedAt = new Date().toISOString();
    await store.setJSON(t.id, t);
    return json({ ok: true, ticket: SAFE(t) });
  }

  return json({ error: "Unknown action." }, 404);
};
