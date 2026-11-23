"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecordPreview } from "@/lib/useRecordPreview";
import { useChessGame } from "@/lib/useChessGame";
import { useSpotifyLive } from "@/lib/useSpotifyLive";
import { selectLeadTrack, selectRecordTrack } from "@/lib/spotifyLeadTrack";
import { type FocusId } from "./layout";
import type { DeskNote } from "./DeskScene";
import DragHint from "./DragHint";
import NowPlayingHUD from "./NowPlayingHUD";
import ChessPanel from "./panels/ChessPanel";
import DeskPanel from "./panels/DeskPanel";
import NotesPanel from "./panels/NotesPanel";
import ReadingPanel from "./panels/ReadingPanel";
import RecordsPanel from "./panels/RecordsPanel";
import WorkPanel from "./panels/WorkPanel";

const PANEL_META: Record<FocusId, { eyebrow: string; title: string }> = {
  records: { eyebrow: "listening", title: "On the platter" },
  work: { eyebrow: "working", title: "What I'm building" },
  reading: { eyebrow: "reading", title: "The bookshelf" },
  notes: { eyebrow: "guestbook", title: "Leave a note" },
  chess: { eyebrow: "playing", title: "The world vs. Jason" }
};

// The baked scene lives at /desk; ?baked=0 is the escape hatch to the
// live procedural DeskScene. The static-only model is committed in public/;
// immutable lightmaps remain on Supabase. See lib/desk-assets.ts.
const DeskScene = dynamic(
  () =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("baked") === "0"
      ? import("./DeskScene")
      : import("./BakedDeskScene"),
  {
    ssr: false,
    loading: () => <div className="desk-hero-loading" aria-hidden="true" />
  }
);

export default function DeskInteractive({ onReady }: { onReady: () => void }) {
  const [focus, setFocus] = useState<FocusId | null>(null);
  const [coverArtUrls, setCoverArtUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState<DeskNote[]>([]);
  // Keep the poster visible while the scene prepares its assets and shaders,
  // then crossfade after the first prepared frames have drawn.
  const [sceneReady, setSceneReady] = useState(false);
  const handleSceneReady = useCallback(() => {
    setSceneReady(true);
    onReady();
  }, [onReady]);
  const { data } = useSpotifyLive();
  // One chess poller for both consumers: the 3D board (fen/lastMove) and
  // ChessPanel (which takes the whole result as a prop — a second hook
  // instance used to cold-fetch state the app already held).
  const chess = useChessGame();
  const chessGame = chess.game;
  // Identity-stable props for the memoized scene objects: a fresh object
  // literal or closure here would defeat React.memo on every render.
  const chessLastMove = useMemo(
    () =>
      chessGame?.lastMove
        ? { from: chessGame.lastMove.from, to: chessGame.lastMove.to }
        : null,
    [chessGame?.lastMove?.from, chessGame?.lastMove?.to]
  );
  const handleNeedleFocus = useCallback(() => setFocus("records"), []);

  // Heavy-rotation art for the crate sleeves, fetched once.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/spotify/albums", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { albums?: { imageUrl?: string }[] } | null) => {
        const urls = (payload?.albums ?? [])
          .map((album) => album.imageUrl)
          .filter((url): url is string => typeof url === "string");
        if (urls.length > 0) {
          setCoverArtUrls(urls);
        }
      })
      .catch(() => {
        // Procedural sleeves stay in place.
      });
    return () => controller.abort();
  }, []);

  // Approved guestbook notes for the pad, fetched once. Only the public fields
  // (body + display name) are kept; createdAt/ip_hash are dropped here and
  // never reach the canvas.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/desk-notes", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (payload: { notes?: { id: string; body: string; author: unknown }[] } | null) => {
          if (!Array.isArray(payload?.notes)) {
            return;
          }
          setNotes(
            payload.notes
              .filter((n) => typeof n.body === "string" && n.body.trim())
              .map((n) => ({
                id: n.id,
                body: n.body,
                author: typeof n.author === "string" ? n.author : null
              }))
          );
        }
      )
      .catch(() => {
        // The pad keeps its empty-state prompt.
      });
    return () => controller.abort();
  }, []);

  // Identity-stable subset: `notes` only changes identity on the single
  // successful fetch, so slicing here stays stable across Spotify/chess polls
  // and never hands the memoized Notepad a fresh array.
  const stableNotes = useMemo(() => notes.slice(0, 2), [notes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocus(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Deep link straight into a focus view:
  // /desk?focus=records|work|reading|notes|chess
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("focus");
    if (
      requested === "records" ||
      requested === "work" ||
      requested === "reading" ||
      requested === "notes" ||
      requested === "chess"
    ) {
      setFocus(requested);
    }
  }, []);

  const [pickedTrack, setPickedTrack] = useState<ReturnType<typeof selectRecordTrack>>(null);
  const liveLead = selectLeadTrack(data);
  const recordTrack = pickedTrack ?? selectRecordTrack(data);
  const preview = useRecordPreview(recordTrack);
  const { phase } = preview;
  const panelTrack = preview.playingTrack ?? recordTrack;
  const hudTrack = preview.playingTrack ?? liveLead;
  const armDown = phase === "dropping" || phase === "playing";
  const turntablePlaying = (data?.isPlaying ?? false) || armDown;

  return (
    <>
      <div
        className="desk-hero-canvas"
        style={{
          position: "absolute",
          inset: 0,
          opacity: sceneReady ? 1 : 0,
          transition: "opacity 0.35s ease",
          // An opacity-0 element still hit-tests: without this, invisible
          // desk objects were clickable through the poster mid-load (a blind
          // tap could silently toggle the theme via the unseen lamp).
          pointerEvents: sceneReady ? "auto" : "none"
        }}
      >
        <DeskScene
          turntablePlaying={turntablePlaying}
          armDown={armDown}
          onNeedleClick={handleNeedleFocus}
          focus={focus}
          onFocus={setFocus}
          labelArtUrl={(preview.playingTrack ?? liveLead)?.albumImageUrl ?? null}
          coverArtUrls={coverArtUrls}
          chessFen={chessGame?.fen ?? null}
          chessLastMove={chessLastMove}
          notes={stableNotes}
          onReady={handleSceneReady}
          sceneReady={sceneReady}
        />
      </div>
      {focus ? (
        <DeskPanel
          eyebrow={PANEL_META[focus].eyebrow}
          title={PANEL_META[focus].title}
          onClose={() => setFocus(null)}
        >
          {focus === "records" ? (
            <RecordsPanel
              spotify={data}
              phase={phase}
              track={panelTrack}
              canPlay={preview.canPlay}
              previewStatus={preview.status}
              onRetryPreview={preview.retry}
              onSelectTrack={setPickedTrack}
              onToggleNeedle={preview.toggle}
            />
          ) : focus === "work" ? (
            <WorkPanel />
          ) : focus === "reading" ? (
            <ReadingPanel />
          ) : focus === "chess" ? (
            <ChessPanel chess={chess} />
          ) : (
            <NotesPanel />
          )}
        </DeskPanel>
      ) : null}
      {sceneReady ? (
        <NowPlayingHUD
          trackTitle={hudTrack?.trackName ?? null}
          artistLine={hudTrack?.artists.join(", ") ?? null}
          isLive={Boolean(data?.isPlaying && !preview.playingTrack)}
          phase={phase}
          canPlay={Boolean(hudTrack && preview.canPlay)}
          onToggleNeedle={hudTrack && (hudTrack === panelTrack || armDown) ? preview.toggle : handleNeedleFocus}
          statusNote={hudTrack ? preview.status : null}
        />
      ) : null}
      {/* Touch-only, first-visit nudge that the scene can be dragged. Self-gates
          on coarse pointer + localStorage; sits above the HUD. */}
      <DragHint ready={sceneReady} />
    </>
  );
}
