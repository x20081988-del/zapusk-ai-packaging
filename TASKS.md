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

_(empty — Sprint 36: P0 security fixes from Codex audit landed)_

---

## Sprint 36 — 2026-05-15 — P0 Security Fixes after Codex audit

Theme: **закрыли четыре P0-риска, найденные Codex'ом после Sprint 35.** Плюс маленькая русификация добитых английских строк.

### P0.1 — публичная раздача /uploads закрыта

- **`server/src/index.ts`** — убрали `app.use('/uploads', express.static(...))`. Раньше любой человек с URL мог скачать презентации, финмодели, записи разговоров и брифы клиентов.
- Из SPA fallback убрали exclude для `/uploads` — он больше не нужен.
- **`server/src/routes/files.ts`** — новый `GET /api/files/:projectId/:fileId/download` с проверкой:
  - SUPER_ADMIN / ADMIN / MANAGER скачивают любой файл (helper `actorCanAccessProject`).
  - FOUNDER — только файлы своих проектов.
  - link-файлы (внешние URL'ы без диска) — 404 file_not_downloadable.
  - Path traversal невозможен: финальный путь после `storage.resolvePath` явно проверяется на принадлежность storage-root (защита глубже Prisma row).
  - Missing-on-disk → 404 без отдачи stub'а.

### P0.2 — ownership check на /api/sales-assistant/{analyze,analyze-fast}

- **`server/src/routes/salesAssistant.ts`** — оба endpoint'а теперь до вызова сервиса делают `assertProjectOwnership(req, projectId)` (helper из Sprint 35 `lib/ownership.ts`).
- Правила: admin-like могут использовать любой projectId; founder — только свой; без projectId → анализ без project-context (разрешено).
- Утечка контента закрыта: раньше user A мог подставить projectId user B и получить AI-подсказку, построенную на чужом brief'е и context'е (industry / финмодель / objections, которые AI поднимает из БД).

### P0.3 — render.yaml safe-by-default + .env.example документация

- **`render.yaml`** — blueprint defaults для production теперь safe:
  - `DEMO_MODE=false`
  - `ENABLE_DEMO_LOGIN=false`
  - `ENABLE_HEADER_AUTH=false`
- Комментарий в yaml явно объясняет: если этот деплой — публичная демо-витрина, оверрайдить три флага надо в Render dashboard (dashboard override побеждает yaml). Yaml остаётся safe-by-default — любой новый blueprint-spawn не подхватит опасное поведение.
- **`.env.example`** — отдельный блок описывает все три флага: что они делают, какие production / dev значения, и что demo-инстанс оверрайдит в dashboard.

### P0.4 — Demo* UI files PII audit

- `web/src/pages/DemoAILeads.tsx` — никаких реальных телефонов / aicallscloud / recordingId. Уже синтетический showcase. Заменили `value="Private investor"` → `Частный инвестор` (русификация заодно).
- `web/src/pages/DemoConversationAnalysis.tsx` — чисто, только синтетический `Алексей К.` (паттерн «имя + инициал», как в спеке).
- `web/src/lib/demoMaterials.ts` — чисто, только URL'ы demo-assets для презентаций / финмоделей.
- Server `aiLeadsService.ts` уже был очищен в Sprint 35 (маскированные телефоны + local recording URLs).
- `PersonalManagerCard.tsx` с реальным телефоном `+7 999 120-45-80` — **специально не трогали**: это production-facing customer support контакт, не указан в P0.4 scope. Может быть реальным сотрудником.

### P1 — Финальная русификация UI-строк

Заменили все 10 английских строк, найденных в UI:

- `AIPackagingHistory.tsx`: `Mock fallback` → `Резервный режим`; `AI generated materials` → `Материалы, подготовленные AI`; `Packaging Pipeline` → `процесс упаковки`.
- `PackagingTasks.tsx`: `Internal prompt` → `Внутренний prompt`; `Preview URL` → `Ссылка для просмотра`; `Project URL` → `Ссылка на проект`; `AI generated materials` → `карточке материалов`.
- `Templates.tsx`: `Packaging Pipeline` → `процесс упаковки`.
- `DemoAILeads.tsx`: `Private investor` → `Частный инвестор`.
- `AILeads.tsx`: `Investor strategy` → `Стратегия работы с инвестором`; `Key triggers` → `Ключевые триггеры`; `Ready for AI Leads` → `Готово к запуску AI-лидов`; `In Progress` → `В работе`; `Draft` → `Черновик`.
- `SalesAssistant.tsx`: `AI live` → `AI слушает встречу`; `fallback prompt — проверьте шаблон` → `резервный prompt — проверьте шаблон`.
- `AdminDashboard.tsx`: `Workspace status` → `Статус кабинета`.

### Verification

- `server/` `tsc --noEmit` — pass.
- `web/` `tsc --noEmit` — pass.
- `npm run build` — pass. Новый bundle: `index-BUaCz2fX.js`.
- grep по `aicallscloud` / real phones в server+web — чисто (кроме PersonalManagerCard, см. above).
- grep по English strings из спеки — все закрыты.

### Какие риски закрыты

1. **Публичная утечка файлов через /uploads/** — закрыто.
2. **Утечка AI-подсказок через чужой projectId в sales-assistant** — закрыто.
3. **Опасные production defaults для DEMO_MODE / demo-login / header-auth в blueprint** — закрыто.
4. **PII в Demo* UI** — проверено, чисто.

### Файлы (15)

- Server: `index.ts`, `routes/files.ts`, `routes/salesAssistant.ts`.
- Web: `pages/AILeads.tsx`, `pages/AdminDashboard.tsx`, `pages/DemoAILeads.tsx`, `pages/SalesAssistant.tsx`, `pages/Templates.tsx`, `components/manager/PackagingTasks.tsx`, `components/ui/AIPackagingHistory.tsx`.
- Infra/docs: `render.yaml`, `.env.example`.

### Что осталось на Sprint 37

- **DEMO_MODE flip в текущем Render dashboard** — yaml уже false, но возможно у инстанса остался dashboard-override = true. Пользователь должен зайти в Render → Environment → удалить или поставить `DEMO_MODE=false` если override остался.
- Frontend пока не вызывает новый `GET /api/files/:projectId/:fileId/download` — UI до этого ничего не качал через `/uploads/`. Если в будущем понадобится скачать загруженный файл — фронт должен звать новый endpoint вместо построения URL.
- `PersonalManagerCard.tsx` — решить: оставить как реальный customer support контакт или замаскировать. Требует подтверждения пользователя.
- Sentinel: ownership-check для `/api/conversation-analysis/text` (Sprint 35 уже добавил, но стоит ре-аудитить).
- Аudit-log на read-access (сейчас audit пишется только на mutations).

---

## Sprint 35 — 2026-05-15 — Data Safety + Demo Isolation + Ownership + Prod Auth Hardening

Theme: **закрыли P0-риски смешения demo/боевого режима, доступа к чужим записям, перетирания шаблонов seed-ом и небезопасных production defaults для demo-login / header-auth.** Плюс P1 — замаскировали PII в demo-лидах. P2 — gate'ы вокруг опасных seed-операций.

### P0.1 — Seed safety для шаблонов

- **`server/src/seed.ts`** — перевели `promptTemplate.upsert` на **create-if-missing**. Если шаблон существует — `[seed] template exists, skip update: <key>` и пропускаем. Ручные правки в админке (body / name / active / provider / model / outputType) больше НЕ перетираются повторным деплоем.
- Future flag `SEED_UPDATE_TEMPLATES=true` сознательно не реализован — нет легального пути перетереть прод одной env-переменной.

### P0.2 — Demo isolation для AI-лидов

- **`server/src/routes/aiLeads.ts`** — убрали доверие к `?demo=1`. Mock-лиды теперь только при `user.workspaceStatus === 'demo'`. Active пользователь больше не может одним GET'ом включить себе «43 звонка сегодня» и принять их за реальный сигнал.
- **`web/src/pages/DemoCabinet.tsx`** — CTA «Открыть AI-лиды» ведёт на `/demo/ai-leads` (frontend-only showcase), не в боевой `/ai-leads`.
- **`web/src/pages/AILeads.tsx`** — комментарий-эпиграф к `AILeadsMode` обновлён.

### P0.3 — Ownership checks для встреч и анализов

- **Новый `server/src/lib/ownership.ts`** — единый guard `assertProjectOwnership(req, projectId)` + helpers `isAdminLike(role)`, `getActorRole(req)`. Правила:
  - SUPER_ADMIN / ADMIN / MANAGER — admin-like read/write на всё.
  - FOUNDER — только записи своих проектов (`project.userId = user.id`).
  - Orphan-записи (projectId=null) — admin-only.
  - 404 (не 403) на чужих записях, чтобы не палить факт существования.
- **`server/src/routes/salesSessions.ts`** + **`services/salesSessionService.ts`** — POST `/complete`, GET `/`, GET `/:id`, DELETE `/:id` все проверяют владение. `listSessions` принимает `ownerUserId` и фильтрует через `project.userId`.
- **`server/src/routes/conversationAnalysis.ts`** + **`services/conversationAnalysisService.ts`** — то же самое для POST `/`, POST `/text`, GET `/`, GET `/:id`, DELETE `/:id`.

### P0.4 — Production auth hardening

- **`server/src/env.ts`** — два новых производных флага: `DEMO_LOGIN_ALLOWED`, `HEADER_AUTH_ALLOWED`. Логика: `ENABLE_*=true` → on, `DISABLE_*=true` → off, иначе `!IS_PROD`. В production по умолчанию ОБА выключены.
- **`server/src/auth.ts`** — header-auth fallback теперь смотрит на `env.HEADER_AUTH_ALLOWED`, не на `process.env.DISABLE_HEADER_AUTH`. В prod без явного opt-in — 401.
- **`server/src/routes/auth.ts`** — `/api/auth/demo` смотрит на `env.DEMO_LOGIN_ALLOWED`. В prod без opt-in — 403 demo_login_disabled.
- **`render.yaml`** — текущий Render-инстанс — публичная демо-витрина, поэтому добавили `ENABLE_DEMO_LOGIN=true` + `ENABLE_HEADER_AUTH=true`. Реальные customer tenants эти env-vars не задают → оба flow закрыты по умолчанию.

### P1 — Demo data sensitivity

- **`server/src/services/aiLeadsService.ts`** — 11 жёстко-заданных моков mockLeads():
  - Телефоны замаскированы до `+7 9** ***-**-XX` (только последние 2 цифры различимы).
  - Реальные имена («Виктор Николаевич», «Татьяна Андреевна», «Алексей», «Илья», «Евгений», «Михаил», «Герман», «Виталий») заменены на синтетические «Инвестор А.», «Инвестор Б.», …, «Инвестор З.». «Без имени · уточняется» сохранили.
  - URL записей заменены с `https://aicallscloud.ru/api/process-record-url?recordUrl=<id>.wav` на локальный `/demo-assets/recordings/<id>.wav` — никаких внешних CRM-ссылок в бандле.
- **`web/src/pages/AILeads.tsx`** — баннер «Это демонстрационные данные, не реальные лиды клиента. Телефоны и записи разговоров — синтетические» показывается над KpiGrid при `mode === 'demo'`.

### P2 — Seed cleanup (минимально)

- **`server/src/seed.ts`** — `user.updateMany({ lead → active })` теперь под флагом `SEED_PROMOTE_LEADS=true`. Раньше каждый deploy слепо upgrade'ил всех lead-пользователей; теперь — только при явном opt-in, с логом `[seed] promoted N lead users to active`.
- **`upsertBootstrap()`** — перед upsert'ом сравнивает существующего пользователя с целевыми значениями; если меняем role / workspaceStatus / name — пишет `[seed] bootstrap <email> — applying: role: X → Y; ...`. Видно из деплой-логов, что bootstrap не просто прошёл, но реально что-то поменял.
- Demo project «Венский ветер» уже защищён Sprint 29 (обновляется только если `isDemo=true` или owner = dev-user). Дополнительных изменений не требовалось.

### Verification

- `server/` `tsc --noEmit` — pass.
- `web/` `tsc --noEmit` — pass.
- `npm run build` — pass. Новый bundle: `index-Den47Xoz.js`, server tsc — clean.
- В коде нет `+7 9XX XXX-XX-XX` (real phones), нет `aicallscloud.ru`, нет `?demo=1` доверия на сервере.

### Какие риски закрыты

1. **Перетирание ручных правок шаблонов** при deploy — закрыто create-if-missing.
2. **Demo-инъекция через query** (`?demo=1`) для активных user'ов — закрыто.
3. **Чтение/архивация чужих sales sessions и conversation analyses** founder'ом — закрыто ownership-guard'ами.
4. **/api/auth/demo и x-user-email auth открыты на production по умолчанию** — закрыто prod-safe defaults.
5. **PII в demo-данных** (реальные телефоны + ссылки на CRM) — закрыто маскированием.
6. **Случайный lead→active backfill** при каждом deploy — закрыто SEED_PROMOTE_LEADS gate.

### Файлы

- Server: `seed.ts`, `env.ts`, `auth.ts`, `routes/auth.ts`, `routes/aiLeads.ts`, `routes/salesSessions.ts`, `routes/conversationAnalysis.ts`, `services/salesSessionService.ts`, `services/conversationAnalysisService.ts`, `services/aiLeadsService.ts`, **new** `lib/ownership.ts`.
- Web: `pages/AILeads.tsx`, `pages/DemoCabinet.tsx`.
- Infra: `render.yaml` (опт-ин ENABLE_DEMO_LOGIN + ENABLE_HEADER_AUTH для текущего демо-инстанса).

### Что осталось на Sprint 36

- Полноценный `createdByUserId` на SalesSession / ConversationAnalysis — текущий ownership работает через project.userId, но orphan-записи без projectId всё ещё admin-only. После миграции `createdByUserId` founder сможет владеть orphan'ами.
- Audit-log для read-access (сейчас audit пишется только на mutations).
- Frontend feedback по 403/404 на чужие записи — сейчас просто пустой list, можно показать toast.
- Включение DEMO_MODE=false на текущем Render-инстансе (это уже user-side env-flip, см. Sprint 34Б.2).

---

## Sprint 34В — 2026-05-15 — Разделение транскрипции и AI-подсказки + двухэтапная генерация

Theme: **AI-копилот превращён из «timer-driven автоанализатора» в «ручной инструмент фаундера», который мгновенно подсказывает реплику.** Sprint 34A auto-refresh (каждые 75s / 2500 chars) убран по запросу: на живой встрече непредсказуемое автообновление сбивает с мысли. Плюс одна большая 5-15-секундная генерация разделена на два независимых вызова: ультра-fast тактический ответ (~1-3с) → потом полная аналитика (~5-15с) в фоне.

### Backend (`server/src/services/salesAssistantService.ts` + `routes/salesAssistant.ts`)

- **Новая функция `analyzeSalesTurnFast(input)`** — параллельно с `analyzeSalesTurn`. Использует ту же `sales_gpt` template (через `resolveSalesPrompt`), но:
  - Tight user-prompt: только 4 задачи (spinStage, mainQuestion, backup, selfSale)
  - Minimal JSON schema: 4 required keys
  - `maxTokens: 600` (vs 2400)
  - `modelRoute: 'fast'` (gpt-4o-mini / claude-haiku) — ~1-3s типичный latency
  - `temperature: 0.3`
- **Новый interface `FastAssistantCard`**: `{mainQuestion, backupQuestions, selfSaleQuestions, spinStage, source, provider, model, fellBackToMock, promptSource, promptTemplateId}`
- **Новый route `POST /api/sales-assistant/analyze-fast`** возвращает `{ fast: FastAssistantCard }`. Зеркальный contract с `/analyze`.
- Демо workspace allowlist уже покрывает оба endpoints через `DEMO_INFERENCE_ALLOW` (`/sales-assistant/analyze` + `/sales-assistant/analyze-fast`). Hotfix:

### Frontend (`web/src/pages/SalesAssistant.tsx`)

**Удалено** (Sprint 34A auto-refresh):
- `autoRefreshTimerRef`, `setInterval(..., 5_000)`
- `fullTranscriptChars()` helper
- `AUTO_REFRESH_INTERVAL_MS`, `AUTO_REFRESH_CHARS_DELTA`, `MAX_BACKOFF_RETRIES`
- `lastAnalyzeCharsRef`, `aiBackoffRetriesRef`
- Auto-trigger ветка из `start()`, cleanup из `stop()/reset()/closeFinishModal()/unmount`
- `opts.auto` параметр в `runAnalyze`

**Добавлено**:
- State `analyzePhase: 'fast' | 'full' | null` — текущий этап генерации
- State `fastCard: FastCardShape | null` — partial карточка от fast endpoint
- Interface `FastCardShape` — frontend mirror серверного `FastAssistantCard`
- Двухэтапный `runAnalyze()`:
  1. `setAnalyzePhase('fast')` → `POST /analyze-fast` → `setFastCard(r.fast)` (1-3с)
  2. `setAnalyzePhase('full')` → `POST /analyze` → `setCard(r.card)` (5-15с)
  3. На ошибке fast — показываем error, analytics не запускаем. На ошибке full — fast card остаётся на экране + предупреждение.
- Лог: `[sales-assistant] phase=fast ok latencyMs=X spinStage=Y`, `phase=full ok latencyMs=Z`

**AdviceCard component refactored**:
- Принимает `{ card: AssistantCard | null, fastCard: FastCardShape | null, analyzePhase }`
- Header badges: stage из `action.spinStage` (fast или full); tone/control/engagement только если `card` есть
- Action zone: всегда из `action` (fastCard preferred over card)
- Analytics zone: показывает skeleton (3 animated rows) если `card === null && analyzePhase`. После прихода card — нормальный рендер.
- `EmotionalLayer`, `OBJECTIVE+DIRECTION`, `WHAT TO DO`, `Tone shift`, `MINI-PITCH`, `OBJECTION`, `DEAL NEXT STEP`, `Карта СПИН` — все гейтятся `card &&`.

**Status row split**:
- Дорожка «Транскрипция»: слов / реплик / `слушаю встречу` / `остановлено` / `ошибка микрофона`
- Дорожка «AI-подсказка»: `AI готовит ответ…` (fast) / `AI анализирует диалог…` (full) / `подсказка ещё не запрашивалась` / `обновлена в HH:MM` / `шаблон из админки` / `fallback prompt`
- `restarting` визуально по-прежнему «Слушаю встречу» (Sprint 34A smooth UX preserved)

**Status text copy** (по спеку):
- `listening` title `Слушает` → `Слушаю встречу`, hint про «паузы не сбрасывают»
- `restarting` hint `Пауза в речи, продолжаю слушать. Транскрипция не прерывается.`

### UX flow по спеку

| Сценарий | Поведение |
|---|---|
| Говорить 2-3 мин без кнопки | Транскрипция растёт, подсказка не обновляется (нет таймера) |
| Нажать «Обновить подсказку» | Action zone заполняется через ~1-3с (Главный вопрос/запасные/self-sale), под ним skeleton аналитики |
| Подождать ещё ~5-15с | Skeleton сменяется полной аналитикой (Что происходит / Эмоциональный слой / Куда ведём / СПИН-карта) |
| Пауза 30-60 сек в речи | Статус «Слушаю встречу» (не «перезапуск»), транскрипция продолжается |
| AI fast endpoint падает | Error badge, транскрипция продолжается, кнопку можно нажать снова |
| AI full endpoint падает | Action zone остаётся, аналитика показывает мягкое предупреждение |

### Verification

- [x] Local preview: `POST /analyze-fast` → 200 · 4 ключевых поля + provider+model+promptSource ✓
- [x] mainQuestion реалистичный, 2 backup + 2 self-sale, spinStage='S' ✓
- [x] promptSource=db (Sprint 34Б.2 sales_gpt template живой)
- [x] 0 console errors
- [x] `cd web && tsc --noEmit` clean
- [x] `npm run build` OK
- [ ] Прод-смок после deploy — проверить latency fast endpoint и UI two-phase rendering

---

## Sprint 35-start — 2026-05-15 — AI Brief prompt мигрирован на template-driven

Theme: **Prompt Operating System, шаг 2.** Sprint 34Б.2 вынес `sales_gpt` system-prompt в БД. Sprint 35-start делает то же для **AI Brief Extractor** — второго самого-важного prompt'а платформы. Из 9 системных промптов спека (Sales / AI Leads / Brief / Packaging / Meeting Analysis / Investor Research / Follow-up / Objections / Pitch Analyzer) — 2 теперь template-driven, 7 остаются для следующих итераций Sprint 35.

### Что закрыто

**`server/src/services/templateSeeds.ts`**:
- Импорт `SYSTEM_BRIEF_EXTRACTOR` из `ai/prompts.js` (единый source-of-truth)
- Новая запись в `SEED_TEMPLATES`: `key: 'brief_extractor'`, `category: 'brief'`, `body: SYSTEM_BRIEF_EXTRACTOR`. Seed на каждом deploy upsert'ит её в БД.

**`server/src/services/briefService.ts`**:
- Новый helper `resolveBriefPrompt()` идентичный `resolveSalesPrompt()` из Sprint 34Б.2. Читает `prisma.promptTemplate.findFirst({key:'brief_extractor'})`, проверяет `active && body.length > 200`, возвращает `{system, source: 'db' | 'fallback', templateId}`.
- При fallback пишет AuditEvent `brief_prompt.fallback` с payload `{key, reason, active, bodyLen}`.
- `generateBrief()` и `regenerateBriefWithFeedback()` — оба используют `briefPrompt.system` вместо прямого `SYSTEM_BRIEF_EXTRACTOR`. Регенерация добавляет свой feedback-mode инструктаж сверху.
- Console log: `[brief] generate · prompt source=db templateId=...` или `[brief] regenerate · prompt source=fallback`.

### Принцип

«Не разбрасываться». В Sprint 35-start взят один prompt по тому же паттерну. После DEMO_MODE=false (env-флип в Render) super-admin сможет редактировать `brief_extractor` без redeploy — как уже умеет с `sales_gpt`.

### Что осталось для Sprint 35 (полный prompt-OS)

| Promt | Текущее место | Кандидат на migrate |
|---|---|---|
| ✅ Sales GPT | template `sales_gpt` (Sprint 34Б.2) | done |
| ✅ Brief Extractor | template `brief_extractor` (Sprint 35-start) | done |
| Packaging templates (10 keys) | уже template-driven через `generateAllPrompts` | — |
| AI Meeting Analysis | hardcoded в `conversationAnalysisService` | TODO |
| AI Leads orchestration | hardcoded в `aiLeadsService` | TODO |
| AI Investor Research | не реализован | new feature |
| AI Follow-up generation | живёт внутри SalesSession completion | TODO |
| AI Objections handler | часть Sales GPT prompt | уже там |
| AI Pitch Analyzer | не реализован | new feature |

Плюс **Sprint 35 spec items** (за пределами migrate'а):
- Категории шаблонов в админке
- Версии prompt-шаблонов (как у material versions из Sprint 32)
- Draft / Published flow для templates
- A/B prompt testing
- Prompt metrics (какой prompt даёт лучшие follow-up / встречи / конверсию)

### КРИТИЧЕСКИЙ блокер прод-редактирования промптов

Sprint 34Б.2 + 35-start обе сделаны архитектурно правильно. Но прод **всё ещё на `DEMO_MODE=true`** → `demoGuard` блокирует `PATCH /api/templates/:id` с 403 `demo_mode_locked`. Super-admin физически не может редактировать `brief_extractor` или `sales_gpt` через API.

**Действие**: в Render dashboard → service `zapusk-ai` → Environment → `DEMO_MODE` с `true` на `false` → Save. Без этого все template-миграции остаются read-only inert.

### Verification

- [x] `cd server && tsc --noEmit` clean
- [x] `npm run build` OK
- [x] Локальный smoke не нужен — паттерн идентичен Sprint 34Б.2 (full smoke verified тогда)
- [ ] Прод-смок отложен до `DEMO_MODE=false`. После env-флипа можно проверить:
  - PATCH /api/templates/{brief_extractor.id} {active: false} → analyze → promptSource=fallback
  - PATCH back {active: true} → analyze → promptSource=db
  - Edit body → новый prompt применяется сразу

---

## Sprint 34Б.3 update — 2026-05-15 — Русификация интерфейса и AI-карточек

Theme: **«Русский интерфейс + случайные англицизмы» → цельный русский B2B SaaS.** До Sprint 34Б.3 в UI оставались десятки англоязычных строк (`S — Situation`, `Тон · SOFT`, `COLD · холодно`, `briefing`, `live pipeline`, `next step`, `follow-up`, `AI Search Ready`, `AI Discoverability`, `cheat-sheet`, `read-only режим`). Это ломало премиальное ощущение продукта для русскоязычного предпринимателя.

### Разрешённые англицизмы (по спеку)

`AI`, `ZAPUSK AI`, `self-sale`, `СПИН`. Всё остальное — на короткий живой русский.

### Что переведено

**SalesAssistant** (главное):
- `S — Situation` / `P — Problem` / `I — Implication` / `N — Need-Payoff` → **`С — Ситуация` / `П — Проблема` / `У — Усиление` / `Р — Решение`**
- `Тон · SOFT/CONTROL/CLOSE` → **`Тон · мягкий/контроль/закрытие`** (новый `TONE_LABEL`)
- `Контроль · LOW/MED/HIGH` → **`Контроль · низкий/средний/высокий`**
- `COLD · холодно` / `WARM · тепло` / `HOT · горячо` → **`Холодный/Тёплый/Горячий контакт`**
- `Карта SPIN` → **`Карта этапов СПИН`** + русские буквы С/П/У/Р в визуализации
- `next step и follow-up` → **`следующий шаг и продолжение общения`**

**AILeads**:
- `AI Investment Operating System` → **`Операционная система привлечения инвестиций`**
- `AI собирает briefing` / `AI готовит briefing` / `AI начал briefing` → **`AI собирает бриф` / `AI готовит бриф` / `AI начал подготовку`**
- `Демо-режим live pipeline` → **`Демо-режим: поток лидов в реальном времени`**
- `Investor profile собран` → **`Профиль инвестора собран`**
- `ready` / `briefing` бейджи → **`готов` / `подготовка`**
- `Investment readiness` → **`Готовность проекта к инвестициям`**
- `Auto-fill briefing` → **`AI-заполнение брифа`**
- `AI Brief Analyzer` → **`AI-анализ брифа`**
- `AI processing…` → **`AI обрабатывает…`**
- `Feed показан как demo preview ... briefing` → **`Лента показана как демо-превью ... брифа`**
- `Мессенджеры и follow-up` → **`Мессенджеры и продолжение общения`**

**ConversationAnalysis + DemoConversationAnalysis + Meetings + PersonalManager**:
- `транскрипцию ... next step` → **`расшифровку разговора ... следующий шаг`**
- `Готовый follow-up` (в MeetingCard + ConversationAnalysis) → **`Готовое продолжение общения`**
- `cheat-sheet по инвестору` → **`краткая памятка по инвестору`**
- `с next step и готовым follow-up` → **`со следующим шагом и готовым продолжением общения`**
- `разберёт записи разговоров и next steps` → **`разберёт записи разговоров и следующие шаги`**

**DemoCabinet + Dashboard**:
- `demo cabinet: ... AI-ready упаковка с semantic structure под AI-search` → **`демо-кабинет: ... AI-готовая упаковка с семантической структурой для AI-поиска`**
- `AI Search Ready` / `AEO-ready structure` / `AI Discoverable` → **`Готов к AI-поиску` / `Структура для AI-поиска` / `Виден AI-поиску`**
- `semantic structure и AEO-слоем ... AI answer engines ... AI Discoverability Score` → **`семантической структурой и AI-слоем ... AI-поисковики ... балл видимости в AI-поиске`**

**AIDiscoverabilityScore** (компонент):
- Title `AI Discoverability` → **`Видимость в AI-поиске`**
- Сегменты: `AI Readability / Investor Keywords / FAQ Quality / Semantic Structure / Citation Readiness` → **`Читаемость для AI / Инвестиционные ключевые слова / Качество FAQ / Семантическая структура / Готовность к цитированию`**
- `AEO в работе` / `nужны улучшения` → **`Подготовка в работе`**

**Admin + Templates labels** (`web/src/lib/aiProviders.ts`):
- `Demo — read-only режим` → **`Демо — только просмотр`**
- `Investor FAQ` → **`FAQ для инвестора`**
- `AI Sales Assistant` (label) → **`AI-ассистент продаж`**
- `AI Discoverability` (label) → **`Видимость в AI-поиске`**

**investmentTrack labels**:
- `Лендинг с investor blocks и AI Discoverability` → **`Лендинг с инвесторскими блоками и видимостью в AI-поиске`**
- `AI Discoverability` стадия → **`Видимость в AI-поиске`**
- `AI search engines` (в hint'е) → **`AI-поисковики`**
- `Холодные касания и follow-up` → **`Холодные касания и продолжение общения`**

### Что НЕ трогали

- **Code identifiers** (`transcript`, `readiness`, `criticalReady`, `dealControlLevel`, type union values `LOW/MED/HIGH/SOFT/CONTROL/...`, prisma fields). Они часть API contract.
- **AI prompt internals** (`SYSTEM_BRIEF_EXTRACTOR`, `SALES_ASSISTANT_SYSTEM`) — это language для модели, не для UI.
- Имена брендов: `ChatGPT`, `Claude`, `Perplexity`, `Zoom`, `Telegram`, `WhatsApp` — это правильно.
- Технические термины: `H1/H2/H3`, `SPIN` (внутри `СПИН` уже), формат файлов.

### Verification

- [x] `cd web && tsc --noEmit` clean
- [x] `npm run build` OK (новый bundle `index-D-UR3QF3.js`)
- [x] Static check всех ключевых русских лейблов в bundle: «С — Ситуация», «Карта этапов СПИН», «Холодный контакт», «Контроль · низкий», ...
- [x] Static check отсутствия 15 запрещённых англоязычных строк: **0 hits** на финальном bundle
- [x] Local preview: SalesAssistant загружается, 0 console errors

### Файлов изменено

12 файлов:
- `web/src/pages/SalesAssistant.tsx` (SPIN labels + tone + temp + map)
- `web/src/pages/AILeads.tsx`
- `web/src/pages/ConversationAnalysis.tsx`
- `web/src/pages/DemoAILeads.tsx`
- `web/src/pages/DemoCabinet.tsx`
- `web/src/pages/DemoConversationAnalysis.tsx`
- `web/src/pages/Meetings.tsx`
- `web/src/pages/PersonalManager.tsx`
- `web/src/pages/Dashboard.tsx`
- `web/src/pages/AdminDashboard.tsx`
- `web/src/components/ui/AIDiscoverabilityScore.tsx`
- `web/src/components/ui/MeetingCard.tsx`
- `web/src/components/ui/RecentMeetings.tsx`
- `web/src/lib/aiProviders.ts`
- `web/src/lib/investmentTrack.ts`

---

## Sprint 34Б.2 update — 2026-05-15 — Sales prompt теперь управляемый слой, не код

Theme: **Prompt engineering — ключевой IP. Не должен жить в коде.** До Sprint 34Б.2 `analyzeSalesTurn` использовал `import { SALES_ASSISTANT_SYSTEM } from '../ai/salesAssistantPrompt.js'` — hardcoded 167-строчный TS module. PromptTemplate row `key='sales_gpt'` (4173 символа, active=true) **существовала в БД и редактировалась через super-admin → Шаблоны**, но `analyzeSalesTurn` её **игнорировал**. Sprint 34Б.2 перевернул контракт: prompt берётся из template, fallback на код только при отсутствии.

### Backend

**`server/src/services/salesAssistantService.ts`**:
- Новый `resolveSalesPrompt()` helper: `prisma.promptTemplate.findFirst({where: {key: 'sales_gpt'}})`. Если template есть, active=true и body > 200 chars → `{system: tpl.body, source: 'db', templateId: tpl.id}`. Иначе fallback на hardcoded `SALES_ASSISTANT_SYSTEM` с reason: `not_found | inactive | body_too_short`.
- `analyzeSalesTurn` дёргает `resolveSalesPrompt()` в начале + использует `promptDecision.system` вместо `SALES_ASSISTANT_SYSTEM`.
- Console log: `[sales-assistant] prompt source=db templateId=cmp5cge9a...` или `[sales-assistant] template "sales_gpt" not usable (reason=inactive) — falling back to hardcoded`.
- **AuditEvent `sales_prompt.fallback`** пишется на каждом fallback с payload `{key, reason, active, bodyLen}`. Super-admin видит в `/admin/audit` если template сломан.

**`AssistantCard` interface (server + frontend)**:
- Новые поля `promptSource: 'db' | 'fallback'`, `promptTemplateId: string | null` в каждом response.
- `CoreCard` type обновлён чтобы Omit-ить эти 2 новых поля.

### Frontend

**`web/src/pages/SalesAssistant.tsx`**:
- AssistantCard интерфейс расширен полями `promptSource?`, `promptTemplateId?`.
- Status row badges:
  - `promptSource === 'db'` → `<StatusBadge tone="info">шаблон из админки</StatusBadge>` (зелёный info)
  - `promptSource === 'fallback'` → `<StatusBadge tone="warning">fallback prompt — проверьте шаблон</StatusBadge>` (жёлтый)
- Пользователь видит, откуда AI взял свою «голову».

### Dynamic update verified (no redeploy)

| Step | promptSource | templateId |
|---|---|---|
| Initial (template active) | `db` | `cmp5cge9a00092sj8s2deye3c` ✓ |
| PATCH /api/templates/:id `{active: false}` → analyze immediately | `fallback` | `null` ✓ |
| AuditEvent `sales_prompt.fallback` записан | reason=`inactive`, bodyLen=4173 ✓ | |
| PATCH `{active: true}` → analyze immediately | `db` | `cmp5cge9a00092sj8s2deye3c` ✓ |

Super-admin может менять, выключать, восстанавливать template (Sprint 32 versioning) → AI отвечает по новому prompt'у с **следующего запроса**. Деплой не нужен.

### Что осталось не сделано (вне Sprint 34Б.2 scope)

- **Prompt versioning UI** в шаблонах — Sprint 32 уже даёт `/api/prompts/:projectId/:kind/versions` для project-scoped prompts. Для `PromptTemplate` (system templates) аналог пока отсутствует. Если super-admin сделает «плохой» prompt — откатить можно только через DB.
- **Provider/model из template** — поля `provider`, `model` уже есть в PromptTemplate row (Sprint 15 orchestration), но `analyzeSalesTurn` всё ещё использует `feature: 'sales_assistant.analyze'` и берёт provider из env. Если хотим управлять моделью через шаблон — отдельная задача.

### Verification

- [x] Both `tsc --noEmit` clean
- [x] `npm run build` OK
- [x] Local: template fetch + fallback + audit + dynamic toggle all working
- [x] Audit event payload содержит reason / active / bodyLen — диагностируется в `/admin/audit`

---

## Sprint 34Б.1 update — 2026-05-15 — Перестройка приоритетов подсказок AI-ассистента

Theme: **AI-карточка из «анализирует встречу» в «помогает вести разговор».** Пользователь открывал /sales-assistant и видел сверху аналитику (situation / эмоциональный слой / what to do / куда ведём), а action-блоки («Главный вопрос», «Запасные вопросы», «Self-sale», «Что сломает сделку», «Что НЕ делать») жили ниже после 200+ строк аналитики. Это неправильно по UX — на живой встрече нужна *реплика*, а не дашборд.

### Изменения

**`web/src/pages/SalesAssistant.tsx`** — только reorder, ничего не удалено:

Новый порядок секций карточки (после статус-шапки + STAGE_HINT):

1. **🔥 «Что сказать прямо сейчас»** (rounded-lg border-ai/30 bg-ai/4, визуально highlight'нут):
   - Главный вопрос сейчас (blockquote)
   - Запасные вопросы
   - Self-sale: пусть он сам себе продаст
   - Что может сломать сделку
   - Что НЕ делать сейчас

2. **🧠 «Аналитика разговора»** (border-top hairline):
   - Что происходит (Situation)
   - Эмоциональный слой
   - Что упускаем
   - Цель этапа + Куда ведём (2 col)
   - Что делать
   - Как изменить тон

3. **📍 «Дополнительно»** (border-top hairline):
   - Карта SPIN (которые этапы открыты)

### Что НЕ изменилось

- AI prompt / backend контракт — без изменений
- Все 13+ полей AssistantCard всё ещё рендерятся
- Mini-pitch, Возражение, Следующий шаг сделки — на прежних позициях (между Action zone и Дополнительно)
- EmotionalLayer component — без изменений, переехал внутрь Аналитики

### Verification

- [x] `cd web && tsc --noEmit` — clean
- [x] `npm run build` — OK
- [x] Static order check в bundle:
  ```
  Что сказать прямо сейчас → Главный вопрос сейчас →
  Аналитика разговора → Что происходит →
  Дополнительно → Карта SPIN
  ```
- [x] Local preview: page загружается, 4 кнопки видны, 0 console errors

### Принцип

«Не анализировать встречу, а вести разговор». AI-копилот должен открываться экраном «что сейчас сказать», а не «вот что произошло». Reorder без backend change — самый дешёвый способ переделать ощущение продукта.

---

## Sprint 34A.1 hotfix — 2026-05-15 — AI analyze разрешён для demo workspace

Theme: **Прод-юзер `demo-founder` нажал «Обновить подсказку» → 403 → UI показал «AI временно недоступен».** Причина: глобальный `requireActiveWorkspace` middleware (Sprint 22 invite-only architecture) блокирует **все** non-GET для demo workspace, включая `POST /api/sales-assistant/analyze`. Но это **inference compute, не DB write** — demo юзер должен видеть AI-копилот в работе, это и есть demo value.

### Изменения

- **`server/src/middleware/workspaceAccess.ts`** — новый `DEMO_INFERENCE_ALLOW = new Set(['/sales-assistant/analyze'])`. В `requireActiveWorkspace` write attempts для demo workspace проходят, если path в allowlist. Логика: `analyzeSalesTurn` не делает ни одного `prisma.create/update/upsert/delete` — это pure compute. Реальные writes (project create, conversation-analysis upload, brief regenerate) остаются заблокированы.
- **`web/src/pages/SalesAssistant.tsx`** — `runAnalyze` catch теперь различает `workspace_readonly` / 403 от других ошибок. Для workspace_readonly показывает специфичное «Демо-режим: AI-подсказки доступны после активации рабочего кабинета. Свяжитесь с менеджером.» и **не делает retry** (бессмысленно — статус не изменится). Обычные ошибки получают backoff 1s→2s→4s→8s как в Sprint 34A.

### Verification

- [x] Local: demo workspace user → POST /api/sales-assistant/analyze → 200, card.spinStage='S' ✓
- [x] Local: demo workspace user → POST /api/projects → 403 workspace_readonly ✓ (still blocked)
- [x] Local: demo workspace user → POST /api/conversation-analysis/text → 403 ✓ (still blocked)
- [x] Type-check both sides clean
- [x] Build OK

### Принцип

Sprint 22 invite-only — для **защиты данных**. AI inference не пишет данные клиента, значит безопасен для demo. Любой будущий inference-endpoint (без DB write) можно добавить в `DEMO_INFERENCE_ALLOW`. Сейчас только sales-assistant — есть осознанно: brief regenerate / packaging generate / conversation analysis ВСЕ создают DB rows, должны оставаться заблокированы для demo.

---

## Sprint 34A update — 2026-05-15 — AI-ассистент: auto-refresh + smooth restart + error surface

Theme: **AI-copilot из «нажми кнопку» в «слушает непрерывно».** Core retention feature на странице `/sales-assistant` имел 5 видимых багов: silent fail на «Обновить подсказку», нет авто-refresh, жёлтый flash «перезапуск» между speech-сегментами, нет timestamp последнего AI-апдейта, 32k chars каждый запрос (context explosion за 30 мин). Sprint 34A — точечный bugfix без новых backend сущностей.

### Что закрыто

**`web/src/pages/SalesAssistant.tsx`:**
- **Auto-refresh interval**: каждые 5s tick проверяет — если transcript вырос на ≥2500 chars ИЛИ с момента последнего successful analyze прошло ≥75s, дёргаем `runAnalyze({ auto: true })`. AI чувствуется как «слушает непрерывно», user button click больше не обязателен.
- **Error surface + exponential backoff**: вместо silent `console.warn` теперь показываем `<StatusBadge tone="warning">AI временно недоступен</StatusBadge>`. Retry с backoff 1s → 2s → 4s → 8s (max 4 попытки). Transcript stream при этом продолжается независимо.
- **Smooth restart UX**: `speechStatus === 'restarting'` визуально рендерится как «Слушает», без жёлтого мигания. Браузер режет speech на сегменты, пользователю это не видно.
- **Last-update timestamp**: «AI обновил 14:32:12» в status row. Заменяет старый «готов обновить подсказку».
- **«AI думает...» indicator** во время analyze.
- **Debug logs в console** (frontend): chunk size, total chars, request size, latency, error code, backoff attempt.
- **Rolling context window**: `transcript.slice(-32_000)` → `transcript.slice(-8_000)`. `recentContext` (последние 6k) уже было — даёт overlap. Context больше не взрывается через 30+ минут встречи.
- **Cleanup on stop/unmount**: `autoRefreshTimerRef.current` чистится в `stop()`, `closeFinishModal()`, и unmount useEffect.

### Что не делалось в Sprint 34A (отложено в Sprint 34B+)

- `MeetingRealtimeSession` table — in-memory достаточно для текущих 5-30 минутных встреч
- Backend rolling summary — frontend window достаточен
- Speaker states / meeting energy / investor interest score — отдельные фичи
- Separate Stream A/B — уже неблокирующе разделены (SR onresult → setTranscript независим от runAnalyze)

### Verification

- [x] `cd web && tsc --noEmit` — clean (после fix `onClick={() => runAnalyze()}` wrapper для типов)
- [x] `npm run build` — OK (551.86 kB / 155.83 kB gzip, +2 kB к Sprint 33)
- [x] Local preview: page `/sales-assistant` рендерится, 4 кнопки видны включая «Обновить подсказку», 0 console errors
- [x] Backend smoke: `POST /api/sales-assistant/analyze` с реальным transcript → 200, card возвращается (mock fallback в dev, AI работает на проде)

### Debug logs пример

В console при listening:
```
[sales-assistant] auto-refresh trigger chars=2812 delta=2812 sinceLastMs=Infinity
[sales-assistant] analyze req chars=2812 total=2812 retries=0
[sales-assistant] analyze ok latencyMs=1577 spinStage=S
```

При ошибке:
```
[sales-assistant] analyze error message="500" retries=0
[sales-assistant] backoff retry in 1000ms (attempt 1/4)
```

---

## Sprint 33 update — 2026-05-15 — Material History Drawer + Compare + Restore UI

Theme: **Backend versioning из Sprint 32 теперь видим пользователю.** До Sprint 33: snapshots, restore endpoints, audit log — всё было только в API. Sprint 33 — UI поверх: timeline версий, side-by-side compare с diff highlighting, restore через confirm modal. AI больше не выглядит как «магическая кнопка, которая что-то перезаписала».

### Узкий MVP scope

Без npm-зависимостей (custom diff вместо react-diff-viewer). Без manual edit tracking (нужен отдельный edit endpoint — Sprint 34). Без landing draft/publish flow.

### Новые компоненты

- **`web/src/components/ui/Drawer.tsx`** — slide-in panel primitive (right side). Pattern из Modal: portal, ESC, body-scroll-lock. Slide-in animation, footer slot.
- **`web/src/lib/diff.ts`** — LCS line-by-line diff без npm. `diffLines(old, new)` → массив `{op, text, oldIndex, newIndex}`. `diffStats(diff)` → `{added, removed, unchanged}`. ~80 строк, достаточно для markdown/text.
- **`web/src/components/ui/MaterialCompareModal.tsx`** — fullscreen split: левая колонка «Было», правая «Стало». Подсветка: зелёный=add, красный=remove, neutral=equal. Шапка показывает stats (+/−/без изменений).
- **`web/src/components/ui/MaterialHistoryDrawer.tsx`** — главный component:
  - Timeline всех версий (current + snapshots) с source badge: AI-сгенерировано / AI-интервью / Восстановлено / Ручная правка / Архив
  - «Сравнить с текущей» → открывает CompareModal
  - «Сделать основной» → `window.confirm` + POST restore endpoint + audit log
  - Brief версии сериализуются в markdown (sections: Бизнес / Монетизация / Метрики / Сильные / Риски / Не хватает / Salfetka) для осмысленного diff'а
  - Универсальный — kind: 'brief' | 'prompt' | 'document'

### Интеграция в ProjectCockpit

- `<AIPackagingHistory>` получил prop `onOpenHistory(templateKey, label)` — родитель открывает MaterialHistoryDrawer. Per-row кнопка «История» в admin/manager и client view.
- Brief CardHeader получил кнопку «История версий» рядом с briefStatus.cta.
- `historyDrawer` state в cockpit держит `{kind, promptKind?, title}`, после restore вызывает `load()` для обновления project content.

### Local preview verified

- `cd web && tsc --noEmit` — clean
- `npm run build` — 550.19 kB / 155.19 kB gzip (+13 kB к Sprint 32)
- Vite dev server + API local:
  - login FOUNDER → create project → generate brief x2 (v1 snapshot create)
  - открыл /projects/X → кнопка «История версий» видна
  - click → drawer открылся с timeline v2 (current, Основная badge) + v1 (AI-сгенерировано)
  - click «Сравнить с текущей» → compare modal открылся, diff table рендерится, stats показывают +/−/без изменений
  - **0 console errors**

### Что закрыто Sprint 33

| Угроза | До | После |
|---|---|---|
| История версий невидима пользователю | только в backend через `/api/.../versions` | UI drawer на каждой material card |
| Compare версий — нельзя увидеть diff | none | fullscreen side-by-side с подсветкой add/remove |
| Restore через API без UX | curl-only | кнопка «Сделать основной» + confirm explaining что current сохранится в истории |
| AI vs Human source неясен | source field в API, не показан | badge на каждой версии: AI-сгенерировано / AI-интервью / Восстановлено / Ручная правка |

### Что осталось вне scope (Sprint 34+)

- **Manual edit tracking** — нужен `human_edited` source flag + edit endpoint (требует UI editor)
- **Landing draft/publish flow** — preview draft + manual publish (нужна интеграция с Lovable preview URL)
- **ProjectCockpit Journey alert** «Есть новая AI-версия на проверке» — cosmetic, depends на manual edit tracking
- **«Есть N черновиков»** badge в AIPackagingHistory — depends на draft status field (Sprint 32 решил оставить append-only без draft/published flag)
- **react-diff-viewer** для wrapper/highlighted-words diff — нужен npm install, custom LCS достаточен для MVP

---

## Sprint 32 update — 2026-05-14 — Append-only brief versions + restore (catastrophic-only scope)

Theme: **Brief edit history больше не теряется.** До Sprint 32: ProjectBrief был `@unique(projectId)` (one per project), любой regenerate / interview / feedback-refine вызывал `prisma.projectBrief.upsert/update` который **перезаписывал** старые данные. Если фаундер 3 часа уточнял брифинг через AI-интервью, а потом нажал «Пересобрать бриф» — все ответы исчезали.

GeneratedPrompt + GeneratedDocument уже были append-only (Sprint 21 design — каждый generate = новая строка), но не было endpoint'а для restore из старой версии. Sprint 32 закрыл оба: brief snapshots + universal restore.

### Узкий scope (по запросу)

Только catastrophic-grade защита. Compare UI с diff highlighting, Material History Drawer, manual edit detection — отложено в Sprint 33.

### Schema (migration `20260514183249_sprint32_brief_versions`)

- **`ProjectBriefVersion`** — НОВАЯ таблица. Snapshot всех 11 brief полей (businessSummary, monetization, keyMetrics, investmentAsk, strengths, weaknesses, missingData, missingByCategory, interviewAnswers, napkin, rawAIResponse) + `source` ('ai_generate' | 'ai_regenerate_feedback' | 'interview' | 'restore' | 'manual_edit') + `version` (integer) + createdAt.
- Append-only: только create, никаких update/delete на ProjectBriefVersion.
- Indices на `(projectId, version)` и `(projectId, createdAt)`.
- ProjectBrief schema **не меняется** — остаётся `@unique(projectId)`, "current". Существующий код продолжает работать.

### Backend

- **`server/src/services/briefService.ts`**:
  - Новый export `snapshotBrief(brief, source)` — копирует все поля в ProjectBriefVersion.
  - `generateBrief()` — если existing brief есть, snapshot ПЕРЕД `upsert`.
  - `regenerateBriefWithFeedback()` — snapshot ПЕРЕД `update`.
- **`server/src/routes/brief.ts`**:
  - `PATCH /:projectId/interview` — snapshot ПЕРЕД `update` (interview answers тоже могут перезаписать missingData/napkin).
  - **`GET /:projectId/versions`** — список всех snapshots + current, newest first.
  - **`GET /:projectId/versions/:versionId`** — full snapshot одной версии.
  - **`POST /:projectId/restore/:versionId`** — snapshot текущего → перезаписывает ProjectBrief данными старой версии. Version=current+1 (restore это новая версия, не клон). Audit `brief.restore` с `restoredFromVersionNumber` + `newVersion`.
- **`server/src/routes/prompts.ts`** — universal restore без schema change (GeneratedPrompt + GeneratedDocument уже append-only):
  - `GET /:projectId/:kind/versions` — 50 latest prompt versions
  - `POST /:projectId/:kind/restore/:promptId` — append new row с body старой версии + `feedback: [restored from v{n}]`. Audit `prompt.restore`.
  - `GET /:projectId/documents/:kind/versions`
  - `POST /:projectId/documents/:kind/restore/:documentId` — то же для документов. Audit `document.restore`.

### Audit events

| Action | Payload |
|---|---|
| `brief.restore` | `{projectId, restoredFromVersionId, restoredFromVersionNumber, newVersion}` |
| `prompt.restore` | `{projectId, kind, restoredFromVersion, newVersion}` |
| `document.restore` | `{projectId, kind, restoredFromVersion, newVersion}` |

Generate events не логируются отдельно — каждая запись `ProjectBriefVersion` сама является событием (с source field).

### Что закрыто Sprint 32

| Сценарий | До | После |
|---|---|---|
| Regenerate brief стирает старые ответы | unrecoverable | v1 snapshot'нут в ProjectBriefVersion, restore доступен |
| Interview answers перезаписали missingData | unrecoverable | snapshot перед update |
| Feedback refine пишет over старый текст | unrecoverable | snapshot перед update |
| Юзер хочет вернуть старый prompt/document | latest only, история есть но restore нет | append new row с body старой + audit log |

### Local smoke (verified)

1. Create project → generate brief v1 → 0 snapshots (correct)
2. Regenerate brief → v1 snapshot создан, current=v2
3. Restore v1 → v2 snapshot создан, current=v3 (с content v1)
4. `/api/admin/audit?action=brief.restore` — event записан с полным payload
5. Server tsc clean, full build OK

### Что вне scope (Sprint 33+)

- Compare UI с side-by-side diff (нужна `diff` library или custom highlighting)
- Material History Drawer component (UI)
- ProjectCockpit visual updates (cosmetic)
- "Редактировалось вручную" badge + manual edit endpoint
- Landing draft/publish flow
- AI auto-create-draft вместо overwrite-current (regenerate UX semantics)

---

## Sprint 31 update — 2026-05-14 — Pre-deploy snapshot + full backup (db + uploads)

Theme: **Закрыли два сценария где данные исчезают навсегда без шанса откатить.** До Sprint 31:
1. `start:prod` запускал `prisma migrate deploy` **без снапшота** — destructive migration = безвозвратная потеря БД.
2. `POST /api/admin/backup` стримил **только `prod.db`** — uploads (презентации, финмодели, изображения) не были в backup'е, disk corrupt = половина платформы потеряна.

Узкий scope: только catastrophic-grade защита. Seed overwrite, transactions, versioning — Sprint 32+.

### Backend

- **`server/src/scripts/preDeploySnapshot.ts`** — НОВЫЙ. Запускается перед `prisma migrate deploy`:
  - Resolves `DATABASE_URL` → абсолютный путь к `prod.db`
  - Копирует через `fs.copyFile` → `/var/data/snapshots/prod-{ISO-timestamp}.db`
  - Retention: keep последние 7 snapshots, остальные `unlink`
  - Если DB файла нет (первый deploy / fresh container) → silent skip, не валит deploy
  - Любая ошибка → warn + exit 0 (deploy продолжается, лучше deploy без snapshot чем no-deploy)
- **`server/package.json`**:
  - Новый script `db:snapshot` = `node dist/scripts/preDeploySnapshot.js`
  - `start:prod` обновлён: `npm run db:snapshot && npm run db:deploy && npm run db:seed:prod && node dist/index.js`
  - Snapshot бежит ПЕРЕД migrate — если migrate corrupt, snapshot уже на диске
- **`server/src/routes/admin.ts`** — `POST /api/admin/backup` переписан с `application/octet-stream` на `application/gzip`:
  - Archiver streams `.tar.gz` с тремя директориями:
    - `db/prod.db` — вся SQLite база (через `createReadStream` чтобы не грузить в RAM)
    - `uploads/` — содержимое `UPLOADS_DIR` (`archive.directory`)
    - `snapshots/` — все pre-deploy snapshots (для cross-deploy восстановления)
  - Audit logs `system.backup_download` с payload `{dbSizeBytes, includesUploads, includesSnapshots}`
  - SUPER_ADMIN only (через `requireRole(['SUPER_ADMIN'])`)

### Frontend

- **`web/src/pages/AdminAudit.tsx`** — backup tab показывает что внутри:
  - `db/prod.db` (SQLite база)
  - `uploads/` (файлы пользователей)
  - `snapshots/` (последние 7 deploy snapshots)
  - Кнопка «Скачать backup .tar.gz»

### Verification

- [x] `server tsc --noEmit` clean
- [x] `web tsc --noEmit` clean
- [x] `npm run build` OK (537.46 kB / 151.71 kB gzip, +1 kB к Sprint 30)
- [x] Local smoke snapshot script: 9 runs → 7 keep, oldest 2 deleted (retention works)
- [x] Local smoke snapshot script: missing DB → silent skip (graceful)

### Catastrophic scenarios теперь закрыты

| Scenario | До Sprint 31 | После Sprint 31 |
|---|---|---|
| Destructive Prisma migration corrupts DB | unrecoverable | можно откатить на `prod-{prev-timestamp}.db` из `/var/data/snapshots/` |
| Disk corrupt / Render incident | uploads потеряны навсегда | `.tar.gz` backup содержит uploads, snapshots, db — single off-site archive |
| Admin случайно потер шаблон через `prisma migrate dev` | unrecoverable | предыдущий snapshot живёт на disk |

### Что осталось вне scope (Sprint 32+)

- **Seed overwrite production data** — `promptTemplate.upsert` всё ещё перезаписывает name/body на каждом deploy. Reversible (admin может откатить), не катастрофично.
- **Brief versioning** — `prisma.projectBrief.upsert` стирает старые версии при regenerate. Edit history loss, но backup помогает откатить.
- **Prisma transactions** — multi-step операции не атомарные. Partial-fail возможен, но реально редко.
- **Scheduled off-site backup в S3 / Yandex Object Storage** — нужен external account + secrets, отдельный план.
- **Monitoring / alerting** — нужны external services (Sentry, UptimeRobot, Render notification webhook).

---

## Sprint 30 update — 2026-05-14 — Защита от потери данных: soft-delete, audit, backup

Theme: **Ни одно действие пользователя не должно стирать данные безвозвратно.** Sprint 29 закрыл ephemeral filesystem (data на persistent disk); Sprint 30 закрывает ещё 6 уровней риска: case-level destructive routes, отсутствие audit trail, отсутствие UI confirms, отсутствие off-site backup, отсутствие disk monitoring.

### Schema (migration `20260514140340_sprint30_soft_delete_audit`)

- `Project.archivedAt: DateTime?` — soft-delete
- `UploadedFile.archivedAt: DateTime?` — soft-delete (физический файл остаётся ещё 30 дней)
- `ArtefactReview.archivedAt: DateTime?` — soft-delete
- `SalesSession.archivedAt: DateTime?` — soft-delete
- `ConversationAnalysis.archivedAt: DateTime?` — soft-delete
- **`AuditEvent`** — НОВАЯ таблица: `id, actorId, actorEmail, actorRole, action, targetType, targetId, payload (JSON), createdAt`. Бессрочное хранение — forensic data.

### Backend

- **`server/src/lib/audit.ts`** — НОВЫЙ. Helper `recordAudit(req, { action, targetType, targetId, payload })` пишет одну строку. Failure не валит mutation (warn в console + продолжаем).
- **6 destructive routes** заменены на soft-delete + audit:
  - `DELETE /api/projects/:id` → `archivedAt = now`, audit `project.archive`
  - `DELETE /api/files/:projectId/:fileId` → `archivedAt = now`, audit `file.archive`
  - `DELETE /api/reviews/:id` → `archivedAt = now`, audit `review.archive`
  - `DELETE /api/sales-sessions/:id` → `archivedAt = now`, audit `sales_session.archive`
  - `DELETE /api/conversation-analysis/:id` → `archivedAt = now`, audit `conversation_analysis.archive`
  - Templates DELETE остался physical (system-config, не user data)
- **GET filters** исключают `archivedAt: null`:
  - `/api/projects` (list + детальный) — фильтр на проект и его files
  - `/api/files/:projectId` — только живые
  - `/api/reviews/project/:projectId` — только живые
  - `salesSessionService.listSessions` — только живые
  - `conversationAnalysisService.listAnalyses` — только живые
- **Audit logging** для admin actions:
  - `invite.create` / `invite.revoke` (раньше не логировались)
  - `user.status_change` — с before/after снапшотом
  - `user.impersonate` — с targetEmail и TTL
  - `system.backup_download` — с sizeBytes
- **Новые admin endpoints** (`server/src/routes/admin.ts`):
  - `GET /api/admin/audit?action=X&targetType=Y&actorEmail=Z&limit=N` — последние 200 events
  - `GET /api/admin/archived/:type` — soft-deleted items (project | file | review | sales_session | conversation_analysis)
  - `POST /api/admin/restore/:type/:id` — снимает `archivedAt`, логирует restore
  - `POST /api/admin/backup` (SUPER_ADMIN only) — стримит SQLite файл как `attachment`, логирует download
- **`/health` disk usage**: `fs.statfsSync(mountPath)` → `{ mountPath, freeBytes, totalBytes, usedPercent }`. Если path не существует — `disk: null`, health не валится.

### Frontend

- **`web/src/pages/AdminAudit.tsx`** — НОВЫЙ. Маршрут `/admin/audit` с тремя вкладками:
  1. **Журнал действий** — таймлайн последних 200 events с tone-цветом по action, payload preview
  2. **Архив** — sub-табы по типу (Проекты / Файлы / Ревью / Встречи / AI-разборы), кнопка «Восстановить» на каждой строке
  3. **Резервная копия** — SUPER_ADMIN видит кнопку «Скачать backup .db», ADMIN видит блок-плашку с объяснением
- **`web/src/components/layout/Sidebar.tsx`** — для SUPER_ADMIN и ADMIN добавлен пункт «Журнал и архив» (Archive icon) рядом с другими admin tools.
- **`web/src/App.tsx`** — route `/admin/audit` под `RequireRole(['SUPER_ADMIN', 'ADMIN'])`.
- **UI confirmations** на destructive file operations:
  - `ProjectUpload.removeFile` — «Убрать файл? Можно восстановить через админа в течение 30 дней»
  - `ProjectCockpit.removeFile` — то же сообщение
  - (Templates / Manager / Revoke invite / Move-to-demo уже имели confirms)

### Verification

- [x] Prisma migration сгенерирована + применена локально
- [x] Prisma client пересобран (`auditEvent` доступен)
- [x] `cd server && npx tsc --noEmit` — clean
- [x] `cd web && npx tsc --noEmit` — clean
- [x] `npm run build` — OK (536.79 kB / 151.49 kB gzip, +8 kB к Sprint 29)
- [x] Smoke (pending — после deploy): создать проект → DELETE → проверить `archivedAt`, увидеть в `/admin/audit`, восстановить через `/admin/archived/project`

### Что закрыто Sprint 30 (риск-матрица)

| Угроза | До Sprint 30 | После Sprint 30 |
|---|---|---|
| Случайный delete стирает данные навсегда | да | soft-delete с 30-дневной корзиной |
| Нет следа кто/что/когда удалил | нет audit log | `AuditEvent` с бессрочным хранением |
| Только один экземпляр БД (один disk) | да | + off-site `POST /api/admin/backup` |
| Disk заполнится молча | да, без alerting | `/health.disk` показывает usedPercent |
| Admin не может восстановить пользовательский delete | нет | `POST /api/admin/restore/:type/:id` |
| Confirm на file delete отсутствует | да | window.confirm на 2 местах |

### Что осталось вне scope (Sprint 31+)

- Scheduled hard-delete после 30 дней `archivedAt` (cleanup job)
- Nightly auto-backup в внешнее storage (S3 / Yandex Object Storage)
- 2FA для SUPER_ADMIN
- GDPR delete request flow
- Confirm modal для project delete на UI (project DELETE endpoint существует, но в UI кнопки нет — низкий риск)

---

## Sprint 29 update — 2026-05-14 — Защита пользовательских данных от затирания при деплое

Theme: **Реальные пользователи и проекты не должны исчезать после deploy.** После Sprint 28 жалоба: пропал `luquid@ya.ru`, созданный через invite. Диагностика показала, что seed.ts чист (нет ни одного `deleteMany`), но **render.yaml не имеет блока `disk:`** — Render free tier работает на ephemeral filesystem, `prod.db` пересоздаётся при каждом deploy.

### Срочная диагностика

- Проверка БД: `luquid@yandex.ru` (правильный домен — в спеке был typo `ya.ru`) **сейчас существует** на проде. createdAt=2026-05-14T12:51:44, **после** Sprint 28 deploy в 12:38:08. Сигнал — пользователь зарегистрировался заново после wipe.
- Invite `luquid@yandex.ru` тоже есть, помечен USED.
- `seed.ts` audit: `grep deleteMany` пуст. Все операции upsert. Не источник.
- `render.yaml` audit: блока `disk:` нет. Комментарий обещает «persistent disk holds the SQLite database», но реальной конфигурации не было. Это и есть root cause.

### Главное исправление — `render.yaml`

- Добавлен `disk: { name: zapusk-data, mountPath: /var/data, sizeGB: 1 }`.
- `plan` поднят с `free` → `starter` (Render free НЕ поддерживает disks).
- `DATABASE_URL` теперь `file:/var/data/prod.db`, `UPLOADS_DIR` теперь `/var/data/uploads` — данные живут на mount, переживают деплой.

⚠️ **Без upgrade Render plan'а до starter+ disk: блок игнорируется и SQLite снова становится ephemeral.** После push'а нужно в Render dashboard подтвердить переход на starter ($7/mo) и attach диска. До этого момента — каждый deploy всё ещё wipe-ит data.

### Defense in depth — seed.ts

- Новый `server/src/seedGuards.ts` — выделенный модуль для guards:
  - `IS_PRODUCTION`, `LOG_PREFIX`, `seedLog()` — единый логгер с маркером `[seed:prod]` на проде / `[seed]` локально.
  - **`assertNotProduction(operation: string)`** — кидает Error, если `NODE_ENV=production`. Любой будущий код, который собирается делать `deleteMany`, обязан позвать guard первым. Сейчас в `seed.ts` нет ни одного destructive op, но guard защитит от регрессии.
- `seed.ts` обновлён:
  - Все `console.log('[seed] ...')` заменены на `log(...)` через единый logger
  - На production добавлены явные сообщения: `safe mode enabled — only upsert/update operations allowed` + `no destructive operations on real user data (User, Project, InviteToken, files, briefs, prompts, jobs, sessions, reviews)`
- `seedDemoArchetype()` теперь отказывается обновлять project с тем же name, если у него `isDemo=false` (защита от случайного override реального клиентского проекта).

### Two-mode seed

- **`npm run db:seed:prod`** (без изменений в команде, но теперь safe) — компилируется в `dist/seed.js`, чисто upsert.
- **`npm run db:seed:dev-reset`** — НОВЫЙ. Запускает `tsx src/scripts/devReset.ts`, который:
  1. Сразу зовёт `assertNotProduction('db:seed:dev-reset wipe')`
  2. На `NODE_ENV=production` падает с `Refusing destructive seed operation "db:seed:dev-reset wipe" in production`
  3. Локально — стирает все таблицы в правильном порядке (зависимые первыми)
- Старый `npm run db:reset` (`prisma migrate reset --force`) тоже на месте, но prisma сама блокирует его в production.

### Admin /users filter UI

`web/src/pages/AdminDashboard.tsx` `UsersTable` получил фильтры: **Все / Активные / Демо / Ожидают оплаты / Архивные / Инвайты без регистрации**. Счётчики per-filter справа от лейбла. Фильтр `pending_invites` показывает баннер «инвайты живут в разделе Приглашения». Это устраняет визуальное «исчезновение» инвайт-юзеров — даже если они отфильтрованы по workspaceStatus, фильтр явно показан.

### Production safety test (smoke)

Локальный прогон на чистой DB:
1. Создан inviter (ADMIN) + invite + safety-test user (FOUNDER, active) + project (isDemo=false)
2. Выполнен `NODE_ENV=production node dist/seed.js`
3. Прогон логов:
   ```
   [seed:prod] starting seed run
   [seed:prod] safe mode enabled — only upsert/update operations allowed
   [seed:prod] no destructive operations on real user data
   ```
4. После seed: `User EXISTS`, `Invite EXISTS (used=false, revoked=false)`, `Project EXISTS (isDemo=false, userId=...)`. **PASS — production seed не тронул реальные данные.**

Также прогнан `db:seed:dev-reset` под `NODE_ENV=production` — упал на assertNotProduction до того, как открыть БД. **PASS — destructive reset заблокирован в проде.**

### Как теперь защищены реальные пользователи

1. **Hardware-level**: persistent disk (после upgrade plan'а) — SQLite на mountPath, переживает container restart
2. **Code-level**: production seed чисто-upsert по дизайну. Audit подтверждает 0 destructive ops
3. **Guard-level**: `assertNotProduction()` помечает любую будущую destructive операцию как боевую — упадёт на проде громко
4. **UI-level**: admin filters показывают всех пользователей и инвайты — никто визуально не «пропадает»
5. **Demo isolation**: `seedDemoArchetype()` отказывается обновлять non-demo project с тем же именем

### Что осталось / next steps

1. **САМОЕ ВАЖНОЕ**: команда должна в Render dashboard:
   - Apply Blueprint (или нажать «Sync» на сервисе)
   - Подтвердить переход с Free на Starter plan ($7/mo)
   - Подтвердить attach `zapusk-data` disk (1 GB)
   - Без этого render.yaml `disk:` блок просто игнорируется
2. После активации disk'а — переcоздать invite для `luquid@yandex.ru` через `POST /api/admin/invites` (предыдущий уже USED). Пользователь получит ссылку и зарегистрируется заново.
3. Текущий ephemeral DB будет wiped ОДИН РАЗ при переходе на disk (новый mount, пустой). После этого данные сохраняются.

### Verification

- [x] `cd server && npx tsc --noEmit` — clean
- [x] `cd web && npx tsc --noEmit` — clean
- [x] `npm run build` — OK (528.31 kB / 148.96 kB gzip, +1 kB к Sprint 28)
- [x] Production safety test PASS (создан real user → seed:prod → user сохранился)
- [x] `db:seed:dev-reset` под NODE_ENV=production падает с явной ошибкой ✓

---

## Sprint 28 update — 2026-05-14 — Динамический путь проекта в Project Cockpit

Theme: **Путь проекта считается из реальных данных, а не из hardcoded «done/in_progress».** До Sprint 28 `buildInvestmentJourney()` (Sprint 21) уже выводил статусы пунктов из brief/files/jobs, но имел два дефекта: (1) `legal_structure` всегда дефолтился в `'в_работе'` независимо от того, выбран ли трек и готова ли упаковка — отсюда «юридическая упаковка в работе» на пустом проекте; (2) не было stage-level gating — этапы 2..6 никогда не помечались `заблокировано`. Sprint 28 закрыл оба.

### Изменения

**`web/src/lib/investmentTrack.ts`** — переписан:
- Reorder этапов под Sprint 28 spec: `brief → packaging → legal → ai_leads → meetings → placement` (6 этапов, было 5 с другими группировками).
- `Stage` получил поля `status: ItemStatus`, `unlocked: boolean`, `lockHint?: string`, `primaryCta?: { label }`. Stage-level статус вычисляется из items + gating-правил.
- **Gating-правила** (Sprint 28):
  - `packaging` → locked, если brief не done
  - `legal` → locked, если packaging не done
  - `ai_leads` → locked, если packaging не done
  - `meetings` → locked, если нет лидов
  - `placement` → locked, если legal не done или нет встреч
- При locked stage все его items получают `статус: 'заблокировано'` (через `lockStage()` helper).
- Из `legal_structure` убран default `'в_работе'` — теперь `'не_начато'` (плюс gating переведёт в `'заблокировано'`).
- `JourneyOptions { meetingsCount, leadsLaunched }` — внешние сигналы из API, передаются в builder.
- `TrackBuild.isBrandNew: boolean` — true, если нет brief / files / jobs. UI рендерит empty-hero.
- `primaryCtaFor(stage, ctx)` — короткий CTA-лейбл по spec: «Заполнить бриф / Продолжить бриф / Открыть бриф / Сформировать упаковку / Посмотреть материалы / Выбрать формат / Подготовить юр. структуру / Запустить AI-лиды / Посмотреть лиды / Провести встречу / Разобрать переговоры / Подготовить размещение / Открыть размещение».

**`web/src/components/project/InvestmentJourney.tsx`**:
- StageCard теперь рендерит `<StatusBadge>` для stage.status в шапке (Готово / В работе / Заблокировано / …).
- Для locked stages — компактный rendered «Откроется после X» + preview списком первых 3 items, без раскрытия.
- Stage CTA hint рендерится снизу карточки при `stage.primaryCta`.
- Stage icons расширены под 6 этапов: Sparkles / Megaphone / Briefcase / Radio / UserRound / ClipboardCheck.
- Закрытые stages получают `opacity-80` + `Lock` иконку.
- Сайдбар-блоки переименованы: «Что нужно от вас» / «Что сейчас делает команда ZAPUSK AI» (по Sprint 28 spec).
- **`BrandNewHero`** — карточка для `build.isBrandNew === true`: «Путь привлечения инвестиций только начинается / Первый шаг — заполнить бриф проекта».

**`web/src/pages/ProjectCockpit.tsx`**:
- `<InvestmentJourney>` перенесён **выше**, сразу после HERO (Sprint 28 spec: name → readiness → journey → команда → материалы).
- `load()` дёргает `listMeetings({projectId})` + `/api/ai-leads?projectId=X` параллельно и передаёт `meetingsCount` + `leadsLaunched` в Journey builder.
- Дубликат журнала ниже удалён.

### Как теперь считаются статусы

| Этап | Готово, если | В работе / На проверке, если | Заблокировано, если |
|---|---|---|---|
| Бриф | brief существует И нет critical missing | brief есть, но есть открытые вопросы | — никогда |
| Маркетинговая упаковка | все 6 материалов succeeded+completedBy | хотя бы один job в awaiting_manager / running | brief не готов |
| Юридическая упаковка | все items закрыты (manager flag) | track выбран И packaging готова | packaging не готова |
| AI-лиды | mode='live' на /api/ai-leads | leadsLaunched=true | packaging не готова |
| Встречи | meetingsCount > 0 + все sales prep done | хотя бы одна встреча есть | нет лидов |
| Размещение | вручную закрыто менеджером | в подготовке | legal не готова ИЛИ нет встреч |

### Используемые данные

- `Project` (industry / stage / raiseAmount / minCheck → hasBasicProjectData)
- `Project.brief` (existence → hasBrief, `missingData` + `missingByCategory` → hasBriefMissing, `interviewAnswers.length>4` → hasInterview)
- `PackagingJob[]` (status + outputType + completedBy → item status per template)
- `SalesSession[]` через `listMeetings({projectId})` → meetingsCount
- `/api/ai-leads?projectId=X` (Sprint 27 `mode`) → leadsLaunched

### Как выглядит новый проект

1. HERO: название + 0% готовности
2. **InvestmentJourney**: `isBrandNew=true` → BrandNewHero «Путь только начинается / Заполнить бриф»
3. Stage Brief: статус «Ожидаем данные», CTA «Заполнить бриф»
4. Stage Packaging / Legal / AI-leads / Meetings / Placement: **Заблокировано** с lockHint
5. ActivityHistory: empty state «История появится после первых действий»
6. PersonalManagerMiniCard, RecentMeetings (empty), AIPackagingHistory (empty)

### Как выглядит demo проект

Demo cabinet (`/demo`) **не использует** `buildInvestmentJourney` — он рендерит `DEFAULT_PROJECT_JOURNEY` из старого `lib/projectJourney.ts`. Эта структура осталась только для demo showcase. Production проект больше не имеет к ней отношения.

### Verification

- [x] `cd server && npx tsc --noEmit` — clean
- [x] `cd web && npx tsc --noEmit` — clean
- [x] `npm run build` — OK (527.02 kB / 148.56 kB gzip, +6 kB к Sprint 27)
- [x] Smoke сценариев:
  - Новый проект без brief: brief=Ожидаем данные, packaging+ = Заблокировано ✓
  - Загружен файл, brief нет: brief=Ожидаем данные, items.project_data=Готово если базовые поля заполнены ✓
  - Бриф сгенерирован с missingData: brief=В работе, packaging стадия unlocked, items=Не начато ✓
  - Packaging job awaiting_manager: соответствующий item=На проверке, остальные packaging items=Не начато ✓
  - Demo project: использует старый DEFAULT_PROJECT_JOURNEY, не затронут изменением ✓

---

## Sprint 27 update — 2026-05-14 — Убрали фейковые completed-state из боевого кабинета

Theme: **Production кабинет больше не врёт.** До Sprint 27 active workspace всё ещё показывал mock-данные: `/api/ai-leads` возвращал 6 mock-лидов + KPI `43 звонка / 128 сообщений / 7 активных лидов` всем подряд, Dashboard писал «12 квалифицированных лидов в demo-feed», PersonalManagerCard рассказывал, что «менеджер сегодня в 11:24 проверила материалы и оставила 3 правки». Это всё работало в Sprint 25/26 и было заметно после рестарта на пустом active кабинете. Sprint 27 удаляет это на уровне backend + frontend: mock-данные легитимны ТОЛЬКО для demo workspace и явных `/demo/*` витрин.

### Backend

- **`server/src/services/aiLeadsService.ts`**:
  - Новый тип `AILeadsMode = 'empty' | 'live' | 'demo'`. `AILeadsDashboard` теперь несёт `mode` явно.
  - `LeadProvider.getDashboard(project, options?)` — `options.demoMode` контролирует, выдавать ли mock-лиды.
  - `MockAILeadsProvider`: для `demoMode=true` — старое поведение (mockLeads + KPI 43/128/7). Для `demoMode=false` — `leads=[]`, `kpis={totalLeads:0, activeToday:0, avgCheck:'—', callsToday:0, messagesSent:0}`, onboarding адаптирован: «AI-лиды откроются после готовности упаковки и согласования с менеджером».
- **`server/src/routes/aiLeads.ts`** — `demoMode = req.query.demo === '1' || user.workspaceStatus === 'demo'`. Active кабинет → empty. Demo workspace → mock. `/demo/*` фронт может явно дёрнуть `?demo=1`.

### Frontend

- **`web/src/pages/AILeads.tsx`**:
  - `AILeadsDashboard` интерфейс получил `mode: AILeadsMode`.
  - Для `mode='empty'`: вместо `<KpiGrid /> + <LiveFeed />` рендерим `<EmptyLeadsState />` — нейтральная карточка «AI-лиды появятся после запуска проекта», три CTA (бриф / демо / связаться с менеджером), список «что появится после запуска» с пометкой «ожидаем данные».
  - Sidebar «AI работает сейчас · Демо-режим live pipeline» (43 звонка / 128 сообщений) показываем только при `mode='demo'`. Для empty — `<Card>«Что произойдёт после запуска»</Card>` с серыми pending-строками.
- **`web/src/pages/Dashboard.tsx`** — AI-leads CTA card: убрана плашка «12 квалифицированных лидов в demo-feed». Вместо `<div className="text-3xl">12</div>` теперь нейтральный текст «AI-каналы запускаются после готовности упаковки. Откройте раздел, чтобы увидеть статус».
- **`web/src/components/ui/PersonalManagerCard.tsx`**:
  - Из `PERSONAL_MANAGER` убраны поля `lastAction / lastActionAt / nextStep / nextStepDue`. Эти данные были фикцией, без backend activity feed.
  - Новый тип `PersonalManagerActivity` + экспорт `DEMO_MANAGER_ACTIVITY` (для demo cabinet, когда понадобится).
  - `PersonalManagerCard` принимает опциональный `activity?: PersonalManagerActivity | null`. Если не передан — блок «Последнее действие / Следующий шаг» **не рендерится**. До Sprint 27 он рендерился всегда с одинаковым фейк-текстом.
  - Callers (`PersonalManager.tsx`, `ManagerDashboard.tsx`) не передают activity → блок скрыт. Demo cabinet использует `PersonalManagerMiniCard` (тот вариант никогда не показывал activity, не трогали).

### Что осталось работать как раньше

| Маршрут | Workspace | Источник данных | Поведение |
|---|---|---|---|
| `/ai-leads` | active | `/api/ai-leads` → mode='empty' | Пустое состояние, нет fake KPI |
| `/ai-leads` | demo | `/api/ai-leads` → mode='demo' | Mock-лиды + live pipeline sidebar (Главснаб) |
| `/demo/ai-leads` | любая | хардкод showcase (Sprint 26) | Витрина без API, читается как пример |
| `/personal-manager` | любая | хардкод profile | Контакты + SLA, без fake activity feed |

### Verification

- [x] `cd server && npx tsc --noEmit` — clean
- [x] `cd web && npx tsc --noEmit` — clean
- [x] `npm run build` — OK (521.28 kB / 146.69 kB gzip, +3 kB к Sprint 26)
- [x] `/api/ai-leads` smoke (через curl):
  - workspaceStatus=active → `mode: "empty"`, `leads: []`, `kpis.callsToday: 0`
  - workspaceStatus=demo → `mode: "demo"`, `leads: [6 mocks]`, `kpis.callsToday: 43`
  - `?demo=1` flag override → mode demo даже для active workspace (для /demo/* витрин)

### Что осталось (out of scope Sprint 27)

- Реальная persistent модель `AILead` в БД, чтобы `mode='live'` стал чем-то реальным (сейчас mode='live' зарезервирован, но MockAILeadsProvider его не возвращает)
- Реальный activity feed менеджера (последние действия / следующие шаги) — пока показываем только контакты
- Подключить `DEMO_MANAGER_ACTIVITY` к `<PersonalManagerCard />` в `DemoCabinet.tsx`, если захотим показать demo-активность менеджера в demo-кабинете (сейчас DemoCabinet использует MiniCard без activity)

---

## Sprint 26 update — 2026-05-14 — Разделение боевого кабинета и demo showcase

Theme: **Активный клиент должен видеть пустой production-кабинет, а не fake completed state.** До спринта новый payed клиент попадал на Dashboard и видел готовые AI-лиды, fake progress journey (done/done/in_progress) и demo-блок Главснаб — впечатление «всё уже сделано без меня». Sprint 26 разносит три состояния явно: **BOOTSTRAP** (active + 0 проектов) → приветствие + CTA, **ACTIVE** (active + есть проекты) → реальный список + инструменты, **DEMO** (workspaceStatus=demo) → showcase Главснаб.

### Frontend

- **`web/src/lib/projectJourney.ts`** — добавлен `BOOTSTRAP_PROJECT_JOURNEY` (5 этапов под Sprint 26 спек: brief → marketing → legal → ai-leads → meetings). Первый этап `in_progress`, остальные `locked` с CTA «Откроется после X». `JourneyOwner` расширен до `'AI'`.
- **`web/src/components/ui/BootstrapWelcome.tsx`** — НОВЫЙ. Hero «Добро пожаловать в ZAPUSK AI / Начните подготовку проекта», большая CTA «Создать проект» + secondary «Посмотреть демо», 3-step «С чего начать», 5-stage journey. Без AEO-баннеров, без fake AI-leads CTA.
- **`web/src/pages/Dashboard.tsx`** — early return на `<BootstrapWelcome />` если `workspaceStatus==='active' && role==='FOUNDER' && visibleProjects.length===0`. Убран fake `<ProjectJourney stages={DEFAULT_PROJECT_JOURNEY.slice(0,5)} />` из active-with-projects ветки (это project-specific, живёт на cockpit'е).
- **`web/src/components/layout/Sidebar.tsx`** — NAV перестроен на секции (`NavSection[]`). Для FOUNDER три секции: **Рабочий кабинет** (Рабочий стол / Новый проект / Мои проекты), **Инструменты** (AI-лиды / AI-разбор / AI-ассистент / Встречи / Ваш менеджер), **Демо ZAPUSK AI** (Демо-кабинет / Демо AI-лиды / Демо AI-переговоры). В demo-режиме «Новый проект» + «Мои проекты» скрываются. SUPER_ADMIN / ADMIN / MANAGER / INVESTOR — без разбиения на секции (one flat list).
- **`web/src/pages/ProjectsList.tsx`** — НОВЫЙ. Чистый список проектов клиента без Stat-карточек и promo-баннеров. Empty state «Создать проект».
- **`web/src/pages/DemoAILeads.tsx`** — НОВЫЙ. Showcase Главснаб: 1 HOT-лид с AI-звонком, channel-feed (Telegram/WhatsApp/Follow-up), live pipeline sidebar, гарантия замены, CTA «Перейти в AI-лиды». Хардкод showcase-данных, никаких `/api/ai-leads`.
- **`web/src/pages/DemoConversationAnalysis.tsx`** — НОВЫЙ. Showcase разбора реального звонка: score 87, 7 findings, 4 рекомендации, эмоциональный контекст. CTA «Разобрать свой звонок» → `/conversation-analysis`.
- **`web/src/App.tsx`** — 3 новых route: `/projects` (ProjectsList), `/demo/ai-leads` (DemoAILeads), `/demo/conversations` (DemoConversationAnalysis). Все под `RequireAuth`.

### Поведение

| Состояние | URL | Что видит клиент |
|---|---|---|
| Active + 0 проектов | `/dashboard` | BootstrapWelcome: «Добро пожаловать», CTA «Создать проект», 5 stages (briefing в работе, остальные locked) |
| Active + есть проекты | `/dashboard` | KPI / AEO-баннер / список проектов / AI-лиды CTA / демо-кабинет линк / менеджер mini |
| Demo workspace | `/dashboard` | Demo-баннер, demo-проекты, без «Новый проект» CTA (Sprint 24) |
| Любая роль | `/demo` `/demo/ai-leads` `/demo/conversations` | Showcase-кейс Главснаб как пример работы платформы |

### Verification

- [x] `cd server && npx tsc --noEmit` — clean
- [x] `cd web && npx tsc --noEmit` — clean
- [x] `npm run build` — OK (518.46 kB / 146.12 kB gzip, +22 kB к Sprint 25 за 3 новых страницы + bootstrap component)
- [x] Routes smoke: `/projects`, `/demo/ai-leads`, `/demo/conversations` отдают SPA 200, не падают

### Что осталось (out of scope для Sprint 26)

- Реальная AI-lead data на `/ai-leads` для active+0-leads workspace (сейчас backend возвращает demo dashboard как fallback — нужно вернуть пустое состояние с «AI-лиды появятся после запуска проекта»)
- ProjectJourney на cockpit'е каждого проекта — поменять «done/done/in_progress» на динамическое состояние от brief/packaging/legal статуса
- Audit log для impersonate (carry-over из Sprint 25)
- 2FA для SUPER_ADMIN (carry-over из Sprint 25)

---

## Sprint 25 update — 2026-05-14 — Bootstrap аккаунты и нормальная RBAC

Theme: **Платформа перестаёт быть «демо с костылями» и становится полноценной B2B investment OS.** Нормальная ролевая система (SUPER_ADMIN / ADMIN / MANAGER / FOUNDER / INVESTOR), bootstrap accounts из env, impersonation для admin'ов, demo isolation сохраняется.

### Schema (migration `role_rbac_upgrade`)

- `User.role` теперь имеет 5 фиксированных значений: `SUPER_ADMIN` / `ADMIN` / `MANAGER` / `FOUNDER` / `INVESTOR`. SQLite не поддерживает enum'ы — храним String, валидация в zod-схемах и `normalizeRole()`.
- Migration mapping: `admin → ADMIN`, `client → FOUNDER`, `manager → MANAGER`, `sales → MANAGER`, `demo / viewer / прочее → FOUNDER`.
- Default для новых users: `FOUNDER` (раньше был 'client').

### Bootstrap accounts (env-driven через seed)

| Email | Role | Workspace | Env var |
|---|---|---|---|
| `grigory@zapusk.tech` | SUPER_ADMIN | active | `BOOTSTRAP_OWNER_PASSWORD` |
| `admin@zapusk.tech` | ADMIN | active | `BOOTSTRAP_ADMIN_PASSWORD` |
| `manager@zapusk.tech` | MANAGER | active | `BOOTSTRAP_MANAGER_PASSWORD` |
| `demo-founder@zapusk.tech` | FOUNDER | demo | `BOOTSTRAP_DEMO_PASSWORD` |
| `demo-investor@zapusk.tech` | INVESTOR | demo | `BOOTSTRAP_DEMO_PASSWORD` |

Email'ы override'ятся через `BOOTSTRAP_*_EMAIL` env vars (white-label поддержка). Если env пустая → seed создаёт disabled account (без passwordHash) + warn в console. Никаких паролей в репозитории.

### Backend

- **`server/src/env.ts`** — `BOOTSTRAP_OWNER_PASSWORD / ADMIN / MANAGER / DEMO` + 5 `BOOTSTRAP_*_EMAIL` переменных. + `JWT_SECRET`.
- **`server/src/seed.ts`** — `upsertBootstrap()` helper. Идемпотентно создаёт/обновляет 5 bootstrap-аккаунтов на каждом запуске seed. Меняет роль + workspaceStatus + password (если пароль из env установлен).
- **`server/src/auth.ts`**:
  - `UserRole` type union → 5 значений
  - `normalizeRole()` — мапит legacy 'admin'/'client'/'manager' → новые UPPER_CASE значения
  - `requireRole()` — принимает any string, нормализует, SUPER_ADMIN автоматически проходит везде где ADMIN
  - `requireSuperAdmin()` — explicit guard для super-only ops
  - `authMiddleware` пробрасывает `impersonatedBy` из JWT в `req.impersonatedBy`
- **`server/src/authCrypto.ts`** — `TokenPayload.impersonatedBy?: { sub, email, role }` + `generateInviteToken()`. Impersonation token имеет TTL 1 час (вместо обычных 7 дней).
- **`server/src/routes/auth.ts`**:
  - `/signup` создаёт user с role из invite (через `normalizeRole`)
  - `/demo` принимает любые role-строки и нормализует (back-compat для legacy скриптов)
  - `/me` возвращает `impersonatedBy` если есть
- **`server/src/routes/admin.ts`**:
  - `POST /api/admin/impersonate/:userId` — SUPER_ADMIN или ADMIN. ADMIN не может impersonate SUPER_ADMIN. Не impersonate себя. Возвращает Bearer с impersonatedBy claim.
  - `PATCH /api/admin/users/:id/status` — ADMIN не может менять SUPER_ADMIN. SUPER_ADMIN только super может выдавать.

### Frontend

- **`web/src/lib/auth.ts`** — `UserRole` type union обновлён до 5 значений, `normalizeRole()` мапит legacy localStorage записи в новые, `roleLabel()` русифицирован («Владелец платформы / Админ / Менеджер / Фаундер / Инвестор»), `defaultRouteForRole()` — INVESTOR → `/opportunities`. `AuthState.impersonatedBy` сохраняется в localStorage.
- **`web/src/pages/Login.tsx`** — переписан, убран demo-блок полностью (Sprint 23 скрывал под `?demo=1`, теперь нет). Только email/password.
- **`web/src/components/layout/Sidebar.tsx`** — NAV под 5 ролей:
  - **SUPER_ADMIN**: Admin / Invites / Users / All projects / Templates / Leads / Materials / AI-разбор / Meetings / **System settings**
  - **ADMIN**: то же без System settings
  - **MANAGER**: Manager dashboard / Projects / Leads / AI-разбор / Meetings / Calendar / Tasks / Clients
  - **FOUNDER**: Dashboard / New project / Demo / AI leads / AI assistant / AI-разбор / Meetings / Personal manager
  - **INVESTOR**: Opportunities / Portfolio / Secondary / Profile
- **`web/src/components/layout/ImpersonationBanner.tsx`** — НОВЫЙ. Красная плашка сверху для impersonation сессий. Показывает «Вы вошли как X · Реальный оператор: Y · Сессия действует 1 час». Кнопка «Вернуться в свой аккаунт» → `clearAuth()` + редирект на `/login`.
- **`web/src/components/layout/AppLayout.tsx`** — `<ImpersonationBanner />` + `<WorkspaceBanner />` сверху main контента.
- **`web/src/pages/InvestorPortfolio.tsx`** — НОВЫЙ stub-компонент. 4 маршрута (`/opportunities`, `/portfolio`, `/secondary`, `/profile`) рендерят одну страницу с EmptyState «Раздел в подготовке · Связаться с менеджером». Реальный investor UX — отдельный sprint.
- **`web/src/App.tsx`** — investor routes добавлены, все role guards переведены на новые имена (`'admin'` → `['SUPER_ADMIN', 'ADMIN']`, etc).
- **`web/src/pages/AdminDashboard.tsx`**:
  - UsersTable получила колонку «Действия» с кнопкой **«Войти как»** (impersonate). SUPER_ADMIN видит всех, ADMIN — кроме SUPER_ADMIN. Не показывает кнопку для самого себя.
  - InvitesPanel ROLE_OPTIONS обновлены на 4 роли (SUPER_ADMIN скрыт — owner-аккаунты только через bootstrap).
- **`web/src/components/layout/Topbar.tsx`** + 3 страницы (`ConversationAnalysis`, `SalesAssistant`, `Dashboard`, `AILeads`) — все сравнения `role === 'admin'` / `'manager'` / `'client'` переведены на новые `SUPER_ADMIN` / `ADMIN` / `MANAGER` / `FOUNDER`.

### Verification

- [x] Migration `role_rbac_upgrade` применена + value-mapping UPDATE-ы (admin→ADMIN, client→FOUNDER, manager→MANAGER, etc)
- [x] Seed создал 5 bootstrap accounts (с проверкой паролей из env)
- [x] Local end-to-end smoke (8/8 сценариев):
  - SUPER_ADMIN, ADMIN, MANAGER, FOUNDER, INVESTOR — все логинятся email+password
  - Demo founder видит 3 demo проекта (Sprint 24)
  - SUPER_ADMIN impersonate → FOUNDER, получает Bearer с impersonatedBy claim
  - /me возвращает workspaceStatus + impersonatedBy
  - /api/projects под impersonation видит demo проекты (правильно для FOUNDER+demo)
  - ADMIN пытается impersonate SUPER_ADMIN → 403 cannot_impersonate_super_admin
- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — OK (496.18 kB / 141.26 kB gzip, +6 kB к Sprint 24)

### Production rollout

После redeploy commit'а:
1. `prisma migrate deploy` применяет migration → существующие prod users получают `role = 'ADMIN' / 'FOUNDER' / 'MANAGER'` автоматически (legacy 'admin'/'client'/'manager' → новые UPPER_CASE)
2. `db:seed:prod` — создаёт 5 bootstrap accounts. Без env пароли → disabled (warn в логах)
3. Команда добавляет в Render Environment: `BOOTSTRAP_OWNER_PASSWORD`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_MANAGER_PASSWORD`, `BOOTSTRAP_DEMO_PASSWORD`
4. После save → Render redeploy → seed повторно запускается → пароли хешируются и сохраняются в БД
5. Логин: `grigory@zapusk.tech` + пароль из BOOTSTRAP_OWNER_PASSWORD

### Что осталось

- **Полный INVESTOR UX**: реальные страницы /opportunities, /portfolio, /secondary с реальными данными (Sprint 26?)
- **Audit log для impersonate**: persisted история «admin X зашёл как user Y»
- **System settings page** для SUPER_ADMIN (currently route exists, но контента нет)
- **2FA для SUPER_ADMIN**: критично для real production tenant

---

## Sprint 24 update — 2026-05-14 — Демо-режим vs боевой кабинет

Theme: **Разделили demo-витрину и реальный production-кабинет на уровне данных.** До спринта demo user = readonly доступ к платформе с пустым набором проектов. Теперь demo user видит глобальные показательные кейсы (Венский ветер / Luce Silva / Планета 60) как «демо-витрину»; после активации (`workspaceStatus → active`) демо-проекты исчезают, появляется пустой production-кабинет под реальные проекты клиента.

### Schema (migration `project_is_demo`)

- `Project.isDemo Boolean @default(false)` — глобальные демо-витрины. Видны только пользователям с `workspaceStatus='demo'`.
- Seed: 3 проекта (Венский ветер, Luce Silva, Планета 60) помечены `isDemo=true`.

### Backend

- **`server/src/routes/projects.ts`** — `/api/projects` GET и `/api/projects/:id` GET теперь фильтруют:
  - **demo workspace** → `where: { isDemo: true }` (3 показательных кейса)
  - **active workspace** → `where: { userId, isDemo: false }` (свои реальные проекты)
  - **admin** → `{}` (видит всё для аудита)
- **`server/src/auth.ts`** — `getUser()` теперь возвращает `workspaceStatus` (нужно фильтру).
- Write-методы остаются заблокированными для demo через `requireActiveWorkspace` middleware (Sprint 22).

### Frontend

- **`web/src/pages/Dashboard.tsx`** — Dashboard теперь полностью адаптирован под `isDemoMode`:
  - Title: «Демо-кабинет ZAPUSK AI» (вместо «Рабочий стол»)
  - Header CTA: «Получить рабочий доступ» (mailto) вместо «Новый проект»
  - Новый Sprint 24 demo-баннер с объяснением «Это глобальные демо-кейсы. После подключения откроется ваш рабочий кабинет — пустой, под ваши проекты, с активной упаковкой, AI-лидами и сопровождением сделки»
  - Старый AEO баннер (Sprint 20) скрыт в demo-режиме
  - KPI labels: «Демо-проектов» вместо «Проектов всего»
  - «Проекты» heading → «Демо-проекты»; subtitle: «Откройте проект, чтобы посмотреть путь привлечения изнутри»
  - EmptyState (если 0 проектов в demo) → «Демо-кейсы готовятся. Свяжитесь с менеджером для активации рабочего кабинета»
- **`web/src/components/layout/Sidebar.tsx`** — в demo-режиме пункт «Новый проект» скрыт из навигации.
- **`web/src/pages/AdminDashboard.tsx`** — UsersTable полностью переписан:
  - Колонки: Пользователь / Email / Роль / **Режим кабинета** (badge с tone по статусу) / Проектов / Создан / Действия
  - Кнопка **«Активировать кабинет»** — переключает workspaceStatus → active одним кликом. После refresh демо-проекты у клиента исчезают, появляется production-кабинет.
  - Кнопка «В демо» для перевода active → demo с подтверждением
  - `STATUS_RU` и `STATUS_TONE_ADMIN` мапы для рендера workspace state в RU labels

### Verification

- [x] Migration `project_is_demo` applied
- [x] Seed помечает 3 демо-проекта `isDemo=true`
- [x] Local end-to-end smoke (6/6 сценариев):
  - Demo user видит 3 demo проекта (с isDemo=true)
  - Active user видит 0 проектов (пустой свой кабинет)
  - Demo user POST /api/projects → 403 workspace_readonly
  - Admin PATCH /api/admin/users/:id/status → workspaceStatus=active
  - После switch: demo проекты исчезают, появляется пустой production-кабинет
  - Создание проекта после switch → succeed, isDemo=false автоматически
- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — OK (490.19 kB / 138.10 kB gzip, +4 kB к Sprint 23)

### Ключевая разница до/после Sprint 24

| Аспект | До | После |
|---|---|---|
| Demo user видит | Свой пустой кабинет | 3 demo-кейса (Венский ветер / Luce Silva / Планета 60) |
| Title для demo | «Рабочий стол» | «Демо-кабинет ZAPUSK AI» |
| Header CTA demo | «Новый проект» | «Получить рабочий доступ» (mailto) |
| Active user данные | Пересечение с demo | Изолированы (свои проекты + isDemo=false) |
| Admin activate | Только через invite | Один клик «Активировать кабинет» в UsersTable |

### Что НЕ изменилось

- Backend write-блок через `requireActiveWorkspace` (Sprint 22) остался прежним
- WorkspaceBanner (Sprint 22) продолжает показывать «Демо-режим» сверху страниц
- Invite-only signup (Sprint 22 + 23) — без изменений

---

## Sprint 23 update — 2026-05-14 — Access UX cleanup поверх Sprint 22

Theme: **Финальная полировка invite-only access UX.** До спринта `/login` показывал demo-кнопки всем посетителям и предлагал «Создать аккаунт» — что противоречит invite-only архитектуре. Также `/signup` без invite-параметра был «apply page», но тексты не совсем правильно говорили о демо-флоу.

### Что изменилось

- **`/login`** — служебный вход:
  - Заголовок: «Вход в ZAPUSK AI» / подзаголовок «Для клиентов, менеджеров и команды платформы»
  - Удалён компонент `<SocialButtons />` — сервисный вход, без social mock-кнопок
  - Ссылка «Создать аккаунт» → заменена на «Запросить демо» с переходом на `/signup` (ApplyForAccessPage)
  - **Demo-доступ для команды** (3 кнопки client/manager/admin) скрыт по умолчанию. Показывается только при `/login?demo=1` — служебный URL для команды и презентаций. Внешний посетитель этих кнопок не видит.
- **`/signup`** без `?invite=...` — ApplyForAccessPage с новыми текстами:
  - Заголовок: «Доступ к ZAPUSK AI выдаётся после демо»
  - Subtitle: «Оставьте заявку, мы покажем демо-кабинет, обсудим формат подключения и после одобрения отправим приглашение в платформу.»
  - Primary CTA: «Запросить демо-доступ» → mailto с pre-filled subject/body
  - Secondary CTA: «Войти по приглашению» → /login
  - 3-step explainer: «Заявка на демо → Демо + знакомство → Приглашение в платформу»
- **`/signup?invite=token`** работает как раньше (форма создания аккаунта по приглашению — Sprint 22)
- **Error mapping**: «Этот email уже зарегистрирован» → «Этот email уже подключён к платформе. Войдите по приглашению.»

### UX-словарь Sprint 23

В пользовательских CTA убраны: «зарегистрируйтесь», «создать аккаунт», «бесплатно», «начать пользоваться».
Используются: «запросить демо», «получить приглашение», «войти по приглашению», «подключить проект».

### Что НЕ изменилось

- Backend остался идентичным Sprint 22 — `POST /api/auth/signup` всё ещё требует `inviteToken`. Никаких новых API.
- `/api/auth/demo` endpoint работает для `/login?demo=1` — это служебный путь, не публичный.
- Тексты «Создайте аккаунт по приглашению» в invite-aware форме `/signup?invite=token` сохранены — это корректное действие для пользователя с invite'ом.
- WorkspaceBanner / admin invites UI / role-gating — без изменений.

### Verification

- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — OK (485.97 kB / 136.99 kB gzip, новый hash `index-CSbQ7L4C.js`)
- [ ] Production verify (после redeploy):
  - `/login` без параметров — нет demo-кнопок, есть только email/password + «Запросить демо» ссылка
  - `/login?demo=1` — demo-блок появляется внизу
  - `/signup` без invite — apply page с «Запросить демо-доступ» CTA (mailto)
  - `/signup?invite=valid_token` — форма создания аккаунта работает (Sprint 22 функционал)
  - `POST /api/auth/signup` без inviteToken → 400 (backend Sprint 22)

---

## Sprint 22 update — 2026-05-14 — Invite-only архитектура доступа

Theme: **Превратили open AI tool в private B2B investment-infrastructure platform.** До спринта любой мог зарегистрироваться через `/signup` — это противоречило позиционированию (платная, B2B, investment-инфраструктура). Теперь доступ выдаётся только через invite (admin создаёт ссылку → клиент активирует аккаунт). Workspace проходит воронку: lead → demo → approved → awaiting_payment → active. Demo / approved / awaiting_payment работают в readonly режиме.

Priorities делегированы: 1) disable public signup ✅, 2) invite system ✅, 3) workspace states ✅, 4) access middleware ✅, 5) demo readonly ✅, 7) admin invites UI ✅. Отложены: 6) billing integration (отдельный sprint).

### Schema (migration `invite_only_access`)

- `User.workspaceStatus String @default("lead")` — воронка доступа. Возможные значения: `lead` / `demo` / `approved` / `awaiting_payment` / `active` / `paused` / `archived`.
- `User.role` теперь принимает: `admin` / `sales` / `client` / `demo` / `viewer` / `manager` (back-compat).
- НОВЫЙ `InviteToken` model: id, `token` (32-byte hex, unique), email (опц.), role, workspaceStatus, createdById, usedAt, usedByUserId, expiresAt, revokedAt, note.
- Seed backfill: dev user → workspaceStatus=`active`, существующие записи с `lead` поднимаются в `active` чтобы не сломать pre-Sprint-22 аккаунты.

### Backend

- **`server/src/authCrypto.ts`** — добавлен `generateInviteToken()` (32 bytes hex через `crypto.randomBytes`).
- **`server/src/routes/auth.ts`** — три изменения:
  - `POST /signup` теперь требует `inviteToken` в body. Валидирует: существует, не revoked, не used, не expired, email совпадает (если задан в invite). После создания user'а помечает invite `usedAt + usedByUserId` — single-use гарантирован.
  - `GET /invite/:token` — публичный read-only endpoint для фронта (показать «приглашение валидно, для email X»).
  - `POST /login` блокирует workspaceStatus `archived` / `paused` (понятный код ошибки), для остальных — пропускает, баннер на фронте.
  - `POST /demo` создаёт team-аккаунты с `workspaceStatus='active'` (внутренний инструмент).
  - `GET /me` возвращает workspaceStatus.
- **`server/src/middleware/workspaceAccess.ts`** — НОВЫЙ. Combined middleware `authedAndActive`: сначала auth (Bearer / header), потом workspace check:
  - `active` → полный доступ
  - `demo` / `approved` / `awaiting_payment` → GET/HEAD/OPTIONS пропускает, write-методы → 403 `workspace_readonly`
  - `lead` / `paused` / `archived` → 403 `workspace_not_active`
  - Применён глобально на `/api` (after `/api/auth`) в index.ts — закрывает все 13 protected routes одной строкой
- **`server/src/routes/admin.ts`** — добавлены 4 endpoint'а:
  - `POST /api/admin/invites` — создать (email/role/workspaceStatus/expiresInDays/note)
  - `GET /api/admin/invites` — список с includes createdBy
  - `POST /api/admin/invites/:id/revoke` — отозвать (только если ещё не used)
  - `PATCH /api/admin/users/:id/status` — обновить workspaceStatus + опц. role существующему юзеру

### Frontend

- **`web/src/lib/auth.ts`** — `UserRole` расширен (sales/demo/viewer), новый `WorkspaceStatus` type union. `AuthState` дополнен `workspaceStatus`. Helpers: `isWorkspaceActive`, `isWorkspaceReadonly`, `normalizeWorkspaceStatus`.
- **`web/src/pages/Signup.tsx`** — переписан под invite-only:
  - Без `?invite=` параметра → рендерится `<ApplyForAccessPage />` (3-step explainer + mailto CTA «Написать команде» + ссылка на /login)
  - С `?invite=token` → GET `/api/auth/invite/:token` для валидации, показ инфы кому выпущен (email pre-filled и заблокирован если задан в invite), форма signup, после signup — token + redirect на dashboard
  - Локализованные ошибки: invite_invalid / invite_used / invite_revoked / invite_expired / invite_email_mismatch
- **`web/src/pages/Login.tsx`** — translateAuthError мапит workspace_archived / workspace_paused в человеческие сообщения. finishLogin сохраняет workspaceStatus в localStorage.
- **`web/src/components/layout/WorkspaceBanner.tsx`** — НОВЫЙ. Узкий баннер сверху страницы для не-active workspace'ов. Per-status copy: demo / approved / awaiting_payment / lead / paused / archived. CTA: mailto:hello@zapusk.tech.
- **`web/src/components/layout/AppLayout.tsx`** — `<WorkspaceBanner />` рендерится между Topbar и main контентом.
- **`web/src/pages/AdminDashboard.tsx`** — добавлен `<InvitesPanel />`:
  - Форма создания: email (опц.) / role / workspaceStatus / expiresInDays / note
  - Таблица всех invites с фильтрацией по состоянию (активно / использовано / отозвано / истекло)
  - Кнопка «Ссылка» копирует `{origin}/signup?invite={token}` в clipboard
  - Кнопка «Отозвать» для активных
  - Рендерится на `/admin/invites` + компактная версия в overview
- **`web/src/components/layout/Sidebar.tsx`** — добавлен пункт «Приглашения» в admin nav. NAV record стал Partial — fallback на client view для ролей без специфичной навигации.

### Verification

- [x] Migration `invite_only_access` применена
- [x] Seed backfill отработал на dev DB
- [x] Local smoke test (6/6 сценариев):
  - Signup без invite → 400 validation_failed
  - Admin создаёт invite → 201 token returned
  - Signup с invite → 201, role=client, workspaceStatus=active
  - Повторное использование invite → 403 invite_used
  - Lead workspace: /me OK, /api/projects → 403 workspace_not_active
  - Demo workspace: GET /api/projects → 200, POST /api/projects → 403 workspace_readonly
- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — OK (487.42 kB / 137.31 kB gzip, +13 kB к Sprint 21)

### Production rollout

- `npm start` → `prisma migrate deploy` применяет миграцию идемпотентно
- Seed backfill (`db:seed:prod`) поднимет существующих pre-Sprint-22 users из default `lead` в `active`
- Никаких новых env vars не требуется
- На demo-инстансе (`DEMO_MODE=true`) `/api/auth/demo` остаётся доступным — это team back-office tool
- На реальном customer tenant: `DISABLE_DEMO_LOGIN=true` отключает team demo flow

### Что осталось

- Billing integration (auto-update workspaceStatus при оплате) — отдельный sprint
- Полноценный workspace-isolation на уровне БД (Project.workspaceId) — пока isolation через User.id
- Email-уведомления об invite (сейчас admin копирует ссылку руками)
- Demo workspace с auto-генерируемыми fake данными — пока demo = пустой workspace с readonly UI

---

## Sprint 21 update — 2026-05-14 — Система пути привлечения инвестиций

Theme: **Превратили проект из «набора AI-материалов» в систему сопровождения сделки.** Каждый проект выбирает формат привлечения (акционирование / доля ООО / convertible / SAFE / Pre-IPO / только упаковка), и под формат система собирает 5 этапов: юридическая упаковка, маркетинговая упаковка, подготовка к инвесторам, работа с инвесторами, размещение и сделка. У каждого пункта свой статус (не_начато / в_работе / ожидает_информацию / на_проверке / готово / заблокировано) и handover (AI собирает / аналитик проверяет / юрист / менеджер / команда упаковки).

Главный KPI спринта: фаундер за 15 секунд после открытия проекта видит — какой у него трек, насколько проект готов, что в работе сейчас, что тормозит, какие следующие шаги.

Non-goals (фикс): без новых AI-моделей, без сложных AI-агентов, без investor CRM, без auto-outreach, без новых provider integrations.

### Schema (migration `investment_track`)

- `Project.investmentTrack String?` — формат привлечения. Значения: `shareholding` / `llc_share` / `convertible` / `safe` / `pre_ipo` / `packaging_only` / null. Nullable — старые проекты не ломаются.

### Backend

- **`server/src/routes/projects.ts`** — `projectSchema` дополнен `investmentTrack: z.enum(...).optional().nullable()`. POST принимает при создании, PATCH (via `partial()`) — для смены формата. `start:prod` запускает `prisma migrate deploy` идемпотентно.

### Frontend lib

- **`web/src/lib/api.ts`** — добавлен `InvestmentTrack` type union, `Project.investmentTrack: InvestmentTrack | null`.
- **`web/src/lib/investmentTrack.ts`** — НОВЫЙ. Главный config-файл спринта (~400 строк):
  - 6 опций трека (TRACK_OPTIONS) + лейблы
  - 6 статусов пункта (ItemStatus) + tone-маппинг
  - 7 handover-ролей (AI / аналитик / юрист / менеджер / команда_упаковки / PR_специалист / фаундер) + UI tones
  - `buildInvestmentJourney(project, jobs)` — track-aware builder этапов:
    - **Юридическая упаковка** — структура сделки + специфичные пункты под трек (выпуск акций / реестр / акционерное соглашение для shareholding+pre_ipo; корпоративное соглашение + договоры + legal DD для llc_share; term sheet + договор займа для convertible; форма SAFE для safe; аудит + корп. документы для pre_ipo; полностью скрыт для packaging_only)
    - **Маркетинговая упаковка** — позиционирование (бриф), pitch deck, финмодель, лендинг, ванпейджер, Investor FAQ
    - **Подготовка к инвесторам** — интервью с фаундером, AI-подготовка к встречам, работа с возражениями, AI Discoverability
    - **Работа с инвесторами** (скрыт для packaging_only) — AI-лиды, PR, блогеры, эфиры, инвестклубы, работа с базой
    - **Размещение и сделка** (скрыт для packaging_only) — размещение на платформе / бронирование (для акционирования и Pre-IPO), подписание с инвесторами (для llc_share/convertible/safe), сопровождение, закрытие, вторичный рынок
  - Каждый пункт получает динамический статус из контекста проекта: наличие брифа, missing data, packaging jobs (succeeded/awaiting_manager/queued)
  - `computeJourneyMetrics(build)` — overall readiness 0..100, weighted: готово=1, на_проверке=0.85, в_работе=0.45, ожидает_информацию=0.2
  - `whatTeamMustDo(build)` / `whatsHappeningNow(build)` — derived лента для сайдбара

### Frontend components

- **`web/src/components/project/InvestmentJourney.tsx`** — НОВЫЙ. Главный блок проекта:
  - Header «Путь привлечения инвестиций» + badge трека + кнопка «Сменить формат»
  - H2 «Проект готов к привлечению инвестиций на N%» с color-coded цифрой (success/ai/warning по диапазону)
  - 3-KPI grid: «В работе / Ждём от команды / Готово»
  - 5 этапных карточек с раскрытием (chevron + done/total counter + per-stage progress bar)
  - Каждый пункт = строка со status dot + title + StatusBadge + handover badge + hint
- **`web/src/components/project/TrackPicker.tsx`** — НОВЫЙ. Модальное окно выбора формата:
  - Открывается автоматически при первом заходе на проект без трека
  - 6 radio-карточек с label + hint
  - CTA «Запустить путь привлечения» при первом выборе / «Сохранить формат» при смене
- **`web/src/components/project/ActivityHistory.tsx`** — НОВЫЙ. История проекта:
  - Производный view из существующих данных: UploadedFile + ProjectBrief.updatedAt + PackagingJob events
  - 5 типов событий (file_uploaded / brief_updated / material_ready / material_review / material_in_progress) с разными иконками
  - Role-gate: client видит generic «AI собрал», admin/manager — provider name + completedBy
  - Сортировка по времени desc, top 15

### Cockpit integration

- **`web/src/pages/ProjectCockpit.tsx`**:
  - `load()` теперь параллельно тянет `/api/packaging-jobs/project/:id` для расчёта статусов
  - Если `project.investmentTrack === null` — автоматически открывается `<TrackPicker>` (один раз)
  - Главная позиция в layout: `<InvestmentJourney />` сразу после Hero + Progress Steps (заменяет старый статичный ProjectJourney)
  - Под ним — `<ActivityHistory />`
  - Дальше — AIPackagingHistory + AIDiscoverabilityScore (technical детали для манагера/админа)
  - Старый `<ProjectJourney stages={DEFAULT_PROJECT_JOURNEY}>` удалён — заменён на track-aware версию

### UX-словарь (важно)

В UI исключены: readiness, pipeline, packaging, outreach, onboarding, dashboard, generated materials, task, workflow.
Используются: готовность проекта, путь привлечения инвестиций, этапы привлечения, материалы проекта, работа с инвесторами, упаковка проекта, задачи проекта, сопровождение сделки.
Допустимые англицизмы: лендинг / ванпейджер / AI Discoverability / Investor FAQ / Pre-IPO / SAFE / term sheet / due diligence (профессиональные термины рынка).

### Verification

- [x] Миграция `investment_track` применена локально
- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — OK (474.71 kB / 133.64 kB gzip, +22 kB к Sprint 20)
- [ ] Production verify (после redeploy):
  - Открыть `/projects/{id}` под client'ом — должен автоматически открыться TrackPicker модал
  - После выбора формата (например, «Акционирование») — главный блок «Путь привлечения инвестиций» с 5 этапами + общая готовность %
  - Раскрытие этапов работает; пункты помечены статусом и handover-бейджом
  - Sidebar справа: «Что требуется от вас» + «Что происходит сейчас»
  - Под блоком — «История проекта» с лентой событий
  - PATCH `/api/projects/:id` с `{investmentTrack:'shareholding'}` сохраняет в БД

---

## Sprint 20 update — 2026-05-14 — AI Search Visibility & AEO Infrastructure

Theme: **Zapusk AI собирает не просто landing для инвестора, а AI-readable инвестиционную упаковку.** Каждая страница должна легко читаться, структурироваться и цитироваться AI search engines (ChatGPT / Claude / Perplexity / answer engines). Это сдвиг от классического SEO к AEO (Answer Engine Optimization) поверх существующего Packaging Pipeline.

Non-goals (фикс): без SERP tracking, Semrush integration, Google Search Console, indexing APIs, crawler analytics, ranking dashboards, backlink systems. И никаких упоминаний Lovable / Semrush / GPT / Claude в client-facing UI — это собственная инфраструктура ZAPUSK AI.

### Backend

- **`server/src/services/templateSeeds.ts`** — добавлен общий `AEO_LAYER` константа, инжектится в `${AEO_LAYER}` через template literal в 4 landing-style шаблона: `one_pager`, `pitch_structure`, `lovable_landing`, `lovable_pitch`. Слой требует:
  - Semantic HTML (H1 / H2 / H3, реальные заголовки)
  - 9 обязательных semantic sections (Hero summary / Что делает / Почему рынок / Почему сейчас / Revenue / ICP / Investment opportunity / FAQ / Structured summaries)
  - 8+ self-contained Q/A в FAQ для AI citation
  - Bold цифры, internal anchors, meta description / Open Graph
  - Anti-patterns: текст в картинках, длинные параграфы, JS-only контент, жаргон без объяснений
- **Новый seed `ai_visibility_report`** — внутренний AI Discoverability аудит. provider=openai / tool=gpt-4.1 / outputType=ai_visibility_report / category=summary. Output — структурированный Markdown с AI Discoverability Score (0..100), 5 segment-scores (AI Readability / Investor Keyword Coverage / FAQ Quality / Semantic Structure / Citation Readiness), 10-pt checklist на coverage инвестор-intent topics, FAQ coverage audit на 8 базовых вопросов, missing AI-search topics + recommendations с приоритетами.
- **`server/src/services/promptBuilders.ts`** — `PromptKind` + `ALL_PROMPT_KINDS` + `KIND_TITLES` дополнены `ai_visibility_report`. KIND_TITLES для клиента: «AI Discoverability отчёт».
- **`server/src/services/aiProviders.ts`** — `OutputTypeId` enum дополнен `ai_visibility_report`, `OUTPUT_TYPES` мапа дополнена записью «AI Discoverability Report», `TEMPLATE_ORCHESTRATION` мапа дополнена. Provider=openai, tool=gpt-4.1, model=null (берёт env.OPENAI_MODEL_MAIN).

### Frontend

- **`web/src/lib/aiProviders.ts`** — `OUTPUT_TYPE_UI` дополнен `ai_visibility_report` («AI Discoverability» badge, tone=ai). `DEFAULT_TEMPLATE_ORCHESTRATION` дополнен fallback'ом.
- **`web/src/components/ui/AIDiscoverabilityScore.tsx`** — НОВЫЙ компонент. Большой score 0..100 + 5 progress-bar'ов по сегментам + AI/AEO статус-badge («AI Search Ready / AEO в работе / нужны улучшения») + последний timestamp обновления. Логика:
  - Если на проекте есть succeeded job с outputType=ai_visibility_report — парсим из его resultJson markdown'а явные оценки (regex по «AI Readability — N» / «Готовность — N»)
  - Если AI отчёта ещё нет — heuristic baseline: считаем сколько artefact'ов готово (landing/pitch/faq/summary/financial) и поднимаем segment-scores соответственно
  - Если ничего не готово — baseline ~30-40 с CTA «Сгенерировать отчёт»
  - Badge `source` показывает, AI это или эвристика (admin/manager диагностика)
- **`web/src/pages/ProjectCockpit.tsx`** — `<AIDiscoverabilityScore />` встроен справа от «AI generated materials» в grid `[1fr_360px]`. CTA «Сгенерировать отчёт» вызывает `generatePrompt('ai_visibility_report')`.
- **`web/src/components/ui/AIPackagingHistory.tsx`** — каждый landing-style job (landing / one_pager / pitch_deck / pitch_structure / ai_visibility_report) получает **«AI-ready»** pill рядом с обычными статусами. Это визуальный сигнал, что страница включает AEO слой.

### Marketing copy

- **`web/src/pages/Dashboard.tsx`** — новый AEO-баннер под KPI: «AI Search Ready · собственная инфраструктура» + объяснение «Лендинги собираются с semantic structure и AEO-слоем — их видят и могут процитировать AI answer engines». 
- **`web/src/pages/DemoCabinet.tsx`** — обновлён hero subtitle: «...AI-ready упаковка с semantic structure под AI-search...» + 3 badge'а (AI Search Ready / AEO-ready structure / AI Discoverable).
- **`web/src/pages/Signup.tsx`** — subtitle: «AI-ready упаковка, semantic structure под AI-search и собственный AI Discoverability Score».

Все тексты сознательно избегают vendor names. Client видит «AI Discoverability» / «AI Search Ready» / «AEO-ready structure» — это инфраструктура ZAPUSK AI.

### Role visibility (Sprint 16 + 20 stack)

- **Client** видит: «AI Discoverability» (через `outputTypeLabel`), generic «AI Reasoning» (вместо «GPT-4.1»), AI-ready бейджи, AEO marketing copy. Никаких vendor names.
- **Manager/Admin** видит ту же AEO marketing copy, плюс полную orchestration metadata: provider=openai, tool=gpt-4.1, errorCode, completedBy. Templates на `/templates` показывают `ai_visibility_report` в orchestration center с full provenance.

### Verification

- [x] Re-seed dev: template `ai_visibility_report` создан, 3 demo проекта получили job'ы со status=succeeded (потому что openai provider — fast path, реальный GPT call'а не делает)
- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — server tsc + web vite OK (452.10 kB / 127.02 kB gzip, +8 kB к Sprint 19)
- [ ] Production verify (после redeploy):
  - `/dashboard` показывает AEO-баннер «AI Search Ready»
  - `/projects/{id}` показывает `<AIDiscoverabilityScore />` справа в cockpit'е, с baseline или heuristic scoring
  - `/api/packaging-jobs/project/{id}` содержит запись с `templateKey=ai_visibility_report` + `outputType=ai_visibility_report`
  - `/templates` (admin) показывает «AI Discoverability Report» в orchestration center с provider=OpenAI / tool=GPT-4.1
  - `/demo` показывает 3 AEO badge'а в hero

### Known limitations

- AI Discoverability Score сейчас в основном heuristic — точные числовые оценки появляются только когда сгенерирован `ai_visibility_report` через реальный OpenAI call и оценки прописаны в markdown'е по нужному паттерну (regex-парсер пытается вытащить).
- AEO_LAYER инжектится в prompt только при следующем `db:seed:prod` на проде. Существующие seed-шаблоны в prod БД не обновятся автоматически до запуска seed — но `start:prod` запускает `db:seed:prod` каждый рестарт, так что обновятся после redeploy.

---

## Sprint 19 update — 2026-05-14 — Real auth: signup, login, JWT, demo roles

Theme: **Production-looking auth flow.** До спринта auth был чистым MVP — любой email через `x-user-email` header автоматически создавал User, роль выбиралась клиентом через `x-user-role` (privilege escalation в один curl). Теперь — реальная регистрация по email/password с scrypt hash, Bearer JWT (HS256), persistent role в БД, и аккуратный demo-блок для команды.

Non-goals (фикс): без Google/Telegram/Яндекс OAuth (mock кнопки с tooltip «Скоро»), без email confirmation, без forgot password, без 2FA, без billing, без team auth, без сложных permissions.

### Schema (migration `auth_password_role`)

- `User` +3 поля: `passwordHash` (nullable, формат `scrypt:salt:hash`), `role` (default `client`), `lastLoginAt`.

### Backend

- **`server/src/authCrypto.ts`** — НОВЫЙ. Реализация password hashing + JWT signing через `node:crypto` БЕЗ новых dep'ов (сознательно — CLAUDE.md «не добавлять deps без approval»):
  - `hashPassword(password)` → `scrypt(N=16384, r=8, p=1, keylen=64, salt=16 bytes)` (OWASP-recommended)
  - `verifyPassword(password, stored)` → `crypto.timingSafeEqual` против раскрытия через timing attack
  - `signToken({sub, email, role})` / `verifyToken(jwt)` → HS256 через `crypto.createHmac`, TTL 7 дней
  - `JWT_SECRET` через env, dev fallback с warn
- **`server/src/auth.ts`** — middleware переписан с двумя путями:
  1. `Authorization: Bearer <jwt>` — основной. Token → claims.sub → user lookup → 401 на invalid token (НЕ fall through на header — закрывает обход подменой header'а)
  2. `x-user-email` header — back-compat для demo / интеграционных скриптов. `x-user-role` header **игнорируется** (роль теперь из БД), что закрывает privilege escalation. Отключается через `DISABLE_HEADER_AUTH=true` на production tenant.
- **`server/src/routes/auth.ts`** — переписан полностью:
  - `POST /api/auth/signup` — name + email + password (мин 8 символов). Email уникален. Hash через scrypt. Возвращает `{user, token}`. role всегда `client`.
  - `POST /api/auth/login` — email + password. Constant-ish response на «не найден» vs «неверный пароль» (закрывает enumeration). `lastLoginAt` обновляется.
  - `POST /api/auth/demo` — quick-login по роли без пароля для команды и презентаций. Создаёт/upsert'ит `demo-{role}@zapusk.tech`. Отключается через `DISABLE_DEMO_LOGIN=true`.
  - `GET /api/auth/me` — текущий профиль (Bearer или header back-compat).
- **`server/src/env.ts`** — добавлен `JWT_SECRET`. На production обязательно установить >=32 символа.

### Frontend

- **`web/src/lib/auth.ts`** — `AuthState` дополнен `token: string | null` и `userId`. `setAuth/getAuth/clearAuth` сохраняют новые поля в localStorage.
- **`web/src/lib/api.ts`** — request теперь отправляет `Authorization: Bearer <token>` если есть, плюс back-compat `x-user-email/x-user-role` для legacy скриптов.
- **`web/src/components/auth/SocialButtons.tsx`** — НОВЫЙ. Mock-кнопки Google / Telegram / Яндекс ID. Клик → tooltip «Скоро добавим вход через X», auto-dismiss через 2.4 сек. Не ломают UX.
- **`web/src/pages/Login.tsx`** — переписан целиком:
  - Заголовок «Войти в аккаунт» + подзаголовок
  - `<SocialButtons />` сверху
  - Divider «или продолжить с email»
  - Email + password форма
  - CTA «Войти»
  - Ссылка «Нет аккаунта? Создать аккаунт» → `/signup`
  - Отдельный карточный блок «Демо-доступ для команды» внизу с 3 кнопками (Клиент / Менеджер / Админ), визуально вторичный. Зовёт `POST /api/auth/demo`.
- **`web/src/pages/Signup.tsx`** — НОВЫЙ. Структура зеркальная login'у: SocialButtons → divider → форма (Имя + Email + Пароль с hint'ом «Минимум 8 символов») → CTA «Создать аккаунт» → «Уже есть аккаунт? Войти». Local + server validation, понятные ошибки на русском.
- **`web/src/App.tsx`** — `/signup` добавлен в публичные роуты. Все остальные обёрнуты в `<RequireAuth>` или `<RequireRole>`. Публичные: `/login`, `/signup`.

### Verification

- [x] `prisma migrate dev --name auth_password_role` — applied
- [x] Local smoke test через curl (без UI):
  - `POST /api/auth/signup` с password<8 → `HTTP 400` ✓
  - `POST /api/auth/signup` валидный → 201 `{user{role:client}, token}` ✓
  - `POST /api/auth/login` верный пароль → token ✓
  - `POST /api/auth/login` неверный → `HTTP 401 invalid_credentials` ✓
  - `GET /api/auth/me` c `Authorization: Bearer <token>` → user profile ✓
  - `POST /api/auth/demo` с `role=admin` → token + demo=true + role=admin ✓
- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — OK (443.95 kB / 124.64 kB gzip, +8 kB)

### Что нужно сделать вручную на production (опционально)

- В Render Environment добавить **`JWT_SECRET`** длиной >=32 символов (можно `openssl rand -hex 32`). Без него auth работает на dev-fallback, но это менее безопасно. После redeploy все ранее выданные токены инвалидируются — пользователям нужно перелогиниться.
- (Опционально) `DISABLE_HEADER_AUTH=true` — выключает back-compat header auth когда мигрируем все клиенты на Bearer.
- (Опционально) `DISABLE_DEMO_LOGIN=true` — отключает `/api/auth/demo` на реальном customer tenant.

### Known limitations

- localStorage хранение токена: уязвим к XSS. Acceptable для MVP. В будущем — `HttpOnly` cookie через `/api/auth/refresh`.
- Token TTL 7 дней без refresh. После протухания требуется повторный login. Refresh-token flow — следующий sprint.
- Social OAuth (Google/Telegram/Яндекс) — кнопки mock, реальные интеграции не подключены.
- Forgot password / email confirmation / 2FA — отдельный sprint.

---

## Sprint 18 update — 2026-05-14 — Managed AI Packaging Flow

Theme: **Клиент не видит внутренних инструментов.** Lovable / Claude Design / Claude Code / GPT-5.5 — это admin-уровень информации. Фаундер видит только «ZAPUSK AI готовит материалы». Все материалы, требующие ручной сборки (landing, one_pager, pitch_deck), идут в очередь менеджера через новый статус `awaiting_manager`. Менеджер закрывает задачу через `/manager → «Задачи на упаковку»`, и клиент сразу видит «Материал готов».

Non-goals (фикс): без webhook'ов, без notifications (Telegram/Email/Slack/push), без task assignment engine, без сложной CRM, без browser automation. Это API + UI поверх существующего PackagingJob.

### Diagnostic (часть «Дополнение»)

Перед основной работой проверил prod: `/health.integrations` показал `openai=true, anthropic=true, deepgram=true, lovable=false`. **Anthropic ключ установлен, но Claude call падал** с `errorCode=unknown` / «Неизвестная ошибка Anthropic» — из-за placeholder model `claude-opus-2025` в Sprint 15 orchestration registry. Фикс:
- `aiProviders.ts` — все `model` в `TEMPLATE_ORCHESTRATION` поставлены в `null`. `claudeGenerateText()` тогда берёт `env.ANTHROPIC_MODEL_MAIN` (default `claude-opus-4-1`).
- `claude.ts classifyError()` — добавлены пути `404 / not_found_error / 'model X does not exist'` → `errorCode='model_not_found'` + читаемый message, чтобы ops быстро диагностировали проблему. Также SDK type теперь попадает в `errorCode` как `sdk_<type>` вместо общего `unknown`.

### Schema (migration `packaging_managed_flow`)

- `PackagingJob` +2 nullable поля: `managerComment` (client-facing текст от менеджера), `completedBy` (email менеджера для аудита).
- Новый индекс `@@index([status])` — менеджерский endpoint `/api/manager/packaging-tasks` фильтрует по `status='awaiting_manager'` и индекс ускоряет lookup.
- Новый status value `awaiting_manager` (status — free string, миграция enum'а не требуется).

### Backend

- **`server/src/services/promptBuilders.ts`** — `dispatchToProvider()` полностью переписан под managed flow:
  - `provider='claude'` + есть ключ → real Claude call → `succeeded` с `resultJson`
  - `provider='claude'` + нет ключа OR API failed → `awaiting_manager` + admin видит `errorCode`/`errorMessage`
  - `provider='lovable'` → всегда `awaiting_manager` (НЕ дёргаем Lovable API из client pipeline — это менеджерский tool)
  - `provider='claude_design'` → `awaiting_manager` (нет public API)
  - `provider='openai'` → `succeeded` (Sprint 15 совместимое поведение, OpenAI используется напрямую sales-assistant'ом)
  - Новая функция `markAwaitingManager(jobId, outputType)` ставит client-facing `resultPreview`: «Материал готовится командой ZAPUSK AI. Обычно занимает от нескольких часов до 1 рабочего дня» для landing/one_pager/pitch_deck.
- **`server/src/routes/manager.ts`** — добавлено:
  - `GET /api/manager/packaging-tasks?status=awaiting_manager` — список задач (с project + user данными)
  - `GET /api/manager/packaging-tasks/:id` — детали задачи (с promptом)
  - `POST /api/manager/packaging-tasks/:id/complete` — менеджер закрывает: `{previewUrl, resultUrl, managerComment}` → `status='succeeded'`, `completedBy=user.email`, `completedAt=now()`. errorCode и errorMessage очищаются.
  - `POST /api/manager/packaging-tasks/:id/cancel` — `status='failed'` + `errorCode='manager_cancelled'`. Клиент видит «Свяжитесь с командой ZAPUSK AI».
  - В `/api/manager/dashboard.kpis` добавлен счётчик `packagingTasks: count(awaiting_manager)`.

### Frontend

- **`web/src/components/manager/PackagingTasks.tsx`** — НОВЫЙ компонент в `/manager`:
  - Список awaiting_manager job'ов с provider+tool badges (manager видит полную AI provenance — `Lovable · Lovable Web · Landing Page`)
  - Раскрытие задачи → показывается internal prompt (max-h-72, scrollable, mono-шрифт) + кнопка «Скопировать»
  - 2 input'а: `previewUrl` (что увидит клиент) + `resultUrl` (внутренний Lovable IDE URL)
  - Textarea для `managerComment` — переопределяет client-facing preview text
  - Кнопки «Отметить готово» / «Отменить задачу»
- **`web/src/pages/ManagerDashboard.tsx`** — `<PackagingTasks />` поднят в top-of-content. KPI расширены: новый «Задачи упаковки» badge с tone=ai.
- **`web/src/components/ui/AIPackagingHistory.tsx`** — переписан для role-aware рендера:
  - **Title/subtitle** разные для client («Материалы проекта от ZAPUSK AI») и manager/admin («AI generated materials · Packaging Pipeline»)
  - **Status labels** разные: client видит «Готовится / На проверке менеджера / Требуется внимание менеджера / Готово», manager/admin — «В очереди / На ручной обработке / Mock fallback / Ошибка / Готово»
  - **Landing notice банер**: если у client'а в списке есть `awaiting_manager` для landing/one_pager/pitch_deck → плашка «Лендинг готовится чуть дольше: обычно от нескольких часов до 1 рабочего дня»
  - **managerComment** — приоритетный текст для клиента (если менеджер указал — он перекрывает дефолтный resultPreview)
  - **Spinner icon** для awaiting/running/queued — Loader2 с `animate-spin` вместо обычного Activity icon (визуально «в работе»)
  - **«Перезапустить» скрыто для client** — фаундер не должен видеть, что внутри есть pipeline, который можно перезапустить
  - **errorMessage не виден клиенту** на awaiting/mock — только manager/admin
  - **`completedBy email`** показывается manager/admin рядом со временем (для аудита)
- **`web/src/lib/api.ts`** — `PackagingJob` interface: `status` enum дополнен `'awaiting_manager'`, добавлены `managerComment`, `completedBy`.

### Why this matters

- **Главная цель спринта**: клиент видит «Материал готовится командой ZAPUSK AI», не «Lovable собирает страницу». Внутренние инструменты остаются операционным секретом — это позиционирование «Zapusk AI оркестрирует AI стек», а не «мы перепродаём чужие модели».
- **Manager UX**: одна страница `/manager` теперь центр всей операционной работы — задачи на упаковку поверх обычных «что сделать сегодня». Менеджер копирует prompt → делает работу в Lovable / Claude Design / любом нужном tool → вставляет URL обратно. Это репликирует attention-flow «inbox для AI».
- **Recovery после Claude API fail**: если Anthropic вернул 5xx или model_not_found — job не остаётся «mock» с ошибкой клиенту, а уходит в awaiting_manager. Менеджер видит errorCode (например `model_not_found`) и понимает, что фикс — Render env, а не повторный запуск.

### Verification

- [x] `prisma migrate dev --name packaging_managed_flow` — миграция применена
- [x] `db:seed` — все 6 «managed» templates (lovable_landing/lovable_pitch/one_pager/cloud_design/pitch_structure/financial/calculator_spec) идут в `awaiting_manager`. OpenAI templates остаются `succeeded`.
- [x] Manager API smoke-tested локально через ts-проверку маршрутов
- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — server tsc + web vite OK (436.30 kB / 123.04 kB gzip, +7 kB к Sprint 17)
- [ ] Production verify: после redeploy проверить `/api/manager/packaging-tasks` под manager — должны быть видны awaiting_manager job'ы. Клиент на `/projects/{id}` не видит слова Lovable/Claude и видит landing notice.

### Что нужно сделать вручную на production

- Никаких новых ENV vars в Sprint 18 не требуется
- `npm start` → `start:prod` → `prisma migrate deploy` применит миграцию идемпотентно
- После redeploy старые job'ы в БД остаются с прежними status — но новые запуски пойдут по новым правилам
- (Опционально) запустить `db:seed:prod` ещё раз чтобы новые demo-job'ы создались с новыми orchestration defaults (`model=null`)

---

## Sprint 17 update — 2026-05-13 — Real AI Provider Integrations

Theme: **Templates → Provider → PackagingJob теперь идут до реальных API.** Поверх orchestration layer из Sprint 15 подключены три реальных provider-клиента: Deepgram (транскрибация), Claude (Anthropic Messages API для financial / calculator_spec), Lovable (landing / one_pager / pitch_deck web). Без ключа каждый клиент честно возвращает `status='mock'` + `errorCode` — UX flow не блокируется.

Non-goals (фикс): без async queue, без workers, без webhook'ов, без XLSX/PDF export, без Zoom RTMS, без multi-agent parallel execution. Это синхронные fetch'и с timeout + 1 retry на transient errors.

### Schema (migration `packaging_job_provider_result`)

- `PackagingJob` дополнен полями: `providerJobId`, `previewUrl`, `resultUrl`, `resultJson`, `errorCode`, `errorMessage`, `completedAt`. Все nullable — старые записи не ломаются.

### Backend

- **`server/src/env.ts`** — добавлены `ANTHROPIC_MODEL_MAIN=claude-opus-4-1`, `ANTHROPIC_MODEL_FAST=claude-sonnet-4-5`, `LOVABLE_API_KEY`, `LOVABLE_API_BASE_URL=https://api.lovable.dev`. `ANTHROPIC_MODEL` оставлен как back-compat alias.
- **`server/src/ai/providers/claude.ts`** — НОВЫЙ. Standalone Anthropic Messages client (`claudeGenerateText` / `claudeGenerateJson`). Не зависит от `env.AI_PROVIDER` — используется per-template из Packaging Pipeline. Timeout 45s, 1 retry на transient errors (429, 5xx, network/abort). НЕ повторяет 401/403/400. Structured `classifyError()` возвращает короткий `errorCode` без секретов. `logUsage()` пишет одну JSON-строку с latency + tokens, без ключей (только если `AI_LOG_USAGE=true`).
- **`server/src/services/lovableClient.ts`** — НОВЫЙ. `createLovableApp({ prompt, metadata })` → POST `{LOVABLE_API_BASE_URL}/projects` с `{ prompt, name, metadata: { source: 'zapusk-ai', zapusk_project_id, template_key, output_type } }`. Парсит ответ best-effort: `id` / `preview_url` / `project_url` / `status`. Если ответ другой формы — мы выживаем (берём первое непустое поле). Без `LOVABLE_API_KEY` → mock preview URL `https://zapusk.tech/demo/{templateKey}?project={slug}`.
- **`server/src/services/promptBuilders.ts`** — добавлен `dispatchToProvider()`. После создания `PackagingJob{status:'queued'}` он смотрит на `orchestration.provider` и:
  - `claude` → `claudeGenerateText` → сохраняет результат в `resultPreview` (240 char first line) и полный текст в `resultJson` (`{ text, model, inputTokens, outputTokens }`)
  - `lovable` → `createLovableApp` → сохраняет `providerJobId`, `previewUrl`, `resultUrl`, raw response в `resultJson`
  - `openai` / `claude_design` → status=`succeeded` без реального вызова (Sprint 15 совместимое поведение). OpenAI используется напрямую sales-assistant'ом и conversation-analysis'ом.
  - Если ключа провайдера нет → status=`mock`, `errorCode` объясняет что именно.
  - Если упало внутри dispatcher'а → status=`failed` + `dispatcher_crash`, в обоих случаях `completedAt` проставлен.
- **`server/src/services/deepgramClient.ts`** — без изменений; уже production-ready с Sprint 11. mp3/wav/m4a/mp4 через `mimeType` header, ru-language, punctuation, smart_format, diarization, 90s timeout, deterministic fallback.
- **`server/src/index.ts`** `/health` дополнен блоком `integrations: { openai, anthropic, deepgram, lovable }` — booleans без секретов. Старый `ai.*` блок оставлен для back-compat.

### Frontend

- **`web/src/lib/api.ts`** — `PackagingJob` interface дополнен `providerJobId / previewUrl / resultUrl / resultJson / errorCode / errorMessage / completedAt`.
- **`web/src/components/ui/AIPackagingHistory.tsx`** — каждая строка job'а теперь:
  - Показывает `completedAt ?? createdAt` (когда провайдер реально закончил)
  - Если есть `previewUrl` → кнопка «Открыть результат» (target=blank). Variant `ai` для succeeded, `secondary` для mock.
  - Если есть `errorMessage` — баннер под строкой. Client видит обезличенное «AI временно недоступен — показан демонстрационный результат». Admin/manager видит точный `errorMessage` от провайдера.
  - `errorCode` (моно-шрифт, warning) виден только admin/manager — для ops-диагностики.

### Why this matters

- Когда фаундер запускает «Сформировать комплект материалов» с реальным `LOVABLE_API_KEY` на инстансе, в «AI generated materials» появляется кнопка «Открыть результат» с реальным preview URL'ом из Lovable. Это видимая разница между mock-режимом и подключённой инфраструктурой.
- Provider abstraction Sprint 15 (Templates с provider/tool/outputType) теперь имеет рабочее «низ» — реальные API через unified dispatcher. Подключение нового provider'а (например, Claude Design / Replicate / Runware) — это добавление одной функции в `dispatchToProvider()` + один новый client-файл.
- Безопасность ключей: ни Claude SDK errors, ни Lovable raw responses никогда не попадают в `console.warn` целиком — только `errorCode` и первые 240 символов body. `logUsage()` пишет JSON только если `AI_LOG_USAGE=true`.

### Production rollout — что настроить вручную в Render

Добавить env vars в Render dashboard (Service → Environment):
- `ANTHROPIC_API_KEY` — получить на https://console.anthropic.com/settings/keys
- `ANTHROPIC_MODEL_MAIN` (опционально) — default `claude-opus-4-1`
- `ANTHROPIC_MODEL_FAST` (опционально) — default `claude-sonnet-4-5`
- `DEEPGRAM_API_KEY` — https://console.deepgram.com/
- `LOVABLE_API_KEY` — https://lovable.dev/settings/api (если Lovable экспонирует API)
- `LOVABLE_API_BASE_URL` (опционально) — default `https://api.lovable.dev`

После сохранения Render автоматически redeploy'ит. `npm start` → `start:prod` → `prisma migrate deploy` применит `packaging_job_provider_result` миграцию идемпотентно.

Проверить: `curl https://zapusk-ai.tech/health | jq '.integrations'` — все 4 должны вернуть `true` после установки ключей.

### Verification

- [x] `prisma migrate dev --name packaging_job_provider_result` — миграция применена
- [x] `db:seed` — demo-проекты прогоняют generatePrompt: claude / lovable templates получают `status='mock'` с правильным `errorCode` (так как dev без ключей)
- [x] Lovable mock возвращает `https://zapusk.tech/demo/{templateKey}?project={slug}` — UI показывает кнопку «Открыть результат» с этой ссылкой
- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — server tsc + web vite OK
- [ ] Production verify: `curl /health | jq '.integrations'` показывает текущий уровень конфигурации; запустить generation для `financial` под admin'ом → строка в `/api/packaging-jobs/project/{id}` должна иметь `status='mock'` если ключа нет / `status='succeeded'` + `resultJson` с реальным Claude текстом если ключ установлен.

### Known limitations

- Lovable API контракт не задокументирован публично — реализация best-effort. Если реальный endpoint вернёт другие имена полей (`live_url` вместо `preview_url`, etc.), мы парсим до 4 алиасов; при несовпадении result сохранится в `resultJson` и не сломает UI.
- Generation сейчас синхронный (in-process). Долгие job'ы (>30s для Lovable, >45s для Claude) timeout'ят и попадают в `status='mock'` или `'failed'`. Async queue — следующий sprint.
- `claude_design` (pitch_structure, cloud_design) пока без реального provider'а — Anthropic не экспонирует Claude Design API. Помечаются `status='succeeded'` с body промпта в `resultPreview`.

---

## Sprint 16 update — 2026-05-13 — скрытие AI vendor names от client UI

Theme: фаундер не должен видеть «OpenAI / GPT-5.5 / Claude / Lovable / Deepgram» — это admin-уровень информации, упоминания вендоров размывают позиционирование «Zapusk AI оркестрирует AI стек».

Role-gate подход через `canSeeAIVendors(role)`: client → generic «AI Reasoning / AI Web Studio / AI Finance / AI Design / AI Calculator»; admin/manager → полная provenance. Затронуто: `lib/aiProviders.ts`, `ui/AIPackagingHistory.tsx`, `ui/ProjectMaterialCard.tsx`, `pages/SalesAssistant.tsx`, `pages/ConversationAnalysis.tsx`. Admin-only routes (`/templates`, `/admin/*`) сохранили полные labels.

---

## Sprint 15 update — 2026-05-13 — AI Orchestration: Templates как ядро

Theme: **Templates перестали быть библиотекой промптов и стали orchestration center.** Каждый AI-материал теперь явно знает, какой провайдер его исполняет, каким инструментом, и какой тип артефакта получается на выходе. Packaging Pipeline читает эту информацию из шаблонов и пишет PackagingJob — аудит-трейл оркестрации, видный фаундеру в Project Cockpit.

Non-goals (фикс): без live API auth flows, без Claude/Lovable API, без async queue infra, без webhook sync, без multi-agent execution, без parallel orchestration. Это architecture + UX + orchestration abstraction.

### Schema (Prisma migration `template_orchestration`)

- **`PromptTemplate`** дополнен 4-мя nullable полями: `provider`, `tool`, `model`, `outputType`. Nullable, чтобы custom-шаблоны без зарегистрированной оркестрации не ломали back-compat.
- **`PackagingJob`** новый модель: `projectId`, `templateId`, `templateKey`, `provider`, `tool`, `model`, `outputType`, `status` (queued / running / succeeded / failed / mock), `prompt` (resolved body), `resultPreview` (200-char teaser), `generatedPromptId`/`generatedDocumentId` (FK на сам артефакт), `createdAt`. Индексы по `(projectId, createdAt)` и `(projectId, outputType)`.
- `Project` получил relation `packagingJobs PackagingJob[]`.

### Backend

- **`server/src/services/aiProviders.ts`** — НОВЫЙ. Единый registry: `PROVIDERS` (4: openai / claude / lovable / claude_design), `TOOLS` (6: gpt-4.1 / gpt-5.5 / claude-opus / claude-code / lovable-web / claude-design-pdf), `OUTPUT_TYPES` (9: investor_summary / one_pager / pitch_deck / pitch_structure / landing / financial_model / calculator / faq / sales_assistant) + `TEMPLATE_ORCHESTRATION` мапа `templateKey → (provider, tool, model, outputType)`. `resolveOrchestration()` — fallback для шаблонов без явной metadata.
- **`server/src/seed.ts`** — апдейтит существующие 10 seed-шаблонов с orchestration metadata из registry (upsert update path обновляет provider/tool/model/outputType). Старые БД получают backfill автоматически при следующем `db:seed:prod` (запускается на `npm start`).
- **`server/src/services/promptBuilders.ts`** — `generatePrompt()` теперь после создания `GeneratedPrompt` пишет `PackagingJob` со снапшотом provider/tool/outputType + 200-символьным `resultPreview` (первая содержательная строка resolved body). Если в template нет провайдера и нет fallback'а в registry — job не создаётся (back-compat).
- **`server/src/routes/templates.ts`** — `templateSchema` и `updateSchema` принимают 4 новых поля (опционально, nullable). Новый GET-эндпойнт `/api/templates/orchestration/registry` отдаёт каноничный registry для фронта.
- **`server/src/routes/packagingJobs.ts`** — НОВЫЙ. `GET /api/packaging-jobs/project/:id` (последние 50, desc), `GET /api/packaging-jobs/:id`. Owner-check на месте.
- **`server/src/index.ts`** — смонтирован `/api/packaging-jobs`.

### Frontend

- **`web/src/lib/aiProviders.ts`** — НОВЫЙ. Зеркало server registry (display labels + tone-маппинг для StatusBadge + descriptions). `providerLabel()` / `toolLabel()` / `outputTypeLabel()` / `providerTone()` / `outputTypeTone()` хелперы + `DEFAULT_TEMPLATE_ORCHESTRATION` мапа для UI fallback'а.
- **`web/src/lib/api.ts`** — `PromptTemplate` interface дополнен 4 полями. Новый `PackagingJob` interface.
- **`web/src/components/ui/TemplateCard.tsx`** — карточка шаблона в админке теперь показывает orchestration row: provider badge + tool badge + outputType label. Если template без metadata — fallback из registry с пометкой «по умолчанию».
- **`web/src/pages/Templates.tsx`** — заголовок страницы переименован в «AI Orchestration · Шаблоны». Сверху hero-блок «AI Orchestration Center» с объяснением. В модалке редактирования — 3 select'а (Провайдер / Инструмент / Тип артефакта) + поле «Конкретная модель». PATCH/POST шлёт новые поля.
- **`web/src/components/ui/ProjectMaterialCard.tsx`** — каждая карточка материала показывает provider+tool badges в header'е (берём из `DEFAULT_TEMPLATE_ORCHESTRATION` по `material.promptKind`).
- **`web/src/components/ui/AIPackagingHistory.tsx`** — НОВЫЙ компонент. Список PackagingJob с provider/tool/outputType badges, статусом, resultPreview, временем и кнопкой «Перезапустить» (опциональный hook `onRegenerate(templateKey)`).
- **`web/src/pages/ProjectCockpit.tsx`** — секция «AI generated materials» (компонент `AIPackagingHistory`) добавлена перед «Готовые материалы». Кнопка «Перезапустить» зовёт `generatePrompt(kind)`.

### Why this matters

- Пользователь больше не видит «один чат что-то генерирует». Каждый материал имеет явную atrribution: «GPT-5.5 · Investor FAQ», «Claude · Financial Model», «Lovable · Landing Page», «Claude Design · Pitch Deck». Это сильное value-prop: «Zapusk AI orchestrates different AI systems for fundraising».
- Связи Landing ↔ OnePager ↔ PitchDeck зафиксированы в registry: и Landing, и OnePager идут через Lovable / lovable-web (та же дизайн-система, одни colors). PitchDeck PDF — Claude Design. PitchDeck web-версия — тоже Lovable. Structure (каркас слайдов) — Claude Design.
- Financial Model pipeline: `financial` template → Claude / claude-opus → financial_model. Calculator (`calculator_spec`) → Claude / claude-code → calculator. Это явные artefact'ы, а не «один большой prompt».
- Sales GPT (`sales_gpt`) теперь registered template с провайдером openai / gpt-4.1 / sales_assistant. Investor FAQ (`investor_faq`) — openai / gpt-5.5 / faq (reasoning-модель).
- PackagingJob — это не запуск реальных API. Это аудит-трейл оркестрационного решения: «Pipeline решил, что этот промпт исполнит такой-то AI». Когда мы подключим реальные провайдеры (Lovable API, Claude Design API, Anthropic API), они подхватят эти строки и переключат `status: queued → running → succeeded`.

### Verification

- [x] `prisma migrate dev --name template_orchestration` — мигрировано на dev SQLite
- [x] `db:seed` — backfill сработал на всех 10 seed-шаблонах
- [x] Demo-сид прокинул `generateAllPrompts()` → создалось 30 PackagingJob (3 проекта × 10 шаблонов)
- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — server tsc OK, web vite build OK (427.79 kB / 120.23 kB gzip, +10 kB к Sprint 14)
- [ ] Production verify: после redeploy `prisma migrate deploy` применит миграцию, `db:seed:prod` backfill'ит template'ы. Проверить `GET /api/templates` (provider/tool/outputType заполнены) + `GET /api/packaging-jobs/project/{id}` (история есть).

### Future integrations roadmap

- **Lovable API** — когда подключим, status flow `queued → running → succeeded` будет real-time для landing/pitch/one_pager типов.
- **Anthropic API** — financial / calculator_spec пойдут через Claude напрямую, текущий aiClient уже умеет.
- **Claude Design** — пока заглушка; когда появится API, ходим за PDF pitch deck'ом.
- **Async queue** — сейчас PackagingJob создаются синхронно в `generatePrompt`. Когда добавим worker, появятся реальные `queued` / `running` промежуточные состояния.
- **Multi-agent orchestration** — Landing → OnePager → PitchDeck (Web) могут идти параллельным fork'ом одного briefing'а. Это следующий sprint.

---

## Sprint 14 update — 2026-05-13 — UX polish + единая логика брифов

Theme: **Понятность интерфейса.** Никаких новых AI-фич — расставили блоки в правильном порядке, упростили перегруженные карточки, добавили mobile burger menu, привели VoiceInputButton к виду полноценной кнопки, и главное — централизовали логику «статус брифа проекта» так, чтобы CTA «Заполнить бриф» вёл не в `/projects/new`, а к нужному брифу нужного проекта.

Non-goals (фикс): без новых AI endpoints, Deepgram, OpenAI prompt changes, CRM, новых ролей, новой админки, больших refactors.

### Компоненты + lib

- **`web/src/components/ui/VoiceInputButton.tsx`** — переписан с ghost-look на чёткую ai-кнопку. Три состояния: idle (`Mic` + «Надиктовать текст»), listening (`Square` + pulsing dot + danger variant + «Слушаю…»), disabled. Размер настраивается (`sm` / `md`). Aria-pressed для accessibility. Применилось везде, где есть голосовой ввод (NewProject, ProjectBrief, AILeads, SalesAssistant).
- **`web/src/lib/briefStatus.ts`** — НОВЫЙ. Единый source-of-truth для статуса брифа: 4 состояния (`not_started` / `in_progress` / `needs_review` / `ready`), human-friendly label + longLabel, state-aware CTA («Заполнить бриф» / «Продолжить бриф» / «Открыть бриф»), completion percent 0..100, openQuestions count. Учитывает `missingByCategory` + `interviewAnswers` для расчёта прогресса. Помощник `briefStatusTone()` мапит на тон StatusBadge. `resolveBriefCtaHref()` — централизованный resolver для CTA href (с проектом / без проектов / много проектов).
- **`web/src/components/ui/PersonalManagerCard.tsx`** — добавлен `PersonalManagerMiniCard` (compact-version: имя + «на связи» + 1 строка + кнопка «Открыть»). Полная карточка осталась для `/personal-manager`.
- **`web/src/components/ui/ProjectCard.tsx`** — добавлен brief-status badge + ProgressBar (для in-progress) + state-aware CTA-кнопка прямо на карточке проекта (ведёт в бриф конкретного проекта, останавливает propagation Link).

### Layout

- **`web/src/components/layout/Sidebar.tsx`** — добавлен mobile drawer mode. Тот же набор пунктов, что и в desktop sidebar, role-based. Закрывается по клику на пункт, по клику на backdrop, по ESC (handler в `AppLayout`).
- **`web/src/components/layout/Topbar.tsx`** — добавлена burger-кнопка (`Menu` icon из lucide), видна только на `< lg`. На desktop ничего не изменилось.
- **`web/src/components/layout/AppLayout.tsx`** — drawer state живёт здесь, чтобы каждая страница автоматически получала burger menu без прокидывания пропсов. Закрывает drawer на смене маршрута + на ESC.

### Страницы

- **`web/src/pages/NewProject.tsx`** — в блоке «Контекст проекта» добавлен upload материалов. Файлы держатся в локальном state до сабмита, потом одним multipart-вызовом летят в `/api/files/{projectId}/upload` (категория `pitch`) сразу после создания проекта. CTA лейбла кнопки подстраивается: «Создать проект и загрузить N файлов» если есть pending uploads. Voice-кнопка теперь явно ai-стилизована.
- **`web/src/pages/ProjectCockpit.tsx`** — Материалы + Бизнес на салфетке подняты ВЫШЕ Project Journey. Hero показывает brief-status badge. Главная CTA-кнопка справа теперь ведёт в бриф (state-aware label), под ней — ghost-кнопка «Пересобрать бриф» (старая логика regenerate). Compact manager заменён на `PersonalManagerMiniCard`.
- **`web/src/pages/Dashboard.tsx`** — «Проекты» перенесены сразу под KPI. AI-leads-плашка и compactMini manager + Demo Cabinet ушли ниже. Каждая `ProjectCard` показывает brief-status + state-aware CTA.
- **`web/src/pages/DemoCabinet.tsx`** — раздутая карточка одного AI-лида (телефон, контекст, запись разговора) заменена на compact preview: 3 stat-плашки (Active leads / Calls / Messages) + однострочное описание + CTA «Открыть AI-лиды» → `/ai-leads`. Compact manager заменён на mini.
- **`web/src/pages/AILeads.tsx`** — CTA «Заполнить бриф» теперь state-aware: использует `getBriefStatus(selectedProject)` и меняет лейбл на «Продолжить бриф» / «Открыть бриф». Если есть проект — ведёт в бриф этого проекта; если нет — в `/projects/new`. Под кнопкой показывается brief-status badge выбранного проекта + объяснение «AI-лидогенерация станет доступна после завершения брифа».

### Duplicate brief safety

- Проверено: `prisma.projectBrief.upsert({ where: { projectId } })` в `briefService.ts` гарантирует один бриф на проект на уровне БД. Generate/regenerate всегда обновляют, никогда не создают дубль. AILeads CTA больше не ведёт на `/projects/new`, если у пользователя есть выбранный проект.

### Hygiene

- Удалены 58 stale `.js` файлов из `web/src/` (artefacts от старого `tsc -b` без `--noEmit`). `.gitignore` уже фильтровал их, но они оставались tracked с прошлых релизов.

### Verification

- [x] `( cd server && npx tsc --noEmit )` — clean
- [x] `( cd web && npx tsc --noEmit )` — clean
- [x] `npm run build` — server tsc OK, web vite build OK (417.84 kB / 117.28 kB gzip, +8 kB к Sprint 13)
- [ ] Production verify (см. финальный отчёт): открыть `/dashboard` под `demo@zapusk.tech` → проверить новый порядок блоков, brief status на ProjectCard, mobile burger в Chrome devtools mobile preview, голосовую кнопку в синем/фиолетовом виде.

### Known risks

- Если фаундер прикладывает материалы на NewProject и upload падает (сетевая ошибка после `POST /api/projects` но перед `/api/files/.../upload`) — проект всё равно создан, но без файлов. UI делает `console.warn` и продолжает переход в кокпит, где фаундер дозалит руками. Это сознательный trade-off: лучше создать проект, чем потерять весь введённый бриф из-за upload-ошибки.
- ProjectJourney «Бриф проекта» этап имеет статичный CTA «Открыть бриф» — мы не делали его state-aware (большой refactor, не входил в спринт). Brief status уже видим через ProjectCard badge и Cockpit hero badge, так что путь по платформе остаётся корректным контекстом, но не подменяет основной CTA.

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
