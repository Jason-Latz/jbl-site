"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSiteTheme } from "@/components/desk/useSiteTheme";
import { buildTravelRenderUrlForDisplayWidth } from "@/lib/travel-image";
import type { GlobePhoto, GlobePlace } from "@/lib/travelGlobe";

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

function confidenceLabel(place: GlobePlace): string | null {
  if (!place.hasPhotos) return null;
  const source = place.photos[0]?.source;
  if (source === "exif") return "Located from photo GPS";
  if (source === "manual") return "Location set by hand";
  if (place.confidence != null) {
    return `Estimated location · ${Math.round(place.confidence * 100)}% avg confidence`;
  }
  return "Estimated location";
}

// Full-bleed lightbox for a single photo, styled like the mosaic's modal.
function PhotoLightbox({
  photo,
  place,
  onClose
}: {
  photo: GlobePhoto;
  place: GlobePlace;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Real modal behaviour, matching the mosaic's lightbox in PhotoMosaic.tsx:
  // Escape closes, the page behind stops scrolling, focus moves in and is
  // trapped, and it goes back where it came from on close. Without this the
  // backdrop was a picture rather than a modal — the page scrolled underneath
  // it, and keyboard focus stayed on the thumbnail behind the overlay, so
  // tabbing wandered through a gallery nobody could see.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const returnFocusTo =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() =>
      closeButtonRef.current?.focus()
    );
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      returnFocusTo?.focus();
    };
  }, [onClose]);

  const pct =
    photo.confidence != null ? `${Math.round(photo.confidence * 100)}%` : null;

  return (
    <div className="photo-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="card photo-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Photo from ${place.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="secondary photo-modal-close"
          onClick={onClose}
        >
          Close
        </button>
        <img
          src={buildTravelRenderUrlForDisplayWidth(photo.url, 1400)}
          alt={photo.alt}
          className="photo-modal-image"
        />
        <div className="photo-modal-meta">
          <p>
            <strong>Place:</strong> {place.name}
            {place.region ? `, ${place.region}` : ""}
          </p>
          <p>
            <strong>How it was placed:</strong>{" "}
            {photo.source === "exif"
              ? "From the photo’s GPS metadata."
              : photo.source === "manual"
                ? "Set by hand."
                : `Estimated from the image by an open-source vision model${pct ? ` (${pct} confidence)` : ""}.`}
          </p>
          {photo.description ? (
            <p>
              <strong>Description:</strong> {photo.description}
            </p>
          ) : null}
          {photo.songUrl ? (
            <p>
              <strong>Song:</strong>{" "}
              <a href={photo.songUrl} target="_blank" rel="noreferrer">
                {photo.songTitle ?? "Open on Spotify"}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// The selected-place panel — an HTML overlay (never in-canvas). For a place with
// photos it becomes a gallery; clicking a thumbnail opens the lightbox. For a
// context place it shows the place note.
function PlacePanel({
  place,
  onOpenPhoto,
  onClose
}: {
  place: GlobePlace;
  onOpenPhoto: (photo: GlobePhoto) => void;
  onClose: () => void;
}) {
  const badge = confidenceLabel(place);
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

      {place.hasPhotos ? (
        <>
          {badge ? <p className="travel-place-panel-badge">{badge}</p> : null}
          <div className="travel-place-gallery">
            {place.photos.map((photo) => (
              <button
                key={photo.path}
                type="button"
                className="travel-place-thumb"
                onClick={() => onOpenPhoto(photo)}
                aria-label={`Open ${photo.alt}`}
              >
                <img
                  src={buildTravelRenderUrlForDisplayWidth(photo.url, 180)}
                  alt={photo.alt}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="travel-place-panel-empty">No photos placed here yet.</p>
      )}
    </aside>
  );
}

// The capability-gating wrapper. Owns selection + lightbox state, renders the
// live globe when able and the designed list fallback otherwise. `children` is
// the server-rendered place list passed down so it exists in the no-JS HTML.
export default function TravelGlobeStage({
  places,
  children
}: {
  places: GlobePlace[];
  children: React.ReactNode;
}) {
  const [capability, setCapability] = useState<Capability>("pending");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<GlobePhoto | null>(null);
  const { theme } = useSiteTheme();

  const selected = places.find((p) => p.key === selectedKey) ?? null;

  // Select a place and reflect it in the URL (?place=…) so a spot on the globe
  // is shareable and deep-linkable — and survives a refresh.
  const selectPlace = useCallback((key: string | null) => {
    setSelectedKey(key);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (key) url.searchParams.set("place", key);
    else url.searchParams.delete("place");
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    setCapability(detectCapability());
    const initial = new URLSearchParams(window.location.search).get("place");
    if (initial && places.some((p) => p.key === initial)) {
      setSelectedKey(initial);
    }
  }, [places]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivePhoto(null);
        selectPlace(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectPlace]);

  // Before detection resolves, hold the globe's footprint with the loading
  // shimmer rather than painting the full place list and then yanking it out
  // when the globe mounts. No-JS visitors never leave "pending", so a <noscript>
  // still gives them the real list.
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
        <TravelGlobe
          theme={theme}
          places={places}
          selectedKey={selectedKey}
          onSelect={selectPlace}
        />
      </div>
      {selected ? (
        <PlacePanel
          place={selected}
          onOpenPhoto={setActivePhoto}
          onClose={() => selectPlace(null)}
        />
      ) : (
        <p className="travel-globe-hint" aria-hidden="true">
          Drag to spin &middot; tap a pin
        </p>
      )}
      {activePhoto && selected ? (
        <PhotoLightbox
          photo={activePhoto}
          place={selected}
          onClose={() => setActivePhoto(null)}
        />
      ) : null}
      {/* Crawlable list stays in the DOM beneath the globe, visually hidden. */}
      <div className="travel-globe-seo">{children}</div>
    </div>
  );
}
