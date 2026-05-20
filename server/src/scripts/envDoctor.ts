// Sprint 62.P1 — Env doctor.
//
// Run via:   npm run env:doctor   (from project root)
//   or:     cd server && npx tsx src/scripts/envDoctor.ts
//
// What it does:
//   • Loads dotenv from server/.env (same as the running backend).
//   • Prints SAFE summary: cwd, NODE_ENV, AI_PROVIDER, model env vars.
//   • Flags root /.env presence (legacy — should be neutralized).
//   • Flags suspicious model names like 'gpt-5.5' that 404 silently.
//   • Inspects PromptTemplate.model overrides in dev DB.
//   • Computes per-feature effective model table.
//
// What it does NOT do:
//   • Never prints API keys (only "set/unset" + length).
//   • Never modifies anything — read-only.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

// Lazy import so the script doesn't require Prisma if the user just wants
// the env summary (e.g. no DB connectivity yet).
async function getDevTemplateModels(): Promise<Array<{ key: string; model: string | null; active: boolean }>> {
  try {
    const { prisma } = await import('../db.js');
    const rows = await prisma.promptTemplate.findMany({
      where: { model: { not: null } },
      select: { key: true, model: true, active: true },
      orderBy: { key: 'asc' },
    });
    await prisma.$disconnect();
    return rows;
  } catch (err) {
    console.warn(`[env-doctor] DB unreachable — skipping template inspection. (${(err as Error).message})`);
    return [];
  }
}

const KNOWN_OPENAI_MODELS = [
  'gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
  'gpt-4o-realtime-preview', 'gpt-4o-mini-realtime-preview',
  'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1',
  'gpt-3.5-turbo', 'o1-preview', 'o1-mini', 'gpt-5', 'gpt-5-mini',
];

// Heuristic: looks like a placeholder rather than a real model.
// Catches `gpt-5.5`, `gpt-4-final`, etc. without false-positiving on real
// dated model IDs like `gpt-4.1-2025-04`.
function looksSuspiciousModel(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (KNOWN_OPENAI_MODELS.includes(n)) return false;
  // Dated variant: gpt-4.1-2025-04-13 — assume real
  if (/^gpt-\d+\.\d+-\d{4}/.test(n)) return false;
  // gpt-X.Y where Y > known max (.5 except 3.5 is fine; flag 4.5 / 5.5 / 6.X)
  if (/^gpt-(4|5|6)\.\d+$/.test(n) && !['gpt-4.1', 'gpt-3.5'].some((k) => n.startsWith(k))) {
    return true;
  }
  // gpt-N where N > 5 — speculation
  if (/^gpt-\d+$/.test(n)) {
    const num = Number(n.replace('gpt-', ''));
    if (Number.isFinite(num) && num > 5) return true;
  }
  return false;
}

function envSet(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v.trim());
}

function envValue(name: string, fallback: string): { value: string; source: 'env' | 'fallback' } {
  const raw = process.env[name];
  if (raw && raw.trim()) return { value: raw, source: 'env' };
  return { value: fallback, source: 'fallback' };
}

function maskKey(name: string): string {
  const v = process.env[name];
  if (!v) return 'unset';
  if (v.length < 12) return `set (len=${v.length})`;
  return `set (len=${v.length}, prefix="${v.slice(0, 6)}…")`;
}

async function main() {
  const projectRoot = path.resolve(process.cwd(), '..');
  const serverRoot = process.cwd();
  const rootEnvPath = path.join(projectRoot, '.env');
  const serverEnvPath = path.join(serverRoot, '.env');
  const webEnvPath = path.join(projectRoot, 'web', '.env');

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Env Doctor — Zapusk AI Packaging (Sprint 62.P1)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Process context:');
  console.log(`  cwd:           ${process.cwd()}`);
  console.log(`  NODE_ENV:      ${process.env.NODE_ENV ?? '(unset, → development)'}`);
  console.log(`  AI_PROVIDER:   ${process.env.AI_PROVIDER ?? '(unset, → mock)'}`);
  console.log();

  console.log('.env file presence:');
  const rootExists = fs.existsSync(rootEnvPath);
  const serverExists = fs.existsSync(serverEnvPath);
  const webExists = fs.existsSync(webEnvPath);
  console.log(`  ${serverExists ? '✓' : '✗'} ${serverEnvPath} ${serverExists ? '(read by backend)' : '(MISSING — backend has no env!)'}`);
  console.log(`  ${webExists ? '✓' : '–'} ${webEnvPath} ${webExists ? '(read by Vite)' : '(optional)'}`);
  if (rootExists) {
    // Peek at first non-comment lines to detect dangerous leftovers.
    const lines = fs.readFileSync(rootEnvPath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    if (lines.length === 0) {
      console.log(`  ✓ ${rootEnvPath} (present but neutralized — only comments)`);
    } else {
      console.log(`  ⚠ ${rootEnvPath} CONTAINS ACTIVE VARS — but backend does NOT read it!`);
      const hasModel = lines.some((l) => /^OPENAI_MODEL/.test(l));
      const hasKey = lines.some((l) => /^OPENAI_API_KEY|ANTHROPIC_API_KEY/.test(l));
      if (hasModel) console.log('     • Contains OPENAI_MODEL_* — these are IGNORED');
      if (hasKey) console.log('     • Contains an API key — should be moved to server/.env (and rotated)');
    }
  } else {
    console.log(`  – ${rootEnvPath} (not present — good)`);
  }
  console.log();

  console.log('API key configuration (length only, never the key itself):');
  console.log(`  OPENAI_API_KEY:     ${maskKey('OPENAI_API_KEY')}`);
  console.log(`  ANTHROPIC_API_KEY:  ${maskKey('ANTHROPIC_API_KEY')}`);
  console.log(`  DEEPGRAM_API_KEY:   ${maskKey('DEEPGRAM_API_KEY')}`);
  console.log();

  console.log('Model env vars (value, source):');
  const matrix: Array<{ name: string; fallback: string }> = [
    { name: 'OPENAI_MODEL_MAIN', fallback: 'gpt-4o' },
    { name: 'OPENAI_MODEL_FAST', fallback: 'gpt-4o-mini' },
    { name: 'OPENAI_MODEL_REALTIME', fallback: 'gpt-4o-realtime-preview' },
    { name: 'OPENAI_MODEL_REALTIME_TRANSCRIBE', fallback: 'gpt-4o-transcribe' },
    { name: 'OPENAI_MODEL_TRANSCRIBE', fallback: 'gpt-4o-transcribe' },
    { name: 'ANTHROPIC_MODEL_MAIN', fallback: 'claude-opus-4-1' },
    { name: 'ANTHROPIC_MODEL_FAST', fallback: 'claude-sonnet-4-5' },
  ];
  const warnings: string[] = [];
  for (const m of matrix) {
    const { value, source } = envValue(m.name, m.fallback);
    const suspicious = looksSuspiciousModel(value);
    const marker = suspicious ? '⚠' : (source === 'env' ? '✓' : '·');
    const tag = source === 'env' ? 'env' : 'fallback';
    console.log(`  ${marker} ${m.name.padEnd(36)} ${value.padEnd(36)} [${tag}]`);
    if (suspicious) {
      warnings.push(`${m.name}=${value} — looks like a placeholder, NOT a real OpenAI model. Will 404 silently.`);
    }
  }
  console.log();

  console.log('Feature flags:');
  console.log(`  DEMO_FAST_AI_MODE:        ${envSet('DEMO_FAST_AI_MODE') ? process.env.DEMO_FAST_AI_MODE : '(unset, default: false)'}`);
  console.log(`  AI_LOG_USAGE:             ${envSet('AI_LOG_USAGE') ? process.env.AI_LOG_USAGE : '(unset, default: false)'}`);
  console.log(`  ENFORCE_REAL_AI_PROVIDER: ${envSet('ENFORCE_REAL_AI_PROVIDER') ? process.env.ENFORCE_REAL_AI_PROVIDER : '(unset, default: false)'}`);
  console.log(`  ALLOW_MOCK_AI_IN_PRODUCTION: ${envSet('ALLOW_MOCK_AI_IN_PRODUCTION') ? process.env.ALLOW_MOCK_AI_IN_PRODUCTION : '(unset, default: false)'}`);
  console.log();

  console.log('PromptTemplate.model overrides in DB:');
  const overrides = await getDevTemplateModels();
  if (overrides.length === 0) {
    console.log('  (none)');
  } else {
    for (const t of overrides) {
      const honored = t.key === 'realtime_transcription';
      const marker = honored ? '✓' : '⚠';
      const note = honored
        ? 'used by transcription routes'
        : 'IGNORED at runtime — informational only (see Sprint 62.P1)';
      console.log(`  ${marker} key=${t.key.padEnd(36)} model=${(t.model ?? '').padEnd(28)} [${note}]`);
    }
  }
  console.log();

  console.log('Effective per-feature model resolution:');
  const provider = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();
  const isReal = provider === 'openai' || provider === 'anthropic';
  function pickEnv(name: string, fb: string): string {
    return envValue(name, fb).value;
  }
  const features: Array<{ feature: string; route: string; resolved: string; note?: string }> = [];
  if (isReal) {
    features.push(
      { feature: 'sales_assistant.prepare', route: process.env.DEMO_FAST_AI_MODE === 'true' ? 'fast' : 'main',
        resolved: process.env.DEMO_FAST_AI_MODE === 'true'
          ? pickEnv('OPENAI_MODEL_FAST', 'gpt-4o-mini')
          : pickEnv('OPENAI_MODEL_MAIN', 'gpt-4o'),
        note: process.env.DEMO_FAST_AI_MODE === 'true' ? 'DEMO_FAST_AI_MODE=true → route=fast' : undefined,
      },
      { feature: 'sales_assistant.analyze', route: 'main', resolved: pickEnv('OPENAI_MODEL_MAIN', 'gpt-4o') },
      { feature: 'sales_assistant.analyze_fast', route: 'fast', resolved: pickEnv('OPENAI_MODEL_FAST', 'gpt-4o-mini') },
      { feature: 'realtime.transcription', route: 'realtime',
        resolved: overrides.find((t) => t.key === 'realtime_transcription')?.model
          ?? pickEnv('OPENAI_MODEL_REALTIME_TRANSCRIBE', 'gpt-4o-transcribe'),
        note: overrides.find((t) => t.key === 'realtime_transcription')?.model
          ? 'from template override' : undefined,
      },
      { feature: 'transcription (uploads)', route: 'transcribe',
        resolved: overrides.find((t) => t.key === 'realtime_transcription')?.model
          ?? pickEnv('OPENAI_MODEL_TRANSCRIBE', 'gpt-4o-transcribe'),
      },
      { feature: 'brief.generate', route: 'main', resolved: pickEnv('OPENAI_MODEL_MAIN', 'gpt-4o') },
    );
  } else {
    features.push({ feature: '(all real features)', route: '–', resolved: 'mock-v1', note: `AI_PROVIDER=${provider}` });
  }
  for (const f of features) {
    console.log(`  ${f.feature.padEnd(32)} route=${f.route.padEnd(10)} → ${f.resolved}${f.note ? `   (${f.note})` : ''}`);
  }
  console.log();

  if (warnings.length > 0) {
    console.log('═══ WARNINGS ═══');
    for (const w of warnings) console.log(`  ⚠ ${w}`);
    console.log();
  }

  console.log('Tip: after any env change, restart `npm run dev` (env is read once at boot).');
}

main().catch((err) => {
  console.error('[env-doctor] failed:', err);
  process.exit(1);
});
