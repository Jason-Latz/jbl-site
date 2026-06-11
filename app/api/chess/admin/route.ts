import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GAME_COLUMNS,
  STARTING_FEN,
  applyMoveToRow,
  getChessServiceClient,
  parseMovePayload,
  toPublicGame,
  turnOf,
  type GameRow
} from "@/lib/chess/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/chess/admin — Jason's side of the board.
 * { action: "move", gameId, ply, from, to, promotion? } plays his reply;
 * { action: "new_game", worldColor? } retires the active game and sets up
 * a fresh one (colors alternate unless told otherwise).
 */
export async function POST(request: Request) {
  // Auth first, via the visitor's own session — the service role only
  // comes out once we know this is Jason.
  const authClient = createRouteHandlerClient({ cookies });
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return notJason();
  }

  const { data: profile, error: profileError } = await authClient
    .from("profiles")
    .select("is_editor")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.is_editor) {
    return notJason();
  }

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
      { error: "Send the action as JSON." },
      { status: 400 }
    );
  }

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json(
      { error: "Send the action as JSON." },
      { status: 400 }
    );
  }

  const body = payload as Record<string, unknown>;

  if (body.action === "move") {
    return handleMove(supabase, body);
  }

  if (body.action === "new_game") {
    return handleNewGame(supabase, body);
  }

  return NextResponse.json(
    { error: "That's not a move in this game — try \"move\" or \"new_game\"." },
    { status: 400 }
  );
}

function notJason() {
  return NextResponse.json(
    { error: "This side of the board belongs to Jason." },
    { status: 401 }
  );
}

async function handleMove(
  supabase: SupabaseClient,
  body: Record<string, unknown>
) {
  const move = parseMovePayload(body);

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
      { error: "That game is already in the books." },
      { status: 409 }
    );
  }

  if (turnOf(row) !== "jason") {
    return NextResponse.json(
      { error: "It's the world's move — let them cook." },
      { status: 409 }
    );
  }

  if (row.ply !== move.ply) {
    return NextResponse.json(
      { error: "The board moved under you — take another look." },
      { status: 409 }
    );
  }

  const attempt = applyMoveToRow(row, move, "jason");

  if (!attempt.ok) {
    if (attempt.code === "invalid_position") {
      return NextResponse.json(
        { error: "The stored position won't load — this board needs a reset." },
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
      { error: "The board moved under you — take another look." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { game: toPublicGame(updatedRow) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

async function handleNewGame(
  supabase: SupabaseClient,
  body: Record<string, unknown>
) {
  const { worldColor } = body;

  if (
    worldColor !== undefined &&
    worldColor !== null &&
    worldColor !== "w" &&
    worldColor !== "b"
  ) {
    return NextResponse.json(
      { error: "worldColor is \"w\" or \"b\" — pick a side." },
      { status: 400 }
    );
  }

  // The latest game (active or finished) decides the default color flip.
  const { data: latest, error: latestError } = await supabase
    .from("chess_games")
    .select(GAME_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    return NextResponse.json(
      { error: "Couldn't read the board. Try again in a moment." },
      { status: 502 }
    );
  }

  const previous = latest as GameRow | null;
  const nextWorldColor =
    worldColor === "w" || worldColor === "b"
      ? worldColor
      : previous
        ? previous.world_color === "w"
          ? "b"
          : "w"
        : "w";

  // Retire whatever is still active. Result stays as-is — null means the
  // game was abandoned rather than played out.
  const { error: finishError } = await supabase
    .from("chess_games")
    .update({ status: "finished", updated_at: new Date().toISOString() })
    .eq("status", "active");

  if (finishError) {
    return NextResponse.json(
      { error: "Couldn't retire the old game. Try again." },
      { status: 502 }
    );
  }

  const { data: created, error: insertError } = await supabase
    .from("chess_games")
    .insert({
      status: "active",
      fen: STARTING_FEN,
      ply: 0,
      moves: [],
      world_color: nextWorldColor,
      result: null,
      last_move_at: null
    })
    .select(GAME_COLUMNS)
    .single();

  if (insertError || !created) {
    return NextResponse.json(
      { error: "The new board didn't set up. Try again." },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { game: toPublicGame(created as GameRow) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
