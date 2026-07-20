/**
 * Watchdog — Monitor every running task for heartbeat, stall, timeout
 * Track: current step, start time, last progress, heartbeat, duration
 */
const Watchdog = {
  tasks: new Map(),
  
  HEARTBEAT_INTERVAL_MS: 30000,  // 30 seconds
  STALL_TIMEOUT_MS: 300000,       // 5 minutes
  DEFAULT_TIMEOUT_MS: 600000,     // 10 minutes

  register(taskId, taskName, expectedDurationMs = 300000, maxTimeoutMs = 600000) {
    const task = {
      id: taskId,
      name: taskName,
      state: 'RUNNING',
      currentStep: 'initializing',
      startTime: Date.now(),
      lastProgress: Date.now(),
      lastHeartbeat: Date.now(),
      expectedDurationMs,
      maxTimeoutMs,
      retries: 0,
      maxRetries: 3,
      error: null,
      recoveryAttempts: []
    };
    this.tasks.set(taskId, task);
    return task;
  },

  heartbeat(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.lastHeartbeat = Date.now();
    task.lastProgress = Date.now();
    return task;
  },

  progress(taskId, step) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.currentStep = step;
    task.lastProgress = Date.now();
    return task;
  },

  check(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return { status: 'UNKNOWN', reason: 'Task not found' };
    
    const now = Date.now();
    const elapsed = now - task.startTime;
    const sinceProgress = now - task.lastProgress;
    const sinceHeartbeat = now - task.lastHeartbeat;

    // Check timeout
    if (elapsed > task.maxTimeoutMs) {
      task.state = 'TIMEOUT';
      task.error = `Exceeded max timeout of ${task.maxTimeoutMs}ms`;
      return { status: 'TIMEOUT', elapsed, timeout: task.maxTimeoutMs };
    }

    // Check stall
    if (sinceProgress > this.STALL_TIMEOUT_MS) {
      task.state = 'STALLED';
      task.error = `No progress for ${sinceProgress}ms (threshold: ${this.STALL_TIMEOUT_MS}ms)`;
      return { status: 'STALLED', elapsed, stalledFor: sinceProgress, step: task.currentStep };
    }

    // Check heartbeat
    if (sinceHeartbeat > this.HEARTBEAT_INTERVAL_MS * 2) {
      // Delayed heartbeat - warn but don't stall
      return { status: 'WARNING', reason: 'Heartbeat delayed', sinceHeartbeat };
    }

    return { status: 'RUNNING', elapsed, step: task.currentStep };
  },

  complete(taskId, result = 'SUCCESS') {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.state = result;
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    return task;
  },

  fail(taskId, error, rootCause = 'unknown') {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.state = 'FAILED';
    task.error = error;
    task.rootCause = rootCause;
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    return task;
  },

  retry(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (task.retries >= task.maxRetries) {
      task.state = 'FAILED';
      return { canRetry: false, reason: `Max retries (${task.maxRetries}) exceeded` };
    }
    task.retries++;
    task.state = 'RETRYING';
    task.lastProgress = Date.now();
    return { canRetry: true, attempt: task.retries, maxRetries: task.maxRetries };
  },

  getStatus(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    const now = Date.now();
    return {
      id: task.id,
      name: task.name,
      state: task.state,
      step: task.currentStep,
      elapsed: now - task.startTime,
      duration: task.duration || null,
      retries: task.retries,
      error: task.error,
      rootCause: task.rootCause
    };
  },

  getAllTasks() {
    return Array.from(this.tasks.values()).map(t => ({
      id: t.id,
      name: t.name,
      state: t.state,
      step: t.currentStep,
      elapsed: Date.now() - t.startTime,
      retries: t.retries
    }));
  }
};

if (typeof module !== 'undefined') module.exports = { Watchdog };
