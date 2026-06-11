# CONTEXT.md — live state of The Desk build

> Update this at the end of every working session. Newest session on top.
> Purpose: if context is lost, a fresh session reads CLAUDE.md → PLAN.md → this file
> and knows exactly where things stand and why.

## Session log

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

- **Pre-existing build break at branch point:** `app/layout.tsx` imports
  `@mdxeditor/editor/style.css` but `@mdxeditor/editor` is not in package.json or the
  lockfile. Resolution this session: TBD (verify with `npm run build`, then either
  remove the import or add the dep — check with Jason if unclear which was intended).

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
