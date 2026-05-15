import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isProd } from './env.js';
import { demoGuard } from './middleware/demoGuard.js';
import { authedAndActive } from './middleware/workspaceAccess.js';
import { authRoutes } from './routes/auth.js';
import { projectsRoutes } from './routes/projects.js';
import { filesRoutes } from './routes/files.js';
import { briefRoutes } from './routes/brief.js';
import { promptsRoutes } from './routes/prompts.js';
import { packagingJobsRoutes } from './routes/packagingJobs.js';
import { templatesRoutes } from './routes/templates.js';
import { exportRoutes } from './routes/exportRoute.js';
import { adminRoutes } from './routes/admin.js';
import { reviewsRoutes } from './routes/reviews.js';
import { salesAssistantRoutes } from './routes/salesAssistant.js';
import { salesSessionsRoutes } from './routes/salesSessions.js';
import { conversationAnalysisRoutes } from './routes/conversationAnalysis.js';
import { aiLeadsRoutes } from './routes/aiLeads.js';
import { managerRoutes } from './routes/manager.js';

const app = express();

// CORS: in single-service prod the SPA is served from the same origin and CORS
// never fires. Keep configurable for split deploys. `*` mirrors origin without
// credentials; any explicit URL turns credentials on.
const corsOpts = !env.CORS_ORIGIN || env.CORS_ORIGIN === '*'
  ? { origin: true, credentials: false }
  : { origin: env.CORS_ORIGIN, credentials: true };
app.use(cors(corsOpts));
app.use(express.json({ limit: '5mb' }));

// Lock destructive ops behind DEMO_MODE before any route runs.
app.use('/api', demoGuard);

// ── Resolve the compiled SPA path with multiple fallbacks. ──────────────────
// Different hosts and cwd setups place the repo differently; the static dist
// might be either two or three levels above the running file, or under cwd.
// We try every reasonable candidate and pick the first that actually exists.
const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  env.WEB_DIST_DIR,                                  // explicit override (absolute or relative)
  path.resolve(here, env.WEB_DIST_DIR),              // relative to running dist/index.js
  path.resolve(here, '../../web/dist'),              // server/dist/index.js → repo/web/dist
  path.resolve(here, '../../../web/dist'),           // alt layouts (Render src/ root)
  path.resolve(process.cwd(), 'web/dist'),           // cwd is repo root
  path.resolve(process.cwd(), '../web/dist'),        // cwd is server/
];
const webDistPath = candidates.find((p): p is string => Boolean(p) && fs.existsSync(path.join(p, 'index.html'))) ?? null;

app.get('/health', (_req, res) => {
  // Sprint 17: integrations booleans — `curl /health | jq '.integrations'`
  // показывает ops какие реальные provider'ы сконфигурированы, без секретов.
  const openaiConfigured = Boolean(env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 10);
  const anthropicConfigured = Boolean(env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.length > 10);
  const deepgramConfigured = Boolean(env.DEEPGRAM_API_KEY && env.DEEPGRAM_API_KEY.length > 10);
  const lovableConfigured = Boolean(env.LOVABLE_API_KEY && env.LOVABLE_API_KEY.length > 6 && env.LOVABLE_API_BASE_URL);

  // Sprint 30 — disk usage статистика. fs.statfsSync доступен с Node 18.15+,
  // на Render Node 22 — ок. Если path не существует (локальный dev без mount)
  // — возвращаем null, не валим health.
  let disk: { mountPath: string; freeBytes: number; totalBytes: number; usedPercent: number } | null = null;
  try {
    const mountPath = path.dirname(path.resolve((process.env.DATABASE_URL ?? 'file:./prod.db').replace(/^file:/, '')));
    const stats = fs.statfsSync(mountPath);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const usedPercent = totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 0;
    disk = { mountPath, freeBytes, totalBytes, usedPercent };
  } catch {
    disk = null;
  }

  res.json({
    ok: true,
    ts: Date.now(),
    demo: env.DEMO_MODE,
    env: env.NODE_ENV,
    spaReady: Boolean(webDistPath),
    spaPath: webDistPath,
    disk,
    // Legacy ai block — оставляем для обратной совместимости c существующими
    // диагностическими скриптами (см. Sprint 11.1 hotfix).
    ai: {
      provider: env.AI_PROVIDER,
      openaiKeyConfigured: openaiConfigured,
      anthropicKeyConfigured: anthropicConfigured,
      openaiModelMain: env.OPENAI_MODEL_MAIN,
    },
    // Sprint 17: новый блок — все 4 интеграции одним взглядом.
    integrations: {
      openai: openaiConfigured,
      anthropic: anthropicConfigured,
      deepgram: deepgramConfigured,
      lovable: lovableConfigured,
    },
  });
});

// Sprint 36 P0.1 — публичная раздача /uploads закрыта. Раньше любой человек с
// URL мог скачать презентации, финмодели, записи разговоров и брифы клиентов.
// Теперь файлы отдаёт только защищённый endpoint
// `GET /api/files/:projectId/:fileId/download` (см. routes/files.ts) с проверкой
// project ownership и роли пользователя.

app.use('/api/auth', authRoutes);

// Sprint 22 — invite-only architecture. Любой /api endpoint кроме /api/auth/*
// требует аутентификации И активного workspace. /api/auth/* зарегистрирован
// выше и отвечает первым — этот middleware его не задевает (порядок матчинга
// Express'а).
app.use('/api', authedAndActive);

app.use('/api/projects', projectsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/brief', briefRoutes);
app.use('/api/prompts', promptsRoutes);
app.use('/api/packaging-jobs', packagingJobsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/projects', exportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/sales-assistant', salesAssistantRoutes);
app.use('/api/sales-sessions', salesSessionsRoutes);
app.use('/api/conversation-analysis', conversationAnalysisRoutes);
app.use('/api/ai-leads', aiLeadsRoutes);

// 404 fallback for /api/* — keeps the SPA fallback below from masking API misses.
app.use('/api', (_req, res) => res.status(404).json({ error: 'route_not_found' }));

// Serve SPA whenever a built dist is available — independent of NODE_ENV so
// `npm start` works the same locally and on hosts that don't set NODE_ENV.
if (webDistPath) {
  app.use(express.static(webDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

app.listen(env.PORT, () => {
  console.log(`[zapusk-api] listening on port ${env.PORT}`);
  console.log(`[zapusk-api] env=${env.NODE_ENV} · isProd=${isProd} · demo=${env.DEMO_MODE} · ai=${env.AI_PROVIDER}`);
  console.log(`[zapusk-api] cwd=${process.cwd()}`);
  console.log(`[zapusk-api] running file dir=${here}`);
  if (webDistPath) {
    console.log(`[zapusk-api] serving SPA from ${webDistPath}`);
  } else {
    console.warn('[zapusk-api] WEB DIST NOT FOUND — SPA will return 404. Checked candidates:');
    for (const c of candidates) console.warn(`  - ${c} (${c && fs.existsSync(c) ? 'exists but no index.html' : 'missing'})`);
    console.warn('[zapusk-api] fix: ensure `npm run build` produced web/dist with index.html');
  }
});
