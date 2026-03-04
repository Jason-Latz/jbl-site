"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpotifyNowPlayingPayload = {
  trackName: string;
  artists: string[];
  albumName: string | null;
  trackUrl: string | null;
  albumImageUrl: string | null;
  progressMs: number | null;
  durationMs: number | null;
};

type SpotifyTodayStatsPayload = {
  playCount: number;
  uniqueArtists: number;
  minutesListened: number;
  mostRecentPlayedAt: string | null;
  timezone: string;
  isApproximate: boolean;
};

type SpotifyPlaylistPayload = {
  name: string;
  url: string | null;
  imageUrl: string | null;
  ownerName: string | null;
  source: "current-playback" | "recent-playback-context";
};

type SpotifyRecentTrackPayload = {
  trackName: string;
  artists: string[];
  albumName: string | null;
  trackUrl: string | null;
  albumImageUrl: string | null;
};

type SpotifyLiveResponse = {
  fetchedAt: string;
  isPlaying: boolean;
  nowPlaying: SpotifyNowPlayingPayload | null;
  today: SpotifyTodayStatsPayload;
  recentPlaylist: SpotifyPlaylistPayload | null;
  recentTracks: SpotifyRecentTrackPayload[];
};

const STORAGE_KEY = "spotify-live-cache-v1";
const POLL_INTERVAL_MS = 45_000;
const ERROR_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

type ParsedResponsePayload =
  | { type: "empty" }
  | { type: "json"; payload: unknown }
  | { type: "text"; payload: string };

function SpotifyGlyph() {
  return (
    <svg
      className="spotify-logo"
      viewBox="0 0 168 168"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="84" cy="84" r="84" fill="#1DB954" />
      <path
        d="M121.11 114.64c-1.78 2.93-5.61 3.85-8.54 2.07-23.4-14.3-52.86-17.54-87.58-9.61-3.35.77-6.69-1.33-7.46-4.68-.77-3.35 1.33-6.69 4.68-7.46 37.95-8.67 70.56-5.02 96.84 11.04 2.93 1.78 3.85 5.6 2.06 8.53z"
        fill="#fff"
      />
      <path
        d="M133.31 87.89c-2.24 3.63-6.99 4.77-10.62 2.53-26.79-16.47-67.67-21.25-99.37-11.62-4.12 1.25-8.48-1.07-9.73-5.18-1.25-4.12 1.07-8.47 5.18-9.73 36.22-11 81.27-5.66 112.1 13.28 3.63 2.24 4.76 6.99 2.44 10.72z"
        fill="#fff"
      />
      <path
        d="M134.35 60.02C102.22 40.95 49.2 39.2 18.49 48.52c-4.94 1.5-10.16-1.29-11.66-6.23-1.5-4.94 1.29-10.16 6.23-11.66 35.06-10.65 93.39-8.58 130.86 13.66 4.43 2.63 5.88 8.36 3.25 12.79-2.62 4.33-8.35 5.87-12.82 2.94z"
        fill="#fff"
      />
    </svg>
  );
}

function getPayloadError(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return null;
}

async function parseResponsePayload(response: Response): Promise<ParsedResponsePayload> {
  const rawBody = await response.text();

  if (!rawBody) {
    return { type: "empty" };
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return { type: "json", payload: parsed };
  } catch {
    return { type: "text", payload: rawBody };
  }
}

function isSpotifyLiveResponse(payload: unknown): payload is SpotifyLiveResponse {
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
    Array.isArray(candidate.recentTracks)
  );
}

function getRetryDelayMs(consecutiveErrors: number) {
  if (consecutiveErrors <= 0) {
    return POLL_INTERVAL_MS;
  }

  const delayIndex = Math.min(
    consecutiveErrors - 1,
    ERROR_RETRY_DELAYS_MS.length - 1
  );

  return ERROR_RETRY_DELAYS_MS[delayIndex];
}

function formatRetryDelay(ms: number) {
  if (ms < 60_000) {
    return `${Math.round(ms / 1000)}s`;
  }

  return `${Math.round(ms / 60_000)}m`;
}

function formatCheckedAt(isoDate: string) {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "just now";
  }

  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatPlayedAt(isoDate: string | null) {
  if (!isoDate) {
    return null;
  }

  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatTrackLine(trackName: string, artists: string[]) {
  if (artists.length === 0) {
    return trackName;
  }

  return `${trackName} — ${artists.join(", ")}`;
}

export default function SpotifyNowPlaying() {
  const [data, setData] = useState<SpotifyLiveResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const consecutiveErrorsRef = useRef(0);

  useEffect(() => {
    try {
      const cachedValue = localStorage.getItem(STORAGE_KEY);
      if (!cachedValue) {
        return;
      }

      const parsed = JSON.parse(cachedValue) as unknown;
      if (!isSpotifyLiveResponse(parsed)) {
        return;
      }

      setData(parsed);
      setIsLoading(false);
    } catch {
      // Ignore cache read errors.
    }
  }, []);

  const fetchSpotifyLive = useCallback(async () => {
    try {
      const response = await fetch("/api/spotify/live", { cache: "no-store" });
      const parsedPayload = await parseResponsePayload(response);
      const payload =
        parsedPayload.type === "json" ? parsedPayload.payload : null;

      if (!response.ok) {
        const errorMessage =
          getPayloadError(payload) ??
          `Spotify endpoint returned status ${response.status}.`;
        throw new Error(errorMessage);
      }

      if (parsedPayload.type !== "json") {
        throw new Error("Spotify endpoint returned an invalid response.");
      }

      if (!isSpotifyLiveResponse(payload)) {
        throw new Error("Unexpected Spotify response shape.");
      }

      setData(payload);
      setError(null);
      consecutiveErrorsRef.current = 0;
      setConsecutiveErrors(0);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Ignore cache write errors.
      }
    } catch (err) {
      const technicalMessage =
        err instanceof Error ? err.message : "Unable to refresh Spotify data.";
      // Keep detailed diagnostics in dev tools without surfacing API internals in UI.
      console.error("[SpotifyNowPlaying] Failed to refresh live data.", {
        error: technicalMessage
      });
      setError("refresh-failed");

      const nextErrorCount = consecutiveErrorsRef.current + 1;
      consecutiveErrorsRef.current = nextErrorCount;
      setConsecutiveErrors(nextErrorCount);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      await fetchSpotifyLive();
      if (disposed) {
        return;
      }

      const nextDelay = getRetryDelayMs(consecutiveErrorsRef.current);
      timer = setTimeout(() => {
        if (!disposed) {
          void loop();
        }
      }, nextDelay);
    };

    void loop();

    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [fetchSpotifyLive]);

  const trackLine = useMemo(() => {
    if (data?.nowPlaying) {
      return formatTrackLine(data.nowPlaying.trackName, data.nowPlaying.artists);
    }

    const latestRecentTrack = data?.recentTracks?.[0];
    if (latestRecentTrack) {
      return `Last played: ${formatTrackLine(
        latestRecentTrack.trackName,
        latestRecentTrack.artists
      )}`;
    }

    return isLoading
      ? "Loading Spotify listening activity..."
      : "Nothing is currently playing.";
  }, [data, isLoading]);

  const leadTrack = data?.nowPlaying ?? data?.recentTracks?.[0] ?? null;
  const leadTrackLine = leadTrack
    ? formatTrackLine(leadTrack.trackName, leadTrack.artists)
    : trackLine;
  const leadTrackAlbum = leadTrack?.albumName ?? null;
  const leadTrackArtwork = leadTrack?.albumImageUrl ?? null;

  const statusLine = useMemo(() => {
    const retryDelay = formatRetryDelay(getRetryDelayMs(consecutiveErrors));

    if (error) {
      if (data) {
        return `Showing last known data (checked ${formatCheckedAt(
          data.fetchedAt
        )}). Retrying in ${retryDelay}.`;
      }

      return `Could not load Spotify data yet. Retrying in ${retryDelay}.`;
    }

    if (!data) {
      return "Fetching Spotify data...";
    }

    const checkedAt = formatCheckedAt(data.fetchedAt);
    const playState = data.isPlaying ? "Playback active." : "Playback idle.";
    return `${playState} Last checked ${checkedAt}.`;
  }, [consecutiveErrors, data, error]);

  const todayLine = useMemo(() => {
    if (!data) {
      return "Today: -- plays, -- min, -- artists.";
    }

    const lastPlayedAt = formatPlayedAt(data.today.mostRecentPlayedAt);
    const approximateTag = data.today.isApproximate ? " (approx)" : "";
    const lastPlayedSegment = lastPlayedAt ? ` Last play at ${lastPlayedAt}.` : "";

    return `Today: ${data.today.playCount} plays, ${data.today.minutesListened} min, ${data.today.uniqueArtists} artists${approximateTag}.${lastPlayedSegment}`;
  }, [data]);

  const shouldScrollTrackLine = trackLine.length > 38;

  return (
    <section className="activity-item" aria-live="polite">
      <details className="activity-panel">
        <summary className="activity-summary activity-summary-spotify">
          <span className="activity-summary-label-row">
            <SpotifyGlyph />
            <span className="activity-summary-label">Spotify</span>
          </span>
          <span
            className={`activity-summary-value ${
              shouldScrollTrackLine ? "activity-summary-value-marquee" : ""
            }`}
          >
            {shouldScrollTrackLine ? (
              <span className="activity-marquee-track">
                <span>{trackLine}</span>
                <span aria-hidden>{trackLine}</span>
              </span>
            ) : (
              trackLine
            )}
          </span>
          <span className="activity-summary-caret" aria-hidden="true" />
        </summary>

        <div className="activity-details">
          <div className="spotify-tracker card">
            <div className="spotify-head">
              <div className="spotify-label-row">
                <SpotifyGlyph />
                <p className="spotify-label">Spotify live</p>
              </div>
              {data?.nowPlaying?.trackUrl ? (
                <a href={data.nowPlaying.trackUrl} target="_blank" rel="noreferrer">
                  Open track ↗
                </a>
              ) : data?.recentTracks?.[0]?.trackUrl ? (
                <a
                  href={data.recentTracks[0].trackUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open last track ↗
                </a>
              ) : data?.recentPlaylist?.url ? (
                <a href={data.recentPlaylist.url} target="_blank" rel="noreferrer">
                  Open playlist ↗
                </a>
              ) : null}
            </div>

            <div className="spotify-track-row">
              {leadTrackArtwork ? (
                <img
                  className="spotify-artwork"
                  src={leadTrackArtwork}
                  alt={`Album cover for ${leadTrackAlbum ?? leadTrackLine}`}
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
              <div className="spotify-track-copy">
                <p className="spotify-track">{leadTrackLine}</p>
                {leadTrackAlbum ? (
                  <p className="spotify-meta">Album: {leadTrackAlbum}</p>
                ) : null}
              </div>
            </div>

            <p className="spotify-meta">{todayLine}</p>

            {data?.recentPlaylist ? (
              <p className="spotify-meta">
                Recent playlist:{" "}
                {data.recentPlaylist.url ? (
                  <a href={data.recentPlaylist.url} target="_blank" rel="noreferrer">
                    {data.recentPlaylist.name}
                  </a>
                ) : (
                  data.recentPlaylist.name
                )}
                {data.recentPlaylist.ownerName
                  ? ` by ${data.recentPlaylist.ownerName}`
                  : ""}
                .
              </p>
            ) : null}

            {data?.recentTracks.length ? (
              <details className="spotify-history-panel">
                <summary className="spotify-history-summary">
                  <p className="spotify-history-title">Last 10 listened</p>
                  <span className="spotify-history-caret" aria-hidden="true" />
                </summary>
                <ul className="spotify-history-list">
                  {data.recentTracks.map((track, index) => (
                    <li
                      key={`${track.trackUrl ?? track.trackName}-${index}`}
                      className="spotify-history-item"
                    >
                      {track.albumImageUrl ? (
                        <img
                          className="spotify-history-artwork"
                          src={track.albumImageUrl}
                          alt={`Album cover for ${track.albumName ?? track.trackName}`}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span
                          className="spotify-history-artwork spotify-history-artwork-placeholder"
                          aria-hidden="true"
                        />
                      )}
                      <div className="spotify-history-copy">
                        <p className="spotify-history-track">
                          {track.trackUrl ? (
                            <a href={track.trackUrl} target="_blank" rel="noreferrer">
                              {track.trackName}
                            </a>
                          ) : (
                            track.trackName
                          )}
                        </p>
                        <p className="spotify-meta">
                          {track.artists.length > 0
                            ? track.artists.join(", ")
                            : "Unknown artist"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            <p className="spotify-meta">{statusLine}</p>
          </div>
        </div>
      </details>
    </section>
  );
}
