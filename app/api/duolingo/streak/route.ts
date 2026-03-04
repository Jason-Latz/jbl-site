import { NextResponse } from "next/server";

type DuolingoUser = {
  username?: string;
  streak?: number;
  totalXp?: number;
  streakData?: {
    currentStreak?: {
      length?: number;
      endDate?: string;
    };
  };
};

type DuolingoUsersResponse = {
  users?: DuolingoUser[];
};

const DEFAULT_USERNAME = "jasoneeee";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username")?.trim() || DEFAULT_USERNAME;
  const endpoint = `https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(
    username
  )}`;

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Duolingo returned status ${response.status}.` },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as DuolingoUsersResponse;
    const user = payload.users?.[0];

    if (!user) {
      return NextResponse.json(
        { error: `No Duolingo profile found for "${username}".` },
        { status: 404 }
      );
    }

    const streak = Math.max(
      user.streak ?? 0,
      user.streakData?.currentStreak?.length ?? 0
    );
    const resolvedUsername = user.username ?? username;

    return NextResponse.json(
      {
        username: resolvedUsername,
        streak,
        streakEndDate: user.streakData?.currentStreak?.endDate ?? null,
        totalXp: user.totalXp ?? null,
        profileUrl: `https://www.duolingo.com/profile/${resolvedUsername}`,
        fetchedAt: new Date().toISOString()
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Duolingo data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
