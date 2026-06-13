// Shared backend helpers used by all Gatherly functions.
// This is the foundation file: every /api/* function imports from here.
// Safe to drop in over netlify/lib/util.js wholesale.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

/* =========================================================================
   TUNABLE CONSTANTS  (change these freely, nothing else depends on the value)
   ========================================================================= */
export const PLAYER_CAP = 40;                 // ER:LC servers hold max 40 in-server. Queue can exceed this.
export const BLACKLIST_ROLE_ID_DEFAULT = "1515466445084037285";
const PRO_MONTHLY_CREDITS = 8;                // boost credits granted each month on Pro
const ULTRA_MONTHLY_CREDITS = 24;             // boost credits granted each month on Ultra
const EVENT_CAP_FREE = 6;
const EVENT_CAP_PRO = 14;
const EVENT_CAP_ULTRA = 21;

/* =========================================================================
   HTTP HELPERS
   ========================================================================= */
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

export const redirect = (url, headers = {}) =>
  new Response(null, { status: 302, headers: { Location: url, ...headers } });

/* =========================================================================
   STORES
   ========================================================================= */
export const usersStore = () => getStore("users");
export const eventsStore = () => getStore("events");
export const miscStore = () => getStore("misc");
export const imagesStore = () => getStore("images");
export const ticketsStore = () => getStore("tickets");
export const auditStore = () => getStore("audit");
export const codesStore = () => getStore("adminCodes");

/* =========================================================================
   SECRETS / SESSION
   ========================================================================= */
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET env var is not set");
  return s;
}

const COOKIE = "gatherly_session";

export function makeSessionCookie(userId, days = 30) {
  const exp = Date.now() + days * 86400000;
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`;
}

export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function readSession(req) {
  const cookies = req.headers.get("cookie") || "";
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [userId, exp, sig] = m[1].split(".");
  if (!userId || !exp || !sig) return null;
  const expect = crypto.createHmac("sha256", secret()).update(`${userId}.${exp}`).digest("base64url");
  try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null; } catch { return null; }
  if (Number(exp) < Date.now()) return null;
  return { userId };
}

export async function requireUser(req) {
  const s = readSession(req);
  if (!s) return null;
  const user = await usersStore().get(s.userId, { type: "json" });
  if (!user || user.suspended) return null;
  return user;
}

/* =========================================================================
   ROLES
   ========================================================================= */
export const isStaff = (u) => Boolean(u && (u.role === "admin" || u.role === "executive"));
export const isExec = (u) => Boolean(u && u.role === "executive");

/* =========================================================================
   ENCRYPTION (AES-256-GCM) for stored ER:LC keys
   ========================================================================= */
function encKey() { return crypto.scryptSync(secret(), "gatherly-erlc-key", 32); }

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function decrypt(blob) {
  const [iv, tag, data] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/* =========================================================================
   RATE LIMITING + WATCHDOG
   rateState returns { ok, retryAfter } so callers can show a precise wait.
   guard() is the one-liner: it rate-limits AND flags the watchdog on a trip.
   ========================================================================= */
export async function rateState(bucket, limit, windowSec) {
  const store = miscStore();
  const key = `rl_${bucket}`;
  const now = Date.now();
  const rec = (await store.get(key, { type: "json" })) || { hits: [] };
  rec.hits = rec.hits.filter((t) => now - t < windowSec * 1000);
  if (rec.hits.length >= limit) {
    const oldest = Math.min(...rec.hits);
    const retryAfter = Math.max(1, Math.ceil((windowSec * 1000 - (now - oldest)) / 1000));
    return { ok: false, retryAfter };
  }
  rec.hits.push(now);
  await store.setJSON(key, rec);
  return { ok: true, retryAfter: 0 };
}

// Backward-compatible boolean form (existing code keeps working).
export async function rateLimit(bucket, limit, windowSec) {
  return (await rateState(bucket, limit, windowSec)).ok;
}

// Drop-in protection for any action endpoint.
// Usage:  const blocked = await guard(req, user, `create:${user.id}`, 5, 60); if (blocked) return blocked;
export async function guard(req, actor, bucket, limit, windowSec, opts = {}) {
  const st = await rateState(bucket, limit, windowSec);
  if (st.ok) return null;
  await flagWatchdog(actor, req, opts.kind || "rate-limit", {
    what: opts.what || `Tripped the limit on \`${bucket}\` (${limit} per ${windowSec}s).`,
    risk: opts.risk || "Rapid repeated requests to an action endpoint. Possible scripted abuse or accidental flooding.",
    bucket, limit, windowSec, retryAfter: st.retryAfter,
  });
  return json({ error: `You are doing this too fast, please wait ${st.retryAfter}s and try again.`, retryAfter: st.retryAfter }, 429);
}

// Automated safety flag, modelled on Discord automod: who, what, and the risk.
export async function flagWatchdog(actor, req, kind, detail = {}) {
  await audit(actor, `watchdog.${kind}`, { ...detail, watchdog: true });
  const url = process.env.WATCHDOG_WEBHOOK_URL;
  if (!url) return;
  let path = "unknown", ip = "unknown";
  try { if (req) { const u = new URL(req.url); path = u.pathname + u.search; ip = clientIp(req); } } catch {}
  await postDiscordWebhook(url, {
    username: "Gatherly Watchdog",
    embeds: [{
      title: `Flagged activity: ${kind}`,
      description: detail.risk || "Suspicious activity detected.",
      color: 0xff5c5c,
      fields: [
        { name: "User", value: actor ? `${actor.username || "unknown"} (\`${actor.id || "?"}\`)` : `Anonymous (\`${ip}\`)`, inline: false },
        { name: "What happened", value: String(detail.what || "An action endpoint limit was tripped.").slice(0, 900), inline: false },
        { name: "Endpoint", value: `\`${path}\``, inline: true },
        { name: "IP", value: `\`${ip}\``, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "Gatherly Watchdog - automated safety flag" },
    }],
  });
}

export const clientIp = (req) =>
  (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();

/* =========================================================================
   AUDIT LOG
   ========================================================================= */
export async function audit(actor, action, detail = {}) {
  try {
    const k = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const level = detail && detail.watchdog ? "warn" : (detail && detail.error ? "error" : "info");
    await auditStore().setJSON(k, { at: new Date().toISOString(), actor: actor ? { id: actor.id, username: actor.username, role: actor.role || null } : null, action, detail, level });
  } catch {}
}

export async function auditError(actor, action, errorMessage) {
  const d = diagnose(errorMessage);
  await audit(actor, action, { error: errorMessage, diagnosis: d.what, fix: d.fix });
}

export function diagnose(msg = "") {
  const m = String(msg).toLowerCase();
  if (m.includes("session_secret")) return { what: "The SESSION_SECRET environment variable is missing.", fix: "In Netlify, Site configuration, Environment variables, add SESSION_SECRET set to any long random string, then redeploy." };
  if (m.includes("401") || m.includes("403") || m.includes("rejected the key")) return { what: "The ER:LC API rejected the saved server key.", fix: "Re-copy the key from in-game Server Settings then API. The server must own the ER:LC API Pack. No spaces or quotes." };
  if (m.includes("422")) return { what: "The ER:LC server is offline or empty.", fix: "Start the private server in-game and try again." };
  if (m.includes("429") || m.includes("rate limit")) return { what: "Too many requests in a short window.", fix: "Wait a short while and retry." };
  if (m.includes("timeout") || m.includes("did not respond")) return { what: "A third-party service did not respond in time.", fix: "Usually temporary. Retry shortly. If it persists, check PRC or Discord status." };
  if (m.includes("dm blocked") || m.includes("could not open a dm")) return { what: "The Gatherly bot could not DM the user.", fix: "The user must share a server with the bot and allow DMs from server members." };
  if (m.includes("anthropic")) return { what: "The AI service is not configured or failed.", fix: "Set ANTHROPIC_API_KEY in Netlify environment variables." };
  if (m.includes("discord_bot_token") || m.includes("bot not configured")) return { what: "The Discord bot token is missing.", fix: "Set DISCORD_BOT_TOKEN in Netlify environment variables and invite the bot to your server." };
  if (m.includes("stripe")) return { what: "A Stripe operation failed or is misconfigured.", fix: "Check STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Netlify env vars." };
  if (m.includes("not your event") || m.includes("not found")) return { what: "The target record does not exist or is owned by someone else.", fix: "Refresh the list and try again." };
  if (m.includes("credit")) return { what: "The user does not have enough boost credits.", fix: "Buy more credits on the pricing page or have an admin grant credits." };
  return { what: "An unexpected error occurred.", fix: "Check the Netlify function logs for the full stack trace." };
}

/* =========================================================================
   INPUT HELPERS + CODES
   ========================================================================= */
export const clampStr = (v, max) => String(v ?? "").trim().slice(0, max);
export const id = () => crypto.randomBytes(9).toString("base64url");

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L
function codeBlocks(prefix, blocks, len) {
  const block = () => Array.from({ length: len }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");
  return `${prefix}-` + Array.from({ length: blocks }, block).join("-");
}
// Admin: 4 blocks of 5  ->  ~20 random chars. Far beyond brute-forcing with rate limits in place.
export const adminCode = () => codeBlocks("GATH", 4, 5);
// Executive: 6 blocks of 6  ->  ~36 random chars. Much longer again.
export const execCode = () => codeBlocks("GEXE", 6, 6);

/* =========================================================================
   DISCORD (bot REST) HELPERS
   ========================================================================= */
const DISCORD_API = "https://discord.com/api/v10";

export async function discordBotFetch(path, opts = {}, ms = 8000) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { ok: false, status: 0, json: async () => ({}) };
  return fetch(`${DISCORD_API}${path}`, { ...opts, headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) }, signal: AbortSignal.timeout(ms) });
}

export const guildId = () => process.env.GATHERLY_GUILD_ID || null;
export const blacklistRoleId = () => process.env.BLACKLIST_ROLE_ID || BLACKLIST_ROLE_ID_DEFAULT;

// true / false / null(unknown or not configured)
export async function isGuildMember(discordId) {
  const gid = guildId();
  if (!gid || !discordId) return null;
  try {
    const r = await discordBotFetch(`/guilds/${gid}/members/${discordId}`);
    if (r.status === 200) return true;
    if (r.status === 404) return false;
    return null;
  } catch { return null; }
}

export async function addGuildRole(discordId, roleId = blacklistRoleId()) {
  const gid = guildId();
  if (!gid || !discordId || !roleId) return false;
  try { return (await discordBotFetch(`/guilds/${gid}/members/${discordId}/roles/${roleId}`, { method: "PUT" })).ok; } catch { return false; }
}

export async function removeGuildRole(discordId, roleId = blacklistRoleId()) {
  const gid = guildId();
  if (!gid || !discordId || !roleId) return false;
  try { return (await discordBotFetch(`/guilds/${gid}/members/${discordId}/roles/${roleId}`, { method: "DELETE" })).ok; } catch { return false; }
}

// Sends a DM. Pass `components` for buttons. Returns { ok, channelId }.
export async function dmUserEmbed(discordId, embed, components = null) {
  if (!process.env.DISCORD_BOT_TOKEN || !discordId) return { ok: false };
  try {
    const ch = await discordBotFetch("/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: discordId }) });
    if (!ch.ok) return { ok: false };
    const { id: channelId } = await ch.json();
    const body = { embeds: [embed] };
    if (components) body.components = components;
    const r = await discordBotFetch(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify(body) });
    return { ok: r.ok, channelId };
  } catch { return { ok: false }; }
}

export async function postDiscordWebhook(webhookUrl, payload) {
  try {
    const r = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch { return false; }
}

// Shared brand bits for embeds.
export const BRAND = {
  color: 0x7fa8ff,
  green: 0x69d99c,
  red: 0xff7a7a,
  yellow: 0xffcf5c,
  logo: process.env.GATHERLY_LOGO_URL || "https://gatherly-events.netlify.app/assets/logo-white.png",
  footer: "Gatherly",
};

/* =========================================================================
   AI HELPERS (Anthropic)
   - aiText: generic completion
   - aiModerateEvent: gate an event listing before it is published
   ========================================================================= */
async function anthropic(messages, { model = "claude-haiku-4-5-20251001", max_tokens = 400, system } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens, ...(system ? { system } : {}), messages }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.content?.map((c) => c.text || "").join("").trim() || null;
  } catch { return null; }
}

export async function aiText(prompt, opts = {}) { return anthropic([{ role: "user", content: prompt }], opts); }

// Returns { allowed, reason, skipped }.
// Fails OPEN on infrastructure errors (missing key / API blip) so a real outage
// never bricks listings, but records skipped=true. Explicit AI "no" => blocked.
export async function aiModerateEvent(ev = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return { allowed: true, reason: null, skipped: true };
  const prompt = `You are a strict content moderator for "Gatherly", a public events board for the Roblox game ER:LC (Emergency Response: Liberty County) private-server roleplay community. Decide whether the following event listing may be published.

BLOCK the listing if it contains or implies ANY of: sexual or NSFW content, profanity or slurs, harassment or hate, real-world violence or threats, advertising or content unrelated to ER:LC, scams, or fake / troll events that are not genuine ER:LC roleplay.
ALLOW normal ER:LC roleplay events such as patrols, scenarios, car shows, court sessions, training, tryouts, and similar.

Listing:
Title: ${clampStr(ev.title, 200)}
Scenario: ${clampStr(ev.scenario, 200)}
Description: ${clampStr(ev.description || ev.desc, 1500)}
Server code: ${clampStr(ev.code, 60)}

Reply with ONLY a compact JSON object and nothing else, no markdown:
{"allowed": true or false, "reason": "short reason shown to the user if blocked, empty string if allowed"}`;
  const out = await anthropic([{ role: "user", content: prompt }], { max_tokens: 200 });
  if (!out) return { allowed: true, reason: null, skipped: true };
  try {
    const parsed = JSON.parse(out.replace(/```json|```/g, "").trim());
    return {
      allowed: Boolean(parsed.allowed),
      reason: parsed.allowed ? null : clampStr(parsed.reason || "This listing did not pass automated review.", 300),
      skipped: false,
    };
  } catch { return { allowed: true, reason: null, skipped: true }; }
}

/* =========================================================================
   STRIPE WEBHOOK SIGNATURE VERIFICATION
   Verifies the `stripe-signature` header over the RAW request body.
   ========================================================================= */
export function verifyStripeSignature(rawBody, sigHeader, webhookSecret, toleranceSec = 300) {
  if (!sigHeader || !webhookSecret) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=").map((s) => s.trim())));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(`${t}.${rawBody}`).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(v1, "utf8"), Buffer.from(expected, "utf8")); } catch { return false; }
}

/* =========================================================================
   BLOB-BACKED CACHE  (replaces the in-memory Map that never persisted)
   ========================================================================= */
export async function cacheGet(key) {
  try {
    const rec = await miscStore().get(`cache_${key}`, { type: "json" });
    if (!rec) return null;
    if (rec.exp && rec.exp < Date.now()) return null;
    return rec.val;
  } catch { return null; }
}
export async function cacheSet(key, val, ttlSec = 30) {
  try { await miscStore().setJSON(`cache_${key}`, { val, exp: Date.now() + ttlSec * 1000 }); } catch {}
}

/* =========================================================================
   PLANS / CREDITS / SUBSCRIPTION LIFECYCLE
   - eventCap: how many events the user may LIST per month
   - monthlyCredits: boost credits refreshed each month while subscribed
   ========================================================================= */
export const PLAN_INFO = {
  free:  { id: "free",  name: "Gatherly",       level: 0, monthlyCredits: 0,                    eventCap: EVENT_CAP_FREE  },
  pro:   { id: "pro",   name: "Gatherly Pro",   level: 1, monthlyCredits: PRO_MONTHLY_CREDITS,  eventCap: EVENT_CAP_PRO   },
  ultra: { id: "ultra", name: "Gatherly Ultra", level: 2, monthlyCredits: ULTRA_MONTHLY_CREDITS, eventCap: EVENT_CAP_ULTRA },
};
// Backward-compat alias so any not-yet-updated code reading weeklyCredits still works.
for (const k of Object.keys(PLAN_INFO)) PLAN_INFO[k].weeklyCredits = PLAN_INFO[k].monthlyCredits;

export function normalizePlan(plan) {
  const map = { patrol: "free", sergeant: "pro", commander: "ultra", network: "ultra" };
  const p = map[plan] || plan || "free";
  return PLAN_INFO[p] ? p : "free";
}

export const planLevel = (plan) => PLAN_INFO[normalizePlan(plan)].level;
export const planName = (plan) => PLAN_INFO[normalizePlan(plan)].name;
export const planCap = (plan) => PLAN_INFO[normalizePlan(plan)].eventCap;

export const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

// A subscription counts as active if: lifetime, OR an admin/robux grant with no expiry,
// OR a stripe plan whose planExpiresAt is still in the future.
export function subscriptionActive(user) {
  if (!user) return false;
  if (user.lifetime || user.planVia === "lifetime") return normalizePlan(user.plan) !== "free";
  if (normalizePlan(user.plan) === "free") return false;
  if (!user.planExpiresAt) return true; // admin/robux grant without an explicit expiry
  return new Date(user.planExpiresAt).getTime() > Date.now();
}

// The plan whose FEATURES apply right now. Past reports stay readable regardless,
// because they are stored on each event, but feature gates use this.
export function effectivePlan(user) { return subscriptionActive(user) ? normalizePlan(user.plan) : "free"; }
export const effectiveLevel = (user) => PLAN_INFO[effectivePlan(user)].level;

// Monthly credit handling. Returns { user, changed }; the caller persists if changed.
// While subscribed, the start of a new month refreshes credits to the plan allotment.
// If the subscription has lapsed, existing credits are kept and never topped up again.
export function monthlyResetIfDue(user) {
  if (!user) return { user, changed: false };
  const mk = monthKey();
  if (user.creditsPeriod === mk) return { user, changed: false };
  if (subscriptionActive(user)) {
    const grant = PLAN_INFO[normalizePlan(user.plan)].monthlyCredits;
    return { user: { ...user, credits: grant, creditsPeriod: mk }, changed: true };
  }
  return { user: { ...user, creditsPeriod: mk }, changed: true };
}

export const canCreateEvent = (user, usedThisMonth) => usedThisMonth < planCap(effectivePlan(user));

export const isSupportBlacklisted = (u) => Boolean(u && u.supportBlacklist && u.supportBlacklist.active);
