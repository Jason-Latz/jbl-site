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

// Composition v3 (Jason's second voice-note pass): window centered in the
// back wall, lamp BEHIND the turntable on the left, computer dead-center
// facing the sitter, notepad off-left, chess right, books in a row against
// the desk's back rail on the right, travel vignette along the back,
// speakers and floor bookcase retired (clutter).
export const PLACEMENT: Record<string, Placement> = {
  turntable: { position: [-0.58, 0, 0.06], rotationY: 0.14 },
  // Lamp yaw is load-bearing: the Forså's spot target sits at local
  // [0.5, 0, 0.12]; at -1.28 the beam reaches forward over the platter —
  // the lamp now stands BEHIND the record player.
  lamp: { position: [-0.6, 0, -0.34], rotationY: -1.28 },
  macbook: { position: [0.02, 0, -0.08], rotationY: Math.PI },
  // White's side faces the sitter (squareToLocal puts rank 1 at local +z);
  // the diagonal points the battle away from whoever sits down.
  chessboard: { position: [0.55, 0, 0.2], rotationY: 0.45 },
  notepad: { position: [-0.18, 0, 0.22], rotationY: -0.06 },
  crate: { position: [-1.08, FLOOR_Y, 0.16], rotationY: 0.5 },
  // Travel vignette moves to the back row (front placement read as clutter):
  // prints fanned beside the rangefinder between turntable and laptop.
  photos: { position: [-0.29, 0, -0.3], rotationY: 0.18 },
  filmCamera: { position: [-0.13, 0, -0.32], rotationY: -0.4 },
  // Ten books standing against the back gallery rail, right side.
  bookRow: { position: [0.57, 0, -0.36], rotationY: 0 },
  // HEAD Radical Pro on the wall right of the window (z at the wall plane;
  // the racket models itself flat in XY facing +z with its peg at z<=0).
  racket: { position: [0.78, 0.55, -0.893], rotationY: 0 }
};

// Rest pose sits ~45 degrees above the desk per Jason's art direction —
// the desk surface is the canvas, the wall barely shows. Shifted right
// (composition v2) so the minimalist center column reads off-axis and the
// right wall's window light rakes across frame.
export const CAMERA = {
  fov: 40,
  rest: [0.28, 1.08, 1.02] as [number, number, number],
  start: [0.62, 1.66, 1.95] as [number, number, number],
  target: [0.1, 0.05, -0.06] as [number, number, number]
};

// Stage 2 focus views: clicking an object dollies the camera to a fixed,
// art-directed close-up while its panel slides in. Fixed views are the whole
// philosophy — each one is hand-framed.
export type FocusId = "records" | "work" | "reading" | "notes" | "chess";

export const FOCUS_VIEWS: Record<
  FocusId,
  { position: [number, number, number]; target: [number, number, number] }
> = {
  records: { position: [-0.56, 0.62, 0.75], target: [-0.58, 0.04, 0.05] },
  // Tracks the macbook placement (now centered, squared to the desk).
  work: { position: [-0.08, 0.32, 0.48], target: [0.04, 0.13, -0.1] },
  // The reading view leans into the book row against the back rail.
  reading: { position: [0.42, 0.34, 0.22], target: [0.57, 0.09, -0.36] },
  notes: { position: [-0.16, 0.55, 0.49], target: [-0.18, 0.01, 0.22] },
  // Elevated three-quarter view from the front-left so the whole board
  // reads plus the graveyard flanks (captured pieces park ±0.218m from
  // board center in local x — keep them in frame).
  chess: { position: [0.37, 0.52, 0.57], target: [0.55, 0.02, 0.2] }
};
