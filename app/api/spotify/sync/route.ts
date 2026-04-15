import { NextResponse } from "next/server";
import { syncSpotifyRecentHistory } from "@/lib/spotify";

export const dynamic = "force-dynamic";

const REQUIRED_ENV_KEYS = [
  "CRON_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "SPOTIFY_REFRESH_TOKEN"
] as const;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return { authorized: false as const, reason: "missing_secret" };
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return { authorized: false as const, reason: "missing_bearer" };
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token || token !== secret) {
    return { authorized: false as const, reason: "invalid_token" };
  }

  return { authorized: true as const };
}

export async function GET(request: Request) {
  const auth = isAuthorized(request);
  if (!auth.authorized) {
    if (auth.reason === "missing_secret") {
      return NextResponse.json(
        { error: "CRON_SECRET is not configured." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const missingKeys = REQUIRED_ENV_KEYS.filter(
    (key) => !process.env[key]?.trim()
  );

  if (missingKeys.length > 0) {
    return NextResponse.json(
      {
        error: `Spotify sync is not configured. Missing: ${missingKeys.join(", ")}.`
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const startedAt = Date.now();
    const result = await syncSpotifyRecentHistory();

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        ...result
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to sync Spotify listening history.";

    return NextResponse.json(
      { error: message },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
