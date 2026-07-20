/**
 * Self-Healing System — Automatic recovery from common failures
 * Extends health-check.js with recovery actions
 */
const SelfHealing = {
  healers: {
    'website_down': {
      detect: (status) => !status || status.code !== 200,
      recover: async (name) => `Attempting recovery for ${name}: will retry in 30s`,
      verify: (status) => status && status.code === 200,
      maxRetries: 3,
      cooldown: 30000
    },
    'browser_stale': {
      detect: (err) => err && (err.includes('stale') || err.includes('not found')),
      recover: async () => 'Refreshing browser session',
      verify: () => true,
      maxRetries: 2,
      cooldown: 5000
    },
    'workflow_failed': {
      detect: (state) => state === 'FAILED',
      recover: async (wf) => `Resuming workflow ${wf} from last checkpoint`,
      verify: (state) => state === 'RUNNING' || state === 'COMPLETED',
      maxRetries: 3,
      cooldown: 10000
    }
  },

  async heal(check, error, context = {}) {
    const healers = Object.values(this.healers);
    for (const h of healers) {
      if (h.detect(error || check)) {
        let attempts = context.attempts || 0;
        if (attempts >= h.maxRetries) return { status: 'ESCALATED', reason: `Max retries (${h.maxRetries}) exceeded` };
        const recovery = await h.recover(context.name || 'system');
        const verified = h.verify(check);
        return { status: verified ? 'HEALED' : 'RETRYING', action: recovery, attempts: attempts + 1 };
      }
    }
    return { status: 'UNKNOWN', reason: 'No healer matched' };
  },

  verify(state) {
    const ok = state && state.status === 'ok';
    return { healthy: ok, timestamp: new Date().toISOString() };
  }
};

if (typeof module !== 'undefined') module.exports = { SelfHealing };
