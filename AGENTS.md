# AGENTS.md — context for any AI agent

This file is the entry point for any AI agent (Claude Code, code-review agents, scheduled agents, MCP-based assistants) working on this repo. Read it before editing. For workflow rules specific to Claude Code, also read [CLAUDE.md](CLAUDE.md). For the current task list, read [TASKS.md](TASKS.md).

## Product context

**Zapusk AI Packaging** is an internal tool for the Zapusk.tech team. Zapusk is an investment platform that helps founders package their projects for private investors. The packaging process — turning raw materials (pitch decks, financial models, descriptions) into an investor-ready bundle (one-pager, deck structure, Lovable landing prompt, financial-model prompt, Sales GPT) — is done manually today. This MVP automates that workflow.

**Who uses it:** the Zapusk team internally. Each team member packages 5–20 projects per cycle. Founders may eventually log in directly to track their own packaging.

**What it is not:** it is not a presentation generator. The product is *investment packaging*: every artefact sells investor income (entry size × multiplier × time horizon), not product features.

## Methodology zapped into the prompts

The prompt library encodes Zapusk's lesson methodology. Whenever you touch templates or AI prompts, preserve these principles:

1. **Sell investor income, not product features.** The first slide / hero is always "stake × multiplier × time" — never "what we do."
2. **Napkin first.** The "business on a napkin" (`brief.napkin` JSON) drives all downstream artefacts.
3. **Calculator > P&L.** The investor calculator on the landing is the decision point; the P&L is just the base.
4. **Tracking is the main asset.** Every artefact emphasises growth dynamics ("from N to M over period via [channel]") over static numbers.
5. **Pack per investor type.** Private → income over time. Fund → growth + exit. Strategic → synergies. Grant → social/scientific impact.
6. **AI does not replace understanding.** Output quality = founder context + template + review pass.

## Current architecture

```
zapusk-ai-packaging/
├── server/                            Node.js + Express + Prisma SQLite (ESM)
│   ├── prisma/schema.prisma           11 models (see below)
│   └── src/
│       ├── index.ts                   App entry, mounts /api/* routers + static /uploads
│       ├── env.ts                     dotenv + typed env access
│       ├── db.ts                      Prisma client singleton
│       ├── auth.ts                    Single-user dev auth via x-user-email
│       ├── ai/
│       │   ├── client.ts              Provider-agnostic aiComplete() with mock fallback
│       │   ├── mock.ts                Deterministic mock for napkin/brief
│       │   └── prompts.ts             System prompt for brief extractor
│       ├── services/
│       │   ├── briefService.ts        generateBrief — runs file extraction → AI → upsert brief
│       │   ├── promptBuilders.ts      generatePrompt (with optional feedback) + generateAllPrompts
│       │   ├── packageService.ts      generateFullPackaging + streamProjectZip
│       │   ├── fileParser.ts          PDF/DOCX/XLSX/TXT → text extraction (per-file 30K cap)
│       │   ├── storage.ts             Storage interface; LocalStorage impl
│       │   ├── templateSeeds.ts       10 prompt templates (Zapusk methodology)
│       │   └── demoSeeds.ts           3 archetype demo projects (SaaS · Real estate · Small offline)
│       ├── routes/
│       │   ├── auth.ts                /api/auth/login + /api/auth/me
│       │   ├── projects.ts            CRUD /api/projects
│       │   ├── files.ts               Upload + link + list + delete
│       │   ├── brief.ts               Generate + get
│       │   ├── prompts.ts             Generate one (with feedback) / all / full-packaging
│       │   ├── templates.ts           List + read + update
│       │   ├── exportRoute.ts         JSON export + ZIP export + per-artefact .md download
│       │   ├── admin.ts               Read-only project list across all users
│       │   └── reviews.ts             Upsert review (per artefact per reviewer)
│       ├── integrations/              Lovable · CloudDesign · Canva · Directual · ZapuskPlatform stubs
│       └── seed.ts                    Idempotent upsert of templates + demo projects
└── web/                               Vite + React 18 + Tailwind
    ├── tailwind.config.ts             Design tokens (canvas, surface, zapusk, ai, semantic, Montserrat)
    └── src/
        ├── App.tsx                    Router (14 routes)
        ├── index.css                  CSS variables mirroring Tailwind tokens
        ├── lib/
        │   ├── api.ts                 Fetch wrapper + TS types for all entities
        │   ├── auth.ts                localStorage-backed session
        │   ├── format.ts              Money / percent / date helpers + PROMPT_KIND_LABELS
        │   ├── progress.ts            computeProgress (7-step packaging journey)
        │   ├── promptKinds.ts         ALL_PROMPT_KINDS constant
        │   └── reviews.ts             buildReviewIndex · getReview · computePackagingQualityScore
        ├── components/
        │   ├── layout/                AppLayout (route guard) · Sidebar · Topbar
        │   └── ui/                    17 components (Button, Card, GeneratedAssetCard, ReviewBlock, MissingDataPanel, …)
        └── pages/                     14 routes (5 fully built, 9 functional with varying depth)
```

## Data model (Prisma)

11 entities. Key relationships:

- `User` 1—* `Project`
- `Project` 1—1 `ProjectBrief`, `InvestorTerms`
- `Project` 1—* `UploadedFile`, `GeneratedPrompt`, `GeneratedDocument`, `ArtefactReview`, `ReferenceMaterial`
- `PromptTemplate` standalone (master library, keyed by `key`)
- `FinancialModelTemplate` standalone

`ProjectBrief.missingByCategory` is JSON with 6 keys: `financial`, `market`, `team`, `deal`, `unit_econ`, `risks`.

`ArtefactReview` is keyed by `(projectId, artefactKind, artefactKey, reviewer)` — one running review per reviewer per artefact; updates upsert.

`GeneratedPrompt.feedback` stores the human note that produced this version (when regenerate-with-feedback was used).

## API surface (stable contracts)

Web client depends on these. Don't change shapes without updating both sides in the same change.

```
GET    /health
POST   /api/auth/login                          { email, name? } → { user }
GET    /api/auth/me

GET    /api/projects                            → { projects }
POST   /api/projects                            → { project }
GET    /api/projects/:id                        → { project } incl. files, brief, generatedPrompts, generatedDocs
PATCH  /api/projects/:id
DELETE /api/projects/:id

POST   /api/files/:projectId/upload             multipart, field "files"
POST   /api/files/:projectId/link               { category, url, note }
GET    /api/files/:projectId
DELETE /api/files/:projectId/:fileId

POST   /api/brief/:projectId/generate           → { brief, ai }
GET    /api/brief/:projectId

GET    /api/prompts/:projectId
POST   /api/prompts/:projectId/generate/:kind   { feedback? } → { prompt }
POST   /api/prompts/:projectId/generate-all
POST   /api/prompts/:projectId/generate-full-packaging  brief + all 10 prompts

GET    /api/templates
GET    /api/templates/:id
PATCH  /api/templates/:id

GET    /api/projects/:projectId/export          full JSON dump
GET    /api/projects/:projectId/export/zip      streamed ZIP (15 files)
GET    /api/projects/:projectId/prompts/:promptId.md
GET    /api/projects/:projectId/documents/:docId.md

POST   /api/reviews                             upsert { projectId, artefactKind, artefactKey, artefactId?, score, comment?, approved?, needsRework? }
GET    /api/reviews/project/:projectId
DELETE /api/reviews/:id

GET    /api/admin/projects
GET    /api/admin/health/details                  ADMIN/MANAGER — disk, model env, integrations
GET    /api/admin/ai/active-models                ADMIN/MANAGER — per-feature model resolution table (Sprint 62.P1)
```

All `/api/*` routes (except `/api/auth/login`) require `x-user-email` header.

### AI model configuration (Sprint 62.P1)

Single source of truth for which model answers each feature:

| Source                          | Where                                | Read by backend?                |
| ------------------------------- | ------------------------------------ | ------------------------------- |
| `server/.env`                   | local backend dev                    | YES (via `dotenv/config`)       |
| Render dashboard env            | production runtime                   | YES (overrides server/.env)     |
| root `/.env`                    | repo root                            | **NO — never read; gitignored** |
| `web/.env`                      | Vite SPA                             | YES, but only `VITE_*` vars     |
| `PromptTemplate.model` (DB)     | admin UI                             | Only for `realtime_transcription` |

Runtime model resolution chain (per AI call):

```
template.model (only if route honors it — see below)
   → env.OPENAI_MODEL_<MAIN|FAST|REALTIME|TRANSCRIBE>
      → hard default in env.ts ('gpt-4o' / 'gpt-4o-mini' / …)
```

Per-feature route table:

| Feature                            | Route     | Env var                          | Template override?       |
| ---------------------------------- | --------- | -------------------------------- | ------------------------ |
| `sales_assistant.prepare`          | main¹     | `OPENAI_MODEL_MAIN`              | NO (informational)       |
| `sales_assistant.analyze`          | main      | `OPENAI_MODEL_MAIN`              | NO (informational)       |
| `sales_assistant.analyze_fast`     | fast      | `OPENAI_MODEL_FAST`              | NO (informational)       |
| `realtime.transcription`           | realtime  | `OPENAI_MODEL_REALTIME_TRANSCRIBE` | **YES**                |
| `transcription` (file upload)      | transcribe| `OPENAI_MODEL_TRANSCRIBE`        | **YES**                  |
| `brief.generate` / `regenerate`    | main      | `OPENAI_MODEL_MAIN`              | NO                       |
| `classification` / `metadata`      | fast      | `OPENAI_MODEL_FAST`              | NO                       |

¹ `DEMO_FAST_AI_MODE=true` switches prepare to fast route (gpt-4o-mini) for live demos.

Diagnostics:
- `npm run env:doctor` — safe env summary + suspicious model detection (e.g. `gpt-5.5`).
- `npm run db:doctor` — read-only DB structure check.
- `GET /api/admin/ai/active-models` — per-feature live resolution + last ledger entry.
- Every AI call logs `[ai/model-resolved] feature=… provider=… route=… finalModel=… source=… envVar=…`.

When upstream returns `model_not_found` / 404 / `invalid_model`, the AI client throws `AIModelConfigError(502)` — NO silent mock fallback for misconfigured model names.

## What is already implemented

See README.md `## What works end-to-end` for the canonical list. Highlights:

- Full Sprint 1 (vertical slice): design system + UI Kit + 14 routes + Express + Prisma + AI mock + ZIP/JSON export
- Full Sprint 2: Zapusk methodology in templates · PDF/DOCX/XLSX parsing → AI · Generate Full Packaging · demo project Венский ветер
- Full Sprint 3: Artefact reviews (1-5 + checkboxes) · Packaging Quality Score · regenerate-with-feedback · 6-category missing data · 3 more demo projects (Tappsk Pro, Apart-отель Чарыш, Кофе с собой) · Internal Guide page

## Definition of Done

A change is done when:

1. **Both type-checks pass** (`server/` and `web/` `npx tsc --noEmit`)
2. **The seed runs cleanly** (`npm run db:seed`) — demo projects must always be restorable
3. **The affected runtime path is sanity-checked** — curl for backend, one screenshot for visible UI changes
4. **TASKS.md is updated** — the completed item moves to `## Completed`; any newly-discovered issue is added to `## Known issues`
5. **No dead code is shipped** — if an import is unused because you removed its only consumer, delete the import

## Things AI agents must not do

- Massive refactors not authorised in the current task
- Renaming files for style ("ProjectCockpit.tsx" → "Cockpit.tsx") — every rename is a merge-conflict for parallel agents
- Switching the auth model away from `x-user-email` header (a real auth pass is its own task)
- Hardcoding hex colours in components — always use Tailwind tokens
- Introducing new dependencies without explicit approval
- Bypassing the AI mock fallback — the app must remain usable without API keys
- Editing applied Prisma migrations — generate a new one
- Removing the Russian-language UI copy without translation
- Adding tests, CI, or docs that the user did not request

## Priorities

The current sprint priorities live in [TASKS.md](TASKS.md). When in doubt, do the smallest change that moves the top item forward.
