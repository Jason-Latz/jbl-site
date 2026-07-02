// Shared logic for the unlisted /summer-blog page: the weekly pact between Jason,
// David, and Adrian to each publish one public piece of writing a week. Used by
// both the API route (app/api/summer-blog/route.ts) and the client component
// (app/summer-blog/SummerBlog.tsx), so keep it free of server-only imports.

// Monday of the first week. Today (build) is Wed 2026-07-01. Change to reset the
// season start.
export const SEASON_START = "2026-06-29";

// Weeks and the Sunday-night deadline are anchored to this zone so the "current
// week" doesn't flip a few hours early for the writers. Change if they move.
export const SEASON_TZ = "America/New_York";

export type SummerAuthorKey = "jason" | "david" | "adrian";

// Order here is the display order — Jason on top, as requested.
export const AUTHORS: { key: SummerAuthorKey; name: string }[] = [
  { key: "jason", name: "Jason" },
  { key: "david", name: "David" },
  { key: "adrian", name: "Adrian" }
];

export const AUTHOR_KEYS = AUTHORS.map((author) => author.key);

export type SummerEntry = {
  weekStart: string; // YYYY-MM-DD, always a Monday
  author: SummerAuthorKey;
  url: string;
  title: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Parse a YYYY-MM-DD string as UTC midnight. All week math below is pure
// integer-day arithmetic on these UTC dates, so it never drifts with DST or the
// server's local zone — only "what day is it" (todayInSeasonTz) is zone-aware.
function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Today's calendar date in SEASON_TZ as YYYY-MM-DD (en-CA renders ISO order).
export function todayInSeasonTz(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEASON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

// The Monday (YYYY-MM-DD) of the week containing dateStr. Weeks run Mon..Sun.
export function mondayOf(dateStr: string): string {
  const date = parseDate(dateStr);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7; // getUTCDay: 0=Sun..6=Sat
  return toDateStr(new Date(date.getTime() - daysSinceMonday * DAY_MS));
}

// The Sunday deadline day for a week, given its Monday.
export function sundayOf(mondayStr: string): string {
  return toDateStr(new Date(parseDate(mondayStr).getTime() + 6 * DAY_MS));
}

export function currentWeekStart(now: Date = new Date()): string {
  return mondayOf(todayInSeasonTz(now));
}

// Every week's Monday from SEASON_START through the current week, newest first.
export function listWeeks(now: Date = new Date()): string[] {
  const start = parseDate(SEASON_START).getTime();
  const current = parseDate(currentWeekStart(now)).getTime();
  const weeks: string[] = [];
  for (let time = current; time >= start; time -= 7 * DAY_MS) {
    weeks.push(toDateStr(new Date(time)));
  }
  return weeks;
}

// A week is writable only if it's a real Monday inside the season window.
export function isValidWeekStart(mondayStr: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mondayStr)) {
    return false;
  }
  if (mondayOf(mondayStr) !== mondayStr) {
    return false;
  }
  return listWeeks(now).includes(mondayStr);
}

function formatMonthDay(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric"
  }).format(parseDate(dateStr));
}

// "Jun 29 – Jul 5" (en dash, not em — see Jason's prose rule).
export function formatWeekRange(mondayStr: string): string {
  return `${formatMonthDay(mondayStr)} – ${formatMonthDay(sundayOf(mondayStr))}`;
}

// "Sun Jul 5" — the deadline shown on the current week.
export function formatDeadline(mondayStr: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(parseDate(sundayOf(mondayStr)));
}

// Accept a pasted link, tolerating a missing scheme; return a normalized http(s)
// URL or null. Used to validate on write and (leniently) before display.
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (!url.hostname.includes(".")) {
      return null; // reject bare words / localhost-style non-links
    }
    return url.toString();
  } catch {
    return null;
  }
}

// A compact, human-readable label for a URL when the writer gave no title:
// "worksinprogress.co/some-essay".
export function prettyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path}${parsed.search}`;
  } catch {
    return url;
  }
}
