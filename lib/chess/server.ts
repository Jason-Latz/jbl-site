import { createHash } from "node:crypto";
import { Chess } from "chess.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side helpers for the world-vs-Jason chess game (The Desk, Stage 3).
 * One persistent game lives in public.chess_games; every route goes through
 * the service role (no public RLS policies) and these helpers keep the
 * public shape, turn derivation, and chess.js legality in one place.
 */

export const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const GAME_COLUMNS =
  "id, status, fen, ply, moves, world_color, result, last_move_at, created_at, updated_at";

export type ChessSide = "world" | "jason";

/** A moves[] entry as stored in the jsonb column. ip_hash never leaves the server. */
export type StoredMove = {
  san: string;
  uci: string;
  fen: string;
  by: ChessSide;
  at: string;
  ip_hash?: string;
};

export type GameRow = {
  id: string;
  status: "active" | "finished";
  fen: string;
  ply: number;
  moves: StoredMove[];
  world_color: "w" | "b";
  result: ChessSide | "draw" | null;
  last_move_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicChessMove = { san: string; by: ChessSide; at: string };

export type PublicChessGame = {
  id: string;
  status: "active" | "finished";
  fen: string;
  ply: number;
  turn: ChessSide | null;
  worldColor: "w" | "b";
  result: ChessSide | "draw" | null;
  check: boolean;
  moves: PublicChessMove[];
  lastMove: {
    from: string;
    to: string;
    san: string;
    by: ChessSide;
    at: string;
  } | null;
};

let cachedServiceClient: SupabaseClient | null | undefined;

// RLS on chess_games has no public policies; every read/write goes through
// this service-role client (mirrors app/api/desk-notes/route.ts).
export function getChessServiceClient(): SupabaseClient | null {
  if (cachedServiceClient !== undefined) {
    return cachedServiceClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    cachedServiceClient = null;
    return null;
  }

  cachedServiceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return cachedServiceClient;
}

/** Same recipe as desk-notes: sha256(ip + CRON_SECRET salt), never the raw IP. */
export function hashClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const salt = process.env.CRON_SECRET ?? "desk-chess-salt";

  return createHash("sha256").update(`${ip}${salt}`).digest("hex");
}

/** Whose move is it? null once the game is finished. */
export function turnOf(row: GameRow): ChessSide | null {
  if (row.status === "finished") {
    return null;
  }

  const sideToMove = new Chess(row.fen).turn();

  return sideToMove === row.world_color ? "world" : "jason";
}

/**
 * Project a DB row onto the public contract. Strips ip_hash and per-move
 * FENs; derives turn and check from the position itself.
 */
export function toPublicGame(row: GameRow): PublicChessGame {
  const chess = new Chess(row.fen);
  const turn =
    row.status === "finished"
      ? null
      : chess.turn() === row.world_color
        ? "world"
        : "jason";

  const last =
    row.moves.length > 0 ? row.moves[row.moves.length - 1] : null;

  return {
    id: row.id,
    status: row.status,
    fen: row.fen,
    ply: row.ply,
    turn,
    worldColor: row.world_color,
    result: row.result,
    check: chess.inCheck(),
    moves: row.moves.map(({ san, by, at }) => ({ san, by, at })),
    lastMove: last
      ? {
          from: last.uci.slice(0, 2),
          to: last.uci.slice(2, 4),
          san: last.san,
          by: last.by,
          at: last.at
        }
      : null
  };
}

export type MoveInput = { from: string; to: string; promotion?: string };

/** The columns an accepted move updates; spread straight into .update(). */
export type MovePatch = {
  fen: string;
  ply: number;
  moves: StoredMove[];
  last_move_at: string;
  updated_at: string;
  status?: "finished";
  result?: ChessSide | "draw";
};

export type ApplyMoveResult =
  | { ok: true; patch: MovePatch }
  | { ok: false; code: "invalid_position" | "illegal_move" };

/**
 * Validate a move against the row's position and build the update patch.
 * chess.js v1 throws on illegal moves (older versions returned null) — both
 * paths land on the same "illegal_move" code. On checkmate the mover wins;
 * every other game-over (stalemate, repetition, insufficient material,
 * fifty-move) is a draw.
 */
export function applyMoveToRow(
  row: GameRow,
  input: MoveInput,
  by: ChessSide,
  ipHash?: string
): ApplyMoveResult {
  let chess: Chess;

  try {
    chess = new Chess(row.fen);
  } catch {
    return { ok: false, code: "invalid_position" };
  }

  let move: ReturnType<Chess["move"]> | null;

  try {
    move = chess.move({
      from: input.from,
      to: input.to,
      promotion: input.promotion
    });
  } catch {
    move = null;
  }

  if (!move) {
    return { ok: false, code: "illegal_move" };
  }

  const at = new Date().toISOString();
  const fen = chess.fen();
  const entry: StoredMove = {
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    fen,
    by,
    at
  };

  if (ipHash) {
    entry.ip_hash = ipHash;
  }

  const patch: MovePatch = {
    fen,
    ply: row.ply + 1,
    moves: [...row.moves, entry],
    last_move_at: at,
    updated_at: at
  };

  if (chess.isGameOver()) {
    patch.status = "finished";
    patch.result = chess.isCheckmate() ? by : "draw";
  }

  return { ok: true, patch };
}

const SQUARE_PATTERN = /^[a-h][1-8]$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROMOTION_PIECES = ["q", "r", "n", "b"] as const;

export type ParsedMovePayload = {
  gameId: string;
  ply: number;
  from: string;
  to: string;
  promotion?: "q" | "r" | "n" | "b";
};

/**
 * Validate the wire shape of a move request ({ gameId, ply, from, to,
 * promotion? }). Returns null if anything is off; squares are lowercased
 * so "E2" still counts.
 */
export function parseMovePayload(
  payload: Record<string, unknown>
): ParsedMovePayload | null {
  const { gameId, ply, from, to, promotion } = payload;

  if (typeof gameId !== "string" || !UUID_PATTERN.test(gameId)) {
    return null;
  }

  if (typeof ply !== "number" || !Number.isInteger(ply) || ply < 0) {
    return null;
  }

  if (typeof from !== "string" || typeof to !== "string") {
    return null;
  }

  const fromSquare = from.toLowerCase();
  const toSquare = to.toLowerCase();

  if (!SQUARE_PATTERN.test(fromSquare) || !SQUARE_PATTERN.test(toSquare)) {
    return null;
  }

  const parsed: ParsedMovePayload = {
    gameId,
    ply,
    from: fromSquare,
    to: toSquare
  };

  if (promotion !== undefined && promotion !== null) {
    if (typeof promotion !== "string") {
      return null;
    }

    const piece = promotion.toLowerCase();

    if (!(PROMOTION_PIECES as readonly string[]).includes(piece)) {
      return null;
    }

    parsed.promotion = piece as ParsedMovePayload["promotion"];
  }

  return parsed;
}
