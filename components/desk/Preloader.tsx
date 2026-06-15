"use client";

import { useEffect, useRef, useState } from "react";
import { randomSpinnerVerb } from "@/lib/spinnerVerbs";
import ClaudeMark from "./ClaudeMark";

// How long a single verb shows before it crossfades to the next.
const VERB_INTERVAL_MS = 1900;
// Fade-out duration — keep in sync with the .site-preloader transition in CSS.
const EXIT_MS = 760;
// Safety net: never trap a visitor behind the curtain if the scene never
// reports ready (lost GL context, a stalled chunk). Dismiss regardless.
const MAX_WAIT_MS = 9000;

type PreloaderProps = {
  /** Flips true once the desk scene has compiled and drawn its first frames. */
  ready: boolean;
};

// The warm entrance curtain: the Claude mark turning slowly over a cycling
// Claude Code spinner verb, held over the homepage until the desk has finished
// compiling behind it, then lifted. Mounts inside DeskHero's scene path only,
// so the no-WebGL / reduced-motion fallback never sees it.
export default function Preloader({ ready }: PreloaderProps) {
  // The verb is random, so it must be chosen on the client. Render a reserved
  // empty slot on the server / first paint (matching hydration), then fade the
  // first word in and cycle from there.
  const [verb, setVerb] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [hidden, setHidden] = useState(false);
  const leftRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVerb((current) => current ?? randomSpinnerVerb());
    const id = window.setInterval(() => {
      setVerb((current) => randomSpinnerVerb(current));
    }, VERB_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const startLeaving = () => {
      if (leftRef.current) {
        return;
      }
      leftRef.current = true;
      setLeaving(true);
      window.setTimeout(() => setHidden(true), EXIT_MS);
    };

    if (ready) {
      startLeaving();
      return;
    }
    const safety = window.setTimeout(startLeaving, MAX_WAIT_MS);
    return () => window.clearTimeout(safety);
  }, [ready]);

  // The curtain covers the header (nav + theme toggle); while it's up, swallow
  // Tab so keyboard focus can't advance onto controls hidden behind the opaque
  // overlay. Self-contained — no coupling to the surrounding page structure.
  // (Mouse can't reach them: the curtain keeps pointer-events until it leaves.)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    root.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        root.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, []);

  if (hidden) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      className={`site-preloader${leaving ? " is-leaving" : ""}`}
      role="status"
      tabIndex={-1}
    >
      {/* Real content for the status region — a role="status" announces its
          content, not its name, so aria-label alone would stay silent. */}
      <span className="desk-hud-sr">Loading Jason&apos;s desk</span>
      {/* No JS means nothing can ever dismiss the curtain — hide it outright
          and let the (sceneless) page show through. */}
      <noscript>
        <style>{".site-preloader{display:none!important}"}</style>
      </noscript>
      <div className="site-preloader-stage" aria-hidden="true">
        <span className="site-preloader-mark">
          <ClaudeMark className="site-preloader-glyph" />
        </span>
        <p className="site-preloader-line">
          <span key={verb ?? "blank"} className="site-preloader-verb">
            {verb ?? " "}
          </span>
          <span className="site-preloader-dots">
            <i />
            <i />
            <i />
          </span>
        </p>
      </div>
    </div>
  );
}
