"use client";

import { useEffect, useRef, useState } from "react";
import { buildPublicRenderUrl } from "@/lib/photos";
import type { PhotoCatalogItem } from "@/lib/photos";

type PhotoMosaicProps = {
  photos: PhotoCatalogItem[];
};

const INITIAL_BATCH_SIZE = 8;
const BATCH_SIZE = 8;
const PRIORITY_IMAGE_COUNT = 4;
const LOAD_MORE_ROOT_MARGIN = "1200px 0px";
const MOSAIC_RENDER_WIDTH = 1600;
const MOSAIC_RENDER_QUALITY = 92;

function displayOrFallback(value: string | null, fallback: string) {
  return value && value.trim().length > 0 ? value : fallback;
}

export default function PhotoMosaic({ photos }: PhotoMosaicProps) {
  const [activePhoto, setActivePhoto] = useState<PhotoCatalogItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(INITIAL_BATCH_SIZE, photos.length)
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(Math.min(INITIAL_BATCH_SIZE, photos.length));
  }, [photos.length]);

  const visiblePhotos = photos.slice(0, visibleCount);
  const hasMoreToLoad = visibleCount < photos.length;

  const getMosaicTileUrl = (photo: PhotoCatalogItem) =>
    buildPublicRenderUrl(photo.url, {
      width: MOSAIC_RENDER_WIDTH,
      quality: MOSAIC_RENDER_QUALITY
    });

  useEffect(() => {
    if (!activePhoto) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivePhoto(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activePhoto]);

  useEffect(() => {
    if (!hasMoreToLoad || !loadMoreRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) {
          return;
        }

        setVisibleCount((current) => Math.min(current + BATCH_SIZE, photos.length));
      },
      {
        root: null,
        rootMargin: LOAD_MORE_ROOT_MARGIN
      }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreToLoad, photos.length]);

  return (
    <>
      <div className="photo-stage section">
        <div className="photo-masonry">
          {visiblePhotos.map((photo, index) => {
            const eager = index < PRIORITY_IMAGE_COUNT;

            return (
              <button
                key={photo.path}
                type="button"
                className="photo-tile"
                onClick={() => setActivePhoto(photo)}
                aria-label={`Open details for ${photo.alt}`}
              >
                <img
                  src={getMosaicTileUrl(photo)}
                  alt={photo.alt}
                  loading={eager ? "eager" : "lazy"}
                  fetchPriority={eager ? "high" : "auto"}
                  decoding="async"
                />
              </button>
            );
          })}

          {hasMoreToLoad ? <div ref={loadMoreRef} className="photo-load-sentinel" /> : null}
        </div>
      </div>

      {activePhoto && (
        <div
          className="photo-modal-backdrop"
          role="presentation"
          onClick={() => setActivePhoto(null)}
        >
          <div
            className="card photo-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Photo details"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="secondary photo-modal-close"
              onClick={() => setActivePhoto(null)}
            >
              Close
            </button>

            <img src={activePhoto.url} alt={activePhoto.alt} className="photo-modal-image" />

            <div className="photo-modal-meta">
              <p>
                <strong>Location:</strong>{" "}
                {displayOrFallback(activePhoto.location, "Not added yet")}
              </p>
              <p>
                <strong>Description:</strong>{" "}
                {displayOrFallback(activePhoto.description, "Not added yet")}
              </p>
              <p>
                <strong>Song:</strong>{" "}
                {activePhoto.songUrl ? (
                  <a href={activePhoto.songUrl} target="_blank" rel="noreferrer">
                    {displayOrFallback(activePhoto.songTitle, "Open on Spotify")}
                  </a>
                ) : (
                  "Not added yet"
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
