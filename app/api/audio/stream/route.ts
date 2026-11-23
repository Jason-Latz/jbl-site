import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 10_000;
const FALLBACK_CONTENT_TYPE = "audio/mp4";

/**
 * SSRF guard: only Apple's preview CDNs may be proxied. Exact hostname
 * equality (or a dot-anchored suffix for *.mzstatic.com) — never substring
 * matching, which "evil.com/?audio-ssl.itunes.apple.com" would defeat.
 */
const ALLOWED_HOSTNAMES = new Set([
  "audio-ssl.itunes.apple.com",
  "itunes.apple.com"
]);

const ALLOWED_HOSTNAME_SUFFIX = ".mzstatic.com";

function isAllowedHost(hostname: string): boolean {
  return (
    ALLOWED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(ALLOWED_HOSTNAME_SUFFIX)
  );
}

async function proxyPreview(
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

  let previewUrl: URL;

  try {
    previewUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json(
      { error: 'The "u" query parameter is not a valid URL.' },
      { status: 400 }
    );
  }

  if (previewUrl.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only https preview URLs are supported." },
      { status: 400 }
    );
  }

  if (!isAllowedHost(previewUrl.hostname)) {
    return NextResponse.json(
      { error: "Host is not an allowed audio preview source." },
      { status: 403 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const range = request.headers.get("range");

  let upstream: Response;

  try {
    // Forward only a well-formed byte range so media loaders can probe and seek.
    // The Apple CDN receives an anonymous request without browser credentials.
    upstream = await fetch(previewUrl, {
      signal: controller.signal,
      cache: "no-store",
      headers: range && /^bytes=(?:\d+-\d*|-\d+)$/.test(range) ? { Range: range } : undefined
    });
  } catch {
    const message = controller.signal.aborted
      ? "Audio source timed out."
      : "Failed to reach the audio source.";

    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    // Cleared once headers arrive, so the 10s budget covers connection
    // setup only — long audio streams are not cut off mid-body.
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
      { error: "Audio source redirected to a disallowed host." },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    void upstream.body?.cancel();

    return NextResponse.json(
      { error: `Audio source responded with status ${upstream.status}.` },
      { status: 502 }
    );
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || FALLBACK_CONTENT_TYPE,
    "Cache-Control": "public, max-age=86400, immutable",
    "Access-Control-Allow-Origin": "*",
    "Vary": "Range"
  });

  for (const name of ["content-length", "accept-ranges", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  if (!includeBody) {
    void upstream.body?.cancel();

    return new Response(null, { status: upstream.status, headers });
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function GET(request: Request): Promise<Response> {
  return proxyPreview(request, true);
}

// The <audio> element may probe with HEAD before streaming; answer with the
// same headers it would get from GET, minus the body.
export async function HEAD(request: Request): Promise<Response> {
  return proxyPreview(request, false);
}
