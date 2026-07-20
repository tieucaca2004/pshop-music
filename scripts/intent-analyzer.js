/**
 * Intent Analyzer — Understand user objectives before execution
 * Extracts: goal, outcome, priority, urgency, systems, dependencies, risks, criteria
 */
const IntentAnalyzer = {
  analyze(input) {
    return {
      goal: this._extract(input, ['goal', 'mission', 'objective', 'muc tieu', 'lam']),
      outcome: this._extract(input, ['outcome', 'result', 'ket qua', 'xong', 'hoan thanh']),
      priority: this._detectPriority(input),
      urgency: this._detectUrgency(input),
      systems: this._detectSystems(input),
      dependencies: [],
      risks: [],
      criteria: this._detectCriteria(input)
    };
  },

  _extract(text, keywords) {
    const lines = text.split('\n');
    for (const line of lines) {
      const lower = line.toLowerCase();
      for (const kw of keywords) {
        if (lower.startsWith(kw) || lower.includes(` ${kw} `) || lower.includes(`\n${kw}`))
          return line.substring(0, 120).trim();
      }
    }
    return 'objective inferred from context';
  },

  _detectPriority(input) {
    const high = ['urgent', 'gap', 'critical', 'fix', 'loi', 'gap', 'huy'];
    const med = ['improve', 'optimize', 'toi uu', 'lam dep', 'sang'];
    const low = ['audit', 'check', 'review', 'kiem tra'];
    const lower = input.toLowerCase();
    if (high.some(w => lower.includes(w))) return 'HIGH';
    if (med.some(w => lower.includes(w))) return 'MEDIUM';
    if (low.some(w => lower.includes(w))) return 'LOW';
    return 'NORMAL';
  },

  _detectUrgency(input) {
    const now = ['ngay', 'luon', 'bay gio', 'gap', 'now', 'urgent', 'immediately'];
    const lower = input.toLowerCase();
    if (now.some(w => lower.includes(w))) return 'NOW';
    return 'WHEN_READY';
  },

  _detectSystems(input) {
    const systems = [];
    const map = { website: 'pshopmusic.com', atieu: 'atieu.com', cms: 'admin', firebase: 'firebase',
                  dns: 'tenten', email: 'improvmx', browser: 'playwright', docker: 'docker' };
    for (const [key, val] of Object.entries(map)) {
      if (input.toLowerCase().includes(key)) systems.push(val);
    }
    return systems;
  },

  _detectCriteria(input) {
    const criteria = [];
    if (input.includes('200') || input.includes('http')) criteria.push('HTTP 200');
    if (input.includes('responsive') || input.includes('mobile') || input.includes('di dong')) criteria.push('responsive');
    if (input.includes('seo')) criteria.push('SEO complete');
    if (input.includes('deploy') || input.includes('trien khai') || input.includes('len')) criteria.push('deployed');
    return criteria.length ? criteria : ['task completes without errors'];
  }
};

if (typeof module !== 'undefined') module.exports = { IntentAnalyzer };
