import { buildPublicRenderUrl } from "@/lib/photos";

export const TRAVEL_IMAGE_QUALITY = 92;
export const TRAVEL_RENDER_MIN_WIDTH = 320;
export const TRAVEL_RENDER_MAX_WIDTH = 2200;
export const TRAVEL_RENDER_STEP = 96;
export const TRAVEL_RENDER_PIXEL_RATIO = 2;

export const UPLOAD_WARM_WIDTHS = buildWidthRange(
  TRAVEL_RENDER_MIN_WIDTH,
  TRAVEL_RENDER_MAX_WIDTH,
  TRAVEL_RENDER_STEP
);

export const CRON_WARM_WIDTHS = [960, 1248, 1600] as const;

export const TRAVEL_PREFETCH_LIMIT = 12;
export const TRAVEL_CRON_WARM_LIMIT = 24;
export const TRAVEL_PREFETCH_SESSION_KEY = "travel-prefetch-warmup-v1";

const TRAVEL_MIN_ROW_HEIGHT_PX = 72;
const TRAVEL_MAX_ROW_HEIGHT_PX = 520;
const TRAVEL_LANDSCAPE_BASE_RATIO = 1.5;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function buildWidthRange(min: number, max: number, step: number) {
  const values: number[] = [];
  for (let width = min; width <= max; width += step) {
    values.push(width);
  }
  return values;
}

export function getTravelLegacyColumnCount(containerWidth: number) {
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

export function getTravelAdaptiveBaseRowHeight(containerWidth: number) {
  const columns = getTravelLegacyColumnCount(containerWidth);
  const legacyColumnWidth = containerWidth / columns;
  const baselineHeight = legacyColumnWidth / TRAVEL_LANDSCAPE_BASE_RATIO;
  return clamp(
    baselineHeight,
    TRAVEL_MIN_ROW_HEIGHT_PX,
    TRAVEL_MAX_ROW_HEIGHT_PX
  );
}

export function normalizeTravelRenderRequestWidth(requestWidth: number) {
  const bounded = clamp(
    Math.round(requestWidth),
    TRAVEL_RENDER_MIN_WIDTH,
    TRAVEL_RENDER_MAX_WIDTH
  );

  const quantized =
    Math.round(bounded / TRAVEL_RENDER_STEP) * TRAVEL_RENDER_STEP;

  return clamp(
    quantized,
    TRAVEL_RENDER_MIN_WIDTH,
    TRAVEL_RENDER_MAX_WIDTH
  );
}

export function displayWidthToTravelRenderRequestWidth(displayWidth: number) {
  const requestedWidth = Math.round(displayWidth * TRAVEL_RENDER_PIXEL_RATIO);
  return normalizeTravelRenderRequestWidth(requestedWidth);
}

export function buildTravelRenderUrlForDisplayWidth(
  originalUrl: string,
  displayWidth: number
) {
  return buildPublicRenderUrl(originalUrl, {
    width: displayWidthToTravelRenderRequestWidth(displayWidth),
    quality: TRAVEL_IMAGE_QUALITY
  });
}

export function buildTravelRenderUrlForRequestWidth(
  originalUrl: string,
  requestWidth: number
) {
  return buildPublicRenderUrl(originalUrl, {
    width: normalizeTravelRenderRequestWidth(requestWidth),
    quality: TRAVEL_IMAGE_QUALITY
  });
}

export function estimateTravelPrefetchDisplayWidth(viewportWidth: number) {
  const containerWidth = Math.max(TRAVEL_RENDER_MIN_WIDTH, viewportWidth);
  const columns = getTravelLegacyColumnCount(containerWidth);

  if (columns >= 3) {
    return Math.round(containerWidth / 2);
  }

  return containerWidth;
}
