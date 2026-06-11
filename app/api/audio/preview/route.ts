import { NextResponse } from "next/server";

const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";
const ITUNES_TIMEOUT_MS = 5_000;
const ITUNES_RESULT_LIMIT = 8;
const MAX_PARAM_LENGTH = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const CACHE_MAX_ENTRIES = 500;
const HIGH_CONFIDENCE_THRESHOLD = 5;

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
  confidence: "high" | "low";
}

interface CacheEntry {
  value: PreviewMatch | null;
  timestamp: number;
}

const matchCache = new Map<string, CacheEntry>();

/**
 * Lowercase, strip diacritics, drop bracketed segments and feat./ft.
 * clauses, then collapse everything non-alphanumeric to single spaces.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(?:feat|ft)\.?\s.*$/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

function scoreResult(
  result: ItunesResult,
  normalizedTrack: string,
  normalizedArtist: string
): number {
  const candidateTrack = normalize(result.trackName ?? "");
  const candidateArtist = normalize(result.artistName ?? "");
  let score = 0;

  if (candidateTrack.length > 0) {
    if (candidateTrack === normalizedTrack) {
      score += 3;
    } else if (
      candidateTrack.startsWith(normalizedTrack) ||
      candidateTrack.includes(normalizedTrack) ||
      normalizedTrack.includes(candidateTrack)
    ) {
      score += 2;
    }
  }

  if (
    candidateArtist.length > 0 &&
    normalizedArtist.length > 0 &&
    (candidateArtist.includes(normalizedArtist) ||
      normalizedArtist.includes(candidateArtist))
  ) {
    score += 2;
  }

  return score;
}

function pickBestMatch(
  results: ItunesResult[],
  normalizedTrack: string,
  normalizedArtist: string
): PreviewMatch | null {
  let best: { result: ItunesResult; score: number; lengthDelta: number } | null =
    null;

  for (const result of results) {
    if (!result.previewUrl) {
      continue;
    }

    const score = scoreResult(result, normalizedTrack, normalizedArtist);

    if (score <= 0) {
      continue;
    }

    const lengthDelta = Math.abs(
      normalize(result.trackName ?? "").length - normalizedTrack.length
    );

    if (
      best === null ||
      score > best.score ||
      (score === best.score && lengthDelta < best.lengthDelta)
    ) {
      best = { result, score, lengthDelta };
    }
  }

  if (!best || !best.result.previewUrl) {
    return null;
  }

  return {
    previewUrl: best.result.previewUrl,
    matchedTrack: best.result.trackName ?? "",
    matchedArtist: best.result.artistName ?? "",
    artworkUrl:
      best.result.artworkUrl100?.replace("100x100", "600x600") ?? null,
    confidence: best.score >= HIGH_CONFIDENCE_THRESHOLD ? "high" : "low"
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
  const artist = searchParams.get("artist")?.trim().slice(0, MAX_PARAM_LENGTH);

  if (!track || !artist) {
    return NextResponse.json(
      { error: "Both `track` and `artist` query params are required." },
      { status: 400 }
    );
  }

  const normalizedTrack = normalize(track);
  const normalizedArtist = normalize(artist);
  const cacheKey = `${normalizedArtist}|${normalizedTrack}`;
  const cached = readCache(cacheKey);

  if (cached) {
    return buildResponse(cached.value);
  }

  try {
    let results = await searchItunes(`${artist} ${track}`);

    if (results.length === 0) {
      results = await searchItunes(track);
    }

    const match = pickBestMatch(results, normalizedTrack, normalizedArtist);
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
