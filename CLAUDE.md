# CLAUDE.md — operating rules for Claude Code

Read this before making changes to the Zapusk AI Packaging repo. These rules exist to keep the MVP shippable while many AI agents (Claude Code, code-review agents, scheduled agents) can touch the code safely.

For project context (what the app is, how it works, current architecture), read [AGENTS.md](AGENTS.md). For active work, read [TASKS.md](TASKS.md).

## Hard rules

1. **No large refactors without explicit approval.** If a change touches more than ~6 files or removes a working abstraction, stop and ask first. "While I'm here, let me clean up …" is forbidden.

2. **Type-check after every change.** Both sides must pass:

   ```bash
   ( cd server && npx tsc --noEmit )
   ( cd web    && npx tsc --noEmit )
   ```

   A change is not done if either fails. Do not silence errors with `any` or `@ts-ignore` — fix the cause.

3. **Build must work.** When the change is substantive, run:

   ```bash
   npm run build
   ```

   from the project root. Server compiles via `tsc`, web via `vite build`. If either step fails, the change is not done.

4. **Update [TASKS.md](TASKS.md) when work lands.** Move items from `## In progress` → `## Completed (this sprint)` in the same change set. If you discover a new bug, add it under `## Known issues`. If you finish the whole sprint, move it under a dated section in `## Completed (history)`.

5. **Never bypass safety in git.** No `--no-verify`, no `--force` push, no `git reset --hard` on shared branches. If a hook fails, fix the cause.

5a. **Never set `AI_PROVIDER=mock` for production.** The AI client silently falls back to mock output when the real provider fails, so a mocked prod looks healthy while serving fake answers. Mock is only allowed in:
   - Local dev (default).
   - Tests.
   - An explicitly demo Render environment where both `AI_PROVIDER=mock` *and* `ALLOW_MOCK_AI_IN_PRODUCTION=true` are set in the dashboard. `/health.ai.warning` will still surface this to operators.

   When in doubt: `AI_PROVIDER=openai` (or `anthropic`) for any environment a real user can reach. `render.yaml` must ship a real provider value as the default.

5b. **Model config — single source of truth (Sprint 62.P1).** Backend reads OPENAI_MODEL_* / ANTHROPIC_MODEL_* from `server/.env` (local) or the Render dashboard (prod). Root `/.env` is NOT read by the backend — never put live config there.
   - `PromptTemplate.model` only overrides the model for **transcription routes** (`realtime_transcription` template). For every other feature (sales_assistant.*, brief.*, packaging.*) it is **informational** — runtime uses `OPENAI_MODEL_MAIN` / `OPENAI_MODEL_FAST`. The UI shows a warning when an admin sets template.model on a non-transcription template.
   - Invalid model names (e.g. `gpt-5.5`) NO LONGER silently fall back to mock. The AI client throws `AIModelConfigError(502, 'model_not_found')` and the user sees an explicit error. Mock fallback is only used for transient errors (timeouts, 5xx) and for `AI_PROVIDER=mock` / missing key.
   - To inspect what model actually answers a feature right now: `GET /api/admin/ai/active-models` (ADMIN/MANAGER) or `npm run env:doctor` from the project root.
   - Every AI call emits `[ai/model-resolved] feature=… provider=… route=… finalModel=… source=… envVar=…` — greppable for ops.
   - `DEMO_FAST_AI_MODE=true` switches `sales_assistant.prepare` from MAIN (gpt-4.1) to FAST (gpt-4o-mini) for snappier live demos. Default OFF.

6. **Don't run destructive DB commands without asking.** `prisma migrate reset`, dropping tables, manual SQL — confirm with the user. `prisma migrate dev` for additive changes is fine.

7. **Respect existing endpoint contracts.** Routes documented in [AGENTS.md](AGENTS.md) under `## API surface` are used by the web client; do not change request/response shapes without updating both sides in the same change.

## How to make a change

1. **Read [TASKS.md](TASKS.md)** to confirm the task is the current one, not a stale leftover.
2. **Read the file you're changing** before editing. Don't rely on assumptions about its current state.
3. **Edit narrowly.** Default to `Edit` (which sends only the diff) over `Write` (which rewrites the file). Keep the diff minimal.
4. **Type-check.** Run the commands in rule #2.
5. **Smoke-test the affected path** if it has a runtime surface. For backend changes that's `curl` against the running API; for frontend that's a quick `preview_screenshot` of one screen. Don't burn tokens on screenshots when the change is obviously cosmetic or a pure refactor.
6. **Update TASKS.md** in the same change.

## Decisions you can take yourself

- File-local renames / variable extraction (one file, no API impact)
- Adding a new route under an existing pattern (e.g. another `/api/reviews/*` endpoint that follows the existing shape)
- Adding a new UI page that uses existing components from `web/src/components/ui/`
- Adding new prompt templates to `server/src/services/templateSeeds.ts`
- Adding new demo data to `server/src/services/demoSeeds.ts`
- Updating copy / labels in Russian

## Decisions that require asking the user first

- Schema migrations that drop columns or rename tables (additive migrations are fine)
- Changing the design tokens in `tailwind.config.ts` (colours, radii, fonts)
- Introducing a new dependency (any `npm install` of a new package)
- Replacing the auth model (MVP is single-user via `x-user-email` header)
- Replacing the AI provider abstraction shape
- Anything that breaks the seed (the demo projects must always load)

## Working conventions

- **Comments:** lean. Only write a comment when the *why* is non-obvious. Don't narrate what the code does.
- **No new top-level Markdown docs** unless the user asks. README, CLAUDE.md, AGENTS.md, TASKS.md are the only top-level docs.
- **Russian copy in UI; English in code.** Identifiers, comments, commit messages are English. UI labels and prompts can be Russian (the product is Russian-first).
- **Design tokens come from `tailwind.config.ts` + `web/src/index.css`.** Components reference Tailwind classes, never hard-coded hex.
- **Mock layer must keep working.** Any change to AI plumbing must still produce a usable result with `AI_PROVIDER=mock`.

## Verification checklist before claiming a task is done

- [ ] `server/` `tsc --noEmit` passes
- [ ] `web/` `tsc --noEmit` passes
- [ ] `npm run db:seed` runs successfully (it's idempotent — seed restores demo state)
- [ ] If routes changed: `curl` smoke-test of at least one new endpoint returns expected JSON
- [ ] If UI changed in a visible way: one `preview_screenshot` confirms it renders without console errors
- [ ] TASKS.md updated with the completed item

## Things to avoid

- Adding "TODO" or "FIXME" comments without a corresponding entry in TASKS.md
- Adding loading spinners / error toasts for invariants that can't fail (rule: validate only at system boundaries)
- Renaming files just for style — the import graph is small, but every rename is a merge-conflict surface for parallel agents
- Editing `prisma/migrations/*` after they've been applied — generate a new migration instead
- Removing unused imports in unrelated files "while you're there" — leave them; they don't break the build
