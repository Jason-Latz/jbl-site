"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DuolingoStreakResponse = {
  username: string;
  streak: number;
  streakEndDate: string | null;
  totalXp: number | null;
  profileUrl: string;
  fetchedAt: string;
};

const USERNAME = "jasoneeee";
const POLL_INTERVAL_MS = 60_000;

function formatDay(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatCheckedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "just now";
  }

  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

export default function DuolingoStreak() {
  const [data, setData] = useState<DuolingoStreakResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStreak = useCallback(async () => {
    try {
      const response = await fetch(`/api/duolingo/streak?username=${USERNAME}`, {
        cache: "no-store"
      });
      const payload = await response.json();

      if (!response.ok) {
        const errorMessage =
          typeof payload?.error === "string"
            ? payload.error
            : "Unable to refresh streak data.";
        throw new Error(errorMessage);
      }

      setData(payload as DuolingoStreakResponse);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to refresh streak data.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStreak();
    const timer = setInterval(() => {
      void fetchStreak();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [fetchStreak]);

  const statusLine = useMemo(() => {
    if (error) {
      return `${error} Retrying every minute.`;
    }

    if (!data) {
      return "Fetching current streak...";
    }

    const endDate = formatDay(data.streakEndDate);
    const checkedAt = formatCheckedAt(data.fetchedAt);
    const dateLine = endDate ? `Streak through ${endDate}.` : "Streak is active.";

    return `${dateLine} Last checked ${checkedAt}.`;
  }, [data, error]);

  const streakLine = !data && isLoading ? "Loading streak..." : `${data?.streak ?? 0} day streak`;

  return (
    <section className="duolingo-tracker card" aria-live="polite">
      <div className="duolingo-head">
        <p className="duolingo-label">Live Duolingo streak</p>
        <a
          href={data?.profileUrl ?? `https://www.duolingo.com/profile/${USERNAME}`}
          target="_blank"
          rel="noreferrer"
        >
          Open profile ↗
        </a>
      </div>
      <p className="duolingo-streak-value">{streakLine}</p>
      <p className="duolingo-meta">{statusLine}</p>
    </section>
  );
}
