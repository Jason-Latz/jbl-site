"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NeedlePhase } from "@/components/desk/NowPlayingHUD";
import { TurntableAudio } from "./audio/turntable-audio";
import type { LeadTrackLike } from "./spotifyLeadTrack";

type Match = { key: string; url: string | null; error?: boolean };

export function useRecordPreview(track: LeadTrackLike | null) {
  const [phase, setPhase] = useState<NeedlePhase>("idle");
  const [match, setMatch] = useState<Match | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [playingTrack, setPlayingTrack] = useState<LeadTrackLike | null>(null);
  const audioRef = useRef<TurntableAudio | null>(null);
  const liftTimer = useRef<ReturnType<typeof setTimeout>>();
  const phaseRef = useRef<NeedlePhase>("idle");
  const title = track?.trackName;
  const artistList = track?.artists.join("\u001f");
  const key = title && artistList ? JSON.stringify([title, artistList]) : null;
  const current = match?.key === key ? match : null;

  useEffect(() => {
    if (!title || !artistList || !key) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ track: title });
    for (const artist of artistList.split("\u001f")) query.append("artist", artist);
    fetch(`/api/audio/preview?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return { key, url: null, error: response.status !== 404 };
        const payload: { previewUrl?: string; confidence?: string } = await response.json();
        return { key, url: payload.confidence === "high" ? payload.previewUrl ?? null : null };
      })
      .then((next) => {
        if (!controller.signal.aborted) setMatch(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMatch({ key, url: null, error: true });
      });
    return () => controller.abort();
  }, [key, title, artistList, attempt]);

  useEffect(() => () => {
    clearTimeout(liftTimer.current);
    audioRef.current?.dispose();
    audioRef.current = null;
  }, []);

  const changePhase = useCallback((next: NeedlePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const lift = useCallback(() => {
    const audio = audioRef.current;
    audio?.stopPreview();
    audio?.stopCrackle();
    changePhase("stopping");
    liftTimer.current = setTimeout(() => {
      setPlayingTrack(null);
      changePhase("idle");
    }, 800);
  }, [changePhase]);

  const toggle = useCallback(() => {
    if (phaseRef.current === "playing") {
      lift();
      return;
    }
    if (phaseRef.current !== "idle" || !current?.url || !track) return;
    const audio = (audioRef.current ??= new TurntableAudio());
    setFailedKey(null);
    setPlayingTrack(track);
    changePhase("dropping");
    // Call media.play during the click so Safari can authorize playback.
    const start = audio.playPreview(`/api/audio/stream?u=${encodeURIComponent(current.url)}`, { onEnded: lift });
    audio.playNeedleDrop();
    start.then(() => {
      if (audioRef.current !== audio) return;
      audio.startCrackle();
      changePhase("playing");
    }).catch(() => {
      if (audioRef.current !== audio) return;
      setFailedKey(key);
      lift();
    });
  }, [changePhase, current?.url, key, lift, track]);

  return {
    phase,
    toggle,
    playingTrack,
    canPlay: Boolean(current?.url),
    retry: current?.error ? () => { setMatch(null); setAttempt((count) => count + 1); } : undefined,
    status: key === null ? null : current === null ? "Finding a preview…" :
      failedKey === key || current.error ? "The preview couldn’t play. Try again or open the track in Spotify." :
      current.url ? null : "No matching preview. Open the track in Spotify or choose another recent track."
  };
}
