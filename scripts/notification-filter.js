/**
 * Notification Filter — only SUCCESS/FAILED/USER ACTION REQUIRED to Telegram
 */
const NF = {
  ALLOWED: ['SUCCESS', 'FAILED', 'USER ACTION REQUIRED'],
  
  filter(msg) {
    if (!msg || msg.trim() === '') return null;
    const clean = msg.trim();
    for (const prefix of this.ALLOWED) {
      if (clean.startsWith(prefix + '\n') || clean === prefix) return clean;
    }
    return null; // suppressed
  },

  isAllowed(msg) {
    return this.filter(msg) !== null;
  },

  format(type, summary, maxLines=5) {
    const lines = [type, ...summary.split('\n')].slice(0, maxLines + 1);
    return lines.join('\n');
  }
};

if (typeof module !== 'undefined') module.exports = NF;
