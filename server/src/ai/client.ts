import { env } from '../env.js';
import { mockBrief } from './mock.js';

export interface AICallOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  asJSON?: boolean;
}

export interface AIResult {
  text: string;
  provider: 'anthropic' | 'openai' | 'mock';
  model: string;
  fellBackToMock: boolean;
}

// Single entry point for the rest of the codebase. Swapping providers means
// editing only this file. Failures degrade gracefully to deterministic mocks
// so the product is always usable without API keys.
export async function aiComplete(opts: AICallOptions): Promise<AIResult> {
  const provider = env.AI_PROVIDER;

  try {
    if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
      return await callAnthropic(opts);
    }
    if (provider === 'openai' && env.OPENAI_API_KEY) {
      return await callOpenAI(opts);
    }
  } catch (err) {
    console.warn('[ai] provider call failed, using mock:', err instanceof Error ? err.message : err);
  }

  return {
    text: opts.asJSON ? JSON.stringify(mockBrief(opts.user), null, 2) : mockText(opts),
    provider: 'mock',
    model: 'mock-v1',
    fellBackToMock: provider !== 'mock',
  };
}

async function callAnthropic(opts: AICallOptions): Promise<AIResult> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.4,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('\n');
  return { text, provider: 'anthropic', model: env.ANTHROPIC_MODEL, fellBackToMock: false };
}

async function callOpenAI(opts: AICallOptions): Promise<AIResult> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.4,
    response_format: opts.asJSON ? { type: 'json_object' } : undefined,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
  });
  const text = res.choices[0]?.message?.content ?? '';
  return { text, provider: 'openai', model: env.OPENAI_MODEL, fellBackToMock: false };
}

function mockText(opts: AICallOptions): string {
  return `# Mock AI response\n\n_Provider: mock — set ANTHROPIC_API_KEY or OPENAI_API_KEY to use real model._\n\n## System prompt (excerpt)\n${opts.system.slice(0, 200)}…\n\n## User input (excerpt)\n${opts.user.slice(0, 200)}…`;
}
