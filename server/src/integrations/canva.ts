import type { IntegrationResult } from './index.js';

export const canvaIntegration = {
  async pushDeckTemplate(_payload: unknown): Promise<IntegrationResult> {
    return { ok: false, reason: 'not_implemented' };
  },
};
