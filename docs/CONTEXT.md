# CONTEXT.md — live state of The Desk build

> Update this at the end of every working session. Newest session on top.
> Purpose: if context is lost, a fresh session reads CLAUDE.md → PLAN.md → this file
> and knows exactly where things stand and why.

## Current state (2026-06-17)

**The preliminary site is LAUNCHED.** `/` is the baked 3D desk, live on
**www.jasonlatz.com** (`?baked=0` falls back to the live procedural `DeskScene`).
The baked assets (meshopt GLB + 8-bit WebP lightmaps, ~31MB) are CDN-hosted on
public **Supabase Storage** (`bake/v1/`). Stages 1–5 shipped.

**The homepage is now mobile-immersive on both scenes:** the 3D fills the
viewport (`100svh`) and the site nav floats over it as a theme-aware glass bar
(scoped to the homepage via `:has()`), with the portrait camera reframed (fov in
the rig) to fill a tall phone screen. See the 2026-06-17 session entry. The
**2026-07-16 mobile UX pass** reframed the WHOLE desk in portrait (fov 66, both
scenes), slimmed the mobile nav (~10%) + HUD, and added touch-only guided tap
affordances (`DeskAffordances.tsx`) + a first-visit drag hint (`DragHint.tsx`),
gated by `useCoarsePointer`.

**Next up — Stage 4 polish** (see `docs/PLAN.md`): social OG image; Spotify Web
orbit + perf tiers; inner-page typography to match the desk palette; Spotify Web
Playback SDK (full tracks when Jason's signed in); `/music` + `/photography`
splits; window parallax; easter eggs; plus the deferred `/admin` moderation UI
for `desk_notes`.

## Session log

### 2026-07-16 — Overnight run: poster-first load, 78% slimmer GLB, Reading Room inner pages

The /overnight run (branch `claude/website-perf-mobile-9ea10e`, ~28 commits, all
pair-programmed and adversarially reviewed). Baseline prod Lighthouse mobile on `/`
was **25** (FCP 11.8s, LCP 165.7s: the 29.3MB GLB behind an opaque curtain).

- **Poster-first progressive load.** The homepage SSR-paints a theme-keyed poster
  instantly (`.desk-hero-poster`, preloaded from the theme-init script with an
  orientation-aware pick); the 3D cross-fades in only when PRESENTABLE (GLB parsed
  + the ACTIVE theme's 13 lightmaps decoded + compileAsync + 3 frames, 8s backstop
  anchored at parse, not mount). The old full-viewport Preloader curtain (glyph +
  spinner verbs) is deleted (-574 lines); a small "setting the desk" whisper sits
  over the poster. Off-theme lightmaps defer to idle (rIC with setTimeout fallback)
  and swap into custom `lightMapOn/Off` uniforms (1x1 placeholder until then); a
  mid-load lamp flip re-prioritizes and the reveal gate re-derives the visible set
  per check. Hidden canvas is pointer-events:none until reveal. `/` first-load JS
  124kB.
- **GLB 29.33MB → 6.36MB (78%).** The GLB's bytes were ~80% embedded PNG textures;
  recompressed to WebP q82 (gltf-transform; EXT_texture_webp decodes natively in
  three-stdlib). Geometry/material names/userData tags/TEXCOORD_1 byte-identical,
  verified with the production loader class; A/B'd both themes in-browser. Served
  additively as `bake/v1/desk-window-uv1-slim82.glb` (original = rollback). Runbook
  + the meshoptimizer-0.18.1-pin warning in docs/BAKING.md §9. GOTCHA: meshoptimizer
  1.x output silently HANGS three@0.169's decoder.
- **"Reading Room" inner-page design system** (10 commits, from a 3-proposal judged
  design workflow; spec's soul: "the printed matter lying on the desk; neutral by
  default, coral once"). Tokens (radius/space/type/elevation/edge+tint coral), the
  eyebrow/page-header/card primitives, slim sticky paper header with active-nav
  pills, colophon footer, and per-page rebuilds: /writings ruled TOC, /experience
  CV ledger (data arrays byte-identical), /photography masthead + labeled zoom,
  /travel harmonized, /summer-blog mobile collapse. All pages: no horizontal
  scroll at 390, 44px targets, dark theme complete.
- **Final 3-lens review** (mobile-desk / design-pass / integration): zero HIGHs;
  fixed the MED + LOWs: inner-nav strip now engages ≤840px with a right-edge fade
  cue (641-740px band used to hard-clip tabs against `overflow-x: clip`), HUD
  empty line truncates, `scroll-padding-top` under the sticky header, solid
  background fallback before `color-mix`. Portrait posters re-captured from the
  live scene at the NEW whole-desk framing (canvas screenshot, both themes) so the
  phone cross-fade no longer jumps composition; orientation media query + preload.
- **Ops gotchas (repeat-worthy):** the session usage limit killed both running
  agents mid-run (resumed at 10:34); push-every-green-step made it a non-event.
  A stale `next-server` on a reused port serves OLD builds after `npm start`
  EADDRINUSE — `pkill -f "next start"` does NOT match it (process name is
  `next-server`); kill by `lsof -tiTCP:<port>`. The in-app preview pane freezes
  rAF AND the compositor in unfronted tabs (WebGL never mounts; background-tab
  screenshots are blank cream even with a complete DOM).

### 2026-07-16 — Mobile desk UX: whole-desk framing + touch guidance + tuned chrome

Adversarial pair round (branch `claude/website-perf-mobile-9ea10e`). Jason: "I
want it to look wonderful on mobile … the viewport really obvious so it's not
super zoomed in and easy to move around." Six granular commits, all verified
in-browser at 390x844 / 375x812 (portrait) and 1280x800 (desktop), both themes.

- **Whole-desk portrait framing (both scenes, identical constants).** The old
  portrait rig (fov 58, rest `[0.02,0.98,2.05]`) sat too close/low: window
  dominated, turntable clipped off the left, chess off the right, desk crammed
  at the bottom. Key geometry insight: on a phone's ~0.46 aspect, fitting the
  1.9m-wide desk across the narrow screen axis ALWAYS captures ~3.35m of
  vertical world (desk depth is only 0.85m), so ~2.5m of non-desk space is
  unavoidable — the win is biasing it toward the window (content) not the floor
  (dead space). New rig: **fov 66, rest `[-0.02,1.42,2.42]`, target
  `[-0.05,0.04,-0.05]`, portrait maxDistance 2.2 -> 2.95** (the ~2.8 rest orbit
  radius exceeded the old cap, which clamped the camera inward). Turntable
  through chess now fully in frame with margin; window is a backdrop. Kept
  byte-identical in `DeskScene.tsx` + `BakedDeskScene.tsx` so `?baked=0` matches.
- **Compact mobile glass nav (CSS, homepage `:has()` scope).** Was a chunky
  two-row block (133px/16%) with "Admin" stranded on a second nav line and a
  33px toggle (under the 40px floor). Now one centered row of tab chips
  (0.72rem, fits all six at 375px+, `wrap` so narrower phones drop a row instead
  of scrolling), 40x40 toggle, **~80px total (10%)**.
- **Slim mobile HUD.** Was a ~110px wrapped stack with a 32px needle button.
  Now a single content-sized row (~57px) with a real **44px** "Drop the needle"
  target; also gave `.desk-hud-empty` `white-space:nowrap` (it was collapsing to
  a 48px column and wrapping to four lines inside the flex row).
- **Touch guidance (new, touch-only via `useCoarsePointer`).**
  - `components/desk/DeskAffordances.tsx` — a soft coral breathing dot floats
    over each interactive object (drei `<Html>` at its world position, so the
    tap is a real DOM click that fires the object's action — NOT an in-canvas
    raycast). Appears after `sceneReady`, on coarse-pointer only; the first
    canvas touch fades + unmounts them. `buildAffordanceItems()` keeps both
    scenes identical. Threaded a new `sceneReady` prop from DeskHero.
  - `components/desk/DragHint.tsx` — first-visit "drag to look around" chip above
    the HUD; coarse-only, after reveal, self-dismisses on first drag/tap or ~4s,
    `localStorage` (`desk-drag-hint-seen`) so it shows once per device.
- **Touch orbit — verified, no change.** Azimuth ±0.5 keeps the whole desk on
  screen at both extremes; zoom to portrait maxDistance (2.95) still frames the
  desk; a single drag reaches the limit so rotateSpeed 0.5 is responsive (not
  dead). `touch-action:pan-y` (vertical scroll) untouched.
- Desktop (fine pointer): affordances + hint absent, landscape framing + desktop
  nav unchanged, no horizontal scroll, no console errors (a one-off DragHint
  hooks-order warning was an HMR artifact of a temporary force-touch test edit;
  gone on fresh load). New files: `useCoarsePointer.ts`, `DeskAffordances.tsx`,
  `DragHint.tsx`.

### 2026-07-13 — Lamp pool's hard desk edge fixed at the source (beam s-clamp)

Jason flagged a **hard diagonal line** where the lamp pool meets the desk ("linear
instead of gradient… a clear border"). Root cause: `LampBeam`'s closest-approach
clamp `s = clamp(…, 0, uLen)` — once a view ray's unclamped closest-approach point
runs past the pool's far end, `s` pins at `uLen`, `pAxis` freezes, and the radial
gaussian's slope **breaks** along the line `s_unclamped = uLen`. That C¹ crease
reads as a razor edge at the desk's grazing angle (straight + diagonal because the
tilted beam axis meets the flat desk in a line). **Fix:** clamp to `uLen * 1.6`
instead of `uLen`, so `s`/`pAxis`/`d` track smoothly through the pool end; the
clamp now lands at `sn≈1.6` where the axial envelope has already zeroed the beam,
and the desk mesh occludes any lit air below `y=0`. Pool now melts into the wood.

**Gotcha / don't-repeat:** an earlier attempt (commit history, superseded) faded
radiance by `smoothstep(0, 0.06, vWorld.y)` — the *bounding-cylinder fragment*
height. For the grazing edge rays that mesh front-face sits **high** on the
cylinder, so the fade stayed ≈1 exactly where the crease formed and did nothing.
Fade the **shaded point `pRay`**, not `vWorld`, if you ever need a height fade —
but here relaxing the clamp fixes it at the source, so no fade is needed.

Isolation that nailed it (both runtime lights are separable in the baked scene):
the baked **lightmap** pool is soft; with beam+spot **off** the hard line was gone;
re-enabling **only the beam** brought it back → it's the beam, not the lightmap or
`LampSpotKey`. Verified light + dark, baked + procedural; `npm run build` passes.
(Dev-env note: the in-app preview froze the WebGL rAF loop, so the theme mix never
ramped — each `computer{screenshot}` pumps a frame, which is how the scene was
driven to light mode for QA.)

### 2026-07-13 — Writing-flow overhaul (editor + reading typography)

Reworked the post writing flow end to end (branch
`claude/writing-flow-improvements-bae144`). Four threads:

- **Publish-date bug fixed.** `app/api/posts/[id]/route.ts` (and POST) wrote
  `published_at: published ? now : null` on every save, and autosave fires
  constantly, so editing/opening an old published post bumped its date to now and
  reordered `/writings`. Now both routes go through `lib/publishedAt.ts`
  `resolvePublishedAt(nextPublished, existingPublishedAt, now)`: the date is stamped
  once, the FIRST time a post is published, and never changes after (unpublish then
  republish keeps the original — Jason's stated preference). PATCH now also selects
  `published_at`.
- **Retired the lossy Visual editor.** The old Markdown↔Visual toggle round-tripped
  through a contentEditable region + Turndown on every switch/keystroke, silently
  destroying footnotes (no Turndown footnote handling) and mangling nested lists /
  tables / code. Editor is now **markdown-first** with a **read-only** Preview that
  renders through the same react-markdown + remark-gfm pipeline as the published page
  (WYSIWYG, lossless). `turndown` + `@types/turndown` removed.
- **Writing ergonomics.** New `app/admin/MarkdownEditor.tsx` (extracted from
  `PostEditorPage.tsx`, which keeps auth/load/autosave/metadata) with keyboard
  shortcuts (⌘/Ctrl+B/I/K/S), toggle-aware toolbar, Enter list-continuation
  (auto-increment + empty-item exit), Tab indent/outdent, paste-a-URL-over-a-selection
  linkify, and a live word/reading-time count. Pure logic lives in `lib/editor/*`
  (`markdownCommands.ts`, `text.ts`) and is unit-tested. **Caret gotcha:** restoring
  the selection after a command must happen in a `useLayoutEffect` (a pending-selection
  ref applied after the value commits), NOT a requestAnimationFrame — rAF raced the
  controlled-textarea value commit and dropped the caret to the end.
- **Editorial-serif reading.** `.content` (shared by `/writings/[slug]` and the editor
  preview) now sets body copy in the Newsreader serif at ~1.19rem / 1.75 line-height,
  full `--fg` contrast (was low-contrast `--muted`), ~40rem (~66ch) measure, with tuned
  title/headings/links/blockquote/lists/code/footnotes. Verified light + dark.
- **Also:** removed the over-eager `looksLikeHtml`/`dangerouslySetInnerHTML` branch on
  the reading page — every stored post is Markdown (checked prod: 5 posts, 0 HTML), and
  the heuristic misfired on prose containing `<...>`.
- **Tests/gate:** added `npm test` (`node --test`, zero deps on Node 25; test files
  excluded from tsconfig). 34 tests. Gate is `npm run build` + `npm test` (no eslint
  config exists, so `next lint` is not a usable gate).

### 2026-07-01 — New `/summer-blog` page (unlisted weekly writing tracker)

An **unlisted** page (not in the nav, `robots: noindex, nofollow`) Jason can send to
two friends. A pinned **"Terms of the Contract"** up top; then one auto-generated
slot per week (Mon–Sun, deadline Sunday night), newest on top, each week with three
URL slots ordered **Jason, David, Adrian**. Viewing is open; **editing is gated by a
shared passcode**. Mirrors the `desk_notes` pattern: RLS-locked table, all
reads/writes through a service-role route.

- **Table** `public.summer_blog_entries` (applied to prod via Supabase MCP; also in
  `supabase/schema.sql`): `week_start date`, `author` (`jason|david|adrian`), `url`,
  `title`, timestamps; unique `(week_start, author)`; RLS on, **no public policies**.
- **Route** `app/api/summer-blog/route.ts`: `GET` lists all entries; `POST`
  `{action: "unlock"|"save"|"clear", passcode, weekStart, author, url, title}` —
  constant-time passcode check (`timingSafeEqual`), `save` upserts on
  `(week_start, author)`, `clear` deletes. Service-role client with the no-store
  fetch override (the Next-14 GET-cache gotcha).
- **Helpers** `lib/summerBlog.ts`: `SEASON_START` (`2026-06-29`), `SEASON_TZ`
  (`America/New_York`), `AUTHORS` (array order = display order), library-free
  Mon-anchored week math (`listWeeks`, `currentWeekStart`, `formatWeekRange`,
  `formatDeadline`), `normalizeUrl`/`prettyUrl`.
- **UI** `app/summer-blog/page.tsx` (server shell + Terms + noindex metadata) mounts
  `app/summer-blog/SummerBlog.tsx` (client: fetch on mount, passcode unlock kept in
  `localStorage["summer-blog-key"]` and silently re-verified, per-slot add/edit/clear,
  saves are not optimistic — they wait on the API). Styles: `.summer-blog-*` block
  appended to `globals.css` (warm palette via existing CSS vars → dark mode free).
- **Env — action needed:** `SUMMER_BLOG_PASSCODE` must be set in **Vercel** (prod).
  Local `.env` uses placeholder `summer2026`. Until it's set, unlock/save are
  rejected with 401 (Supabase creds already exist in prod, so the route is
  "configured" — a 503 only happens when Supabase env is missing); viewing still
  works. This is the passcode Jason texts the group; change it in Vercel.
- **Verified:** `npm run build` passes; full browser flow via preview (unlock → add →
  persist across reload from DB → Lock → public view shows links but no edit
  controls), light + dark. A test row was written to prod during verification and
  then deleted — the table ships empty. Today only "This week" exists (season starts
  the week of 2026-06-29); a new empty week appears automatically each Monday.

### 2026-06-24 — Spotify "stale track shown as if current" when playback stops (+ audit of the 06-23 fix)

Symptom: while playing, the now-playing HUD/ribbon is correct; the moment playback
**fully stops** (not pause), it keeps showing an OLD track ("Be Honest (feat. Burna
Boy)", ~20-30 min stale) "the whole time". Ran an adversarial multi-agent audit
(6 investigators → skeptic verifiers → synthesis) that also re-checked the 06-23 fix.

Root cause: all three read surfaces resolved the headline as
`data?.nowPlaying ?? data?.recentTracks?.[0]` (DeskHero.tsx, SpotifyNowPlaying.tsx,
RecordsPanel.tsx). On a full stop, currently-playing returns 204 → `nowPlaying:null`,
so the headline silently fell back to `recentTracks[0]` — the newest row in the
durable store. That store is fed ONLY by Spotify's recently-played, which by
construction NEVER contains the currently/just-played track and lags real time
(observed ~83 min behind). So the fallback is *structurally guaranteed* to be a
stale, different song presented as the headline.

Fix (verified): one shared selector `lib/spotifyLeadTrack.ts` — `nowPlaying` always
wins (so paused tracks still show); the stored play may only stand in as "last
played" if its `playedAt` is within `LEAD_TRACK_FRESHNESS_MS` (10 min); otherwise
the slot honestly shows "Nothing playing right now". Threaded `playedAt` through the
`SpotifyRecentTrack` type + mappers (the column was already SELECTed). No new Spotify
calls — the rate-limit budget is untouched. Also fixed a related drift: the
white-noise filter ran on the live read path + top-artists but NOT on the stored
recent-tracks read or stored today-stats, so "White Noise 3 Hour Long" could headline
as "last played" and add ~180 min to "today"; now filtered on the stored surfaces too.
Verified: 8/8 selector unit cases, `npm run build` clean, dev `/api/spotify/live`
emits `playedAt` + no white-noise, and the live HUD shows "Nothing playing right now"
for a stale 83-min recent vs "last played" for a fresh 3-min one.

**Correcting the 06-23 claim** (audit finding): "the on-visit sync + daily cron keep
it current" was misleading. The store is eventually-consistent on a minutes-to-hours
scale and NEVER reflects the live/just-played track — it can't be a correct now/last
headline (hence this fix). The 06-23 `duration_ms` fix itself WAS correct/necessary
(the read SELECT errored on the missing column → empty list); the sync mechanism does
work when triggered (observed it writing rows this session). What was wrong was using
`recentTracks[0]` as a real-time headline at all.

### 2026-06-23 — Spotify history was empty: a `schema.sql` migration never applied to prod

Symptom: now-playing worked, but "Last 10" showed *"No recent spins on record"*
and the weekly artists showed *"The week is young…"*. The `spotify_recent_tracks`
table was frozen at the launch date (last play 2026-06-16; today 2026-06-23).

Root cause: commit `6c3b442` ("Store track duration in Spotify play history")
added a `duration_ms` field to BOTH the upsert (`mapTracksForStorage`) and the
recent-tracks SELECT (`fetchRecentStoredTracks`) in `lib/spotify.ts`, and added
the column to `supabase/schema.sql` — **but the migration was never run against
the live Supabase DB.** PostgREST then failed every read/write with
`42703 column spotify_recent_tracks.duration_ms does not exist`; both
`fetchRecentStoredTracks` and `syncSpotifyRecentTracks` swallow the error, so the
table silently stopped accepting writes and recent-reads silently returned empty.
Now-playing was unaffected because it's the one read path that never touches
Supabase. This is the **`schema.sql`-not-applied** failure class — `schema.sql`
is declarative; nothing auto-runs it.

Fix (operational, no code change — the code already matched `schema.sql`):
1. Applied the missing column to prod:
   `alter table public.spotify_recent_tracks add column if not exists duration_ms integer;`
2. Backfilled the 50 most recent plays Spotify still exposes (its recently-played
   API only retains ~50 — the 2026-06-16→22 gap is gone upstream, unrecoverable).
3. Verified end-to-end on **live prod** `/api/spotify/live`: recentTracks=10,
   topArtistsThisWeek=4 (white-noise stripped by `toTopArtists`), today=16 plays /
   414.8 min (non-zero minutes ⇒ prod's PostgREST sees `duration_ms`). On-visit
   sync + the daily 12:00-UTC cron keep it fresh going forward.

Drift audit (schema.sql ↔ live DB): `duration_ms` was the only runtime-breaking
drift. The reverse also exists but is harmless at runtime — `posts` has extra
live columns not in `schema.sql` (`content_format`, `scheduled_for`, `tags`,
`social_*`, `preview_token*`) and `post_revisions` isn't in `schema.sql` at all.
`schema.sql` is stale as a source of truth; treat the live DB as authoritative.

### 2026-06-17 — Mobile immersive homepage: full-bleed 3D + floating glass nav

Overnight autonomous run (branch `overnight/mobile-immersive`). Jason: "make
this look cool on mobile… the viewport looks like a square… the top tabs should
be overlaid on the 3d, not separate." Locked up-front: full-screen immersive on
BOTH mobile + desktop; reframe the portrait camera to fill a tall screen.

What landed (granular commits, each verified in the live preview):
- **The "square" had two causes.** (1) cold-load canvas latched R3F's default
  300×150 and got CSS-stretched to the hero box (squished) — added a
  `[120,500,1200]ms` resize nudge on mount to the live `DeskScene`. (2) the hero
  was a contained band (`min(62svh,540px)` on mobile) → a ~390×520 box.
- **Full-bleed immersive hero + floating glass nav.** New CSS block in
  `globals.css` scoped with `:root:has(.desk-hero, .desk-hero-fallback)` so ONLY
  the homepage gets it (inner pages + `:has()`-less browsers keep the solid
  static header — graceful, no JS, no per-route layout). The hero becomes
  `height:100svh` (the existing `margin-top:-3.5rem` lands it at y=0 once the
  header leaves the flow); the `.site-header` becomes `position:fixed`,
  theme-aware **frosted glass**. Desktop = one slim row (title left, tabs+toggle
  right, aligned to the 960px column). Phones = title centered, toggle pinned to
  the corner, tabs as a one-row chip strip (40px tap targets, all 5 fit to 360px).
- **Portrait camera reframed.** fov is now part of BOTH scenes' camera rigs
  (`PORTRAIT_FOV 54`; the landscape fov 40 leaves only ~19° horizontal on a tall
  phone) with the portrait `REST`/`TARGET` heroing the turntable + lamp cluster.
  Applies to `DeskScene` (live, `?baked=0`) AND `BakedDeskScene` (the default).
- **CameraDirector intro-dolly fix (both scenes):** the resize-nudge flips the
  rig (cold-load 300×150 → real), which used to rebuild the flight from scratch
  and abort the 2.3s intro. Now a pure viewport/rig change RETARGETS the live
  flight instead of restarting it.
- **Review fixes:** focus panels above the nav (z 60) + below the bar at ≥641px;
  dropped a `min-height:520` that overflowed landscape; coral focus ring (3:1);
  fallback copy shrinks under `max-height:560px` so it never tucks under the nav.

Verified at 1280×800, 768×1024, 844×390, 390×844, 375×667, 360×740 in both
themes against the BAKED default homepage; nav legible over scene + scrolled
content; focus panel clear of the bar.

GOTCHA (verification): the headless preview tab backgrounds rAF, so the
frame-gated `sceneReady` never fires and the canvas wrapper stays `opacity:0`
over the loading shimmer (documented). To screenshot the real scene, force the
`.desk-hero > div[style*="opacity"]` wrapper to `opacity:1` and dispatch a few
`resize` events. Real device-sized PNGs are captured with Playwright (installed
`--no-save`; `reducedMotion`/`colorScheme` contexts).

### 2026-06-17 — Overnight: travel globe, /photography split, camera wire, chess "your move"

> Concurrent with the mobile-immersive run above (both 2026-06-17); this one is the
> `overnight/desk-stretch` PR. The two integrate cleanly — the camera-wire touched the
> same scene files the mobile run reworked (portrait rigs), and they rebased without code
> conflict.

Autonomous overnight run on branch `overnight/desk-stretch` (off origin/main),
landed as a PR (Jason asked to review before it hits prod — NOT pushed to main).
Four asks, all built + adversarially reviewed:

- **`/travel` is now a 3D globe of places Jason has been.** New `components/travel/
  TravelGlobe.tsx` (+ `TravelGlobeStage.tsx` capability gate) — a warm paper-and-ink
  sphere: equirectangular `CanvasTexture` drawn from embedded Natural Earth land
  (`lib/geo/land.ts`, 110m, ~76 KB), coral markers from `content/places.ts` (curated,
  editable — Arizona/Evanston/Austin/DC/Edinburgh seeded), great-circle arcs, fresnel
  rim, auto-rotate + drag, click → place card → /photography. Lazy-loaded (89.6 kB first
  load, three.js in the lazy chunk), theme-aware, with a designed no-WebGL/reduced-motion
  fallback list (also the crawlable/no-JS content). Marker↔texture longitude alignment
  verified by eye (Edinburgh/UK, US cluster).
- **`/photography` split from `/travel`** into its own gallery page (was a redirect);
  added to `SiteNav`. The photo mosaic lives here now; `/travel` is the globe.
- **Desk camera/prints → `/photography`.** `BakedDeskScene` (prod default) routes the
  `filmCamera`/`photos` object tags via a new `NAV_MAP → router.push`; `DeskScene`'s
  `<Placed>` gained an `href` prop. In-canvas clicks need a hand-check (R3F offsetX/Y).
- **Chess "your move" banner** (`app/admin/ChessTurnBanner.tsx`) pinned to the top of
  /admin, shown only when it's Jason's turn (the board sits below the big editor). The
  existing ChessAdmin reply flow was already wired + editor-auth'd; the engine
  (`lib/chess/server.ts`) was verified 12/12 (legal/illegal, checkmate→mover,
  stalemate→draw, parse, public-shape strip). Signed-in move still needs a hand-check.

Also: **warm-continuity palette retone** — light accent cold navy `#1e2d3d` → terracotta
`#ad4720` (AA-checked), decorative `--coral` token; region labels use AA-safe `--accent`.
A 4-dimension adversarial review of the diff caught 13 findings (all fixed or triaged):
the half-wired DeskScene href, back-hemisphere markers clickable through the opaque globe
(camera-facing test added), 4k→2k globe texture, pre-detection flash, role="dialog"→
`<aside>`, arc degeneracy guard, dead code. Known limitation (parity with the desk scene):
in-canvas globe markers aren't keyboard-reachable; the fallback + sr-only list carry the
content. tsc + `npm run build` green. GOTCHA: the homepage baked scene 404s in a fresh
worktree (slim assets are CDN-only/gitignored) — fine in prod.

### 2026-06-16 — Baked assets slimmed (172→31MB) + hosted on a CDN (Supabase Storage)

The flip to baked (entry below) took production BLANK: the baked homepage's
172MB of assets (66MB GLB + 106MB lightmaps) are gitignored, so they were never
deployed → the GLB 404'd. Reverted at the time (`b0a6020`). This session fixes
the root cause — slim the assets to ~31MB and host them on public Supabase
Storage; the runtime fetches them from there in prod, from disk in dev.

- **GLB 66→28MB** via `scripts/bake/slim_glb.mjs` (gltf-transform dedup +
  prune + meshopt/quantize; three's `MeshoptDecoder` decodes at runtime). `prune`
  MUST run `keepAttributes:true` or it strips the runtime-attached lightmap UVs
  (`TEXCOORD_1`) and breaks ALL baked lighting — `scripts/bake/verify_glb.mjs`
  guards it (counts uv1, asserts geometry round-trips through the codec).
- **Lightmaps 106→3.2MB (32×)** via `scripts/bake/slim_lightmaps.mjs`: 676
  16-bit 1024² PNG → 8-bit 768² WebP q90. Lossless vs. what shipped — the runtime
  already decoded the PNGs to 8-bit through an `<img>`.
- **Host: public Supabase bucket `bake`**, immutable versioned prefix (`v1/`),
  1-year cache, via `scripts/bake/upload_supabase.mjs` (service key from `.env`,
  never logged; creates a NEW bucket only — no table/data writes). Vercel Blob
  was Plan A but the account's Blob is billing-suspended.
- **Runtime** (`BakedDeskScene`) defaults to the Supabase base off-localhost,
  local `/_bake/cdn` on localhost; `NEXT_PUBLIC_BAKE_CDN_URL` overrides.
- **Verified:** meshopt decodes + geometry/uv1 intact (headless); prod build
  green; BOTH themes render from Supabase cross-origin, zero CORS/console
  errors; first paint 172MB → ~31MB. Full runbook in `BAKING.md` §8.
- **Shipped to production.** `/` flipped to the baked scene and merged to `main`
  (`37e8ad0`) — live on **www.jasonlatz.com**; `?baked=0` is the escape hatch to
  the live procedural `DeskScene`. Vercel prod deploy READY; page + Supabase GLB
  both 200 (the prior blank's 404 failure mode is gone).

### 2026-06-16 — Homepage flipped to baked; dark-mode lighting; the BAKED-GLB-LIGHT gotcha

Shipped straight to `main` (now the production homepage).

- **`/` defaults to the baked scene** (DeskHero gate inverted; `?baked=0` still
  loads the live DeskScene as an escape hatch). The baked scene is signed off.
- **Dark-mode moonlight dimmed** a lot (two pair-programming agent teams ran the
  moonlight + laptop reductions in parallel): `MOON_INTENSITY 0.38→0.18`,
  `MoonAmbient 0.26→0.12`, `uOffBoost 1.45→0.85`; motes kept. Laptop dark-mode:
  screen emissive `0.8→0.3`, legend `0.5→0.15`.
- **The "light from the computer" speck — root cause was a BAKED GLB LIGHT.**
  Jason flagged a bright dot on the desk in front of the laptop that NO knob
  moved (team cut glowRef 0.4→0.1, I went 0.1→0.04→0 — dot unchanged). After
  turning off every runtime light, the env, the moonbeam (beam + motes), the
  lightmap, and the screen/legend emissive and the dot SURVIVED, I enumerated
  `scene.traverse` lights and found TWO point lights at the laptop front: the
  live glowRef AND a **second one baked into the GLB** at its export intensity
  (0.16), stuck on, lighting the desk in BOTH themes. GLTFExporter had
  serialized the MacBook's point light into the asset; `BakedStatics` hid baked
  meshes but not baked LIGHTS. Fix: `BakedStatics` now drops every baked light
  (`if (o.isLight) o.visible=false`). Also DISABLED the live desk-spill light —
  a point light ~3 cm above glossy lacquer blooms (Bloom threshold 1) into a
  hotspot at any intensity, so it could never be dimmed, only zeroed; the
  screen's emissive carries the laptop glow. Lesson now in CLAUDE.md gotchas:
  **a light no runtime knob moves may be baked into the GLB — check
  `scene.traverse` lights.**

### 2026-06-16 — Notes on the pad + white-noise filter; the-desk merged to main

Two requested features, each built by a pair-programming agent team (debate →
implementer ↔ reviewer, both approved in one round):
- **Guestbook notes now write on the 3D notepad.** `Notepad` takes a `notes`
  prop and paints the latest two approved notes as cursive on the top-sheet
  albedo, repainting only that map on a content key (old texture disposed); only
  public fields reach the canvas. `DeskHero` fetches `/api/desk-notes` once and
  threads an identity-stable `notes` down. In the baked scene the pad became a
  live overlay (HIDDEN += notepad, dropped from FOCUS_MAP) like chess/turntable.
  The handwriting was then enlarged + darkened a touch so it reads from the
  resting camera, not just the focus view.
- **White noise removed from the Spotify stats.** One exported
  `isWhiteNoiseListening` predicate (`/white\s*noise/i` on track/album/artist)
  filters now-playing, recent, this-week top artists, today stats, and the
  heavy-rotation crate. Read-time only — no schema/RPC change, no prod-DB writes.

**Merged `the-desk` → `main`** (this commit). Clean code auto-merge: main's
durable-store Spotify redesign (see below) and the new white-noise filter touch
different parts of `lib/spotify.ts` and coexist; main's entrance preloader and
the-desk's notes/fallback edits to `DeskHero.tsx`/`globals.css` also auto-merged.
Verified: prod build green; `/api/spotify/live` serves the durable-store payload
with white noise filtered (recent/today read 0 only because nothing is playing
in dev right now — origin/main shows the identical baseline, so it's not a merge
regression). Only this log conflicted; resolved by keeping every entry. The
homepage default stays the live `DeskScene` — the baked scene is still gated
behind `?baked=1` (not flipped).

### 2026-06-15 — Fix: header ThemeToggle now follows the lamp

Clicking the lamp toggles the site theme (it writes `data-theme` on `<html>`
via `useSiteTheme`), but the header `ThemeToggle` only read `data-theme` once
on mount — so after a lamp toggle its icon/aria-label went stale and its next
click tried to switch to the mode you were already in. Gave `ThemeToggle` a
`MutationObserver` on `data-theme` (the shared DOM contract every theme control
writes), so it stays in sync no matter who flips the theme; its own click now
just writes the attribute + localStorage and lets the observer drive state.
Dropped the mount-time localStorage re-apply — `app/layout.tsx`'s
`beforeInteractive` boot script already applies the persisted theme pre-hydration.

Verified: clean production build; on the dev home page, writing
`data-theme=dark/light` (exactly what the lamp does) now flips the button's
icon + aria-label, and the button's own click still toggles and persists.

Note: this worktree had no R3F deps installed (`three`/`@react-three/*` absent
from the shared `node_modules`) — ran `npm install` here so the desk compiles.

### 2026-06-15 — Branded entrance preloader (MERGED to main from `objective-curie-e74b62`)

Jason wanted the homepage to "look super bougie right out of the box" — no
one-or-two-second window of raw buffering. The fix: a brief, designed loading
curtain that holds over whatever is buffering and lifts when the scene is
actually ready. The curtain is the Claude burst mark turning slowly over a
randomly cycling **Claude Code spinner verb** ("Reticulating…", "Schlepping…").
Built on a worktree per his instruction, then merged to main on Jason's go.

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

NEXT (optional): pull `ClaudeMark` into the `Made with Claude` sticker chip too,
and consider a tasteful min-display time so very fast loads still register the
verb.

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

### 2026-06-15 — Overnight autonomous build: live chess + live turntable + designed fallback + mobile framing

Ran `docs/OVERNIGHT-PLAN.md` to completion. Four goals, in priority order; all
on `origin/the-desk` (now at `88dc5db`), homepage still gated behind `?baked=1`.
Every object below is overlaid on the baked scene with the proven MacBook
pattern (hide the baked meshes via the `HIDDEN` set; overlay the live component
at `PLACEMENT[name]` so the baked contact shadow still grounds it).

**① Live chessboard** (`c12425f`). The baked board was frozen at bake time and
never showed the real world-vs-Jason game. Now `<Chessboard fen lastMove>` reads
from props, mirroring DeskScene. `HIDDEN` += `chessboard`; dropped from
`FOCUS_MAP` (the overlay owns the `chess` click). Verified: single clean board
(no z-fight) in light + dark. (`e523815` also re-added the `?v=2` lightmap
cache-bust I'd briefly reverted while splitting commits — redundant with the
side-task's `a381db6`, harmless.)

**② Live record player** (`e3a9bc9`). Live `<Turntable>` overlays the frozen
baked one so the platter spins on play + the tonearm drops on the needle click.
`HIDDEN` += `turntable`; **removed** `turntable:"records"` from `FOCUS_MAP` to
match DeskScene exactly — the wrapping group has NO body-click focus; the needle
is the only interaction (`onNeedleClick` → records view). Verified visually in
both themes (platter/vinyl/tonearm present, grounded). Spin + needle-drop +
audio are code-parity with DeskScene — can't be JS-dispatched (R3F raycasts from
offsetX/Y), so **flagged for Jason's manual play**.

**③ Fallback + mobile** (`cb416c1` poster, `88dc5db` portrait):
- *No-WebGL / reduced-motion fallback* is now a **designed poster** of the
  actual Cycles render (theme-aware: `public/desk-poster-{light,dark}.jpg`,
  ~120-160 KB, optimized from `bake/renders/window-{light,dark}.png`) behind a
  bottom scrim + text-shadow, with reworded copy that owns the still instead of
  apologizing. It's shared by the live and baked heroes (DeskHero gates
  capability before choosing the scene). Verified by temporarily forcing
  `detectCapability()→"fallback"`: both themes load the right poster, text
  legible, mobile crop clean.
- *Mobile portrait* now makes the **turntable the hero** instead of clipping it
  at the left edge of the narrow phone frustum. New `PORTRAIT_REST/TARGET`
  derived from the `records` FOCUS_VIEW pulled back ~1.5×, with "Drop the needle"
  sitting right under it. Verified at 375px. (DeskScene's own portrait constants
  were left untouched — same treatment is available there if wanted.)

**④ Bake/lighting polish — verification, no change needed.** Premise was "this
worktree's gitignored lightmaps may predate the lamp→10 W hotspot fix." Tested
it: re-baked the **ON** state with the committed 10 W scripts (OFF is unaffected
by the lamp), then compared unit-by-unit — **old == new across every unit**
(±1 px denoise). So the public maps were **already the 10 W fix** (the side-task
had landed it here). Confirmed visually at `/?baked=1` light mode: the desk in
front of the laptop is clean walnut, the warm pool reads warm — no white
blowout. (My first scan's "3240 clipped px on `bakeunit_012`" was a
max-of-channels metric catching the warm pool's **red** channel clipping —
expected for wood directly under a warm lamp — not white; consistent with the
side-task's "0 pure-white px" canvas probe.) No lightmap swap, no speculative
lighting changes (everything was already tuned; the residual is what Jason
deferred). Re-bake artifacts removed.

**Aesthetic / taste calls made (please sanity-check):**
- Mobile = turntable-as-hero (could instead frame more of the desk top-down).
- Fallback poster crop/scrim + the reworded copy ("You're seeing a still of my
  desk…").

**Needs Jason's eyes (couldn't verify headlessly):**
- In-canvas interactions: chess click → focus panel, turntable needle-drop +
  audio, MacBook sticker hover popup. Click them.
- The MacBook polished-front-edge specular glint (runtime specular, not the
  bake — see the entry below) is still your call.
- Flipping `/` to default-baked + any real merge of `the-desk` — left for you.

### 2026-06-15 — Light-mode desk hotspot FIXED (it was direct lamp light, not a caustic)

The deferred light-mode "white hotspot on the desk in front of the laptop" is
**removed**. The earlier hypothesis (a glossy CAUSTIC — the camera/vinyl
focusing the lamp — fixable by roughening props) was **disproven**.

DIAGNOSIS (cheap ablation — bake only the desk unit `bakeunit_012` under the ON
rig with passes split, `scripts/bake/_diag_desk.py` style):
- baseline → blown white core (≈6.5k clipped px). direct-only → **core present**.
  indirect-only → **core gone** (max 0.44). roughen camera+turntable → **no change**.
- So it is **direct lamp light** clipping the desk-top irradiance past the
  lightmap's 1.0 ceiling (then runtime ×π blooms it). It doesn't show in
  `render_ab.py`'s camera render because ACES tonemaps the peak; the raw-linear
  bake can't.

FIX (`scripts/bake/bake_lightmaps.py`): bake lamp **spot 18 W → 10 W** (new
`--lamp-watts` default). A watts sweep showed the desk POOL is carried by
RoomKey/RoomFill (40/16 W area lights) while the spot only makes the hot spike —
so 10 W erases the white core (`bakeunit_012-on` white px **2245 → 0**, blue-chan
max 1.000 → 0.769; the hottest texel is now warm wood, not white) while the pool
brightness barely moves. `render_ab.py` stays at 18 W on purpose (it tonemaps);
divergence documented in BAKING.md §4.

RE-BAKE: only the **ON** state (the spot lights only the ON rig; OFF untouched).
Did NOT re-run `build_uv1.mjs`, so UVs/manifest/OFF maps stay valid. Re-baked ON
at 1024/256 → `bake/lightmaps_hq`, copied `*-on.png` → `public/_bake/lightmaps`.
To reproduce: just the ON bake command from the recipe below (default watts now 10).

VERIFIED: data (white px 2245→0) + runtime at `/?baked=1` light mode — the desk
front reads warm, no white blowout (canvas pixel probe: 0 pure-white px in the
rested view). NOTE: a faint **view-dependent** white speck can still catch the
**live MacBook's polished front edge** (an env/specular glint on the aluminum) —
it survives fresh maps AND LampSpotKey-off, so it is a RUNTIME specular, not the
bake. Left for Jason to judge (retuning it touches the intended chrome glints,
and `BakedDeskScene.tsx` was being edited in parallel — see below).

PARALLEL WORK SEEN: `BakedDeskScene.tsx` gained a **live Chessboard overlay**
(memoized, `HIDDEN` now = {macbook, chessboard}) during this session — not mine;
left intact.

### 2026-06-14 (later still) — Lighting tuning round + the "laptop glow" deep dive

Jason feedback on the baked homepage, in order:
- **Moonlight still too much** → dropped further for a clear day/night gap:
  `MOON_INTENSITY 0.5→0.38`, `MoonAmbient 0.6→0.26`, `uOffBoost 1.8→1.45`. Motes
  held at 0.28 (he wanted them kept up). (commit c8ed9e1)
- **Open-screen glow too bright** + **sticker hover popup too small** → MacBook
  screen emissive `2.0→0.8` (dark end), the cool desk-spill point light
  `glowRef 1.25→0.4` (this is the knob that lights the *wood*, NOT the screen's
  own emissive — they're separate), credit popup `distanceFactor 0.5→1.6`.
  (commit 3d8b9b7)
- **"Light coming from the computer" on the desk in light mode** → a long hunt.
  Findings, in case it resurfaces:
  - The baked laptop's **screen material emits at strength 1.5** in the bake
    source (the GLTF export captured the authored emissive, not the runtime
    closed-state 0). It baked a real glow onto the desk. Fixed in `build_uv1.mjs`:
    every `macbook`-tagged unit is reduced to a **matte near-black occluder**
    (emissive stripped, metal 0 / rough 1 / albedo ~0) — the live overlay
    supplies all screen glow at runtime, so the baked one should only cast a
    shadow. (commit 30efed5)
  - A **separate, stubborn bright speck** in front of the laptop survived: env=0
    (live + baked), lamp-spotlight off, the matte laptop, AND an indirect-firefly
    clamp. It does NOT appear in a Cycles camera render of the same scene → it's
    a **bake-process hotspot**, the documented "light-theme lamp blows out glossy
    surfaces" issue. Confirmed in the lightmap data: the **rangefinder camera
    (`filmCamera`) bakes to clipped white (65535)** and desk plank `bakeunit_012`
    has saturated regions. Added an indirect clamp (`sample_clamp_indirect=3.0`,
    commit bb49c88) as a firefly guard, but it didn't kill this one (the hotspot
    sits under 3.0 yet still blooms at runtime). **Jason chose to defer it** —
    see the spawned follow-up task. The real fix is a bake-rig tweak: lower
    `--lamp-watts` and/or raise glossy-prop roughness for the bake, then re-bake.

**Bake state note:** lightmaps are **gitignored** (local-only; the baked
homepage is still behind `?baked=1` and unpushed). The current local
`public/_bake` has the matte-laptop + clamp **ON** lightmaps and the
screen-stripped **OFF** lightmaps (dark mode is unaffected by the lamp blowout
since the lamp is off). A clean both-state re-bake should happen when the
glossy-blowout task is tackled. The `build_uv1.mjs` + `bake_lightmaps.py`
changes ARE committed, so a re-bake reproduces the fixes.

### 2026-06-14 (later) — First live object on the baked scene: the MacBook opens

THE CHANGE — the baked homepage gained its **first dynamic object**. Until now
the baked scene was fully static (lid/chess/tonearm frozen into the GLB). Jason's
feedback: the dark-theme moonlight was "too much," and the laptop's keys peeked on
the "closed" lid + "the computer should open." Both laptop issues had one root
cause — the laptop was baked shut — and one fix:

- **Live MacBook overlay** (`BakedDeskScene.tsx`): hide the baked macbook meshes
  (self-or-parent `userData.object === "macbook"`) and render the live, animated
  `<MacBook open={focus==='work'}/>` on top at EXACTLY `PLACEMENT.macbook`,
  mirroring `DeskScene`'s `<Placed name="macbook">`. So it opens on the work-focus
  click and its baked contact shadow (still painted into the desk lightmap)
  grounds it. **This is the template for re-adding the other dynamic objects**
  (chess, tonearm) — BAKING.md Stage E. `macbook` dropped from `FOCUS_MAP` (the
  live overlay owns the click); the `LaptopGlow` stand-in deleted (the live ajar
  lid now supplies the night screen glow).
- **Closed-lid fix** (`MacBook.tsx`): `lidPose.closed` zeroed `-π/2 + 0.008 →
  -π/2`. The residual front-up tilt raised the lip so back key rows peeked; a flat
  seat sits the underside uniformly over the deck. The 4 mm proud lift is kept; the
  open-to-110° swing is untouched.
- **Moonlight dialed back** (`MoonBeam.tsx` + `BakedDeskScene.tsx`): too much → a
  contained stream. `MOON_INTENSITY 0.85→0.5`, mote `0.45→0.28`, `FALLOFF
  1.35→1.55`; `MoonAmbient 1.05→0.6`, MoonBeam radii `0.22/0.34→0.2/0.3`,
  `uOffBoost 2.0→1.8`. QA pixel readback: walls 9–27 (dark), beam 103, desk pool 158.

Built by a 5-agent Opus team (Luna moon / Mac lid / Forge integrate / Vega QA /
Cosmo review). Commits `9b69c63`, `7d2005f`, `a1f041a`. **NO re-bake needed** — no
baked geometry/lights changed; the live MacBook replaces the baked one at runtime
and the desk's baked macbook shadow is intentionally kept.

CARRY-FORWARD: the open-on-click lid SWING can't be verified headlessly (R3F
raycasts from `offsetX/offsetY` — synthetic events can't carry it); it needs a
manual click to confirm live. The rest of the baked scene is still static (chess
pieces, tonearm, lamp) — the same overlay technique applies when those go dynamic.

### 2026-06-14 — Baked homepage is LIVE (behind ?baked=1) + a feedback/polish round

THE CURRENT STATE — read this first for a cold start:

**The baked-GI scene is wired into the REAL homepage**, gated behind the URL
param **`?baked=1`** (the default `/` is still the untouched live `DeskScene`,
so nothing is at risk until sign-off). It looks lifelike in both themes and
runs cheap. Branch `claude/goofy-jang-fa9bd0`, ~16 commits ahead of
origin/the-desk, NOT pushed. Build green (17/17). Dev: `npm run dev` (port
3120 via .claude/launch.json "desk-dev").

**How the baked homepage works (the architecture):**
- `components/desk/BakedDeskScene.tsx` — a drop-in for `DeskScene` (same
  `DeskSceneProps`/HUD contract). `DeskHero.tsx` branches its `dynamic()` import
  on `?baked=1`. It loads the world-space uv1 GLB with a bare `three-stdlib`
  `GLTFLoader` (drei's useGLTF HANGS on the big GLB), keeps each material as
  **MeshStandard** (so chrome/gloss reflect) + attaches the **baked lightmap**
  on `uv1` for diffuse GI, + an **Environment** (Lightformers) for specular.
  Two baked states (lamp ON / OFF) **crossfade** via an injected shader
  (`onBeforeCompile`, `uMix` driven by the theme `mixRef`; `lightMapIntensity≈π`
  cancels three's RECIPROCAL_PI; `uOffBoost` lifts the OFF map). Clicks dispatch
  off each baked mesh's `object` tag → focus views / lamp toggle. Beauty kept:
  `LampBeam`, `MoonBeam`, bloom/grain/vignette, emissives. Expensive GI dropped
  (no shadow maps, N8AO, IBL warm-up). A resize-nudge on mount fixes a
  cold-load race where the canvas latched R3F's default 300×150 → black.
- **The bake pipeline (all headless, Node + Blender):**
  `scripts/bake/build_uv1.mjs` (flatten+weld the exported GLB, watlas-unwrap a
  uv1 per primitive, tag each unit with its `object`, emit
  `bake/desk-window-uv1.glb` + `rig.json` + `bake_manifest.json`) →
  `scripts/bake/bake_lightmaps.py` (Cycles diffuse-irradiance bake per unit,
  per state, reusing render_ab's approved rig) → copy `bake/lightmaps_hq/*.png`
  + the uv1 GLB into `public/_bake/` for the viewer.
- **TO RE-BAKE after any geometry/light/lamp-position change:** (1) edit the
  source component(s); (2) re-export the GLB — open `/bake?room=window&theme=light`
  on the dev server, it auto-exports `bake/desk-window-light.glb` (its canvas
  may need a window-resize nudge to mount); (3) `node scripts/bake/build_uv1.mjs`;
  (4) `Blender -b --python scripts/bake/bake_lightmaps.py -- --glb
  bake/desk-window-uv1.glb --rig bake/rig.json --manifest bake/bake_manifest.json
  --state on --out bake/lightmaps_hq --res-cap 1024 --samples 256 --margin 16`
  (then `--state off`), ~23 min each; (5) `cp bake/desk-window-uv1.glb
  public/_bake/ && rm -f public/_bake/lightmaps/*.png && cp
  bake/lightmaps_hq/*.png public/_bake/lightmaps/`. Texture-only edits (book
  art, etc.) need NO re-bake (albedo is live); geometry/light-rig/lamp-position
  changes DO. `/baked` is a standalone dev viewer for the same maps.

**This round's fixes (Jason's feedback on the baked dark theme + look):**
- **Window light patch + hard desk hotspot → removed.** Both were the runtime
  moon DIRECTIONAL throwing sharp speculars; it was redundant (the baked OFF
  lightmap already carries the moon's direction). Dropped it; cooled the dark
  env/background → the warm window patch is gone too.
- **MoonBeam** (`components/desk/objects/MoonBeam.tsx`, new, Opus sub-agent +
  my tuning) — a cool edgeless volumetric shaft (moonlight analogue of
  `LampBeam`, world-space `start`/`end` props, gated by `moonGlowRef` = inverse
  mix). The "stream through the window and along the desk."
- **Laptop screen glow** restored in dark (`LaptopGlow` in BakedDeskScene —
  cool point light + emissive panel standing in for the baked-closed lid).
- **Books reworked for realism** (`DeskBookRow.tsx`, Opus sub-agent): varied
  sizes, fore-edge page blocks, two dust jackets, worn covers, debossed spines;
  verified titles preserved.
- **Lamp moved to the desk's far left corner** (`layout.ts` lamp x −0.6→−0.84).
- Re-baked BOTH states (new books + moved lamp).

**OPEN / next:**
- Light theme: where the lamp pool lands on glossy vinyl/desk it reads a touch
  blown (baked Cycles specular + the volumetric beam pool stacking) — soften via
  a bake-rig tweak (lower lamp watts / raise vinyl roughness) + re-bake.
- The baked scene is STATIC — chess pieces / tonearm / MacBook lid don't animate
  (they bake in rest pose). Re-adding the dynamic objects LIVE on top (probe +
  blob shadows, BAKING.md Stage E) is the next real chunk.
- Clicks need hand-testing (R3F raycast can't be driven headlessly).
- Decide when to flip `DeskHero` to default-baked (drop the `?baked` gate) and
  push.
- `docs/BAKE-NIGHT-1.md` has the full pipeline write-up; `racket-rework-wip`
  branch holds the shelved racket (removed from the scene).

### 2026-06-13 — Bake Night 1: the freeze-dry pipeline WORKS

Built and proved the baked-GI pipeline end-to-end. The full scene now
replays in the browser with ZERO scene lights — albedo × baked lightmap —
and convincingly matches the approved Cycles still. Full write-up in
**`docs/BAKE-NIGHT-1.md`** (read that first). Headlines:

- **Pipeline (3 new pieces, all committed, all headless):**
  - `scripts/bake/build_uv1.mjs` — flatten+weld the exported scene GLB, give
    every primitive its own lightmap UV (uv1) via watlas (xatlas WASM),
    area-sized atlas. Emits `desk-window-uv1.glb`, `rig.json`, `bake_manifest.json`.
  - `scripts/bake/bake_lightmaps.py` — Cycles diffuse-irradiance bake (color
    OFF) into one image per unit, reusing render_ab's approved rig, per lamp
    state. 347 units, ~6 min at 512/64.
  - `/baked` viewer — unlit MeshBasic, albedo × lightmap on uv1, with an
    ON/OFF crossfade (uMix, like the real mixRef). 436/440 meshes lightmapped.
- **Look:** `bake/shots/baked-on-*.png` vs `bake/renders/window-light.png` —
  close. lightMapIntensity ≈ π cancels three's RECIPROCAL_PI for a truer match.
- **Gotchas burned:** watlas re-splits verts (remap ALL attrs via xref —
  COLOR_0 was the trap); drei useGLTF HANGS on the big embedded GLB (use bare
  three-stdlib GLTFLoader); preview viewport collapsed to 1px + stale webpack
  chunks needed a clean `.next` restart; MeshBasic lightmap × 1/π.
- **Still open (tomorrow):** match the look exactly (rig warmth vs tonemap),
  wire the bake into the REAL interactive DeskScene + strip the live
  shadow/AO/reflector/IBL stack (Stage F), dynamic objects (Stage E), combine
  the 347 lightmaps into a few atlases. The racket is the old reverted model
  (rework shelved on branch `racket-rework-wip`).
- Overnight: baked BOTH lamp states at 1024px/256 samples into
  `bake/lightmaps_hq/` (~23 min each), copied to `public/_bake/lightmaps/`.
  The ON/OFF crossfade is wired and validated against both approved stills
  (`bake/shots/final-{on,off2}.png`). intensity≈π + uOffBoost tuning landed.
- **THEN (after Jason's feedback) baked it INTO THE REAL HOMEPAGE.** Diagnosis:
  the flat look was the unlit MeshBasic viewer, not the bake — switching to
  MeshStandard + an Environment map (lightmap = diffuse, env = specular/chrome)
  restored the chrome lamp, desk sheen, record-player shine. Built
  `BakedDeskScene` (drop-in for DeskScene, behind `?baked=1` so the live scene
  stays default), loads the uv1 GLB, crossfades by `mixRef`, dispatches
  focus/theme CLICKS off each baked mesh's `object` tag (build_uv1 now stamps
  it), keeps the beam/motes/bloom/grain/vignette, drops shadow maps + N8AO +
  IBL warm-up. Removed the racket (scene + bake); flattened the MacBook closed
  lid. Both themes render (`bake/shots/homepage-baked-{on,off}.png`); build
  green. OPEN: clicks need hand-testing; first pass is STATIC (chess/tonearm/lid
  don't animate — re-add live on top next); dark env a touch warm; screen-glow
  in dark TBD.

### 2026-06-12 — v4 finish: left wall + the bake runbook

- Enclosed the room: looking all the way left showed void (room had
  back + right walls only). Brought FLOOR_X_MIN in from -2.7 to -1.85
  and added a matching dark-walnut LEFT wall (winWallLeft) — base
  plane, raised-panel run (placeLeft), chair rail, baseboard, all
  mirroring the right wall. Clears the record crate.
- **Wrote `docs/BAKING.md`** — the complete lightmap-bake runbook so
  the bake can be run cleanly after compaction. It's the canonical
  source for Stage 5: static/dynamic split, the 6 stages, toolchain,
  gotchas, look-parity, acceptance. NEXT ACTION after compact = run
  the bake per that doc, spike-one-object first.
- Composition is now FROZEN at v4. Re-baked stills hold.

### 2026-06-12 — Composition v4: dark-walnut study, racket, lamp aim

Quick polish round (Jason: "this should be the last thing"):
- WALLS are now dark-walnut raised-panel wainscoting (RoomWindow):
  walnut base texture + a grid of beveled raised panels with stiles/
  rails, chair rail, baseboard. Turns the room into a lawyer's study
  and gives the night-window light a warm surface to bounce off.
- Racket: stencilled the iconic HEAD nested-chevron logo across the
  string bed (the reference photo's give-away detail) + a PRO label
  near the top of the hoop. Reads as a real HEAD Radical Pro now.
- Lamp: STAYS in the back-left corner (Jason corrected me — do NOT
  move it); only re-aimed. rotationY -1.28 -> -0.56 so the beam swings
  off the platter toward the gap between turntable and computer.
- Chess: rotated ~80 deg clockwise (rotationY 0.45 -> -0.95).
- Re-baked both themes: bake/renders/window-{light,dark}.png show the
  walnut study. Light theme is moodier now (dark walls absorb the key)
  but that fits "always night, lamp on." Both build green.

Reminder: the dev cold-load curtain stall (slow first compile after
rm -rf .next) bit AGAIN — the v3 entry has the diagnostic; the
production build is the source of truth, not the dev cold load.

### 2026-06-12 — Composition v3: centered night window, the law of night

Jason's third pass (voice notes). The room is now built around a
window CENTERED in the back wall that you look out of, and the
lighting law: it is ALWAYS NIGHT outside. Light theme = lamp on +
soft warm practicals; dark theme = the night window (moon + city) is
the hero light, plus the screen glow. Every requested change shipped:

- Speakers + floor bookcase RETIRED (clutter). Both component files
  stay in the repo, unmounted, in case they return.
- Books now stand in a ROW on the desk against a new back gallery
  rail ("the little bump up at the back"): DeskBookRow.tsx, all ten
  verified titles + a steel bookend; the rail is in Desk.tsx
  (deskRail/deskRailPosts). Desk legs were already thickened in v2.
- Window moved to the back wall, centered x=0, deeper sill; day
  backdrop deleted; night backdrop repainted as a city-rooftop view
  (moon upper-left, skyline with lit windows, water tower, stars).
  A terracotta succulent sits on the sill's left end.
- HEAD Radical Pro on the wall right of the window: TennisRacket.tsx,
  colorway researched (2023 neon orange / navy, white strings).
- Lamp moved BEHIND the turntable (rotY -1.28 keeps the beam on the
  platter); computer dead-center; notepad left; chess right; travel
  vignette to the back row; Clawd stickers ~30% bigger.
- New HERO bake camera (lower, head-on) so the window/wall/racket
  read — the top-down rest cam hid the whole back wall (Jason: "the
  camera is still in front, not optimal"). The live rest camera still
  looks down at the desk — an open question whether to lower it too.

Bugs fought this session (all fixed):
- The MULTI-AGENT WORKFLOW STALLED: 2 of 4 agents (racket, room
  rework) hung with no output and no error. Lesson: don't poll
  transcripts to decide if it's alive — cut it loose and finish the
  stalled pieces directly. Built the racket inline; relaunched the
  room rework as one fresh agent.
- Night view rendered BLACK. Root cause was NOT centering (though the
  3m backdrop did hide the moon — fixed by shrinking to 1.55m close
  to the wall). Real cause: the backdrop ships its image in the glTF
  EMISSIVE slot with a black base-color factor; the bake script's
  make_emissive (base-color -> emission) emitted black. New
  make_pure_emission() rebuilds a clean emission shader from the raw
  image. THE moon/city now read through the glass.
- Racket was buried IN the wall (z=-0.893 vs inner face -0.855) —
  moved to z=-0.84.

Renders: bake/renders/window-light.png + window-dark.png (the v3
hero pair). GOTCHA banked in CLAUDE.md: emissive-from-glTF backdrops
need make_pure_emission, not make_emissive.

LIVE INTEGRATION DONE: RoomWindow now renders in the live homepage
(DeskScene imports ./concepts/RoomWindow as the room) and the rest
camera is a middle tilt (layout CAMERA) that holds both the desk and
the centered window; orbit maxPolarAngle opened to 1.32. The browser
now shows the full v3 composition — window night view, wall racket,
sill succulent, book row.

TIME-SINK LESSON (cost ~an hour of thrash): after `rm -rf .next`, the
first cold page load compiles every shader from scratch, so
ReadySignal's compileAsync is slow and the load curtain (the warm
radial gradient) stays up for 20-40s+ — the scene is rendering
BEHIND it the whole time (canvas ancestor stuck at opacity 0). This
looks exactly like a blank/broken scene with NO console error. Do NOT
conclude a code change broke rendering: (1) check the wrapper opacity
chain — a 0 means curtain-not-lifted, not a render failure; (2) force
it visible to confirm (`el.style.opacity='1'`); (3) a warm reload
lifts it on its own. I wrongly blamed the RoomWindow swap, reverted
it, saw the same blank, and only then realized it was the curtain.
RoomWindow-live was fine all along.

Open / next: the live night view is the real-time approximation (the
emissive backdrop glows through the glass) — the real payoff is still
the lightmap bake (Stage 5 checklist). Also: tune the live tilt
against the window framing in-person; consider lowering the curtain's
cold-load timeout or showing a spinner past N seconds.

### 2026-06-11 (late evening) — Composition v2 from Jason's voice notes

Jason's verdict on the A/B: "This looks incredible. This is exactly
what I want." Room decision = the WINDOW concept, with the window on
the RIGHT wall (cross-light against the lamp) — the original artisan
placement, restored from git (74cfbc9). His voice notes drove a full
composition pass, all landed and live:

- Minimalist center: MacBook squared to the desk (rotY = pi exactly)
  and near-centered at [0.1, -0.14]; center column = computer + notepad.
- Chessboard diagonal strengthened (rotY 0.45); WHITE faces the sitter
  (squareToLocal puts rank 1 at local +z — the world plays white).
- Hero camera shifted right (rest [0.28, 1.08, 1.02]); work focus view
  tracks the new MacBook; reading focus retargeted to the floor case.
- Pixel-Clawd stickers from his photo of his real laptop: skateboard
  above the logo, bubble-blower viewer-left, idea-bulb viewer-right;
  string-array sprite maps, rectilinear die-cut Shapes edge-walked from
  dilated pixels; hover/Made-with-Claude wiring intact (hand-check the
  chip — raycast can't be JS-tested).
- Desk legs thickened to "commanding" (vase swell 12.7cm dia, blocks
  9.4cm, aprons 11.5cm); stance/footprint unchanged.
- FloorBookcase.tsx replaces the desktop Bookshelf (which stays in the
  repo, unmounted): 1.25m walnut case behind the desk's left corner,
  same ten verified titles, bookends, horizontal stack with On the
  Edge cover-up, potted succulent. ~21 draws.
- Speaker.tsx — walnut bookshelf speaker (grille-off woofer/tweeter,
  LATZ AUDIO badge, rear port so one component mirrors as both
  channels); pair placed at the desk's far corners, toed in
  (speakerLeft/-Right in layout).
- Composition-v2 Cycles stills rendered: bake/renders/window-light.png
  (morning sun patch raking the desk + lamp pool) and window-dark.png
  (ember room, lamp off). Light theme final grade is bake-time work.
- Backlog banked in PLAN: /music page with crate-vs-player click split,
  parallax window view (feasible, cheap), /photography route split.

Known/watch: left speaker mostly occluded behind the turntable from
rest cam (fine — it reads in focus views and renders); reading focus
view needs a hand-framing check; window-light brightness is approval-
grade, not final art.

### 2026-06-11 (evening) — Stage 5 opens: the kiln, de-jank, new objects, room A/B

Post-launch reckoning. Jason: record player great, but "background,
books, desk, notebook, and laptop still aren't high-fidelity" and
performance is "very jittered... pauses and jumps. when loading, when
moving" — and how does Bruno Simon do it? Research (both his repos read
file-by-file): folio-2019 = matcaps + ZERO lights + painted orange blob
shadows; my-room-in-3d = ONE mesh + four baked 4K JPEGs blended in a
shader (uNightMix = literally our lamp toggle); zero shadow maps
anywhere. Conclusion both qualms share one root: we compute lighting
live. Greenlit pivot = the "freeze-dry" pipeline (PLAN.md Stage 5):
procedural authoring stays, Blender Cycles becomes a headless kiln,
runtime becomes playback. Jason: happy to let the M4 cook for days,
"high fixed cost, low variable" — but he never touches Blender's GUI.

Decisions locked this session: windowless-or-window decided by a
Cycles A/B bake-off (A perfected void vs B corner window — "1 vs 2");
camera+photos vignette over a globe (globe = generic unless pinned;
maybe later on the shelf); unlined notepad paper; static desk
reflection approved; broad palette stays (wood/cream good, room being
redesigned anyway). FOUND: /photography is a hard redirect to /travel
— the vignette is decor until the routes split.

Landed (one commit each):
- De-jank: DoF pass deleted (full-res bokeh chain, blurred the detail
  we keep buying); AdaptiveDpr + performance.regress deleted (the 55%
  resolution sag + snap-back WAS much of "jumps when moving"); fixed
  dpr [1, 1.5].
- FilmCamera.tsx (rangefinder, ~26 draws) + PhotoStack.tsx (7 fanned
  prints, placeholder faces — real trip photos swap in as albedo, free)
  modeled by verified artisan agents; placed front-left (layout.ts
  photos/filmCamera) and mounted in DeskScene as decor.
- Notepad ruling removed (paper now clean cream).
- Room concepts (bake-off only): concepts/RoomVoid.tsx (chiaroscuro
  stage, falloff painted into albedos) + concepts/RoomWindow.tsx
  (corner room; windowBackdropNight/Day planes the renderer toggles).
- Bake pipeline v1, WORKING END-TO-END: /bake?room=&theme= (dev-only)
  mounts the real scene, settles 3.5s, GLTF-exports (reflector film
  hidden structurally, beam/motes/AccumulativeShadows simply not
  mounted, MARKER_* empties carry camPos/camStart/camTarget + lamp
  head/target axis) → POST /api/bake/upload → /bake/*.glb (~50 MB,
  gitignored) → scripts/bake/render_ab.py: Blender 5.1.2 headless
  (brew cask; "blender" not on PATH — use
  /Applications/Blender.app/Contents/MacOS/Blender), Cycles on Metal
  GPU, deletes the KHR runtime lights that ride along, builds a rig
  per room+theme, denoised render. 384 samples at 1536x960 ≈ 30s/frame
  on the M4 Pro. First-ever path-traced stills of the desk live in
  bake/renders/.
- A/B took three rounds of art direction, all four finals in
  bake/renders/: round 1 — void-light already beautiful, but the window
  was built into the RIGHT side wall = out of the judging frame, lamp
  pool too weak vs key, dark too murky. Round 2 — window relocated to
  the back wall (x≈-0.5, real 9cm reveal; agent-surgical), void
  rebalanced (lamp 18W/key 45W, ember 2.5W)… and daylight STILL didn't
  enter. Round 3 found why: the emissive sky backdrops sit between
  sun/moon and the opening and were shadow-casting — visible_shadow=
  False and the day shot gained a true mullioned sun patch across the
  desk. Also: camera advance lever clipped the shutter dial ~4mm
  (adversarial re-review caught it numerically) — swing -0.3 → -0.8.
  Known limitation, fine for the room decision: the MacBook exports
  closed at rest, so dark renders lack the lid-glow story.

Gotchas discovered:
- zsh does NOT word-split unquoted vars (`set -- $combo` keeps it one
  word) — write explicit commands or ${=var}.
- A bare `bake/` in .gitignore also ignored app/api/bake and
  scripts/bake — anchor root-level ignores: `/bake/`.
- GLTFExporter serializes three.js punctual lights (KHR extension) —
  the kiln must delete them or the runtime rig double-lights the bake.
- Blender glTF import: read marker matrix_world only after
  view_layer.update(); axis swap is t2b(x,y,z)=(x,-z,y) for hand-placed
  rig elements.
- Spotify live refresh is erroring in dev tonight ([useSpotifyLive]
  failed) — pre-existing/external (token or rate limit), NOT the scene;
  worked at launch. Investigate separately.

Next:
- Jason picks room A or B from bake/renders/ (void-light.png,
  void-dark.png, window-light.png, window-dark.png).
- Winner replaces Room.tsx; then UV2 unwrap (xatlas), true lightmap
  bakes (lamp-on/lamp-off), runtime blend, strip the live stack
  (PLAN.md Stage 5 checklist).
- Hand-checks for Jason: vignette placement in person, de-jank feel
  (resolution pops should be gone), unlined notepad.

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
