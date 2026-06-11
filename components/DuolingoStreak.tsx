"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DuolingoStreakResponse = {
  username: string;
  streak: number;
  streakEndDate: string | null;
  totalXp: number | null;
  profileUrl: string;
  fetchedAt: string;
};

const USERNAME = "jasoneeee";
const STORAGE_KEY = `duolingo-streak-cache-${USERNAME}`;
const POLL_INTERVAL_MS = 60_000;
const ERROR_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];
const STREAK_ICON_URL = "/duolingo-streak-fire.svg";

type ParsedResponsePayload =
  | { type: "empty" }
  | { type: "json"; payload: unknown }
  | { type: "text"; payload: string };

function getRetryDelayMs(consecutiveErrors: number) {
  if (consecutiveErrors <= 0) {
    return POLL_INTERVAL_MS;
  }

  const delayIndex = Math.min(
    consecutiveErrors - 1,
    ERROR_RETRY_DELAYS_MS.length - 1
  );
  return ERROR_RETRY_DELAYS_MS[delayIndex];
}

function formatRetryDelay(ms: number) {
  if (ms < 60_000) {
    return `${Math.round(ms / 1000)}s`;
  }

  return `${Math.round(ms / 60_000)}m`;
}

function getPayloadError(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return null;
}

async function parseResponsePayload(response: Response): Promise<ParsedResponsePayload> {
  const rawBody = await response.text();

  if (!rawBody) {
    return { type: "empty" };
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return { type: "json", payload: parsed };
  } catch {
    return { type: "text", payload: rawBody };
  }
}

function isDuolingoStreakResponse(payload: unknown): payload is DuolingoStreakResponse {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as DuolingoStreakResponse).username === "string" &&
    typeof (payload as DuolingoStreakResponse).streak === "number" &&
    typeof (payload as DuolingoStreakResponse).fetchedAt === "string"
  );
}

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

function getIsDocumentVisible() {
  if (typeof document === "undefined") {
    return true;
  }

  return document.visibilityState !== "hidden";
}

export default function DuolingoStreak() {
  const [data, setData] = useState<DuolingoStreakResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [isPageVisible, setIsPageVisible] = useState(getIsDocumentVisible);
  const consecutiveErrorsRef = useRef(0);

  useEffect(() => {
    try {
      const cachedValue = localStorage.getItem(STORAGE_KEY);
      if (!cachedValue) {
        return;
      }

      const parsed = JSON.parse(cachedValue) as unknown;
      if (!isDuolingoStreakResponse(parsed)) {
        return;
      }

      setData(parsed);
      setIsLoading(false);
    } catch {
      // Ignore cache read failures and keep fetching live data.
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const updateVisibility = () => {
      setIsPageVisible(getIsDocumentVisible());
    };

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);

    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  const fetchStreak = useCallback(async () => {
    try {
      const response = await fetch(`/api/duolingo/streak?username=${USERNAME}`, {
        cache: "no-store"
      });
      const parsedPayload = await parseResponsePayload(response);
      const payload =
        parsedPayload.type === "json" ? parsedPayload.payload : null;

      if (!response.ok) {
        const errorMessage =
          getPayloadError(payload) ??
          `Duolingo endpoint returned status ${response.status}.`;
        throw new Error(errorMessage);
      }

      if (parsedPayload.type !== "json") {
        throw new Error("Duolingo endpoint returned an invalid response.");
      }

      if (!isDuolingoStreakResponse(payload)) {
        throw new Error("Unexpected Duolingo response shape.");
      }

      setData(payload);
      setError(null);
      consecutiveErrorsRef.current = 0;
      setConsecutiveErrors(0);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // Ignore cache write failures.
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to refresh streak data.";
      setError(message);
      const nextErrorCount = consecutiveErrorsRef.current + 1;
      consecutiveErrorsRef.current = nextErrorCount;
      setConsecutiveErrors(nextErrorCount);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPageVisible) {
      return;
    }

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loop = async () => {
      await fetchStreak();
      if (disposed) {
        return;
      }
      const nextDelay = getRetryDelayMs(consecutiveErrorsRef.current);

      timer = setTimeout(() => {
        if (!disposed) {
          void loop();
        }
      }, nextDelay);
    };

    void loop();

    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [fetchStreak, isPageVisible]);

  const statusLine = useMemo(() => {
    const retryDelay = formatRetryDelay(getRetryDelayMs(consecutiveErrors));

    if (error) {
      if (data) {
        const checkedAt = formatCheckedAt(data.fetchedAt);
        return `Showing last known streak (checked ${checkedAt}). ${error} Retrying in ${retryDelay}.`;
      }

      return `Could not load streak yet. ${error} Retrying in ${retryDelay}.`;
    }

    if (!data) {
      return "Fetching current streak...";
    }

    const endDate = formatDay(data.streakEndDate);
    const checkedAt = formatCheckedAt(data.fetchedAt);
    const dateLine = endDate ? `Streak through ${endDate}.` : "Streak is active.";

    return `${dateLine} Last checked ${checkedAt}.`;
  }, [consecutiveErrors, data, error]);

  const streakLine = data
    ? `${data.streak} day streak`
    : isLoading
      ? "Loading streak..."
      : "Streak temporarily unavailable";

  return (
    <section className="activity-item" aria-live="polite">
      <details className="activity-panel">
        <summary className="activity-summary activity-summary-duolingo">
          <span className="activity-summary-label-row">
            <img
              className="duolingo-fire-icon"
              src={STREAK_ICON_URL}
              alt=""
              loading="lazy"
              decoding="async"
              aria-hidden="true"
            />
            <span className="activity-summary-label">Duolingo</span>
          </span>
          <span className="activity-summary-value">{streakLine}</span>
          <span className="activity-summary-caret" aria-hidden="true" />
        </summary>

        <div className="activity-details">
          <div className="duolingo-tracker card">
            <div className="duolingo-head">
              <div className="duolingo-label-row">
                <img
                  className="duolingo-fire-icon"
                  src={STREAK_ICON_URL}
                  alt="Duolingo streak flame"
                  loading="lazy"
                  decoding="async"
                />
                <p className="duolingo-label">Live Duolingo streak</p>
              </div>
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
          </div>
        </div>
      </details>
    </section>
  );
}
