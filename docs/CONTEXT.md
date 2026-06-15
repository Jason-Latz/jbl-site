# CONTEXT.md — live state of The Desk build

> Update this at the end of every working session. Newest session on top.
> Purpose: if context is lost, a fresh session reads CLAUDE.md → PLAN.md → this file
> and knows exactly where things stand and why.

## Session log

### 2026-06-15 — Branded entrance preloader (worktree `objective-curie-e74b62`, NOT merged)

Jason wanted the homepage to "look super bougie right out of the box" — no
one-or-two-second window of raw buffering. The fix: a brief, designed loading
curtain that holds over whatever is buffering and lifts when the scene is
actually ready. The curtain is the Claude burst mark turning slowly over a
randomly cycling **Claude Code spinner verb** ("Reticulating…", "Schlepping…").
Built on a worktree per his instruction — other worktrees are active, so this
is NOT merged.

What landed (5 granular commits + docs):
- `lib/spinnerVerbs.ts` — the ~195 leaked Claude Code spinner gerunds (sourced
  online, not from disk, per Jason; cross-checked across public reproductions of
  the extracted array) + `randomSpinnerVerb(exclude)` that never repeats the
  current word.
- `components/desk/ClaudeMark.tsx` — the Claude sunburst as an inline
  currentColor SVG (canonical Simple Icons geometry, verbatim).
- `components/desk/Preloader.tsx` + the `.site-preloader` block in `globals.css`
  — the curtain. Fixed full-viewport at z-index 2000 (above the header and the
  1100 photo modal), warm radial vignette that **continues the desk's own
  `.desk-hero-loading` gradient** (light `#f8f1e3→#e4d3b6`, dark embers
  `#241a11→#0c0805`) so the lift has no colour seam. Mark = coral `#d97757`,
  slow 19s rotation + 3.4s breathe inside a pulsing aura; verb in Newsreader
  serif with an animated ellipsis, crossfading every 1.9s. Exit = fade + slight
  scale + 6px blur "lift away" over 0.76s, layered under the existing 1.15s
  canvas fade-in.
- `components/desk/DeskHero.tsx` — `<Preloader ready={sceneReady}>` at the top of
  the scene path; rides the existing `ReadySignal` (compileAsync + 3 frames).

Design choices worth keeping:
- It lives ONLY in the `capability === "scene"` path, so the no-WebGL /
  reduced-motion fallback (which early-returns with no heavy scene) never shows
  a curtain. CSS also zeroes all animation under `prefers-reduced-motion`.
- Hydration-safe: the random verb is client-only, so SSR/first paint renders a
  reserved empty slot (matches), then the first verb fades in.
- Two escape hatches so a visitor is never trapped behind it: a `<noscript>`
  rule hides the curtain when JS is off (nothing could dismiss it otherwise),
  and a 9s safety timeout dismisses it if `sceneReady` never fires.

Verified: tsc clean; clean production build (homepage first-load 126 kB, up
~3 kB from 123 — the verb list + curtain); both themes and mobile (375px,
longest verb "Whatchamacalliting" fits, no overflow) screenshot-QA'd via the
real global CSS; zero console errors; natural flow confirmed (curtain present on
load → scene ready → curtain gone).

GOTCHA (verification): once the dev server is warm the heavy route is cached, so
the scene reports ready in <1s and the curtain lifts before a screenshot can
land. To inspect the curtain deterministically, inject a static clone of its
markup (it's all global CSS classes) and screenshot that, rather than racing the
real lifecycle. Also: this worktree's `.claude/launch.json` shares port 3120
with other active worktrees' `desk-dev` — bump the port locally to preview, but
that change is incidental (left reverted, out of the feature commits).

HARDENING (adversarial review fan-out over the diff → 3 confirmed low-sev fixes):
- Fallback dissolve: detection resolves in an effect after first paint, so the
  curtain (emitted while "pending") was hard-cut when a no-WebGL/reduced-motion
  visitor's early return swapped in the static fallback. Now the fallback branch
  also renders `<Preloader ready>`, so the curtain dissolves over the fallback.
  Kept the SSR-safe "pending" first render (the reviewer's lazy-useState idea
  would have hydration-mismatched the common scene path too — rejected).
- Focus trap: the opaque z-2000 curtain covers the header nav + theme toggle,
  which stayed tabbable (WCAG 2.4.7). Focus the curtain on mount + swallow Tab
  while up, restore prior focus on lift. (focusin-refocus was tried first and is
  unreliable — calling focus() mid-focus-event is a browser quirk; Tab-keydown
  preventDefault is the robust path.)
- Announced status: a role="status" region speaks its CONTENT, not its name, so
  the aria-label was silent — replaced with sr-only text via the existing
  `.desk-hud-sr` util.
The same review REFUTED two non-issues (a leftRef/StrictMode double-fire and the
uncaptured EXIT_MS timeout — harmless, React 18 no-ops setState after unmount).
Re-verified: tsc clean, build green, curtain focus-trap + sr-only confirmed live,
no console errors.

GOTCHA (verification, take 2): on a COLD dev server the scene's frame-driven
ReadySignal may not fire while the preview page is backgrounded (rAF is
throttled — the documented preview gotcha), so `sceneReady` stays false and the
9s safety timer lifts the curtain over an opacity-0 scene (just the warm
shimmer). It is NOT a regression — the scene path is untouched; a foreground/prod
browser bakes in ~1-2s and the curtain lifts on sceneReady. Don't "fix" the 9s.

NEXT (if Jason likes it): merge to main once the other worktrees settle;
optionally pull `ClaudeMark` into the `Made with Claude` sticker chip too, and
consider a tasteful min-display time so very fast loads still register the verb.

### 2026-06-13 — Spotify pipeline redesign: stop the rate-limit "maxing out"

Jason: the widget kept freezing ("only two plays ever," "maxes out, only
works sometimes"). Root cause: the live READ path and the history WRITE path
were fused — every `/api/spotify/live` poll (every visitor, every 45s) ran the
full `syncSpotifyRecentHistory` (paginate Spotify + upsert + retention delete)
inside `fetchSpotifyLivePayload`, so a few open tabs blew through Spotify's
~30s rolling rate window. On a 429 the whole payload threw → route 502 →
widget stuck on its last cached value ("only works sometimes"). The daily-only
Hobby cron is WHY the sync got jammed into the read path to begin with.

Redesign (all in `lib/spotify.ts`); the `SpotifyLivePayload` shape is unchanged
so every consumer (home ribbon, DeskHero HUD, RecordsPanel) is untouched:
- `spotifyRequest` now honors 429 `Retry-After` with bounded backoff (≤8s, 2
  tries); a longer cooldown fails soft instead of blocking the response.
- The read path makes ONE live Spotify call (currently-playing, wrapped
  fail-soft). "Today", recent-10, and weekly top-artists all read from
  `spotify_recent_tracks` (one deduped source) instead of a live page. Old
  live-page computation kept ONLY as the fallback when Supabase is absent.
- History sync left the hot path: `maybeSyncHistory()` is throttled to once
  per 3 min (in-memory) and swallows failures — a visit still pulls fresh
  plays, but never on every poll and never breaking the read. Daily cron stays
  the backstop.
- Added an in-module micro-cache (~10s, with in-flight de-dupe) of the
  assembled payload so concurrent polls collapse to one upstream build.
- Service Supabase clients (lib + albums route) got the mandatory no-store
  fetch wrapper they were missing — the watermark/top-artists reads were
  silently going stale (the documented Next-14 data-cache gotcha).
- `spotify_recent_tracks` now stores `duration_ms` (schema.sql, idempotent
  alter) so "today: N min" comes from history, not a live page.

Verified: clean production build; hit `/api/spotify/live` on the dev server —
200, live now-playing (real progress/duration), today + recent + top-5 artists
all populated from Supabase, playlist resolved, zero `[Spotify]` error logs.
`duration_ms` already exists in the live DB (minutes computed), so the schema
alter is a no-op there — no migration blocker.

GOTCHAS discovered:
- The micro-cache + sync-throttle are per-warm-instance module singletons:
  they persist in Vercel's serverless runtime but NOT across Next dev
  recompiles, so under `npm run dev` every poll rebuilds/re-syncs (looks like
  the cache is broken — it isn't, in prod). Don't "fix" this in dev.
- Idle "recent playlist" now shows only while actively playing from a playlist
  (the read path no longer fetches a recently-played page, which was the old
  idle source). Minor; the line just hides when idle.
- Spotify's recently-played excludes the now-playing track and only logs a play
  once it's ~finished, so DB-sourced "today"/recent lag real time by up to a
  sync interval — the on-visit throttled sync closes that gap.

NEXT (optional): a Vercel CDN `s-maxage` on the live route would collapse
visitor bursts globally (shared, not per-instance) for an even smaller upstream
call count; deferred to preserve the documented "always fresh" contract.

### 2026-06-11 — LAUNCHED: the-desk merged to main

Jason: "take them all, and combine them all, then merge to main. this is
launchable (barely)." Combined the five open PRs from his parallel
sessions into the-desk, then merged the-desk -> main:

- PR #1 Vercel Web Analytics: conflicts in layout.tsx (kept Analytics,
  kept our removal of the broken @mdxeditor css import that the PR
  inherited from main), package.json (union), lockfile regenerated.
- PR #2 pause hidden Spotify polling (legacy ribbon) — clean.
- PR #3 pause hidden Duolingo polling — clean.
- PR #4 optimize public post reads (homepage uses
  fetchLatestPublishedPost; DeskHero untouched) — clean.
- PR #5 scoped travel warmup queries: CODEBASE_GUIDE conflicts resolved
  by combining both sides; kept the TRUE cron cadence (daily 12:30 UTC
  per vercel.json — the PR's "hourly" line was stale).

Verified on the combined tree before merging: tsc clean, clean
production build (homepage 123 kB, chess routes present), preview smoke
(scene renders, HUD live, both ribbons, latest-writing card, chess API
serving the real game — the world's 1. d4 stands, Jason to move).

main now carries The Desk. The the-desk branch remains for development;
future work should keep merging to main once verified.

### 2026-06-11 (late night) — Mesh-merge pass SHIPPED (the audit's task chips)

The four mechanical draw-call wins deferred from the perf audit, one
commit each. Every merged batch is paid TWICE per frame (the desk
reflector re-renders the scene), so each mesh removed is two draws:
- Room floor: ~111 planks (own geometry + clearcoat Physical material
  each) -> 5 meshes batched by grain canvas. Tint baked into vertex
  colors (setHSL writes working-space components, so vertex color ==
  the old material.color exactly); transforms baked into geometry;
  materials now Standard — the clearcoat was "old varnish, mostly worn
  matte" and never read. GOTCHA: the retired material's three rng draws
  are kept as sacrificial calls so the lay stays identical — remove
  them and the whole floor re-lays.
- MacBook: 78 key caps -> 3 meshes grouped by finish. Jitter baked at
  build time; legends were already on the overlay plane.
- RecordCrate: 48 screws + 16 rivets + 16 bracket plates -> 3
  InstancedMeshes (transforms were already precomputed). Plates moved
  from drei RoundedBox to three-stdlib RoundedBoxGeometry (same dims/
  radius) to be instanceable.
- Chessboard: rook merlons, queen pearls + orb, king cross, knight
  head + mane merged into the per-kind body geometry — a piece is now
  felt + body (bishop keeps its grooveMat ring). GOTCHA: lathes are
  indexed, extrudes aren't — everything passes through toNonIndexed()
  before mergeBufferGeometries or the merge returns null. Animation
  system, exports, FEN roster untouched. Second commit: lathe diet,
  64 -> 40 segments, ~28 profile samples (pieces are ~3cm on screen).

Net: ~320 fewer meshes in the main pass (~640 fewer draws/frame with
the reflector). Verified by screenshot QA on cold loads: rest + work +
chess + records focus in light, rest + chess in dark — keys, legends,
piece silhouettes, crate hardware, leak direction all read identically.
Build green (homepage 123 kB). tsc clean after every commit.

Still deferred from the audit: raycast hit-proxies or BVH (CAUTION:
drei Bvh may clobber raycast={() => null} — hand-test the beam), texture
right-sizing (~45 MB), sticker-hover extraction, RecordsPanel prewarm.

### 2026-06-11 (night) — Leak direction fix + performance pass SHIPPED

Jason: the screen leak "is going backwards from the computer", and focus
clicks took ~2 s to settle — "look for optimizations… I am interested in
loading things upfront if possible."

LEAK: the pointLight lived inside the LID group; the closed-lid rotation
buried it behind the machine, washing the WALL. Moved to the base frame at
the wedge mouth (hinge is +z, the ajar gap opens -z toward the viewer);
falloff 0.6 m. Verified: cool pool now spills frontward onto the lacquer.

PERF (Ultracode: 2 read-only auditors -> ranked findings; full reports in
the session transcript). Implemented this round, in commit order:
- .desk-panel backdrop blur(18px) removed (bg alpha 0.93) — it blurred the
  animating canvas every frame, mounting exactly at the focus click.
- Shadow maps FROZEN (lib/three/shadow-dirty.ts + FrozenShadows in
  DeskScene): the still life re-rendered ~450 casters x 2 lights every
  frame. Movers wake the maps: chess glides, MacBook lid, tonearm. NOTE
  for future movers: call markShadowsDirty() while animating geometry
  (light-intensity changes don't need it — maps store caster depth only).
- EffectComposer hoisted to a stable element identity (its children dep
  re-built every pass on every render — synchronously at click time, and
  leaked the removed passes). Dynamics flow through refs in useFrame.
- DepthOfField resolutionScale 0.5 (this postprocessing build defaults the
  7-pass bokeh chain to FULL resolution; the docstring claims 0.5).
- N8AO quality medium (halfRes upsample eats the difference).
- Reflector FBO 1024 -> 640, blur kernel scaled (the mirror re-renders the
  whole scene; it's roughness-blurred everywhere, 640 reads identical).
- renderer.compileAsync behind the load curtain (every shader exists
  before reveal) — "upfront" per Jason's preference.
- AdaptiveDpr + performance.regress during camera flights (resolution sags
  to 55% mid-dolly, lands sharp); flights 1.25 -> 1.05 s; PCSS 16 -> 10.
- React: the 8 procedural objects render through React.memo with
  identity-stable props from DeskHero (useCallback needle focus, useMemo
  chessLastMove); ChessPanel now RECEIVES DeskHero's useChessGame result
  (it ran a duplicate poller and cold-fetched on open — "Setting up the
  board…" is gone, panel opens warm); both polling hooks bail out of
  setState when value-equal.

DEFERRED to task chips (audit findings, mechanical): floor-plank merge
(111 draws -> 5), MacBook key merge (78 -> 3), crate hardware instancing
(80 -> 3), chess decoration merge + lathe decimation, raycast hit-proxies
or BVH (CAUTION: drei Bvh may overwrite raycast={() => null} overrides —
the beam would steal lamp clicks; hand-test), texture right-sizing
(chess/groove/notepad, ~45 MB), sticker-hover extraction, RecordsPanel
album prewarm. Directional-light castShadow removal was considered and
NOT taken (loses live wall shadows; frozen maps already killed its
per-frame cost — only the PCSS tap cost remains).

LIVE GAME NOTE: a real visitor played 1. d4 (~an hour before this entry)
and someone left a guestbook note ("hi — anonymous"). Both left untouched
— it's Jason's move, from /admin.

Build green (homepage 123 kB). Hand-checks for Jason: the felt of the
click on real hardware (flight + warm panel should now feel immediate),
chess-glide shadows track (frozen-map wake path), leak direction at night.

### 2026-06-11 (evening) — Edgeless light + elevation pass SHIPPED

Jason's feedback on the beauty pass: loved it overall and the motes, BUT
(1) "the boundaries of the light look linear… a clear delineation of where
the light is and isn't. looks very 2d", (2) the actual ask had been to bring
the desk/computer/notepad/bookshelf up to the record player's level, and
(3) a translucent border ringed the desk top.

FIXES (mine):
- LampBeam rebuilt with NO surfaces: an oversized bounding cone whose
  fragment shader computes the view-ray/beam-axis closest approach and
  shades a gaussian density around it (chord-length boost for down-cone
  rays, axial envelope, 3D noise at the lit point). An edge cannot exist
  by construction — shading a cone SHELL always yields a silhouette edge,
  which was the 2D look. Knobs: BEAM_INTENSITY 1.0, BEAM_FALLOFF 1.8.
  FrontSide + closed caps matter (see comments in file). Motes unchanged.
- Lamp pool rim melted: spot penumbra 0.55 → 0.85.
- Desk border: reflector film was inset 4 mm (brighter base lacquer rim
  showed) AND the baked-shadow catcher overhung the desk. Film is now a
  full-coverage rounded-rect ShapeGeometry (UVs renormalized from shape
  space); catcher clipped to exactly 1.9 x 0.85.

ELEVATION (Ultracode: 4 artisans -> 4 adversarial verifiers, all passed):
- MacBook: bead-blasted space gray (env 2.0/2.2 — outside the pool the env
  map IS its key light), satin roughness, anodize clearcoat, polished
  chamfer hairline + base band + port countersinks (real depth steps).
  Pose machine / leak / sticker chip byte-identical (verifier-diffed).
- Notepad: registered deboss height field (tooth, rules, handwriting
  pressed in), warm paper sheen, foxed page block, drawn-nickel coil
  (anisotropic, 16-seg), pen with plinth-grade lacquer + chrome + brass.
- Bookshelf: linen/matte/gloss finishes seeded per book, TRUE foil spine
  type (second canvas pass as linear rough/metal map, same glyph coords),
  page striations, leaner at 7.5-9.5°, env-dead back panel. Titles locked.
- Desk wood: rebuilt sheen map drives the reflector's per-texel blur
  (polish pools open sharp reflection windows, forearm tracks kill them),
  hotter ribbon chatoyance, pore shoulders, waxed seams, end-grain
  veneers, lacquered legs. Reflector block verified byte-identical.

VERIFIED by screenshot QA on fresh cold loads: rest both themes, notes /
work / reading focus views. Night: the leak now rims foil + chessmen +
coil. Build green (homepage 123 kB). A real guestbook note exists ("hi —
anonymous") — left in place.

Taste notes for Jason: the desk shows a large darker patina patch
front-center (from the grain's seeded patches array, amplified by the
contrast lift) — reads as wear up close, slightly bold at rest; the knobs
are the patches alpha in Desk.tsx if it bothers you. Beam presence is
BEAM_INTENSITY (1.0) if you want more/less air in the light.

### 2026-06-11 (later) — Beauty pass + Stage 3 chess SHIPPED

Jason's directive: "not quite artsy enough… I'm okay with a 5- or 10-second
loading if we can make this really just wow, beautiful. Remember, this is
your art." Two Ultracode fan-outs (4 artisan agents each) + integration.

THE BEAUTY PASS (light is the subject):
- LampBeam.tsx: volumetric cone (two additive shells, view-space fresnel
  melts the wall — no silhouette), 150 vertex-shader dust motes, all scaled
  by lampGlowRef (= theme mix × filament warm-up envelope exported from
  DeskLamp) so the beam stumbles alight with the bulb. Dark mode pays zero.
- DeskLamp: warm-up envelope on every off→on strike (two catches, stutter,
  rise with settle-shimmer over ~1.2 s). Spot eased 5.8 → 5.4 (label bloomed
  white with the new specular energy).
- Desk.tsx: the top is a real MeshReflectorMaterial film 0.4 mm above the
  slab (UNDER the baked-shadow plane at 0.8 mm), wearing recomposed copies
  of the slab's own canvas maps. mixStrength is animated per-frame between
  0.7 (lit) and 1.35 (dark). All knobs exported as consts.
- Effects.tsx replaces the inline composer: N8AO (aoRadius 0.07 m,
  intensity lamp-damped 2.6→1.6) → SMAA → DoF → Bloom → Noise 0.03 →
  Vignette. DoF's focal point is a hand-damped world vector; its camera
  distance feeds cocMaterial.worldFocusDistance directly. DO NOT use the
  DepthOfField `target` prop — it silently kills the whole composer output
  in this postprocessing version.
- Turntable vinyl: MeshPhysicalMaterial anisotropy with a per-texel RADIAL
  direction map (verified three r169's rg/b decode in node_modules before
  encoding) — the classic light blade sweeps the grooves; platter/rim get
  uniform 90° anisotropy; label stays matte paper.
- Entrance: bake raised to 220 frames / 2048 res; canvas waits invisible
  over the shimmer until frame 3 then fades in 1.15 s while the lamp plays
  its warm-up. MacBook night leak rebalanced (ajar 0.185 rad, screen blade
  2.0, glow 1.25 cd → washes the wall, rims bookshelf + chessmen).

STAGE 3 — world vs. Jason chess, full stack:
- DB: chess_games applied live via pooler psql; game 1 seeded, world = white.
- lib/chess/server.ts + GET /api/chess/game, POST /api/chess/move (turn
  check, chess.js legality, ply optimistic lock, same-IP 60 s cooldown,
  desk-voice errors), POST /api/chess/admin (cookie session +
  profiles.is_editor, then service role; move / new_game with color flip).
- Chessboard.tsx renders live FEN: persistent 32-actor roster, carried-piece
  arcs (12 mm lift), graveyard rows outside both flanks (±0.218 m — chess
  focus view frames them), coral last-move inlay glow, hand-rolled FEN
  parser (no chess.js in the 3D bundle).
- lib/useChessGame.ts (30 s poll, visibility-aware) + ChessBoard2D (custom
  SVG piece set, legal-move dots, promotion picker, every square a labeled
  button) + ChessPanel (status voice, move list) + ChessAdmin in /admin.
- Focus wiring: FocusId "chess", FOCUS_VIEWS.chess, /?focus=chess deep link.

VERIFIED: API end-to-end with curl (illegal → 400, legal e4 → 200 + correct
FEN/SAN/lastMove, wrong-turn → 403, unauth admin → 401); full visitor path
through the real panel UI (click e2 → dot → e4 → optimistic update →
"Jason is thinking…" → row in Supabase); 3D board built a seeded Italian
position (castling = two pieces moved correctly) on cold load; both themes
screenshot-QA'd at the new fidelity. Game RESET to a clean board after
testing — the world's real game 1 starts fresh. Build green (homepage
first-load 123 kB, scene chunk lazy).

BUGS FOUND AND FIXED (gotchas — also added to CLAUDE.md):
1. Next 14 data-caches supabase-js GET fetches inside route handlers EVEN
   with `dynamic = "force-dynamic"` — /api/chess/game served the stale
   pre-move position forever (responses in 3 ms; real round trip 50 ms+).
   Fix: create service clients with global fetch pinned to
   `cache: "no-store"`. Applied to chess + desk-notes; lib/spotify.ts
   flagged as a follow-up task chip.
2. A long-lived dev server (one that survived ~150 agent edits) served a
   STALE WEBPACK CHUNK on cold loads ("ReferenceError: EffectComposer is
   not defined" in the dev overlay's stack-frame requests) while every HMR
   apply worked — this mimicked a code bug perfectly and cost a long
   bisect. Cure: stop dev, rm -rf .next, restart.
3. Preview-tool rAF is throttled when the page is backgrounded — fps can't
   be measured there. Perf additions are budget-conscious (half-res N8AO,
   1024 reflector, GPU-only motes) but NEED JASON'S EYEBALL on real
   hardware.

STILL NEEDS JASON'S HAND-CHECK:
- /admin chess with his signed-in session (play a reply, try new-game; only
  the 401 path was verifiable without his cookies).
- In-canvas clicks (lamp toggle, object focus including the chessboard,
  sticker chip) — R3F raycast limitation as before.
- Real speakers (synthesized needle audio) and real-hardware fps/loading
  feel (the bake freeze should hide entirely behind the curtain-rise).
- The beauty-pass grade overall — every knob is an exported const
  (LampBeam BEAM_*, Desk REFLECTOR_*, Effects AO_*/DOF_*/GRAIN_*).

Deferred/nice-to-have spotted during the work: dynamic-import ChessPanel to
keep chess.js out of the homepage first load (123 kB is still fine);
shared relativeTime util (ChessPanel and ChessAdmin carry local copies).

### 2026-06-11 — Stage 1.5 + Stage 2 SHIPPED — pushed to origin/the-desk

Branch strategy per Jason: `main` stays the live regular site; The Desk
develops on `origin/the-desk` (Vercel auto-builds a preview deployment for it).
Local worktree branch tracks origin/the-desk. Merge to main only when Jason
calls it ready.

(~146 commits total at push time.)

Everything below this entry's plan landed. Final state:

- 9 artisan rebuilds committed individually (mahogany desk, plank/plaster room,
  full Forså with continuous-wire spring, 78-key MacBook, hardcover books incl.
  On the Edge displayed flat, Staunton chess (extruded knight heads; frame grew to
  0.3232m — clearance checked), refined turntable, curled notepad, weathered crate).
- MacBook pose system: rests CLOSED (stickers up), AJAR ~10° in dark mode (screen-
  light leak, leak curve x10), opens ~110° on work focus; orientation yaw 2.89 so
  the open screen faces the camera; sticker hover/click shows the anchored
  Made-with-Claude chip (drei Html + .desk-credit-anchored).
- Focus system: CameraDirector flights, 4 panels wired (records w/ live needle
  state + heavy-rotation wall, work digest, reading, guestbook), ESC/back returns,
  /?focus=records|work|reading|notes deep links.
- Real album art: vinyl label disc + crate sleeve fronts load via /api/image-proxy
  (procedural placeholders until arrival). /api/spotify/albums aggregates history.
- Guestbook verified END-TO-END through the real UI (posted + read + deleted via
  psql; table left empty). Records/work/reading panels verified via deep links
  with REAL data (Vulcan/Northwestern digest, real covers, live white-noise track).
- Lighting tuned: lamp spot 5.8, themed ACES exposure 0.72-1.12.
- Production build green: homepage first-load 107 kB, scene chunk lazy.

STILL NEEDS JASON'S HAND-CHECK: in-canvas clicks (lamp toggle, object focus,
sticker chip) — R3F raycasts can't be driven synthetically; the HUD/panel paths
that share the same handlers all work. And speakers for the synthesized audio.

Deferred (see PLAN): notes admin UI, notes inked onto the 3D pad texture,
Stage 3 chess, Stage 4 list. Preview-tool quirk reminder: viewport emulation
breaks after page reloads — reset preset desktop → custom size, avoid reloads.

### 2026-06-10 (later still) — Stage 1.5 fidelity pass + Stage 2 (original plan)

Jason's verbatim mandate, recorded for compaction safety: Stage 1 reads nice but not
lifelike enough except the turntable. Make EVERY object "borderline lifelike" — his
philosophy: no variable input, just fixed views, so precompute/spend freely like a
film render. Specific calls: desk is "four rectangular legs and a rectangle" → wants
deep mahogany; lamp needs more detail + springs; books deeper; computer much deeper;
chess set "looks like it was made in Roblox" → real profiles. Camera: a little more
top-down, "at least a 45-degree angle looking down, maybe a little more". Add a
"Made with Claude" mark in a corner (he will cite Claude). Keep commit count for the
fidelity pass modest, THEN implement Stage 2 fully. Attitude: "Create a piece of
genuine artwork that you can be proud of."

PROGRESS CHECKPOINT (mid-session, for compaction recovery):

DONE + COMMITTED: filmic pipeline (ACES + themed exposure, PCSS SoftShadows,
AccumulativeShadows 120-frame bake on desk top wrapped in a z-scaled group because
drei types scale as number, Lightformer environment, SMAA+Bloom(threshold 1)+
Vignette composer — verified in both themes, looks dramatically better); camera at
~45° both rigs; lacquer material helpers; "Made with Claude" credit chip;
CameraDirector focus-flight system (FOCUS_VIEWS in layout.ts: records/work/
reading/notes; clicking turntable/macbook/bookshelf/notepad flies to a fixed
close-up + DeskPanel glass shell slides in; ESC or back returns; orbit only at
rest); desk_notes table CREATED IN SUPABASE (additive, RLS no public policies);
panel content CSS primitives (.desk-panel-*) in globals.css.

IN FLIGHT (two background workflows):
- desk-fidelity-pass (wf_0e6b3c40-e34): 9 artisan agents rewriting IN PLACE with
  unchanged contracts: Desk(mahogany), Room(planks/plaster), DeskLamp(full Forså +
  springs + QA fix: inner dome must not read lit when off), MacBook(3D keys,
  raised sticker decals), Bookshelf+books.ts(hardcovers, page blocks, adds
  review: null — never fabricate reviews), Chessboard(real Staunton lathe
  profiles), Turntable(refine only, keep behavior), Notepad(page curl), Crate.
- desk-stage2-fanout (wf_7d0c92b0-16c): notes-stack (/api/desk-notes GET/POST w/
  sha256 ip rate limit 3/hr + blocklist; NotesPanel), media-routes (/api/spotify/
  albums top-12 from history; /api/image-proxy with scdn/mzstatic allowlist),
  RecordsPanel (props: spotify, phase, canPlay, onToggleNeedle), WorkPanel (digest
  of real experience page, no fabrication), ReadingPanel (BOOKS, review-or-
  "on its way").

NEW DIRECTIVE FROM JASON (mid-flight, supersedes parts of the macbook brief):
1. MacBook rests CLOSED (lid stickers face UP at the 45° camera — fixes the
   "facing backwards" look). Clicking it OPENS the lid (damped hinge to ~110°)
   as part of the work-focus camera flight; closing the panel folds it back.
   Orientation flips ~π so keyboard/screen face the camera when open. Dark mode
   rest pose = lid AJAR ~7° with a thin screen-glow leak (keeps the dark-mode
   soul). Implementation: add { pose: "closed" | "ajar" | "open" } (or open+theme
   internally) prop AFTER the artisan macbook agent lands; damp hinge angle;
   screen emissive scales with openness. Update FOCUS_VIEWS.work to face the
   screen from +z; placement yaw flips.
2. "Made with Claude" corner chip REMOVED (already done). Replacement: hovering/
   clicking any Claude sticker on the lid shows a small anchored chip at the
   sticker (drei <Html> inside MacBook, reusing .desk-credit styles): "Made with
   Claude" + note that the stickers are on Jason's real laptop, linking out.
   Sticker clicks stopPropagation so they don't trigger the work focus.
3. WorkPanel must include GitHub (github.com/Jason-Latz) + resume/projects links.

AFTER WORKFLOWS LAND (my integration, in order): commit each agent file; wire real
panels into DeskHero (replace placeholder; RecordsPanel gets the existing needle
state); hand-wire crate sleeves + vinyl label to real album art via /api/spotify/
albums + /api/image-proxy (small prop additions to RecordCrate/Turntable AFTER
artisan versions land); preview QA both themes + focus flights + guestbook POST;
stop dev server before npm run build; docs + memory closeout.

### Earlier sessions

### 2026-06-10 (later) — Stage 1 COMPLETE on branch

Stage 1 shipped in ~35 granular commits. The homepage is the 3D desk: all seven
objects placed, live Spotify on the platter, full needle-drop audio chain working,
theme-as-lamp crossfade, designed fallback, production build green (homepage
first-load 103 kB; scene chunk lazy).

Verified live in the preview browser:

- Spotify → HUD → iTunes match → stream proxy → playback: end-to-end with the real
  account (matched "Head First — Snazzy", high confidence, ~1 MB proxied stream).
- Needle phases cycle idle → Lowering… → Lift the needle, and the natural 30-second
  end lifts the arm via onEnded.
- Theme bridge in both directions (attribute flip crossfades the whole scene; dark
  mode = lamp off + MacBook screen glow spilling on the desk).
- Mobile (375×812): portrait camera rig frames the turntable cluster; hero capped
  at 62svh; HUD wraps.

NEEDS JASON'S MANUAL CHECK (cannot be driven synthetically): clicking the lamp and
the deck in-canvas (R3F raycasts from offsetX, synthetic events carry zero) — the
HUD button shares the same handler and works, so risk is low. Also: real speakers —
the synthesized thunk/crackle were only verified to schedule without errors.

Fixes that came out of visual QA (committed separately): lamp yaw -0.6 so the beam
lands on the turntable; MacBook turned to 3/4 with lighter aluminum + bigger
stickers; tonearm metal darkened; desktop camera pulled back; portrait rig + aspect
re-ease; mobile hero height cap.

Gotchas discovered (also in CLAUDE.md): dev server vs `next build` share .next and
conflict; preview-tool viewport emulation breaks after page reloads (resize again,
avoid reloads, lean on HMR); iTunes previews arrive as audio/x-m4p but play fine.

### 2026-06-10 — Stage 1 kickoff (branch `claude/goofy-jang-fa9bd0`)

**State: in progress.** Docs landed; three.js stack going in next; object build fan-out
after the scene shell compiles.

What exists so far on this branch: see PLAN.md Stage 1 checkboxes (kept current).

Decisions made this session:

- R3F v8 + drei v9 pinned (React 18 / Next 14 compatibility — fiber v9 needs React 19).
- Procedural modeling only; every object its own file under `components/desk/objects/`.
- Desk coordinate system: meters, desk top surface at y=0, objects base-at-origin;
  placement centralized in `components/desk/layout.ts`.
- Audio is synthesized (no binary assets in repo); previews via iTunes Search because
  Spotify deprecated `preview_url` for API apps as new as this one.
- Lamp semantics per Jason: light mode = lamp ON, dark = lamp OFF/warm dim; lamp click
  toggles global theme via the existing `data-theme` + `site-theme` localStorage system.
- Worktree note: copied `.env` from main checkout (worktrees don't inherit it).

Known issues / gotchas discovered:

- **Pre-existing build break at branch point:** `app/layout.tsx` imported
  `@mdxeditor/editor/style.css` but the dep only exists in the uncommitted editor
  overhaul in Jason's main checkout. RESOLVED on this branch: dropped the vestigial
  import and copied `lib/postTypes.ts` verbatim (two "Unblock build" commits). When
  the editor-overhaul work lands from the main checkout, those two commits are
  superseded — re-check layout.tsx then.

## Architecture snapshot

- Homepage (`app/page.tsx`): `<DeskHero/>` (client, dynamic-imports the Canvas scene,
  WebGL + reduced-motion detection, designed fallback) above the existing HTML sections.
- `components/desk/DeskScene.tsx` — Canvas, camera/orbit clamps, lighting rig, object
  placement, interaction wiring.
- `components/desk/objects/*` — one procedural object per file.
- `lib/three/materials.ts` — shared wood/chrome/plastic/paper materials +
  `makeCanvasTexture` for spines/stickers/labels.
- `components/desk/useSiteTheme.ts` — bridge to `data-theme` (MutationObserver) with
  `toggle()` writing localStorage, used by lamp + lighting.
- `lib/useSpotifyLive.ts` — 45s poller of `/api/spotify/live` (shared shape with the
  legacy ribbon component).
- `lib/audio/turntable-audio.ts` — Web Audio engine (needle thunk, crackle, preview
  element chain + analyser).
- `app/api/audio/preview/route.ts` — iTunes Search match (cached);
  `app/api/audio/stream/route.ts` — allowlisted same-origin audio proxy.
- `content/books.ts` — bookshelf data (current + favorites shelves).

## Content facts (verified)

- Current shelf: *The Power Law* — Sebastian Mallaby; *On the Edge* — Nate Silver.
- Favorites shelf: *The Wise Man's Fear* — **Patrick Rothfuss** (Jason first said
  Sanderson — corrected, he's aware); *Moonwalking with Einstein* — Joshua Foer.
- Lamp: IKEA Forså, chrome. Laptop: MacBook-Pro-like with 3 Claude sunburst stickers.

## Next steps (whoever picks this up)

1. Finish Stage 1 per PLAN.md checkboxes, committing granularly.
2. After Stage 1 visual QA, ask Jason for screenshots-approval, then push/PR.
3. Stage 2 starts with the records panel (data already in Supabase).
