"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TurntableAudio } from "@/lib/audio/turntable-audio";
import { useChessGame } from "@/lib/useChessGame";
import { useSpotifyLive } from "@/lib/useSpotifyLive";
import { selectLeadTrack } from "@/lib/spotifyLeadTrack";
import { type FocusId } from "./layout";
import type { DeskNote } from "./DeskScene";
import NowPlayingHUD, { type NeedlePhase } from "./NowPlayingHUD";
import Preloader from "./Preloader";
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

// The baked scene is the default homepage; ?baked=0 is the escape hatch to the
// live procedural DeskScene. Safe to default now that the baked assets are
// slimmed (172→31MB) and CDN-hosted on Supabase — the earlier flip went blank
// only because the assets were gitignored and never deployed (now fixed).
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

type Capability = "pending" | "scene" | "fallback";

// Choreography of the needle drop, in ms from the click:
// arm starts swinging immediately; the thunk + crackle land as the needle
// touches down; the music fades in just after.
const NEEDLE_CONTACT_MS = 850;
const PREVIEW_START_MS = 1250;
const ARM_LIFT_MS = 800;

function detectCapability(): Capability {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return "fallback";
    }
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return gl ? "scene" : "fallback";
  } catch {
    return "fallback";
  }
}

// Designed fallback for no-WebGL / reduced-motion: a rendered still of the
// actual desk (the Cycles bake) as the backdrop, same voice, no apology.
function DeskHeroFallback() {
  return (
    <section className="desk-hero-fallback" aria-label="Introduction">
      <div className="desk-hero-fallback-inner">
        <h1 className="desk-hero-fallback-title">
          Out and about, occasionally building things.
        </h1>
        <p className="desk-hero-fallback-copy">
          You&rsquo;re seeing a still of my desk. Live, it&rsquo;s a 3D scene —
          the turntable spins whatever I&rsquo;m listening to, the books are what
          I&rsquo;m reading, the chess game is real and ongoing. Everything on it
          lives in the pages below, too.
        </p>
      </div>
    </section>
  );
}

export default function DeskHero() {
  const [capability, setCapability] = useState<Capability>("pending");
  const [phase, setPhase] = useState<NeedlePhase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusId | null>(null);
  const [coverArtUrls, setCoverArtUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState<DeskNote[]>([]);
  // The shadow bake + shader compiles freeze the first frames; the canvas
  // stays invisible over the shimmer until the scene reports it's drawing,
  // then fades in (and the lamp plays its warm-up as the curtain rises).
  const [sceneReady, setSceneReady] = useState(false);
  const handleSceneReady = useCallback(() => setSceneReady(true), []);
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
  // /?focus=records|work|reading|notes|chess
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

  const audioRef = useRef<TurntableAudio | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    setCapability(detectCapability());
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const schedule = useCallback((fn: () => void, delayMs: number) => {
    timersRef.current.push(window.setTimeout(fn, delayMs));
  }, []);

  // Headline = the live track when present, else a genuinely-recent last play;
  // a stale stored play is dropped (slot shows "Nothing playing right now")
  // rather than masquerading as current. See lib/spotifyLeadTrack.ts.
  const leadTrack = selectLeadTrack(data);
  const trackTitle = leadTrack?.trackName ?? null;
  const artistLine = useMemo(
    () =>
      leadTrack && leadTrack.artists.length > 0
        ? leadTrack.artists.join(", ")
        : null,
    [leadTrack]
  );
  const primaryArtist = leadTrack?.artists?.[0] ?? null;

  // Match the lead track against the iTunes catalog whenever it changes.
  // A playing preview is never interrupted by a match change; the next
  // needle drop simply uses the fresher URL.
  useEffect(() => {
    if (!trackTitle || !primaryArtist) {
      setPreviewUrl(null);
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({
      track: trackTitle,
      artist: primaryArtist
    });

    fetch(`/api/audio/preview?${query.toString()}`, {
      signal: controller.signal
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { previewUrl?: string } | null) => {
        setPreviewUrl(
          typeof payload?.previewUrl === "string" ? payload.previewUrl : null
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPreviewUrl(null);
        }
      });

    return () => controller.abort();
  }, [trackTitle, primaryArtist]);

  const liftNeedle = useCallback(() => {
    const audio = audioRef.current;
    setPhase("stopping");
    audio?.stopPreview();
    schedule(() => audio?.stopCrackle(), 250);
    schedule(() => setPhase("idle"), ARM_LIFT_MS);
  }, [schedule]);

  const dropNeedle = useCallback(async () => {
    if (!previewUrl) {
      return;
    }
    const audio = (audioRef.current ??= new TurntableAudio());
    setPhase("dropping");

    try {
      await audio.ensureContext();
    } catch {
      setPhase("idle");
      return;
    }

    schedule(() => {
      audio.playNeedleDrop();
      audio.startCrackle();
    }, NEEDLE_CONTACT_MS);

    schedule(() => {
      const streamUrl = `/api/audio/stream?u=${encodeURIComponent(previewUrl)}`;
      audio
        .playPreview(streamUrl, { onEnded: liftNeedle })
        .then(() => setPhase("playing"))
        .catch(() => {
          audio.stopCrackle();
          setPhase("stopping");
          schedule(() => setPhase("idle"), ARM_LIFT_MS);
        });
    }, PREVIEW_START_MS);
  }, [previewUrl, liftNeedle, schedule]);

  const handleToggleNeedle = useCallback(() => {
    if (phase === "dropping" || phase === "stopping") {
      return;
    }
    if (phase === "playing") {
      liftNeedle();
      return;
    }
    void dropNeedle();
  }, [phase, liftNeedle, dropNeedle]);

  if (capability === "fallback") {
    // Detection resolves after first paint, so the curtain may already be up
    // (capability was "pending"). Keep it mounted and let it dissolve over the
    // fallback rather than hard-cutting — graceful even for the reduced-motion
    // cohort that lands here.
    return (
      <>
        <Preloader ready />
        <DeskHeroFallback />
      </>
    );
  }

  const armDown = phase === "dropping" || phase === "playing";
  const turntablePlaying = (data?.isPlaying ?? false) || armDown;

  const statusNote = !trackTitle
    ? null
    : previewUrl
      ? data?.isPlaying
        ? "live on Jason's Spotify · 30 s preview"
        : "last played · 30 s preview"
      : "preview unavailable for this track";

  return (
    <section
      className="desk-hero"
      aria-label="Jason's desk — an interactive 3D scene"
    >
      <Preloader ready={sceneReady} />
      {/* The instant poster: rendered server-side (never gated on the
          capability useEffect), theme-correct at first paint via CSS, and left
          sitting under the canvas so the live scene cross-fades in over it. */}
      <div className="desk-hero-poster" aria-hidden="true" />
      {capability === "scene" ? (
        <>
          <div className="desk-hero-loading" aria-hidden="true" />
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: sceneReady ? 1 : 0,
              transition: "opacity 1.15s ease"
            }}
          >
            <DeskScene
              turntablePlaying={turntablePlaying}
              armDown={armDown}
              onNeedleClick={handleNeedleFocus}
              focus={focus}
              onFocus={setFocus}
              labelArtUrl={leadTrack?.albumImageUrl ?? null}
              coverArtUrls={coverArtUrls}
              chessFen={chessGame?.fen ?? null}
              chessLastMove={chessLastMove}
              notes={stableNotes}
              onReady={handleSceneReady}
            />
          </div>
        </>
      ) : (
        <div className="desk-hero-loading" aria-hidden="true" />
      )}
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
              canPlay={Boolean(previewUrl)}
              onToggleNeedle={handleToggleNeedle}
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
      {capability === "scene" ? (
        <NowPlayingHUD
          trackTitle={trackTitle}
          artistLine={artistLine}
          isLive={data?.isPlaying ?? false}
          phase={phase}
          canPlay={Boolean(previewUrl)}
          onToggleNeedle={handleToggleNeedle}
          statusNote={statusNote}
        />
      ) : null}
    </section>
  );
}
