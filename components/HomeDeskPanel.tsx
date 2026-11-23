"use client";

import { useState } from "react";
import { useChessGame } from "@/lib/useChessGame";
import { useSpotifyLive } from "@/lib/useSpotifyLive";
import { useRecordPreview } from "@/lib/useRecordPreview";
import { selectRecordTrack, type LeadTrackLike } from "@/lib/spotifyLeadTrack";
import ChessPanel from "./desk/panels/ChessPanel";
import RecordsPanel from "./desk/panels/RecordsPanel";

function Records() {
  const { data, hasError } = useSpotifyLive();
  const [choice, setChoice] = useState<LeadTrackLike | null>(null);
  const track = choice ?? selectRecordTrack(data);
  const preview = useRecordPreview(track);
  return (
    <>
      {hasError ? <p className="desk-panel-meta" role="status">Spotify is temporarily unavailable. Retrying…</p> : null}
      <RecordsPanel spotify={data} track={preview.playingTrack ?? track} phase={preview.phase}
        canPlay={preview.canPlay} previewStatus={preview.status} onRetryPreview={preview.retry}
        onSelectTrack={setChoice} onToggleNeedle={preview.toggle} />
    </>
  );
}

function Chess() {
  const chess = useChessGame();
  return <ChessPanel chess={chess} />;
}

export default function HomeDeskPanel({ panel, image, title }: { panel: string; image: string | null; title: string }) {
  if (panel === "records") return <Records />;
  if (panel === "chess") return <Chess />;
  return (
    <figure className="landing-photo">
      {image ? <a href={image} target="_blank" rel="noreferrer"><img src={image} alt={title} /></a> : null}
      <figcaption><a href="/photography">Browse photography →</a></figcaption>
    </figure>
  );
}
