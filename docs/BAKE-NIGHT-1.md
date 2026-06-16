# Bake — Night 1 report

> ## ⤴ UPDATE (cont.) — it's in the REAL homepage now
>
> After your feedback ("live looks better, everything's flat, racket's still
> there"), I diagnosed the flatness and pushed the bake **into the actual
> homepage**. Open **`/?baked=1`** — that's the real DeskHero (HUD, nav, panels)
> lit by baked GI, with the lamp beam + dust motes + bloom on top. See
> `bake/shots/homepage-baked-on.png`.
>
> - **The flatness was my fault, not the bake's.** The viewer used *unlit*
>   MeshBasic — no chrome, no specular, no shine. Switching to **MeshStandard +
>   an Environment map** (lightmap does diffuse, env does specular/metal) brings
>   the chrome lamp, the desk sheen and the record-player gloss right back. That
>   was the whole gap.
> - **Racket: gone** (live scene + bake). **MacBook:** closed lid flattened so
>   the keyboard no longer peeks out. **Lamp interior:** fixed by the
>   MeshStandard/env change (chrome reflects again).
> - **`BakedDeskScene`** (behind `?baked=1`, so the live homepage is untouched
>   until you sign off) loads the uv1 GLB, crossfades the two baked states by
>   the real theme `mixRef`, dispatches focus/theme **clicks** off each baked
>   mesh's object tag, and keeps the beauty (beam, motes, bloom, grain,
>   vignette) while dropping the shadow maps / N8AO / IBL warm-up.
> - **Open / needs your eyes:** clicks can't be tested headlessly (R3F raycast
>   quirk) — please click the turntable/laptop/chess/notepad and the lamp.
>   First pass is **static** (chess/tonearm/lid don't animate yet — they bake in
>   rest pose; re-adding them live on top is the next step). Dark-theme OFF maps
>   finished baking overnight too.
> - Re-baked both states at 1024/256 with the racket gone + object tags.
>
> The original Night-1 write-up (the pipeline + the standalone `/baked` viewer)
> follows.

---

**Date:** 2026-06-13 (overnight, autonomous)
**Headline: the freeze-dry pipeline works end-to-end, and the baked scene
replaying live in the browser convincingly matches the approved Cycles still.**

Open `/baked` on the dev server to see it (lamp ON/OFF buttons, `b` toggles,
intensity slider). **Both lamp states are baked (1024px / 256 samples) and the
lamp toggle crossfades smoothly between them.** Proof images in `bake/shots/`
(gitignored):
- `final-on.png` (live baked ON) vs `bake/renders/window-light.png` (approved)
- `final-off2.png` (live baked OFF) vs `bake/renders/window-dark.png` (approved)
Both match the approved stills — warm lamp-lit desk vs. moonlit night desk.

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

- **Brightness & warmth — mostly handled, refine on real hardware.** Two fixes
  landed tonight: `lightMapIntensity` ≈ π cancels three's RECIPROCAL_PI on the
  MeshBasic lightmap (truer match), and `uOffBoost` lifts the OFF lightmap so
  the night desk stays visible like the dark still. Both match the stills well
  now. The lamp's warm *pool* in ON could still pop a hair more — a rig-warmth
  nudge, not structural. Exposure is ACES 1.55.
- **This is a VIEWER, not the real site yet.** `/baked` proves the look on the
  full static scene, but it's a dead scene (no clicks, no chess, no audio).
  Wiring the bake into the real interactive `DeskScene` — geometry swap +
  lightmap per object, then deleting the live shadow/AO/reflector/IBL stack
  (Stage F) — is the next big lift. The viewer de-risks it; the architecture is
  proven. (The crossfade shader + uMix damping built tonight ports straight
  over — it's already shaped like the real `mixRef`.)
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
- Dev server on `:3120`. Visit **`/baked`**. Buttons (or `b`) toggle the lamp;
  watch it crossfade. The intensity slider is live.
- `bake/shots/final-{on,off2}.png` are the full-res captures; compare against
  `bake/renders/window-{light,dark}.png` (the approved Cycles targets).
- Lightmaps live in `bake/lightmaps_hq/` (1024/256, both states) and are copied
  to `public/_bake/lightmaps/` for the viewer. The uv1 GLB is
  `bake/desk-window-uv1.glb` (also copied to public). All gitignored.

## Overnight bake status — DONE
Both states baked at **1024px / 256 samples** (~23 min each on the M4), 347
units, denoised. Sitting in `bake/lightmaps_hq/`. You said tomorrow is the
full-day max-quality cook — to re-bake higher, it's one command per state:
```
Blender -b --python scripts/bake/bake_lightmaps.py -- \
  --glb bake/desk-window-uv1.glb --rig bake/rig.json \
  --manifest bake/bake_manifest.json --state on --out bake/lightmaps_hq \
  --res-cap 2048 --samples 1024 --margin 16
```
(then `--state off`). Bump `--res-cap` / `--samples` for the full cook; the
viewer picks them up after copying `*-{on,off}.png` into `public/_bake/lightmaps/`.
