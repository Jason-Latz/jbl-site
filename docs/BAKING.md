# BAKING.md — the lightmap bake playbook (Stage 5 payoff)

> This is the runbook for turning the Cycles-quality look into the LIVE site
> via baked global illumination. Read this top-to-bottom before starting the
> bake. It assumes the composition is frozen (it is — composition v4: dark
> walnut study, centered night window, lamp in the corner). After this lands,
> the desk renders like the `bake/renders/window-*.png` stills but at 60fps on
> a phone, and entire classes of real-time bugs stop existing.

---

## 0. The one-paragraph why

Both of Jason's standing complaints — "fidelity below the record player
everywhere" and "jittery, never crisp" — have ONE root cause: we compute
lighting live on every visitor's GPU. Bruno Simon's sites (verified by reading
his source) never do this: `my-room-in-3d` is one mesh + four baked 4K JPEGs
blended in a shader, **zero lights, zero shadow maps**. The fix is to pay the
lighting cost ONCE, offline, in Blender Cycles (already wired up as our
"kiln"), and ship the result as textures. High fixed cost, ~zero variable cost
— exactly what Jason asked for ("I'm happy to let my M4 cook for days").

**The core trick: bake LIGHTING ONLY, keep albedo live.** The surface art
(book spines, wood grain, paper, stickers, the night-window view) stays as the
canvas textures we already generate. Only the *light* (bounce, contact
shadows, the warm falloff of the lamp across the desk) gets baked. So texture
tweaks and real trip-photos-into-PhotoStack need NO rebake; only geometry or
light-rig changes do.

**Two states, blended by the lamp.** Bake the scene twice — lamp-ON (light
theme) and lamp-OFF (dark theme, moonlit window + screen glow) — and lerp
between the two lightmaps at runtime using the existing
`DeskThemeContext.mixRef` (0=dark, 1=light, already frame-damped). The lamp
click that toggles the theme IS the crossfade. This is exactly Bruno's
`uNightMix`.

---

## 1. What already exists (the foundation — do NOT rebuild)

- **`/bake` dev page** (`app/bake/page.tsx` + `components/desk/BakeScene.tsx`):
  mounts the REAL desk objects (same procedural geometry + canvas textures as
  the homepage), minus the shader fakes (volumetric beam, motes, reflector
  film, AccumulativeShadows). Waits ~3.5s for theme-mix + lamp warm-up to
  settle, then GLTF-exports a binary GLB and POSTs it to the intake.
  - URL: `/bake?room=window&theme=<light|dark>` (room is always `window` now;
    `void` is the retired concept).
  - It plants **MARKER_* empties** in the GLB so Blender recovers the camera
    poses and the lamp's optical axis without re-deriving `layout.ts`:
    `MARKER_camPos` (rest), `MARKER_camStart` (intro), `MARKER_camHero` +
    `MARKER_camHeroTarget` (the head-on establishing pose used by the stills),
    `MARKER_camTarget`, `MARKER_lampHead`, `MARKER_lampTarget`.
- **`/api/bake/upload`** (`app/api/bake/upload/route.ts`): dev-only sink that
  writes `bake/desk-<room>-<theme>.glb` (gitignored, ~50MB). 404s in prod.
- **`scripts/bake/render_ab.py`**: the Cycles A/B **STILL** renderer (this is
  the art-direction tool we've been using — it renders a beauty frame, it does
  NOT bake lightmaps yet). Headless Blender 5.1.2, Metal GPU. It:
  - imports the GLB, deletes the KHR punctual lights that ride along,
  - builds a light rig per `(room, theme)` from the markers,
  - `--cam hero|rest|start`, denoised render to `bake/renders/<room>-<theme>.png`.
  - **The light rig in here is the SOURCE OF TRUTH for the look** — the
    lightmap bake must reuse these exact rigs so the baked scene matches the
    approved stills (see §4).
- **Blender 5.1.2** via `brew install --cask blender` (pinned). Binary at
  `/Applications/Blender.app/Contents/MacOS/Blender` (NOT on PATH). Metal GPU
  works (`compute_device_type = "METAL"`).
- **The live room is now `RoomWindow`** (`DeskScene.tsx` imports
  `./concepts/RoomWindow`). Dark walnut paneling, centered window, enclosed on
  all three visible sides.

---

## 2. The static vs dynamic split (decide per object)

A lightmap is baked into a fixed UV layout, so **anything that moves cannot
carry one** (its light would move with it). Split the roster:

**STATIC (gets a baked lightmap):** desk + back rail, RoomWindow (walls,
paneling, floor, ceiling, window frame, sill, succulent), bookshelf book row,
lamp body, turntable body/plinth, MacBook body (lid baked in its rest pose),
notepad, film camera, photo stack, record crate, tennis racket, chessBOARD
(the board, not the pieces).

**DYNAMIC (lit by probe + blob shadow, NOT baked):** chess PIECES (they glide
on moves), the tonearm (swings), the platter/vinyl (spins), the MacBook lid IF
it animates open (it does on the work focus — decide: bake it closed and
pop-in an unbaked open lid, or leave the lid dynamic). The needle-drop and
focus flights don't move geometry, so the camera itself is free.

**Emissive / live-by-design (no bake, or AO-only):** the night-window backdrop
(already emissive — stays emissive at runtime, glows in both themes), the
MacBook screen content, Spotify "live" dots, the lamp filament glow.

---

## 3. The pipeline to BUILD (six stages)

### Stage A — Lightmap UV unwrap (`uv1`)
Generate a second UV set per static object, packed into 1–2 shared atlases.
- **Tooling (verified 2026):** `watlas` (npm, by toji, Jul 2025, works in Node
  — best for a build script) OR `xatlas-three` (repalash, dev-built against
  `three@^0.169` — best for an in-browser tooling page). Both wrap the same
  C++ xatlas.
- **three@0.169 specifics:** the 2nd UV channel is the **`uv1`** attribute
  (renamed from `uv2` in r152); select it at runtime with
  `material.lightMap.channel = 1`.
- **The vertex-identity trap (critical):** xatlas RE-SPLITS vertices at chart
  seams, returning a different vertex count + an xref (new→old) array. You MUST
  remap every attribute (position/normal/uv/color) through xref and rebuild the
  index. `xatlas-three`'s `unwrapGeometry()` does this for you; with `watlas`
  you do it by hand (documented API). Run `mergeVertices()` first (indexed
  geometry only).
- Unwrap each static object, then atlas-PACK all of them into one shared chart
  so each light state is a single texture. Cache the resulting `uv1` + xref to
  disk (a sidecar) so the runtime geometry stays generated-in-code and the bake
  is keyed to deterministic UVs (don't depend on Blender's vertex order — see
  Stage C).

### Stage B — Export the GLB carrying `uv1`
Extend the export (a `/bake?mode=lightmap` variant of BakeScene, or a Node
script) to write the `uv1` channel into the GLB. GLTFExporter emits it as
`TEXCOORD_1`; Blender imports it as a second UV map named consistently. Export
the **static set only** in a known rest pose (lid closed, tonearm up, platter
static, chess in START_POSITION or empty). Keep dynamic objects OUT of this GLB
(they get handled in Stage E).

### Stage C — Cycles lightmap bake (`scripts/bake/bake_lightmaps.py` — NEW)
A new headless script (sibling to `render_ab.py`, reuse its helpers):
1. Import the GLB; delete KHR punctual lights (as render_ab does).
2. For each object, select the imported `TEXCOORD_1` as the active UV map for
   baking; create a target image (start 2048², go 4096² for the desk if it
   earns it) per object-or-atlas.
3. Build the light rig — **reuse render_ab's exact rigs**: lamp-ON for the
   light state (RoomKey/RoomFill practicals + the lamp spot from
   MARKER_lampHead→MARKER_lampTarget + the gently-glowing night window),
   lamp-OFF for dark (moon area light + emissive night backdrop via
   `make_pure_emission` + ember fill; lamp spot off).
4. **Bake type = DIFFUSE, with Direct + Indirect, but Color OFF** (lighting
   only — "irradiance"). This keeps the canvas albedos crisp and live; the
   runtime multiplies albedo × lightmap.
5. Cycles + OpenImageDenoise, high samples (this is offline — thousands is
   fine), **8–16px bake margin/dilation** to kill seam bleed.
6. Write two atlases: `bake/lightmaps/desk-on.<png|exr>` and `desk-off.<...>`.
7. Run it TWICE (or loop): `--state on` and `--state off`.

Command shape (mirror render_ab):
```
/Applications/Blender.app/Contents/MacOS/Blender -b \
  --python scripts/bake/bake_lightmaps.py -- \
  --glb bake/desk-window-static.glb --state on  --out bake/lightmaps --res 4096
/Applications/Blender.app/Contents/MacOS/Blender -b \
  --python scripts/bake/bake_lightmaps.py -- \
  --glb bake/desk-window-static.glb --state off --out bake/lightmaps --res 4096
```

**Optional "do it awesome" multipliers (Jason green-lit days of cook time):**
- **Layered light bakes** — bake each light's contribution to its own atlas
  (lamp layer, window/moon layer, screen layer). The runtime then mixes them
  CONTINUOUSLY: the lamp can dim smoothly, the screen glow can breathe with the
  music, all recolorable live without rebaking. (Bruno's RGB-mask trick.)
- A **baked desk reflection** (Cycles renders the desk's mirror image once; ship
  it as a texture instead of re-rendering the scene every frame — the
  MeshReflectorMaterial we delete in Stage F).

### Stage D — Runtime playback (the live swap)
Load the static GLB once (or keep generating geometry in code and just attach
the baked atlases via the cached `uv1`). Materials become cheap and unlit-ish:
- Give each static material a `lightMap` = the ON atlas and `lightMap.channel
  = 1`, plus an `onBeforeCompile` (or a small custom shader) that ALSO samples
  the OFF atlas and `mix(off, on, uMix)` where `uMix` is a uniform driven each
  frame from `DeskThemeContext.mixRef`. Multiply the result against the live
  albedo (`map`).
- HDR encoding: bake to EXR, normalize exposure by 1/k in the build script,
  save 16-bit (or 8-bit) PNG, set `lightMapIntensity = k`. Watch
  `texture.colorSpace` (lighting data is LINEAR, not sRGB). For true HDR range
  use `@monogrid/gainmap-js` (EXR→gain-map JPEG). For our tone-mapped warm
  scene LDR PNG is the pragmatic default.

### Stage E — Dynamic objects sit in the baked world
Chess pieces, tonearm, vinyl, (maybe) lid: they can't carry a static lightmap.
Light them with:
- A small **baked irradiance probe** sampled from inside the scene (one cube/
  spherical-harmonic capture per theme, baked alongside the lightmaps) so they
  pick up the room's color — warm in light theme, cool-moonlit in dark.
- **Blob shadows**: soft dark ellipse decals under each piece (Bruno's car
  proves this reads fine in motion). Carry them on the chess glide.
- Expect a tuning session here — this is the part most likely to look "pasted
  in" if rushed.

### Stage F — Strip the live real-time stack (the cleanup)
Once playback works, DELETE (don't optimize):
- PCSS `SoftShadows`, all shadow maps (`castShadow`/`receiveShadow`, the
  FrozenShadows plumbing in `lib/three/shadow-dirty.ts`), `AccumulativeShadows`
  / `BakedDeskShadows`.
- `N8AO` (the AO is baked now), the `MeshReflectorMaterial` on the desk top
  (baked reflection instead), the `SceneEnvironment` IBL + hemisphere +
  directional rig, the lamp `SpotLight` (baked).
- **KEEP:** the volumetric beam + dust motes (cheap, Jason loves them, additive
  shader unaffected by baking), emissives + Bloom, Noise grain, Vignette, the
  night-window emissive backdrop.
- Frame cost should collapse to ≈ one render pass; loading collapses from "52
  canvas-texture syntheses + 220-frame shadow warmup" to "download ~3–5MB of
  atlases." This is where the phone-capable, no-jank win lands.

---

## 4. Look parity — match the approved stills
The `bake/renders/window-light.png` and `window-dark.png` stills are what Jason
signed off on. The lightmap bake MUST reuse `render_ab.py`'s light rigs so the
runtime look matches. If the baked live scene diverges, fix the BAKE rig (in
Blender), not the runtime — the runtime is just playback. Iterate against
stills (the medium that's actually judgeable): low-sample preview bakes take
minutes; re-render a hero still, compare, adjust `lights.json`-equivalent
values in the script, repeat.

Current rig values to start from (in `render_ab.py`, window room):
- **light/on:** RoomKey AREA ~40W + RoomFill ~16W + lamp spot (14–18W, from the
  markers) + night backdrop emission ~6 (gentle). Walls are now DARK WALNUT, so
  they absorb more — may need to lift the key 10–25% vs the plaster era.
- **dark/off:** Moon AREA ~18W (cool) + night backdrop emission ~11 + ember
  fill ~0.9W; lamp off.

> **Bake vs. render lamp watts diverge on purpose.** `render_ab.py`'s ACES
> tonemap rolls off the bright lamp-pool center, so its spot can sit at 18W and
> still look right. The lightmap bake (`bake_lightmaps.py`) stores **raw linear
> irradiance** that hard-clips at 1.0, so an 18W spot baked a blown WHITE core
> into the desk top in front of the laptop (Jason's light-mode hotspot). It is
> direct lamp light, not a glossy caustic — proven by baking the desk unit with
> the direct/indirect passes split (the core is 100% in the DIRECT pass) and by
> roughening the camera/turntable to no effect. Fix: the bake spot defaults to
> **10W** (`--lamp-watts`), which erases the white core while the desk pool —
> carried by the 40/16W RoomKey/RoomFill, not the spot — barely dims. If you
> re-approve the look at a different spot energy, keep the bake spot a few watts
> under render_ab's so the desk irradiance stays below the 1.0 clip.

---

## 5. Toolchain quick-reference (verified, with gotchas)
- `watlas` (npm) or `xatlas-three` — UV2 atlas unwrap. xatlas re-splits verts →
  remap all attrs via xref.
- three@0.169: 2nd UV = `uv1`; `lightMap.channel = 1`; `RGBMLoader` exists but
  is removed in newer three — don't build on it; `UltraHDRLoader` +
  `@monogrid/gainmap-js` is the modern HDR route.
- Blender glTF roundtrip does NOT preserve vertex order → bake to OUR `uv1`,
  bring back textures only (never re-import the GLB as runtime geometry — keeps
  rule #3, procedural-in-code, intact).
- GLTFExporter writes three.js lights as KHR punctual → the bake script deletes
  them after import (already in render_ab).
- Emissive-from-glTF gotcha: a backdrop authored `emissive + emissiveMap` with
  a BLACK base color exports its image to the glTF emissive slot but a black
  base-color factor; in Blender rebuild it with `make_pure_emission` (clean
  Emission shader from the raw image), NOT `make_emissive`. (Already in
  render_ab; reuse for the bake.)
- zsh does NOT word-split unquoted vars — write explicit Blender commands, no
  `for combo in "a b"; set -- $combo`.
- **Dev cold-load curtain:** after `rm -rf .next`, the first page load compiles
  every shader and the load curtain hangs 20–40s with the scene rendering
  BEHIND it (canvas ancestor stuck at opacity 0, NO console error). Don't
  mistake it for a broken scene: check the wrapper opacity chain, or
  `el.style.opacity='1'` to confirm; a warm reload lifts it. Production is
  unaffected.
- **Never `npm run build` while dev runs** (shared `.next`). Stop dev,
  `rm -rf .next`, build.

---

## 6. Suggested execution order (one focused session each)
1. **Spike:** unwrap + bake ONE object (the desk) lamp-on only; wire its
   lightMap at runtime; confirm the pipeline end-to-end before scaling.
2. UV-unwrap + atlas-pack the full static set; export the static GLB with `uv1`.
3. `bake_lightmaps.py`: bake on/off atlases (start 2048², parity-check stills).
4. Runtime two-state blend driven by `mixRef`; A/B against the stills.
5. Dynamic objects: probe + blob shadows.
6. Strip the live stack (Stage F); perf + phone pass; bump atlases to 4096²
   where it earns it.
7. Free byproducts: the hero stills become the no-WebGL fallback poster + OG
   image (PLAN.md Stage 4 items, now free).

## 7. Acceptance criteria (done = all true)
- Live homepage A/B's convincingly against `bake/renders/window-{light,dark}.png`.
- Lamp click crossfades the two baked states smoothly (no pop).
- Real-time shadow/AO/reflector/IBL/spot all DELETED; frame cost ≈ one pass.
- Loads by downloading atlases (~3–5MB), not synthesizing 52 textures.
- Runs at 60fps on a mid phone (the whole point).
- Texture-only edits (book art, trip photos) need NO rebake.

---

## 8. Ship the bake to the CDN (slim + upload) — the deploy runbook

The bake writes `public/_bake/desk-window-uv1.glb` (~66MB geometry) and
`public/_bake/lightmaps/*.png` (676 files, ~106MB, 16-bit 1024²). That whole
tree is **gitignored** and must NOT be committed — 172MB on first paint is
brutal, and committing binaries bloats the repo. Instead the assets are
slimmed (~31MB total) and hosted on **public Supabase Storage** (bucket
`bake`, immutable versioned prefix). `BakedDeskScene` fetches that public CDN
in every environment by default so a clean checkout works without the ignored
local bake tree. Set `NEXT_PUBLIC_BAKE_CDN_URL=/_bake/cdn` only when explicitly
testing freshly generated local assets.

> History: the baked homepage once went BLANK in prod because the assets were
> gitignored → never deployed → the GLB 404'd. This pipeline is the fix. Vercel
> Blob was the first plan but the account's Blob is billing-suspended; Supabase
> Storage (already in the stack, free, CDN-served) is what we use.

**After any re-bake, run (from the repo root):**
```
node scripts/bake/slim_glb.mjs            # GLB → public/_bake/cdn/ (meshopt, ~28MB)
node scripts/bake/slim_lightmaps.mjs 768 90  # PNG → public/_bake/cdn/lightmaps/*.webp (~3MB)
node scripts/bake/verify_glb.mjs          # asserts meshopt decodes + vert/uv1 totals match
node scripts/bake/upload_supabase.mjs v2  # NEW version prefix on a re-bake (was v1)
```
Then bump the version the runtime points at: edit `SUPABASE_BAKE_CDN` in
`components/desk/BakedDeskScene.tsx` (…/bake/**v1** → **v2**) — or set
`NEXT_PUBLIC_BAKE_CDN_URL` in Vercel to repoint without a code change — and
redeploy. The versioned prefix makes URLs immutable, so there's no stale-CDN
cache to bust.

**Sharp gotchas this pipeline cost us:**
- **`prune()` strips the lightmap UVs.** The lightmap is attached at RUNTIME
  (not in the glTF material), so gltf-transform's `prune()` default sees
  `TEXCOORD_1` as unused and deletes it → ALL baked lighting breaks. `slim_glb`
  runs `prune({ keepAttributes: true })`. `verify_glb` guards it (counts uv1).
- **three-stdlib's `MeshoptDecoder` is the wrong shape** (a bare function, no
  `decodeGltfBuffer`/`ready`). Import the decoder from
  `three/examples/jsm/libs/meshopt_decoder.module.js` instead, and call
  `loader.setMeshoptDecoder(MeshoptDecoder)` before `.load()`.
- **WebP lightmaps are lossless vs. what shipped.** The runtime loads lightmaps
  through `THREE.TextureLoader` → an `<img>`, which decodes 16-bit PNG to 8-bit
  anyway. So 8-bit WebP discards nothing the GPU ever saw, at ~1/30th the bytes.
- **`gltf-transform` meshopt needs the codec registered as an IO dependency**
  (`registerDependencies({ 'meshopt.encoder': …, 'meshopt.decoder': … })`),
  not just passed to `meshopt()`, or it throws `encodeFilterOct of undefined`.
- **Supabase free plan caps object size at 50MB** — don't set a bucket
  `fileSizeLimit` above it (createBucket fails). The 28MB GLB fits the default.
- Public Supabase objects serve `access-control-allow-origin: *`, so the
  cross-origin GLB/texture fetch + `preserveDrawingBuffer` canvas stay clean
  (`texLoader.crossOrigin = "anonymous"`).

## 9. GLB texture recompression — the slim82 step (2026-07-15)

The exported GLB's bytes are ~80% embedded PNG textures (the objects' own PBR
maps), not geometry. Recompressing those textures to WebP q82 took the shipped
GLB from 29.33MB to 6.36MB (78% smaller) with no runtime change: three-stdlib's
GLTFLoader decodes `EXT_texture_webp` natively. The live homepage loads
`bake/v1/desk-window-uv1-slim82.glb` (uploaded additively; the original
`desk-window-uv1.glb` is untouched in `v1/` as the rollback).

Reproduce on a future re-bake (after the §8 slim step):

```bash
# textures -> WebP q82 (gltf-transform CLI pulls sharp itself via npx)
npx @gltf-transform/cli webp desk-<room>-uv1.glb desk-<room>-uv1-slim82.glb \
  --slots "*"   # then verify: names/extras/TEXCOORD_1 must be unchanged
```

Verified constraints, do not skip:
- **Pin `meshoptimizer@0.18.1` in any script that RE-ENCODES meshopt.**
  meshoptimizer 1.x emits `EXT_meshopt_compression` that three@0.169's
  MeshoptDecoder hangs on forever (silent, no error). The webp step above does
  not touch geometry, so it is safe by construction.
- Material names, node `userData.object` tags (extras), and `TEXCOORD_1` must
  survive byte-identical: the runtime keys lightmaps off material names and
  click routing off the tags. `gltf-transform` preserves all three; verify with
  `npx @gltf-transform/cli inspect` + a tag-count diff before uploading.
- Quality floor: q82 measured ~0.88/255 mean abs error across all 84 textures
  (at the measurement noise floor). Below q75 is unverified territory.
- A/B in the browser (both themes) before repointing `GLB_URL`.
