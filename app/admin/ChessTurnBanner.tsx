"use client";

// A nudge pinned to the top of /admin so Jason sees, the moment he lands, when
// the world has moved and it's his turn to reply. The board itself lives further
// down the page (below the article editor), so this links straight to it. It
// renders NOTHING unless it's actually his move — quiet until there's something
// to do. Shares no state with ChessAdmin below; both poll the one global game.

import { useChessGame } from "@/lib/useChessGame";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins === 1 ? "a minute ago" : `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs === 1 ? "an hour ago" : `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export default function ChessTurnBanner() {
  const { game } = useChessGame();

  // Only speak up when the world has moved and the board is waiting on Jason.
  if (!game || game.status !== "active" || game.turn !== "jason") {
    return null;
  }

  const move = game.lastMove;

  return (
    <a className="chess-turn-banner" href="#chessboard" role="status">
      <span className="chess-turn-banner-dot" aria-hidden="true" />
      <span className="chess-turn-banner-text">
        <strong>Your move.</strong>{" "}
        {move
          ? `The world played ${move.san} ${relativeTime(move.at)}.`
          : "The world is waiting on your opening."}
      </span>
      <span className="chess-turn-banner-cta" aria-hidden="true">
        Go to the board ↓
      </span>
    </a>
  );
}
