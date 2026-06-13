# Bake — Night 1 report

**Date:** 2026-06-13 (overnight, autonomous)
**Headline: the freeze-dry pipeline works end-to-end, and the baked scene
replaying live in the browser convincingly matches the approved Cycles still.**

Open `/baked` on the dev server to see it (lamp ON/OFF buttons, `b` toggles,
intensity slider). The proof images are in `bake/shots/` (gitignored):
`baked-on-warm.png` (live baked replay) next to `bake/renders/window-light.png`
(the Cycles still you approved) — same moody warm night-desk, same composition.

---

## What this proves

Both of your standing complaints — "fidelity below the record player" and
"jittery, never crisp" — came from computing lighting live on every visitor's
GPU. Tonight I built the fix and proved it: **bake the lighting once, offline,
in Blender Cycles; ship it as textures; replay it unlit at 60fps.** The whole
scene now renders with ZERO scene lights and zero shadow maps — just albedo ×
a baked lightmap. This is the Bruno Simon architecture, working on our scene.

It is a genuine spike: every stage ran on the real exported scene, not a toy.

---

## The pipeline I built (all committed)

Three new pieces, all headless (no manual Blender, no browser-clicking):

1. **`scripts/bake/build_uv1.mjs`** (Node) — takes the exported scene GLB,
   flattens world transforms + welds, then gives every primitive its own
   lightmap UV (`uv1`/TEXCOORD_1) packed into an area-sized atlas via **watlas**
   (xatlas compiled to WASM). Emits `desk-window-uv1.glb`, `rig.json` (the lamp
   /camera marker world-positions, extracted before flattening so the bake
   light rig survives), and `bake_manifest.json`. 347 "bake units", ~21s.

2. **`scripts/bake/bake_lightmaps.py`** (Blender, Metal GPU) — imports that GLB,
   rebuilds the EXACT approved light rig from `render_ab.py` (so the bake matches
   the stills), and bakes Cycles diffuse irradiance (direct+indirect, color OFF)
   into one image per unit. One bake op fills all 347. Runs per lamp state
   (`--state on|off`).

3. **`/baked`** (the runtime viewer) — loads the uv1 GLB and swaps every
   material for an unlit `MeshBasicMaterial` showing live albedo × the baked
   lightmap on uv1. 436/440 meshes lightmapped; the 4 emissive ones (night
   window, screen) stay glowing. This is the "replay" — what the real homepage
   will eventually do.

**Why irradiance-only (not full baked color):** the surface art — book spines,
wood grain, the night view — stays LIVE. Only the *light* is baked. So real
trip-photos and texture tweaks need NO rebake; only geometry/light-rig changes
do. Exactly the flexibility you asked for.

---

## What's rough / honest open items

- **Brightness & warmth.** The live replay is a touch dimmer/cooler than the
  Cycles still. Cause: the still gets Cycles' Filmic tonemap; the runtime uses
  ACES + an exposure/intensity knob (currently exposure 1.55, lightMap intensity
  2.5). It's close, but the lamp's warm *pool* doesn't pop as much as in the
  still. Fixable by either nudging the bake rig warmer or matching the tonemap —
  a tuning pass, not a structural problem.
- **This is a VIEWER, not the real site yet.** `/baked` proves the look on the
  full static scene, but it's a dead scene (no clicks, no chess, no audio).
  Wiring the bake into the real interactive `DeskScene` — geometry swap +
  lightmap per object, then deleting the live shadow/AO/reflector/IBL stack
  (Stage F) — is the next big lift. The viewer de-risks it; the architecture is
  proven.
- **Lamp crossfade.** The viewer hard-swaps ON/OFF lightmaps. The smooth
  `mix(off, on, uMix)` crossfade driven by `DeskThemeContext.mixRef` (the real
  feature) is a small shader add, not yet done.
- **Dynamic objects.** Chess pieces / tonearm / vinyl are baked in place in the
  viewer (fine for a still scene). On the real site they move, so they need the
  probe + blob-shadow treatment (Stage E) — untouched tonight.
- **The tennis racket** is the older reverted version (the rework is shelved on
  branch `racket-rework-wip`). It bakes fine; just noting it's the old model.
- **Atlas count.** 347 separate lightmap PNGs is a lot of texture binds. For
  production we'd combine into a few big atlases. Fine for the spike/viewer.

---

## Key findings & decisions (so we don't relearn them)

- **Node names survive the GLTF export** → the whole pipeline runs headless in
  Node + Blender. No browser orchestration needed for the bake.
- **watlas re-splits vertices at chart seams** (returns an `xref`); EVERY
  attribute must be remapped through it — `COLOR_0` was the one I missed first
  and it silently corrupted the GLB.
- **Per-primitive atlases** beat one giant shared atlas here: every unit fit a
  single page (no multi-page bookkeeping), and Blender bakes each to its own
  image in one pass via per-material routing.
- **drei's `useGLTF` HANGS** on the big embedded-texture GLB; a bare
  `GLTFLoader` from `three-stdlib` returns in ~2s. The viewer uses the bare
  loader.
- **Dev gotchas that cost time:** the preview viewport silently collapsed to 1px
  wide (fixed via explicit `preview_resize`), and stale webpack chunks after
  many HMR edits made the route render nothing until a `rm -rf .next` restart.
  The preview *screenshot* tool also mis-frames the canvas — I added
  `/api/bake/shot` to dump real canvas pixels to disk for honest captures.

---

## Where to push next (my recommended order)

1. **Tune the look** to match the still (rig warmth vs runtime tonemap) — fast,
   high payoff, makes everything else judge-able.
2. **Wire the bake into the real `DeskScene`** (per-object geometry+lightmap),
   add the ON/OFF crossfade, then delete the live real-time stack (Stage F).
   This is where the phone-capable, no-jank win actually lands on the live site.
3. **Dynamic objects** (probe + blob shadows).
4. Combine the 347 lightmaps into a few atlases for production.

---

## How to look at it
- Dev server running on `:3120`. Visit **`/baked`**.
- Buttons toggle lamp state (OFF needs the OFF bake — see status below).
- `bake/shots/*.png` are full-res captures; `bake/renders/window-*.png` are the
  approved Cycles targets to compare against.

_Status of the overnight high-quality bake (1024px / 256 samples, both states)
is updated at the bottom when it finishes._
