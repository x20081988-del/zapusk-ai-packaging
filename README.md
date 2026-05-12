# Zapusk AI Packaging — MVP

Investment-packaging cockpit for Zapusk.tech. Takes a project from raw materials → AI brief → "business on a napkin" → structured packaging → ready-to-use prompts for Lovable, Cloud Design, financial-model LLM and Sales GPT.

This is a **working vertical slice**, not a marketing demo. The architecture supports future direct integrations (Lovable, Cloud Design, Canva, Directual, Zapusk platform), versioning, S3-backed storage, team reviews and feedback-driven regeneration.

## Stack

- **Frontend** — React 18 + TypeScript + Vite + Tailwind CSS (Montserrat, dark cockpit design tokens, react-router v6, lucide-react)
- **Backend** — Node.js + Express + TypeScript (ESM, `tsx watch`)
- **DB** — SQLite via Prisma (swap `DATABASE_URL` for Postgres in prod — schema is compatible)
- **AI layer** — `@anthropic-ai/sdk` or `openai` SDK, with deterministic mock fallback if no key
- **File parsing** — `pdf-parse`, `mammoth`, `xlsx` — PDF/DOCX/XLSX/TXT are extracted into AI context
- **Storage** — local filesystem (`/server/uploads`), abstracted behind a single-method interface so S3 drops in later
- **ZIP export** — `archiver`

## Project layout

```
zapusk-ai-packaging/
├── README.md · CLAUDE.md · AGENTS.md · TASKS.md   AI-ready repo docs
├── .env.example
├── server/
│   ├── prisma/schema.prisma     11 entities (Project, Brief, ArtefactReview, …)
│   ├── src/
│   │   ├── index.ts             Express app
│   │   ├── env.ts · db.ts · auth.ts
│   │   ├── ai/                  client + mock + system prompts
│   │   ├── services/            briefService, promptBuilders, packageService, fileParser, storage, demoSeeds, templateSeeds
│   │   ├── routes/              auth, projects, files, brief, prompts, templates, exportRoute, admin, reviews
│   │   └── integrations/        Lovable / CloudDesign / Canva / Directual / ZapuskPlatform (placeholders)
│   └── seed.ts                  4 demo projects (Венский ветер · Tappsk Pro · Apart-отель Чарыш · Кофе с собой)
└── web/
    ├── tailwind.config.ts       design tokens (canvas, surface, zapusk, ai, semantic)
    ├── src/
    │   ├── App.tsx · main.tsx · index.css
    │   ├── lib/                 api, auth, format, progress, promptKinds, reviews
    │   ├── components/
    │   │   ├── layout/          AppLayout · Sidebar · Topbar
    │   │   └── ui/              Button · Card · Input · UploadZone · ProgressBar · StatusBadge · StepCard · ProjectCard · AIQuestionCard · GeneratedAssetCard · TemplateCard · DocumentCard · ReviewBlock · RegenerateModal · MissingDataPanel · Modal · EmptyState · Logo
    │   └── pages/               Login · Dashboard · NewProject · ProjectCockpit · ProjectBrief · ProjectUpload · ProjectInterview · ProjectPackaging · ProjectPrompts · ProjectDocuments · ProjectReview · Templates · Guide · AdminProjects
```

## Quick start

```bash
# 1. Install (root + server + web)
npm run install:all

# 2. Env (copy template; fill ANTHROPIC_API_KEY / OPENAI_API_KEY if you have them)
cp .env.example server/.env

# 3. Database — migrate and seed (templates + 4 demo projects)
npm run db:migrate
npm run db:seed

# 4. Run both servers in parallel
npm run dev
#   API   → http://localhost:4000
#   Web   → http://localhost:5173
```

Log in with any email (MVP single-user dev mode). Open the seeded demo "Венский ветер" — it loads with brief, 10 generated prompts, and is ready for Review.

## Core commands

| Command                       | What it does                                     |
|------------------------------ |--------------------------------------------------|
| `npm run install:all`         | Install root + server + web in one shot          |
| `npm run dev`                 | Start API and web concurrently                   |
| `npm run dev:server`          | API only                                         |
| `npm run dev:web`             | Web only                                         |
| `npm run build`               | Compile server (`tsc`) and build web (`vite`)    |
| `npm run db:migrate`          | Apply Prisma migrations                          |
| `npm run db:seed`             | Upsert templates + demo projects (idempotent)    |
| `npm run db:reset`            | Wipe and re-apply migrations                     |

## What works end-to-end

| Feature                                          | Status                            |
|--------------------------------------------------|-----------------------------------|
| Login (mock auth via `x-user-email`)             | ✅                                 |
| Dashboard + project cards with progress          | ✅                                 |
| Create project (11-field form)                   | ✅                                 |
| Project Cockpit                                  | ✅                                 |
| File upload (PDF/DOCX/XLSX/TXT extracted to AI)  | ✅                                 |
| External link materials (Google Docs / Notion)   | ✅                                 |
| AI Brief → napkin (mock fallback if no AI key)   | ✅                                 |
| Generate Full Packaging (brief + 10 prompts)     | ✅                                 |
| 10 prompt builders (Zapusk methodology)          | ✅                                 |
| Regenerate with feedback                         | ✅                                 |
| Artefact reviews (1–5 · comment · approved/rework) | ✅                               |
| Packaging Quality Score                          | ✅                                 |
| Missing data by 6 categories                     | ✅                                 |
| Versioning of artefacts                          | ✅                                 |
| ZIP export (15 files + JSON + README)            | ✅                                 |
| JSON export `/api/projects/:id/export`           | ✅                                 |
| Internal user guide `/guide`                     | ✅                                 |
| AI Leads MVP `/ai-leads`                         | ✅ mock provider + briefing lock   |
| 4 seeded demo projects                           | ✅                                 |
| AI Interview answer persistence                  | 🟡 UI only, no save to brief      |
| Templates CRUD                                   | 🟡 list + edit body, no create    |
| S3 storage                                       | 🟡 interface ready, impl pending  |
| Real Lovable / CloudDesign / Canva integrations  | 🟡 placeholder returns `not_implemented` |

## AI layer

`server/src/ai/client.ts` is the backend AI gateway. Services call `aiClient.generate()`, `aiClient.generateJson()` or the backward-compatible `aiComplete()` wrapper; routes and business services do not talk to the OpenAI SDK directly.

Provider is selected with `AI_PROVIDER` (`openai` / `anthropic` / `mock`). OpenAI uses the Responses API by default and falls back to one isolated legacy chat-completions adapter only if the installed SDK runtime does not expose `responses.create`. If a real provider is selected but the key is missing, the model is unavailable, quota is exhausted, or another provider error happens, the gateway logs a safe error code and returns the deterministic mock fallback so the product stays usable.

Model routing:

- `OPENAI_MODEL_MAIN` — investment packaging, brief generation/regeneration, reviews/regenerate flows, strategy/narrative, sales assistant analysis.
- `OPENAI_MODEL_FAST` — summaries, classifications, metadata extraction, small cleanup tasks.
- `OPENAI_MODEL_REALTIME` — reserved for future realtime audio streaming abstraction; not used by the current UI.

JSON flows use strict parsing in services; Sales Assistant additionally asks OpenAI for a structured `json_schema` response. When `AI_LOG_USAGE=true`, logs include provider, feature, model, latency, token counts if available, estimated cost as `null` when not available, success/failure and safe error code. Prompts, project data and API keys are not logged.

Production checks:

```bash
# Mock rollback: no external AI calls, endpoints should keep working.
AI_PROVIDER=mock npm start

# OpenAI production: server-side secrets only.
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL_MAIN=gpt-5.5
OPENAI_MODEL_FAST=gpt-4o-mini
OPENAI_MODEL_REALTIME=gpt-4o-realtime-preview
AI_LOG_USAGE=true
```

If Render logs show `http_401`, check the API key. If they show `http_403` or `http_429`, check model access, billing/quota and rate limits. If the selected model is unavailable, the gateway logs the model name and safe error code, then returns mock fallback rather than failing silently.

### Sales Assistant API

`POST /api/sales-assistant/analyze` is a manual live-coach refresh endpoint. The web app sends the accumulated meeting `transcript`, `recentContext`, optional `previousAdvice`, optional `previousSpinStage`, optional `adviceHistory`, and optional `projectId`. The response returns a structured card with `situation`, `risk`, `recommendation`, `suggestedPhrase`, `spinStage`, `tone`, `confidence`, `objection`, `nextStep`, plus `provider`, `model` and `fellBackToMock` so the UI can show OpenAI vs Mock honestly.

## AI Leads MVP

`/ai-leads` is the demo/MVP flow for investor lead generation. It has:

- AI briefing analyzer: reads current project/brief/files, computes readiness, shows auto-filled fields and missing data.
- Launch lock: AI lead generation is disabled until critical briefing fields are ready.
- Mock lead feed: hot investor cards with status, check range, contact, AI summary, conversation context, mock audio player and communication timeline.
- Lead guarantee card: frames the offer as a minimum number of target leads with replacement rules, without promising investment or yield.

Backend endpoint: `GET /api/ai-leads?projectId=<id>`. The route uses `server/src/services/aiLeadsService.ts`, where the current mock `LeadProvider` plus `AICommunicationProvider`, `TranscriptProvider` and replacement-policy interfaces are isolated for future AIcallsCloud / Telegram / WhatsApp / Avito / CRM providers.

## Публичный демо-деплой

Зачем: один URL, на который команда даёт ссылку клиентам, инвесторам, акселератору. Каждый посетитель видит работающий продукт с 4 seed-проектами и может создавать свои.

### Архитектура деплоя

**Single-service**: один Node-процесс отдаёт и API (`/api/*`), и собранную SPA (`web/dist`). Один публичный URL → CORS не фигурирует → не нужен отдельный FE-хост. SQLite живёт на persistent disk вместе с `uploads/`.

```
┌────────────────────────────────────────────┐
│  Public URL (https://...onrender.com)      │
│                                            │
│  Express :PORT                             │
│    ├── /api/*       routes                 │
│    ├── /uploads/*   static files           │
│    └── /*           SPA fallback (web/dist)│
│                                            │
│  /data (persistent disk)                   │
│    ├── prod.db      SQLite                 │
│    └── uploads/     materials              │
└────────────────────────────────────────────┘
```

Почему не Vercel/Netlify + отдельный API: для демо это лишняя сложность (split deploy, CORS, два URL, две панели секретов). Single-service на Render / Railway / Fly закрывает 100% потребностей демо за один blueprint.

### Render (готовый blueprint)

В корне репозитория лежит [`render.yaml`](render.yaml). На Render:

1. Push репо в GitHub.
2. New → **Blueprint** → подключите репо. Render прочитает `render.yaml` и создаст web-сервис с persistent disk на `/data`.
3. Убедитесь, что сервис использует Node `22.22.0` (`NODE_VERSION=22.22.0` уже задан в blueprint).
4. В разделе **Environment** вашего нового сервиса задайте секреты:
   - `OPENAI_API_KEY` или `ANTHROPIC_API_KEY` (опционально — без них работает mock-режим)
   - `AI_PROVIDER` = `openai` / `anthropic` / `mock`
   - для OpenAI: `OPENAI_MODEL_MAIN`, `OPENAI_MODEL_FAST`, `OPENAI_MODEL_REALTIME`, `AI_LOG_USAGE`
5. Дождитесь первого деплоя (~5 мин). Откройте URL вида `https://zapusk-demo.onrender.com`.

**Точные команды для Render (если создаёте сервис вручную, без blueprint):**

| Поле | Значение |
|------|----------|
| Runtime | `Node` |
| Root Directory | пусто / repo root |
| Node Version | `22.22.0` |
| Build Command | `npm run install:all && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Disk → Mount Path | `/data` (Size: 1 GB) |

> ⚠️ **Важная ловушка NODE_ENV на Render.** Render автоматически выставляет `NODE_ENV=production` для всех Node-сервисов. С `NODE_ENV=production` `npm install` пропускает `devDependencies` (а у нас `prisma`, `vite`, `typescript` — это devDeps). Поэтому скрипт `install:all` явно использует `--include=dev` для всех трёх workspace'ов — Render устанавливает всё, что нужно для сборки. Если используете другой Build Command, тоже добавляйте `--include=dev`.

> ⚠️ **Важная ловушка Node runtime.** Проект закреплён на Node `22.22.0` через `package.json`, `.node-version` и `render.yaml`. Не поднимайте публичный demo-service на Node 24: с текущим Prisma 5.22 локально воспроизводится падение `prisma migrate deploy` на свежей SQLite-базе.

**Проверка деплоя.** После старта зайдите на `https://<your-url>/health` — ответ должен содержать `"ok": true`, `"spaReady": true` и путь `spaPath` к собранному `web/dist`. Если `spaReady: false` — посмотрите в логи Render (там `[zapusk-api]` строки с проверенными кандидатами). Если `/`, `/health` и любые SPA routes возвращают 404 с заголовком `x-render-routing: no-server`, запрос не дошёл до Express: проверьте, что сервис `zapusk-demo` существует, не удалён/не suspended, привязан к этому домену и был redeploy после push.

Free tier засыпает после 15 минут простоя — первая загрузка после паузы занимает 30–60 секунд. Для активного демо берите Starter ($7/мес).

### Альтернативы (один и тот же контракт ENV)

- **Railway** — Project → Deploy from GitHub. Build: `npm run install:all && npm run build`. Start: `npm start`. Добавьте Volume на `/data`.
- **Fly.io** — `fly launch` → выбрать Node, добавить Volume `fly volumes create zapusk_data --size 1`. ENV через `fly secrets set`.
- **Self-host (VPS)** — `git pull && npm run install:all && npm run build && pm2 start --name zapusk "npm start"`. Nginx reverse-proxy на порт сервиса.

### Production-like запуск локально

```bash
# 1. Установить env для production
cp .env.example server/.env
# В server/.env поставьте:
#   NODE_ENV=production
#   DEMO_MODE=true
#   DATABASE_URL="file:./prod.db"
#   PORT=4000

# 2. Сборка
npm run install:all
npm run build

# 3. Старт (apply migrations → seed → запуск)
npm start
# → http://localhost:4000  (API и SPA на одном порту)
```

### Обязательные переменные окружения

| Переменная        | Назначение                                                              | Пример (production)            |
|-------------------|-------------------------------------------------------------------------|--------------------------------|
| `NODE_VERSION`    | Версия Node runtime для Render. Закреплена на LTS из-за Prisma/SQLite.  | `22.22.0`                      |
| `PORT`            | Слушаемый порт. На облачных хостингах задаёт сама платформа.            | `10000` (Render)               |
| `NODE_ENV`        | `production` включает раздачу SPA из `web/dist`.                        | `production`                   |
| `DATABASE_URL`    | Путь к SQLite на persistent disk (или Postgres URL).                    | `file:/data/prod.db`           |
| `UPLOADS_DIR`     | Папка для загруженных файлов (тоже на persistent disk).                 | `/data/uploads`                |
| `DEMO_MODE`       | `true` блокирует DELETE и редактирование шаблонов для публичного демо.  | `true`                         |
| `CORS_ORIGIN`     | Не используется в single-service. Для split-deploy — URL фронта.        | `*`                            |
| `AI_PROVIDER`     | `openai` / `anthropic` / `mock`. По умолчанию `mock`.                   | `openai`                       |
| `OPENAI_API_KEY`  | OpenAI ключ. **Только на сервере**, никогда не в FE и логах.             | секрет                         |
| `OPENAI_MODEL_MAIN` | Основная модель для брифов, packaging, regenerate/review, sales analysis. | `gpt-5.5`                    |
| `OPENAI_MODEL_FAST` | Быстрая модель для summaries/classifications/metadata.                 | `gpt-4o-mini`                  |
| `OPENAI_MODEL_REALTIME` | Модель для будущего realtime audio streaming. Сейчас только env/abstraction. | `gpt-4o-realtime-preview` |
| `AI_LOG_USAGE`    | Безопасные usage-логи без prompt/API key: provider, feature, model, latency, tokens, error code. | `true` |
| `ANTHROPIC_API_KEY` | Альтернативный Anthropic ключ, если `AI_PROVIDER=anthropic`.            | секрет                         |
| `DEV_USER_EMAIL` / `DEV_USER_NAME`     | Имя пользователя по умолчанию для всех гостей демо.    | `demo@zapusk.tech`             |
| `VITE_API_BASE_URL` (build-time)       | Пустая строка → same-origin. Для split-deploy — URL API.| `` (empty)                    |

### Безопасность демо

`DEMO_MODE=true` блокирует на уровне middleware:

- любой `DELETE /api/*` (нельзя удалить чужой проект / файл / ревью / шаблон)
- `POST /api/templates` и `PATCH /api/templates/:id` (общая библиотека, защищена от правок)

Всё остальное работает: создание проектов, загрузка файлов, генерация, ревью, регенерация с feedback, ZIP-экспорт, AI-ассистент на продажах.

**Что важно НЕ делать:**

- Не комитить `.env` с реальными ключами — они должны жить только в секретах хостинга.
- Не выставлять `/admin/projects` в навигацию по умолчанию. В client-mode (default) пункт скрыт, но URL всё ещё открыт. Это by-design для демо; для настоящего production добавьте server-side guard.

### Переход на настоящий production

Когда демо превращается в продукт:

1. **Postgres вместо SQLite** — поменять `provider = "postgresql"` в `prisma/schema.prisma` и `DATABASE_URL` на managed Postgres (Neon / Supabase / Render Postgres).
2. **S3/R2 вместо локального диска** — заменить `server/src/services/storage.ts` (одна реализация интерфейса).
3. **Реальная auth** — заменить middleware `auth.ts` на SSO / JWT, добавить роли (client/team/admin), убрать `DEV_USER_EMAIL` fallback.
4. **Server-side guard** на team-only маршруты (`/admin`, `/templates`, опционально `/sales-assistant`).
5. **Постоянный AI-провайдер** — `AI_PROVIDER=openai` + `OPENAI_API_KEY` и OpenAI model env в секретах. Мониторинг usage через Render Logs.
6. **CDN перед SPA** — Cloudflare / Fastly. Express отдаёт только `/api`.

## AI-ready repo

This repo is set up for multi-agent AI development. See:

- [CLAUDE.md](CLAUDE.md) — operating rules for Claude Code working on this repo
- [AGENTS.md](AGENTS.md) — context, architecture, conventions for any AI agent
- [TASKS.md](TASKS.md) — task tracker, current sprint, known issues, next sprint
