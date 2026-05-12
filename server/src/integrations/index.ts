// Integration placeholders. Each integration exposes a typed surface but
// returns { ok: false, reason: 'not_implemented' } until wired up. The web UI
// can already call these endpoints; we just need to fill in the bodies later.

export interface IntegrationResult {
  ok: boolean;
  reason?: string;
  externalId?: string;
  url?: string;
}

export { lovableIntegration } from './lovable.js';
export { cloudDesignIntegration } from './cloudDesign.js';
export { canvaIntegration } from './canva.js';
export { directualIntegration } from './directual.js';
export { zapuskPlatformIntegration } from './zapuskPlatform.js';
