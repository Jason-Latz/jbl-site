# CLAUDE.md

Personal website of Jason Latz — Next.js 14 (App Router) + Supabase + plain CSS, deployed on Vercel.

**Active project: "The Desk"** — rebuilding the homepage as a warm, hyper-detailed Three.js
desk scene where every object is a doorway into part of the site. Before doing any work,
read `docs/PLAN.md` (staged roadmap) and `docs/CONTEXT.md` (live state of the build).
**`docs/BAKING.md` is the runbook for the lightmap bake (the current next milestone) —
start there to run the bake.** `CODEBASE_GUIDE.md` covers the pre-existing site (Supabase
model, admin, Spotify pipeline).

## Commands

- `npm run dev` — dev server (use `-- --port 3100` if 3000 is taken)
- `npm run build` — production build; run this before declaring any work session done
- `npm run lint` — Next lint
- `npm run spotify:token` — one-time Spotify refresh-token bootstrap
- Bake pipeline (Stage 5, dev only): visit `/bake?room=<void|window>&theme=<light|dark>`
  on the dev server to export `bake/desk-<room>-<theme>.glb`, then render via
  `/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/bake/render_ab.py --
  --glb <glb> --room <room> --theme <theme> --out bake/renders`
  (Blender 5.1.2 via brew cask, pinned; headless only — it's a kiln, not a studio)

## Standing rules (Jason's stated preferences — keep this section current)

1. **Granular commits.** One logical thing per commit — a single object, a single behavior,
   a single fix. Imperative subject line, body explaining the why when non-obvious. Jason
   wants the commit history to read as a map of the project ("where everything is").
   Never batch unrelated changes.
2. **Docs stay live.** At the end of every working session update `docs/CONTEXT.md`
   (what changed, what's next, gotchas discovered). Tick off `docs/PLAN.md` items as they
   land. Update this CLAUDE.md whenever Jason states a new preference or a convention
   changes — that instruction itself is one of his preferences.
3. **Every object is personal.** Desk objects are procedurally modeled in code (no
   downloaded GLB assets), each in its own file, each detailed individually. Quality over
   speed; this is a showpiece.
4. **Content correctness.** Verify titles/authors/facts before rendering them
   (e.g. *The Wise Man's Fear* is by Patrick Rothfuss — Jason initially misattributed it;
   *The Power Law* is Sebastian Mallaby; *Moonwalking with Einstein* is Joshua Foer).
5. **The desk is the front door, not the house.** Real routes (`/writings`, `/travel`,
   `/experience`) remain ordinary server-rendered pages. Clicking a desk object opens
   crisp HTML panels / navigates to real routes. Never bury content inside WebGL.
6. **Graceful degradation is non-negotiable.** No-WebGL, reduced-motion, and weak devices
   get a designed fallback (not an apology). Content below the canvas stays real HTML.

## Design pillars

- Palette: warm paper / near-black stage (see mockups in session history). Scene tones:
  wood `#6b4a2f`-ish, cream `#f6f2e9`, accent coral `#c75833`, Spotify green only for live dots.
- **Theme = the lamp.** Light mode: IKEA Forså lamp ON (bright, warm desk). Dark mode:
  lamp OFF, very warm dim room (embers feel, laptop screen glows). Clicking the lamp
  toggles the site-wide theme; the header ThemeToggle stays in sync. Theme mechanism:
  `data-theme` attribute on `<html>` + localStorage key `site-theme`.
- Audio: needle-drop thunk + vinyl crackle are synthesized in Web Audio (no binary
  assets). Track audio = 30s previews matched via iTunes Search API (Spotify removed
  preview URLs for new API apps), streamed through a same-origin proxy so the analyser
  can read it. Audio only starts on user gesture (the needle click).

## 3D stack and conventions

- Pinned for React 18 / Next 14: `three@0.169`, `@react-three/fiber@^8.17`,
  `@react-three/drei@^9.114`. Do NOT bump fiber to v9 / drei to v10 (they need React 19).
- Scene code lives in `components/desk/`; one object per file in `components/desk/objects/`.
- Units are meters. The desk **top surface is y=0**; objects sit with their base at y=0
  and are centered at their own origin — `DeskScene` positions them via `layout.ts`.
- Materials come from `lib/three/materials.ts`; canvas-drawn textures via its
  `makeCanvasTexture` helper. Memoize geometry/materials with `useMemo`.
- Lighting: `RoomEnvironment` for IBL (no network HDR fetch), one warm spot from the lamp
  head, low warm ambient in dark mode. DPR clamped to ≤1.75.

## Gotchas

- **Never run `npm run build` while the dev server is running** — they share `.next`
  and the build fails with phantom `PageNotFoundError`s. Stop dev, `rm -rf .next`, build.
- Worktrees don't inherit `.env` — copy it from the main checkout
  (`cp ../../..../website/.env .env`).
- R3F pointer handlers raycast from `offsetX/offsetY`, which synthetic PointerEvents
  can't carry — in-canvas clicks can't be tested via JS dispatch; test by hand.
- iTunes preview files may come back `audio/x-m4p`; Chrome sniffs the container and
  plays them fine through the stream proxy.
- Supabase direct DB host resolves IPv6-only here; use the pooler DSNs
  (CODEBASE_GUIDE.md §12.2).
- **Next 14 data-caches supabase-js GET fetches in route handlers even with
  `dynamic = "force-dynamic"`** — reads go stale forever (responses in ~3 ms instead
  of a 50 ms+ round trip is the tell). Create service clients with
  `global: { fetch: (i, init) => fetch(i, { ...init, cache: "no-store" }) }`.
- A long-lived dev server can serve a **stale webpack chunk on cold loads** (runtime
  ReferenceError for a valid import) while HMR applies work fine — looks exactly like
  a code bug. Stop dev, `rm -rf .next`, restart.
- The DepthOfField `target` prop (postprocessing 6.36) silently kills ALL composer
  output. Damp a world-space focal point and write `cocMaterial.worldFocusDistance`
  instead. (DoF itself was deleted in the Stage 5 de-jank — only matters if it returns.)
- GLTFExporter serializes three.js lights as KHR punctual lights — the kiln's render
  script must delete them after import or the Cycles rig double-lights the scene.
- An emissive backdrop authored as `emissive + emissiveMap` with a BLACK base color
  exports its image to the glTF emissive slot but a black base-color factor. In Blender
  the bake script must rebuild it with `make_pure_emission` (clean Emission shader from
  the raw image) — the older `make_emissive` (base-color → emission) emits pure black.
- zsh does NOT word-split unquoted variables (`set -- $combo` stays one word) —
  write explicit commands or use `${=var}` in loops.
- `app/layout.tsx` imported `@mdxeditor/editor/style.css` without the dependency existing
  (pre-existing break at branch point; see docs/CONTEXT.md).
- Spotify: the live route makes ONE upstream call (now-playing); "today" / recent /
  top-artists are read from the `spotify_recent_tracks` store, and the history sync is
  throttled OFF the read path (`maybeSyncHistory`, ≤1 per 3 min). Never reintroduce the
  per-poll sync — that was the rate-limit "maxing out" (docs/CONTEXT.md 2026-06-13).
  Stats stay approximate (windowed; recently-played lags real time).
- The Spotify micro-cache + sync-throttle are per-warm-instance module singletons —
  they work in Vercel's serverless runtime but reset across Next dev recompiles, so under
  `npm run dev` every poll rebuilds/re-syncs. Looks broken in dev; correct in prod.
