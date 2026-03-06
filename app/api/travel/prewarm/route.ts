import { NextResponse } from "next/server";
import { fetchPublicPhotos } from "@/lib/photos";
import {
  buildTravelRenderUrlForRequestWidth,
  CRON_WARM_WIDTHS,
  TRAVEL_CRON_WARM_LIMIT
} from "@/lib/travel-image";

export const dynamic = "force-dynamic";

const PREWARM_CONCURRENCY = 6;

type WarmTarget = {
  path: string;
  width: number;
  url: string;
};

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
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

async function warmTargets(targets: WarmTarget[]) {
  if (targets.length === 0) {
    return { attempted: 0, success: 0, failed: 0 };
  }

  let cursor = 0;
  let success = 0;
  let failed = 0;
  let attempted = 0;

  const workers = Array.from(
    { length: Math.min(PREWARM_CONCURRENCY, targets.length) },
    async () => {
      while (true) {
        const nextIndex = cursor;
        cursor += 1;

        if (nextIndex >= targets.length) {
          return;
        }

        const target = targets[nextIndex];
        attempted += 1;

        try {
          const response = await fetch(target.url, {
            method: "GET",
            cache: "no-store"
          });
          await response.arrayBuffer();

          if (response.ok) {
            success += 1;
          } else {
            failed += 1;
          }
        } catch {
          failed += 1;
        }
      }
    }
  );

  await Promise.all(workers);

  return {
    attempted,
    success,
    failed
  };
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

  const startedAt = Date.now();
  const photos = (await fetchPublicPhotos()).slice(0, TRAVEL_CRON_WARM_LIMIT);
  const targets: WarmTarget[] = photos.flatMap((photo) =>
    CRON_WARM_WIDTHS.map((width) => ({
      path: photo.path,
      width,
      url: buildTravelRenderUrlForRequestWidth(photo.url, width)
    }))
  );

  const warmed = await warmTargets(targets);
  const durationMs = Date.now() - startedAt;

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      durationMs,
      photoCount: photos.length,
      widthCount: CRON_WARM_WIDTHS.length,
      widths: CRON_WARM_WIDTHS,
      attempted: warmed.attempted,
      success: warmed.success,
      failed: warmed.failed
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
