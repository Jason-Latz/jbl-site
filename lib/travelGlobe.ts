import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { PLACES, findPlace, type Place } from "@/content/places";
import { PHOTO_BUCKET, encodeStoragePath } from "@/lib/photos";

// Server data layer for the travel globe. Reads the photos that the geolocation
// pipeline (scripts/geolocate) has placed — each carries an estimated lat/lng,
// the place it was snapped to, a confidence and the estimation source — and
// groups them under the gazetteer places from content/places.json. Places with
// photos become clickable photo pins; places without stay as context markers so
// the globe still tells the whole travel story.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type GeoSource = "exif" | "geocode" | "ai" | "manual";

export type GlobePhoto = {
  id: string | null;
  path: string;
  url: string;
  alt: string;
  latitude: number;
  longitude: number;
  confidence: number | null;
  source: GeoSource | null;
  location: string | null;
  description: string | null;
  songTitle: string | null;
  songUrl: string | null;
};

export type GlobePlace = Place & {
  /** Stable key for React lists + marker identity. */
  key: string;
  photos: GlobePhoto[];
  photoCount: number;
  /** Mean confidence across this place's estimated photos (0..1), or null. */
  confidence: number | null;
  /** True once at least one photo is anchored here. */
  hasPhotos: boolean;
};

type PhotoRow = {
  id: string | null;
  storage_path: string;
  location: string | null;
  description: string | null;
  song_title: string | null;
  song_url: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_place: string | null;
  geo_region: string | null;
  geo_country: string | null;
  geo_confidence: number | null;
  geo_source: string | null;
};

function altFromPath(path: string): string {
  const base = path.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  // storage paths are prefixed with an upload id + uuid; keep the tail words.
  const words = base.split(/\s+/).filter((w) => !/^[0-9a-f-]{6,}$/i.test(w));
  const alt = words.slice(-6).join(" ").trim();
  return alt.length > 1 ? alt : "Travel photo";
}

function publicUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/storage/v1/object/public/${PHOTO_BUCKET}/${encodeStoragePath(path)}`;
}

export const fetchGlobePlaces = cache(async (): Promise<GlobePlace[]> => {
  // Start from the gazetteer so context markers exist even before any photo is
  // placed there. Keyed by place name (the key the pipeline writes to geo_place).
  const byKey = new Map<string, GlobePlace>();
  for (const place of PLACES) {
    byKey.set(place.name, {
      ...place,
      key: place.name,
      photos: [],
      photoCount: 0,
      confidence: null,
      hasPhotos: false
    });
  }

  if (!supabaseUrl || !supabaseKey) {
    return Array.from(byKey.values());
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data, error } = await supabase
    .from("photos")
    .select(
      "id, storage_path, location, description, song_title, song_url, latitude, longitude, geo_place, geo_region, geo_country, geo_confidence, geo_source"
    )
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error || !data) {
    return Array.from(byKey.values());
  }

  for (const row of data as PhotoRow[]) {
    if (row.latitude == null || row.longitude == null) continue;

    const photo: GlobePhoto = {
      id: row.id,
      path: row.storage_path,
      url: publicUrl(supabaseUrl, row.storage_path),
      alt: altFromPath(row.storage_path),
      latitude: row.latitude,
      longitude: row.longitude,
      confidence: row.geo_confidence,
      source: (row.geo_source as GeoSource | null) ?? null,
      location: row.location,
      description: row.description,
      songTitle: row.song_title,
      songUrl: row.song_url
    };

    // Prefer the snapped gazetteer place; otherwise synthesize a place from the
    // photo's own estimate (e.g. EXIF far from any listed place).
    const gazetteer = findPlace(row.geo_place);
    const key = row.geo_place ?? `@${row.latitude.toFixed(2)},${row.longitude.toFixed(2)}`;

    let place = byKey.get(key);
    if (!place) {
      place = {
        name: row.geo_place ?? row.geo_region ?? "Somewhere",
        region: gazetteer?.region ?? row.geo_region ?? undefined,
        country: gazetteer?.country ?? row.geo_country ?? undefined,
        lat: gazetteer?.lat ?? row.latitude,
        lng: gazetteer?.lng ?? row.longitude,
        note: gazetteer?.note,
        when: gazetteer?.when,
        home: gazetteer?.home,
        key,
        photos: [],
        photoCount: 0,
        confidence: null,
        hasPhotos: false
      };
      byKey.set(key, place);
    }
    place.photos.push(photo);
  }

  // Finalize aggregates + sort each place's photos by confidence (best first).
  for (const place of byKey.values()) {
    place.photoCount = place.photos.length;
    place.hasPhotos = place.photoCount > 0;
    if (place.hasPhotos) {
      const vals = place.photos
        .map((p) => p.confidence)
        .filter((c): c is number => typeof c === "number");
      place.confidence = vals.length
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : null;
      place.photos.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    }
  }

  // Places with photos first (most photos first), then context markers.
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.hasPhotos !== b.hasPhotos) return a.hasPhotos ? -1 : 1;
    return b.photoCount - a.photoCount;
  });
});
