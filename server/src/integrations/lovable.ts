import type { IntegrationResult } from './index.js';

// Push a landing-page or pitch-deck-website prompt to Lovable. Real call will
// likely require a Lovable workspace token + project id; until then a noop.
export const lovableIntegration = {
  async pushLandingPrompt(_prompt: string): Promise<IntegrationResult> {
    return { ok: false, reason: 'not_implemented' };
  },
  async pushPitchDeckWebsite(_prompt: string): Promise<IntegrationResult> {
    return { ok: false, reason: 'not_implemented' };
  },
};
