"use client";

// DOM overlay HUD for the 3D desk hero. Floats over the canvas inside the
// position:relative .desk-hero section, so it uses fixed dark-glass styling
// (readable over both the dark and light renders) rather than theme variables.

export type NeedlePhase = "idle" | "dropping" | "playing" | "stopping";

export type NowPlayingHUDProps = {
  /** e.g. "Pink + White" — null when nothing has played recently. */
  trackTitle: string | null;
  /** e.g. "Frank Ocean" */
  artistLine: string | null;
  /** Spotify says Jason is listening right now. */
  isLive: boolean;
  phase: NeedlePhase;
  /** A preview match exists for the current track. */
  canPlay: boolean;
  onToggleNeedle: () => void;
  /** Small print, e.g. "30 s preview · matched via iTunes". */
  statusNote?: string | null;
};

const NEEDLE_LABELS: Record<NeedlePhase, string> = {
  idle: "Drop the needle",
  dropping: "Lowering…",
  playing: "Lift the needle",
  stopping: "Lifting…"
};

export default function NowPlayingHUD({
  trackTitle,
  artistLine,
  isLive,
  phase,
  canPlay,
  onToggleNeedle,
  statusNote = null
}: NowPlayingHUDProps) {
  const isBusy = phase === "dropping" || phase === "stopping";
  const previewMissing = !canPlay && phase === "idle";

  return (
    <div className="desk-hud">
      <span
        className={isLive ? "desk-hud-dot desk-hud-dot-live" : "desk-hud-dot"}
        aria-hidden="true"
      />
      <div className="desk-hud-track" role="status" aria-live="polite">
        {trackTitle ? (
          <>
            <span className="desk-hud-sr">
              {isLive ? "Now playing: " : "Last played: "}
            </span>
            <span className="desk-hud-title">{trackTitle}</span>
            {artistLine ? (
              <span className="desk-hud-artist">{artistLine}</span>
            ) : null}
          </>
        ) : (
          <span className="desk-hud-empty">Nothing playing right now</span>
        )}
        {statusNote ? <span className="desk-hud-note">{statusNote}</span> : null}
      </div>
      <button
        type="button"
        className="desk-hud-needle"
        onClick={onToggleNeedle}
        disabled={isBusy || previewMissing}
        aria-pressed={phase === "playing"}
        title={
          previewMissing ? "No preview available for this track" : undefined
        }
      >
        {NEEDLE_LABELS[phase]}
      </button>
    </div>
  );
}
