"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TurntableAudio } from "@/lib/audio/turntable-audio";
import { useSpotifyLive } from "@/lib/useSpotifyLive";
import { type FocusId } from "./layout";
import NowPlayingHUD, { type NeedlePhase } from "./NowPlayingHUD";
import DeskPanel from "./panels/DeskPanel";
import NotesPanel from "./panels/NotesPanel";
import ReadingPanel from "./panels/ReadingPanel";
import RecordsPanel from "./panels/RecordsPanel";
import WorkPanel from "./panels/WorkPanel";

const PANEL_META: Record<FocusId, { eyebrow: string; title: string }> = {
  records: { eyebrow: "listening", title: "On the platter" },
  work: { eyebrow: "working", title: "What I'm building" },
  reading: { eyebrow: "reading", title: "The bookshelf" },
  notes: { eyebrow: "guestbook", title: "Leave a note" }
};

const DeskScene = dynamic(() => import("./DeskScene"), {
  ssr: false,
  loading: () => <div className="desk-hero-loading" aria-hidden="true" />
});

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

// Designed fallback for no-WebGL / reduced-motion: same voice, no apology.
// Stage 4 swaps the background for a rendered still of the actual scene.
function DeskHeroFallback() {
  return (
    <section className="desk-hero-fallback" aria-label="Introduction">
      <div className="desk-hero-fallback-inner">
        <h1 className="desk-hero-fallback-title">
          Out and about, occasionally building things.
        </h1>
        <p className="desk-hero-fallback-copy">
          This page is normally a 3D desk — turntable spinning whatever I'm
          listening to, books I'm reading, an open chess game. Everything on it
          lives in the pages below too.
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
  const { data } = useSpotifyLive();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocus(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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

  const leadTrack = data?.nowPlaying ?? data?.recentTracks?.[0] ?? null;
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
    return <DeskHeroFallback />;
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
      {capability === "scene" ? (
        <DeskScene
          turntablePlaying={turntablePlaying}
          armDown={armDown}
          onNeedleClick={() => setFocus("records")}
          focus={focus}
          onFocus={setFocus}
        />
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
