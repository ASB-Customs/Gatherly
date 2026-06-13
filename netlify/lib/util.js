// Shared backend helpers used by all Gatherly functions.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

export const redirect = (url, headers = {}) =>
  new Response(null, { status: 302, headers: { Location: url, ...headers } });

// ---------- stores ----------
export const usersStore = () => getStore("users");
export const eventsStore = () => getStore("events");
export const miscStore = () => getStore("misc");
export const imagesStore = () => getStore("images");
export const ticketsStore = () => getStore("tickets");
export const auditStore = () => getStore("audit");
export const codesStore = () => getStore("adminCodes"); // NEW: executive-issued role codes

// ---------- secrets ----------
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET env var is not set");
  return s;
}

// ---------- session cookie (HMAC-signed) ----------
const COOKIE = "gatherly_session";

export function makeSessionCookie(userId, days = 30) {
  const exp = Date.now() + days * 86400000;
  const payload = `${userId}.${exp}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`;
}

export const clearSessionCookie = () =>
  `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function readSession(req) {
  const cookies = req.headers.get("cookie") || "";
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [userId, exp, sig] = m[1].split(".");
  if (!userId || !exp || !sig) return null;
  const expect = crypto.createHmac("sha256", secret()).update(`${userId}.${exp}`).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  } catch { return null; }
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

// ---------- role helpers ----------
// Staff = admin OR executive (moderation surface).
export const isStaff = (u) => Boolean(u && (u.role === "admin" || u.role === "executive"));
// Exec = executive only (ultimate power: roles, codes, site-critical settings).
export const isExec = (u) => Boolean(u && u.role === "executive");

// ---------- encryption for stored ER:LC keys (AES-256-GCM) ----------
function encKey() {
  return crypto.scryptSync(secret(), "gatherly-erlc-key", 32);
}

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

// ---------- rate limiting (coarse, blob-backed) ----------
// Allows `limit` hits per `windowSec` for a given bucket key (e.g. "create:<userId>").
export async function rateLimit(bucket, limit, windowSec) {
  const store = miscStore();
  const key = `rl_${bucket}`;
  const now = Date.now();
  const rec = (await store.get(key, { type: "json" })) || { hits: [], };
  rec.hits = rec.hits.filter((t) => now - t < windowSec * 1000);
  if (rec.hits.length >= limit) return false;
  rec.hits.push(now);
  await store.setJSON(key, rec);
  return true;
}

export const clientIp = (req) =>
  (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0].trim();

// ---------- audit log ----------
export async function audit(actor, action, detail = {}) {
  try {
    const k = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    await auditStore().setJSON(k, {
      at: new Date().toISOString(),
      actor: actor ? { id: actor.id, username: actor.username, role: actor.role || null } : null,
      action,
      detail,
    });
  } catch { /* never block the action on audit failure */ }
}

// ---------- input helpers ----------
export const clampStr = (v, max) => String(v ?? "").trim().slice(0, max);
export const id = () => crypto.randomBytes(9).toString("base64url");

// Short, human-typeable, unambiguous code (no 0/O/1/I/L). e.g. "GATH-7K4P-9XQ2"
export function adminCode() {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const block = () => Array.from({ length: 4 }, () =>
    alphabet[crypto.randomInt(alphabet.length)]).join("");
  return `GATH-${block()}-${block()}`;
}

export async function postDiscordWebhook(webhookUrl, payload) {
  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return r.ok;
  } catch {
    return false;
  }
}
