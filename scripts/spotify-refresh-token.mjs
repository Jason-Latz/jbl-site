#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri =
  process.env.SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:8787/callback";
const providedAuthCode = process.env.SPOTIFY_AUTH_CODE;
const redirectedUrl = process.env.SPOTIFY_REDIRECTED_URL;

const scopes = [
  "user-read-currently-playing",
  "user-read-recently-played",
  "playlist-read-private",
  // Lets top artists/tracks be queried straight from Spotify (added 2026-11-10).
  "user-top-read"
];

function getAuthCodeFromRedirectUrl(urlValue) {
  if (!urlValue) {
    return null;
  }

  try {
    const parsed = new URL(urlValue);
    const code = parsed.searchParams.get("code");
    return code && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

if (!clientId || !clientSecret) {
  console.error(
    "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in your environment."
  );
  process.exit(1);
}

const redirect = new URL(redirectUri);
const state = randomBytes(16).toString("hex");

const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
authorizeUrl.searchParams.set("client_id", clientId);
authorizeUrl.searchParams.set("response_type", "code");
authorizeUrl.searchParams.set("redirect_uri", redirectUri);
authorizeUrl.searchParams.set("scope", scopes.join(" "));
authorizeUrl.searchParams.set("state", state);
// Re-show the consent screen so the new grant carries every scope above.
authorizeUrl.searchParams.set("show_dialog", "true");

// Manual fallback: SPOTIFY_AUTH_CODE or SPOTIFY_REDIRECTED_URL skips the listener.
let authCode = providedAuthCode ?? getAuthCodeFromRedirectUrl(redirectedUrl);

if (!authCode) {
  // Default: listen on the redirect URI (127.0.0.1:8787/callback) and catch the code.
  authCode = await new Promise((resolveCode, rejectCode) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", redirect.origin);
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const ok = code && url.searchParams.get("state") === state;
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/plain" });
      res.end(
        ok
          ? "Spotify authorized. You can close this tab."
          : `Authorization failed: ${url.searchParams.get("error") ?? "state mismatch"}`
      );
      server.close();
      if (ok) resolveCode(code);
      else rejectCode(new Error("Spotify authorization was denied or invalid."));
    });
    server.listen(Number(redirect.port), redirect.hostname, () => {
      console.log("Open this URL and approve access:");
      console.log(authorizeUrl.toString());
      console.log(`\nWaiting for the callback on ${redirectUri} ...`);
    });
  });
}

const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    )}`,
    "Content-Type": "application/x-www-form-urlencoded"
  },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: authCode,
    redirect_uri: redirectUri
  }).toString()
});

if (!tokenResponse.ok) {
  console.error(`Token exchange failed (${tokenResponse.status}).`);
  console.error(await tokenResponse.text());
  process.exit(1);
}

const payload = await tokenResponse.json();

if (!payload.refresh_token || typeof payload.refresh_token !== "string") {
  console.error("Spotify did not return a refresh token.");
  console.error(
    "If you previously approved this app, remove access in your Spotify account and authorize again."
  );
  process.exit(1);
}

console.log(`Granted scopes: ${payload.scope}`);

// Write the token into .env in place so it never has to be printed or pasted.
const envPath = resolve(process.cwd(), ".env");
const line = `SPOTIFY_REFRESH_TOKEN=${payload.refresh_token}`;
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const next = /^SPOTIFY_REFRESH_TOKEN=.*$/m.test(current)
  ? current.replace(/^SPOTIFY_REFRESH_TOKEN=.*$/m, line)
  : `${current}${current.endsWith("\n") || !current ? "" : "\n"}${line}\n`;
writeFileSync(envPath, next);
console.log("Wrote the new SPOTIFY_REFRESH_TOKEN to .env.");
console.log("Next: update the same variable in Vercel production and redeploy.");
