# TASKS.md — task tracker

Single source of truth for what's done, in progress, and next. Update this file in the same change as the work.

Last updated: 2026-05-13 (Sprint 1: roles + admin + manager + demo cabinet).

---

## CURRENT ARCHITECTURE

Monorepo with two apps sharing a root that holds AI-agent docs and dev scripts:

```
zapusk-ai-packaging/
├── README.md · CLAUDE.md · AGENTS.md · TASKS.md   AI-ready repo
├── package.json                                   root scripts via concurrently
├── .env.example
├── server/        Express + Prisma SQLite + AI layer + integration stubs
└── web/           Vite + React + Tailwind (dark-cockpit tokens, Montserrat)
```

**Server.** Node + Express (ESM, `tsx watch` in dev). 11 Prisma models. AI client is provider-agnostic — chooses Anthropic / OpenAI / mock via `AI_PROVIDER` env. File-content extraction (PDF/DOCX/XLSX/TXT) feeds the brief AI context. Routes split by domain (auth, projects, files, brief, prompts, templates, exportRoute, admin, reviews). Storage abstracted behind a single-method interface so S3 drops in later. Integrations are typed placeholders. Seed is idempotent and recreates the demo data on every run.

**Web.** React 18 + react-router v6 + Tailwind. Design tokens in `tailwind.config.ts` + `index.css` (canvas/surface/zapusk/ai/semantic palette + Montserrat). 17 UI components. 14 routes — 5 fully built, 9 functional at varying depth. Reviews are inline on artefact cards; PQS aggregates them on the Review page. The AI mock fallback means every flow works without API keys.

**Data flow.** Project → Brief (AI + parsed materials → napkin + categorized missing data) → 10 Prompt Templates filled with project context → ZIP package for the team to feed into Lovable / Claude / Cloud Design / kustom GPT. Team reviews each artefact, leaves feedback, regenerates with notes that ride along in the next version.

---

## Completed (this sprint — roles + admin + demo cabinet 2026-05-13)

- [x] Light theme is now the default for new users; saved `zapusk.theme` values are preserved and dark mode stays available through the theme toggle.
- [x] Added MVP roles: `client`, `manager`, `admin`. The role is stored in demo auth state and sent as `x-user-role` with API calls.
- [x] Added role-based frontend routing: admin and manager pages redirect away when the current role is not allowed.
- [x] Added role-based sidebar navigation:
  - client: Рабочий стол, Новый проект, Демо-кабинет, AI-лиды, AI-ассистент, Персональный менеджер, База знаний.
  - manager: Рабочий стол менеджера, Мои проекты, Новые лиды, Встречи, Задачи, Клиенты.
  - admin: Админ-панель, Все проекты, Пользователи, Шаблоны, Лиды, Материалы, Настройки.
- [x] Added backend role guards for admin/manager surfaces:
  - `/api/admin/*` → `admin` only.
  - `/api/templates/*` → `admin` only.
  - `/api/manager/*` → `manager` or `admin`.
- [x] Added `/admin` dashboard with KPI cards, full projects table, users overview, leads/materials/settings sections and quick actions.
- [x] Added `/manager` workspace with project pipeline, tasks, stuck projects, new lead indicators and next-step prompts.
- [x] Added `/personal-manager` page and reusable personal manager card; surfaced it in Sidebar, Dashboard and Project Cockpit.
- [x] Added reusable Project Journey component with 10 stages: brief, marketing packaging, legal packaging, AI leads, investor meetings, deal mechanics, акционирование/эскроу/конвертируемый займ, platform deals, round close, shareholder work.
- [x] Added `/demo` demo cabinet for **Главснаб**: ready state, materials “Было → Стало”, AI lead, real call-recording link, personal manager, legal/deal stage and project journey.
- [x] Connected Главснаб demo-assets from local files into `web/public/demo-assets`.
- [x] Updated README with roles MVP, guards and limitations.

**Files changed**
- Server:
  - `server/src/auth.ts`
  - `server/src/index.ts`
  - `server/src/routes/auth.ts`
  - `server/src/routes/admin.ts`
  - `server/src/routes/manager.ts`
  - `server/src/routes/templates.ts`
- Web:
  - `web/index.html`
  - `web/src/index.css`
  - `web/src/App.tsx`
  - `web/src/lib/auth.ts`
  - `web/src/lib/api.ts`
  - `web/src/lib/theme.ts`
  - `web/src/lib/demoMaterials.ts`
  - `web/src/lib/projectJourney.ts`
  - `web/src/components/layout/Sidebar.tsx`
  - `web/src/components/layout/Topbar.tsx`
  - `web/src/components/ui/PersonalManagerCard.tsx`
  - `web/src/components/ui/ProjectJourney.tsx`
  - `web/src/pages/AdminDashboard.tsx`
  - `web/src/pages/ManagerDashboard.tsx`
  - `web/src/pages/DemoCabinet.tsx`
  - `web/src/pages/PersonalManager.tsx`
  - `web/src/pages/Dashboard.tsx`
  - `web/src/pages/ProjectCockpit.tsx`
  - `web/src/pages/Login.tsx`
  - `web/src/pages/AILeads.tsx`
  - `web/src/pages/SalesAssistant.tsx`
- Demo assets:
  - `web/public/demo-assets/glavsnab-before-pitch.pdf`
  - `web/public/demo-assets/glavsnab-before-pitch-sept-2025.pdf`
  - `web/public/demo-assets/glavsnab-after-pitch.pdf`
  - `web/public/demo-assets/glavsnab-before-finmodel.xlsx`
  - `web/public/demo-assets/glavsnab-after-finmodel.xlsx`
  - `web/public/demo-assets/glavsnab-initial-description.docx`
  - `web/public/demo-assets/glavsnab-info.docx`
- Docs:
  - `README.md`
  - `TASKS.md`

**Checks**
- `cd server && npx tsc --noEmit` → green.
- `cd web && npx tsc --noEmit` → green.
- `npm run build` → green.
- Local API smoke on `PORT=4110` → green:
  - client role gets `403` on `/api/admin/dashboard`.
  - admin role gets `200` on `/api/admin/dashboard`.
  - manager role gets `200` on `/api/manager/dashboard`.
  - `/demo` SPA route returns `200`.
- Browser smoke on `http://localhost:4110` → green:
  - fresh `/login` renders with `data-theme="light"`.
  - client sees AI-лиды, AI-ассистент, Персональный менеджер and does not see admin navigation.
  - `/demo` shows Главснаб, project journey, HOT lead, AI call recording and manager card.
  - admin login lands on `/admin` and sees projects/users/templates navigation.
  - manager login lands on `/manager` and does not see admin navigation.

**MVP limitations / known risks**
- Roles are demo-RBAC: stored in localStorage and sent in `x-user-role`. Backend guards exist, but a technical user can spoof the header. Real production needs persisted roles, sessions/JWT and ownership checks.
- Manager assignment is mocked/derived from projects, not persisted in the DB.
- Demo cabinet is static/sample data and uses public demo-assets, not a persisted `ProjectMaterial` / `ProjectLead` model yet.
- Personal manager form is UI-only; no real chat/task creation yet.

**Next recommended task**
- Add persisted `role`, `managerId`, `ProjectLead`, `ProjectMaterial`, `ProjectTask` models and migrate demo-RBAC to real auth/session checks.

## Completed (previous sprint — AI Leads MVP 2026-05-13)

- [x] Added a new client entry point before Sales Assistant: sidebar item “Получать AI-лиды” and a large Dashboard card “AI привлекает инвесторов за вас”.
- [x] Added `/ai-leads` page with product onboarding, launch lock, briefing readiness, investor strategy, KPI cards, live-looking lead feed, lead cards, mock audio records and communication timeline.
- [x] Added backend endpoint `GET /api/ai-leads?projectId=<id>` that returns a single dashboard model for the selected project.
- [x] Added AI Brief Analyzer MVP: auto-filled briefing fields, missing-data list, readiness progress, breakdown by legal/finance/marketing/investment offer, text/voice answer box and interview CTA.
- [x] Added launch gating: if critical briefing fields are missing, “AI-лиды” are shown as demo preview and launch CTA sends the user to brief completion.
- [x] Added mock dataset with 12 investor leads: ready to invest, requested materials, dividends, pre-IPO, AI, risk doubts, Zoom request, no answer/follow-up and export/growth interest.
- [x] Added lead guarantee card based on current legal positioning: minimum 50 target leads, replacement of non-target contacts, 5 contact attempts, no guarantee of investment or yield.
- [x] Prepared future provider abstractions: `LeadProvider`, `AICommunicationProvider`, `TranscriptProvider`, `LeadReplacementPolicyProvider`.
- [x] Documented the AI Leads MVP in README.

**Files changed**
- `server/src/services/aiLeadsService.ts`
- `server/src/routes/aiLeads.ts`
- `server/src/index.ts`
- `web/src/pages/AILeads.tsx`
- `web/src/App.tsx`
- `web/src/components/layout/Sidebar.tsx`
- `web/src/pages/Dashboard.tsx`
- generated web source mirrors: `web/src/pages/AILeads.js`, `web/src/App.js`, `web/src/components/layout/Sidebar.js`, `web/src/pages/Dashboard.js`, `web/tsconfig.tsbuildinfo`
- `README.md`
- `TASKS.md`

**Checks**
- `cd server && npx tsc --noEmit` → green.
- `cd web && npx tsc --noEmit` → green.
- `npm run build` → green.
- Mock API smoke on `PORT=4108` → green:
  - `/health` returns `ok: true`, `spaReady: true`.
  - `/api/ai-leads` returns 12 leads, readiness and replacement policy.
  - `/api/sales-assistant/analyze` returns structured card with provider/model/fallback fields.
- Local browser smoke on `http://localhost:4107` → green:
  - `/ai-leads` opens after login.
  - Main AI leads offer, AI Brief Analyzer, lead feed, guarantee card and mock audio records are visible.
  - Dashboard shows the new “Получать AI-лиды” entry point and the large AI leads card.

**Known risks / ограничения**
- Lead feed, audio records, communication history and AI extraction are mock/demo data. There is no real dialer, messenger integration, CRM sync, OCR, embeddings or speech-to-text backend yet.
- “Прикрепить файл” in AI Brief Analyzer is a visual MVP action; real upload/parsing should connect to the existing project file pipeline next.
- The legal copy follows the provided contract context, but the contract PDFs were not parsed automatically in this pass.
- Browser/mobile visual QA for `/ai-leads` still needs a manual pass before the public demo.

**Next recommended task**
- Add persisted backend models/API for `ProjectLead`, communication events and briefing answers, then connect the provider interfaces to a real AI dialer / messenger pipeline.

## Completed (synced from Codex workspace — Sales Assistant MVP 2026-05-13)

- [x] Reworked `/sales-assistant` from auto-analysis-by-timer to stable MVP behaviour: continuous browser transcription plus manual “Обновить подсказку”.
- [x] Removed the main “Продолжить” recovery scenario. Web Speech `onend` now restarts automatically when the user did not press “Остановить”.
- [x] Hardened Web Speech loop: `continuous=true`, `interimResults=true`, `lang=ru-RU`, final phrases append to transcript, interim phrase is separate, restart is debounced, refs avoid stale closure and double recognition starts.
- [x] Added UI actions/statuses: “Начать прослушивание”, “Остановить”, “Обновить подсказку”, “Слушает”, “Перезапуск распознавания”, “Остановлено пользователем”, “Ошибка микрофона”, “Готов обновить подсказку”, “Обновляем подсказку”.
- [x] Expanded `POST /api/sales-assistant/analyze` contract: accepts `transcript`, `recentContext`, `previousAdvice`, `previousSpinStage`, `adviceHistory`, `projectId`; keeps backward-compatible `recent`.
- [x] Sales Assistant prompt now receives full meeting context, recent context, previous advice/stage/history and explicitly avoids repeating the same next-best-action.
- [x] Response card now includes `provider`, `model`, `fellBackToMock`; UI shows “OpenAI” or “Mock” badge.
- [x] Mock/heuristic fallback now attempts to advance SPIN if it detects it would repeat the same suggested phrase.
- [x] Added voice input to New Project “Контекст проекта” via `VoiceInputButton`.
- [x] New project context is now sent to the backend and saved as `Контекст проекта.txt` uploaded material with category `description`, so it can feed the first brief extraction.

**Files changed**
- `server/src/routes/salesAssistant.ts`
- `server/src/services/salesAssistantService.ts`
- `server/src/ai/salesAssistantPrompt.ts`
- `server/src/routes/projects.ts`
- `web/src/pages/SalesAssistant.tsx`
- `web/src/pages/NewProject.tsx`
- `web/src/components/ui/VoiceInputButton.tsx`

**Known risks / remaining**
- Web Speech API remains browser-dependent: Chrome/Edge are the safest path; Safari support can vary by OS/browser settings.
- Continuous speech recognition is still browser speech recognition, not OpenAI Realtime. Long meetings should be manually smoke-tested because browsers may throttle background tabs.

## Completed (synced from Codex workspace — production OpenAI architecture 2026-05-13)

- [x] Mapped current AI usage: `briefService` generates/regenerates ProjectBrief; `salesAssistantService` analyzes live sales transcript; prompt packaging/reviews are deterministic template/API flows today; mock fallback lives in `server/src/ai/mock.ts`.
- [x] Reworked `server/src/ai/client.ts` into a provider-agnostic AI gateway with `aiClient.generate()`, `aiClient.generateJson()`, `aiClient.classify()` and a prepared `stream()` interface stub.
- [x] OpenAI now uses `responses.create` by default. The old `chat.completions.create` path remains only as one isolated fallback adapter inside `server/src/ai/client.ts` if an SDK runtime does not expose Responses API.
- [x] Added centralized model routing: `main`, `fast`, `realtime` via `OPENAI_MODEL_MAIN`, `OPENAI_MODEL_FAST`, `OPENAI_MODEL_REALTIME`; old `OPENAI_MODEL` remains only as backward-compatible env alias for `MAIN`.
- [x] Routed Brief generation/regeneration and Sales Assistant analysis through the main model route with feature names for logs/guardrails.
- [x] Added structured JSON schema output for Sales Assistant: situation, risk, recommendation, suggestedPhrase, spinStage, tone, confidence, objection, nextStep.
- [x] Added safe AI usage logging behind `AI_LOG_USAGE=true`: provider, feature, model, latency, token counts when available, success/failure, safe error code; no prompts/API keys/project bodies in logs.
- [x] Added basic cost guardrails per feature: max input length, max output tokens, timeout and one retry only for transient errors; no retry for 401/403/429.
- [x] Preserved Anthropic provider and deterministic mock fallback. Missing OpenAI key/model/provider failures now log an explicit safe reason and fall back to mock instead of failing silently.
- [x] Documented OpenAI env, model routes, Render validation, mock rollback and model-access troubleshooting in `README.md`.
- [x] Updated `.env.example` with OpenAI production env names.

**Files changed**
- `.env.example`
- `README.md`
- `server/src/env.ts`
- `server/src/ai/client.ts`
- `server/src/services/briefService.ts`
- `server/src/services/salesAssistantService.ts`

**Known risks / remaining**
- Legacy Chat Completions is intentionally still present in one isolated adapter inside `server/src/ai/client.ts` only as SDK-runtime fallback. Current installed SDK exposes Responses API.
- `estimatedCostUsd` is logged as `null` until a pricing table or billing integration is added; token counts are logged when the provider returns them.
- Realtime model env and `stream()` abstraction are prepared, but realtime audio streaming is not implemented by design for this sprint.

## Completed (previous sprint — UX hotfix 2026-05-12)

- [x] Fixed material action modals (“Посмотреть задание”, “Доработать”) by rendering `Modal` through a React portal into `document.body`.
- [x] Modal overlay is now a true fixed fullscreen layer: `fixed`, `inset-0`, `z-[1000]`, centered, dimmed/blurred background, body scroll lock, Esc close and backdrop click preserved.
- [x] Dialog window now uses `max-height: 85vh`, viewport-safe width `calc(100vw - 32px)`, internal scrolling, persistent header/X, and fixed action footer in prompt/material modals.
- [x] Improved “Что нужно уточнить” into a guided help block: new title “Что нужно уточнить для сильной упаковки”, explanatory subtitle, soft helper copy, total count, and CTA “Ответить на вопросы”.
- [x] Added per-question “Ответить” links where categories are shown; all links go to `/projects/:id/interview`.
- [x] Wired the improved missing-data block on both Project Cockpit and Project Brief pages.

**Files changed**
- `web/src/components/ui/Modal.tsx`
- `web/src/components/ui/MissingDataPanel.tsx`
- `web/src/pages/ProjectCockpit.tsx`
- `web/src/pages/ProjectBrief.tsx`
- `TASKS.md`

**Checks**
- `cd server && npx tsc --noEmit` → green.
- `cd web && npx tsc --noEmit` → green.
- `npm run build` → green.
- Browser smoke on Luce Silva:
  - “Посмотреть задание” opens the prompt modal.
  - “Доработать” opens the prompt/rework modal with “Что нужно изменить?”.
  - X closes the modal.
  - “Ответить на вопросы” opens `/projects/:id/interview`.
  - New missing-data title/subtitle and per-question “Ответить” links are visible.

**Remaining**
- Full visual QA in both light and dark themes on a small physical viewport is still worth doing before a public demo session.

## Completed (history)

### Sprint 10 — `2026-05-12`

- [x] Сокращён клиентский демо-фокус до сильных кейсов: **Forrest Wedding → Luce Silva**, **Cafe SPB / Венский ветер**, **Планета 60**. Старые демо (**Tappsk Pro**, **Apart-отель Чарыш**, **Кофе с собой · сеть**) больше не показываются в клиентском режиме Dashboard / Sales Assistant, но доступны команде.
- [x] `server/src/services/demoSeeds.ts` теперь seed-ит только Luce Silva и Планету 60 поверх hand-tuned Венского ветра.
- [x] Реальные материалы скопированы в `web/public/demo-assets`: исходные PDF “Было”, готовые PDF/PNG/XLSX “Стало”, плюс ссылки на посадочные страницы.
- [x] Добавлен demo-material catalog `web/src/lib/demoMaterials.ts`: хранит “Было → Стало”, статус, версию, дату, формат, URL/скачивание и связанный prompt-kind.
- [x] На странице проекта добавлен блок **“Трансформация упаковки”**: слева исходный материал, справа готовый комплект платформы.
- [x] Раздел **“Материалы”** переделан: главные карточки теперь готовые материалы (презентация, посадочная, финмодель, тизер, one-pager), а задание доступно отдельно через “Посмотреть задание”.
- [x] Модалка задания исправлена: центрирование, `max-height: 85vh`, внутренний scroll, фиксированный footer с действиями, закрытие по X / Esc.
- [x] Sales Assistant speech loop исправлен: `continuous`, `interimResults`, auto-restart on `onend`, transcript не сбрасывается, подсказки обновляются по новым фразам и по таймеру, добавлены статусы “слушает / перезапуск / остановлено / ошибка микрофона / сессия завершилась”.
- [x] Удалены stale `.js`-дубликаты из `web/src`, чтобы Vite брал актуальные `.ts/.tsx` исходники.

**Подключённые demo-assets**
- `forrest-wedding-before.pdf`
- `luce-silva-pitch-after.pdf`
- `luce-silva-teaser-after.png`
- `luce-silva-finmodel-v4.xlsx`
- `cafe-spb-before.pdf`
- `cafe-spb-pitch-after.pdf`
- `cafe-spb-finmodel-36m.xlsx`
- `planeta-before.pdf`
- `planeta-pitch-after.pdf`
- `planeta-onepager-after.pdf`
- `planeta-finmodel.xlsx`

**Проверки**
- `npm run install:all` → проходит, но локальный Node 24 честно предупреждает, что проект закреплён на Node 22.
- `cd server && npx tsc --noEmit` → зелёный.
- `cd web && npx tsc --noEmit` → зелёный.
- `npm run db:seed` → зелёный; созданы/обновлены Венский ветер, Luce Silva, Планета 60.
- `npm run build` → зелёный.
- Production-like local run на `PORT=4101`: `/health` → `spaReady: true`, `/` и `/dashboard` → HTTP 200, demo-assets PDF/XLSX → HTTP 200.
- Browser smoke: открывается Luce Silva, виден блок “Трансформация упаковки”, раздел “Материалы” показывает “Было/Стало”, готовые материалы и кнопки действий.

**Known risks / ограничения**
- Реальные материалы пока подключены как demo catalog + static files в `web/public/demo-assets`, а не как новая persisted backend-сущность. Для production нужен нормальный `ProjectMaterial` model / API / upload flow.
- Web Speech API нельзя полностью проверить автоматикой без живого микрофона и разрешения браузера; кодовая проверка и UI smoke пройдены, длительную 2-3 минутную голосовую проверку нужно сделать руками в Chrome/Edge/Safari.
- Старые демо не удаляются из БД, а скрываются в client mode. Это сохраняет данные и даёт команде доступ в team mode.

**Next recommended task**
- Добавить backend-модель `ProjectMaterial` с upload/link CRUD, чтобы “Было → Стало” перестало быть только demo-config и стало нормальной частью продукта.

### Hotfix — `2026-05-12`

- [x] Removed the logo/brand-block subtitle “Подготовка инвестиций”; the visible brand now stays as “Платформа ZAPUSK AI”.
- [x] Verified the brand text path: `Logo` is used by Sidebar and Login; `Topbar` has no brand subtitle; `web/index.html` already uses the correct title and favicon.
- [x] Re-checked public Render URL symptoms: `/`, `/health`, `/dashboard` return Render-level 404 with `x-render-routing: no-server`, so the request is not reaching Express.
- [x] Kept production static serving / SPA fallback unchanged because local production smoke-test confirms Express serves `web/dist` correctly.
- [x] Pinned production runtime to Node `22.22.0` in `package.json`, `.node-version`, and `render.yaml` to avoid Prisma 5.22 / SQLite migration failure seen under local Node 24.
- [x] Documented exact Render Build Command, Start Command, Health Check Path, root directory, disk mount, Node version, and the `x-render-routing: no-server` diagnostic in README.

### Sprint 5 — `2026-05-12`

- [x] Brief-level regenerate-with-feedback endpoint: `POST /api/brief/:projectId/regenerate-with-feedback`.
- [x] Endpoint accepts `feedback` and optional `focus` (`narrative`, `finance`, `risks`, `investor_offer`, `missing_data`).
- [x] Feedback regeneration updates `ProjectBrief` + `napkin`, creates a new brief version and a versioned napkin document.
- [x] `interviewAnswers` are preserved and re-embedded into `napkin.interviewAnswers`.
- [x] `missingData` / `missingByCategory` stay valid JSON and answered questions remain filtered out.
- [x] Mock fallback improves the current brief locally instead of replacing hand-tuned demo data with a generic mock brief.
- [x] Brief page now has a focused feedback form: “Что улучшить в брифе?” + “Доработать бриф”.
- [x] Verified that the next `generate-full-packaging` uses the improved brief context.

### Sprint 4 — `2026-05-11`
- [x] AI Interview loop closed: answers persist via `PATCH /api/brief/:projectId/interview`, merge with existing answers, bump brief version and survive reopen.
- [x] Interview answers are embedded into `ProjectBrief.napkin.interviewAnswers`, copied into prompt context, and written into the versioned napkin document.
- [x] Answered AI Interview questions are removed from `missingData` / `missingByCategory`; Project progress now treats answered missing questions as completed.
- [x] `generate-full-packaging` uses the updated brief context, including founder answers, in generated prompts.
- [x] Mock brief no longer overwrites filled hand-tuned demo brief fields during `generate-brief` / `generate-full-packaging`; existing demo data has priority, mock output fills gaps only.
- [x] Verified mock merge strategy on all 4 demo projects: **Венский ветер**, **Tappsk Pro**, **Apart-отель Чарыш**, **Кофе с собой · сеть**.
- [x] Templates CRUD: added `POST /api/templates`, `DELETE /api/templates/:id`, basic validation, 404 handling for missing template updates, and create/delete UI.
- [x] Seed resets demo `interviewAnswers` so `npm run db:seed` restores clean demo briefs after smoke tests.

### Sprint 3 — `2026-05-11`
- [x] Schema: `ArtefactReview` model + `ProjectBrief.missingByCategory` + `GeneratedPrompt.feedback`; migration `sprint3` applied
- [x] Backend: `routes/reviews.ts` (upsert + list + delete); feedback-aware `POST /api/prompts/:id/generate/:kind`
- [x] Brief service stores categorized missing data (6 categories); AI system prompt requests structured output; mock fallback produces matching structure
- [x] 3 demo archetypes seeded: **Tappsk Pro** (AI SaaS · 35 M ₽ · fund), **Apart-отель Чарыш** (девелопмент · 180 M ₽ · private), **Кофе с собой · сеть** (F&B · 12 M ₽ · private)
- [x] `ReviewBlock` UI component (1–5 stars · comment · «годится» / «доработать»)
- [x] `RegenerateModal` for feedback-driven regeneration
- [x] `GeneratedAssetCard` extended with review props + «С feedback» button; wired in Cockpit and Packaging
- [x] `ProjectReview` page (`/projects/:id/review`) — Packaging Quality Score + all artefacts table with inline reviews
- [x] `MissingDataPanel` rendered on Cockpit and Brief pages (6-category grid)
- [x] `Guide` page (`/guide`) — 7-step internal user guide + 5 methodology principles
- [x] Sidebar link to «Гайд команды»
- [x] Both `tsc --noEmit` passes; smoke-test E2E (review create, regenerate-with-feedback v5, reviews list) green

### Sprint 2 — `2026-05-11`
- [x] 10 prompt templates rewritten per Zapusk methodology (napkin-first, investor-income focus, Terminal 16-slide structure, calculator-as-decision-point, SPIN Sales GPT)
- [x] PDF/DOCX/XLSX/TXT text extraction (`fileParser.ts`); content fed into AI brief context up to 80 KB total
- [x] `Generate Full Packaging` endpoint (`POST /api/prompts/:id/generate-full-packaging`) + UI button on Cockpit hero
- [x] ZIP export (`GET /api/projects/:id/export/zip`) with all 11 .md artefacts + JSON + README
- [x] Demo project **Венский ветер** with hand-tuned napkin and realistic numbers
- [x] System prompt for brief tightened with Zapusk principles

### Sprint 1 — `2026-05-11`
- [x] Repo scaffold: server (Express + Prisma) + web (Vite + React + Tailwind) + root concurrently
- [x] Design tokens for dark cockpit / Zapusk orange / AI violet / Montserrat
- [x] 17 UI Kit components + AppLayout / Sidebar / Topbar
- [x] 14 routes (5 full, 9 functional)
- [x] All 10 entities in Prisma schema (Sprint 1 scope)
- [x] Auth, Projects, Files (upload + link), Brief, Prompts, Templates, JSON export, Admin
- [x] AI client with anthropic/openai/mock; deterministic mock brief
- [x] Integration placeholders for Lovable / CloudDesign / Canva / Directual / ZapuskPlatform
- [x] Versioning of brief, prompts, documents

---

## In progress

_(empty — Sprint 13 AI Sales Assistant emotional layer shipped)_

---

## Sprint 13 update — 2026-05-13 — AI Sales Assistant emotional layer

Theme: **Эмоциональная динамика поверх structured mini-brief.** AI co-pilot теперь чувствует не только текст, но и психологию сделки: в каком состоянии инвестор, какая температура диалога, куда движется momentum, ПОЧЕМУ инвестор так отвечает, что может сломать сделку прямо сейчас и как изменить тон. Это переход от «хорошего sales-скрипта» к «он понимает переговоры».

Non-goals (фикс): без sentiment ML pipeline, без embeddings, без vector memory, без realtime voice emotion, без Zoom RTMS, без CRM, без notifications, без tasks. Только эвристический + GPT-reasoning слой поверх существующего `/api/sales-assistant/analyze`.

### Backend

- **`server/src/ai/salesAssistantPrompt.ts`** — добавлен раздел «🫀 ЭМОЦИОНАЛЬНЫЙ СЛОЙ»: явные определения `investorState` (8 значений: OPEN/CURIOUS/SKEPTICAL/DEFENSIVE/ENGAGED/RATIONALIZING/READY/DISCONNECTED), `conversationTemperature` (COLD/WARM/HOT), `momentum` (POSITIVE/NEUTRAL/NEGATIVE) + примеры объяснений для `emotionalState`, `whyBehavior`, `momentumReason`, `emotionalRisks`, `toneShiftGuidance`. ENGAGEMENT detection расширен расширенной эвристикой (длина ответов, встречные вопросы, конкретика, эмоциональные слова, защитные реакции, уход в «подумаю»). JSON envelope расширен с 18 до 26 полей. Новый запрет в `🚫 ЗАПРЕЩЕНО`: «не игнорировать эмоциональный сигнал ради «правильного» SPIN-хода».
- **`server/src/services/salesAssistantService.ts`** — `AssistantCard` interface дополнен 8 полями. Новые типы `InvestorState`, `Momentum`, `ConversationTemperature`. `SALES_ASSISTANT_RESPONSE_SCHEMA` обновлён в strict mode с required для каждого нового поля. Новые normalizers (`normalizeInvestorState`, `normalizeMomentum`, `normalizeTemperature`) + defaults (`defaultEmotionalState`, `defaultWhyBehavior`, `defaultMomentumReason`, `defaultToneShift`) для graceful degradation если AI вернул пустоту. `maxTokens` поднят с 1400 до 1900. Heuristic mock расширен per-scenario: каждый детектор (расскажите / проблема / упустил / деньги / подумаю / дорого / риск) теперь устанавливает investorState + momentum + temperature + emotionalState + whyBehavior + momentumReason + emotionalRisks + toneShiftGuidance соответствующие сценарию. `avoidRepeatedAdvice` тоже шифтит эмоциональный контекст при переходе SPIN-этапа.

### Frontend

- **`web/src/pages/SalesAssistant.tsx`** — `AssistantCard` interface синхронизирован с backend (8 новых полей). Добавлены label/tone мапы для всех новых enum'ов (`STATE_LABEL/TONE`, `TEMP_LABEL/TONE`, `MOMENTUM_LABEL/TONE`). Новый компонент `<EmotionalLayer />` — компактная subcard сразу после Situation: 3 badge'а в ряд (Investor State / Temperature / Momentum со стрелкой) + emotionalState (HeartHandshake) + whyBehavior (Brain, с подписью «Почему:») + momentumReason (мелкий muted). Добавлены ещё два блока: «Как изменить тон» (Wand2, ai-стиль, между «Что делать» и «Главный вопрос») и «Что может сломать сделку» (HeartCrack, красный, до «Что НЕ делать»). Иконки: HeartHandshake, Brain, Thermometer, TrendingUp/Down/Minus, HeartCrack, Wand2, UserRound (все lucide-react, нулевая стоимость bundle).

### Why this matters

- **Психология сделки ≠ sales-скрипт.** До Sprint 13 ассистент знал, какой SPIN-вопрос задать. После — он понимает, что инвестор сейчас в RATIONALIZING-состоянии, температура COLD, momentum NEGATIVE — и говорит фаундеру «сейчас лучше замедлиться» вместо «дави на ROI».
- **emotionalRisks отдельный от riskOrMissed.** Первый — процессный (пропустили SPIN, нет next step), второй — про доверие («если додавить — закроется», «если уйти в цифры — потеряешь sense of safety»). Это два разных взгляда на одну встречу.
- **Mock-фоллбек тоже эмоциональный.** Каждая ветка эвристики (включая «подумаю», «дорого», «риск») теперь устанавливает свой эмоциональный контекст — карточка остаётся «боевой» даже без AI ключа.
- **UI остался scannable.** Эмоциональный слой собран в одну компактную subcard с 3 badge и 2-3 строками текста — не превратился в простыню.

### Verification

- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — server tsc OK, web vite build OK (409.75 kB / 115.16 kB gzip, +5 kB от Sprint 12)
- [ ] Production verify: `POST /api/sales-assistant/analyze` на 4 сценариях (сомневающийся / активный / «я подумаю» / негативный опыт) должен вернуть согласованные `investorState`/`momentum`/`conversationTemperature` + читаемые `emotionalState`/`whyBehavior`/`emotionalRisks`/`toneShiftGuidance`.

---

## Sprint 12 update — 2026-05-13 — AI Sales Assistant mini-brief

Theme: **Превратили AI Sales Assistant из «одна реплика на ходу» в structured mini-brief** для текущего момента переговоров. Фаундер во время живой встречи смотрит на карточку, которая сканируется за 5 секунд: что происходит, что упускаем, что делать, что НЕ делать, главный вопрос, 2-4 запасных, self-sale вопросы, мини-питч (если уместно), цель этапа, куда ведём, контроль сделки, engagement инвестора, карта SPIN-этапов.

Non-goals (зафиксированы): без realtime audio streaming, без Zoom RTMS, без WebRTC, без новых страниц, без CRM, без notifications. Только расширение существующего `/api/sales-assistant/analyze` и `web/src/pages/SalesAssistant.tsx`.

### Backend

- **`server/src/ai/salesAssistantPrompt.ts`** — переписан system prompt: AI co-pilot переговоров. Явные разделы по SPIN-методологии (S/P/I/N, нельзя перепрыгивать), tone (SOFT/CONTROL/CLOSE), engagement signal (active/passive/disengaged), deal control level (LOW/MEDIUM/HIGH), conversation objective (примеры по этапам), self-sale правила (S/P или passive → 1-2 self-sale вопроса; I/N → []), miniPitch правила (только при сигнале интереса в transcript, max 2-4 предложения, обязательно вопрос в конце), objection triggers (подумаю / просит материалы / негативный опыт / дорого), запреты (повторять previousAdvice, перепрыгивать этапы, простыни). Возвращает строго JSON с 18 полями.
- **`server/src/services/salesAssistantService.ts`** — `AssistantCard` расширен с 8 полей до 18 + 4 legacy alias (`risk` / `recommendation` / `suggestedPhrase` / `nextStep`) для back-compat. Новые поля: `riskOrMissed`, `whatToDo[]`, `whatNotToDo[]`, `mainQuestion`, `backupQuestions[]`, `selfSaleQuestions[]`, `miniPitch|null`, `conversationObjective`, `conversationDirection`, `dealNextStep|null`, `spinGaps[]`, `dealControlLevel`, `engagementSignal`. `SALES_ASSISTANT_RESPONSE_SCHEMA` обновлён в strict mode, `maxTokens=1400`. Heuristic mock расширен per SPIN-этап со всеми блоками (включая default `spinGaps` = всё STRICTLY после current). `avoidRepeatedAdvice()` теперь сдвигает этап и заполняет все новые поля.
- **`server/src/routes/salesAssistant.ts`** — без изменений (route уже принимал `unknown` для `previousAdvice` / `adviceHistory`, шаблон передаётся как есть).

### Frontend

- **`web/src/pages/SalesAssistant.tsx`** — `AssistantCard` interface расширен 1-в-1 с backend. `AdviceCard` полностью переписан в structured mini-brief: header с 4 badge'ами (SPIN / Tone / Control / Engagement) + Confidence gauge; STAGE_HINT; Situation; warning-banner «Что упускаем» (если riskOrMissed); двух-колоночный блок Objective + Direction; маркированный список «Что делать»; flagship blockquote «Главный вопрос сейчас»; «Запасные вопросы» (numbered list с левой границей); purple/ai-блок «Self-sale: пусть он сам себе продаст»; красный блок «Что НЕ делать сейчас»; zapusk-блок «Мини-питч» (conditional); warning-блок «Возражение»; zapusk-блок «Следующий шаг сделки»; и в конце карта SPIN-этапов S/P/I/N с подсветкой текущего + открытых + закрытых. `toAdviceHistoryItem()` теперь сохраняет и новые, и legacy поля — чтобы prompt получил richer history.

### Why this matters

- AI больше не выдаёт «одну реплику в вакууме». Фаундер видит сразу: где сейчас разговор, что упустил, что нужно делать, что нельзя делать, какая цель, и куда ведём дальше. Это разница между ассистентом и co-pilot.
- Сохранили back-compat: legacy fields (`recommendation` / `suggestedPhrase` / `nextStep` / `risk`) остались в `AssistantCard` и в `adviceHistory`. Старые consumers (`salesSessionService`, `salesSessions.ts`, прошлые сохранённые сессии в БД) продолжают работать без миграций.
- Mock-фоллбек тоже расширен: при отсутствии AI ключа карточка остаётся «боевой» — каждый SPIN-этап имеет дефолтный набор блоков, спин-gaps детерминированы.

### Verification

- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — server tsc OK, web vite build OK (404.77 kB / 114.07 kB gzip)
- [ ] Production verify: после Render redeploy → `POST /api/sales-assistant/analyze` с сэмпл-transcript должен вернуть новые поля (`mainQuestion`, `backupQuestions[]`, `spinGaps[]`, и т.д.) с `fellBackToMock=false`.

---

## Sprint 11 update — 2026-05-13 — AI Conversation Intelligence

Theme: **AI-слой поверх инвестиционных переговоров.** Не CRM. Загрузили запись или paste'нули transcript → получили транскрипцию + AI-анализ с фокусом на «что улучшить» + AI score 0..100 + 6-метричный breakdown + готовый follow-up. Накопление data moat для будущего fine-tuning.

### Backend

- **`ConversationAnalysis` Prisma model + migration `conversation_analysis`** — projectId (SetNull on project delete), source (audio_upload/url/paste), transcription provenance (provider/model/duration), JSON-сериализованный analysis с дублированием top-level scalars (aiScore, probabilityScore, sentiment, spinStage) для индексации, ai provenance (provider/model/fellBackToMock).
- **`server/src/services/deepgramClient.ts`** — обёртка над Deepgram pre-recorded API. Global fetch, Bearer auth, AbortController с 90-секундным timeout. Params: `model=nova-2`, `language=ru`, `punctuate=true`, `smart_format=true`, `diarize=true`. Без SDK — нативный fetch, нулевые deps. Поддержка mp3/wav/m4a/mp4 через mime type. Mock fallback с двухspeaker-диалогом, который активирует все downstream-эвристики.
- **`server/src/services/conversationAnalysisService.ts`** — `analyzeConversation()` через `aiClient.generateJson` с strict JSON schema (15 полей, включая breakdown из 6 метрик). System prompt явно требует фокус на mistakes, а не на summary. `ingestConversation()` — единая точка входа: audio buffer → Deepgram → analyze → persist. Heuristic mock с keyword-detection (Situation-skip, ликвидность, materials request, next step missing, конкретные цифры) для production-grade fallback.
- **`server/src/routes/conversationAnalysis.ts`** — `POST /` (multer memoryStorage, 60 MB cap, multipart с полем `file`), `POST /text` (zod-валидация чистого transcript), `GET /` (filter by projectId), `GET /:id`, `DELETE /:id` (защищён demoGuard).
- **`server/src/env.ts`** — `DEEPGRAM_API_KEY`, `DEEPGRAM_MODEL=nova-2` defaults.
- **`server/src/index.ts`** — `/api/conversation-analysis` смонтирован.

### Frontend

- **`web/src/lib/conversationAnalysis.ts`** — типы (15 полей analysis card), API helpers (multipart upload и text-only), SCORE_LABELS, SENTIMENT_TONE/LABEL для UI.
- **`web/src/pages/ConversationAnalysis.tsx`** — главная страница с 3 режимами ввода (Upload / Paste / URL), drag&drop с визуальным индикатором, fields для проекта + инвестора, результат с ScoreCard и 6 result blocks (Summary, What worked, Mistakes, Concerns, Materials, Next action, Follow-up с копированием), история разборов внизу с возможностью re-open.
- **`web/src/components/ui/ConversationScoreCard.tsx`** — главный wow-блок: большая цифра aiScore (color-coded: green/orange/yellow) + sentiment badge + SPIN stage + 6 progress bars (rapport / SPIN / nextStepFixation / objectionHandling / clarity / confidence) + deal probability.
- **`web/src/components/layout/Sidebar.tsx`** — пункт **«AI-разбор переговоров»** (Brain icon) во всех 3 ролях между AI-ассистентом и Встречами.
- **`web/src/App.tsx`** — route `/conversation-analysis`.
- **`web/src/pages/SalesAssistant.tsx`** — кнопка **«Загрузить запись»** в action-row слева от Start/Stop, ведёт на `/conversation-analysis`. Позволяет анализировать разговоры, которые были вне Zapusk AI.

### .env.example

```
DEEPGRAM_API_KEY=
DEEPGRAM_MODEL=nova-2
```

### Mock fallback

Работает в трёх случаях: (1) нет `DEEPGRAM_API_KEY` — детерминированный двух-speaker mock-transcript из 10 реплик; (2) AI вернул не парсимый ответ — heuristic анализ по ключевым словам; (3) provider unavailable. Везде `fellBackToMock: true` явно проброшен в карточку, FE показывает warning badge с подсказкой про ENV.

### Что готово под Zoom RTMS

Контракт `ingestConversation()` принимает `audioBuffer | audioUrl | pastedTranscript`. RTMS-стрим можно подключить, накапливая chunks в buffer и в конце меетинга вызвать `ingestConversation({ audioBuffer })`. Schema модели уже поддерживает любую provenance через `source` field и опциональный `audioUrl`. Текущий MVP не делает realtime stream, как и просил бриф.

### Что не делать сейчас (явный non-scope)

- Realtime streaming, Zoom RTMS, WebRTC, websocket audio
- CRM sync, Telegram sending, auto follow-up
- Vector DB, embeddings, RAG
- Call recording infrastructure (S3, persistent storage больше чем local uploads)

### Какие проверки прошли

- `cd server && npx tsc --noEmit` → green
- `cd web && npx tsc --noEmit` → green
- `npm run build` → 1636 модулей, JS 398.49 KB / gzip 112.62 KB, CSS 34.94 KB / gzip 7.18 KB

### Что проверить руками после deploy

1. Sidebar → «AI-разбор переговоров» — открывается `/conversation-analysis`
2. Tab «Загрузить аудио» — drag&drop файла (mp3/wav/m4a/mp4), кнопка «Запустить AI-разбор»
3. Tab «Вставить transcript» — paste 5-10 строк диалога → 1-3 секунды → результат
4. Tab «Ссылка на запись» — URL → MVP сохраняет ссылку, transcript = placeholder; для полноценной транскрипции — загрузить файл
5. Score card — большая цифра + 6 progress bars + sentiment + probability
6. Блоки результата: «Что улучшить» (XCircle красным), «Что сработало» (CheckCircle зелёным), Возражения, Материалы, Next action, Follow-up с кнопкой «Скопировать»
7. История внизу — открыть прошлый разбор по клику
8. SalesAssistant → «Загрузить запись» в action-row → переход на ConversationAnalysis
9. Если установить `DEEPGRAM_API_KEY` на Render — реальная транскрипция русской речи через `nova-2`
10. Mock mode: без ключей всё работает с warning badge

### Known risks / limitations

- Audio файлы хранятся только в memory во время запроса. После анализа buffer уходит в GC. Если нужно re-listen — нужен upload в `uploads/` (одна правка в route, не сделана как «не делать infra»).
- Deepgram free-tier — ~150 минут. Production usage потребует платного плана.
- `OPENAI_MODEL_MAIN` теперь дефолт `gpt-4o` (исправлено в прошлом hotfix). Если в Render env явно установлен `gpt-4.1` — это валидно и работает.
- Mock fallback на FE показывается warning-card. В production без ключей это будет видно клиенту — нужно проконтролировать env на Render.

### Изменённые / добавленные файлы

| Side | File | Изменение |
|------|------|-----------|
| schema | `prisma/schema.prisma` + migration `conversation_analysis` | new model |
| server | `src/env.ts` | DEEPGRAM_API_KEY + DEEPGRAM_MODEL |
| server | `src/services/deepgramClient.ts` | **new** |
| server | `src/services/conversationAnalysisService.ts` | **new** |
| server | `src/routes/conversationAnalysis.ts` | **new** |
| server | `src/index.ts` | + mount /api/conversation-analysis |
| web | `src/lib/conversationAnalysis.ts` | **new** types + helpers |
| web | `src/pages/ConversationAnalysis.tsx` | **new** main page |
| web | `src/components/ui/ConversationScoreCard.tsx` | **new** score visualization |
| web | `src/components/layout/Sidebar.tsx` | + AI-разбор переговоров (3 roles) |
| web | `src/App.tsx` | + route /conversation-analysis |
| web | `src/pages/SalesAssistant.tsx` | + Загрузить запись button |
| docs | `.env.example` | Deepgram block |
| docs | `TASKS.md` | this update |

---

## Sprint 9 update — 2026-05-12

Theme: **полноценная светлая тема + переключатель + новое брендирование «Платформа ZAPUSK AI»**. Без рефакторинга компонентов и без второго слоя стилей — одна архитектура, два набора токенов.

### Архитектура темы

CSS variables + Tailwind `rgb(var(--…) / <alpha-value>)`. Один Tailwind-класс `bg-canvas` / `text-primary` / `bg-zapusk/10` работает в обеих темах — меняются только значения переменных. Темная остаётся основой (`:root` = dark), светлая включается через `:root[data-theme="light"]` override. Inline-script в `<head>` применяет тему до первого paint, чтобы не было flicker.

### Что было сделано

**Токены и темы**
- `web/tailwind.config.ts` — все цвета (canvas/ink/surface/elevated/line/hairline, text-primary/secondary/muted/faint, brand zapusk*, ai, semantic success/warning/danger/info) переведены на `rgb(var(--color-X) / <alpha-value>)`. Shadows и bg-grad-ink тоже — теперь они CSS-переменные.
- `web/src/index.css` — два theme-блока: `:root, :root[data-theme="dark"]` (dark cockpit как раньше) и `:root[data-theme="light"]` (off-white canvas `#FAFAFB`, белые карточки, zinc-like grey scale, premium Linear/Stripe-style тени). Бренд-акценты (zapusk-orange `#FF5A1F`, ai-violet `#7C5CFF`) сохранены в обеих темах. Семантика (success/warning/danger/info) в светлой чуть деперена, чтобы читалась на белом.
- Анти-flicker: inline-script в `web/index.html` ставит `data-theme` до парсинга CSS на основе `localStorage('zapusk.theme')`.

**Theme switch**
- `web/src/lib/theme.ts` — `getTheme()` / `setTheme()` / `useTheme()` hook + `CustomEvent('zapusk:theme')` broadcast (тот же паттерн что `mode.ts`).
- `web/src/components/ui/ThemeToggle.tsx` — однокнопочный toggle с Sun/Moon, иконка показывает what's-next (Linear/Notion convention).
- `Topbar.tsx` — `ThemeToggle` встроен перед user-avatar.

**Брендирование**
- Новый SVG-лого в `web/public/zapusk-wordmark.svg` (приложенный «ЗАПУСК» wordmark с ракетой, 313×319 viewBox).
- `Logo.tsx` использует CSS-mask `.logo-mark` с `background-color: currentColor` — лого автоматически принимает `text-primary`: чёрный в светлой, белый в тёмной. Никаких file swaps, никаких filter:invert.
- Заголовок изменён на **«Платформа ZAPUSK AI»**; лишний бренд-сабтайтл удалён в hotfix 2026-05-12.
- `index.html`: `<title>` = «Платформа ZAPUSK AI», favicon на новый SVG.
- `Login.tsx` — «Сервис подготовки инвестиционных материалов Zapusk» → «Платформа ZAPUSK AI · подготовка проекта к разговору с инвестором».
- `Sidebar.tsx` нижняя карточка: «Материалы для инвестора» → «ZAPUSK AI / Платформа подготовки проектов к инвесторам».

### Какие проверки прошли

- `cd web && npx tsc --noEmit` → зелёный
- `cd server && npx tsc --noEmit` → зелёный (server не тронут)
- `npm run build` → зелёный (1623 модулей, CSS 29.75 KB, JS 288 KB)
- Визуальная проверка обеих тем на Dashboard:
  - Dark: cards тёмные, accent orange, AI violet glow, topbar показывает Sun (переключить в light)
  - Light: off-white canvas, белые cards с мягкими тенями, чёрный текст, accent orange читается, AI violet мягче, topbar показывает Moon
- `getComputedStyle` подтверждает: `data-theme="light"` → `--color-canvas = 250 250 251`, `body bg = rgb(250,250,251)`, `--color-surface = 255 255 255`, `text-primary = rgb(10,10,11)`
- Anti-flicker boot: localStorage читается inline-скриптом до загрузки CSS — мгновенное применение темы при reload
- Логотип через mask меняет цвет на 100% по теме без подмены файла

### Какие компоненты автоматически получили обе темы

Через миграцию на CSS variables и Tailwind tokens (без правок самих компонентов):

Sidebar · Topbar · AppLayout · Dashboard · NewProject · ProjectCockpit · ProjectBrief · ProjectInterview · ProjectUpload · ProjectPackaging · ProjectPrompts · ProjectDocuments · ProjectReview · Templates · Guide · AdminProjects · SalesAssistant · Login · все 17 UI-компонентов (Button, Card, Input, UploadZone, ProgressBar, StatusBadge, StepCard, ProjectCard, AIQuestionCard, GeneratedAssetCard, TemplateCard, DocumentCard, ReviewBlock, RegenerateModal, MissingDataPanel, Modal, EmptyState, Logo, ThemeToggle, ModeToggle, VoiceInputButton)

### Какие файлы изменены / добавлены

| Path | Изменение |
|------|-----------|
| `web/public/zapusk-wordmark.svg` | **new** — SVG-лого ZAPUSK |
| `web/tailwind.config.ts` | rewrite — все цвета/тени/градиенты через CSS variables |
| `web/src/index.css` | rewrite — двух-темная система токенов + CSS-mask класс `.logo-mark` |
| `web/index.html` | edit — title, favicon, anti-flicker boot script, убран `class="dark"` |
| `web/src/lib/theme.ts` | **new** — hook + storage helpers |
| `web/src/components/ui/ThemeToggle.tsx` | **new** — Sun/Moon toggle |
| `web/src/components/ui/Logo.tsx` | rewrite — SVG-mask + «Платформа ZAPUSK AI» |
| `web/src/components/layout/Topbar.tsx` | edit — встроен ThemeToggle |
| `web/src/components/layout/Sidebar.tsx` | edit — текст brand card |
| `web/src/pages/Login.tsx` | edit — описание под заголовком |
| `TASKS.md` | edit — Sprint 9 |

### Known risks

- **Tailwind config changes требуют рестарта dev-сервера** — изменения `tailwind.config.ts` не подхватываются HMR. Production-build пересобирает корректно, в dev — `npm run dev` рестарт. Документировано.
- **Любые компоненты с hardcoded hex** не подхватят тему. Я не нашёл таких в текущей кодовой базе (всё через Tailwind tokens), но если будущие правки введут раw colors — они будут жить только в одной теме.
- **Shadows в светлой теме мягче** — `shadow-card` и `shadow-lifted` уменьшены до 4-12% opacity вместо 60-80% в тёмной. Это by design, иначе светлая тема выглядит «грязно».
- **Selection / focus ring** в светлой теме слабее по opacity (45%/20%) чем в тёмной (60%/30%), но это норма — иначе режет глаз на белом.
- **Avatar circle в Topbar** теперь `text-white` (не `text-canvas`), потому что в светлой теме `canvas` стал почти белым и текст бы исчез. Это единственный hardcoded цвет, оставленный сознательно — он внутри orange-градиента, белый текст идеален в обеих темах.
- **Серверные `.md` и ZIP-экспорт не имеют темы** — это plain markdown для команды, тема не нужна.

### Что осталось до полного theme coverage

Ничего критичного. Все экраны и компоненты используют tokens. Если в будущем разработчик добавит inline-hex или Tailwind hardcoded colour (e.g. `bg-zinc-900`), он сломает тему — но это policy issue, не архитектура.

Возможные улучшения **в следующих спринтах** (не блокеры):
- Системная тема (`prefers-color-scheme`) как дополнительный режим переключателя
- Анимированный transition при переключении (сейчас body-цвет анимируется 180 мс, остальное мгновенно)
- A11y audit контраста на светлой теме (особенно `text-muted` на `bg-surface`)

### Next recommended task

**Server-side route guard для team-only маршрутов** (`/api/admin`, `/api/templates` write) — превратить UI-mode split из скрытия в реальную защиту демо. Это последний оставшийся пункт из «what to do before real production» в Sprint 8.

---

## Sprint 8.1 hotfix — 2026-05-12

---

## Sprint 8.1 hotfix — 2026-05-12

Симптом: на Render-деплое публичная ссылка отдавала **404 Not Found** на `/`, при этом `/health` отвечал 200.

### Диагноз

1. **`NODE_ENV=production` на Render во время `npm install`** — Render автоматически выставляет `NODE_ENV=production` для всех Node-сервисов. Это переключает `npm install` в режим без devDependencies. У нас `prisma`, `vite`, `typescript`, `@types/*` сидят в `devDependencies` — без них `prisma generate` (postinstall) и `vite build` падают, `web/dist` не собирается, Express не находит SPA, `/` возвращает 404.
2. **Хрупкий резолв пути к `web/dist`.** Изначально путь резолвился жёстко как `path.resolve(here, '../../web/dist')`. Если хост раскладывает репо иначе, путь промахивается, `fs.existsSync` фейлит молча, SPA не сервится.

### Что сделано

- `package.json` (root) — скрипт `install:all` теперь явно передаёт `--include=dev` для root + server + web. Render всегда устанавливает все нужные для сборки пакеты, независимо от `NODE_ENV`.
- `server/src/index.ts`:
  - **Multi-candidate path resolution для `web/dist`** — проверяются 6 вариантов (явный override через `WEB_DIST_DIR`, относительные от dist/index.js, относительные от `cwd()`). Выбирается первый, где есть `index.html`. Гарантирует, что SPA найдётся на любом из протестированных layouts.
  - **SPA serving больше не привязан к `NODE_ENV`** — если `web/dist` существует, отдаём. Это страховка: даже если хост по какой-то причине не пробросил `NODE_ENV=production`, SPA всё равно работает.
  - **Старт-логи теперь печатают** `cwd`, `running file dir`, и при отсутствии SPA — каждого кандидата с пометкой «exists / missing». Любой деплой-фейл диагностируется по одному `render logs`.
  - **`/health` теперь возвращает `spaReady: boolean` и `spaPath: string|null`** — это first-line healthcheck для деплойного раннера и для самого пользователя.
- `render.yaml` — добавлен комментарий-памятка про NODE_ENV+devDependencies trap. Сами envVars не тронуты (`NODE_ENV=production` остаётся для runtime — `--include=dev` решает install-сторону).
- `README.md` — раздел «Render (готовый blueprint)» обновлён: точные Build / Start / Health Check / Disk параметры в таблице, явный warning про NODE_ENV trap, секция «Проверка деплоя» с проверкой `/health` `spaReady`.

### Какие проверки прошли

- `server tsc --noEmit` → зелёный
- `web tsc --noEmit` → зелёный
- `npm run build` → зелёный (server `tsc` + web `vite build` → 1621 модулей, 286 KB JS gzip 86.5 KB, `web/dist/index.html` создан)
- **Production-like local run** на порту 5400, `NODE_ENV=production DEMO_MODE=true`:
  - Лог содержит: `[zapusk-api] serving SPA from /Users/luquid/Projects/zapusk-ai-packaging/web/dist`
  - `GET /health` → `{"ok":true,"demo":true,"env":"production","spaReady":true,"spaPath":".../web/dist"}` ✓
  - `GET /` → HTTP 200, `text/html`, отдаёт `index.html` (701 B) ✓
  - `GET /dashboard` (SPA route без файла) → HTTP 200, тот же `index.html` ✓ SPA fallback работает
  - `GET /api/projects` → JSON, API не сломан ✓

### Точные команды для Render

| Поле                | Значение                                     |
|---------------------|----------------------------------------------|
| Build Command       | `npm run install:all && npm run build`       |
| Start Command       | `npm start`                                  |
| Health Check Path   | `/health`                                    |
| Disk → Mount Path   | `/data` (Size: 1 GB)                         |
| Env: `NODE_ENV`     | `production`                                 |
| Env: `DEMO_MODE`    | `true`                                       |
| Env: `DATABASE_URL` | `file:/data/prod.db`                         |
| Env: `UPLOADS_DIR`  | `/data/uploads`                              |
| Env: `CORS_ORIGIN`  | `*`                                          |

Через `render.yaml` (Blueprint) всё подставляется автоматически.

### Какие файлы изменены

| Path | Изменение |
|------|-----------|
| `package.json` | `install:all` теперь с `--include=dev` |
| `server/src/index.ts` | multi-candidate path + start logs + `spaReady` в `/health` + SPA serving независимо от NODE_ENV |
| `render.yaml` | комментарий про NODE_ENV trap |
| `README.md` | раздел Render: точные команды + ловушка NODE_ENV + проверка `/health` |
| `TASKS.md` | Sprint 8.1 hotfix |

### Known risks

- Render Free может всё ещё засыпать после 15 минут — cold start 30–60 сек. Это никак не связано с фиксом.
- На некоторых хостах `--include=dev` ломает деплой если у них нет npm 8+ — но Render и Railway уже на npm ≥ 10, проблем нет.
- Если хостинг использует `npm ci` вместо `npm install`, флаг `--include=dev` всё равно срабатывает (в npm 8+ они эквивалентны).

### Next recommended task

Server-side route guard для team-only маршрутов (`/api/admin`, `/api/templates` write), чтобы превратить UI-mode-split в реальную защиту демо.

---

## Sprint 8 update — 2026-05-12

Theme: **prepare app for public demo deploy** — один URL, любой посетитель может зайти и попробовать, без админ-инструментов по умолчанию и без риска поломать состояние другим.

### Принятое архитектурное решение

**Single-service**: один Node-процесс отдаёт и `/api/*`, и собранную SPA из `web/dist`. Persistent disk хранит SQLite (`prod.db`) + `uploads/`. Один публичный URL → CORS не фигурирует → не нужен отдельный FE-хост.

Почему так, а не Vercel/Netlify + Postgres + S3:
- Один URL = одна ссылка для демо.
- Free tier на Render / Railway покрывает 100% демо-потребностей без рефакторинга.
- SQLite + persistent disk = state переживает деплои.
- Минимум cognitive overhead — нет split deploy / двух панелей секретов / CORS-нюансов.
- Когда демо превратится в продукт — миграция на Postgres + S3 описана в README.

Универсальность: `render.yaml` готов для Render, но тот же контракт ENV работает на Railway / Fly / VPS — описано в README.

### Что сделано

**Server**
- `server/src/env.ts` — добавлены `DEMO_MODE`, `WEB_DIST_DIR`; `truthy()` helper для bool envs.
- `server/src/middleware/demoGuard.ts` — новый middleware, блокирует `DELETE /api/*` и `POST/PATCH /api/templates` если `DEMO_MODE=true`. Возвращает 403 с понятным сообщением.
- `server/src/index.ts`:
  - Production-режим отдаёт `web/dist` через `express.static` + SPA fallback на `index.html` для не-API маршрутов.
  - Резолв `WEB_DIST_DIR` идёт от `import.meta.url` (`server/dist/index.js`) — работает и в локальном проде, и в Render.
  - CORS теперь conditional: `*` или пустое → mirror origin без credentials; явный URL → with credentials. Это позволяет деплоить либо single-service, либо split FE/BE без правок кода.
  - `demoGuard` смонтирован перед всеми API-роутами.
  - `/health` теперь возвращает `{ok, ts, demo, env}` — удобно для healthcheck на Render.
- `server/package.json`:
  - Добавлен `postinstall: prisma generate` — Prisma client автоматически генерируется после `npm install`.
  - `db:deploy: prisma migrate deploy` — production-safe миграция.
  - `db:seed:prod: node dist/seed.js` — компилированный seed, не зависит от `tsx` devDependency.
  - `start:prod: npm run db:deploy && npm run db:seed:prod && node dist/index.js` — последовательный production-startup.

**Root**
- `package.json` — добавлен `start` = `npm --prefix server run start:prod`. Это и есть entrypoint хостинга.

**Web**
- Не тронут. `web/src/lib/api.ts` уже использует `import.meta.env.VITE_API_BASE_URL ?? ''` → в single-service деплое пустая строка даёт same-origin относительный fetch.

**Infrastructure as Code**
- `render.yaml` — blueprint для Render: web service на Node, free plan, 1 GB persistent disk на `/data`, healthcheck `/health`, секретные ENV-плэйсхолдеры для `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`.

**Docs**
- `.env.example` — переписан с разделами (Server runtime, CORS, Demo, Auth, AI, Web). Добавлены: `WEB_DIST_DIR`, `DEMO_MODE`, изменён `VITE_API_BASE_URL` на пустую строку.
- `README.md` — большой раздел «Публичный демо-деплой»: архитектурная диаграмма, инструкция для Render с готовым blueprint, альтернативы (Railway / Fly / VPS), production-like запуск локально, полная таблица обязательных ENV, secure-checklist (`DEMO_MODE`, не комитить ключи, server-side guard для production), отдельный чек-лист «как перейти на настоящий production» (Postgres / S3 / реальная auth / CDN).

### Какие переменные окружения нужны

Минимум для публичного демо (на Render через blueprint всё уже подставлено, кроме AI-ключей):

| Переменная | Значение | Комментарий |
|---|---|---|
| `NODE_ENV` | `production` | включает раздачу SPA |
| `DEMO_MODE` | `true` | блокирует DELETE + edits на шаблонах |
| `DATABASE_URL` | `file:/data/prod.db` | persistent disk |
| `UPLOADS_DIR` | `/data/uploads` | persistent disk |
| `CORS_ORIGIN` | `*` | same-origin → CORS не фигурирует |
| `PORT` | host-injected | задаёт платформа (Render: 10000) |
| `AI_PROVIDER` | `mock` или `anthropic` | mock работает без ключей |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | secret | только в секретах хостинга, не в коде/`.env` |
| `DEV_USER_EMAIL` | `demo@zapusk.tech` | все гости пишут в один аккаунт |
| `DEV_USER_NAME` | `Demo Visitor` | |
| `VITE_API_BASE_URL` (build-time) | пусто | same-origin SPA |

### Как деплоить

**Render (рекомендация):**
1. Push репо в GitHub.
2. Render → New → Blueprint → подключите репо → Render читает `render.yaml`.
3. В **Environment** добавьте `ANTHROPIC_API_KEY` или `OPENAI_API_KEY` (опционально).
4. Дождитесь первого деплоя (~5 мин). Откройте публичный URL.

**Любой другой хост (Railway / Fly / VPS):**
- Build: `npm run install:all && npm run build`
- Start: `npm start`
- Volume на `/data` (или другой путь, синхронизировать с `DATABASE_URL` и `UPLOADS_DIR`)
- ENV из таблицы выше

### Какие проверки прошли

- `cd server && npx tsc --noEmit` → зелёный
- `cd web && npx tsc --noEmit` → зелёный
- `npm run build` → зелёный (server `tsc` + web `vite build`, 1621 модулей, 286 KB JS gzip 86.5 KB)
- **Production-like local run** на отдельном порту 5400, `NODE_ENV=production DEMO_MODE=true`:
  - `prisma migrate deploy` применил миграции (init + sprint3 + interview_answers)
  - `node dist/seed.js` отработал — 4 demo projects (Венский ветер, Tappsk Pro, Apart-отель Чарыш, Кофе с собой)
  - `GET /health` → `{"ok":true,"demo":true,"env":"production"}`
  - `GET /` → 200, `text/html`, отдаёт `index.html` SPA
  - `GET /api/projects` → 4 проекта
  - `DELETE /api/projects/:id` в DEMO_MODE → **HTTP 403** + JSON ошибка
  - `POST /api/templates` в DEMO_MODE → **HTTP 403** + JSON ошибка
  - `GET /projects/some-id/brief` (SPA route) → 200, тот же `index.html` (SPA fallback работает)

### Какие файлы изменены / добавлены

| Path | Тип | Описание |
|------|-----|----------|
| `server/src/env.ts` | edit | `DEMO_MODE`, `WEB_DIST_DIR`, `truthy()` |
| `server/src/middleware/demoGuard.ts` | new | DEMO_MODE middleware |
| `server/src/index.ts` | rewrite | production static + SPA fallback + conditional CORS + mount demoGuard |
| `server/package.json` | edit | `postinstall`, `db:deploy`, `db:seed:prod`, `start:prod` |
| `package.json` | edit | root `start` |
| `.env.example` | rewrite | разделы, новые переменные, понятные комментарии |
| `render.yaml` | new | Render blueprint (free plan + 1 GB disk) |
| `README.md` | edit | раздел «Публичный демо-деплой» вместо короткой шпаргалки |
| `TASKS.md` | edit | Sprint 8 update |

### Known risks

- **SQLite на persistent disk** — для демо нормально, но не масштабируется на несколько инстансов. При горизонтальном scaling перейти на Postgres.
- **Render free tier засыпает** через 15 минут простоя — первый запрос после паузы 30–60 сек. Демо-friendly, продакшен — нет.
- **Один shared dev user** — все гости пишут под `demo@zapusk.tech`. Они видят проекты друг друга. Для приватного демо клиентам можно либо ротировать `DEV_USER_EMAIL` per deploy, либо добавить server-side auth.
- **`DEMO_MODE` — defense at API level**: блокирует DELETE и edits на шаблонах. Но `/admin/projects` и `/templates` всё ещё доступны по прямой ссылке (UI скрывает в client mode, но это не security). Для настоящего production нужен server-side route guard.
- **AI mock fallback** означает, что без ключа все генерации детерминированные. Чтобы продемонстрировать качество — поставьте `ANTHROPIC_API_KEY` в секретах хостинга.
- **`postinstall: prisma generate`** запускается даже при локальной разработке. Это нормально, занимает ~2 сек.
- **`db:seed:prod` идёт на каждом старте** через `start:prod`. Seed идемпотентный, но это +3-5 сек на cold start. Можно убрать после первого деплоя или вынести в release command.

### Next recommended task

- **Server-side route guard для team-only** — превратить mode split из UI-скрытия в реальную защиту. Минимум: middleware, проверяющий заголовок/JWT с ролью team на `/api/admin`, `/api/templates` (write-методы), и client-side redirect для `/admin/projects`, `/templates` в client mode.
- Альтернатива: real auth с magic-link (login по email) — тогда `DEV_USER_EMAIL` уходит совсем, гости приходят со своим email.

Theme: **separate client and team UI + live AI co-pilot for investor meetings**. Two parallel deliverables, both shipped as isolated additions — no refactor, no breaking change to existing routes.

### Part A — UI mode split (client vs Zapusk team)

**Что добавлено**
- `web/src/lib/mode.ts` — простой `getMode()` / `setMode()` / `useMode()` поверх `localStorage` (ключ `zapusk.mode`, default `client`). Изменения броадкастятся через `CustomEvent('zapusk:mode')` — Sidebar рендерится без full reload.
- `web/src/components/ui/ModeToggle.tsx` — два-кнопочный переключатель «Клиент / Команда», стиль соответствует dark-cockpit токенам.
- `Sidebar` отфильтровывает `teamOnly` пункты в client mode. Помечены как teamOnly: `/templates`, `/admin/projects`. В client mode остаются: Рабочий стол, Новый проект, Гайд команды, AI-ассистент на продажах.
- Переключатель встроен в Sidebar выше брендового блока.

**Маршруты при этом не убраны** — `/admin/projects` и `/templates` остаются доступными по прямой ссылке. Это by design (не RBAC, а скрытие из навигации). При полноценной auth-реализации сюда добавится server-side guard.

### Part B — AI Sales Assistant (live SPIN co-pilot)

**Backend**
- `server/src/ai/salesAssistantPrompt.ts` — структурированный system prompt на базе существующей Zapusk SPIN-методологии. Просит модель вернуть строгий JSON-конверт (situation/risk/recommendation/suggestedPhrase/spinStage/tone/confidence/objection/nextStep).
- `server/src/services/salesAssistantService.ts` — `analyzeSalesTurn()` собирает контекст проекта (название, отрасль, бриф, доход инвестора), отправляет в AI, парсит JSON, нормализует значения. Mock fallback — детерминированный heuristic анализатор по ключевым словам (`«дорого»`, `«подумаю»`, `«доходность»`, `«риск»`, ...): корректно срабатывает на SOFT/CONTROL/CLOSE без AI-ключей.
- `server/src/routes/salesAssistant.ts` — `POST /api/sales-assistant/analyze`, zod-валидация (transcript ≤ 8 KB, recent ≤ 16 KB), 400 на пустом input.
- `server/src/index.ts` — маршрут смонтирован под `/api/sales-assistant`.

**Frontend**
- `web/src/pages/SalesAssistant.tsx` — full-screen-friendly страница с двух-колоночной разметкой. Левая колонка — живая транскрипция через `webkitSpeechRecognition` (continuous + interim results, language ru-RU, auto-restart по `onend`). Правая колонка — карточки рекомендаций. Снизу — статус-row с количеством слов/реплик и индикатором AI-провайдера.
- Debounced trigger на анализ: 1.2 s после последней финальной реплики ≥ 12 символов; не отправляем повторно тот же chunk.
- Stop-кнопка вызывает финальный summary в отдельной карточке «Итог встречи».
- Селектор проекта в шапке даёт ассистенту контекст конкретной сделки (раунд, доход инвестора, бриф).
- Permission errors и unsupported browser показываются явной warning-плашкой.

**Sidebar / route**
- В Sidebar.NAV добавлен пункт «AI-ассистент на продажах» — виден в обоих режимах (изначально был помечен `teamOnly`, по запросу пользователя ассистент доступен и клиенту).
- В `App.tsx` смонтирован маршрут `/sales-assistant`.

### Какие файлы изменены

| Side | File | Изменение |
|------|------|-----------|
| web  | `lib/mode.ts` | new — hook + storage helpers |
| web  | `components/ui/ModeToggle.tsx` | new — toggle UI |
| web  | `components/layout/Sidebar.tsx` | filter teamOnly + слот для toggle + новый пункт Sales Assistant |
| web  | `pages/SalesAssistant.tsx` | new — full-screen co-pilot UI |
| web  | `App.tsx` | + маршрут `/sales-assistant` |
| server | `ai/salesAssistantPrompt.ts` | new — system prompt |
| server | `services/salesAssistantService.ts` | new — analyze + mock fallback |
| server | `routes/salesAssistant.ts` | new — POST /api/sales-assistant/analyze |
| server | `index.ts` | + mount sales assistant router |
| root | `TASKS.md` | Sprint 7 update |

### Какие проверки прошли
- `cd server && npx tsc --noEmit` → зелёный
- `cd web && npx tsc --noEmit` → зелёный
- `npm run build` → зелёный (1621 модулей; web bundle 286 KB JS / 25.7 KB CSS gzipped 86.5 + 5.7 KB)
- API smoke-test (с running dev API):
  - `POST /api/sales-assistant/analyze` без проекта, фраза «Расскажите, что вы делаете» → `spinStage=S`, `tone=SOFT`, `confidence=42`, конкретная фраза-открытие.
  - С проектом Венский ветер + фраза про доходность → `spinStage=N`, `tone=CLOSE`, `confidence=70`, фраза с реальными числами проекта (1 млн ₽, 2 сезона, x4).
  - Возражение «подумаю, позже» → `spinStage=P`, `tone=CONTROL`, `objection='I will think'`, `risk` сформулирован.
  - Пустой transcript → HTTP 400 (zod validation).
- Визуальная проверка: страница `/sales-assistant` рендерится в team mode, status row показывает «Готов к старту», транскрипция-плейсхолдер виден, селектор проекта работает.

### Known risks
- Web Speech API доступен в Chrome / Edge / Safari, отсутствует в Firefox. Фоллбэк — явная warning-плашка пользователю. Production-версия должна использовать realtime ASR через backend (OpenAI Whisper / Google STT).
- Distinguishing speakers (founder vs investor) пока нет — transcript идёт сплошным потоком. Это ограничение browser ASR.
- Debounce 1.2 s + минимум 12 символов на анализ означает, что очень короткие реплики игнорируются. Это сознательно — иначе AI тратится впустую на «угу», «да-да».
- Auto-restart `recognition.start()` в `onend` использует `listening` из замыкания — в редких случаях гонки может пропустить тик после `stop()`. Реальной проблемы пока не наблюдается; production-версия должна перейти на ref-флаг.
- Mode split — это UI-скрытие, не security. Прямая ссылка на `/admin/projects` всё ещё работает в client mode. Это ожидаемо — пользователь явно просил «не делать RBAC».
- Mock fallback на /analyze — heuristic по ключевым словам. С реальным `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` модель даёт значительно качественнее SPIN-анализ.
- Selectvalues селектора проектов — это ID существующих проектов; нет UI для «создать встречу без проекта» отдельно (есть пункт «Без привязки к проекту»).

### Что осталось / next recommended task
- Production realtime ASR через backend (OpenAI Whisper streaming) — закрыло бы Firefox и снизит зависимость от браузера.
- Запись сессии в БД: новая модель `SalesSession { id, projectId, startedAt, endedAt, transcript, summary }` для истории встреч и обучения скриптов команды.
- Кнопка «Сохранить встречу как ревью» — превратит summary в `ArtefactReview` или новую сущность `MeetingNote`.
- Server-side mode/auth гард — превратить mode split в реальный RBAC, когда понадобится multi-user.
- В Cockpit добавить кнопку «Открыть с AI-ассистентом» — стартует Sales Assistant сразу с выбранным проектом.

---

## Sprint 6 update — 2026-05-12

Theme: **make MVP demo-ready for clients** — public-facing language cleanup, no AI-kitchen leaking, finish what Codex started.

**Что было сделано Codex (до этого pass)**
- ИНН поля стал необязательным с подсказкой в форме нового проекта.
- Локализация всей навигации, заголовков, кнопок: «Рабочий стол», «Материалы проекта», «Бриф проекта», «Интервью по проекту», «Проверка материалов», «Шаблоны заданий», «Доработать».
- Карточки материалов перерисованы: добавлена кнопка «Открыть задание», модалка с полным текстом, действия «Утвердить», «Отправить на доработку», «Скопировать текст», «Закрыть».
- Появился компонент `VoiceInputButton` (Web Speech API), встроен в Brief feedback, ReviewBlock, AIQuestionCard, RegenerateModal, GeneratedAssetCard modal.
- Создан `publicText` sanitizer на web и server (`web/src/lib/publicText.ts`, `server/src/services/publicText.ts`): подменяет публичные упоминания Lovable, Canva, Cloud Design, Claude, GPT, Sales GPT и связанной терминологии на нейтральные русские формулировки.
- Прошлые `tsc --noEmit` и `npm run build` проходили.

**Что я нашёл и допилил в этом pass**
- **Stale generated `.js` рядом с `.ts`/`.tsx` источниками.** В `web/src/` лежали 45 скомпилированных `.js`-дубликатов (от прошлого случайного `tsc` без `--noEmit`). Это критичный риск — Vite мог при определённых импортах разрешать `.js` вместо свежего `.tsx` и подсовывать пользователю старый UI. Все удалены одной командой `find src -name "*.js" -delete`.
- **publicText не покрывал все публичные термины.** Расширил оба sanitizer-файла регексами для `Investment Summary`, `Investor FAQ`, `One-pager` / `One pager`, `Pitch Deck Website`, `Calculator Spec`, `markdown`.
- **Заголовки `.md` в ZIP-пакете и в одиночных скачиваниях содержали технические `kind`-имена** (`# lovable_landing — v14`, `# sales_gpt — v14`). Добавил `KIND_TITLES` + `titleForKind()` в `server/src/services/promptBuilders.ts`; `packageService.ts` и `routes/exportRoute.ts` теперь рендерят заголовки в виде «Задание для посадочной страницы — версия 14», «Материал для встречи с инвестором — версия 14» и т.д.
- **Английские термины в пользовательских текстах нескольких страниц.** Исправлены:
  - `Guide.tsx` — «7 шагов работы с MVP» → «7 шагов работы с сервисом»; в описании шага 4 «one-pager, FAQ инвестора» → «одностраничник, ответов на вопросы инвестора».
  - `Login.tsx` — «MVP-режим. Один пользователь = одна сессия. SSO и роли — следующий этап.» → нейтральная формулировка про ранний доступ.
  - `ProjectDocuments.tsx` — «One-pager, FAQ» → «Одностраничник, ответы на вопросы инвестора».
  - `AdminProjects.tsx` — «режим MVP без ролей» → «ранний режим без ролей».
  - `ProjectCockpit.tsx` — «скачайте one-pager» → «скачайте одностраничник».
  - Слово `MVP` оставлено только как значение стадии проекта в форме `NewProject.tsx` — это бизнес-термин стадии (Idea / MVP / Ранняя выручка / …), не маркетинговая лексика.

**Какие файлы изменены**
- `server/src/services/publicText.ts` — добавлены 7 новых регексов
- `server/src/services/promptBuilders.ts` — добавлен `KIND_TITLES` + `titleForKind()`
- `server/src/services/packageService.ts` — заголовки .md используют `titleForKind`
- `server/src/routes/exportRoute.ts` — одиночный экспорт `.md` использует `titleForKind`
- `web/src/lib/publicText.ts` — добавлены те же 7 регексов, что и на сервере
- `web/src/pages/Guide.tsx` — два места локализованы
- `web/src/pages/Login.tsx` — текст под кнопкой
- `web/src/pages/ProjectDocuments.tsx` — описание пустого состояния
- `web/src/pages/AdminProjects.tsx` — subtitle админки
- `web/src/pages/ProjectCockpit.tsx` — текст подсказки для шага 60–100%
- `web/src/**/*.js` — 45 stale файлов удалены

**Какие проверки прошли**
- `cd server && npx tsc --noEmit` → зелёный (без сообщений)
- `cd web && npx tsc --noEmit` → зелёный
- `npm run build` (root → server `tsc` + web `vite build`) → зелёный, 1618 модулей, 275 KB JS, 25 KB CSS
- API runtime smoke-test (через работающие preview-серверы) после правок:
  - `POST /api/brief/:id/interview` сохраняет ответ, brief версия повышается (v10).
  - `GET /api/projects/:id` показывает сохранённый ответ в `interviewAnswers`.
  - `POST /api/prompts/:id/generate-full-packaging` собирает brief v11 + 10 заданий.
  - `GET /api/projects/:id/export/zip` отдаёт 23 файла; в `lovable_prompt.md` нет упоминаний `Lovable`/`Claude`/`Sales GPT`/`markdown`/`Investment Summary`; заголовок: «Задание для посадочной страницы — версия 14».
  - `GET /api/projects/:id/prompts/:promptId.md` отдаёт чистый `.md` с локализованным заголовком.

**Что осталось / known risks**
- Внутренние идентификаторы prompt-kinds (`lovable_landing`, `cloud_design`, `sales_gpt`) остались в URL’ах API, в именах файлов ZIP-архива (`lovable_prompt.md`, `cloud_design_prompt.md`), и в БД. Это by design — внутренний контракт между web и server. Пользователь видит только русифицированные заголовки внутри `.md` и в UI через `PROMPT_KIND_LABELS`. При необходимости имена файлов внутри ZIP можно переименовать (`investor_landing_task.md`, `pitch_pdf_task.md`, ...), но это потребует синхронной правки скриптов команды.
- Sanitizer `publicText` основан на регексах — если в будущем шаблоны добавят новые англоязычные технические термины, нужно расширять список. По умолчанию pipeline: добавил термин в seed-шаблон — проверь, нужен ли он в sanitizer.
- В browser голосовой ввод требует Chrome/Edge/Safari c Web Speech API. Если API недоступен, кнопка показывает явную плашку «Голосовой ввод не поддерживается в этом браузере. Введите комментарий текстом» — не вылетает.
- Demo seed после Sprint 4 каждый раз сбрасывает `interviewAnswers = null` у демо-проектов. После моего smoke-теста brief демо-проекта «Венский ветер» поднят до v11, и `interviewAnswers` содержит мой тестовый ответ. Если нужно вернуть демо к «свежему» виду — запустить `npm run db:seed`.

**Что Codex сделал хорошо**
- Чёткое разделение FE/BE sanitizer’ов — без cross-import, без bundling неуместного.
- VoiceInputButton — минимальная реализация с честным fallback, без зависимостей.
- Модалка «Открыть задание» в `GeneratedAssetCard` собирает все важные действия (копировать, доработать, утвердить, скачать, закрыть) в одном поп-апе вместо разбросанных кнопок.
- Локализация в `PROMPT_KIND_LABELS` сделана аккуратно — внутренние kind-ключи не тронуты, видимые заголовки переписаны.

**Готовность к демо**
Готово. Сценарии «без ИНН», «открытие задания», «комментарий → новая версия», «голосовой ввод», «полный пакет → ZIP» проверены вживую. Type-check + build + runtime smoke-test зелёные. Технические упоминания AI-инструментов из публичных текстов вычищены; внутренние идентификаторы остались только там, где они не видны пользователю.

---

## KNOWN ISSUES

| # | Area | Issue | Severity | Notes |
|---|------|-------|----------|-------|
| 1 | Storage | `storage.ts` interface exists with only `LocalStorage` implementation. S3 / R2 swap is one file. | Low | Drop-in when needed. |
| 2 | Integrations | All five integrations (Lovable, CloudDesign, Canva, Directual, Zapusk Platform) return `{ ok: false, reason: 'not_implemented' }`. | By design | Holds the interface until API access is available. |
| 3 | Auth | Single-user mode via `x-user-email` header. Admin page is read-only and accessible to any logged-in user. | Medium | Replace with SSO / roles when multi-team. |
| 4 | Prompt regenerate-with-feedback | When provider is mock, prompt feedback is prepended as a FEEDBACK header to the same template-generated body — there is no actual AI re-reasoning. Brief-level feedback now uses a local fallback that updates the current brief. | Low | Expected behaviour of prompt mock layer. |
| 5 | Multer | Server uses `multer@1.x` which is deprecated (npm warning). Upload works correctly. | Low | Migrate to `multer@2` when convenient. |
| 6 | Web vulnerabilities | `npm audit` reports 2 moderate severity vulnerabilities in transitive deps. None on the request path. | Low | Re-check on next major dep bump. |
| 7 | `Cockpit` import hygiene | `parseList` imported but used only via lib helper (not directly). Cosmetic. | Trivial | Leave for now; agents should not edit unrelated files. |
| 8 | Brief categorization on real AI | If a real provider returns `missingData` without `missingByCategory`, the panel renders empty categories. Brief still shows the flat list as a legacy fallback. | Low | Tighten in next sprint; mock and seed already produce the categorized shape. |
| 9 | One-pager / pitch templates | Generated `.md` contains placeholders like `[масштабный проект]`, `[N]`, `[N]–[M]` because these are filled by the LLM downstream, not by the template engine. | By design | Documented in README; team is expected to refine when running through Lovable/Claude. |

---

## NEXT SPRINT — proposed (Sprint 6)

Theme: **harden rollout paths and deepen review operations** — auth, reviews, exports, and production storage.

### Backend
- [ ] Optional: add `xlsx` write support so financial-model templates can be downloaded as starter `.xlsx`
- [ ] Add duplicate / inactive lifecycle for templates (create/delete/edit is done)

### Frontend
- [ ] Interview page: show a compact "answers applied to brief" diff after save/regenerate
- [ ] Templates: duplicate template; mark template as «inactive» from the list view
- [ ] Project Review: filter by «нужно доработать»; export review summary as `.md`
- [ ] Cockpit: show last 3 reviews timeline on the hero card
- [ ] Dashboard: filter projects by status / industry / investor type
- [ ] Onboarding: first-run modal that drops the user into the Guide page

### Quality
- [ ] Replace `multer@1` with `multer@2` (close issue #5)
- [ ] Run `npm audit fix` on web; verify nothing breaks (close issue #6)
- [ ] Add basic happy-path tests for `briefService`, `promptBuilders`, `reviews` route (decide test runner — `vitest` likely)

### Stretch
- [ ] S3 storage implementation (close issue #1)
- [ ] Real Lovable integration prototype (close issue #2 for that one provider)
- [ ] Multi-user / roles (close issue #3) — needs auth design decision first

---

## Sprint 5 update — 2026-05-11

**Что сделано**
- Добавлен brief-level regenerate-with-feedback: `POST /api/brief/:projectId/regenerate-with-feedback`.
- Endpoint принимает `feedback` и optional `focus`: `narrative`, `finance`, `risks`, `investor_offer`, `missing_data`.
- Backend берёт текущий `ProjectBrief`, дорабатывает его по feedback, обновляет `napkin`, сохраняет новую версию brief и создаёт versioned `napkin` document.
- `interviewAnswers` сохраняются и снова встраиваются в `napkin.interviewAnswers`.
- `missingData` / `missingByCategory` остаются валидными JSON; уже отвеченные вопросы не возвращаются.
- Mock fallback не перетирает hand-tuned brief generic-данными, а применяет feedback поверх текущего brief.
- На Brief page добавлена форма “Что улучшить в брифе?” с выбором focus area и кнопкой “Доработать бриф”.
- Проверено, что следующий `generate-full-packaging` использует обновлённый brief.

**Какие файлы изменены**
- `server/src/services/briefService.ts`
- `server/src/routes/brief.ts`
- `web/src/pages/ProjectBrief.tsx`
- `web/src/pages/ProjectBrief.js`
- `TASKS.md`

**Какие проверки запущены**
- `npx tsc --noEmit` in `server/`
- `npx tsc --noEmit` in `web/`
- `npm run build`
- `npm run db:seed`
- API smoke-test on local compiled server: save interview answer, regenerate brief with feedback, preserve answers, validate napkin/missing data, run full packaging and assert generated prompt includes feedback
- SQLite check after final seed: demo `interviewAnswers` cleared for **Венский ветер**

**Что прошло**
- Server typecheck: green
- Web typecheck: green
- Build: green
- Seed: green
- Smoke-test: green

**Что осталось**
- Optional: show a richer before/after diff on Brief page after feedback regeneration.
- Optional: add automated happy-path tests for `regenerateBriefWithFeedback`.

**Known risks**
- In mock mode, brief feedback is a deterministic local patch, not true semantic re-reasoning. With real AI provider, the model receives the full current brief + feedback and can rewrite fields more intelligently.
- Source tree still has `.js` duplicates next to `.tsx`; touched `ProjectBrief.js` was mechanically regenerated from `ProjectBrief.tsx` to avoid stale runtime UI.

**Next recommended task**
- Add Project Review filters + export review summary as `.md`, because the feedback loop now exists but review operations are still hard to scan at team scale.

---

## Sprint 4 update — 2026-05-11

**Что сделано**
- Закрыт AI Interview loop: ответы сохраняются в `ProjectBrief.interviewAnswers`, встраиваются в `napkin.interviewAnswers`, bump-ят версию брифа, подтягиваются при повторном открытии и попадают в `generate-full-packaging`.
- Mock brief больше не перетирает заполненные demo briefs при `generate-full-packaging`; существующие заполненные поля имеют приоритет, mock/AI дополняет пустые.
- Добавлен Templates CRUD: create, delete, базовая валидация, 404 для отсутствующего template update, UI-кнопки create/delete.
- Seed очищает `interviewAnswers` у demo projects, чтобы smoke-тесты и ручные прогоны не оставляли демо в изменённом состоянии.

**Какие файлы изменены**
- `server/src/services/briefService.ts`
- `server/src/routes/brief.ts`
- `server/src/services/promptBuilders.ts`
- `server/src/services/packageService.ts`
- `server/src/routes/templates.ts`
- `server/src/seed.ts`
- `web/src/pages/ProjectInterview.tsx`
- `web/src/pages/ProjectInterview.js`
- `web/src/lib/progress.ts`
- `web/src/lib/progress.js`
- `web/src/pages/Templates.tsx`
- `web/src/pages/Templates.js` (deleted stale generated duplicate so Vite uses `Templates.tsx`)
- `TASKS.md`

**Какие проверки запущены**
- `npx tsc --noEmit` in `server/`
- `npx tsc --noEmit` in `web/`
- `npm run build`
- `npm run db:seed`
- API smoke-test on local compiled server: interview save, full packaging on 4 demos, prompt contains interview answer, templates create/delete, missing template update returns 404
- SQLite check: all 4 demo `interviewAnswers` are cleared after seed

**Что прошло**
- Server typecheck: green
- Web typecheck: green
- Build: green
- Seed: green
- Smoke-tests: green

**Что осталось**
- Optional Templates follow-up: duplicate template and inactive lifecycle from list view.
- Brief regenerate-with-feedback is still prompt-only; brief-level feedback remains a next sprint item.
- Production storage/auth/integrations remain as tracked known issues.

**Known risks**
- Real AI can still return `missingData` without `missingByCategory`; UI has flat-list fallback, but category panel can be sparse.
- Source tree still contains several old `.js` duplicates next to `.tsx`; touched runtime paths were kept in sync, but a future cleanup should decide whether to remove generated duplicates or change Vite resolution deliberately.

**Next recommended task**
- Add brief-level regenerate-with-feedback, because review feedback currently improves prompts but not the source brief/napkin.

---

## Bugs

_(none open at the moment — all known issues above are tracked features or expected behaviour)_

---

## Bookkeeping

When you finish a task:

1. Move it from `## In progress` (or wherever it lived) to `## Completed (this sprint)`
2. If you discovered a bug, add it under `## KNOWN ISSUES`
3. If the sprint is closed, move the whole `## Completed (this sprint)` section under a dated entry in `## Completed (history)` and empty the current one
4. Don't add `TODO:` comments in code — add an entry here instead
