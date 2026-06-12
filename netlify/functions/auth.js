// /api/auth - Discord OAuth login, session management

import {
  json, redirect, usersStore, eventsStore, requireUser,
  makeSessionCookie, clearSessionCookie, encrypt,
} from "../lib/util.js";

const AUTH_URL = "https://discord.com/oauth2/authorize";
const TOKEN_URL = "https://discord.com/api/oauth2/token";
const USER_URL = "https://discord.com/api/users/@me";

export default async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  // ✅ FORCE YOUR REAL DOMAIN (NO GUESSING = NO ERRORS)
  const SITE_URL = "https://bright-capybara-c7d7a5.netlify.app";

  const redirectUri = `${SITE_URL}/api/auth?action=callback`;

  // ---------------- LOGIN START ----------------
  if (action === "start") {
    if (!clientId || !clientSecret) {
      return redirect("/login?error=Discord not configured");
    }

    const state = crypto.randomUUID();

    const authorize = `${AUTH_URL}?` + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify",
      state,
      prompt: "consent",
    });

    return redirect(authorize, {
      "Set-Cookie": `gatherly_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    });
  }

  // ---------------- CALLBACK ----------------
  if (action === "callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    const cookieState =
      (req.headers.get("cookie") || "").match(/gatherly_state=([^;]+)/)?.[1];

    if (!code || !state || state !== cookieState) {
      return redirect("/login?error=Invalid state");
    }

    // Exchange code for token
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      return redirect("/login?error=Discord rejected login (redirect mismatch)");
    }

    const tokens = await tokenRes.json();

    const infoRes = await fetch(USER_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!infoRes.ok) {
      return redirect("/login?error=Failed to fetch Discord user");
    }

    const info = await infoRes.json();

    const store = usersStore();
    const userId = `dsc_${info.id}`;

    const avatar = info.avatar
      ? `https://cdn.discordapp.com/avatars/${info.id}/${info.avatar}.png`
      : null;

    await store.setJSON(userId, {
      id: userId,
      discordId: info.id,
      username: info.global_name || info.username,
      avatar,
      updatedAt: new Date().toISOString(),
    });

    return redirect("/dashboard", {
      "Set-Cookie": makeSessionCookie(userId),
    });
  }

  // ---------------- ME ----------------
  if (action === "me") {
    const user = await requireUser(req);
    if (!user) return json({ user: null }, 401);

    return json({ user });
  }

  // ---------------- LOGOUT ----------------
  if (action === "logout" && req.method === "POST") {
    return json({ ok: true }, 200, {
      "Set-Cookie": clearSessionCookie(),
    });
  }

  return json({ error: "Unknown action" }, 404);
};
