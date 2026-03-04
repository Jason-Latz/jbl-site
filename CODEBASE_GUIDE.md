# Personal Website Codebase Guide

This document explains how the site is structured, how data and auth flow through the app, and how each major file contributes to behavior.

## 1) What this project is

This is a **Next.js 14 App Router** project for a personal website with:

- Public pages: home, writings archive, photography mosaic, individual writing pages, and experience
- A single-line home activity ribbon that shows compact Spotify now-playing + Duolingo streak summaries with expandable details
- A protected admin editor at `/admin`
- Supabase-backed storage for posts, photography media, and editor permissions
- A markdown-first writing flow with live preview and formatting shortcuts

The site is intentionally minimal and server-rendered where possible.

## 2) Tech stack

- Framework: `next@14.2.5` (App Router)
- Language: TypeScript (`strict: true`)
- UI: React 18 + plain CSS (`app/globals.css`)
- DB/Auth: Supabase (`@supabase/supabase-js`, `@supabase/auth-helpers-nextjs`)
- External API integration: Spotify Web API (OAuth refresh token flow)
- Writing/rendering: `react-markdown` + `remark-gfm` for markdown and footnotes
- Infra tooling used locally: Supabase CLI (`supabase`) + PostgreSQL CLI (`psql`)

## 3) Directory map

```
app/
  layout.tsx               # Global shell (header/nav/main/footer) + metadata
  page.tsx                 # Home page
  globals.css              # Global styles and component utility classes
  experience/page.tsx      # Static experience timeline
  photography/page.tsx     # Public photography mosaic page
  writings/page.tsx        # Published writings list page
  writings/[slug]/page.tsx # Single published post page
  admin/page.tsx           # Admin page wrapper
  admin/AdminEditor.tsx    # Client-side admin dashboard (auth + posts + photo uploads)
  admin/PostEditorPage.tsx # Client-side markdown editor + live preview
  admin/new/page.tsx       # Dedicated route for creating new posts
  admin/[id]/page.tsx      # Dedicated route for editing existing posts
  api/spotify/live/route.ts # Spotify now-playing + stats API proxy
  api/photos/route.ts      # POST multi-file photo uploads (editor-only)
  api/posts/route.ts       # GET all posts (editor-only), POST create post
  api/posts/[id]/route.ts  # GET one post + PATCH update post (editor-only)

components/
  SiteNav.tsx              # Main nav links
  SiteFooter.tsx           # Footer copyright + social links
  SpotifyNowPlaying.tsx    # Home-page Spotify ribbon panel polling /api/spotify/live
  DuolingoStreak.tsx       # Home-page Duolingo ribbon panel polling /api/duolingo/streak

lib/
  spotify.ts               # Spotify OAuth token refresh + data aggregation
  posts.ts                 # Supabase public-read helpers for published content
  photos.ts                # Public photo listing helper from Supabase Storage
  requireEditor.ts         # Shared authorization check for API routes
  date.ts                  # Date formatting helper

supabase/
  schema.sql               # Tables, trigger, indexes, RLS policies

middleware.ts              # Initializes Supabase auth session for /admin and /api

# Root config / infra files
.env                       # Local runtime secrets/config (ignored by git)
.env.example               # Minimal env template
.gitignore                 # Ignore rules incl. env + Supabase temp artifacts
package-lock.json          # NPM dependency lockfile
tsconfig.json              # TS config incl. @/* alias and Next plugin metadata
scripts/spotify-refresh-token.mjs # Local helper to generate Spotify refresh token
```

## 4) Runtime architecture

### 4.1 App shell and layout

`app/layout.tsx` is the root layout and does five key things:

1. Loads Google fonts (`Inter`, `Newsreader`) and exposes them as CSS variables.
2. Disables `adjustFontFallback` for `Newsreader` to avoid noisy dev-time font override warnings in Next.js.
3. Defines base metadata (`title`, `description`) for the whole site.
4. Renders global chrome: header with site title + nav, main content container, and footer with social links.
5. Applies shared container widths and spacing through global CSS classes.

This means every route is rendered inside the same visual shell by default.

### 4.2 Public pages

- `/` (`app/page.tsx`): hero content, single-line collapsible Spotify + Duolingo activity ribbon, dynamic “latest writing” card sourced from published posts, and a “now” card.
- `/experience` (`app/experience/page.tsx`): static, resume-style sections (education, professional experience, projects, technical skills, activities) rendered as cards.
- `/photography` (`app/photography/page.tsx`): server-rendered masonry mosaic built from images in the Supabase Storage `photos` bucket.
- `/writings` (`app/writings/page.tsx`): server component fetching published posts from Supabase via `lib/posts.ts`.
- `/writings/[slug]` (`app/writings/[slug]/page.tsx`): server component fetching one published post by slug; returns `notFound()` if missing.

`/photography` and both writings routes set `export const revalidate = 60`, so page data is ISR-cached for up to 60 seconds.

### 4.3 Home activity ribbon (Spotify + Duolingo)

The home page includes `components/SpotifyNowPlaying.tsx` and `components/DuolingoStreak.tsx` (both client components) inside one shared horizontal `activity-ribbon` container. Each component is rendered as a `<details>` panel:

- closed panel = compact one-line summary with a caret indicator (no "Details" text)
- expanded panel = full detail card content

`SpotifyNowPlaying.tsx` polls `/api/spotify/live` every 45 seconds and renders:

1. Spotify-branded label icon in the card header
2. Current track summary in the ribbon row, with marquee-style horizontal scroll when text is long
3. Album art thumbnail for the currently playing track (when available)
4. Same-day listening metrics (play count, minutes listened, unique artists)
5. Most recent playlist context (playback context first, library fallback second)
6. Last successful fetch timestamp and resilient stale-data messaging on errors

`app/api/spotify/live/route.ts` is server-side and uses `lib/spotify.ts` to:

1. Refresh an access token with `SPOTIFY_REFRESH_TOKEN`
2. Read `/me/player/currently-playing` and `/me/player/recently-played`
3. Compute "today" metrics in `SPOTIFY_TIMEZONE` (default `America/Chicago`)
4. Resolve playlist metadata via playback context (`/playlists/:id`) or `/me/playlists?limit=1`

`DuolingoStreak.tsx` polls `/api/duolingo/streak` every 60 seconds and renders:

1. Compact streak summary in the ribbon row
2. Profile link, streak count, and status details in the expanded panel
3. Last-known cached data and retry messaging when the API is temporarily unavailable

Response caching is disabled (`Cache-Control: no-store`) on the Spotify route so the widget data is always fresh. Both client pollers guard against transient non-JSON route responses (for example, dev-time HTML error pages) and fall back to status-based retry messaging instead of JSON parse errors.

### 4.4 Admin area

- `/admin` is rendered by `app/admin/page.tsx` and includes `AdminEditor` dashboard.
- `/admin/new` and `/admin/[id]` are dedicated compose/edit routes rendered with `PostEditorPage`.
- `app/admin/page.tsx` now does a server-side profile role check:
  - unauthenticated visitors can see the sign-in UI
  - signed-in users without `profiles.is_editor = true` are redirected to `/writings`
- `AdminEditor.tsx` is a client component because it needs:
  - browser auth session state
  - live post listing and dashboard actions
  - photo file selection from the browser and multipart upload dispatch
  - direct API calls for list/auth/upload actions
- `PostEditorPage.tsx` is a client component because it needs:
  - markdown editing in a textarea
  - single-pane write/preview mode toggling
  - direct API calls for create/update actions

Admin UI behavior:

1. On mount, it checks Supabase auth session.
2. If no session, it renders a sign-in form (`signInWithPassword`).
3. Dashboard route (`/admin`) loads posts from `/api/posts` with explicit `401/403` handling and a `New article` action that immediately creates a draft post, then routes to `/admin/[id]`.
4. Compose routes (`/admin/new`, `/admin/[id]`) provide metadata fields, markdown body editing, toolbar shortcuts (bold/italic/headings/lists/links/code), and a single-pane `Markdown/Visual` toggle.
5. Markdown supports GFM features, including footnotes (`[^1]` and `[^1]: ...`).
6. `Visual` mode is editable (contenteditable); `Apply preview edits` converts the edited visual HTML back into markdown before save.
7. Dashboard route supports selecting multiple image files and uploading them in one batch through `POST /api/photos`.
8. On `401/403` API responses, editor clients sign out or route away instead of silently showing empty data.
9. Sign-out clears local editor/session state.

## 5) Data layer and Supabase model

### 5.1 Tables (`supabase/schema.sql`)

#### `public.profiles`
- `id` (UUID, PK, references `auth.users`)
- `full_name` (text)
- `is_editor` (boolean, default false)
- `created_at`

Purpose: maps authenticated users to role metadata; `is_editor` gates admin actions.

#### `public.posts`
- `id` (UUID PK)
- `title` (required)
- `slug` (required, unique)
- `excerpt` (optional)
- `content` (optional, markdown text; legacy HTML still rendered as fallback)
- `published` (boolean, default false)
- `published_at` (nullable timestamp)
- `created_at`, `updated_at`

Index: `posts_published_at_idx` on `published_at DESC` for archive ordering.

Trigger: `set_updated_at` updates `updated_at` automatically before updates.

### 5.2 Storage bucket (`storage.buckets` and `storage.objects`)

The schema also manages a public Supabase Storage bucket:

- Bucket: `photos`
- Public object reads enabled
- File size limit: `25MB`
- Allowed MIME types:
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/gif`
  - `image/avif`
  - `image/heic`
  - `image/heif`

Storage object policies for bucket `photos`:

- public can `select` photo objects
- editors can `insert`, `update`, and `delete` photo objects
- editor checks use the same `public.profiles.is_editor = true` gate as post APIs

### 5.3 Row-Level Security

RLS is enabled on both app tables and storage objects.

Policies:

- Profiles:
  - owner can `select` own profile row
  - owner can `insert`/`update` own row, but `is_editor = true` is allowed only when JWT email is `jasonlatz0@gmail.com` (via `public.can_self_assign_editor()`)
- Posts:
  - anyone can `select` rows where `published = true`
  - editor users can perform all operations (`for all`) if their profile has `is_editor = true`
- Storage (`storage.objects`, bucket = `photos`):
  - anyone can `select` objects in `photos`
  - editor users can `insert`/`update`/`delete` objects in `photos`

This is the core safety model: the app uses the Supabase **anon key**, but RLS enforces permissions.

## 6) Auth and authorization flow

### 6.1 Middleware (`middleware.ts`)

Middleware runs for:

- `/admin/:path*`
- `/api/:path*`

It initializes `createMiddlewareClient` and calls `supabase.auth.getSession()`.
This keeps auth cookies/session synchronized for route handlers and client auth helpers.

### 6.2 API guard (`lib/requireEditor.ts`)

Each write-capable/admin API route calls `requireEditor(supabase)`:

1. `supabase.auth.getUser()` validates the logged-in user
2. Fetches profile row by user ID
3. Requires `profile.is_editor === true`
4. Returns structured result:
  - allowed
  - or `{ status: 401/403, message }`

This is an app-level guard layered on top of RLS.

## 7) API route behavior

### `GET /api/spotify/live` (`app/api/spotify/live/route.ts`)

- Requires env vars:
  - `SPOTIFY_CLIENT_ID`
  - `SPOTIFY_CLIENT_SECRET`
  - `SPOTIFY_REFRESH_TOKEN`
- Returns `503` if required Spotify env keys are missing
- On success returns:
  - `fetchedAt`
  - `isPlaying`
  - `nowPlaying` (track metadata or `null`)
  - `today` (same-day stats in configured timezone)
  - `recentPlaylist` (playback-context playlist or fallback library playlist)
- Route is forced dynamic (`dynamic = "force-dynamic"`, `revalidate = 0`) and responds with `Cache-Control: no-store`
- On upstream Spotify failures it returns `502` with a diagnostic message

### `GET /api/posts` (`app/api/posts/route.ts`)

- Requires editor role
- Returns all posts (draft + published), newest by `created_at`
- Used by admin list view

### `POST /api/posts` (`app/api/posts/route.ts`)

- Requires editor role
- Validates `title` and `slug`
- Requires slug format: lowercase letters, numbers, and single hyphens (`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
- Inserts post with provided fields
- Sets `published_at` to now if `published === true`, else `null`
- Returns:
  - `400` for invalid JSON, missing required fields, or invalid slug format
  - `409` when slug uniqueness is violated
  - `500` for unexpected database/server errors

### `GET /api/posts/:id` (`app/api/posts/[id]/route.ts`)

- Requires editor role
- Returns one post (draft or published) for the editor workspace
- Used by `/admin/[id]` editor route
- Returns:
  - `404` if the target post id does not exist
  - `500` for unexpected database/server errors

### `PATCH /api/posts/:id` (`app/api/posts/[id]/route.ts`)

- Requires editor role
- Same validation as POST
- Updates post fields and publication timestamp
- Returns:
  - `400` for invalid JSON, missing required fields, or invalid slug format
  - `404` if the target post id does not exist
  - `409` when slug uniqueness is violated
  - `500` for unexpected database/server errors

### `POST /api/photos` (`app/api/photos/route.ts`)

- Requires editor role (`requireEditor`)
- Expects `multipart/form-data` with one or more `files` entries
- Supports multiple images per request (up to 40 files)
- Validates each file:
  - type must start with `image/`
  - size must be `<= 25MB`
- Uploads accepted files to Supabase Storage bucket `photos`
  - object path format: `{timestamp}-{index}-{uuid}-{normalized-name}.{ext}`
  - cache header: `cacheControl = "31536000"`
- Returns per-batch summary:
  - `uploadedCount`
  - `failedCount`
  - `failed[]` with file-level reasons

Important current behavior:

- If an already-published post is edited while still published, `published_at` is reset to “now”.
- There is no DELETE route currently.
- API validates slug shape server-side but does not normalize malformed values into a canonical slug.

## 8) Public data-fetching helpers (`lib/posts.ts`, `lib/photos.ts`)

`lib/posts.ts` creates a Supabase client from:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Functions:

- `fetchPublishedPosts()`:
  - returns only published records
  - excludes full `content` for list efficiency
  - ordered by `published_at DESC`
- `fetchPostBySlug(slug)`:
  - returns one published post including full body content
  - body is rendered as markdown by default (`react-markdown` + `remark-gfm`)
  - if body looks like legacy HTML, route falls back to direct HTML render

Both are wrapped in React `cache(...)`, so repeated calls during one render tree reuse results.

If env vars are missing, helpers safely return empty/null data rather than throwing.

`lib/photos.ts` creates a Supabase client from the same public env vars and provides:

- `fetchPublicPhotos()`:
  - lists files from Supabase Storage bucket `photos`
  - filters to image extensions
  - maps each object to a public URL (`/storage/v1/object/public/photos/...`)
  - derives a fallback alt string from file name

## 9) Editor details (`app/admin/AdminEditor.tsx`, `app/admin/PostEditorPage.tsx`)

### 9.1 Dashboard (`/admin`)

`AdminEditor.tsx` now serves as the admin dashboard:

- Handles auth state and sign-in form when logged out
- Loads posts via `GET /api/posts` for editors
- Supports selecting multiple local image files and uploading in one batch via `POST /api/photos`
- Shows post list with status/slug and actions:
  - `New article` -> creates draft via `POST /api/posts` and routes to `/admin/[id]`
  - `Edit` -> `/admin/[id]`
  - `View` -> `/writings/[slug]` for published posts
  - `View photography page` -> `/photography`

### 9.2 Compose/Edit page (`/admin/new`, `/admin/[id]`)

`PostEditorPage.tsx` manages:

- Auth state and sign-in fallback
- Optional existing post load via `GET /api/posts/:id`
- Form fields: title, slug, excerpt, published, markdown content
- Save flow:
  - `POST /api/posts` for create
  - `PATCH /api/posts/:id` for update

### 9.3 Markdown authoring behavior

- Slug auto-generation uses `slugify()` until manual slug edits begin
- Body editing is textarea-based markdown with toolbar actions for:
  - bold, italic, heading, quote
  - links, inline code, code block
  - bulleted/numbered lists
  - footnote insertion
- Visual mode renders markdown with `react-markdown` + `remark-gfm`, allows direct inline editing, and converts edits back to markdown using `turndown` when applied

## 10) Rendering and caching model

- Most public pages are server components.
- Writings and photography pages use ISR (`revalidate = 60`).
- Home-page Spotify data is client-polled and backed by a dynamic no-store API route.
- Admin routes are dynamic/interactive:
  - `export const dynamic = "force-dynamic"` on `app/admin/page.tsx`, `app/admin/new/page.tsx`, and `app/admin/[id]/page.tsx`
  - runtime auth + fetch-based state updates in browser clients

Because admin uses fetch calls to API routes, there is no server action dependency.

## 11) Styling system

All styles are in `app/globals.css` with a lightweight class-based approach:

- CSS variables for palette/sizing (`--bg`, `--fg`, `--border`, etc.)
- Shared layout helpers: `container`, `section`, `card`
- Typographic distinction via sans + serif fonts
- Specific classes for editor/auth/forms and photography mosaic (`editor-shell`, `editor-mode-toggle`, `markdown-editor`, `checkbox-row`, `post-row`, `photo-stage`, `photo-masonry`, `photo-tile`, etc.)

No Tailwind or CSS Modules are used.

## 12) Environment and setup contract

The app reads standard Next.js env files. In this workspace, a root `.env` is used.

Required env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL` (server-side Postgres connection convenience)
- `SUPABASE_DB_URL` (session pooler DSN for SQL tooling)
- `SUPABASE_DB_URL_TRANSACTION` (transaction pooler DSN for SQL tooling)
- `SPOTIFY_CLIENT_ID` (Spotify app client ID)
- `SPOTIFY_CLIENT_SECRET` (Spotify app client secret)
- `SPOTIFY_REFRESH_TOKEN` (OAuth refresh token tied to the Spotify account)
- `SPOTIFY_REDIRECT_URI` (redirect URI used during one-time token bootstrap)
- `SPOTIFY_TIMEZONE` (IANA timezone used for "today" stats; defaults to `America/Chicago`)

Optional env vars:

- `NEXT_PUBLIC_DUOLINGO_STREAK_ICON_DONE` (custom icon URL for "streak completed today")
- `NEXT_PUBLIC_DUOLINGO_STREAK_ICON_PENDING` (custom icon URL for "streak not completed today")

Setup sequence:

1. `npm install`
2. Create `.env` (or `.env.local`) and populate Supabase vars + Spotify `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`, and `TIMEZONE`
3. Generate Spotify refresh token:
   - Run `npm run spotify:token` and open the printed Spotify authorize URL
   - Approve the requested scopes and copy the `code` query parameter from the redirect URL
   - Run `SPOTIFY_AUTH_CODE="<code>" npm run spotify:token` and copy the printed `SPOTIFY_REFRESH_TOKEN`
   - Add that token to `.env`
4. Run SQL in `supabase/schema.sql`
5. Create Supabase auth user
6. Ensure `jasonlatz0@gmail.com` has a `public.profiles` row with `is_editor = true`
7. `npm run dev`
8. Use `/admin` to manage posts and upload photography

### 12.1 Current provisioned state (completed on March 4, 2026 local time)

The following infrastructure work has already been completed in this repository session:

1. Supabase CLI installed locally (`supabase 2.75.0`).
2. Remote database schema applied successfully from `supabase/schema.sql`.
3. Verified remote tables exist:
   - `public.posts`
   - `public.profiles`
4. Verified RLS policies exist:
   - `Editors can manage posts`
   - `Public can read published posts`
   - `Profiles are editable by owner`
   - `Profiles are viewable by owner`
   - `Profiles insert by owner`
   - `Public can read photos bucket`
   - `Editors can upload photos bucket`
   - `Editors can update photos bucket`
   - `Editors can delete photos bucket`
5. Local `.env` populated with project URL + anon key + DB connection URLs.
6. `.gitignore` updated to ignore:
   - `.env`
   - `supabase/.temp`
7. Verified auth user exists:
   - `jasonlatz0@gmail.com`
8. Applied direct Supabase SQL updates:
   - `public.can_self_assign_editor()` function added
   - profile insert/update policies tightened so only `jasonlatz0@gmail.com` can set `is_editor = true`
   - upserted `public.profiles` row for `jasonlatz0@gmail.com` with `is_editor = true`
9. Verified current role state:
   - `jasonlatz0@gmail.com` resolves to editor (`is_editor = true`)
10. Applied and verified photography storage infrastructure on March 3, 2026 (America/Chicago):
   - `storage.buckets` contains `photos` (`public = true`, `file_size_limit = 26214400`)
   - `allowed_mime_types` for `photos`: jpeg/png/webp/gif/avif/heic/heif
   - storage policies for `photos` confirmed in `pg_policies`

### 12.2 Supabase connectivity notes for future agents

For this project reference (`qllalbklzxtsvqzszigo`):

1. Direct host `db.<project-ref>.supabase.co` resolved to IPv6 in this environment and was not reliably routable.
2. Pooler host worked for schema/application tasks:
   - `aws-1-us-east-1.pooler.supabase.com:5432` (session pooler)
   - `aws-1-us-east-1.pooler.supabase.com:6543` (transaction pooler)
3. If direct DB host fails with route/DNS issues, prefer pooler DSNs for CLI and `psql` operations.

### 12.3 Spotify OAuth notes

1. Spotify refresh tokens are generated via `scripts/spotify-refresh-token.mjs` and are not returned by the dashboard UI directly.
2. The helper script auto-loads `.env` and `.env.local`, so `npm run spotify:token` works without manual `export` steps.
3. A refresh token is typically returned only on a fresh authorization; if missing, remove the app from account permissions and re-authorize.
4. Header stats are "same-day within recent 50 plays," so heavy listening sessions may exceed the available history window.
5. Duolingo fire icon state is derived from `streakEndDate` compared to the browser's local calendar date; custom icon URLs can be configured through `NEXT_PUBLIC_DUOLINGO_STREAK_ICON_DONE` and `NEXT_PUBLIC_DUOLINGO_STREAK_ICON_PENDING`.

## 13) Security model summary

The app depends on three layers together:

1. Supabase auth session cookies (middleware + auth helpers)
2. App-level role checks (`requireEditor`) in protected API routes
3. Supabase RLS policies (authoritative DB enforcement, including restricted self-assignment of editor role)

Even if an API check were missed, RLS still limits unauthorized post/storage mutations.

## 14) Known limitations and behavior edges

1. `dangerouslySetInnerHTML` renders stored HTML directly on post pages. There is no explicit sanitization in code, so trust currently relies on editor-only access.
2. Updating a published post resets `published_at`, which changes archive ordering and apparent publish date.
3. No delete/unpublish history or versioning.
4. No tests currently in repo (unit/integration/e2e).
5. No explicit loading/error boundaries for public route fetch failures.
6. Site metadata is generic placeholders (`Your Name`) and should be customized.
7. Spotify "today" stats are approximate because `/me/player/recently-played` returns only the latest 50 tracks.
8. Spotify now-playing and recent-play endpoints depend on account/app permissions and may return `502` via `/api/spotify/live` when OAuth scope or account constraints are not satisfied.
9. Photography mosaic currently derives alt text from file names and orders by storage object creation time; there is no caption/manual ordering UI yet.

## 15) End-to-end request flow examples

### Public archive visit (`/writings`)

1. Request hits Next app route.
2. `WritingsPage` server component calls `fetchPublishedPosts()`.
3. Supabase returns rows where `published = true` (enforced by query + RLS).
4. Page renders cards with title/date/excerpt links.
5. Result can be served from ISR cache for up to 60 seconds.

### Admin save post (`/admin`)

1. User opens `/admin`; signed-in non-editors are redirected to `/writings`.
2. Editor signs in via Supabase auth client (if not already signed in).
3. Editor clicks `New article`; dashboard creates a draft and routes to `/admin/:id`.
4. Editor writes in markdown mode or visual mode, then applies visual edits if needed.
5. Client submits JSON to `PATCH /api/posts/:id` (or `POST /api/posts` when using `/admin/new` fallback).
6. Route handler creates Supabase route client from request cookies.
7. `requireEditor` checks authenticated user + `profiles.is_editor`.
8. On success, handler writes to `public.posts`.
9. RLS re-validates permission at DB layer.
10. Once `published = true`, the article appears on `/writings` and in the home page latest-writing card.

### Admin upload photos (`/admin`)

1. Editor opens `/admin` and signs in (if needed).
2. Editor chooses multiple files from the browser file picker.
3. Client sends multipart request to `POST /api/photos` with `files[]`.
4. Route handler builds Supabase route client from cookies and runs `requireEditor`.
5. Accepted files upload to bucket `photos`; invalid files are reported in `failed[]`.
6. Storage policies re-validate editor permission on object insert/update/delete.
7. `/photography` reads bucket objects via `lib/photos.ts` and renders them in the masonry grid.

## 16) File-by-file quick reference

- `app/layout.tsx`: global app shell and typography setup.
- `app/page.tsx`: landing content + shared one-line activity ribbon.
  - latest writing card is dynamically populated from most recent published post
- `app/photography/page.tsx`: public masonry-style photo gallery page.
- `app/writings/page.tsx`: archive list page for published posts.
- `app/writings/[slug]/page.tsx`: individual published post renderer + metadata.
- `app/experience/page.tsx`: static resume-style profile sections for education, work, projects, skills, and activities.
- `app/admin/page.tsx`: admin route wrapper, forced dynamic render, and signed-in non-editor redirect to `/writings`.
- `app/admin/AdminEditor.tsx`: auth UI + dashboard post list with create/edit/view actions and multi-photo upload.
- `app/admin/PostEditorPage.tsx`: markdown editor form, toolbar shortcuts, and editable single-pane markdown/visual toggle.
- `app/admin/new/page.tsx`: dedicated create route wrapping `PostEditorPage`.
- `app/admin/[id]/page.tsx`: dedicated edit route wrapping `PostEditorPage`.
- `app/api/spotify/live/route.ts`: server route for Spotify now-playing, daily stats, and playlist context.
- `app/api/photos/route.ts`: editor-only multipart photo upload API to Supabase Storage.
- `app/api/posts/route.ts`: list/create post APIs (editor-only).
- `app/api/posts/[id]/route.ts`: fetch/update single post API (editor-only).
- `components/SpotifyNowPlaying.tsx`: resilient polling UI for the Spotify home-page ribbon row (with long-track marquee behavior) + expandable detail panel.
- `components/DuolingoStreak.tsx`: resilient polling UI for the Duolingo home-page ribbon row + expandable detail panel.
- `components/SiteFooter.tsx`: footer with dynamic copyright year and external links to LinkedIn, GitHub, and Instagram.
- `components/SiteNav.tsx`: primary navigation (includes `/photography` link).
- `lib/posts.ts`: public content fetch functions.
  - used by home page and writings pages for published content lists/details
- `lib/photos.ts`: public photo listing helper for the photography mosaic.
- `lib/spotify.ts`: Spotify token refresh, API fetches, and payload shaping.
- `lib/requireEditor.ts`: reusable editor authorization check.
- `lib/date.ts`: date formatting helper.
- `middleware.ts`: Supabase session middleware on admin/api routes.
- `supabase/schema.sql`: complete DB schema + trigger + RLS policies.
- `scripts/spotify-refresh-token.mjs`: local command-line helper for Spotify OAuth token bootstrap.

## 17) Practical next improvements (if you extend this code)

1. Add HTML sanitization before rendering `content`.
2. Preserve original first-publish timestamp (only set `published_at` on first publish).
3. Add DELETE and optional soft-delete/archive behavior.
4. Add automated tests for:
   - `requireEditor`
   - API route auth/validation
   - slug behavior
5. Add better authoring UX (autosave and unsaved-change warning on compose routes).
6. Add photography management controls (manual ordering, captions/alt editing, and delete controls) in `/admin`.

## 18) Repository and git context

1. Remote repository exists and is public:
   - `https://github.com/Jason-Latz/jbl-site`
2. Primary branch:
   - `main`
3. Local `main` is configured to track `origin/main`.

## 19) Local runtime gotchas and resolved issues

1. Initial local run failed with `Module not found: Can't resolve '@/components/...` because path aliases were not configured.
2. `tsconfig.json` now includes:
   - `baseUrl: "."`
   - `paths: { "@/*": ["./*"] }`
3. Next.js dev startup auto-adjusted TS metadata:
   - `include` contains `.next/types/**/*.ts`
   - `plugins` contains `{ "name": "next" }`
4. Dependency install (`npm install`) generated `package-lock.json` and is required before first run.
5. During March 3, 2026 validation, forcing a fixed dev port avoided auto-port fallback (`npm run dev -- --port 3100`) and returned HTTP `200` for `/`, `/writings`, and `/admin`.
6. During March 3, 2026 photography rollout validation, `/photography` also returned HTTP `200` with ISR enabled.
6. Current article body format is markdown-first; legacy HTML bodies still render via fallback in `app/writings/[slug]/page.tsx`.
7. If dev logs show `Failed to find font override values for font Newsreader`, ensure `app/layout.tsx` keeps `adjustFontFallback: false` on the `Newsreader(...)` config.

## 20) Agent checklist (quick start)

1. Confirm env file exists (`.env` or `.env.local`) with all Supabase keys/URLs.
2. Confirm `npm install` has been run (lockfile + `node_modules` present).
3. If Spotify home-page activity is expected to work, ensure `SPOTIFY_REFRESH_TOKEN` is populated (use `npm run spotify:token` to bootstrap it).
4. Start dev server with `npm run dev`.
5. If `/admin` access is needed, ensure `jasonlatz0@gmail.com` exists in `auth.users` and has `profiles.is_editor = true` (unless policy is intentionally changed).
6. Validate key routes: `/`, `/writings`, `/photography`, and `/admin`.
7. If DB schema drift is suspected, re-run `supabase/schema.sql` against pooler endpoint.
