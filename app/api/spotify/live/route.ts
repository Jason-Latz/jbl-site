import { NextResponse } from "next/server";
import { fetchSpotifyLivePayload } from "@/lib/spotify";

const REQUIRED_ENV_KEYS = [
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "SPOTIFY_REFRESH_TOKEN"
] as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const missingKeys = REQUIRED_ENV_KEYS.filter(
    (key) => !process.env[key]?.trim()
  );

  if (missingKeys.length > 0) {
    return NextResponse.json(
      {
        error: `Spotify is not configured. Missing: ${missingKeys.join(", ")}.`
      },
      { status: 503 }
    );
  }

  try {
    const payload = await fetchSpotifyLivePayload();

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load Spotify listening data.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
