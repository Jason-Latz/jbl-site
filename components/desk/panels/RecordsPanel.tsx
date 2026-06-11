"use client";

// Listening panel for the desk's turntable focus. Renders the live Spotify
// state passed down from the scene (the scene owns polling via useSpotifyLive)
// plus a one-shot fetch of the heavy-rotation album wall.

import { useEffect, useState, type CSSProperties } from "react";
import type {
  SpotifyLiveResponse,
  SpotifyNowPlayingPayload,
  SpotifyRecentTrackPayload
} from "@/lib/useSpotifyLive";
import type { NeedlePhase } from "@/components/desk/NowPlayingHUD";

export type RecordsPanelProps = {
  spotify: SpotifyLiveResponse | null;
  phase: NeedlePhase;
  canPlay: boolean;
  onToggleNeedle: () => void;
};

type HeavyRotationAlbum = {
  albumName: string;
  artistName: string;
  imageUrl: string;
  playCount: number;
};

type AlbumsState =
  | { status: "loading" }
  | { status: "ready"; albums: HeavyRotationAlbum[] }
  | { status: "unavailable" };

// Mirrors NowPlayingHUD so the panel and the HUD never disagree mid-flight.
const NEEDLE_LABELS: Record<NeedlePhase, string> = {
  idle: "Drop the needle",
  dropping: "Lowering…",
  playing: "Lift the needle",
  stopping: "Lifting…"
};

const LEAD_ART_SIZE: CSSProperties = { width: 56, height: 56 };

const LIVE_DOT_STYLE: CSSProperties = {
  display: "inline-block",
  width: 7,
  height: 7,
  borderRadius: 999,
  background: "#4ade80",
  boxShadow: "0 0 6px rgba(74, 222, 128, 0.65)",
  marginRight: 6,
  verticalAlign: "1px"
};

function proxiedImageUrl(url: string): string {
  return `/api/image-proxy?u=${encodeURIComponent(url)}`;
}

function formatPlays(count: number): string {
  return count === 1 ? "1 play" : `${count} plays`;
}

function parseAlbumsPayload(payload: unknown): HeavyRotationAlbum[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }

  const candidate = (payload as { albums?: unknown }).albums;
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((entry): entry is HeavyRotationAlbum => {
    if (typeof entry !== "object" || entry === null) {
      return false;
    }

    const album = entry as HeavyRotationAlbum;
    return (
      typeof album.albumName === "string" &&
      typeof album.artistName === "string" &&
      typeof album.imageUrl === "string" &&
      typeof album.playCount === "number"
    );
  });
}

export default function RecordsPanel({
  spotify,
  phase,
  canPlay,
  onToggleNeedle
}: RecordsPanelProps) {
  const [albumsState, setAlbumsState] = useState<AlbumsState>({
    status: "loading"
  });

  useEffect(() => {
    const controller = new AbortController();

    const loadAlbums = async () => {
      try {
        const response = await fetch("/api/spotify/albums", {
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`Albums endpoint returned status ${response.status}.`);
        }

        const payload = (await response.json()) as unknown;
        const albums = parseAlbumsPayload(payload);

        setAlbumsState(
          albums.length > 0
            ? { status: "ready", albums }
            : { status: "unavailable" }
        );
      } catch {
        if (!controller.signal.aborted) {
          setAlbumsState({ status: "unavailable" });
        }
      }
    };

    void loadAlbums();
    return () => controller.abort();
  }, []);

  const lead: SpotifyNowPlayingPayload | SpotifyRecentTrackPayload | null =
    spotify ? spotify.nowPlaying ?? spotify.recentTracks[0] ?? null : null;
  const isLive = Boolean(spotify?.isPlaying && spotify.nowPlaying);
  const isBusy = phase === "dropping" || phase === "stopping";
  const previewMissing = phase === "idle" && !canPlay;
  const today = spotify?.today ?? null;
  const recentTracks = spotify?.recentTracks.slice(0, 10) ?? [];
  const topArtists = spotify?.topArtistsThisWeek ?? [];

  return (
    <div>
      <section className="desk-panel-section">
        {!spotify ? (
          <p className="desk-panel-empty">
            Tuning in — live listening data is on its way.
          </p>
        ) : !lead ? (
          <p className="desk-panel-empty">
            The platter is quiet — nothing logged yet.
          </p>
        ) : (
          <>
            <div className="desk-panel-row">
              {lead.albumImageUrl ? (
                <img
                  className="desk-panel-thumb"
                  style={LEAD_ART_SIZE}
                  src={proxiedImageUrl(lead.albumImageUrl)}
                  alt={`Album art for ${lead.trackName}`}
                />
              ) : (
                <span
                  className="desk-panel-thumb"
                  style={LEAD_ART_SIZE}
                  aria-hidden="true"
                />
              )}
              <div className="desk-panel-row-main">
                <p className="desk-panel-row-title">
                  {lead.trackUrl ? (
                    <a href={lead.trackUrl} target="_blank" rel="noreferrer">
                      {lead.trackName}
                    </a>
                  ) : (
                    lead.trackName
                  )}
                </p>
                <p className="desk-panel-meta">{lead.artists.join(", ")}</p>
                <p className="desk-panel-meta">
                  {isLive ? (
                    <>
                      <span style={LIVE_DOT_STYLE} aria-hidden="true" />
                      listening now
                    </>
                  ) : (
                    "last played"
                  )}
                </p>
              </div>
            </div>
            {today ? (
              <p className="desk-panel-meta" style={{ marginTop: 10 }}>
                today: {today.playCount} plays ·{" "}
                {Math.round(today.minutesListened)} min · {today.uniqueArtists}{" "}
                artists
              </p>
            ) : null}
            <button
              type="button"
              className="desk-panel-button"
              style={{ marginTop: 10 }}
              onClick={onToggleNeedle}
              disabled={isBusy || previewMissing}
              aria-pressed={phase === "playing"}
              title={
                previewMissing
                  ? "No preview available for this track"
                  : undefined
              }
            >
              {NEEDLE_LABELS[phase]}
            </button>
          </>
        )}
      </section>

      <section className="desk-panel-section">
        <h3 className="desk-panel-section-title">On heavy rotation</h3>
        {albumsState.status === "ready" ? (
          <div className="desk-panel-grid">
            {albumsState.albums.map((album) => (
              <img
                key={`${album.albumName}-${album.artistName}`}
                src={proxiedImageUrl(album.imageUrl)}
                alt={`${album.albumName} by ${album.artistName}`}
                title={`${album.albumName} — ${album.artistName} · ${formatPlays(album.playCount)}`}
                loading="lazy"
              />
            ))}
          </div>
        ) : (
          <p className="desk-panel-empty">
            Album history is still warming up.
          </p>
        )}
      </section>

      <section className="desk-panel-section">
        <h3 className="desk-panel-section-title">Last 10</h3>
        {recentTracks.length > 0 ? (
          <ul className="desk-panel-list">
            {recentTracks.map((track, index) => (
              <li
                className="desk-panel-row"
                key={`${track.trackName}-${index}`}
              >
                {track.albumImageUrl ? (
                  <img
                    className="desk-panel-thumb"
                    src={proxiedImageUrl(track.albumImageUrl)}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="desk-panel-thumb" aria-hidden="true" />
                )}
                <div className="desk-panel-row-main">
                  <p className="desk-panel-row-title">
                    {track.trackUrl ? (
                      <a href={track.trackUrl} target="_blank" rel="noreferrer">
                        {track.trackName}
                      </a>
                    ) : (
                      track.trackName
                    )}
                  </p>
                  <p className="desk-panel-meta">{track.artists.join(", ")}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="desk-panel-empty">
            {spotify
              ? "No recent spins on record."
              : "Waiting on the listening log…"}
          </p>
        )}
      </section>

      <section className="desk-panel-section">
        <h3 className="desk-panel-section-title">This week&apos;s artists</h3>
        {topArtists.length > 0 ? (
          <ul className="desk-panel-list">
            {topArtists.map((artist) => (
              <li className="desk-panel-row" key={artist.name}>
                {artist.imageUrl ? (
                  <img
                    className="desk-panel-thumb"
                    src={proxiedImageUrl(artist.imageUrl)}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="desk-panel-thumb" aria-hidden="true" />
                )}
                <div className="desk-panel-row-main">
                  <p className="desk-panel-row-title">
                    {artist.artistUrl ? (
                      <a
                        href={artist.artistUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {artist.name}
                      </a>
                    ) : (
                      artist.name
                    )}
                  </p>
                  <p className="desk-panel-meta">
                    {formatPlays(artist.playCount)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="desk-panel-empty">
            {spotify
              ? "The week is young — no repeat artists yet."
              : "Waiting on the listening log…"}
          </p>
        )}
      </section>
    </div>
  );
}
