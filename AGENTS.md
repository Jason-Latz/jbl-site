# AGENTS.md

Repository-level instructions for coding agents working in this project.

## 1) Required First Read

Before making changes, read:

- `CODEBASE_GUIDE.md`

Treat it as the architecture and infrastructure source of truth for this repo.

## 2) Documentation Rule

If you change anything that affects architecture, infra, setup, runtime behavior, or deployment assumptions:

1. Update `CODEBASE_GUIDE.md` in the same task.
2. Keep updates concrete (exact file paths, commands, env vars, and behavior changes).
3. Do not leave infrastructure changes only in chat history.

## 3) Mandatory AGENTS.md Maintenance

If architecture or infrastructure changes are pushed, this is mandatory:

1. Immediately review this repo `AGENTS.md`.
2. Update this repo `AGENTS.md` if any new rule, workflow, caveat, or preference should be captured.
3. Do not consider the work complete until `AGENTS.md` has been reviewed for required updates.
4. `AGENTS.md` should always be kept current with real operating practices in this repository.

## 4) Environment and Secrets

1. Do not commit secrets or private keys.
2. Keep `.env` local-only.
3. Preserve ignore rules that protect local artifacts (`.env`, `supabase/.temp`, etc.).

## 5) Supabase and Database Operations

1. Prefer the configured Supabase pooler URLs for CLI/`psql` operations when direct DB host routing is unreliable.
2. Keep `supabase/schema.sql` and `CODEBASE_GUIDE.md` aligned with real database shape/policies.
3. When schema/policies are changed, document verification steps/results in `CODEBASE_GUIDE.md`.

## 6) Local Validation Baseline

After relevant changes, validate at minimum:

1. `npm install` (if dependencies changed)
2. `npm run dev`
3. HTTP success for:
   - `/`
   - `/writings`
   - `/photography`
   - `/admin`

## 7) Handoff Standard

Assume a future agent has no chat context. `CODEBASE_GUIDE.md` must be sufficient for them to:

1. Understand system design
2. Configure the environment
3. Run the app locally
4. Continue work safely

## 8) Commit Strategy (Mandatory)

Err on the side of more commits, not fewer.

1. If changes represent different features, fixes, refactors, or docs updates, commit them separately.
2. Keep commits modular so each commit has one clear purpose.
3. Use explicit commit messages that describe exactly what changed and why.
4. Avoid bundling unrelated changes into one commit.
5. Keep `AGENTS.md` updates in their own commit, separate from `CODEBASE_GUIDE.md` and code changes.
6. Run git staging/commit commands sequentially (not in parallel) to avoid `.git/index.lock` conflicts.

## 9) Jason Preference: Simplicity with Reliability

When choosing between solutions:

1. Prefer the simplest implementation that keeps core user flows working reliably.
2. Prioritize fixes for user-facing breakage or confusing behavior before adding theoretical hardening.
3. If a risk is low-probability and editor-only, it may be deferred when documented clearly.

## 10) Jason Preference: Keep AGENTS.md Lean

For AGENTS maintenance:

1. Record only durable, cross-task preferences and learnings.
2. Do not add one-off content values (for example single URL/handle tweaks) unless they affect security, access control, or recurring workflow.
3. Prefer keeping implementation-specific facts in code or `CODEBASE_GUIDE.md` instead of expanding AGENTS.md.
4. Add new AGENTS rules only when they are critical to recurring workflow, security, permissions, validation, or commit hygiene.
5. If a note is feature-specific or likely temporary, do not add it to AGENTS.md; keep it in `CODEBASE_GUIDE.md` instead.

## 11) Jason Preference: Work Through Unrelated Diffs

When the working tree shows unrelated modifications:

1. Continue with the current task unless there is a direct conflict in the same files/regions being edited.
2. Surface direct conflicts clearly once, then proceed based on Jason's instruction.
3. Ignore unrelated files by default and do not stage or commit them unless Jason explicitly asks.
4. When committing, include only files changed for the current request.

## 12) Jason Preference: Editor Access Must Stay Owner-Only

For admin/editor permissions:

1. Default to owner-only editing for `jasonlatz0@gmail.com` unless Jason explicitly asks to broaden access.
2. Do not rely only on UI gating; enforce this in Supabase policies and app-level route/API checks.
3. If changing auth or profile policies, verify non-owner users cannot self-promote to `is_editor = true`.

## 13) Jason Preference: Keep Integrations, Layer Visuals

When Jason requests visual changes on existing data integrations:

1. Keep the current API/data flow intact unless he explicitly asks for backend changes.
2. Implement the requested icons/artwork/status visuals with minimal behavioral changes.
3. Prefer configurable visual asset URLs when practical.

## 14) Jason Preference: Blog Authoring Should Be Markdown-First

For blog/editor UX work:

1. Prefer creating a draft first and opening its dedicated editor route (`/admin/[id]`) instead of editing inline on the dashboard.
2. Prefer a single-pane writer with a `Markdown/Visual` toggle over side-by-side split editing.
3. In visual mode, keep direct inline editing available and sync those edits back to markdown source.
4. Keep easy formatting actions (bold/italic/headings/lists/links/code) and footnote support available.
5. Do not require a manual “apply preview edits” action; inline visual edits should auto-sync and existing drafts should autosave.

## 15) Local Validation Caveat: No curl in Shell

For local HTTP route validation in this environment:

1. Do not assume `curl` is installed.
2. Prefer `node -e`/Node `fetch` for status checks when validating `npm run dev` routes.

## 16) Jason Preference: Media Uploads Should Be In-Site

When adding or changing media workflows:

1. Prefer upload flows inside the website admin UI over CLI-only workflows.
2. Support selecting and uploading multiple files in one action through the browser picker.

## 17) Jason Preference: Spotify Widget Should Be Home-Only

For Spotify surface placement:

1. Render `SpotifyNowPlaying` on `/` only, not in global layout.
2. Keep site-wide pages free of Spotify status cards unless Jason explicitly asks to re-enable global placement.

## 18) Jason Preference: Keep Home Activity Widgets Compact

For Spotify and Duolingo surfaces on `/`:

1. Keep both widgets in one shared horizontal ribbon row on desktop (not stacked cards).
2. Keep full widget details available via click-to-expand dropdown panels.
3. Use caret-only affordances for expand/collapse; avoid extra "Details" label text in the ribbon row.
4. For Spotify summary text, prefer overflow-safe behavior (for example marquee-style scrolling) instead of growing ribbon height.

## 19) Jason Preference: Photography Should Be Gapless and Metadata-Driven

For the public photography and admin photo workflow:

1. Keep the public photography mosaic gapless (no spacing/gutters between photos).
2. Clicking a photo on `/photography` should show user-entered metadata: location, description, and optional song link.
3. Keep that metadata editable in `/admin` so gallery details can be updated without CLI or SQL work.
4. For photography performance tuning, preserve visual quality first; prefer progressive/top-down loading deferral before reducing image quality.
