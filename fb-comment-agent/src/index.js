#!/usr/bin/env node
/**
 * Facebook Comment AI Agent - Á Tiểu Nhị
 * 
 * Automatically replies to comments on Facebook Page.
 * NOT for Messenger, NOT a chatbot.
 * 
 * Usage:
 *   node src/index.js check         - Check comments once
 *   node src/index.js watch         - Watch continuously (every N minutes)
 *   node src/index.js review        - Show review queue
 *   node src/index.js resolve <id>  - Resolve a review item
 *   node src/index.js logs          - Show recent logs
 *   node src/index.js version       - Show version
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/settings.json');
const { classify, meetsThreshold } = require('./classifier');
const { getReply } = require('./reply-generator');
const logger = require('./logger');

const restaurant = require('../knowledge/restaurant-info.json');
const VERSION = '1.0.0';

// ============================================================
//  Facebook Graph API Integration
// ============================================================

class FacebookAPI {
  constructor(pageId, accessToken) {
    this.pageId = pageId;
    this.accessToken = accessToken;
    this.baseUrl = 'https://graph.facebook.com/v19.0';
  }

  /**
   * Get recent comments on the page's posts
   */
  async getRecentComments(sinceMinutes = 30) {
    try {
      const since = Math.floor(Date.now() / 1000) - sinceMinutes * 60;
      // Step 1: Get recent posts
      const postsUrl = `${this.baseUrl}/${this.pageId}/posts?fields=id,message,created_time&since=${since}&limit=10&access_token=${this.accessToken}`;
      const postsRes = await fetch(postsUrl);
      const postsData = await postsRes.json();

      if (postsData.error) {
        console.error('Facebook API Error:', postsData.error.message);
        return [];
      }

      if (!postsData.data || postsData.data.length === 0) return [];

      // Step 2: Get comments for each post
      const comments = [];
      for (const post of postsData.data) {
        try {
          const commentsUrl = `${this.baseUrl}/${post.id}/comments?fields=id,message,from{name,id},created_time&access_token=${this.accessToken}`;
          const commentsRes = await fetch(commentsUrl);
          const commentsData = await commentsRes.json();

          if (commentsData.data) {
            for (const c of commentsData.data) {
              comments.push({
                id: c.id,
                postId: post.id,
                text: c.message || '',
                authorName: c.from?.name || 'Unknown',
                authorId: c.from?.id || 'unknown',
                createdAt: c.created_time,
                postMessage: post.message || ''
              });
            }
          }
        } catch (e) {
          // Skip if comments fetch fails for one post
        }
      }
      return comments;
    } catch (err) {
      console.error('Facebook API Error:', err.message);
      return [];
    }
  }

  /**
   * Reply to a comment
   */
  async replyToComment(commentId, message) {
    try {
      const url = `${this.baseUrl}/${commentId}/comments?message=${encodeURIComponent(message)}&access_token=${this.accessToken}`;
      const response = await fetch(url, { method: 'POST' });
      const data = await response.json();

      if (data.error) {
        console.error('Reply Error:', data.error.message);
        return { success: false, error: data.error.message };
      }
      return { success: true, replyId: data.id };
    } catch (err) {
      console.error('Reply Error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

// ============================================================
//  Comment Processor
// ============================================================

class CommentProcessor {
  constructor(api) {
    this.api = api;
    this.processedIds = new Set();
  }

  /**
   * Process a single comment: classify, reply or queue
   */
  async process(comment) {
    // Skip already processed
    if (this.processedIds.has(comment.id)) return null;
    this.processedIds.add(comment.id);

    // Skip empty comments
    if (!comment.text || comment.text.trim().length < 2) return null;

    // Classify
    const classification = classify(comment.text);
    const { intent, confidence, details } = classification;

    const result = {
      commentId: comment.id,
      commentText: comment.text,
      commenterName: comment.authorName,
      postId: comment.postId,
      intent,
      confidence,
      replied: false,
      replyText: null,
      sentToReview: false,
      classification
    };

    // Spam check
    if (intent === 'spam' && confidence >= 0.85) {
      result.skipped = true;
      result.why = 'classified_as_spam';
      logger.logComment(result);
      return result;
    }

    // Check confidence threshold
    const threshold = config.agent.confidenceThreshold;
    if (!meetsThreshold(classification, threshold) && intent !== 'complaint' && intent !== 'praise') {
      // Low confidence → review queue
      result.sentToReview = true;
      logger.addToReviewQueue({
        commentId: comment.id,
        commentText: comment.text,
        commenterName: comment.authorName,
        postId: comment.postId,
        classification,
        intent,
        confidence
      });
      logger.logComment(result);
      return result;
    }

    // Generate reply
    const reply = getReply(intent);
    if (!reply) {
      // No reply template found → queue for review
      result.sentToReview = true;
      result.why = 'no_reply_template';
      logger.addToReviewQueue({
        commentId: comment.id,
        commentText: comment.text,
        commenterName: comment.authorName,
        postId: comment.postId,
        classification,
        intent,
        confidence
      });
      logger.logComment(result);
      return result;
    }

    // Send reply via Facebook API
    if (config.agent.autoReplyEnabled) {
      const sendResult = await this.api.replyToComment(comment.id, reply);
      result.replied = sendResult.success;
      result.replyText = reply;
      result.replyError = sendResult.error || null;
    } else {
      result.replied = false;
      result.replyText = reply;
      result.why = 'auto_reply_disabled';
    }

    logger.logComment(result);
    return result;
  }

  /**
   * Process all new comments
   */
  async processAll(sinceMinutes = 30) {
    const comments = await this.api.getRecentComments(sinceMinutes);
    if (comments.length === 0) return [];

    const results = [];
    for (const comment of comments) {
      const result = await this.process(comment);
      if (result) results.push(result);
    }
    return results;
  }
}

// ============================================================
//  CLI Interface
// ============================================================

async function main() {
  const cmd = process.argv[2] || 'help';
  const accessToken = process.env.FB_PAGE_ACCESS_TOKEN || config.facebook?.accessToken;

  switch (cmd) {
    case 'check': {
      if (!accessToken) {
        console.log('❌ FB_PAGE_ACCESS_TOKEN not set. Set it or add accessToken to config/settings.json');
        process.exit(1);
      }
      const api = new FacebookAPI(config.facebook.pageId, accessToken);
      const processor = new CommentProcessor(api);
      console.log(`🔍 Checking for new comments on ${restaurant.restaurant.name}...`);
      const results = await processor.processAll(60);
      console.log(`\n📊 Results: ${results.length} comment(s) processed`);
      for (const r of results) {
        const status = r.replied ? '✅ Replied' : r.sentToReview ? '📋 Queued for review' : r.skipped ? '⏭️ Skipped' : '❓ Unknown';
        console.log(`  ${status} | "${r.commentText?.substring(0, 50)}..." → [${r.intent}] (${Math.round(r.confidence * 100)}%)`);
      }
      break;
    }

    case 'watch': {
      if (!accessToken) {
        console.log('❌ FB_PAGE_ACCESS_TOKEN not set.');
        process.exit(1);
      }
      const interval = config.agent.checkIntervalMinutes * 60 * 1000;
      console.log(`👀 Watching ${restaurant.restaurant.name} page every ${config.agent.checkIntervalMinutes} minutes...`);
      const api = new FacebookAPI(config.facebook.pageId, accessToken);
      const processor = new CommentProcessor(api);

      const run = async () => {
        try {
          const results = await processor.processAll(config.agent.checkIntervalMinutes + 10);
          if (results.length > 0) {
            console.log(`[${new Date().toLocaleString('vi-VN')}] ${results.length} comment(s) processed`);
          }
        } catch (err) {
          console.error('Watch error:', err.message);
        }
      };

      await run();
      setInterval(run, interval);
      break;
    }

    case 'review': {
      const queue = logger.getReviewQueue();
      if (queue.length === 0) {
        console.log('📋 Review queue is empty. No pending items.');
      } else {
        console.log(`📋 Review Queue — ${queue.length} pending item(s):\n`);
        for (const item of queue) {
          console.log(`  ID: ${item.id}`);
          console.log(`  From: ${item.commenterName}`);
          console.log(`  Comment: "${item.commentText?.substring(0, 80)}..."`);
          console.log(`  Suggested: [${item.suggestedIntent}] (${Math.round(item.confidence * 100)}%)`);
          console.log(`  Date: ${item.timestamp}`);
          console.log(`  → Resolve: node src/index.js resolve ${item.id}\n`);
        }
      }
      break;
    }

    case 'resolve': {
      const reviewId = process.argv[3];
      if (!reviewId) {
        console.log('❌ Usage: node src/index.js resolve <review_id>');
        process.exit(1);
      }
      const action = process.argv[4] || 'resolved';
      const ok = logger.resolveReviewItem(reviewId, action);
      console.log(ok ? `✅ Review item ${reviewId} resolved` : `❌ Item ${reviewId} not found`);
      break;
    }

    case 'logs': {
      const count = parseInt(process.argv[3]) || 20;
      const logs = logger.getRecentLogs(count);
      if (logs.length === 0) {
        console.log('📝 No logs found.');
      } else {
        console.log(`📝 Recent ${logs.length} log(s):\n`);
        for (const log of logs) {
          const status = log.replied ? '✅' : log.sentToReview ? '📋' : '⏭️';
          console.log(`  ${status} [${log.intent}] ${log.timestamp?.substring(0, 19)} | "${log.commentText?.substring(0, 50)}..."`);
        }
      }
      break;
    }

    case 'version':
      console.log(`Facebook Comment AI Agent v${VERSION}`);
      console.log(`Restaurant: ${restaurant.restaurant.name}`);
      break;

    case 'help':
    default:
      console.log(`
Facebook Comment AI Agent — ${restaurant.restaurant.name}
Version ${VERSION}

Usage:
  node src/index.js check         Check for new comments (one-time)
  node src/index.js watch         Watch continuously (every ${config.agent.checkIntervalMinutes} min)
  node src/index.js review        Show review queue
  node src/index.js resolve <id>  Resolve a review item
  node src/index.js logs          Show recent logs
  node src/index.js version       Show version
  node src/index.js help          Show this help

Setup:
  1. Set FB_PAGE_ACCESS_TOKEN environment variable
  2. Edit config/settings.json
  3. Edit knowledge/restaurant-info.json with your info
  4. Edit knowledge/intents.json or src/reply-generator.js for custom replies

Manual Test (no FB token needed):
  node src/index.js test-classify "Cho xin menu"
`);
      break;

    // Hidden: test classification without FB
    case 'test-classify': {
      const testText = process.argv.slice(3).join(' ') || 'Cho xin menu';
      const result = classify(testText);
      console.log(`\n🔬 Classification Test\n`);
      console.log(`  Input: "${testText}"`);
      console.log(`  Intent: [${result.intent}]`);
      console.log(`  Confidence: ${Math.round(result.confidence * 100)}%`);
      console.log(`  Threshold met: ${meetsThreshold(result) ? '✅ Yes' : '❌ No'}`);
      console.log(`  Details:`, result.details);
      break;
    }

    case 'test-reply': {
      const testText = process.argv.slice(3).join(' ') || 'Cho xin menu';
      const result = classify(testText);
      const reply = getReply(result.intent);
      console.log(`\n🔬 Reply Test\n`);
      console.log(`  Input: "${testText}"`);
      console.log(`  Intent: [${result.intent}]`);
      console.log(`  Confidence: ${Math.round(result.confidence * 100)}%`);
      console.log(`  Reply:\n${reply ? reply.substring(0, 500) : '(no reply for ' + result.intent + ')'}`);
      break;
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
