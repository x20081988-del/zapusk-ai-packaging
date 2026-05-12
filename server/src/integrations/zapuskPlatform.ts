import type { IntegrationResult } from './index.js';

// Publish the finished package (one-pager, deck, financial model, calculator)
// to the main Zapusk.tech investor marketplace. Real implementation will sit
// behind the platform's private API.
export const zapuskPlatformIntegration = {
  async publishProject(_projectId: string): Promise<IntegrationResult> {
    return { ok: false, reason: 'not_implemented' };
  },
  async syncInvestorTerms(_projectId: string, _terms: unknown): Promise<IntegrationResult> {
    return { ok: false, reason: 'not_implemented' };
  },
};
