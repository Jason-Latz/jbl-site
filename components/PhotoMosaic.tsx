"use client";

import { useEffect, useState } from "react";
import type { PhotoCatalogItem } from "@/lib/photos";

type PhotoMosaicProps = {
  photos: PhotoCatalogItem[];
};

function displayOrFallback(value: string | null, fallback: string) {
  return value && value.trim().length > 0 ? value : fallback;
}

export default function PhotoMosaic({ photos }: PhotoMosaicProps) {
  const [activePhoto, setActivePhoto] = useState<PhotoCatalogItem | null>(null);

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

  return (
    <>
      <div className="photo-stage section">
        <div className="photo-masonry">
          {photos.map((photo) => (
            <button
              key={photo.path}
              type="button"
              className="photo-tile"
              onClick={() => setActivePhoto(photo)}
              aria-label={`Open details for ${photo.alt}`}
            >
              <img src={photo.url} alt={photo.alt} loading="lazy" decoding="async" />
            </button>
          ))}
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
