type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'FOUNDER' | 'INVESTOR';

const BASE_URL = process.env.ZAPUSK_SMOKE_BASE_URL ?? 'https://zapusk-ai.tech';

const TOKENS: Partial<Record<RoleName, string>> = {
  SUPER_ADMIN: process.env.ZAPUSK_SUPER_ADMIN_TOKEN,
  ADMIN: process.env.ZAPUSK_ADMIN_TOKEN,
  MANAGER: process.env.ZAPUSK_MANAGER_TOKEN,
  FOUNDER: process.env.ZAPUSK_FOUNDER_TOKEN,
  INVESTOR: process.env.ZAPUSK_INVESTOR_TOKEN,
};

const FOREIGN_OUTCOME_ID = process.env.ZAPUSK_FOREIGN_OUTCOME_ID;
const OWN_PROJECT_ID = process.env.ZAPUSK_FOUNDER_PROJECT_ID;

interface CheckResult {
  name: string;
  ok: boolean;
  status?: number;
  detail?: string;
}

const results: CheckResult[] = [];

function token(role: RoleName): string {
  const value = TOKENS[role];
  if (!value) throw new Error(`Missing env token for ${role}`);
  return value;
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

async function main() {
  await check('public /api/auth/demo is 403', async () => {
    const res = await request('/api/auth/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    return { ok: res.status === 403, status: res.status, detail: await res.text() };
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

  if (OWN_PROJECT_ID) {
    await check('FOUNDER sees own outcomes by project', async () => {
      const res = await authed('FOUNDER', `/api/assistant-outcomes?projectId=${encodeURIComponent(OWN_PROJECT_ID)}`);
      return { ok: res.status === 200, status: res.status, detail: await res.text() };
    });
  }

  if (FOREIGN_OUTCOME_ID) {
    await check('FOUNDER cannot edit foreign outcome', async () => {
      const res = await authed('FOUNDER', `/api/assistant-outcomes/${encodeURIComponent(FOREIGN_OUTCOME_ID)}`, {
        method: 'PATCH',
        body: JSON.stringify({ probabilityAfter: 1 }),
      });
      return { ok: res.status === 404 || res.status === 403, status: res.status, detail: await res.text() };
    });

    await check('FOUNDER cannot archive foreign outcome', async () => {
      const res = await authed('FOUNDER', `/api/assistant-outcomes/${encodeURIComponent(FOREIGN_OUTCOME_ID)}`, {
        method: 'DELETE',
      });
      return { ok: res.status === 404 || res.status === 403, status: res.status, detail: await res.text() };
    });
  }

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
  }

  await check('MANAGER cannot call super-admin action', async () => {
    const res = await authed('MANAGER', '/api/admin/impersonate/not-a-real-user', { method: 'POST' });
    return { ok: res.status === 403, status: res.status, detail: await res.text() };
  });

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
