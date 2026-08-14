import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isProd, aiProviderStatus, assertAiProviderOnStartup } from './env.js';
import { buildDiskReport, fmtBytes, LOW_DISK_THRESHOLD_PERCENT } from './lib/diskInspector.js';
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
import { investorApplicationsRoutes } from './routes/investorApplications.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { initKnowledgeFts } from './services/knowledgeFts.js';
import { assistantOutcomesRoutes } from './routes/assistantOutcomes.js';
import { assistantLearningRoutes } from './routes/assistantLearning.js';
import { managerRoutes } from './routes/manager.js';
import { aiReliabilityRoutes } from './routes/aiReliability.js';
import { realtimeRoutes } from './routes/realtime.js';
import { decideRoutes } from './routes/decide.js';
import { reportsRoutes } from './routes/reports.js';
import { crmRoutes } from './routes/crm.js';
import { crmwebRoutes } from './routes/crmweb.js';

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

// Sprint 50 P1.1 — public /health surface is intentionally minimal.
//
// Render's healthcheck reads this and only needs HTTP 200. Public callers
// (status pages, the prod-smoke script) still need to verify the AI
// provider didn't drift to mock, so `ai.provider`, `ai.realProviderEnabled`
// and `ai.warning` stay public. Everything else — disk usage, file paths,
// model names, integration matrix — moves to /api/admin/health/details
// behind SUPER_ADMIN / ADMIN / MANAGER (see routes/admin.ts).
//
// What we removed from the public surface:
//   spaPath, disk.mountPath/sizes, openaiModelMain, integrations matrix.
// These don't help any legitimate public caller and they do help an
// attacker fingerprint the deploy.
app.get('/health', (_req, res) => {
  const status = aiProviderStatus();
  res.json({
    ok: true,
    ts: Date.now(),
    env: env.NODE_ENV,
    ai: {
      provider: status.provider,
      realProviderEnabled: status.realProviderEnabled,
      warning: status.warning,
      warningSeverity: status.warningSeverity,
    },
  });
});

// Detailed health is mounted on adminRoutes (see routes/admin.ts) so it
// inherits the auth + role gate.

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
// Sprint 62.P11 — investor crowdinvesting applications (POST allowed for
// INVESTOR + demo; GET list for team/founder).
app.use('/api/investor-applications', investorApplicationsRoutes);
// Sprint 38 — Knowledge Base. AI-ассистент использует KB для retrieval,
// admin/manager управляют source'ами через REST.
app.use('/api/knowledge', knowledgeRoutes);
// Sprint 43 — AssistantOutcomeEvent CRUD (фиксация результата встречи).
app.use('/api/assistant-outcomes', assistantOutcomesRoutes);
// Sprint 44 — Learning Dashboard (manager/admin global analytics).
app.use('/api/assistant-learning', assistantLearningRoutes);
// Sprint 48 — AI reliability ledger/dashboard.
app.use('/api/ai-reliability', aiReliabilityRoutes);
// Sprint 49 — OpenAI Realtime ephemeral session bootstrap для WebRTC live
// транскрипции в браузере. Основной OPENAI_API_KEY никогда не уходит клиенту.
app.use('/api/realtime', realtimeRoutes);
// Sprint 63.P1 — очередь решений владельца. Прокси к decide_bridge в telegram-agent;
// источник правды остаётся там, в Prisma ничего не дублируется. SUPER_ADMIN only.
app.use('/api/decide', decideRoutes);
// Sprint 63.P3 - отчеты, которые раньше приходили в телеграм-бота. Тот же мост,
// тот же гейт SUPER_ADMIN, обобщенный маршрут /api/reports/:name.
app.use('/api/reports', reportsRoutes);
// Sprint 63.P12 - CRM владельца (founder_crm) в кабинете. Тот же мост, источник
// правды в telegram-agent, в Prisma ничего не дублируется. SUPER_ADMIN only.
app.use('/api/crm', crmRoutes);
// Sprint 63.P13 - CRM целиком: /pm, канбан карточек, воронки сделок (crm_web
// через мост /crmweb/*). SUPER_ADMIN only.
app.use('/api/crmweb', crmwebRoutes);

// 404 fallback for /api/* — keeps the SPA fallback below from masking API misses.
app.use('/api', (_req, res) => res.status(404).json({ error: 'route_not_found' }));

// Sprint 45B — hard 404 for legacy/public uploads paths. Without this,
// /uploads/* falls through to the SPA fallback and returns index.html. That is
// not a file leak, but a clear 404 is safer and easier to smoke-test.
app.use('/uploads', (_req, res) => res.status(404).json({ error: 'uploads_disabled' }));

// Serve SPA whenever a built dist is available — independent of NODE_ENV so
// `npm start` works the same locally and on hosts that don't set NODE_ENV.
if (webDistPath) {
  app.use(express.static(webDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// Sprint 49 hotfix 11 — optional fail-fast on prod misconfiguration. Always
// logs the warning; only exits the process when ENFORCE_REAL_AI_PROVIDER=true.
// Runs before app.listen so a refused boot doesn't bind the port.
assertAiProviderOnStartup();

app.listen(env.PORT, () => {
  console.log(`[zapusk-api] listening on port ${env.PORT}`);
  console.log(`[zapusk-api] env=${env.NODE_ENV} · isProd=${isProd} · demo=${env.DEMO_MODE} · ai=${env.AI_PROVIDER}`);
  console.log(`[zapusk-api] cwd=${process.cwd()}`);
  console.log(`[zapusk-api] running file dir=${here}`);

  // Sprint 62.P4 — boot-time disk warning. Loud-fail on low /var/data
  // so the founder sees it in Render Logs before the next ENOSPC crash
  // (e.g. the 2026-05-26 incident). Non-fatal — boot continues.
  try {
    const report = buildDiskReport();
    if (report.disk) {
      const d = report.disk;
      const sn = report.snapshots;
      const upl = report.uploads;
      console.log(
        `[disk] mount=${d.mountPath} total=${fmtBytes(d.totalBytes)} ` +
        `used=${fmtBytes(d.usedBytes)} (${d.usedPercent}%) ` +
        `free=${fmtBytes(d.freeBytes)} (${d.freePercent}%) · ` +
        `db=${fmtBytes(report.dbSizeBytes)} · ` +
        `snapshots=${sn.count} (${fmtBytes(sn.totalBytes)})` +
        (upl ? ` · uploads=${upl.fileCount} files (${fmtBytes(upl.totalBytes)})` : ''),
      );
      if (d.low) {
        console.warn(
          `[disk] WARNING: low disk space on ${d.mountPath} — ${d.freePercent}% free ` +
          `(threshold ${LOW_DISK_THRESHOLD_PERCENT}%). ` +
          `Run \`npm run maintenance:disk\` or rm /var/data/snapshots/*.db via Render Shell. ` +
          `GET /api/admin/system/disk for full report.`,
        );
      }
      for (const w of report.warnings) {
        console.warn(`[disk] ${w}`);
      }
    } else {
      console.log('[disk] inspection skipped (mount not available — local dev?)');
    }
  } catch (err) {
    // Disk check must never crash boot.
    console.warn('[disk] boot inspection failed:', err instanceof Error ? err.message : err);
  }

  // Sprint 41 P0.1 — FTS5 lazy init. Не блокирует listen() — fire-and-forget.
  // Если FTS не работает (compile-time disabled или CREATE упал) — keyword
  // retrieval продолжает работать как раньше.
  initKnowledgeFts().catch((err) => console.warn('[knowledge-fts] startup init crashed', err));
  if (webDistPath) {
    console.log(`[zapusk-api] serving SPA from ${webDistPath}`);
  } else {
    console.warn('[zapusk-api] WEB DIST NOT FOUND — SPA will return 404. Checked candidates:');
    for (const c of candidates) console.warn(`  - ${c} (${c && fs.existsSync(c) ? 'exists but no index.html' : 'missing'})`);
    console.warn('[zapusk-api] fix: ensure `npm run build` produced web/dist with index.html');
  }
});
