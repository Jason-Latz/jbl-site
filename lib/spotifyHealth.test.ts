import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSpotifyHealth } from "./spotifyHealth.ts";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

test("healthy: valid token and a recent play", () => {
  const h = evaluateSpotifyHealth({ token: "ok", latestStoredPlayedAtMs: NOW - DAY, nowMs: NOW });
  assert.equal(h.ok, true);
  assert.deepEqual(h.problems, []);
});

test("revoked token fails even with fresh plays", () => {
  const h = evaluateSpotifyHealth({ token: "revoked", latestStoredPlayedAtMs: NOW - DAY, nowMs: NOW });
  assert.equal(h.ok, false);
  assert.match(h.problems[0], /revoked/);
});

test("stale store fails", () => {
  const h = evaluateSpotifyHealth({ token: "ok", latestStoredPlayedAtMs: NOW - 15 * DAY, nowMs: NOW });
  assert.equal(h.ok, false);
});

test("empty store fails", () => {
  const h = evaluateSpotifyHealth({ token: "ok", latestStoredPlayedAtMs: null, nowMs: NOW });
  assert.equal(h.ok, false);
});
