#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
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
  "playlist-read-private"
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

const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
authorizeUrl.searchParams.set("client_id", clientId);
authorizeUrl.searchParams.set("response_type", "code");
authorizeUrl.searchParams.set("redirect_uri", redirectUri);
authorizeUrl.searchParams.set("scope", scopes.join(" "));

const authCode = providedAuthCode ?? getAuthCodeFromRedirectUrl(redirectedUrl);

console.log("Open this URL and approve access:");
console.log(authorizeUrl.toString());
console.log("");

if (!authCode) {
  console.log("After approval, Spotify redirects to your redirect URI.");
  console.log("Copy the `code` query parameter and run:");
  console.log(
    'SPOTIFY_AUTH_CODE="<paste_code>" npm run spotify:token'
  );
  console.log("Alternatively pass the full redirected URL:");
  console.log(
    'SPOTIFY_REDIRECTED_URL="<full_redirect_url>" npm run spotify:token'
  );
  process.exit(0);
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
  const errorText = await tokenResponse.text();
  console.error(`Token exchange failed (${tokenResponse.status}).`);
  console.error(errorText);
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

console.log("Refresh token generated successfully.");
console.log(`SPOTIFY_REFRESH_TOKEN=${payload.refresh_token}`);
