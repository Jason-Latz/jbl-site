import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const MAX_BODY_LENGTH = 280;
const MAX_AUTHOR_LENGTH = 40;
const NOTES_LIMIT = 50;
const RATE_LIMIT_PER_HOUR = 3;

type DeskNoteRow = {
  id: string;
  body: string;
  author: string | null;
  created_at: string;
};

type PublicNote = {
  id: string;
  body: string;
  author: string | null;
  createdAt: string;
};

let cachedServiceClient: SupabaseClient | null | undefined;

// RLS on desk_notes has no public policies; every read/write goes through
// this service-role client (mirrors lib/spotify.ts getSupabaseServiceClient).
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
    }
  });

  return cachedServiceClient;
}

function notConfigured() {
  return NextResponse.json(
    { error: "Desk notes are not configured." },
    { status: 503 }
  );
}

function toPublicNote(row: DeskNoteRow): PublicNote {
  return {
    id: row.id,
    body: row.body,
    author: row.author,
    createdAt: row.created_at
  };
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

function sanitize(text: string): string {
  return text.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
}

/**
 * Moderation: unambiguous slurs/profanity only, matched as substrings of a
 * normalized form (lowercased, common leetspeak collapsed, separators
 * stripped) so "f u c k" and "sh1t" don't slip through.
 */
const BLOCKED_TERMS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "dickhead",
  "pussy",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "kike",
  "wanker",
  "twat",
  "slut",
  "whore",
  "cocksucker"
] as const;

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s"
};

function containsBlockedTerm(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[013457@$]/g, (ch) => LEET_MAP[ch] ?? ch)
    .replace(/[^a-z]/g, "");

  return BLOCKED_TERMS.some((term) => normalized.includes(term));
}

function hashClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const salt = process.env.CRON_SECRET ?? "desk-notes-salt";

  return createHash("sha256").update(`${ip}${salt}`).digest("hex");
}

export async function GET() {
  const supabase = getServiceClient();

  if (!supabase) {
    return notConfigured();
  }

  const { data, error } = await supabase
    .from("desk_notes")
    .select("id, body, author, created_at")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(NOTES_LIMIT);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load the notes." },
      { status: 502 }
    );
  }

  const notes = ((data ?? []) as DeskNoteRow[]).map(toPublicNote);

  return NextResponse.json(
    { notes },
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
      { error: "Send your note as JSON." },
      { status: 400 }
    );
  }

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json(
      { error: "Send your note as JSON." },
      { status: 400 }
    );
  }

  const { body: rawBody, author: rawAuthor } = payload as {
    body?: unknown;
    author?: unknown;
  };

  if (typeof rawBody !== "string") {
    return NextResponse.json(
      { error: "A note needs a body." },
      { status: 400 }
    );
  }

  if (
    rawAuthor !== undefined &&
    rawAuthor !== null &&
    typeof rawAuthor !== "string"
  ) {
    return NextResponse.json(
      { error: "The name should be plain text." },
      { status: 400 }
    );
  }

  const body = sanitize(rawBody);

  if (body.length === 0) {
    return NextResponse.json(
      { error: "Write a little something first." },
      { status: 400 }
    );
  }

  if (body.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Notes max out at ${MAX_BODY_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const author = typeof rawAuthor === "string" ? sanitize(rawAuthor) : "";

  if (author.length > MAX_AUTHOR_LENGTH) {
    return NextResponse.json(
      { error: `Names max out at ${MAX_AUTHOR_LENGTH} characters.` },
      { status: 400 }
    );
  }

  if (containsBlockedTerm(body) || containsBlockedTerm(author)) {
    return NextResponse.json(
      { error: "Let's keep the desk friendly." },
      { status: 400 }
    );
  }

  const ipHash = hashClientIp(request);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error: countError } = await supabase
    .from("desk_notes")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", oneHourAgo);

  if (countError) {
    return NextResponse.json(
      { error: "Couldn't check the pad. Try again in a moment." },
      { status: 502 }
    );
  }

  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: "Three notes an hour is plenty — come back in a bit." },
      { status: 429 }
    );
  }

  const { data, error: insertError } = await supabase
    .from("desk_notes")
    .insert({
      body,
      author: author || null,
      ip_hash: ipHash,
      approved: true
    })
    .select("id, body, author, created_at")
    .single();

  if (insertError || !data) {
    return NextResponse.json(
      { error: "The note didn't stick. Try again." },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { note: toPublicNote(data as DeskNoteRow) },
    { status: 201 }
  );
}
