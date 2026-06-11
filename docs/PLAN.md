# The Desk — staged roadmap

The homepage becomes a single warm, lamplit 3D desk. Every object on it is real data:
the turntable plays what Jason is actually listening to, the bookshelf holds what he's
actually reading, the notepad is a public guestbook, the chessboard is one ongoing
world-vs-Jason game. The desk is a navigation layer — content stays in real HTML routes.

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
- [x] Postprocessing pass (landed early in Stage 1.5: Bloom + Vignette + SMAA)
- [ ] Static poster render of the scene for the fallback hero + social OG image
- [ ] Mobile tuning pass (touch orbit, portrait framing, perf tiers)
- [ ] Inner pages typography refresh to match the desk's palette
- [ ] Easter eggs (dust motes in lamp cone, mug steam, seasonal touches)

## Performance budget

- ≤ ~300k triangles, all textures canvas-generated or ≤1k, no runtime HDR/GLB downloads
- 60 fps target on Apple Silicon / recent integrated GPUs; DPR ≤ 1.75
- Lazy-load the scene chunk; homepage HTML must not block on three.js
