"use client";

// A clickable 2D chessboard in the desk's palette — cream and wood squares,
// coral for the last move and selection. Pieces are a custom inline-SVG set
// (drawn for this site; no unicode glyphs, which render differently on every
// platform). chess.js runs client-side purely for legal-move hints and the
// promotion check — the server remains the referee.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square
} from "chess.js";

export type ChessBoard2DProps = {
  fen: string;
  orientation: "white" | "black";
  /** Which color the viewer may pick up — null renders a look-only board. */
  selectable: Color | null;
  lastMove?: { from: string; to: string } | null;
  onMove?: (from: string, to: string, promotion?: string) => void;
  disabled?: boolean;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king"
};

const COLOR_NAMES: Record<Color, string> = {
  w: "white",
  b: "black"
};

const PROMOTION_CHOICES: PieceSymbol[] = ["q", "r", "b", "n"];

// Hand-drawn piece set, 45x45 units, shared rounded base, warm palette.
// White pieces are cream with a wood outline; black pieces are espresso
// with a near-black outline and faint gold detail lines so they stay
// legible on the dark squares.
const PIECE_PALETTES: Record<
  Color,
  { fill: string; stroke: string; detail: string }
> = {
  w: { fill: "#f6efdd", stroke: "#59402a", detail: "#59402a" },
  b: { fill: "#3b2516", stroke: "#20130a", detail: "#caa97d" }
};

function pieceShapes(type: PieceSymbol, color: Color): ReactNode {
  const { fill, stroke, detail } = PIECE_PALETTES[color];
  const body = {
    fill,
    stroke,
    strokeWidth: 1.4,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const
  };
  const line = {
    fill: "none",
    stroke: detail,
    strokeWidth: 1.2,
    strokeLinecap: "round" as const
  };

  switch (type) {
    case "p":
      return (
        <>
          <circle cx="22.5" cy="13.5" r="4.6" {...body} />
          <path
            d="M20 17.5 C18.5 21 17.3 24.5 16.9 29.5 L28.1 29.5 C27.7 24.5 26.5 21 25 17.5 Z"
            {...body}
          />
          <rect x="15.5" y="29.5" width="14" height="2.6" rx="1.3" {...body} />
          <rect x="14.5" y="32.6" width="16" height="4.2" rx="2.1" {...body} />
        </>
      );
    case "r":
      return (
        <>
          <path
            d="M14.5 9.5 H18 V12.5 H20.75 V9.5 H24.25 V12.5 H27 V9.5 H30.5 V16 H14.5 Z"
            {...body}
          />
          <path d="M17 16 L16.6 28.5 H28.4 L28 16 Z" {...body} />
          <rect x="15" y="28.5" width="15" height="2.8" rx="1.2" {...body} />
          <rect x="12.5" y="33.5" width="20" height="4.5" rx="2.25" {...body} />
        </>
      );
    case "n":
      return (
        <>
          <path
            d="M18.2 33.5 C17.9 29.8 17.8 27 19.2 24.2 C16.6 24 13.6 23 12.3 20.8 C11.4 19.2 11.5 17.4 12.5 16.2 C13.8 14.7 15.9 14.4 17.4 13.6 L19.6 8.9 C19.8 8.4 20.5 8.3 20.8 8.8 L22.3 11.6 L24.7 12.2 C29.3 13.5 31.4 18.1 31.1 23.4 L30.5 33.5 Z"
            {...body}
          />
          <circle cx="17.7" cy="17.4" r="0.95" fill={detail} stroke="none" />
          <circle cx="13.7" cy="19" r="0.7" fill={detail} stroke="none" />
          <path d="M12.6 20.9 l2.2 0.7" {...line} />
          <path d="M24.4 13.6 C27.5 15 29 18.2 28.9 22.2" {...line} />
          <rect x="12.5" y="33.5" width="20" height="4.5" rx="2.25" {...body} />
        </>
      );
    case "b":
      return (
        <>
          <circle cx="22.5" cy="8.3" r="2" {...body} />
          <path
            d="M22.5 11 C26.2 14.6 28.6 18.4 28.6 22.3 C28.6 26.3 26 29 22.5 29 C19 29 16.4 26.3 16.4 22.3 C16.4 18.4 18.8 14.6 22.5 11 Z"
            {...body}
          />
          <path d="M22.5 15.2 L25.7 20.8" {...line} />
          <rect x="17.4" y="29.3" width="10.2" height="2.4" rx="1.2" {...body} />
          <path d="M18.4 31.7 L16.2 33.5 H28.8 L26.6 31.7 Z" {...body} />
          <rect x="12.5" y="33.5" width="20" height="4.5" rx="2.25" {...body} />
        </>
      );
    case "q":
      return (
        <>
          <path
            d="M14.2 13.6 L17.1 20.4 L18.9 11.4 L21.4 19.4 L22.5 10.6 L23.6 19.4 L26.1 11.4 L27.9 20.4 L30.8 13.6 L29.4 26 L15.6 26 Z"
            {...body}
          />
          <circle cx="14.2" cy="12" r="1.3" {...body} />
          <circle cx="18.9" cy="9.9" r="1.3" {...body} />
          <circle cx="22.5" cy="9" r="1.3" {...body} />
          <circle cx="26.1" cy="9.9" r="1.3" {...body} />
          <circle cx="30.8" cy="12" r="1.3" {...body} />
          <rect x="15" y="26" width="15" height="2.4" rx="1.2" {...body} />
          <path
            d="M16.2 28.4 C15.8 30.4 15 31.8 14 33.5 H31 C30 31.8 29.2 30.4 28.8 28.4 Z"
            {...body}
          />
          <rect x="12.5" y="33.5" width="20" height="4.5" rx="2.25" {...body} />
        </>
      );
    case "k":
      return (
        <>
          <path
            d="M21.4 6.5 H23.6 V9.3 H26.3 V11.5 H23.6 V14.3 H21.4 V11.5 H18.7 V9.3 H21.4 Z"
            {...body}
          />
          <path
            d="M22.5 14.3 C27.2 14.3 30.2 17.4 30.2 21.2 C30.2 24 28.8 26 26.8 27.2 H18.2 C16.2 26 14.8 24 14.8 21.2 C14.8 17.4 17.8 14.3 22.5 14.3 Z"
            {...body}
          />
          <rect x="16.4" y="27.2" width="12.2" height="2.4" rx="1.2" {...body} />
          <path
            d="M17.6 29.6 C17.2 31.2 16.4 32.4 15.4 33.5 H29.6 C28.6 32.4 27.8 31.2 27.4 29.6 Z"
            {...body}
          />
          <rect x="12.5" y="33.5" width="20" height="4.5" rx="2.25" {...body} />
        </>
      );
  }
}

export function PieceGlyph({
  type,
  color
}: {
  type: PieceSymbol;
  color: Color;
}) {
  return (
    <svg
      viewBox="0 0 45 45"
      className="desk-chess-glyph"
      aria-hidden="true"
      focusable="false"
    >
      {pieceShapes(type, color)}
    </svg>
  );
}

function squaresFor(orientation: "white" | "black"): Square[] {
  const files = orientation === "white" ? [...FILES] : [...FILES].reverse();
  const ranks =
    orientation === "white"
      ? ["8", "7", "6", "5", "4", "3", "2", "1"]
      : ["1", "2", "3", "4", "5", "6", "7", "8"];

  const out: Square[] = [];
  for (const rank of ranks) {
    for (const file of files) {
      out.push(`${file}${rank}` as Square);
    }
  }
  return out;
}

function isLightSquare(square: Square): boolean {
  const fileIndex = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rankIndex = Number(square[1]) - 1;
  return (fileIndex + rankIndex) % 2 === 1;
}

export default function ChessBoard2D({
  fen,
  orientation,
  selectable,
  lastMove = null,
  onMove,
  disabled = false
}: ChessBoard2DProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  const position = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return null;
    }
  }, [fen]);

  // A new position means the board moved on — drop any half-made gesture.
  useEffect(() => {
    setSelected(null);
    setPendingPromotion(null);
  }, [fen]);

  const interactive =
    !disabled &&
    !!onMove &&
    !!position &&
    selectable !== null &&
    position.turn() === selectable;

  const legalMoves: Move[] = useMemo(() => {
    if (!interactive || !position || !selected) {
      return [];
    }
    return position.moves({ square: selected, verbose: true });
  }, [interactive, position, selected]);

  const targetSquares = useMemo(
    () => new Set(legalMoves.map((move) => move.to)),
    [legalMoves]
  );

  const captureSquares = useMemo(
    () =>
      new Set(
        legalMoves
          .filter((move) => move.isCapture() || move.isEnPassant())
          .map((move) => move.to)
      ),
    [legalMoves]
  );

  // Soft warning glow under the king that's in check.
  const checkedKingSquare = useMemo(() => {
    if (!position || !position.inCheck()) {
      return null;
    }
    const sideToMove = position.turn();
    for (const row of position.board()) {
      for (const cell of row) {
        if (cell && cell.type === "k" && cell.color === sideToMove) {
          return cell.square;
        }
      }
    }
    return null;
  }, [position]);

  const displaySquares = useMemo(() => squaresFor(orientation), [orientation]);

  function handleSquareClick(square: Square) {
    if (!interactive || !position) {
      return;
    }

    if (pendingPromotion) {
      setPendingPromotion(null);
      return;
    }

    if (selected) {
      if (square === selected) {
        setSelected(null);
        return;
      }

      const movesToSquare = legalMoves.filter((move) => move.to === square);
      if (movesToSquare.length > 0) {
        if (movesToSquare.some((move) => move.promotion)) {
          setPendingPromotion({ from: selected, to: square });
        } else {
          onMove?.(selected, square);
          setSelected(null);
        }
        return;
      }
    }

    const piece = position.get(square);
    if (piece && piece.color === selectable) {
      setSelected(square);
      return;
    }

    setSelected(null);
  }

  function confirmPromotion(piece: PieceSymbol) {
    if (!pendingPromotion) {
      return;
    }
    onMove?.(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
    setSelected(null);
  }

  return (
    <div className="desk-chess-board-frame">
      <div
        className="desk-chess-board"
        role="grid"
        aria-label={`Chessboard from ${orientation}'s side`}
      >
        {displaySquares.map((square, index) => {
          const piece = position?.get(square) ?? undefined;
          const light = isLightSquare(square);
          const isLast =
            !!lastMove && (square === lastMove.from || square === lastMove.to);
          const isSelected = square === selected;
          const isTarget = targetSquares.has(square);
          const isCapture = captureSquares.has(square);
          const inCheck = square === checkedKingSquare;
          const col = index % 8;
          const row = Math.floor(index / 8);

          const classNames = [
            "desk-chess-square",
            light ? "desk-chess-square--light" : "desk-chess-square--dark"
          ];
          if (isLast) classNames.push("desk-chess-square--last");
          if (isSelected) classNames.push("desk-chess-square--selected");
          if (inCheck) classNames.push("desk-chess-square--check");
          if (
            interactive &&
            (isTarget || (piece && piece.color === selectable))
          ) {
            classNames.push("desk-chess-square--actionable");
          }

          const label = piece
            ? `${square}, ${COLOR_NAMES[piece.color]} ${PIECE_NAMES[piece.type]}`
            : `${square}, empty`;

          return (
            <button
              key={square}
              type="button"
              className={classNames.join(" ")}
              onClick={() => handleSquareClick(square)}
              disabled={!interactive}
              aria-label={isTarget ? `${label}, legal move` : label}
              aria-pressed={isSelected}
            >
              {piece ? (
                <span className="desk-chess-piece" aria-hidden="true">
                  <PieceGlyph type={piece.type} color={piece.color} />
                </span>
              ) : null}
              {isTarget ? (
                <span
                  className={
                    isCapture
                      ? "desk-chess-dot desk-chess-dot--capture"
                      : "desk-chess-dot"
                  }
                  aria-hidden="true"
                />
              ) : null}
              {col === 0 ? (
                <span
                  className="desk-chess-coord desk-chess-coord--rank"
                  aria-hidden="true"
                >
                  {square[1]}
                </span>
              ) : null}
              {row === 7 ? (
                <span
                  className="desk-chess-coord desk-chess-coord--file"
                  aria-hidden="true"
                >
                  {square[0]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {pendingPromotion && selectable ? (
        <div
          className="desk-chess-promo"
          role="dialog"
          aria-label="Choose a piece to promote to"
        >
          <p className="desk-chess-promo-label">Promote to</p>
          <div className="desk-chess-promo-options">
            {PROMOTION_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                className="desk-chess-promo-button"
                onClick={() => confirmPromotion(choice)}
                aria-label={`Promote to ${PIECE_NAMES[choice]}`}
              >
                <PieceGlyph type={choice} color={selectable} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="desk-chess-promo-cancel"
            onClick={() => setPendingPromotion(null)}
          >
            never mind
          </button>
        </div>
      ) : null}
    </div>
  );
}
