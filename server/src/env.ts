import 'dotenv/config';

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

export const env = {
  PORT: Number(process.env.PORT ?? 4000),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  // In single-service production deploy (Render / Railway / Fly) Express
  // serves both the API and the compiled SPA. CORS_ORIGIN is then irrelevant
  // because requests are same-origin. Leave it for split deploys.
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  UPLOADS_DIR: process.env.UPLOADS_DIR ?? './uploads',
  // Where the compiled SPA lives. Relative to the running server/dist.
  WEB_DIST_DIR: process.env.WEB_DIST_DIR ?? '../../web/dist',

  // Public-demo lockdown. Set DEMO_MODE=true on a public URL to block destructive ops.
  DEMO_MODE: truthy(process.env.DEMO_MODE),

  DEV_USER_EMAIL: process.env.DEV_USER_EMAIL ?? 'founder@zapusk.tech',
  DEV_USER_NAME: process.env.DEV_USER_NAME ?? 'Zapusk Founder',

  AI_PROVIDER: (process.env.AI_PROVIDER ?? 'mock') as 'anthropic' | 'openai' | 'mock',
  AI_LOG_USAGE: truthy(process.env.AI_LOG_USAGE),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  // OPENAI_MODEL is kept as a backward-compatible alias for older deploys.
  // Defaults must be real model names — placeholders like "gpt-5.5" return
  // 404 model_not_found from OpenAI and silently fall back to mock.
  OPENAI_MODEL_MAIN: process.env.OPENAI_MODEL_MAIN ?? process.env.OPENAI_MODEL ?? 'gpt-4o',
  OPENAI_MODEL_FAST: process.env.OPENAI_MODEL_FAST ?? 'gpt-4o-mini',
  OPENAI_MODEL_REALTIME: process.env.OPENAI_MODEL_REALTIME ?? 'gpt-4o-realtime-preview',
};

export const isProd = env.NODE_ENV === 'production';
