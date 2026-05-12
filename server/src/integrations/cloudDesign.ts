import type { IntegrationResult } from './index.js';

export const cloudDesignIntegration = {
  async submitPdfSpec(_prompt: string, _refs: string[] = []): Promise<IntegrationResult> {
    return { ok: false, reason: 'not_implemented' };
  },
};
