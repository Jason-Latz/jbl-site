"use client";

// Client hook for the one global chess game: the world vs. Jason.
// Mirrors lib/useSpotifyLive.ts — poll on an interval, stop entirely while
// the tab is hidden, refetch the moment it becomes visible again. On top of
// that it exposes makeMove(), which plays the world's move with optimistic
// concurrency: the current ply rides along, and a 409 means someone else got
// there first — we pull the fresh board and surface the server's message.

import { useCallback, useEffect, useRef, useState } from "react";

export type PublicChessMove = {
  san: string;
  by: "world" | "jason";
  at: string;
};

export type PublicChessGame = {
  id: string;
  status: "active" | "finished";
  fen: string;
  ply: number;
  turn: "world" | "jason" | null;
  worldColor: "w" | "b";
  result: "world" | "jason" | "draw" | null;
  check: boolean;
  moves: PublicChessMove[];
  lastMove: {
    from: string;
    to: string;
    san: string;
    by: "world" | "jason";
    at: string;
  } | null;
};

export type MakeMoveResult = {
  ok: boolean;
  error?: string;
};

export type UseChessGameResult = {
  game: PublicChessGame | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  makeMove: (
    from: string,
    to: string,
    promotion?: string
  ) => Promise<MakeMoveResult>;
};

const GAME_ENDPOINT = "/api/chess/game";
const MOVE_ENDPOINT = "/api/chess/move";
const POLL_INTERVAL_MS = 30_000;

const FALLBACK_LOAD_ERROR = "Couldn't reach the board — it'll be back.";
const FALLBACK_MOVE_ERROR = "The move didn't land — try again.";
const FALLBACK_RACE_ERROR =
  "Someone else just moved for the world — here's the fresh board.";

export function isPublicChessGame(
  payload: unknown
): payload is PublicChessGame {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as PublicChessGame;
  return (
    typeof candidate.id === "string" &&
    (candidate.status === "active" || candidate.status === "finished") &&
    typeof candidate.fen === "string" &&
    typeof candidate.ply === "number" &&
    (candidate.worldColor === "w" || candidate.worldColor === "b") &&
    typeof candidate.check === "boolean" &&
    Array.isArray(candidate.moves)
  );
}

export function useChessGame(): UseChessGameResult {
  const [game, setGame] = useState<PublicChessGame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // makeMove reads the freshest game (id + ply) without re-creating itself
  // on every poll, and the poll loop checks disposal across awaits.
  const gameRef = useRef<PublicChessGame | null>(null);
  const disposedRef = useRef(false);

  const applyGame = useCallback((next: PublicChessGame) => {
    // Value-equal bailout: the global game can sit unchanged for days, and
    // an unconditional setGame every 30 s poll re-rendered the hero (and,
    // before memoization, the whole canvas tree) for nothing.
    const prev = gameRef.current;
    if (
      prev &&
      prev.id === next.id &&
      prev.ply === next.ply &&
      prev.fen === next.fen &&
      prev.status === next.status
    ) {
      setError(null);
      return;
    }
    gameRef.current = next;
    setGame(next);
    setError(null);
  }, []);

  const fetchOnce = useCallback(async () => {
    try {
      const response = await fetch(GAME_ENDPOINT, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as {
        game?: unknown;
        error?: string;
      } | null;

      if (disposedRef.current) {
        return;
      }

      if (!response.ok || !payload || !isPublicChessGame(payload.game)) {
        setError(payload?.error ?? FALLBACK_LOAD_ERROR);
        return;
      }

      applyGame(payload.game);
    } catch {
      if (!disposedRef.current) {
        setError(FALLBACK_LOAD_ERROR);
      }
    } finally {
      if (!disposedRef.current) {
        setIsLoading(false);
      }
    }
  }, [applyGame]);

  const refresh = useCallback(async () => {
    await fetchOnce();
  }, [fetchOnce]);

  const makeMove = useCallback(
    async (
      from: string,
      to: string,
      promotion?: string
    ): Promise<MakeMoveResult> => {
      const current = gameRef.current;

      if (!current) {
        return { ok: false, error: "The board hasn't loaded yet." };
      }

      try {
        const response = await fetch(MOVE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId: current.id,
            ply: current.ply,
            from,
            to,
            ...(promotion ? { promotion } : {})
          })
        });

        const payload = (await response.json().catch(() => null)) as {
          game?: unknown;
          error?: string;
        } | null;

        if (disposedRef.current) {
          return { ok: false };
        }

        if (response.ok && payload && isPublicChessGame(payload.game)) {
          applyGame(payload.game);
          return { ok: true };
        }

        if (response.status === 409) {
          // Lost the race — reconcile with whatever the world played first.
          void fetchOnce();
          return { ok: false, error: payload?.error ?? FALLBACK_RACE_ERROR };
        }

        return { ok: false, error: payload?.error ?? FALLBACK_MOVE_ERROR };
      } catch {
        if (disposedRef.current) {
          return { ok: false };
        }

        return { ok: false, error: FALLBACK_MOVE_ERROR };
      }
    },
    [applyGame, fetchOnce]
  );

  useEffect(() => {
    disposedRef.current = false;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const isPageHidden = () => document.visibilityState === "hidden";

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const loop = async () => {
      if (disposedRef.current || isPageHidden()) {
        return;
      }

      await fetchOnce();

      if (disposedRef.current || isPageHidden()) {
        return;
      }

      clearTimer();
      timer = setTimeout(() => {
        void loop();
      }, POLL_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (disposedRef.current) {
        return;
      }

      // Hidden: stop the cadence entirely. Visible: refetch immediately and
      // restart the cadence from a fresh interval.
      clearTimer();
      if (!isPageHidden()) {
        void loop();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void loop();

    return () => {
      disposedRef.current = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchOnce]);

  return { game, error, isLoading, refresh, makeMove };
}
