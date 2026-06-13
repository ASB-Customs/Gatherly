// /api/tickets - support tickets with live chat and Discord relay.
import { json, ticketsStore, requireUser, id, postDiscordWebhook } from "../lib/util.js";

const isStaff = (u) => u && (u.role === "admin" || u.role === "executive");

// The specific support channel for staff
const SUPPORT_CHANNEL_ID = "1515235842292187246";

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

// Send a message to the support Discord channel
async function postToSupportChannel(ticket, messageText, fromUsername) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false };
  try {
    const embed = {
      title: `Support Ticket #${ticket.id.slice(0, 8)} - ${ticket.subject}`,
      description: messageText,
      color: 0x7fa8ff,
      fields: [
        { name: "From", value: `@${fromUsername}`, inline: true },
        { name: "Topic", value: ticket.topic, inline: true },
        { name: "Status", value: ticket.status, inline: true },
        { name: "Ticket ID", value: ticket.id, inline: false },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "Reply to this ticket via the Gatherly admin panel or use /reply in Discord" },
    };
    const r = await fetch(`https://discord.com/api/v10/channels/${SUPPORT_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    return { ok: r.ok };
  } catch { return { ok: false }; }
}

// DM a user via bot
async function dmUser(discordId, messageText, ticketSubject) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !discordId) return { ok: false };
  try {
    const H = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
    const ch = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST", headers: H, body: JSON.stringify({ recipient_id: discordId }),
    });
    if (!ch.ok) return { ok: false };
    const { id: channelId } = await ch.json();
    const embed = {
      title: `Support reply: ${ticketSubject}`,
      description: messageText,
      color: 0x7fa8ff,
      timestamp: new Date().toISOString(),
      footer: { text: "Gatherly Support · Reply at gatherly-events.netlify.app/contact" },
    };
    const msg = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method:
