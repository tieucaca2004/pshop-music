const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const REVIEW_QUEUE_FILE = path.join(LOG_DIR, 'review-queue.json');
const COMMENTS_LOG = path.join(LOG_DIR, 'comments-log.ndjson');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Log a comment and its processing result
 */
function logComment(entry) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    commentId: entry.commentId || 'unknown',
    commentText: entry.commentText?.substring(0, 500) || '',
    commenterName: entry.commenterName || 'unknown',
    classification: entry.classification || {},
    intent: entry.intent || 'unknown',
    confidence: entry.confidence || 0,
    replied: entry.replied || false,
    replyText: entry.replyText ? entry.replyText.substring(0, 200) : null,
    sentToReview: entry.sentToReview || false,
    postId: entry.postId || 'unknown'
  };

  try {
    fs.appendFileSync(COMMENTS_LOG, JSON.stringify(logEntry) + '\n', 'utf8');
  } catch (err) {
    console.error('Logger error:', err.message);
  }
}

/**
 * Add a low-confidence comment to the review queue
 */
function addToReviewQueue(entry) {
  let queue = [];
  try {
    if (fs.existsSync(REVIEW_QUEUE_FILE)) {
      queue = JSON.parse(fs.readFileSync(REVIEW_QUEUE_FILE, 'utf8'));
    }
  } catch (err) {
    queue = [];
  }

  queue.push({
    id: `review_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    commentId: entry.commentId,
    commentText: entry.commentText,
    commenterName: entry.commenterName,
    postId: entry.postId,
    classification: entry.classification,
    suggestedIntent: entry.intent,
    confidence: entry.confidence,
    resolved: false,
    resolvedAt: null,
    ownerAction: null
  });

  fs.writeFileSync(REVIEW_QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
  return queue.length;
}

/**
 * Get all pending review items
 */
function getReviewQueue() {
  try {
    if (fs.existsSync(REVIEW_QUEUE_FILE)) {
      return JSON.parse(fs.readFileSync(REVIEW_QUEUE_FILE, 'utf8')).filter(item => !item.resolved);
    }
  } catch (err) {}
  return [];
}

/**
 * Mark a review item as resolved
 */
function resolveReviewItem(reviewId, action) {
  try {
    if (fs.existsSync(REVIEW_QUEUE_FILE)) {
      const queue = JSON.parse(fs.readFileSync(REVIEW_QUEUE_FILE, 'utf8'));
      const item = queue.find(i => i.id === reviewId);
      if (item) {
        item.resolved = true;
        item.resolvedAt = new Date().toISOString();
        item.ownerAction = action || 'viewed';
        fs.writeFileSync(REVIEW_QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
        return true;
      }
    }
  } catch (err) {}
  return false;
}

/**
 * Get recent comments log (last N entries)
 */
function getRecentLogs(count = 50) {
  try {
    if (!fs.existsSync(COMMENTS_LOG)) return [];
    const data = fs.readFileSync(COMMENTS_LOG, 'utf8');
    const lines = data.trim().split('\n').filter(Boolean);
    const recent = lines.slice(-count);
    return recent.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch (err) {
    return [];
  }
}

module.exports = {
  logComment,
  addToReviewQueue,
  getReviewQueue,
  resolveReviewItem,
  getRecentLogs
};
