type SpotifyTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type SpotifyImage = {
  url?: string;
};

type SpotifyArtist = {
  name?: string;
};

type SpotifyTrack = {
  name?: string;
  duration_ms?: number;
  external_urls?: {
    spotify?: string;
  };
  album?: {
    name?: string;
    images?: SpotifyImage[];
  };
  artists?: SpotifyArtist[];
};

type SpotifyContext = {
  type?: string;
  uri?: string;
};

type SpotifyCurrentlyPlayingResponse = {
  is_playing?: boolean;
  progress_ms?: number;
  item?: SpotifyTrack | null;
  context?: SpotifyContext | null;
};

type SpotifyRecentlyPlayedItem = {
  played_at?: string;
  track?: SpotifyTrack;
  context?: SpotifyContext | null;
};

type SpotifyRecentlyPlayedResponse = {
  items?: SpotifyRecentlyPlayedItem[];
};

type SpotifyPlaylistResponse = {
  name?: string;
  external_urls?: {
    spotify?: string;
  };
  images?: SpotifyImage[];
  owner?: {
    display_name?: string;
  };
};

type SpotifyPlaylistSource =
  | "current-playback"
  | "recent-playback-context";

export type SpotifyPlaylist = {
  name: string;
  url: string | null;
  imageUrl: string | null;
  ownerName: string | null;
  source: SpotifyPlaylistSource;
};

export type SpotifyNowPlaying = {
  trackName: string;
  artists: string[];
  albumName: string | null;
  trackUrl: string | null;
  albumImageUrl: string | null;
  progressMs: number | null;
  durationMs: number | null;
};

export type SpotifyTodayStats = {
  playCount: number;
  uniqueArtists: number;
  minutesListened: number;
  mostRecentPlayedAt: string | null;
  timezone: string;
  isApproximate: boolean;
};

export type SpotifyRecentTrack = {
  trackName: string;
  artists: string[];
  albumName: string | null;
  trackUrl: string | null;
  albumImageUrl: string | null;
};

export type SpotifyLivePayload = {
  fetchedAt: string;
  isPlaying: boolean;
  nowPlaying: SpotifyNowPlaying | null;
  today: SpotifyTodayStats;
  recentPlaylist: SpotifyPlaylist | null;
  recentTracks: SpotifyRecentTrack[];
};

const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const ACCESS_TOKEN_BUFFER_MS = 30_000;

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function getDateKey(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(date);
}

function getImageUrl(images: SpotifyImage[] | undefined) {
  const firstValid = images?.find(
    (image) => typeof image.url === "string" && image.url.length > 0
  );
  return firstValid?.url ?? null;
}

function getPlaylistIdFromUri(uri: string | undefined) {
  if (!uri) {
    return null;
  }

  const match = uri.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (!match) {
    return null;
  }

  return match[1] ?? null;
}

async function fetchAccessToken() {
  if (
    cachedAccessToken &&
    cachedAccessToken.expiresAt > Date.now() + ACCESS_TOKEN_BUFFER_MS
  ) {
    return cachedAccessToken.value;
  }

  const clientId = getRequiredEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = getRequiredEnv("SPOTIFY_CLIENT_SECRET");
  const refreshToken = getRequiredEnv("SPOTIFY_REFRESH_TOKEN");

  const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `Spotify token refresh failed with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as SpotifyTokenResponse;
  const accessToken = payload.access_token;
  const expiresIn = payload.expires_in;

  if (!accessToken || typeof expiresIn !== "number") {
    throw new Error("Spotify token refresh response was invalid.");
  }

  cachedAccessToken = {
    value: accessToken,
    expiresAt: Date.now() + expiresIn * 1000
  };

  return accessToken;
}

async function spotifyRequest(path: string, shouldRetry = true): Promise<Response> {
  const accessToken = await fetchAccessToken();
  const response = await fetch(`${SPOTIFY_API_BASE_URL}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (response.status === 401 && shouldRetry) {
    cachedAccessToken = null;
    return spotifyRequest(path, false);
  }

  return response;
}

function mapPlaylist(
  playlist: SpotifyPlaylistResponse,
  source: SpotifyPlaylistSource
): SpotifyPlaylist | null {
  if (!playlist.name || typeof playlist.name !== "string") {
    return null;
  }

  return {
    name: playlist.name,
    url: playlist.external_urls?.spotify ?? null,
    imageUrl: getImageUrl(playlist.images),
    ownerName: playlist.owner?.display_name ?? null,
    source
  };
}

function mapArtists(artists: SpotifyArtist[] | undefined): string[] {
  return (
    artists
      ?.map((artist) => artist.name)
      .filter(
        (name): name is string => typeof name === "string" && name.length > 0
      ) ?? []
  );
}

function mapNowPlaying(item: SpotifyTrack | null | undefined): SpotifyNowPlaying | null {
  if (!item?.name || typeof item.name !== "string") {
    return null;
  }

  return {
    trackName: item.name,
    artists: mapArtists(item.artists),
    albumName: item.album?.name ?? null,
    trackUrl: item.external_urls?.spotify ?? null,
    albumImageUrl: getImageUrl(item.album?.images),
    progressMs: null,
    durationMs: typeof item.duration_ms === "number" ? item.duration_ms : null
  };
}

function mapRecentTracks(
  recentlyPlayed: SpotifyRecentlyPlayedItem[],
  limit: number
): SpotifyRecentTrack[] {
  const tracks: SpotifyRecentTrack[] = [];

  for (const item of recentlyPlayed) {
    if (tracks.length >= limit) {
      break;
    }

    if (!item.played_at || !item.track?.name) {
      continue;
    }

    const playedAtDate = new Date(item.played_at);
    if (Number.isNaN(playedAtDate.getTime())) {
      continue;
    }

    tracks.push({
      trackName: item.track.name,
      artists: mapArtists(item.track.artists),
      albumName: item.track.album?.name ?? null,
      trackUrl: item.track.external_urls?.spotify ?? null,
      albumImageUrl: getImageUrl(item.track.album?.images)
    });
  }

  return tracks;
}

async function fetchCurrentlyPlaying() {
  const response = await spotifyRequest(
    "/me/player/currently-playing?additional_types=track"
  );

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Spotify currently-playing request failed with status ${response.status}.`
    );
  }

  return (await response.json()) as SpotifyCurrentlyPlayingResponse;
}

async function fetchRecentlyPlayed() {
  const response = await spotifyRequest("/me/player/recently-played?limit=50");

  if (!response.ok) {
    throw new Error(
      `Spotify recently-played request failed with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as SpotifyRecentlyPlayedResponse;
  return payload.items ?? [];
}

async function fetchPlaylistById(
  playlistId: string,
  source: SpotifyPlaylistSource
) {
  const response = await spotifyRequest(
    `/playlists/${playlistId}?fields=name,external_urls,images,owner(display_name)`
  );

  if (response.status === 403 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as SpotifyPlaylistResponse;
  return mapPlaylist(payload, source);
}

function buildTodayStats(
  recentlyPlayed: SpotifyRecentlyPlayedItem[],
  timeZone: string
): SpotifyTodayStats {
  const todayKey = getDateKey(new Date(), timeZone);
  let playCount = 0;
  let minutesListened = 0;
  let mostRecentPlayedAt: string | null = null;
  const artistSet = new Set<string>();

  for (const item of recentlyPlayed) {
    if (!item.played_at) {
      continue;
    }

    const playedAtDate = new Date(item.played_at);
    if (Number.isNaN(playedAtDate.getTime())) {
      continue;
    }

    if (getDateKey(playedAtDate, timeZone) !== todayKey) {
      continue;
    }

    playCount += 1;
    if (!mostRecentPlayedAt) {
      mostRecentPlayedAt = item.played_at;
    }

    if (typeof item.track?.duration_ms === "number") {
      minutesListened += item.track.duration_ms / 60_000;
    }

    for (const artist of item.track?.artists ?? []) {
      if (artist.name) {
        artistSet.add(artist.name);
      }
    }
  }

  return {
    playCount,
    uniqueArtists: artistSet.size,
    minutesListened: Number(minutesListened.toFixed(1)),
    mostRecentPlayedAt,
    timezone: timeZone,
    isApproximate: true
  };
}

async function resolveRecentPlaylist(
  currentPlayback: SpotifyCurrentlyPlayingResponse | null,
  recentlyPlayed: SpotifyRecentlyPlayedItem[]
) {
  const currentPlaylistId = getPlaylistIdFromUri(currentPlayback?.context?.uri);
  if (currentPlaylistId) {
    const playlist = await fetchPlaylistById(currentPlaylistId, "current-playback");
    if (playlist) {
      return playlist;
    }
  }

  const recentPlaylistItem = recentlyPlayed.find(
    (item) => item.context?.type === "playlist"
  );
  const recentPlaylistId = getPlaylistIdFromUri(recentPlaylistItem?.context?.uri);

  if (recentPlaylistId) {
    const playlist = await fetchPlaylistById(
      recentPlaylistId,
      "recent-playback-context"
    );
    if (playlist) {
      return playlist;
    }
  }

  return null;
}

export async function fetchSpotifyLivePayload(): Promise<SpotifyLivePayload> {
  const timeZone = process.env.SPOTIFY_TIMEZONE?.trim() || "America/Chicago";

  const [currentPlayback, recentlyPlayed] = await Promise.all([
    fetchCurrentlyPlaying(),
    fetchRecentlyPlayed()
  ]);

  const recentPlaylist = await resolveRecentPlaylist(currentPlayback, recentlyPlayed);
  const nowPlaying = mapNowPlaying(currentPlayback?.item);
  const recentTracks = mapRecentTracks(recentlyPlayed, 10);

  if (nowPlaying && typeof currentPlayback?.progress_ms === "number") {
    nowPlaying.progressMs = currentPlayback.progress_ms;
  }

  return {
    fetchedAt: new Date().toISOString(),
    isPlaying: currentPlayback?.is_playing === true,
    nowPlaying,
    today: buildTodayStats(recentlyPlayed, timeZone),
    recentPlaylist,
    recentTracks
  };
}
