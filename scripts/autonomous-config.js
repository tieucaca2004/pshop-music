/**
 * Autonomous Operation Config — Autonomy rules and risk management
 */
const AutonomousConfig = {
  version: '1.0',
  mode: 'semi-autonomous', // manual | semi-autonomous | autonomous
  
  thresholds: {
    confidence: {
      high: 0.9,   // autonomous execution
      medium: 0.7, // semi-autonomous (notify user)
      low: 0.5     // request approval
    },
    risk: {
      low: ['read', 'audit', 'check', 'monitor', 'search', 'analyze'],
      medium: ['modify', 'update', 'optimize', 'refactor', 'deploy'],
      high: ['delete', 'destroy', 'restart', 'rebuild', 'reconfigure', 'reset']
    }
  },

  evaluate(action, context = {}) {
    const actionLower = action.toLowerCase();
    
    // Determine risk level
    let risk = 'HIGH';
    for (const [level, keywords] of Object.entries(this.thresholds.risk)) {
      if (keywords.some(k => actionLower.includes(k))) {
        risk = level.toUpperCase();
        break;
      }
    }

    // Determine confidence based on context
    const hasMemory = context.memoryAvailable || false;
    const hasPlan = context.planAvailable || false;
    const hasVerification = context.verificationAvailable || false;
    const historyAvailable = context.historyAvailable || false;
    
    let confidence = 0.5; // base
    if (hasMemory) confidence += 0.15;
    if (hasPlan) confidence += 0.15;
    if (hasVerification) confidence += 0.1;
    if (historyAvailable) confidence += 0.1;

    // Decision
    const canAuto = risk === 'LOW' || (risk === 'MEDIUM' && confidence >= this.thresholds.confidence.medium);
    const needsApproval = risk === 'HIGH' || confidence < this.thresholds.confidence.low;

    return {
      action,
      risk,
      confidence: Math.round(confidence * 100) / 100,
      mode: canAuto ? 'AUTONOMOUS' : (needsApproval ? 'APPROVAL_REQUIRED' : 'NOTIFY_FIRST'),
      reasons: {
        risk_level: risk,
        confidence_score: Math.round(confidence * 100) / 100,
        memory_available: hasMemory,
        plan_available: hasPlan,
        verification_available: hasVerification,
        history_available: historyAvailable
      }
    };
  }
};

if (typeof module !== 'undefined') module.exports = { AutonomousConfig };
