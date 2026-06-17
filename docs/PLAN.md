# The Desk — staged roadmap

The homepage becomes a single warm, lamplit 3D desk. Every object on it is real data:
the turntable plays what Jason is actually listening to, the bookshelf holds what he's
actually reading, the notepad is a public guestbook, the chessboard is one ongoing
world-vs-Jason game. The desk is a navigation layer — content stays in real HTML routes.

> **Status — 2026-06-16: the preliminary site is LAUNCHED.** The homepage is the
> baked 3D desk, live on **www.jasonlatz.com** (`?baked=0` falls back to the live
> procedural scene). Stages 1–5 are shipped. Remaining work is **Stage 4 polish**
> (below) — none of it blocks the launch.

Decisions locked with Jason (June 2026):

- Direction: Concept C ("The Desk"), staged. Mockups live in the session history.
- Audio: tactile needle-drop + crackle, then **actual playback** (30s iTunes-matched
  previews for visitors; Spotify Web Playback SDK full tracks for Jason is a later stage).
- Theme: light mode = Forså lamp ON, dark mode = lamp OFF / very warm dim. Lamp is
  clickable and toggles the global theme.
- Chess: **world vs. Jason** — one persistent global game, visitors move when it's the
  world's turn, Jason replies via admin.
- Lamp model: IKEA **Forså** — chrome/nickel, articulated twin-strut arm, dome head,
  round weighted base (reference photo provided).
- Laptop: MacBook-Pro-like, space gray, **three Claude sunburst stickers** on the lid.
- Bookshelf: two shelves — "current" (The Power Law — Sebastian Mallaby; On the Edge —
  Nate Silver) and "favorites" (The Wise Man's Fear — Patrick Rothfuss; Moonwalking with
  Einstein — Joshua Foer), with room to add more. Book reviews come in Stage 2.
- Commit style: granular, one object/behavior per commit (see CLAUDE.md).

## Stage 1 — the room (SHIPPED on branch, 2026-06-10)

- [x] Docs: CLAUDE.md, PLAN.md, CONTEXT.md
- [x] Three.js stack pinned and configured for Next 14 / React 18
- [x] Theme bridge hook (`data-theme` ⇄ scene lighting, lamp click toggles)
- [x] Scene shell: canvas mount, camera + clamped orbit, room + desk, lighting rig
- [x] Desk objects, each its own file + commit:
  - [x] Turntable (hero: plinth, platter, grooved vinyl, tonearm, controls)
  - [x] Forså desk lamp (chrome, articulated, clickable head)
  - [x] MacBook with three Claude stickers (screen glows in dark mode)
  - [x] Two-shelf bookcase with real spines (content/books.ts)
  - [x] Notepad + pen (static; guestbook in Stage 2)
  - [x] Chessboard with pieces (static; world-vs-Jason in Stage 3)
  - [x] Record crate with sleeves (static; history-driven sleeves in Stage 2)
- [x] Live Spotify wiring: vinyl spins at 33⅓ only while playing; HUD shows track
- [x] Audio engine: synthesized needle thunk + crackle bed, preview playback chain
- [x] `/api/audio/preview` (iTunes match, cached) + `/api/audio/stream` (same-origin proxy)
- [x] Needle-drop interaction: click → arm swings → thunk → crackle → preview fades in
      (verified live end-to-end including natural 30s end → arm lift)
- [x] Lamp click toggles site theme (code in; in-canvas click needs Jason's manual
      verify — synthetic events can't drive R3F raycasts, see CONTEXT)
- [x] Fallback: WebGL/reduced-motion detection → designed static hero; HTML content below
- [x] Performance: DPR clamp, lazy import (homepage first-load 103 kB, scene chunk
      deferred); `npm run build` green
- [x] Visual QA via screenshots: both themes, desktop + mobile framing rigs

## Stage 1.5 — the fidelity pass (SHIPPED 2026-06-11)

Jason's bar: "borderline lifelike… a piece of genuine artwork." Philosophy: there is
no variable input — only a handful of fixed views — so spend like a film render and
precompute everything we can. Sign it "Made with Claude" in a corner.

- [x] Rendering pipeline: ACES filmic tone mapping + themed exposure, PCSS soft
      shadows, AccumulativeShadows bake on the desk top (the upfront computation),
      Lightformer environment (replaces RoomEnvironment), Bloom + Vignette + SMAA
- [x] Materials library: MeshPhysicalMaterial helpers (clearcoat lacquer, glass),
      bump-from-canvas support
- [x] Camera: noticeably more top-down (~45° elevation), both rigs
- [x] "Made with Claude" mark, small, corner of the hero
- [x] Per-object artisan rebuild (one agent + one commit each — fidelity bar:
      lathe-turned profiles, chamfered edges, no raw box edges on hero surfaces,
      bump maps, clearcoat where lacquered):
  - [x] Desk → deep mahogany: thick slab, breadboard ends, edge profile, turned
        legs, aprons
  - [x] Lamp → full Forså: stepped base, knurled knobs, twin struts with cross
        bolts, real coil springs, bulb + reflector inside dome, cable with plug
  - [x] Books → cover overhang, page-block texture, rounded spines, foil type
  - [x] MacBook → unibody chamfers, 3D keys, raised sticker decals with edge
        shadows, ports, brighter believable IDE screen
  - [x] Chessboard → real Staunton lathe profiles ("not made in Roblox"), felt
        bases, lacquered finish, board frame molding
  - [x] Turntable → clearcoat plinth, strobe dots, hinges, refined label
  - [x] Notepad / Crate / Room → same bar (plank floor, plaster wall, slat grain)
- [x] Visual QA at the new angle in both themes; build green

## Stage 2 — objects come alive (SHIPPED 2026-06-11, except noted)

- [x] Record crate sleeves textured from Supabase listening history (top albums)
- [x] Click turntable → records panel (recent plays, top artists, crate browsing)
- [x] Click MacBook → work/experience panel (lid opens; screen shows the editor)
- [x] Click bookshelf → reading panel with Jason's reviews (new `books` table or content file)
- [x] Notepad guestbook: `desk_notes` table, public insert with rate limit + length cap +
      moderation (profanity filter); notes read/write via the panel
- [x] Camera choreography: dolly-in per object, breadcrumb to return (+ deep links
      via /?focus=…)
- [x] Album-art label texture on the spinning vinyl (proxied for CORS)

Remaining Stage 2 nice-to-haves (deferred):
- [ ] Admin delete/moderation UI for desk_notes in /admin (today: psql)
- [ ] Latest notes inked onto the 3D pad's top-sheet texture itself

## Stage 2.75 — the beauty pass (SHIPPED 2026-06-11)

Jason: "I still don't think it's quite artsy enough… I'm okay with a 5- or
10-second loading if we can make this really just wow, beautiful. Remember,
this is your art." Light became the subject:

- [x] Volumetric lamp beam + 150 GPU-driven dust motes (fresnel-melted cone
      shells; flickers in sympathy with the filament via lampGlowRef)
- [x] Filament warm-up envelope on every lamp strike (page load + clicks)
- [x] Desk top is a true lacquer reflector (MeshReflectorMaterial wearing
      recomposed copies of the slab's own grain maps; mix strength
      crossfades with the theme)
- [x] Cinematic post stack (components/desk/Effects.tsx): N8AO contact AO
      (meter-scale radii, lamp-aware intensity), DoF gliding between the
      turntable hero and the active focus view, film grain; SMAA/Bloom/
      Vignette keep the established grade
- [x] Vinyl anisotropy: per-texel radial direction map (three r169 rg/b
      convention) — the light blade sweeps the grooves as the record spins
- [x] Loading budget spent: 220-frame / 2k shadow bake behind a curtain-rise
      fade (the loading screen is the lamp being switched on)
- [x] Night rebalance: ajar MacBook leak (1.25 cd) washes the wall and rims
      the bookshelf + chessmen; lamp pool eased 5.8 → 5.4

## Stage 2.9 — edgeless light + the elevation pass (SHIPPED 2026-06-11)

Jason's correction of 2.75: "the boundaries of the light look linear… a clear
delineation of where the light is and isn't. looks very 2d… my prompt was
actually about bringing the other things (desk, computer, notes, bookshelf)
up to the level of the record player."

- [x] Beam rebuilt with NO surfaces: bounding cone whose fragment shader
      shades a gaussian density around the view-ray/axis closest approach —
      an edge cannot exist by construction (motes kept, Jason likes them)
- [x] Lamp pool rim melted (spot penumbra 0.55 → 0.85)
- [x] Translucent desk-top border erased (reflector film now covers the
      full flat top; baked-shadow catcher clipped to the slab)
- [x] MacBook: true bead-blasted space gray, env-keyed satin aluminum,
      polished chamfer hairlines, real port countersinks
- [x] Notepad: paper tooth + debossed rules/handwriting, foxed page block,
      drawn-nickel coil glints, lacquered pen with chrome nose + brass band
- [x] Bookshelf: three real cover finishes (linen / matte jacket / gloss
      laminate), true foil spine type via roughness/metalness maps, page
      striations, a 7.5–9.5° leaner
- [x] Desk wood: rebuilt sheen map (polish pools / forearm wear / cup
      rings) driving the reflector's per-texel blur, hotter chatoyance,
      end-grain veneers on the breadboard caps, lacquered leg profiles

## Stage 3 — chess: the world vs. Jason (SHIPPED 2026-06-11)

- [x] `chess_games` schema: single active row, jsonb move list, ply counter
      as the optimistic-concurrency token (applied live; game 1 seeded,
      world plays white)
- [x] chess.js legality on server routes; visitors move only on the world's
      turn (same-IP 60 s cooldown; 409 on races; verified end-to-end
      against the dev server)
- [x] 3D pieces move on the desk board (FEN-diffed roster, carried-piece
      arcs, graveyard flanks, coral last-move glow) + panel annotation
      ("the world played O-O · just now")
- [x] Jason moves via /admin (ChessAdmin on the shared hook/board;
      NEEDS JASON'S SIGNED-IN HAND-CHECK — only the 401 path could be
      verified without his session)
- [x] Game-over handling: checkmate credits the mover, draws detected
      (except auto-threefold — FEN carries no history), admin "new game"
      archives and reseeds with colors alternating

## Stage 4 — polish and beyond

- [ ] Spotify Web Playback SDK: full tracks when Jason is signed in (Premium)
- [x] Branded entrance preloader: the Claude burst mark turning over a randomly
      cycling Claude Code spinner verb ("Reticulating…"), a warm full-viewport
      curtain that continues the desk's own loading shimmer and lifts on the
      scene-ready signal (SHIPPED on worktree branch 2026-06-15, not merged)
- [x] Postprocessing pass (landed early in Stage 1.5: Bloom + Vignette + SMAA)
- [~] Static poster render of the scene for the fallback hero + social OG image
      (now a free byproduct of the Stage 5 kiln) — fallback hero poster DONE
      (theme-aware `public/desk-poster-{light,dark}.jpg`, 2026-06-15); social OG
      image still TODO
- [~] Mobile tuning pass (touch orbit, portrait framing, perf tiers) — portrait
      framing reframed on the turntable hero (2026-06-15); the homepage is now
      full-bleed immersive (3D fills 100svh) with the nav floating over the scene
      as a theme-aware glass bar, and the portrait camera reframed (fov in the
      rig) to fill a tall screen (2026-06-17, both mobile + desktop); touch orbit
      + perf tiers still TODO
- [x] /travel is a warm 3D globe of places Jason has been (PR `overnight/desk-stretch`,
      2026-06-17) — Natural Earth land texture, coral markers from content/places.ts,
      arcs, fresnel rim, drag/auto-rotate, place card → /photography, lazy + fallback.
- [~] Inner pages typography refresh to match the desk's palette — warm-continuity
      palette retone landed (light accent navy → terracotta coral, AA-checked,
      2026-06-17); fuller per-page typography/layout pass still open.
- [ ] Easter eggs (dust motes in lamp cone, mug steam, seasonal touches)
- [ ] /music page (Jason 2026-06-11): record CRATE click → /music with his
      curated favorite records (he edits the list); record PLAYER click →
      recently playing. Split the two click targets when the page exists.
- [ ] Window view upgrade: layered parallax outside the glass (skyline /
      courtyard planes at 2-3 depths). Cheap — the baked light doesn't care;
      Jason asked "is that too much?" — it isn't.
- [~] /photography split from /travel (2026-06-17): /photography is now its own
      gallery page (mosaic), and clicking the desk camera + prints navigates there
      (both scenes). Still open: dedicated camera/photo-stack focus views + panels,
      and prints becoming his real trip photos.

## Stage 5 — the kiln: baked GI, CDN-hosted (SHIPPED — site LAUNCHED 2026-06-16)

Direction pivot after launch. Jason's two standing qualms — fidelity below
the record player everywhere else, and motion that never feels crisp —
share one root: we compute lighting live. Real GI (contact darkening,
color bleed, soft falloff on big flat surfaces) is exactly what the desk,
books, notepad, laptop, and walls are starving for, and exactly what no
real-time budget buys. New pipeline ("freeze-dry"): authoring stays
procedural in code; lighting moves offline. Blender (5.1.2, brew cask) is
driven headless as a render/bake farm — a kiln, never a modeling tool.

Locked decisions: lamp-on + lamp-off as two baked states blended by the
existing theme mixRef (the lamp click literally drives the crossfade);
lighting-only bakes so canvas albedos stay live (texture art = no rebake,
real trip photos swap into PhotoStack for free); static desk reflection
(moving chess pieces won't reflect — approved); dynamic objects (chess,
tonearm, lid) get probe light + blob shadows; room redesign rides along —
A (perfected void) vs B (corner window), decided from Cycles stills.

- [x] De-jank the live site meanwhile: drop DoF, drop the AdaptiveDpr
      resolution pops (fixed dpr cap 1.5)
- [x] Travel/photography vignette modeled + placed (FilmCamera, PhotoStack)
- [x] Export stage: /bake page → GLB (reflector/beam/motes excluded,
      MARKER_* empties for camera + lamp axis) → /api/bake/upload
- [x] Cycles renderer: scripts/bake/render_ab.py — headless rig per
      room+theme, Metal GPU, denoised
- [x] Room concept block-outs: concepts/RoomVoid.tsx, concepts/RoomWindow.tsx
- [x] A/B concept stills (rooms × themes) rendered for Jason's decision
- [x] Jason picks the room → THE CORNER WINDOW won (2026-06-11, his "1 vs 2"
      bake-off + voice notes: window on the RIGHT wall, cross-light against
      the lamp). RoomWindow replaces Room.tsx during the bake build-out;
      RoomVoid stays archived in concepts/.
- [x] Live integration: RoomWindow is now the live room; middle-tilt camera.
- [x] Composition frozen at v4 (dark walnut study, lamp aim, chess, racket,
      enclosed left wall). Ready to bake.
- [x] **THE LIGHTMAP BAKE — DONE.** Full static set baked both themes (Cycles
      diffuse on/off), UV1 atlas, runtime two-state `mixRef` crossfade live, the
      real-time shadow/AO/reflector stack stripped. Pipeline + gotchas:
      `docs/BAKING.md`.
- [x] **Slim + CDN-host the baked assets, then flip the homepage → LAUNCH
      (2026-06-16).** Assets cut **172→31MB** (meshopt GLB + 8-bit WebP
      lightmaps), hosted on public **Supabase Storage** (`bake/v1/`, immutable);
      `/` flipped to the baked desk (`?baked=0` = live-scene escape). **The
      preliminary site is LIVE on www.jasonlatz.com.** Re-bake/re-host runbook:
      `docs/BAKING.md` §8.
- [~] Poster / OG / no-WebGL fallback from the kiln — fallback poster DONE;
      social OG image still TODO.

## Performance budget

- ≤ ~300k triangles; textures canvas-generated or ≤1k at runtime; no
  third-party asset downloads — our own kiln artifacts (lightmap atlases,
  eventually a self-exported GLB) are allowed once Stage 5 lands
- 60 fps target on Apple Silicon / recent integrated GPUs; DPR ≤ 1.5 fixed
- Lazy-load the scene chunk; homepage HTML must not block on three.js
