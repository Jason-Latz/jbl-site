// Frozen-shadow-map bookkeeping for the desk scene.
//
// The scene's two shadow maps (directional key + lamp spot) describe a desk
// where almost nothing ever moves, yet by default three re-renders every
// castShadow mesh into both maps every frame (~900 draw calls of pure
// re-statement). DeskScene sets gl.shadowMap.autoUpdate = false after the
// warm-up and re-renders the maps ONLY while something that casts a moving
// shadow says so by calling markShadowsDirty().
//
// Movers that must call it while animating: chess pieces gliding, the
// MacBook lid damp, the tonearm swing. Light-intensity changes (theme
// crossfades, the filament warm-up) deliberately do NOT dirty the maps —
// they change what the lights emit, not the depth the casters occlude.

let dirtyUntil = 0;

/** Keep shadow maps re-rendering for the next `hold` seconds. */
export function markShadowsDirty(hold = 0.3): void {
  const until = performance.now() + hold * 1000;
  if (until > dirtyUntil) {
    dirtyUntil = until;
  }
}

export function shadowsDirtyNow(): boolean {
  return performance.now() < dirtyUntil;
}
