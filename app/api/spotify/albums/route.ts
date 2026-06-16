import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isWhiteNoiseListening } from "@/lib/spotify";

export const dynamic = "force-dynamic";

const HISTORY_ROW_LIMIT = 1500;
const ALBUM_LIMIT = 12;

type StoredSpotifyArtist = {
  id?: string | null;
  name?: string | null;
  url?: string | null;
};

type SpotifyAlbumHistoryRow = {
  album_name: string | null;
  album_image_url: string | null;
  artists: StoredSpotifyArtist[] | null;
  played_at: string;
};

type SpotifyAlbum = {
  albumName: string;
  artistName: string;
  imageUrl: string;
  playCount: number;
};

type AlbumAccumulator = {
  albumName: string;
  artistName: string | null;
  imageUrl: string;
  playCount: number;
  lastPlayedMs: number;
};

function getPrimaryArtistName(artists: StoredSpotifyArtist[] | null): string | null {
  const name = artists?.[0]?.name;
  return typeof name === "string" && name.length > 0 ? name : null;
}

function aggregateAlbums(rows: SpotifyAlbumHistoryRow[]): SpotifyAlbum[] {
  const albums = new Map<string, AlbumAccumulator>();

  // Rows arrive newest-first, so the first row seen for an album is its most
  // recent play — that row decides the artwork and primary artist.
  for (const row of rows) {
    const albumName = row.album_name?.trim();
    const imageUrl = row.album_image_url?.trim();

    if (!albumName || !imageUrl) {
      continue;
    }

    if (
      isWhiteNoiseListening({
        albumName: row.album_name,
        artists: (row.artists ?? [])
          .map((artist) => artist?.name)
          .filter((name): name is string => typeof name === "string" && name.length > 0)
      })
    ) {
      continue;
    }

    const playedAtMs = new Date(row.played_at).getTime();
    const existing = albums.get(albumName);

    if (existing) {
      existing.playCount += 1;
      if (!existing.artistName) {
        existing.artistName = getPrimaryArtistName(row.artists);
      }
      continue;
    }

    albums.set(albumName, {
      albumName,
      artistName: getPrimaryArtistName(row.artists),
      imageUrl,
      playCount: 1,
      lastPlayedMs: Number.isNaN(playedAtMs) ? 0 : playedAtMs
    });
  }

  return [...albums.values()]
    .sort((left, right) => {
      if (right.playCount !== left.playCount) {
        return right.playCount - left.playCount;
      }

      if (right.lastPlayedMs !== left.lastPlayedMs) {
        return right.lastPlayedMs - left.lastPlayedMs;
      }

      return left.albumName.localeCompare(right.albumName);
    })
    .slice(0, ALBUM_LIMIT)
    .map((album) => ({
      albumName: album.albumName,
      artistName: album.artistName ?? "Unknown Artist",
      imageUrl: album.imageUrl,
      playCount: album.playCount
    }));
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Spotify history storage is not configured." },
      { status: 503 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data, error } = await supabase
    .from("spotify_recent_tracks")
    .select("album_name, album_image_url, artists, played_at")
    .order("played_at", { ascending: false })
    .limit(HISTORY_ROW_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load album listening history." },
      { status: 502 }
    );
  }

  const albums = aggregateAlbums((data ?? []) as SpotifyAlbumHistoryRow[]);

  return NextResponse.json(
    { albums },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
      }
    }
  );
}
