import { NextResponse } from "next/server";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_TIMEOUT_MS = 5_000;
const ITUNES_RESULT_LIMIT = 8;
const MAX_PARAM_LENGTH = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const CACHE_MAX_ENTRIES = 500;

export const dynamic = "force-dynamic";

interface ItunesResult {
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
}

interface ItunesSearchResponse {
  resultCount: number;
  results: ItunesResult[];
}

interface PreviewMatch {
  previewUrl: string;
  matchedTrack: string;
  matchedArtist: string;
  artworkUrl: string | null;
  confidence: "high";
}

interface CacheEntry {
  value: PreviewMatch | null;
  timestamp: number;
}

const matchCache = new Map<string, CacheEntry>();

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function baseTitle(value: string): string {
  return normalize(value
    .replace(/\s*[([]\s*(?:feat\.?|ft\.?)\s+[^)\]]+[)\]]/gi, "")
    .replace(/(?:\s+[-–]\s+|\s*[([]\s*)(?:\d{4}\s+)?remaster(?:ed)?[^)\]]*[)\]]?$/i, ""));
}

function readCache(key: string): CacheEntry | null {
  const entry = matchCache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    matchCache.delete(key);
    return null;
  }

  return entry;
}

function writeCache(key: string, value: PreviewMatch | null): void {
  if (!matchCache.has(key) && matchCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = matchCache.keys().next().value;

    if (oldestKey !== undefined) {
      matchCache.delete(oldestKey);
    }
  }

  matchCache.set(key, { value, timestamp: Date.now() });
}

async function searchItunes(term: string): Promise<ItunesResult[]> {
  const url = new URL(ITUNES_SEARCH_URL);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", String(ITUNES_RESULT_LIMIT));
  url.searchParams.set("term", term);

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(ITUNES_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`iTunes search failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as ItunesSearchResponse;

  return Array.isArray(payload.results) ? payload.results : [];
}

function pickBestMatch(results: ItunesResult[], track: string, artists: string[]): PreviewMatch | null {
  const exactTitle = normalize(track);
  const versionlessTitle = baseTitle(track);
  const matches = results.filter((result) => {
    const artist = normalize(result.artistName ?? "");
    const title = result.trackName ?? "";
    return result.previewUrl && artists.includes(artist) && baseTitle(title) === versionlessTitle;
  });
  const result = matches.find((candidate) => normalize(candidate.trackName ?? "") === exactTitle) ?? matches[0];
  if (!result?.previewUrl) return null;

  return {
    previewUrl: result.previewUrl,
    matchedTrack: result.trackName ?? "",
    matchedArtist: result.artistName ?? "",
    artworkUrl: result.artworkUrl100?.replace("100x100", "600x600") ?? null,
    confidence: "high"
  };
}

function buildResponse(match: PreviewMatch | null): NextResponse {
  if (!match) {
    return NextResponse.json(
      { error: "No preview match found." },
      { status: 404 }
    );
  }

  return NextResponse.json(match, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800"
    }
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const track = searchParams.get("track")?.trim().slice(0, MAX_PARAM_LENGTH);
  const artists = searchParams.getAll("artist").slice(0, 5).map((artist) => artist.trim().slice(0, MAX_PARAM_LENGTH)).filter(Boolean);

  if (!track || !artists.length) {
    return NextResponse.json(
      { error: "Both `track` and `artist` query params are required." },
      { status: 400 }
    );
  }

  const normalizedArtists = artists.map(normalize).filter(Boolean);
  if (!baseTitle(track) || !normalizedArtists.length) return buildResponse(null);
  const cacheKey = JSON.stringify([normalize(track), normalizedArtists]);
  const cached = readCache(cacheKey);

  if (cached) {
    return buildResponse(cached.value);
  }

  try {
    const results = await searchItunes(`${artists[0]} ${track}`);
    const match = pickBestMatch(results, track, normalizedArtists) ??
      pickBestMatch(await searchItunes(track), track, normalizedArtists);
    writeCache(cacheKey, match);

    return buildResponse(match);
  } catch (error) {
    const message =
      error instanceof Error && error.name !== "TimeoutError"
        ? error.message
        : "iTunes preview lookup timed out or failed.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
