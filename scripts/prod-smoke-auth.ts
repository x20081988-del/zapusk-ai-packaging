type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FOUNDER' | 'INVESTOR';

const BASE_URL = process.env.ZAPUSK_SMOKE_BASE_URL ?? 'https://zapusk-ai.tech';
const TOKENS: Partial<Record<RoleName, string>> = {
  SUPER_ADMIN: process.env.ZAPUSK_SUPER_ADMIN_TOKEN,
  ADMIN: process.env.ZAPUSK_ADMIN_TOKEN,
  MANAGER: process.env.ZAPUSK_MANAGER_TOKEN,
  FOUNDER: process.env.ZAPUSK_FOUNDER_TOKEN,
  INVESTOR: process.env.ZAPUSK_INVESTOR_TOKEN,
};

const SMOKE_PROJECT_ID = process.env.ZAPUSK_SMOKE_PROJECT_ID;
const FOREIGN_OUTCOME_ID = process.env.ZAPUSK_FOREIGN_OUTCOME_ID;
const OWN_PROJECT_ID = process.env.ZAPUSK_FOUNDER_PROJECT_ID;
const WAIT_EXPIRED = /^(1|true|yes)$/i.test(process.env.ZAPUSK_SMOKE_WAIT_EXPIRED ?? '');

interface CheckResult {
  name: string;
  ok: boolean;
  status?: number;
  detail?: string;
}

interface ProjectRow {
  id: string;
  name?: string;
  userId?: string;
}

interface OutcomeRow {
  id: string;
  projectId: string | null;
  outcomeType: string;
  archivedAt?: string | null;
}

const results: CheckResult[] = [];

function token(role: RoleName): string {
  const value = TOKENS[role];
  if (!value) throw new Error(`Missing env token for ${role}`);
  return value;
}

function decodeJwtPayload(tokenValue: string): Record<string, unknown> {
  const body = tokenValue.split('.')[1] ?? '';
  const padded = body.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (body.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, init);
}

async function authed(role: RoleName, path: string, init: RequestInit = {}): Promise<Response> {
  return request(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token(role)}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
}

async function check(name: string, fn: () => Promise<{ ok: boolean; status?: number; detail?: string }>) {
  try {
    const r = await fn();
    results.push({ name, ...r });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

function hasForbiddenCsvText(csv: string): boolean {
  return /note|transcript|prompt|chunk text|chunkText|redactedText|SECRET_NOTE|SECRET_CHUNK/i.test(csv);
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON, got ${res.status}: ${text.slice(0, 300)}`);
  }
}

async function ensureRoleTokens() {
  if (!TOKENS.SUPER_ADMIN) return;
  for (const role of ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FOUNDER', 'INVESTOR'] as const) {
    if (TOKENS[role]) continue;
    const res = await authed('SUPER_ADMIN', '/api/admin/smoke-token', {
      method: 'POST',
      body: JSON.stringify({ role, ttlMinutes: 15 }),
    });
    if (!res.ok) throw new Error(`Cannot mint ${role} smoke token: ${res.status} ${await res.text()}`);
    const payload = await json<{ token: string; smoke: boolean; expiresAt: string }>(res);
    TOKENS[role] = payload.token;
  }
}

async function getAdminProjects(): Promise<ProjectRow[]> {
  const res = await authed('ADMIN', '/api/admin/projects');
  if (!res.ok) throw new Error(`admin projects failed: ${res.status} ${await res.text()}`);
  const payload = await json<{ projects: ProjectRow[] }>(res);
  return payload.projects ?? [];
}

async function getFounderProjects(): Promise<ProjectRow[]> {
  const res = await authed('FOUNDER', '/api/projects');
  if (!res.ok) throw new Error(`founder projects failed: ${res.status} ${await res.text()}`);
  const payload = await json<{ projects: ProjectRow[] }>(res);
  return payload.projects ?? [];
}

async function pickSmokeProjectId(founderProjectIds: Set<string>): Promise<string | null> {
  if (SMOKE_PROJECT_ID) return SMOKE_PROJECT_ID;
  const projects = await getAdminProjects();
  return projects.find((p) => !founderProjectIds.has(p.id))?.id ?? projects[0]?.id ?? null;
}

async function createSmokeOutcome(role: RoleName, projectId: string): Promise<OutcomeRow> {
  const res = await authed(role, '/api/assistant-outcomes', {
    method: 'POST',
    body: JSON.stringify({
      projectId,
      investorName: `Smoke QA ${role} ${Date.now()}`,
      outcomeType: 'no_decision',
      probabilityAfter: 5,
      valueRub: 1,
      note: 'smoke qa temporary archived outcome',
    }),
  });
  if (!res.ok) throw new Error(`create outcome as ${role} failed: ${res.status} ${await res.text()}`);
  const payload = await json<{ outcome: OutcomeRow }>(res);
  return payload.outcome;
}

async function checkOutcomeEditArchive(role: RoleName, projectId: string) {
  await check(`${role} can edit/archive outcome`, async () => {
    const created = await createSmokeOutcome(role, projectId);
    const patch = await authed(role, `/api/assistant-outcomes/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ probabilityAfter: 12, investorName: `Smoke QA ${role} edited` }),
    });
    if (!patch.ok) return { ok: false, status: patch.status, detail: await patch.text() };
    const archive = await authed(role, `/api/assistant-outcomes/${created.id}`, { method: 'DELETE' });
    const text = await archive.text();
    return { ok: archive.status === 200 && text.includes('archivedAt'), status: archive.status, detail: text };
  });
}

async function main() {
  await check('public /api/auth/demo is 403', async () => {
    const res = await request('/api/auth/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    return { ok: res.status === 403, status: res.status, detail: await res.text() };
  });

  await check('public unauth endpoints are 401', async () => {
    const res = await request('/api/assistant-learning/export.csv?period=7');
    return { ok: res.status === 401, status: res.status, detail: await res.text() };
  });

  await check('public header-auth disabled', async () => {
    const res = await request('/api/assistant-outcomes', { headers: { 'x-user-email': 'admin@zapusk.tech' } });
    const text = await res.text();
    return { ok: res.status === 401 && text.includes('unauthenticated'), status: res.status, detail: text };
  });

  await check('public /uploads/* hard 404', async () => {
    const res = await request('/uploads/probe.pdf');
    const text = await res.text();
    return { ok: res.status === 404 && text.includes('uploads_disabled'), status: res.status, detail: text };
  });

  await ensureRoleTokens();

  await check('SUPER_ADMIN can read admin dashboard', async () => {
    const res = await authed('SUPER_ADMIN', '/api/admin/dashboard');
    return { ok: res.status === 200, status: res.status, detail: await res.text() };
  });

  const founderProjects = TOKENS.FOUNDER ? await getFounderProjects().catch(() => []) : [];
  const founderPayload = TOKENS.FOUNDER ? decodeJwtPayload(TOKENS.FOUNDER) : {};
  const founderSub = typeof founderPayload.sub === 'string' ? founderPayload.sub : null;
  const founderProjectIds = new Set(founderProjects.map((p) => p.id));
  const smokeProjectId = TOKENS.ADMIN ? await pickSmokeProjectId(founderProjectIds).catch(() => null) : null;

  await check('FOUNDER sees only own projects', async () => {
    const ok = founderSub
      ? founderProjects.every((p) => !p.userId || p.userId === founderSub)
      : founderProjects.length >= 0;
    return { ok, status: 200, detail: `projects=${founderProjects.length}` };
  });

  const ownProjectId = OWN_PROJECT_ID ?? founderProjects[0]?.id;
  if (ownProjectId) {
    await check('FOUNDER sees own outcomes', async () => {
      const res = await authed('FOUNDER', `/api/assistant-outcomes?projectId=${encodeURIComponent(ownProjectId)}`);
      return { ok: res.status === 200, status: res.status, detail: await res.text() };
    });
  }

  const foreignOutcomeId = FOREIGN_OUTCOME_ID
    ?? (smokeProjectId && !founderProjectIds.has(smokeProjectId)
      ? (await createSmokeOutcome('ADMIN', smokeProjectId)).id
      : null);
  if (foreignOutcomeId) {
    await check('FOUNDER cannot edit foreign outcome', async () => {
      const res = await authed('FOUNDER', `/api/assistant-outcomes/${encodeURIComponent(foreignOutcomeId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ probabilityAfter: 1 }),
      });
      return { ok: res.status === 404 || res.status === 403, status: res.status, detail: await res.text() };
    });

    await check('FOUNDER cannot archive foreign outcome', async () => {
      const res = await authed('FOUNDER', `/api/assistant-outcomes/${encodeURIComponent(foreignOutcomeId)}`, { method: 'DELETE' });
      return { ok: res.status === 404 || res.status === 403, status: res.status, detail: await res.text() };
    });

    await authed('ADMIN', `/api/assistant-outcomes/${encodeURIComponent(foreignOutcomeId)}`, { method: 'DELETE' }).catch(() => undefined);
  }

  await check('INVESTOR forbidden on founder projects', async () => {
    const res = await authed('INVESTOR', '/api/projects');
    return { ok: res.status === 403, status: res.status, detail: await res.text() };
  });

  await check('INVESTOR forbidden on admin routes', async () => {
    const res = await authed('INVESTOR', '/api/admin/dashboard');
    return { ok: res.status === 403, status: res.status, detail: await res.text() };
  });

  await check('INVESTOR forbidden on outcomes', async () => {
    const res = await authed('INVESTOR', '/api/assistant-outcomes');
    return { ok: res.status === 403, status: res.status, detail: await res.text() };
  });

  await check('INVESTOR forbidden on learning', async () => {
    const res = await authed('INVESTOR', '/api/assistant-learning/dashboard');
    return { ok: res.status === 403, status: res.status, detail: await res.text() };
  });

  await check('FOUNDER cannot see learning dashboard', async () => {
    const res = await authed('FOUNDER', '/api/assistant-learning/dashboard');
    return { ok: res.status === 403, status: res.status, detail: await res.text() };
  });

  for (const role of ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] as const) {
    await check(`${role} can read learning dashboard`, async () => {
      const res = await authed(role, '/api/assistant-learning/dashboard?period=7');
      return { ok: res.status === 200, status: res.status, detail: await res.text() };
    });

    await check(`${role} can export CSV safely`, async () => {
      const res = await authed(role, '/api/assistant-learning/export.csv?period=7');
      const text = await res.text();
      return {
        ok: res.status === 200 && !hasForbiddenCsvText(text),
        status: res.status,
        detail: text.slice(0, 500),
      };
    });

    if (smokeProjectId) await checkOutcomeEditArchive(role, smokeProjectId);
  }

  await check('MANAGER cannot call super-admin action', async () => {
    const res = await authed('MANAGER', '/api/admin/impersonate/not-a-real-user', { method: 'POST' });
    return { ok: res.status === 403, status: res.status, detail: await res.text() };
  });

  await check('ADMIN cannot create smoke token', async () => {
    const res = await authed('ADMIN', '/api/admin/smoke-token', {
      method: 'POST',
      body: JSON.stringify({ role: 'MANAGER', ttlMinutes: 15 }),
    });
    return { ok: res.status === 403, status: res.status, detail: await res.text() };
  });

  await check('MANAGER cannot create smoke token', async () => {
    const res = await authed('MANAGER', '/api/admin/smoke-token', {
      method: 'POST',
      body: JSON.stringify({ role: 'MANAGER', ttlMinutes: 15 }),
    });
    return { ok: res.status === 403, status: res.status, detail: await res.text() };
  });

  if (WAIT_EXPIRED) {
    await check('smoke token expires after exp', async () => {
      const res = await authed('SUPER_ADMIN', '/api/admin/smoke-token', {
        method: 'POST',
        body: JSON.stringify({ role: 'MANAGER', ttlMinutes: 1 }),
      });
      if (!res.ok) return { ok: false, status: res.status, detail: await res.text() };
      const payload = await json<{ token: string }>(res);
      await new Promise((resolve) => setTimeout(resolve, 65_000));
      const expired = await request('/api/assistant-learning/dashboard', {
        headers: { Authorization: `Bearer ${payload.token}` },
      });
      return { ok: expired.status === 401, status: expired.status, detail: await expired.text() };
    });
  }

  for (const r of results) {
    const status = r.status ? ` status=${r.status}` : '';
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${status}`);
    if (!r.ok && r.detail) console.log(`  ${r.detail.slice(0, 500)}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
