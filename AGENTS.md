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

## 9) Jason Preference: Simplicity with Reliability

When choosing between solutions:

1. Prefer the simplest implementation that keeps core user flows working reliably.
2. Prioritize fixes for user-facing breakage or confusing behavior before adding theoretical hardening.
3. If a risk is low-probability and editor-only, it may be deferred when documented clearly.
