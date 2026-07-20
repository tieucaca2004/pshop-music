/**
 * Task Decomposer — Break complex tasks into atomic subtasks
 * Each subtask: id, description, agent, inputs, outputs, deps, verify, status
 */
const TaskDecomposer = {
  decompose(goal, systems = [], complexity = 'auto') {
    const tasks = [];
    const id = Date.now().toString(36);

    // Always start with analyze
    tasks.push(this._task(`${id}-a1`, 'Analyze current state', 'analyzer'));

    if (systems.includes('pshopmusic.com') || goal.toLowerCase().includes('website')) {
      tasks.push(this._task(`${id}-w1`, 'Audit website pages (HTTP 200, SEO, meta)', 'qa'));
      tasks.push(this._task(`${id}-w2`, 'Apply UI/SEO fixes if needed', 'engineer'));
      tasks.push(this._task(`${id}-w3`, 'Verify all pages load correctly', 'qa'));
    }

    if (systems.includes('atieu.com')) {
      tasks.push(this._task(`${id}-a1`, 'Check atieu.com deployment', 'deploy'));
      tasks.push(this._task(`${id}-a2`, 'Verify homepage + subpages', 'qa'));
    }

    if (goal.toLowerCase().includes('deploy') || systems.includes('deploy')) {
      tasks.push(this._task(`${id}-d1`, 'Backup current state', 'memory'));
      tasks.push(this._task(`${id}-d2`, 'Run pre-deploy checks', 'qa'));
      tasks.push(this._task(`${id}-d3`, 'Deploy', 'deploy'));
      tasks.push(this._task(`${id}-d4`, 'Post-deploy verification', 'qa'));
    }

    // Analyse tasks for memory system
    if (goal.toLowerCase().includes('memory') || goal.toLowerCase().includes('ghi nho')) {
      tasks.push(this._task(`${id}-m1`, 'Check existing memory files', 'memory'));
      tasks.push(this._task(`${id}-m2`, 'Update/create memory content', 'memory'));
      tasks.push(this._task(`${id}-m3`, 'Verify memory files valid UTF-8', 'qa'));
    }

    // Always end with review
    tasks.push(this._task(`${id}-z1`, 'Self-review and report', 'reviewer'));

    return tasks;
  },

  _task(id, description, agent) {
    return { id, description, agent, inputs: [], outputs: [], deps: [], verify: [], status: 'PENDING' };
  }
};

if (typeof module !== 'undefined') module.exports = { TaskDecomposer };
