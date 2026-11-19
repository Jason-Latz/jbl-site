const HEALTH_MAX_STALE_MS = 14 * 24 * 60 * 60 * 1000;

export type SpotifyHealth = {
  ok: boolean;
  token: "ok" | "revoked" | "error";
  latestStoredPlayAt: string | null;
  problems: string[];
};

export function evaluateSpotifyHealth(input: {
  token: SpotifyHealth["token"];
  latestStoredPlayedAtMs: number | null;
  nowMs: number;
}): SpotifyHealth {
  const problems: string[] = [];
  if (input.token === "revoked") {
    problems.push("Refresh token revoked; run `npm run spotify:token` and update Vercel.");
  } else if (input.token === "error") {
    problems.push("Spotify token refresh failed.");
  }

  const latest = input.latestStoredPlayedAtMs;
  if (latest === null) {
    problems.push("No stored plays found.");
  } else if (input.nowMs - latest > HEALTH_MAX_STALE_MS) {
    problems.push("No new plays stored in over 14 days; sync may be broken.");
  }

  return {
    ok: problems.length === 0,
    token: input.token,
    latestStoredPlayAt: latest === null ? null : new Date(latest).toISOString(),
    problems
  };
}

