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

## Stage 1 — the room (current)

- [ ] Docs: CLAUDE.md, PLAN.md, CONTEXT.md
- [ ] Three.js stack pinned and configured for Next 14 / React 18
- [ ] Theme bridge hook (`data-theme` ⇄ scene lighting, lamp click toggles)
- [ ] Scene shell: canvas mount, camera + clamped orbit, room + desk, lighting rig
- [ ] Desk objects, each its own file + commit:
  - [ ] Turntable (hero: plinth, platter, grooved vinyl, tonearm, controls)
  - [ ] Forså desk lamp (chrome, articulated, clickable head)
  - [ ] MacBook with three Claude stickers (screen glows in dark mode)
  - [ ] Two-shelf bookcase with real spines (content/books.ts)
  - [ ] Notepad + pen (static; guestbook in Stage 2)
  - [ ] Chessboard with pieces (static; world-vs-Jason in Stage 3)
  - [ ] Record crate with sleeves (static; history-driven sleeves in Stage 2)
- [ ] Live Spotify wiring: vinyl spins at 33⅓ only while `isPlaying`; HUD shows track
- [ ] Audio engine: synthesized needle thunk + crackle bed, preview playback chain
- [ ] `/api/audio/preview` (iTunes match, cached) + `/api/audio/stream` (same-origin proxy)
- [ ] Needle-drop interaction: click → arm swings → thunk → crackle → preview fades in
- [ ] Lamp click toggles site theme; scene lighting crossfades; header toggle stays in sync
- [ ] Fallback: WebGL/reduced-motion detection → designed static hero; HTML content below
- [ ] Performance: DPR clamp, lazy import, pause when hidden; `npm run build` green
- [ ] Visual QA via screenshots in both themes

## Stage 2 — objects come alive

- [ ] Record crate sleeves textured from Supabase listening history (top albums)
- [ ] Click turntable → records panel (recent plays, top artists, crate browsing)
- [ ] Click MacBook → work/experience panel (screen becomes live texture)
- [ ] Click bookshelf → reading panel with Jason's reviews (new `books` table or content file)
- [ ] Notepad guestbook: `desk_notes` table, public insert with rate limit + length cap +
      moderation (profanity filter, admin delete in /admin); notes render on the pad
- [ ] Camera choreography: dolly-in per object, breadcrumb to return
- [ ] Album-art label texture on the spinning vinyl (proxied for CORS)

## Stage 3 — chess: the world vs. Jason

- [ ] `chess_game` schema: single game row, move list, optimistic concurrency
- [ ] chess.js legality on server route; visitors move only on world's turn
- [ ] 3D pieces move on the desk board; last-move annotation ("world played Nf6, 3h ago")
- [ ] Jason moves via /admin (or signed-in editor session on the site)
- [ ] Game-over handling: archive result, start fresh game

## Stage 4 — polish and beyond

- [ ] Spotify Web Playback SDK: full tracks when Jason is signed in (Premium)
- [ ] Postprocessing pass (bloom on lamp/screen, vignette) behind a perf tier check
- [ ] Static poster render of the scene for the fallback hero + social OG image
- [ ] Mobile tuning pass (touch orbit, portrait framing, perf tiers)
- [ ] Inner pages typography refresh to match the desk's palette
- [ ] Easter eggs (dust motes in lamp cone, mug steam, seasonal touches)

## Performance budget

- ≤ ~300k triangles, all textures canvas-generated or ≤1k, no runtime HDR/GLB downloads
- 60 fps target on Apple Silicon / recent integrated GPUs; DPR ≤ 1.75
- Lazy-load the scene chunk; homepage HTML must not block on three.js
