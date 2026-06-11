# CLAUDE.md

Personal website of Jason Latz — Next.js 14 (App Router) + Supabase + plain CSS, deployed on Vercel.

**Active project: "The Desk"** — rebuilding the homepage as a warm, hyper-detailed Three.js
desk scene where every object is a doorway into part of the site. Before doing any work,
read `docs/PLAN.md` (staged roadmap) and `docs/CONTEXT.md` (live state of the build).
`CODEBASE_GUIDE.md` covers the pre-existing site (Supabase model, admin, Spotify pipeline).

## Commands

- `npm run dev` — dev server (use `-- --port 3100` if 3000 is taken)
- `npm run build` — production build; run this before declaring any work session done
- `npm run lint` — Next lint
- `npm run spotify:token` — one-time Spotify refresh-token bootstrap

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

- Worktrees don't inherit `.env` — copy it from the main checkout
  (`cp ../../..../website/.env .env`).
- Supabase direct DB host resolves IPv6-only here; use the pooler DSNs
  (CODEBASE_GUIDE.md §12.2).
- `app/layout.tsx` imported `@mdxeditor/editor/style.css` without the dependency existing
  (pre-existing break at branch point; see docs/CONTEXT.md).
- Spotify "today" stats are approximate (last-50-plays window).
