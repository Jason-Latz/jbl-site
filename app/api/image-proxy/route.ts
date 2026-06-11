import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 10_000;
const FALLBACK_CONTENT_TYPE = "image/jpeg";

/**
 * SSRF guard: only Spotify and Apple artwork CDNs may be proxied. Exact
 * hostname equality (or a dot-anchored suffix) — never substring matching,
 * which "evil.com/?i.scdn.co" would defeat.
 */
const ALLOWED_HOSTNAMES = new Set(["i.scdn.co", "mosaic.scdn.co"]);

const ALLOWED_HOSTNAME_SUFFIXES = [".scdn.co", ".mzstatic.com"];

function isAllowedHost(hostname: string): boolean {
  return (
    ALLOWED_HOSTNAMES.has(hostname) ||
    ALLOWED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

async function proxyImage(
  request: Request,
  includeBody: boolean
): Promise<Response> {
  const rawUrl = new URL(request.url).searchParams.get("u");

  if (!rawUrl) {
    return NextResponse.json(
      { error: 'Missing required "u" query parameter.' },
      { status: 400 }
    );
  }

  let imageUrl: URL;

  try {
    imageUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json(
      { error: 'The "u" query parameter is not a valid URL.' },
      { status: 400 }
    );
  }

  if (imageUrl.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only https image URLs are supported." },
      { status: 400 }
    );
  }

  if (!isAllowedHost(imageUrl.hostname)) {
    return NextResponse.json(
      { error: "Host is not an allowed image source." },
      { status: 403 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;

  try {
    // Deliberately forwards nothing from the client request: no cookies,
    // no headers, no credentials. The upstream sees a bare anonymous GET.
    upstream = await fetch(imageUrl, {
      signal: controller.signal,
      cache: "no-store"
    });
  } catch {
    const message = controller.signal.aborted
      ? "Image source timed out."
      : "Failed to reach the image source.";

    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  // Defense in depth: a redirect must not escape the allowlist either.
  let landedOnAllowedHost = false;

  try {
    landedOnAllowedHost = isAllowedHost(new URL(upstream.url).hostname);
  } catch {
    landedOnAllowedHost = false;
  }

  if (!landedOnAllowedHost) {
    void upstream.body?.cancel();

    return NextResponse.json(
      { error: "Image source redirected to a disallowed host." },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    void upstream.body?.cancel();

    return NextResponse.json(
      { error: `Image source responded with status ${upstream.status}.` },
      { status: 502 }
    );
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || FALLBACK_CONTENT_TYPE,
    "Cache-Control": "public, max-age=604800, immutable",
    "Access-Control-Allow-Origin": "*"
  });

  const contentLength = upstream.headers.get("content-length");

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  if (!includeBody) {
    void upstream.body?.cancel();

    return new Response(null, { status: 200, headers });
  }

  return new Response(upstream.body, { status: 200, headers });
}

export async function GET(request: Request): Promise<Response> {
  return proxyImage(request, true);
}

// Canvas/texture loaders may probe with HEAD before fetching; answer with
// the same headers a GET would return, minus the body.
export async function HEAD(request: Request): Promise<Response> {
  return proxyImage(request, false);
}
