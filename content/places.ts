// Places Jason has been — the gazetteer behind the travel globe.
//
// The canonical data lives in `content/places.json` so it is a SINGLE SOURCE OF
// TRUTH shared by two consumers:
//   1. this module (typed, imported by the /travel globe), and
//   2. `scripts/geolocate/geolocate.py`, which reads the same JSON as the
//      candidate set for the open-source vision model that estimates where each
//      photo was taken (an estimate always snaps to a place in this list).
//
// Add a place by dropping another object in the JSON — the globe picks it up as
// a context marker, and the geolocation model can start assigning photos to it.
// Each place needs a name, lat, and lng; everything else is optional. Coords are
// decimal degrees, N/E positive.

import placesData from "./places.json";

export type Place = {
  /** Short marker label, e.g. "Edinburgh". */
  name: string;
  /** Where it is, for the place card, e.g. "Scotland" or "Illinois, USA". */
  region?: string;
  /** Country, used to prompt the geolocation model, e.g. "Italy". */
  country?: string;
  /** Decimal latitude, north positive. */
  lat: number;
  /** Decimal longitude, east positive. */
  lng: number;
  /** A sentence for the place card. */
  note?: string;
  /** When, if it reads well, e.g. "2025" or "2025–present". */
  when?: string;
  /** Home anchors render a touch larger/brighter. */
  home?: boolean;
};

export const PLACES: Place[] = placesData as Place[];

/** Look a place up by its exact name (the key the geolocation pipeline writes). */
export function findPlace(name: string | null | undefined): Place | undefined {
  if (!name) return undefined;
  return PLACES.find((place) => place.name === name);
}
