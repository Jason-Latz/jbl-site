// Places Jason has been — the data behind the travel globe.
//
// This is a CURATED list, edited by hand like content/books.ts. Each place needs
// a name, latitude, and longitude; everything else is optional. Add a place by
// dropping another object in the array — the globe picks it up automatically,
// drops a coral marker at the coordinates, and threads an arc to it.
//
// Starter set seeded from Jason's bio (school, work, study abroad, home). Coords
// are decimal degrees, N/E positive. Look a city up and paste its lat/lng.

export type Place = {
  /** Short marker label, e.g. "Edinburgh". */
  name: string;
  /** Where it is, for the place card, e.g. "Scotland" or "Illinois, USA". */
  region?: string;
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

export const PLACES: Place[] = [
  {
    name: "Arizona",
    region: "USA",
    lat: 34.05,
    lng: -111.09,
    note: "Home turf — where it all started.",
    home: true
  },
  {
    name: "Evanston",
    region: "Illinois, USA",
    lat: 42.0451,
    lng: -87.6877,
    note: "Northwestern — computer science and psychology.",
    when: "2023–present"
  },
  {
    name: "Austin",
    region: "Texas, USA",
    lat: 30.2672,
    lng: -97.7431,
    note: "Building Vulcan (Y Combinator S25).",
    when: "2025–present"
  },
  {
    name: "Washington, D.C.",
    region: "USA",
    lat: 38.9072,
    lng: -77.0369,
    note: "A summer on Capitol Hill.",
    when: "2022"
  },
  {
    name: "Edinburgh",
    region: "Scotland",
    lat: 55.9533,
    lng: -3.1883,
    note: "Studying abroad and playing collegiate tennis.",
    when: "2025"
  }
];
