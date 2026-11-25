"use client";

import { useState } from "react";
import { useChessGame } from "@/lib/useChessGame";
import { useSpotifyLive } from "@/lib/useSpotifyLive";
import { useRecordPreview } from "@/lib/useRecordPreview";
import { buildPublicRenderUrl } from "@/lib/photo-url";
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
  const preview = image ? buildPublicRenderUrl(image, { width: 640, quality: 92 }) : null;
  const retina = image ? buildPublicRenderUrl(image, { width: 1280, quality: 92 }) : null;
  return (
    <figure className="landing-photo">
      {image && preview && retina ? (
        <a href={image} target="_blank" rel="noreferrer" aria-label={`Open the full-resolution ${title} photo`}>
          <img
            src={preview}
            srcSet={`${preview} 640w, ${retina} 1280w`}
            sizes="(max-width: 36rem) calc(100vw - 3rem), 33rem"
            alt={title}
            onError={({ currentTarget }) => {
              if (!currentTarget.srcset && currentTarget.src === image) return;
              currentTarget.removeAttribute("srcset");
              currentTarget.src = image;
            }}
          />
        </a>
      ) : null}
      <figcaption><a href="/photography">Browse photography →</a></figcaption>
    </figure>
  );
}
