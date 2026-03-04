# Personal Website Codebase Guide

This document explains how the site is structured, how data and auth flow through the app, and how each major file contributes to behavior.

## 1) What this project is

This is a **Next.js 14 App Router** project for a personal website with:

- Public pages: home, writings archive, individual writing pages, and experience
- A protected admin editor at `/admin`
- Supabase-backed storage for posts and editor permissions
- TipTap rich-text editor for writing content

The site is intentionally minimal and server-rendered where possible.

## 2) Tech stack

- Framework: `next@14.2.5` (App Router)
- Language: TypeScript (`strict: true`)
- UI: React 18 + plain CSS (`app/globals.css`)
- DB/Auth: Supabase (`@supabase/supabase-js`, `@supabase/auth-helpers-nextjs`)
- Rich text editor: TipTap (`@tiptap/react`, `@tiptap/starter-kit`, link extension)

## 3) Directory map

```
app/
  layout.tsx               # Global shell (header/nav/main/footer) + metadata
  page.tsx                 # Home page
  globals.css              # Global styles and component utility classes
  experience/page.tsx      # Static experience timeline
  writings/page.tsx        # Published writings list page
  writings/[slug]/page.tsx # Single published post page
  admin/page.tsx           # Admin page wrapper
  admin/AdminEditor.tsx    # Client-side auth + editor UI + CRUD actions
  api/posts/route.ts       # GET all posts (editor-only), POST create post
  api/posts/[id]/route.ts  # PATCH update post (editor-only)

components/
  SiteNav.tsx              # Main nav links
  SiteFooter.tsx           # Footer

lib/
  posts.ts                 # Supabase public-read helpers for published content
  requireEditor.ts         # Shared authorization check for API routes
  date.ts                  # Date formatting helper

supabase/
  schema.sql               # Tables, trigger, indexes, RLS policies

middleware.ts              # Initializes Supabase auth session for /admin and /api
```

## 4) Runtime architecture

### 4.1 App shell and layout

`app/layout.tsx` is the root layout and does four key things:

1. Loads Google fonts (`Inter`, `Newsreader`) and exposes them as CSS variables.
2. Defines base metadata (`title`, `description`) for the whole site.
3. Renders global chrome: header with site title + nav, main content container, footer.
4. Applies shared container widths and spacing through global CSS classes.

This means every route is rendered inside the same visual shell by default.

### 4.2 Public pages

- `/` (`app/page.tsx`): static hero content, a sample “latest writing” card, and a “now” card.
- `/experience` (`app/experience/page.tsx`): static in-file array rendered as cards.
- `/writings` (`app/writings/page.tsx`): server component fetching published posts from Supabase via `lib/posts.ts`.
- `/writings/[slug]` (`app/writings/[slug]/page.tsx`): server component fetching one published post by slug; returns `notFound()` if missing.

Both writings routes set `export const revalidate = 60`, so page data is ISR-cached for up to 60 seconds.

### 4.3 Admin area

- `/admin` is rendered by `app/admin/page.tsx` and includes `AdminEditor`.
- `AdminEditor.tsx` is a client component because it needs:
  - browser auth session state
  - interactive editor behavior
  - direct API calls for CRUD

Admin UI behavior:

1. On mount, it checks Supabase auth session.
2. If no session, it renders a sign-in form (`signInWithPassword`).
3. If authenticated, it loads posts from `/api/posts`.
4. User can create a new draft, edit existing posts, toggle publish state, and save.
5. Rich content is stored as HTML from TipTap (`editor.getHTML()`).
6. Sign-out clears local editor/post state.

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
- `content` (optional, HTML text)
- `published` (boolean, default false)
- `published_at` (nullable timestamp)
- `created_at`, `updated_at`

Index: `posts_published_at_idx` on `published_at DESC` for archive ordering.

Trigger: `set_updated_at` updates `updated_at` automatically before updates.

### 5.2 Row-Level Security

RLS is enabled on both tables.

Policies:

- Profiles:
  - owner can `select`, `update`, and `insert` own profile row
- Posts:
  - anyone can `select` rows where `published = true`
  - editor users can perform all operations (`for all`) if their profile has `is_editor = true`

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

### `GET /api/posts` (`app/api/posts/route.ts`)

- Requires editor role
- Returns all posts (draft + published), newest by `created_at`
- Used by admin list view

### `POST /api/posts` (`app/api/posts/route.ts`)

- Requires editor role
- Validates `title` and `slug`
- Inserts post with provided fields
- Sets `published_at` to now if `published === true`, else `null`

### `PATCH /api/posts/:id` (`app/api/posts/[id]/route.ts`)

- Requires editor role
- Same validation as POST
- Updates post fields and publication timestamp

Important current behavior:

- If an already-published post is edited while still published, `published_at` is reset to “now”.
- There is no DELETE route currently.
- API does not do server-side slug normalization; UI generates slugs but API trusts input.

## 8) Public data-fetching helpers (`lib/posts.ts`)

`lib/posts.ts` creates a Supabase client from:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Functions:

- `fetchPublishedPosts()`:
  - returns only published records
  - excludes full `content` for list efficiency
  - ordered by `published_at DESC`
- `fetchPostBySlug(slug)`:
  - returns one published post including full HTML content

Both are wrapped in React `cache(...)`, so repeated calls during one render tree reuse results.

If env vars are missing, helpers safely return empty/null data rather than throwing.

## 9) Rich-text editor details (`app/admin/AdminEditor.tsx`)

### 9.1 State model

Editor manages:

- Auth state: session, auth message, sign-in credentials
- Post list state: `posts`, loading flag
- Form state: title, slug, excerpt, published, content
- UI state: active post ID, save status, slug auto/manual mode

### 9.2 Slug handling

`slugify()`:

- lowercases
- trims
- removes non `[a-z0-9\\s-]`
- converts whitespace to hyphens
- collapses repeated hyphens

When typing title:

- slug auto-updates until user manually edits slug (`slugEdited` flag)
- after manual edit, title no longer overrides slug

### 9.3 TipTap syncing

TipTap is initialized with current `content`.
There is a synchronization effect that resets editor content when active post changes.

This avoids stale editor text when switching between posts/drafts.

## 10) Rendering and caching model

- Most public pages are server components.
- Writings pages use ISR (`revalidate = 60`).
- Admin page is dynamic/interactive:
  - `export const dynamic = "force-dynamic"` on `app/admin/page.tsx`
  - runtime auth + fetch-based state updates in browser

Because admin uses fetch calls to API routes, there is no server action dependency.

## 11) Styling system

All styles are in `app/globals.css` with a lightweight class-based approach:

- CSS variables for palette/sizing (`--bg`, `--fg`, `--border`, etc.)
- Shared layout helpers: `container`, `section`, `card`
- Typographic distinction via sans + serif fonts
- Specific classes for editor/auth/forms (`editor-shell`, `form-grid`, `post-row`, etc.)

No Tailwind or CSS Modules are used.

## 12) Environment and setup contract

Required env vars (in `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Setup sequence:

1. `npm install`
2. Copy `.env.example` to `.env.local`
3. Run SQL in `supabase/schema.sql`
4. Create Supabase auth user
5. Insert/update profile row with `is_editor = true`
6. `npm run dev`
7. Use `/admin` to manage posts

## 13) Security model summary

The app depends on three layers together:

1. Supabase auth session cookies (middleware + auth helpers)
2. App-level role checks (`requireEditor`) in protected API routes
3. Supabase RLS policies (authoritative DB enforcement)

Even if an API check were missed, RLS still limits unauthorized post mutations.

## 14) Known limitations and behavior edges

1. `dangerouslySetInnerHTML` renders stored HTML directly on post pages. There is no explicit sanitization in code, so trust currently relies on editor-only access.
2. Updating a published post resets `published_at`, which changes archive ordering and apparent publish date.
3. No delete/unpublish history or versioning.
4. No tests currently in repo (unit/integration/e2e).
5. No explicit loading/error boundaries for public route fetch failures.
6. Site metadata is generic placeholders (`Your Name`) and should be customized.

## 15) End-to-end request flow examples

### Public archive visit (`/writings`)

1. Request hits Next app route.
2. `WritingsPage` server component calls `fetchPublishedPosts()`.
3. Supabase returns rows where `published = true` (enforced by query + RLS).
4. Page renders cards with title/date/excerpt links.
5. Result can be served from ISR cache for up to 60 seconds.

### Admin save post (`/admin`)

1. User signs in via Supabase auth client.
2. Editor submits JSON to `POST /api/posts` or `PATCH /api/posts/:id`.
3. Route handler creates Supabase route client from request cookies.
4. `requireEditor` checks authenticated user + `profiles.is_editor`.
5. On success, handler writes to `public.posts`.
6. RLS re-validates permission at DB layer.
7. Client refreshes post list via `GET /api/posts`.

## 16) File-by-file quick reference

- `app/layout.tsx`: global app shell and typography setup.
- `app/page.tsx`: static landing content.
- `app/writings/page.tsx`: archive list page for published posts.
- `app/writings/[slug]/page.tsx`: individual published post renderer + metadata.
- `app/experience/page.tsx`: static experience timeline.
- `app/admin/page.tsx`: admin route wrapper, forced dynamic render.
- `app/admin/AdminEditor.tsx`: auth UI, editor UI, and post CRUD client logic.
- `app/api/posts/route.ts`: list/create post APIs (editor-only).
- `app/api/posts/[id]/route.ts`: update post API (editor-only).
- `lib/posts.ts`: public content fetch functions.
- `lib/requireEditor.ts`: reusable editor authorization check.
- `lib/date.ts`: date formatting helper.
- `middleware.ts`: Supabase session middleware on admin/api routes.
- `supabase/schema.sql`: complete DB schema + trigger + RLS policies.

## 17) Practical next improvements (if you extend this code)

1. Add HTML sanitization before rendering `content`.
2. Preserve original first-publish timestamp (only set `published_at` on first publish).
3. Add DELETE and optional soft-delete/archive behavior.
4. Add automated tests for:
   - `requireEditor`
   - API route auth/validation
   - slug behavior
5. Add better authoring UX (autosave, unsaved change warning, formatting toolbar buttons).

