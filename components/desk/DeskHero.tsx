"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const DeskScene = dynamic(() => import("./DeskScene"), {
  ssr: false,
  loading: () => <div className="desk-hero-loading" aria-hidden="true" />
});

type Capability = "pending" | "scene" | "fallback";

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

  useEffect(() => {
    setCapability(detectCapability());
  }, []);

  if (capability === "fallback") {
    return <DeskHeroFallback />;
  }

  return (
    <section
      className="desk-hero"
      aria-label="Jason's desk — an interactive 3D scene"
    >
      {capability === "scene" ? (
        <DeskScene />
      ) : (
        <div className="desk-hero-loading" aria-hidden="true" />
      )}
    </section>
  );
}
