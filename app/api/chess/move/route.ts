import { NextResponse } from "next/server";
import {
  GAME_COLUMNS,
  applyMoveToRow,
  getChessServiceClient,
  hashClientIp,
  parseMovePayload,
  toPublicGame,
  turnOf,
  type GameRow
} from "@/lib/chess/server";

export const dynamic = "force-dynamic";

/** Same hand can't play two world moves back-to-back faster than this. */
const SAME_HAND_COOLDOWN_MS = 60 * 1000;

/**
 * POST /api/chess/move — a visitor plays the world's move.
 * Body: { gameId, ply, from, to, promotion? }. The ply is an optimistic
 * concurrency token: the update only lands if nobody moved in between.
 */
export async function POST(request: Request) {
  const supabase = getChessServiceClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "The chessboard isn't set up yet." },
      { status: 503 }
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Send your move as JSON." },
      { status: 400 }
    );
  }

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json(
      { error: "Send your move as JSON." },
      { status: 400 }
    );
  }

  const move = parseMovePayload(payload as Record<string, unknown>);

  if (!move) {
    return NextResponse.json(
      { error: "That move didn't parse — squares look like \"e2\"." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("chess_games")
    .select(GAME_COLUMNS)
    .eq("id", move.gameId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Couldn't read the board. Try again in a moment." },
      { status: 502 }
    );
  }

  const row = data as GameRow | null;

  if (!row) {
    return NextResponse.json(
      { error: "That game isn't on this desk." },
      { status: 404 }
    );
  }

  if (row.status !== "active") {
    return NextResponse.json(
      { error: "That game is in the books — a fresh board is coming." },
      { status: 409 }
    );
  }

  if (turnOf(row) !== "world") {
    return NextResponse.json(
      { error: "It's Jason's move — check back soon." },
      { status: 403 }
    );
  }

  if (row.ply !== move.ply) {
    return NextResponse.json(
      { error: "The world beat you to it — fresh board incoming." },
      { status: 409 }
    );
  }

  // Light anti-spam: the hand that played the world's previous move has to
  // sit out for a minute. Stops accidental double-submits without locking
  // out the lone visitor playing a slow game.
  const ipHash = hashClientIp(request);
  const previousWorldMove = [...row.moves]
    .reverse()
    .find((entry) => entry.by === "world");

  if (previousWorldMove?.ip_hash === ipHash) {
    const elapsed = Date.now() - new Date(previousWorldMove.at).getTime();

    if (Number.isFinite(elapsed) && elapsed < SAME_HAND_COOLDOWN_MS) {
      return NextResponse.json(
        { error: "You just moved for the world — give it a minute." },
        { status: 429 }
      );
    }
  }

  const attempt = applyMoveToRow(row, move, "world", ipHash);

  if (!attempt.ok) {
    if (attempt.code === "invalid_position") {
      return NextResponse.json(
        { error: "The board got scrambled — Jason will sort it out." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "That move isn't legal from this position." },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("chess_games")
    .update(attempt.patch)
    .eq("id", move.gameId)
    .eq("ply", move.ply)
    .eq("status", "active")
    .select(GAME_COLUMNS);

  if (updateError) {
    return NextResponse.json(
      { error: "The move didn't stick. Try again." },
      { status: 502 }
    );
  }

  const updatedRow = ((updated ?? []) as GameRow[])[0];

  if (!updatedRow) {
    return NextResponse.json(
      { error: "The world beat you to it — fresh board incoming." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { game: toPublicGame(updatedRow) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
