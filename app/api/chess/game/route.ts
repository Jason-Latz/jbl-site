import { NextResponse } from "next/server";
import {
  GAME_COLUMNS,
  getChessServiceClient,
  toPublicGame,
  type GameRow
} from "@/lib/chess/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/chess/game — the one global game, world vs. Jason.
 * Returns the active game; between games (admin reset pending) it falls
 * back to the most recent finished game so the desk still shows the final
 * position instead of an empty board.
 */
export async function GET() {
  const supabase = getChessServiceClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "The chessboard isn't set up yet." },
      { status: 503 }
    );
  }

  const { data: active, error: activeError } = await supabase
    .from("chess_games")
    .select(GAME_COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeError) {
    return NextResponse.json(
      { error: "Couldn't read the board. Try again in a moment." },
      { status: 502 }
    );
  }

  let row = active as GameRow | null;

  if (!row) {
    const { data: finished, error: finishedError } = await supabase
      .from("chess_games")
      .select(GAME_COLUMNS)
      .eq("status", "finished")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (finishedError) {
      return NextResponse.json(
        { error: "Couldn't read the board. Try again in a moment." },
        { status: 502 }
      );
    }

    row = finished as GameRow | null;
  }

  if (!row) {
    return NextResponse.json(
      { error: "No game on the board yet — the pieces are still in the box." },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { game: toPublicGame(row) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
