import { NextResponse } from "next/server";
import { fetchRecentPublicPhotoUrls } from "@/lib/photos";
import { TRAVEL_PREFETCH_LIMIT } from "@/lib/travel-image";

export const revalidate = 300;

export async function GET() {
  const photos = await fetchRecentPublicPhotoUrls(TRAVEL_PREFETCH_LIMIT);

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      photos
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600"
      }
    }
  );
}
