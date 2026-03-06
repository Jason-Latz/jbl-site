import { NextResponse } from "next/server";
import { fetchPublicPhotos } from "@/lib/photos";
import { TRAVEL_PREFETCH_LIMIT } from "@/lib/travel-image";

export const revalidate = 300;

export async function GET() {
  const photos = (await fetchPublicPhotos())
    .slice(0, TRAVEL_PREFETCH_LIMIT)
    .map((photo) => ({
      path: photo.path,
      url: photo.url
    }));

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
