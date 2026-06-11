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
  macbook: { position: [0.28, 0, -0.13], rotationY: -0.12 },
  bookshelf: { position: [0.71, 0, -0.29], rotationY: -0.05 },
  chessboard: { position: [0.6, 0, 0.21], rotationY: 0.32 },
  notepad: { position: [0.02, 0, 0.25], rotationY: -0.08 },
  crate: { position: [-1.22, FLOOR_Y, 0.12], rotationY: 0.5 }
};

export const CAMERA = {
  fov: 38,
  rest: [0.06, 0.52, 1.34] as [number, number, number],
  start: [0.42, 0.98, 2.5] as [number, number, number],
  target: [0, 0.1, -0.05] as [number, number, number]
};
