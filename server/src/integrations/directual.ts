import type { IntegrationResult } from './index.js';

export const directualIntegration = {
  async syncProjectState(_projectId: string, _state: unknown): Promise<IntegrationResult> {
    return { ok: false, reason: 'not_implemented' };
  },
};
