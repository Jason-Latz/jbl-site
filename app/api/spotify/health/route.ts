import { NextResponse } from "next/server";
import { checkSpotifyHealth } from "@/lib/spotify";

export const dynamic = "force-dynamic";

// Canary: 200 when the Spotify token refreshes and plays are being stored,
// 503 otherwise. Polled daily by .github/workflows/spotify-health.yml, whose
// failure emails the repo owner. Exposes no secrets, only status.
export async function GET() {
  const health = await checkSpotifyHealth();
  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" }
  });
}
