// Scene coordinate conventions (see CLAUDE.md):
// units are meters, the desk TOP SURFACE is y=0, and every object models
// itself centered at its own origin with its base resting on y=0.
// All placement happens here so composition is tunable in one file.

export const DESK = {
  width: 1.9,
  depth: 0.85,
  thickness: 0.045,
  height: 0.75
} as const;

export const FLOOR_Y = -DESK.height;

type Placement = {
  position: [number, number, number];
  rotationY: number;
};

export const PLACEMENT: Record<string, Placement> = {
  turntable: { position: [-0.52, 0, 0.03], rotationY: 0.14 },
  // Lamp yaw is load-bearing: the Forså's spotlight target sits at local
  // [0.5, 0, 0.12], and -0.6 rotates that beam onto the turntable.
  lamp: { position: [-0.82, 0, -0.3], rotationY: -0.6 },
  // Yaw ~pi-0.25: the keyboard/screen face the camera so the opened lid
  // presents the display; closed, the sticker lid faces straight up.
  macbook: { position: [0.26, 0, -0.1], rotationY: 2.89 },
  bookshelf: { position: [0.71, 0, -0.29], rotationY: -0.05 },
  chessboard: { position: [0.6, 0, 0.21], rotationY: 0.32 },
  notepad: { position: [0.02, 0, 0.25], rotationY: -0.08 },
  crate: { position: [-1.08, FLOOR_Y, 0.16], rotationY: 0.5 },
  // The travel/photography vignette lives front-left, between the
  // turntable's plinth and the notepad: prints fanned toward the camera,
  // the rangefinder resting beside them at a counter angle.
  photos: { position: [-0.31, 0, 0.3], rotationY: 0.2 },
  filmCamera: { position: [-0.16, 0, 0.34], rotationY: -0.55 }
};

// Rest pose sits ~45 degrees above the desk per Jason's art direction —
// the desk surface is the canvas, the wall barely shows.
export const CAMERA = {
  fov: 40,
  rest: [0.03, 1.1, 1.05] as [number, number, number],
  start: [0.45, 1.7, 2.0] as [number, number, number],
  target: [0, 0.05, -0.04] as [number, number, number]
};

// Stage 2 focus views: clicking an object dollies the camera to a fixed,
// art-directed close-up while its panel slides in. Fixed views are the whole
// philosophy — each one is hand-framed.
export type FocusId = "records" | "work" | "reading" | "notes" | "chess";

export const FOCUS_VIEWS: Record<
  FocusId,
  { position: [number, number, number]; target: [number, number, number] }
> = {
  records: { position: [-0.5, 0.62, 0.72], target: [-0.52, 0.04, 0.02] },
  work: { position: [0.16, 0.32, 0.46], target: [0.28, 0.13, -0.08] },
  reading: { position: [0.66, 0.5, 0.45], target: [0.71, 0.24, -0.29] },
  notes: { position: [0.04, 0.55, 0.52], target: [0.02, 0.01, 0.25] },
  // Elevated three-quarter view from the front-left so the whole board
  // reads plus the graveyard flanks (captured pieces park ±0.218m from
  // board center in local x — keep them in frame).
  chess: { position: [0.42, 0.52, 0.58], target: [0.6, 0.02, 0.21] }
};
