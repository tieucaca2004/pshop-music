/**
 * Reporting — Telegram notification templates for all task states
 * Formats: FAILED, STALLED, RECOVERED, TIMEOUT, RUNNING
 */
const Reporting = {
  failed(task, rootCause, recovery, logLocation) {
    return `\u274c TASK FAILED

Task: ${task.name}
Current Step: ${task.currentStep || 'N/A'}
Duration: ${task.duration ? this._formatDuration(task.duration) : this._formatDuration(Date.now() - task.startTime)}
Root Cause: ${rootCause}
Recovery Attempted: ${recovery.attempted ? `Yes (${recovery.method})` : 'No'}
Recovery Result: ${recovery.attempted ? (recovery.succeeded ? 'Success' : 'Failed') : 'Not attempted'}
Recommended Action: ${recovery.attempted && !recovery.succeeded ? 'Manual intervention required' : 'Check logs and retry'}
Log: ${logLocation}`;
  },

  stalled(task, possibleCause, recoveryStatus) {
    return `\u26a0 TASK STALLED

Task: ${task.name}
Current Step: ${task.currentStep || 'N/A'}
Last Progress: ${this._formatAgo(task.lastProgress)}
Elapsed: ${this._formatDuration(Date.now() - task.startTime)}
Possible Cause: ${possibleCause}
Recovery: ${recoveryStatus}`;
  },

  recovered(task, originalError, recoveryMethod) {
    return `\u2705 TASK RECOVERED

Original Error: ${originalError}
Recovery Method: ${recoveryMethod}
Execution Continued: Yes
Duration: ${this._formatDuration(task.duration || (Date.now() - task.startTime))}`;
  },

  timeout(task, elapsed, limit) {
    return `\u23f0 TASK TIMEOUT

Task: ${task.name}
Elapsed: ${this._formatDuration(elapsed)}
Limit: ${this._formatDuration(limit)}
Current Step: ${task.currentStep || 'N/A'}
Action: Task aborted, recovery attempted`;
  },

  running(task, current, total, elapsed, step, remaining) {
    if (!task._progressEnabled) return null;
    return `RUNNING

Task: ${task.name}
Progress: ${current} / ${total}
Elapsed: ${this._formatDuration(elapsed)}
Current Step: ${step}
Estimated Remaining: ${remaining || 'Unknown'}`;
  },

  _formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h.toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  },

  _formatAgo(timestamp) {
    const ago = Math.floor((Date.now() - timestamp) / 1000);
    if (ago < 60) return `${ago}s ago`;
    if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
    return `${Math.floor(ago / 3600)}h ago`;
  }
};

if (typeof module !== 'undefined') module.exports = { Reporting };
