"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent
} from "react";
import { buildPublicRenderUrl } from "@/lib/photos";
import type { PhotoCatalogItem } from "@/lib/photos";

type PhotoMosaicProps = {
  photos: PhotoCatalogItem[];
};

type LayoutTile = {
  photo: PhotoCatalogItem;
  width: number;
  height: number;
};

type LayoutRow = {
  items: LayoutTile[];
  height: number;
};

type PendingLayoutItem = {
  photo: PhotoCatalogItem;
  ratio: number;
};

const INITIAL_BATCH_SIZE = 8;
const BATCH_SIZE = 8;
const PRIORITY_IMAGE_COUNT = 4;
const LOAD_MORE_ROOT_MARGIN = "1200px 0px";

const MIN_ZOOM_PERCENT = 25;
const MAX_ZOOM_PERCENT = 200;
const DEFAULT_ZOOM_PERCENT = 100;

const LAYOUT_WIDTH_FALLBACK = 1200;
const RATIO_FALLBACK = 4 / 3;
const TILE_GAP = 0;
const MIN_ROW_HEIGHT_PX = 72;
const MAX_ROW_HEIGHT_PX = 520;
const LANDSCAPE_BASE_RATIO = 1.5;

const MOSAIC_RENDER_QUALITY = 92;
const MIN_TILE_RENDER_WIDTH = 320;
const MAX_TILE_RENDER_WIDTH = 2200;
const TILE_RENDER_PIXEL_RATIO = 2;
const TILE_RENDER_WIDTH_STEP = 96;
const DEFAULT_ZOOM_DENSITY_MULTIPLIER = 2;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeZoomPercent(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_ZOOM_PERCENT;
  }

  return clamp(Math.round(value), MIN_ZOOM_PERCENT, MAX_ZOOM_PERCENT);
}

function getLegacyColumnCount(containerWidth: number) {
  if (containerWidth >= 1320) {
    return 4;
  }

  if (containerWidth >= 980) {
    return 3;
  }

  if (containerWidth >= 640) {
    return 2;
  }

  return 1;
}

function getAdaptiveBaseRowHeight(containerWidth: number) {
  const columns = getLegacyColumnCount(containerWidth);
  const legacyColumnWidth = containerWidth / columns;
  const baselineHeight = legacyColumnWidth / LANDSCAPE_BASE_RATIO;
  return clamp(baselineHeight, MIN_ROW_HEIGHT_PX, MAX_ROW_HEIGHT_PX);
}

function displayOrFallback(value: string | null, fallback: string) {
  return value && value.trim().length > 0 ? value : fallback;
}

function getBaseWidthForItem(
  item: PendingLayoutItem,
  targetRowHeight: number
) {
  return item.ratio * targetRowHeight;
}

function getJustifiedScaleFromBase(
  baseWidth: number,
  itemCount: number,
  containerWidth: number,
) {
  if (itemCount === 0) {
    return 1;
  }

  if (baseWidth <= 0) {
    return 1;
  }

  const gapWidth = TILE_GAP * Math.max(0, itemCount - 1);
  const availableWidth = Math.max(0, containerWidth - gapWidth);
  return availableWidth / baseWidth;
}

function normalizeRenderWidth(displayWidth: number) {
  if (!Number.isFinite(displayWidth) || displayWidth <= 0) {
    return MIN_TILE_RENDER_WIDTH;
  }

  const bounded = clamp(
    Math.round(displayWidth * TILE_RENDER_PIXEL_RATIO),
    MIN_TILE_RENDER_WIDTH,
    MAX_TILE_RENDER_WIDTH
  );

  const quantized =
    Math.round(bounded / TILE_RENDER_WIDTH_STEP) * TILE_RENDER_WIDTH_STEP;

  return clamp(quantized, MIN_TILE_RENDER_WIDTH, MAX_TILE_RENDER_WIDTH);
}

function buildJustifiedRows(
  photos: PhotoCatalogItem[],
  ratioByPath: Record<string, number>,
  containerWidth: number,
  targetRowHeight: number
) {
  const rows: LayoutRow[] = [];

  let pending: PendingLayoutItem[] = [];
  let pendingBaseWidth = 0;

  const pushRow = (
    items: PendingLayoutItem[],
    baseWidth: number,
    justify: boolean
  ) => {
    if (items.length === 0) {
      return;
    }

    const scale =
      justify
        ? clamp(
            getJustifiedScaleFromBase(baseWidth, items.length, containerWidth),
            0.72,
            1.36
          )
        : 1;

    const rowHeight = Math.max(56, targetRowHeight * scale);

    rows.push({
      height: rowHeight,
      items: items.map((item) => ({
        photo: item.photo,
        width: Math.max(48, item.ratio * rowHeight),
        height: rowHeight
      }))
    });
  };

  photos.forEach((photo) => {
    const ratio =
      ratioByPath[photo.path] && Number.isFinite(ratioByPath[photo.path])
        ? ratioByPath[photo.path]
        : RATIO_FALLBACK;

    const pendingItem = { photo, ratio };
    const itemBaseWidth = getBaseWidthForItem(pendingItem, targetRowHeight);

    pending.push(pendingItem);
    pendingBaseWidth += itemBaseWidth;

    const projectedWidth =
      pendingBaseWidth +
      TILE_GAP * Math.max(0, pending.length - 1);

    if (projectedWidth >= containerWidth) {
      if (pending.length === 1) {
        pushRow(pending, pendingBaseWidth, true);
        pending = [];
        pendingBaseWidth = 0;
        return;
      }

      const withCurrent = pending;
      const withoutCurrent = pending.slice(0, -1);
      const overflowItem = pending[pending.length - 1];
      const withoutCurrentBaseWidth = pendingBaseWidth - itemBaseWidth;

      const withCurrentScale = getJustifiedScaleFromBase(
        pendingBaseWidth,
        withCurrent.length,
        containerWidth,
      );
      const withoutCurrentScale = getJustifiedScaleFromBase(
        withoutCurrentBaseWidth,
        withoutCurrent.length,
        containerWidth,
      );

      const withCurrentDelta = Math.abs(1 - withCurrentScale);
      const withoutCurrentDelta = Math.abs(1 - withoutCurrentScale);

      if (withoutCurrentDelta < withCurrentDelta) {
        pushRow(withoutCurrent, withoutCurrentBaseWidth, true);
        pending = [overflowItem];
        pendingBaseWidth = itemBaseWidth;
        return;
      }

      pushRow(withCurrent, pendingBaseWidth, true);
      pending = [];
      pendingBaseWidth = 0;
    }
  });

  // Last row should not be stretched edge-to-edge.
  pushRow(pending, pendingBaseWidth, false);

  return rows;
}

export default function PhotoMosaic({ photos }: PhotoMosaicProps) {
  const [activePhoto, setActivePhoto] = useState<PhotoCatalogItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(INITIAL_BATCH_SIZE, photos.length)
  );
  const [zoomPercent, setZoomPercent] = useState(DEFAULT_ZOOM_PERCENT);
  const [containerWidth, setContainerWidth] = useState(0);
  const [ratioByPath, setRatioByPath] = useState<Record<string, number>>({});
  const [transformFallbackByPath, setTransformFallbackByPath] = useState<
    Record<string, true>
  >({});

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(Math.min(INITIAL_BATCH_SIZE, photos.length));
  }, [photos.length]);

  useEffect(() => {
    const element = layoutRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setContainerWidth(element.clientWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => {
        window.removeEventListener("resize", updateWidth);
      };
    }

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const visiblePhotos = photos.slice(0, visibleCount);
  const hasMoreToLoad = visibleCount < photos.length;
  const effectiveWidth = containerWidth > 0 ? containerWidth : LAYOUT_WIDTH_FALLBACK;
  const baseRowHeight = getAdaptiveBaseRowHeight(effectiveWidth);
  const deferredZoomPercent = useDeferredValue(zoomPercent);
  const targetRowHeight =
    baseRowHeight *
    (deferredZoomPercent / 100) *
    DEFAULT_ZOOM_DENSITY_MULTIPLIER;

  const onZoomChange = useCallback((nextValue: number) => {
    const normalized = normalizeZoomPercent(nextValue);
    setZoomPercent((current) =>
      current === normalized ? current : normalized
    );
  }, []);

  const eagerPaths = useMemo(
    () => new Set(visiblePhotos.slice(0, PRIORITY_IMAGE_COUNT).map((photo) => photo.path)),
    [visiblePhotos]
  );

  const rows = useMemo(
    () =>
      buildJustifiedRows(visiblePhotos, ratioByPath, effectiveWidth, targetRowHeight),
    [visiblePhotos, ratioByPath, effectiveWidth, targetRowHeight]
  );

  const tileImageUrl = useCallback(
    (photo: PhotoCatalogItem, displayWidth: number) => {
      if (transformFallbackByPath[photo.path]) {
        return photo.url;
      }

      const requestedWidth = normalizeRenderWidth(displayWidth);
      return buildPublicRenderUrl(photo.url, {
        width: requestedWidth,
        quality: MOSAIC_RENDER_QUALITY
      });
    },
    [transformFallbackByPath]
  );

  const onTileImageLoad = useCallback(
    (path: string, event: SyntheticEvent<HTMLImageElement>) => {
      const image = event.currentTarget;
      if (!image.naturalWidth || !image.naturalHeight) {
        return;
      }

      const nextRatio = image.naturalWidth / image.naturalHeight;
      if (!Number.isFinite(nextRatio) || nextRatio <= 0) {
        return;
      }

      setRatioByPath((current) => {
        const currentRatio = current[path];
        if (
          typeof currentRatio === "number" &&
          Math.abs(currentRatio - nextRatio) < 0.002
        ) {
          return current;
        }

        return {
          ...current,
          [path]: nextRatio
        };
      });
    },
    []
  );

  const onTileImageError = useCallback((path: string) => {
    setTransformFallbackByPath((current) => {
      if (current[path]) {
        return current;
      }

      return {
        ...current,
        [path]: true
      };
    });
  }, []);

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
        <div className="photo-zoom-toolbar" role="group" aria-label="Travel mosaic zoom controls">
          <input
            id="travel-zoom-range"
            className="photo-zoom-slider"
            aria-label="Travel mosaic zoom"
            type="range"
            min={MIN_ZOOM_PERCENT}
            max={MAX_ZOOM_PERCENT}
            step={1}
            value={zoomPercent}
            onInput={(event) => onZoomChange(event.currentTarget.valueAsNumber)}
          />
          <button
            type="button"
            className="secondary"
            onClick={() => setZoomPercent(DEFAULT_ZOOM_PERCENT)}
            disabled={zoomPercent === DEFAULT_ZOOM_PERCENT}
          >
            Reset
          </button>
        </div>

        <div ref={layoutRef} className="photo-justified-shell" aria-label="Travel mosaic viewport">
          <div className="photo-justified-rows">
            {rows.map((row, rowIndex) => (
              <div
                key={`photo-row-${rowIndex}`}
                className="photo-justified-row"
                style={{
                  height: `${row.height}px`
                }}
              >
                {row.items.map((tile) => {
                  const eager = eagerPaths.has(tile.photo.path);

                  return (
                    <button
                      key={tile.photo.path}
                      type="button"
                      className="photo-tile photo-justified-tile"
                      style={{
                        width: `${tile.width}px`,
                        height: `${tile.height}px`
                      }}
                      onClick={() => setActivePhoto(tile.photo)}
                      aria-label={`Open details for ${tile.photo.alt}`}
                    >
                      <img
                        src={tileImageUrl(tile.photo, tile.width)}
                        alt={tile.photo.alt}
                        loading={eager ? "eager" : "lazy"}
                        fetchPriority={eager ? "high" : "auto"}
                        decoding="async"
                        onLoad={(event) => onTileImageLoad(tile.photo.path, event)}
                        onError={() => onTileImageError(tile.photo.path)}
                      />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {hasMoreToLoad ? <div ref={loadMoreRef} className="photo-load-sentinel" /> : null}
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
