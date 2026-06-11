"use client";

// Jason's seat at the chessboard. Same single global game the desk shows —
// loaded through the same hook — but oriented to his side of the table and
// wired to /api/chess/admin, where his session (not an IP) is the credential.
// The game GET is public, so the board renders even signed out; an attempted
// move just answers 401, which we surface as a nudge toward the sign-in card
// above. The shell borrows the desk panel's dark stage so the shared
// .desk-chess-* styles read correctly on the light admin page.

import { useEffect, useRef, useState } from "react";
import ChessBoard2D from "@/components/desk/panels/ChessBoard2D";
import {
  isPublicChessGame,
  useChessGame,
  type PublicChessGame,
  type PublicChessMove
} from "@/lib/useChessGame";

const ADMIN_ENDPOINT = "/api/chess/admin";
const SIGN_IN_NUDGE = "Sign in above to move.";
const FALLBACK_MOVE_ERROR = "The move didn't land — try again.";
const FALLBACK_RESET_ERROR = "The new board didn't set up. Try again.";

type Notice = { kind: "error" | "info"; text: string };

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();

  if (Number.isNaN(then)) {
    return "";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return days === 1 ? "yesterday" : `${days} days ago`;
  }

  return `on ${new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  })}`;
}

// Same beats as the desk panel's headline, but written from Jason's chair.
function headlineFor(game: PublicChessGame): string {
  if (game.status === "finished") {
    if (game.result === "jason") {
      return game.check ? "Checkmate — you held the desk." : "You held the desk.";
    }
    if (game.result === "world") {
      return game.check
        ? "Checkmate — the world took this one."
        : "The world took this one.";
    }
    if (game.result === "draw") {
      return "A draw — honors even.";
    }
    return "This game went to the archive unfinished.";
  }

  if (game.turn === "jason") {
    return game.check
      ? "Your move — and your king is in check."
      : "Your move.";
  }

  return game.check
    ? "The world is on the move — and in check."
    : "The world is thinking it over.";
}

function sublineFor(game: PublicChessGame): string {
  if (!game.lastMove) {
    return game.turn === "jason"
      ? "No moves yet — the opening is yours."
      : "No moves yet — the world opens.";
  }

  const mover = game.lastMove.by === "world" ? "The world" : "You";
  return `${mover} played ${game.lastMove.san} · ${relativeTime(
    game.lastMove.at
  )}`;
}

export default function ChessAdmin() {
  const { game, error, isLoading, refresh } = useChessGame();

  const [posting, setPosting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Keep the latest moves in view as the game grows (mirrors ChessPanel).
  const movesRef = useRef<HTMLOListElement | null>(null);
  const moveCount = game?.moves.length ?? 0;

  useEffect(() => {
    const list = movesRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [moveCount]);

  async function postAdmin(body: Record<string, unknown>): Promise<{
    ok: boolean;
    status: number;
    error?: string;
    game?: PublicChessGame;
  }> {
    const response = await fetch(ADMIN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const payload = (await response.json().catch(() => null)) as {
      game?: unknown;
      error?: string;
    } | null;

    if (response.ok && payload && isPublicChessGame(payload.game)) {
      return { ok: true, status: response.status, game: payload.game };
    }

    return { ok: false, status: response.status, error: payload?.error };
  }

  async function handleMove(from: string, to: string, promotion?: string) {
    if (!game || posting || resetting) {
      return;
    }

    setPosting(true);
    setNotice(null);

    try {
      const result = await postAdmin({
        action: "move",
        gameId: game.id,
        ply: game.ply,
        from,
        to,
        ...(promotion ? { promotion } : {})
      });

      if (result.ok) {
        // The hook is the single source of truth — pull the fresh board
        // through it rather than patching state on the side.
        await refresh();
        return;
      }

      if (result.status === 401) {
        setNotice({ kind: "error", text: SIGN_IN_NUDGE });
        return;
      }

      if (result.status === 409) {
        // The board moved (or finished) while this was in flight — reconcile.
        void refresh();
      }

      setNotice({ kind: "error", text: result.error ?? FALLBACK_MOVE_ERROR });
    } catch {
      setNotice({ kind: "error", text: FALLBACK_MOVE_ERROR });
    } finally {
      setPosting(false);
    }
  }

  async function handleNewGame() {
    if (posting || resetting) {
      return;
    }

    setResetting(true);
    setConfirmingReset(false);
    setNotice(null);

    try {
      const result = await postAdmin({ action: "new_game" });

      if (result.ok && result.game) {
        await refresh();
        setNotice({
          kind: "info",
          text:
            result.game.turn === "world"
              ? "Fresh board — the world has the opening move."
              : "Fresh board — and the opening move is yours."
        });
        return;
      }

      if (result.status === 401) {
        setNotice({ kind: "error", text: SIGN_IN_NUDGE });
        return;
      }

      setNotice({ kind: "error", text: result.error ?? FALLBACK_RESET_ERROR });
    } catch {
      setNotice({ kind: "error", text: FALLBACK_RESET_ERROR });
    } finally {
      setResetting(false);
    }
  }

  if (isLoading && !game) {
    return (
      <div className="chess-admin-shell">
        <p className="desk-panel-empty">Setting up the board…</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="chess-admin-shell">
        <p className="desk-panel-empty">
          {error ?? "Couldn't reach the board — it'll be back."}
        </p>
        <button
          type="button"
          className="desk-panel-button desk-chess-retry"
          onClick={() => void refresh()}
        >
          Try again
        </button>
      </div>
    );
  }

  const jasonColor: "w" | "b" = game.worldColor === "w" ? "b" : "w";
  const orientation = jasonColor === "w" ? "white" : "black";
  const jasonToMove = game.status === "active" && game.turn === "jason";

  const pairs: Array<{
    no: number;
    white: PublicChessMove;
    black: PublicChessMove | null;
  }> = [];

  for (let i = 0; i < game.moves.length; i += 2) {
    pairs.push({
      no: i / 2 + 1,
      white: game.moves[i],
      black: game.moves[i + 1] ?? null
    });
  }

  return (
    <div className="chess-admin-shell">
      <div className="chess-admin-layout">
        <div className="chess-admin-boardside">
          <ChessBoard2D
            fen={game.fen}
            orientation={orientation}
            selectable={jasonToMove ? jasonColor : null}
            lastMove={game.lastMove}
            onMove={(from, to, promotion) =>
              void handleMove(from, to, promotion)
            }
            disabled={posting || resetting}
          />
          {posting ? (
            <p className="desk-panel-meta desk-chess-posting" aria-live="polite">
              Playing your move…
            </p>
          ) : null}
        </div>

        <div className="chess-admin-aside">
          <div>
            <p className="desk-chess-status" role="status">
              {headlineFor(game)}
            </p>
            <p className="desk-panel-meta">{sublineFor(game)}</p>
            <p className="desk-panel-meta">
              You have the {jasonColor === "w" ? "white" : "black"} pieces.
            </p>
          </div>

          {notice ? (
            notice.kind === "error" ? (
              <p
                className="desk-chess-notice chess-admin-notice"
                role="alert"
              >
                {notice.text}
              </p>
            ) : (
              <p className="chess-admin-info" role="status">
                {notice.text}
              </p>
            )
          ) : null}

          <div>
            <h3 className="desk-panel-section-title">Moves so far</h3>
            {pairs.length > 0 ? (
              <ol
                className="desk-chess-moves chess-admin-moves"
                ref={movesRef}
              >
                {pairs.map((pair) => (
                  <li key={pair.no} className="desk-chess-move-row">
                    <span className="desk-chess-move-no">{pair.no}.</span>
                    <span
                      className={
                        pair.white.by === "jason"
                          ? "desk-chess-move desk-chess-move--jason"
                          : "desk-chess-move"
                      }
                    >
                      {pair.white.san}
                    </span>
                    {pair.black ? (
                      <span
                        className={
                          pair.black.by === "jason"
                            ? "desk-chess-move desk-chess-move--jason"
                            : "desk-chess-move"
                        }
                      >
                        {pair.black.san}
                      </span>
                    ) : (
                      <span className="desk-chess-move desk-chess-move--pending">
                        …
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="desk-panel-empty">
                No moves yet — a blank scoresheet.
              </p>
            )}
          </div>

          <div>
            {confirmingReset ? (
              <>
                <p className="desk-panel-empty chess-admin-confirm-copy">
                  This files the current game away — scoresheet and all — and
                  sets out a fresh board with the colors swapped. The world
                  won't see this position again.
                </p>
                <div className="chess-admin-actions">
                  <button
                    type="button"
                    className="desk-panel-button"
                    onClick={() => void handleNewGame()}
                    disabled={posting || resetting}
                  >
                    {resetting ? "Setting up…" : "Yes — archive it and reset"}
                  </button>
                  <button
                    type="button"
                    className="chess-admin-cancel"
                    onClick={() => setConfirmingReset(false)}
                    disabled={resetting}
                  >
                    never mind
                  </button>
                </div>
              </>
            ) : (
              <div className="chess-admin-actions">
                {game.status === "finished" ? (
                  <button
                    type="button"
                    className="desk-panel-button"
                    onClick={() => void handleNewGame()}
                    disabled={posting || resetting}
                  >
                    {resetting
                      ? "Setting up…"
                      : "Start a fresh game (archives this one)"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="desk-panel-button chess-admin-button--quiet"
                    onClick={() => {
                      setNotice(null);
                      setConfirmingReset(true);
                    }}
                    disabled={posting || resetting}
                  >
                    Start a fresh game (archives this one)
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="desk-chess-footnote">
            Same game the desk shows — your reply lands for everyone.
          </p>
        </div>
      </div>
    </div>
  );
}
