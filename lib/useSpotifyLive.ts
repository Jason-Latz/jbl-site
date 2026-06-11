"use client";

// Client hook for the desk scene to read Jason's live Spotify state.
// Mirrors components/SpotifyNowPlaying.tsx: same /api/spotify/live endpoint,
// same response shape, same localStorage cache key, same error backoff —
// so the ribbon and the 3D desk share one cache and stay in sync.

import { useEffect, useState } from "react";

export type SpotifyNowPlayingPayload = {
  trackName: string;
  artists: string[];
  albumName: string | null;
  trackUrl: string | null;
  albumImageUrl: string | null;
  progressMs: number | null;
  durationMs: number | null;
};

export type SpotifyTodayStatsPayload = {
  playCount: number;
  uniqueArtists: number;
  minutesListened: number;
  mostRecentPlayedAt: string | null;
  timezone: string;
  isApproximate: boolean;
};

export type SpotifyPlaylistPayload = {
  name: string;
  url: string | null;
  imageUrl: string | null;
  ownerName: string | null;
  source: "current-playback" | "recent-playback-context";
};

export type SpotifyRecentTrackPayload = {
  trackName: string;
  artists: string[];
  albumName: string | null;
  trackUrl: string | null;
  albumImageUrl: string | null;
};

export type SpotifyTopArtistPayload = {
  name: string;
  artistUrl: string | null;
  imageUrl: string | null;
  playCount: number;
};

export type SpotifyLiveResponse = {
  fetchedAt: string;
  isPlaying: boolean;
  nowPlaying: SpotifyNowPlayingPayload | null;
  today: SpotifyTodayStatsPayload;
  recentPlaylist: SpotifyPlaylistPayload | null;
  recentTracks: SpotifyRecentTrackPayload[];
  topArtistsThisWeek: SpotifyTopArtistPayload[];
};

export type UseSpotifyLiveResult = {
  data: SpotifyLiveResponse | null;
  isLoading: boolean;
  hasError: boolean;
};

// Shared with SpotifyNowPlaying.tsx — both readers hydrate from and write to
// this one key so a fresh fetch in either component benefits the other.
export const SPOTIFY_LIVE_CACHE_KEY = "spotify-live-cache-v1";

const ENDPOINT = "/api/spotify/live";
const POLL_INTERVAL_MS = 45_000;
const ERROR_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

export function isSpotifyLiveResponse(
  payload: unknown
): payload is SpotifyLiveResponse {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as SpotifyLiveResponse;
  return (
    typeof candidate.fetchedAt === "string" &&
    typeof candidate.isPlaying === "boolean" &&
    typeof candidate.today?.playCount === "number" &&
    typeof candidate.today?.uniqueArtists === "number" &&
    typeof candidate.today?.minutesListened === "number" &&
    Array.isArray(candidate.recentTracks) &&
    Array.isArray(candidate.topArtistsThisWeek)
  );
}

function getRetryDelayMs(consecutiveErrors: number): number {
  if (consecutiveErrors <= 0) {
    return POLL_INTERVAL_MS;
  }

  const delayIndex = Math.min(
    consecutiveErrors - 1,
    ERROR_RETRY_DELAYS_MS.length - 1
  );

  return ERROR_RETRY_DELAYS_MS[delayIndex];
}

function readCachedResponse(): SpotifyLiveResponse | null {
  try {
    const cachedValue = localStorage.getItem(SPOTIFY_LIVE_CACHE_KEY);
    if (!cachedValue) {
      return null;
    }

    const parsed = JSON.parse(cachedValue) as unknown;
    return isSpotifyLiveResponse(parsed) ? parsed : null;
  } catch {
    // Ignore cache read errors (private mode, corrupted entry, etc.).
    return null;
  }
}

function writeCachedResponse(payload: SpotifyLiveResponse): void {
  try {
    localStorage.setItem(SPOTIFY_LIVE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache write errors (quota, private mode, etc.).
  }
}

export function useSpotifyLive(): UseSpotifyLiveResult {
  const [data, setData] = useState<SpotifyLiveResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;

    // Hydrate instantly from the shared cache so the desk renders real data
    // on first paint instead of waiting a network round-trip.
    const cached = readCachedResponse();
    if (cached) {
      setData(cached);
      setIsLoading(false);
    }

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // Helper keeps each read freshly typed; comparing document.visibilityState
    // twice in one function trips TS narrowing across the await.
    const isPageHidden = () => document.visibilityState === "hidden";

    const fetchOnce = async () => {
      try {
        const response = await fetch(ENDPOINT, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Spotify endpoint returned status ${response.status}.`);
        }

        const payload = (await response.json()) as unknown;
        if (!isSpotifyLiveResponse(payload)) {
          throw new Error("Unexpected Spotify response shape.");
        }

        if (disposed) {
          return;
        }

        consecutiveErrors = 0;
        // Value-equal bailout (fetchedAt excluded): most 45 s polls return
        // the same track and stats, and an always-fresh object identity
        // re-rendered the hero mid-animation for nothing.
        setData((prev) => {
          if (prev) {
            const { fetchedAt: _a, ...prevRest } = prev;
            const { fetchedAt: _b, ...nextRest } = payload;
            if (JSON.stringify(prevRest) === JSON.stringify(nextRest)) {
              return prev;
            }
          }
          return payload;
        });
        setHasError(false);
        writeCachedResponse(payload);
      } catch (err) {
        if (disposed) {
          return;
        }

        consecutiveErrors += 1;
        setHasError(true);
        console.error("[useSpotifyLive] Failed to refresh live data.", {
          error:
            err instanceof Error ? err.message : "Unable to refresh Spotify data."
        });
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    const loop = async () => {
      if (disposed || isPageHidden()) {
        return;
      }

      await fetchOnce();

      if (disposed || isPageHidden()) {
        return;
      }

      clearTimer();
      timer = setTimeout(() => {
        void loop();
      }, getRetryDelayMs(consecutiveErrors));
    };

    const handleVisibilityChange = () => {
      if (disposed) {
        return;
      }

      // Hidden: stop the cadence entirely. Visible: refetch immediately and
      // restart the cadence from a fresh interval.
      clearTimer();
      if (!isPageHidden()) {
        void loop();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void loop();

    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return { data, isLoading, hasError };
}
