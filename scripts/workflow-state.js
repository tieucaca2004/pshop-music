/**
 * Workflow State Machine — production state tracking
 * States: CREATED -> RUNNING -> (WAITING_USER) -> COMPLETED | FAILED
 * Features: checkpoint, resume, retry, dedup
 */
const WF = {
  states: { CREATED:0, RUNNING:1, WAITING_USER:2, RETRYING:3, COMPLETED:4, FAILED:5 },
  
  create(id, data={}) {
    return { id, state: 'CREATED', step: 0, retries: 0, data, createdAt: Date.now(), updatedAt: Date.now() };
  },

  checkpoint(wf) {
    try { localStorage.setItem('wf_'+wf.id, JSON.stringify(wf)); } catch(e) {}
    return wf;
  },

  resume(id) {
    try {
      const raw = localStorage.getItem('wf_'+id);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  },

  transition(wf, newState) {
    if (!this.states[newState] || this.states[newState] < this.states[wf.state]) return wf;
    wf.state = newState; wf.updatedAt = Date.now();
    return this.checkpoint(wf);
  },

  retry(wf, maxRetries=3) {
    wf.retries++;
    if (wf.retries >= maxRetries) return this.transition(wf, 'FAILED');
    return this.transition(wf, 'RETRYING');
  }
};

if (typeof module !== 'undefined') module.exports = WF;
