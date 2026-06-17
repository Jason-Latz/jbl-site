"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { type Place } from "@/content/places";
import { useSiteTheme } from "@/components/desk/useSiteTheme";

// Lazy-load the WebGL globe so the /travel HTML never blocks on three.js. The
// loading shimmer holds the wrapper's footprint until the canvas mounts (mirrors
// DeskHero's dynamic import + designed loading state).
const TravelGlobe = dynamic(() => import("./TravelGlobe"), {
  ssr: false,
  loading: () => <div className="travel-globe-loading" aria-hidden="true" />
});

type Capability = "pending" | "globe" | "fallback";

// No-WebGL OR reduced-motion → the designed list fallback (also the no-JS /
// crawlable content). Same contract as the desk's detectCapability.
function detectCapability(): Capability {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return "fallback";
    }
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return gl ? "globe" : "fallback";
  } catch {
    return "fallback";
  }
}

// The selected-place card — an HTML overlay (never in-canvas) styled like the
// site's .card, with a coral accent. Swaps as you pick markers; closeable.
function PlaceCard({
  place,
  onClose
}: {
  place: Place;
  onClose: () => void;
}) {
  return (
    <aside className="travel-place-panel" aria-label={place.name}>
      <button
        type="button"
        className="travel-place-panel-close"
        onClick={onClose}
        aria-label="Close"
      >
        &times;
      </button>
      <h2 className="travel-place-panel-name">{place.name}</h2>
      {place.region ? (
        <p className="travel-place-panel-region">{place.region}</p>
      ) : null}
      {place.note ? (
        <p className="travel-place-panel-note">{place.note}</p>
      ) : null}
      {place.when ? (
        <p className="travel-place-panel-when">{place.when}</p>
      ) : null}
      <a className="travel-place-panel-link" href="/photography">
        See photos &rarr;
      </a>
    </aside>
  );
}

// The capability-gating wrapper. Owns the selected-place state + card overlay,
// renders the live globe when able and the designed list fallback otherwise.
// `children` is the server-rendered place list passed down from the page so it
// exists in the no-JS HTML.
export default function TravelGlobeStage({
  children
}: {
  children: React.ReactNode;
}) {
  const [capability, setCapability] = useState<Capability>("pending");
  const [selected, setSelected] = useState<Place | null>(null);
  const { theme } = useSiteTheme();

  useEffect(() => {
    setCapability(detectCapability());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Before detection resolves, hold the globe's footprint with the loading
  // shimmer rather than painting the full place list and then yanking it out
  // when the globe mounts (which flashed on every WebGL load). No-JS visitors
  // never leave "pending", so a <noscript> still gives them the real list.
  if (capability === "pending") {
    return (
      <>
        <div className="travel-globe-wrap">
          <div className="travel-globe-loading" aria-hidden="true" />
        </div>
        <noscript>
          <div className="travel-fallback">{children}</div>
        </noscript>
      </>
    );
  }

  // No-WebGL / reduced-motion: the designed list fallback.
  if (capability === "fallback") {
    return <div className="travel-fallback">{children}</div>;
  }

  return (
    <div className="travel-globe-wrap">
      <div className="travel-globe-canvas">
        <TravelGlobe theme={theme} selected={selected} onSelect={setSelected} />
      </div>
      {selected ? (
        <PlaceCard place={selected} onClose={() => setSelected(null)} />
      ) : (
        <p className="travel-globe-hint" aria-hidden="true">
          Drag to spin &middot; tap a marker
        </p>
      )}
      {/* Crawlable list stays in the DOM beneath the globe, visually hidden. */}
      <div className="travel-globe-seo">{children}</div>
    </div>
  );
}
