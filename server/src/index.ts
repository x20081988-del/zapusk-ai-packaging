import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isProd } from './env.js';
import { demoGuard } from './middleware/demoGuard.js';
import { authRoutes } from './routes/auth.js';
import { projectsRoutes } from './routes/projects.js';
import { filesRoutes } from './routes/files.js';
import { briefRoutes } from './routes/brief.js';
import { promptsRoutes } from './routes/prompts.js';
import { templatesRoutes } from './routes/templates.js';
import { exportRoutes } from './routes/exportRoute.js';
import { adminRoutes } from './routes/admin.js';
import { reviewsRoutes } from './routes/reviews.js';
import { salesAssistantRoutes } from './routes/salesAssistant.js';
import { salesSessionsRoutes } from './routes/salesSessions.js';
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

app.get('/health', (_req, res) => res.json({
  ok: true,
  ts: Date.now(),
  demo: env.DEMO_MODE,
  env: env.NODE_ENV,
  spaReady: Boolean(webDistPath),
  spaPath: webDistPath,
}));

app.use('/uploads', express.static(path.resolve(env.UPLOADS_DIR)));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/brief', briefRoutes);
app.use('/api/prompts', promptsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/projects', exportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/sales-assistant', salesAssistantRoutes);
app.use('/api/sales-sessions', salesSessionsRoutes);
app.use('/api/ai-leads', aiLeadsRoutes);

// 404 fallback for /api/* — keeps the SPA fallback below from masking API misses.
app.use('/api', (_req, res) => res.status(404).json({ error: 'route_not_found' }));

// Serve SPA whenever a built dist is available — independent of NODE_ENV so
// `npm start` works the same locally and on hosts that don't set NODE_ENV.
if (webDistPath) {
  app.use(express.static(webDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path === '/health') return next();
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
