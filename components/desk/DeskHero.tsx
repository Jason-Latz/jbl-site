"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useState } from "react";
import { preloadBakedDesk } from "@/lib/desk-assets";

const DeskInteractive = dynamic(() => import("./DeskInteractive"), {
  ssr: false,
  loading: () => null
});

type Capability = "pending" | "scene" | "fallback";

function detectCapability(): Capability {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return "fallback";
    }
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "fallback";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return "scene";
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

// This small shell is server-rendered and hydrates independently of the
// desk's panels, data hooks, audio, and Three.js. Give navigation a paint before
// mounting the interactive tree, and download the bake alongside its code.
export default function DeskHero() {
  const [capability, setCapability] = useState<Capability>("pending");
  const [sceneReady, setSceneReady] = useState(false);
  const handleReady = useCallback(() => setSceneReady(true), []);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    let timer = 0;
    let releasePreloads: (() => void) | undefined;

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        // Yield out of the paint callback before loading any scene code.
        timer = window.setTimeout(() => {
          const next = detectCapability();
          if (
            next === "scene" &&
            new URLSearchParams(window.location.search).get("baked") !== "0"
          ) {
            const theme = document.documentElement.dataset.theme;
            releasePreloads = preloadBakedDesk(theme === "dark" ? "dark" : "light");
          }
          startTransition(() => setCapability(next));
        }, 0);
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      window.clearTimeout(timer);
      releasePreloads?.();
    };
  }, []);

  if (capability === "fallback") return <DeskHeroFallback />;

  return (
    <section
      className="desk-hero"
      aria-label="Jason's desk — an interactive 3D scene"
      data-scene-ready={sceneReady}
    >
      <div className="desk-hero-poster" aria-hidden="true" />
      {capability === "scene" ? <DeskInteractive onReady={handleReady} /> : null}
      {!sceneReady ? (
        <p className="desk-hero-whisper" role="status">
          setting the desk
        </p>
      ) : null}
    </section>
  );
}
