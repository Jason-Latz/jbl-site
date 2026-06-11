"use client";

import { useEffect, useRef, useState } from "react";
import { type PublicChessGame, type UseChessGameResult } from "@/lib/useChessGame";
import ChessBoard2D from "./ChessBoard2D";

// The chessboard panel: one persistent game, the world vs. Jason. Whoever is
// at the desk when it's the world's turn gets to play the world's move;
// Jason answers from /admin. The hook keeps the board fresh (30 s poll), and
// optimistic concurrency on the server settles any race for the same move.

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

function headlineFor(game: PublicChessGame): string {
  if (game.status === "finished") {
    if (game.result === "world") {
      return game.check
        ? "Checkmate — the world took this one."
        : "The world took this one.";
    }
    if (game.result === "jason") {
      return game.check
        ? "Checkmate — Jason held the desk."
        : "Jason held the desk.";
    }
    return "A draw — honors even.";
  }

  if (game.turn === "world") {
    return game.check
      ? "Your move — and the world's king is in check."
      : "Your move — you're playing for the world.";
  }

  return "Jason is thinking…";
}

function sublineFor(game: PublicChessGame): string {
  if (!game.lastMove) {
    return "No moves yet — the opening is all yours.";
  }

  const mover = game.lastMove.by === "world" ? "the world" : "Jason";
  return `${mover} played ${game.lastMove.san} · ${relativeTime(
    game.lastMove.at
  )}`;
}

// The hook result comes from DeskHero (which already polls for the 3D
// board) instead of a second useChessGame here: the panel used to open on
// a cold "Setting up the board…" fetch for state the app already held,
// and ran a duplicate 30 s poller while open.
export default function ChessPanel({ chess }: { chess: UseChessGameResult }) {
  const { game, error, isLoading, refresh, makeMove } = chess;

  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Keep the latest moves in view as the game grows.
  const movesRef = useRef<HTMLOListElement | null>(null);
  const moveCount = game?.moves.length ?? 0;

  useEffect(() => {
    const list = movesRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [moveCount]);

  // The notice (a failed or raced move) sticks around until the next attempt
  // — a 409 refreshes the board underneath it, and clearing on that refresh
  // would wipe the message before anyone could read it.
  async function handleMove(from: string, to: string, promotion?: string) {
    if (posting) {
      return;
    }

    setPosting(true);
    setNotice(null);

    const result = await makeMove(from, to, promotion);
    if (!result.ok && result.error) {
      setNotice(result.error);
    }

    setPosting(false);
  }

  if (isLoading && !game) {
    return (
      <section className="desk-panel-section">
        <p className="desk-panel-empty">Setting up the board…</p>
      </section>
    );
  }

  if (!game) {
    return (
      <section className="desk-panel-section">
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
      </section>
    );
  }

  const orientation = game.worldColor === "w" ? "white" : "black";
  const worldToMove = game.status === "active" && game.turn === "world";

  const pairs: Array<{
    no: number;
    white: PublicChessGame["moves"][number];
    black: PublicChessGame["moves"][number] | null;
  }> = [];

  for (let i = 0; i < game.moves.length; i += 2) {
    pairs.push({
      no: i / 2 + 1,
      white: game.moves[i],
      black: game.moves[i + 1] ?? null
    });
  }

  return (
    <>
      <section className="desk-panel-section">
        <p className="desk-chess-status" role="status">
          {headlineFor(game)}
        </p>
        <p className="desk-panel-meta">{sublineFor(game)}</p>
        {game.status === "finished" ? (
          <p className="desk-panel-empty">A fresh board is coming soon.</p>
        ) : null}
      </section>

      <section className="desk-panel-section">
        <ChessBoard2D
          fen={game.fen}
          orientation={orientation}
          selectable={worldToMove ? game.worldColor : null}
          lastMove={game.lastMove}
          onMove={(from, to, promotion) => void handleMove(from, to, promotion)}
          disabled={posting}
        />
        {posting ? (
          <p className="desk-panel-meta desk-chess-posting" aria-live="polite">
            Playing your move…
          </p>
        ) : null}
        {notice ? (
          <p className="desk-chess-notice" role="alert">
            {notice}
          </p>
        ) : null}
      </section>

      {pairs.length > 0 ? (
        <section className="desk-panel-section">
          <h3 className="desk-panel-section-title">Moves so far</h3>
          <ol className="desk-chess-moves" ref={movesRef}>
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
        </section>
      ) : null}

      <p className="desk-chess-footnote">
        One global game. Anyone can move for the world; Jason answers from his
        desk.
      </p>
    </>
  );
}
