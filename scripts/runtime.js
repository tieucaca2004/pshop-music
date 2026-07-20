#!/usr/bin/env node
/**
 * OpenClaw Runtime — Background Daemon & Integration Hub
 * 
 * This is THE integration point. It imports and wires together:
 *   - watchdog.js  (heartbeat, stall detection, timeout, retry)
 *   - reporting.js (Telegram templates for FAILED/STALLED/RECOVERED)
 *   - policy-engine.js (action classification and enforcement)
 *   - self-healing.js (automatic recovery from failures)
 *   - autonomous-config.js (risk-based autonomy rules)
 *   - task-decomposer.js (break goals into atomic tasks)
 *   - workflow-state.js (state transitions)
 *   - notification-filter.js (final-result-only output)
 * 
 * Every task goes through this flow:
 *   1. policy-engine.evaluate() — classify and enforce rules
 *   2. watchdog.register() — start monitoring
 *   3. watchdog.progress() — update step during execution
 *   4. watchdog.heartbeat() — every 30s
 *   5. watchdog.complete() or fail() — end monitoring
 *   6. Reporting — format and send result
 *   7. experience-log — save lessons learned
 */

const Runtime = {
  version: '1.0',
  mode: 'semi-autonomous', // manual | semi-autonomous | autonomous
  scheduler: null,
  intervals: new Map(),
  tasks: new Map(),
  
  // Modules loaded lazily
  _modules: {},

  async loadModules() {
    // Try to load each module; failures are non-fatal for optional modules
    const modules = [
      'watchdog', 'reporting', 'policy-engine', 'self-healing',
      'autonomous-config', 'task-decomposer', 'workflow-state', 'notification-filter'
    ];
    for (const name of modules) {
      try {
        this._modules[name] = require(`./${name}`);
      } catch (e) {
        // Module not available — skip
      }
    }
    return this;
  },

  get(name) {
    return this._modules[name] || null;
  },

  /**
   * Execute a single task through the full pipeline.
   * Returns: { status, task, report }
   */
  async execute(taskName, action, context = {}) {
    // 1. Policy evaluation
    const pe = this.get('policy-engine');
    const policy = pe ? pe.PolicyEngine.classify(action, taskName) : { level: 'SAFE', allowed: true };
    
    if (!policy.allowed) {
      return { status: 'DENIED', policy, error: `Action "${action}" denied by policy (${policy.level})` };
    }
    if (policy.requiresApproval) {
      return { status: 'APPROVAL_REQUIRED', policy, error: `Action "${action}" requires user approval (${policy.level})` };
    }

    // 2. Start watchdog monitoring
    const wd = this.get('watchdog');
    let task = null;
    if (wd) {
      const maxTimeout = context.maxTimeoutMs || 600000;
      task = wd.Watchdog.register(taskName, taskName, 300000, maxTimeout);
      wd.Watchdog.progress(taskName, 'starting');
    }

    try {
      // 3. Execute the actual work (provided by caller)
      if (wd) wd.Watchdog.progress(taskName, 'executing');
      const result = await context.execute ? context.execute() : { ok: true, data: null };

      // 4. Complete watchdog
      if (wd) {
        wd.Watchdog.complete(taskName, result.ok ? 'SUCCESS' : 'FAILED');
        wd.Watchdog.progress(taskName, 'completed');
      }

      // 5. Report success
      const rpt = this.get('reporting');
      const report = rpt ? `SUCCESS\n\nTask: ${taskName}\nAction: ${action}\nResult: Completed` : null;

      // 6. Save to experience log (if function provided)
      if (context.onComplete) context.onComplete(taskName, 'SUCCESS');

      return { status: 'SUCCESS', task: wd ? wd.Watchdog.getStatus(taskName) : null, report };
    } catch (error) {
      // 4. Handle failure
      if (wd) {
        wd.Watchdog.fail(taskName, error.message, context.rootCause || 'execution_error');
        
        // Attempt recovery
        const sh = this.get('self-healing');
        let recovery = { status: 'not_attempted' };
        if (sh) {
          recovery = await sh.SelfHealing.heal(null, error.message, { name: taskName, attempts: context.retries || 0 });
          if (recovery.status === 'HEALED') {
            wd.Watchdog.heartbeat(taskName);
            return { status: 'RECOVERED', task: wd.Watchdog.getStatus(taskName), recovery };
          }
        }
      }

      // 5. Report failure
      return { status: 'FAILED', error: error.message, task: wd ? wd.Watchdog.getStatus(taskName) : null };
    }
  },

  /**
   * Schedule a recurring task (internal heartbeat-style)
   */
  interval(name, fn, ms) {
    if (this.intervals.has(name)) return;
    const id = setInterval(async () => {
      try { await fn(); } catch (e) { /* log internal error */ }
    }, ms);
    this.intervals.set(name, id);
  },

  clearInterval(name) {
    const id = this.intervals.get(name);
    if (id) { clearInterval(id); this.intervals.delete(name); }
  },

  clearAllIntervals() {
    for (const [name, id] of this.intervals) clearInterval(id);
    this.intervals.clear();
  },

  pause() { this.mode = 'paused'; this.clearAllIntervals(); },
  resume() { this.mode = 'semi-autonomous'; },
  stop() { this.clearAllIntervals(); }
};

// Integration verification: export for Node.js import
if (typeof module !== 'undefined') {
  module.exports = Runtime;
  // Self-verify
  const checks = ['watchdog','reporting','policy-engine','self-healing','autonomous-config',
                  'task-decomposer','workflow-state','notification-filter'];
  const available = checks.filter(c => { try { return !!require.resolve(`./${c}`); } catch(e) { return false; } });
  console.log(`Runtime loaded. Available modules: ${available.join(', ')}`);
}
