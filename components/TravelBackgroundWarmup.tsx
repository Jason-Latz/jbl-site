"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  buildTravelRenderUrlForDisplayWidth,
  estimateTravelPrefetchDisplayWidth,
  TRAVEL_PREFETCH_LIMIT,
  TRAVEL_PREFETCH_SESSION_KEY
} from "@/lib/travel-image";

const BACKGROUND_WARMUP_CONCURRENCY = 4;

type PrefetchPhoto = {
  path: string;
  url: string;
};

type PrefetchResponse = {
  photos?: PrefetchPhoto[];
};

type ConnectionInfo = {
  saveData?: boolean;
  effectiveType?: string;
};

type NavigatorWithConnection = Navigator & {
  connection?: ConnectionInfo;
};

type WindowWithIdleCallback = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

function shouldSkipForConnection() {
  const connection = (navigator as NavigatorWithConnection).connection;
  if (!connection) {
    return false;
  }

  if (connection.saveData) {
    return true;
  }

  const effectiveType = (connection.effectiveType ?? "").toLowerCase();
  return effectiveType.includes("2g") || effectiveType.includes("3g");
}

function warmImageUrl(url: string) {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";

    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

async function warmUrls(urls: string[], concurrency: number) {
  if (urls.length === 0) {
    return;
  }

  let index = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, urls.length) },
    async () => {
      while (true) {
        const nextIndex = index;
        index += 1;

        if (nextIndex >= urls.length) {
          return;
        }

        await warmImageUrl(urls[nextIndex]);
      }
    }
  );

  await Promise.all(workers);
}

function scheduleOnIdle(callback: () => void) {
  const w = window as WindowWithIdleCallback;

  if (typeof w.requestIdleCallback === "function") {
    const handle = w.requestIdleCallback(() => callback(), { timeout: 2500 });
    return () => {
      if (typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(handle);
      }
    };
  }

  const timeout = window.setTimeout(() => callback(), 1200);
  return () => {
    window.clearTimeout(timeout);
  };
}

export default function TravelBackgroundWarmup() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith("/travel")) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    if (shouldSkipForConnection()) {
      sessionStorage.setItem(TRAVEL_PREFETCH_SESSION_KEY, "skipped-network");
      return;
    }

    const existingState = sessionStorage.getItem(TRAVEL_PREFETCH_SESSION_KEY);
    if (existingState === "done" || existingState === "in-progress") {
      return;
    }

    let cancelled = false;
    sessionStorage.setItem(TRAVEL_PREFETCH_SESSION_KEY, "in-progress");

    const cancelIdle = scheduleOnIdle(async () => {
      try {
        const response = await fetch("/api/travel/prefetch", {
          cache: "force-cache"
        });

        if (!response.ok) {
          sessionStorage.removeItem(TRAVEL_PREFETCH_SESSION_KEY);
          return;
        }

        const payload = (await response.json()) as PrefetchResponse;
        const photos = (payload.photos ?? [])
          .filter(
            (photo): photo is PrefetchPhoto =>
              typeof photo.path === "string" &&
              typeof photo.url === "string" &&
              photo.url.length > 0
          )
          .slice(0, TRAVEL_PREFETCH_LIMIT);

        if (photos.length === 0 || cancelled) {
          sessionStorage.setItem(TRAVEL_PREFETCH_SESSION_KEY, "done");
          return;
        }

        const expectedDisplayWidth = estimateTravelPrefetchDisplayWidth(
          window.innerWidth
        );
        const urls = photos.map((photo) =>
          buildTravelRenderUrlForDisplayWidth(photo.url, expectedDisplayWidth)
        );

        await warmUrls(urls, BACKGROUND_WARMUP_CONCURRENCY);

        if (!cancelled) {
          sessionStorage.setItem(TRAVEL_PREFETCH_SESSION_KEY, "done");
        }
      } catch {
        sessionStorage.removeItem(TRAVEL_PREFETCH_SESSION_KEY);
      }
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [pathname]);

  return null;
}
