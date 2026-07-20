/**
 * Policy Engine — Executable policy rules for autonomous actions
 * 
 * Every action is classified and enforced at runtime.
 * Classifications: SAFE | LOW_RISK | MEDIUM_RISK | HIGH_RISK | CRITICAL
 * 
 * Rules determine: Allow | Require approval | Deny
 */
const PolicyEngine = {
  version: '1.0',
  
  // Policy rules: action patterns → { level, allow, requiresApproval }
  rules: [
    // SAFE — always allowed
    { pattern: /^(read|check|audit|search|list|get|view|show|status|inspect|monitor)/i, level: 'SAFE', allow: true },
    { pattern: /^(analyse|analyze|scan|test|verify)/i, level: 'SAFE', allow: true },
    
    // LOW RISK — allowed, logged
    { pattern: /^(optimize|format|refactor|rename|move|copy)/i, level: 'LOW_RISK', allow: true },
    { pattern: /^(backup|export|archive)/i, level: 'LOW_RISK', allow: true },
    { pattern: /^(convert|compress|resize|encode|decode)/i, level: 'LOW_RISK', allow: true },
    
    // MEDIUM RISK — requires notification
    { pattern: /^(update|modify|edit|change|patch)/i, level: 'MEDIUM_RISK', allow: true, notify: true },
    { pattern: /^(create|add|write|save|generate)/i, level: 'MEDIUM_RISK', allow: true, notify: true },
    { pattern: /^(install|uninstall|upgrade|downgrade)/i, level: 'MEDIUM_RISK', allow: true, notify: true },
    { pattern: /^(restart|reload|refresh|rebuild)/i, level: 'MEDIUM_RISK', allow: true, notify: true },
    { pattern: /^(commit|stage)/i, level: 'MEDIUM_RISK', allow: true, notify: true },
    
    // HIGH RISK — requires approval
    { pattern: /^(deploy|publish|release)/i, level: 'HIGH_RISK', requiresApproval: true },
    { pattern: /^(push|merge|rebase|force)/i, level: 'HIGH_RISK', requiresApproval: true },
    { pattern: /^(delete|remove|erase|truncate|purge)/i, level: 'HIGH_RISK', requiresApproval: true },
    { pattern: /^(migrate|transform|convert-all)/i, level: 'HIGH_RISK', requiresApproval: true },
    { pattern: /^(rollback|reset|undo)/i, level: 'HIGH_RISK', requiresApproval: true },
    { pattern: /^(mass|bulk|batch).*(edit|update|delete|change)/i, level: 'HIGH_RISK', requiresApproval: true },
    
    // CRITICAL — denied by default
    { pattern: /^(shutdown|halt|poweroff|reboot|destroy)/i, level: 'CRITICAL', allow: false },
    { pattern: /^(clear|wipe|drop|delete-all|remove-all)/i, level: 'CRITICAL', allow: false },
    { pattern: /^production/i, level: 'CRITICAL', requiresApproval: true },
    { pattern: /^(spend|charge|pay|transfer|withdraw)/i, level: 'CRITICAL', allow: false },
  ],
  
  // Override rules (user-configured exceptions)
  overrides: [],

  /**
   * Classify and evaluate an action against policies
   * @param {string} action - The action being taken
   * @param {string} context - Additional context (task name, target)
   * @returns {object} { level, allowed, requiresApproval, notify, reason }
   */
  classify(action, context = '') {
    if (!action) return { level: 'UNKNOWN', allowed: false, reason: 'No action provided' };

    // Check overrides first
    for (const override of this.overrides) {
      if (action.match(override.pattern) || context.match(override.pattern)) {
        return { ...override.mode, matchedBy: 'override' };
      }
    }

    // Check rules in order (first match wins)
    for (const rule of this.rules) {
      if (rule.pattern.test(action) || rule.pattern.test(context)) {
        return {
          level: rule.level,
          allowed: rule.allow !== false,
          requiresApproval: rule.requiresApproval || false,
          notify: rule.notify || false,
          reason: `Matched policy rule: ${rule.level}`
        };
      }
    }

    // Default: unknown actions get MEDIUM_RISK treatment
    return { level: 'MEDIUM_RISK', allowed: true, notify: true, reason: 'Unclassified action — default MEDIUM_RISK' };
  },

  /**
   * Add a policy override
   */
  addOverride(pattern, mode) {
    this.overrides.push({ pattern, mode });
  },

  /**
   * Summarize all policies for reporting
   */
  getPolicies() {
    return this.rules.map(r => ({
      pattern: r.pattern.source,
      level: r.level,
      allowed: r.allow !== false,
      requiresApproval: r.requiresApproval || false
    }));
  }
};

if (typeof module !== 'undefined') module.exports = { PolicyEngine };
