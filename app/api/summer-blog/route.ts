import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  AUTHOR_KEYS,
  isValidWeekStart,
  normalizeUrl,
  type SummerAuthorKey,
  type SummerEntry
} from "@/lib/summerBlog";

export const dynamic = "force-dynamic";

const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 160;

let cachedServiceClient: SupabaseClient | null | undefined;

// RLS on summer_blog_entries has no public policies; every read/write goes
// through this service-role client (mirrors app/api/desk-notes/route.ts).
function getServiceClient(): SupabaseClient | null {
  if (cachedServiceClient !== undefined) {
    return cachedServiceClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    cachedServiceClient = null;
    return null;
  }

  cachedServiceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      // Next 14 data-caches GET fetches even in force-dynamic route handlers,
      // freezing reads within a warm instance (see CLAUDE.md / desk-notes).
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" })
    }
  });

  return cachedServiceClient;
}

function notConfigured() {
  return NextResponse.json(
    { error: "Summer blog is not configured." },
    { status: 503 }
  );
}

// Constant-time check of the shared editing passcode. If SUMMER_BLOG_PASSCODE is
// unset, editing is simply disabled (viewing still works).
function passcodeOk(provided: unknown): boolean {
  const expected = process.env.SUMMER_BLOG_PASSCODE ?? "";
  if (!expected || typeof provided !== "string" || provided.length === 0) {
    return false;
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

// Drop C0/C1 control characters and collapse whitespace. Filtering by codepoint
// keeps this source pure-ASCII (no literal control bytes in a regex).
function sanitize(text: string): string {
  const stripped = Array.from(text)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && !(code >= 0x7f && code <= 0x9f);
    })
    .join("");
  return stripped.replace(/\s+/g, " ").trim();
}

type EntryRow = {
  week_start: string;
  author: SummerAuthorKey;
  url: string;
  title: string | null;
};

function toEntry(row: EntryRow): SummerEntry {
  return {
    weekStart: row.week_start,
    author: row.author,
    url: row.url,
    title: row.title
  };
}

function isAuthorKey(value: unknown): value is SummerAuthorKey {
  return typeof value === "string" && (AUTHOR_KEYS as string[]).includes(value);
}

export async function GET() {
  const supabase = getServiceClient();

  if (!supabase) {
    return notConfigured();
  }

  const { data, error } = await supabase
    .from("summer_blog_entries")
    .select("week_start, author, url, title")
    .order("week_start", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load the entries." },
      { status: 502 }
    );
  }

  const entries = ((data ?? []) as EntryRow[]).map(toEntry);

  return NextResponse.json(
    { entries },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const supabase = getServiceClient();

  if (!supabase) {
    return notConfigured();
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Send your request as JSON." },
      { status: 400 }
    );
  }

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json(
      { error: "Send your request as JSON." },
      { status: 400 }
    );
  }

  const body = payload as {
    action?: unknown;
    passcode?: unknown;
    author?: unknown;
    weekStart?: unknown;
    url?: unknown;
    title?: unknown;
  };

  // Every write requires the shared passcode.
  if (!passcodeOk(body.passcode)) {
    return NextResponse.json(
      { error: "That passcode isn't right." },
      { status: 401 }
    );
  }

  // The client verifies the passcode before revealing any edit affordances.
  if (body.action === "unlock") {
    return NextResponse.json({ ok: true });
  }

  if (!isAuthorKey(body.author)) {
    return NextResponse.json({ error: "Unknown writer." }, { status: 400 });
  }

  if (typeof body.weekStart !== "string" || !isValidWeekStart(body.weekStart)) {
    return NextResponse.json({ error: "That week isn't open." }, { status: 400 });
  }

  const author = body.author;
  const weekStart = body.weekStart;

  if (body.action === "clear") {
    const { error } = await supabase
      .from("summer_blog_entries")
      .delete()
      .eq("week_start", weekStart)
      .eq("author", author);

    if (error) {
      return NextResponse.json(
        { error: "Couldn't clear the slot." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === "save") {
    if (typeof body.url !== "string") {
      return NextResponse.json({ error: "A link is required." }, { status: 400 });
    }

    if (body.url.length > MAX_URL_LENGTH) {
      return NextResponse.json({ error: "That link is too long." }, { status: 400 });
    }

    const url = normalizeUrl(body.url);
    if (!url) {
      return NextResponse.json(
        { error: "That doesn't look like a link." },
        { status: 400 }
      );
    }

    let title: string | null = null;
    if (typeof body.title === "string") {
      const clean = sanitize(body.title);
      if (clean.length > MAX_TITLE_LENGTH) {
        return NextResponse.json(
          { error: "That title is too long." },
          { status: 400 }
        );
      }
      title = clean || null;
    }

    const { data, error } = await supabase
      .from("summer_blog_entries")
      .upsert(
        {
          week_start: weekStart,
          author,
          url,
          title,
          updated_at: new Date().toISOString()
        },
        { onConflict: "week_start,author" }
      )
      .select("week_start, author, url, title")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "The link didn't save. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ entry: toEntry(data as EntryRow) });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
