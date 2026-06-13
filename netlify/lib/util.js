// Shared backend helpers used by all Gatherly functions.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

export const redirect = (url, headers = {}) =>
  new Response(null, { status: 302, headers: { Location: url, ...headers } });

export const usersStore = () => getStore("users");
export const eventsStore = () => getStore("events");
export const miscStore = () => getStore("misc");
export const imagesStore = () => getStore("images");
export const ticketsStore = () => getStore("tickets");
export const auditStore = () => getStore("audit");
export const codesStore = () => getStore("adminCodes");

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

export const isStaff = (u) => Boolean(u && (u.role === "admin" || u.role === "executive"));
export const isExec = (u) => Boolean(u && u.role === "executive");

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

export async function rateLimit(bucket, limit, windowSec) {
  const store = miscStore();
  const key = `rl_${bucket}`;
  const now = Date.now();
  const rec = (await store.get(key, { type: "json" })) || { hits: [] };
  rec.hits = rec.hits.filter((t) => now - t < windowSec * 1000);
  if (rec.hits.length >= limit) return false;
  rec.hits.push(now);
  await store.setJSON(key, rec);
  return true;
}

export const clientIp = (req) =>
  (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();

export async function audit(actor, action, detail = {}) {
  try {
    const k = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    await auditStore().setJSON(k, { at: new Date().toISOString(), actor: actor ? { id: actor.id, username: actor.username, role: actor.role || null } : null, action, detail, level: detail && detail.error ? "error" : "info" });
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
  if (m.includes("429") || m.includes("rate limit")) return { what: "Too many requests to the ER:LC API in a short window.", fix: "Wait about 60 seconds and retry." };
  if (m.includes("timeout") || m.includes("did not respond")) return { what: "A third-party service did not respond in time.", fix: "Usually temporary. Retry shortly. If it persists, check PRC or Discord status." };
  if (m.includes("dm blocked") || m.includes("could not open a dm")) return { what: "The Gatherly bot could not DM the user.", fix: "The user must share a server with the bot and allow DMs from server members." };
  if (m.includes("anthropic")) return { what: "The AI summary service is not configured or failed.", fix: "Set ANTHROPIC_API_KEY in Netlify environment variables." };
  if (m.includes("discord_bot_token") || m.includes("bot not configured")) return { what: "The Discord bot token is missing.", fix: "Set DISCORD_BOT_TOKEN in Netlify environment variables and invite the bot to your server." };
  if (m.includes("not your event") || m.includes("not found")) return { what: "The target record does not exist or is owned by someone else.", fix: "Refresh the list and try again." };
  if (m.includes("credit")) return { what: "The user does not have enough boost credits.", fix: "Buy more credits on the pricing page or have an admin grant credits." };
  return { what: "An unexpected error occurred.", fix: "Check the Netlify function logs for the full stack trace." };
}

export const clampStr = (v, max) => String(v ?? "").trim().slice(0, max);
export const id = () => crypto.randomBytes(9).toString("base64url");

export function adminCode() {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const block = () => Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  return `GATH-${block()}-${block()}`;
}

export async function postDiscordWebhook(webhookUrl, payload) {
  try {
    const r = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch { return false; }
}

export const PLAN_INFO = {
  free:  { id: "free",  name: "Gatherly",       level: 0, weeklyCredits: 0 },
  pro:   { id: "pro",   name: "Gatherly Pro",   level: 1, weeklyCredits: 2 },
  ultra: { id: "ultra", name: "Gatherly Ultra", level: 2, weeklyCredits: 6 },
};

export function normalizePlan(plan) {
  const map = { patrol: "free", sergeant: "pro", commander: "ultra", network: "ultra" };
  const p = map[plan] || plan || "free";
  return PLAN_INFO[p] ? p : "free";
}

export const planLevel = (plan) => PLAN_INFO[normalizePlan(plan)].level;
export const planName = (plan) => PLAN_INFO[normalizePlan(plan)].name;
