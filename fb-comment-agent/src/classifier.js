const fs = require('fs');
const path = require('path');

const INTENTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'knowledge', 'intents.json'), 'utf8'));

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classify(commentText) {
  if (!commentText || commentText.trim().length === 0) {
    return { intent: 'spam', confidence: 0.95, details: { reason: 'empty_comment' } };
  }

  const original = commentText.toLowerCase().trim();
  const normalized = normalize(commentText);

  // Check for link-only or emoji-only
  const hasLink = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/i.test(commentText);
  const hasEmoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu.test(commentText);
  const textParts = commentText.replace(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi, '').replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();

  if ((hasLink || hasEmoji) && textParts.length < 5) {
    return { intent: 'spam', confidence: 0.92, details: { reason: 'link_or_emoji_only' } };
  }

  let scores = {};

  for (const [intent, config] of Object.entries(INTENTS.intents)) {
    let matchedCount = 0;
    let matchedWords = [];

    for (const keyword of config.keywords) {
      const normKeyword = normalize(keyword);
      if (normalized.includes(normKeyword) || original.includes(keyword.toLowerCase())) {
        matchedCount++;
        matchedWords.push(keyword);
      }
    }

    // Base: 0.3 + (matched fraction * 0.7) for scoring
    if (matchedCount > 0) {
      const matchRatio = matchedCount / Math.max(config.keywords.length, 1);
      scores[intent] = Math.min(0.3 + matchRatio * 0.7, 0.99);
    } else {
      scores[intent] = 0;
    }
  }

  // Check special phrases for ask_hours
  if (/mấy giờ|mở cửa|đóng cửa|giờ mở/gi.test(original)) scores['ask_hours'] = Math.max(scores['ask_hours'] || 0, 0.88);
  
  // Check special phrases for ask_address
  if (/ở đâu|địa chỉ|maps|chỗ|đường nào|số mấy/gi.test(original)) scores['ask_address'] = Math.max(scores['ask_address'] || 0, 0.85);
  
  // Check for complaint words (negative context)
  if (/tệ|dở|không ngon|nhão|thất vọng|chậm|sai món|bẩn|đau bụng|phàn nàn|dở tệ|nhạt/gi.test(original)) {
    scores['complaint'] = Math.max(scores['complaint'] || 0, 0.88);
  }
  
  // Check for praise words (positive context, excluding questions)
  const isQuestion = /\?/gi.test(original) || /có.*không/gi.test(original) || /gì|nào|mấy/gi.test(original);
  if (/ngon quá|tuyệt|đỉnh|wow|quá ok|tuyệt vời|siêu ngon|rất ngon|ngon nhất/gi.test(original)) {
    scores['praise'] = Math.max(scores['praise'] || 0, 0.85);
  } else if (/ngon|thích|ngất|xuất sắc/gi.test(original) && !isQuestion) {
    scores['praise'] = Math.max(scores['praise'] || 0, 0.80);
  }
  
  // Check for delivery
  if (/grab|shipper|giao hàng|delivery|ship|baemin|shopeefood|now|mang về|takeaway/gi.test(original)) {
    scores['ask_delivery'] = Math.max(scores['ask_delivery'] || 0, 0.90);
  }

  // Check for price
  if (/bao nhiêu|giá|đắt|rẻ|tiền|tốn|hết/gi.test(original)) {
    scores['ask_price'] = Math.max(scores['ask_price'] || 0, 0.85);
  }

  // Check for menu
  if (/menu|thực đơn|món gì|món nào|các món|list món/gi.test(original)) {
    scores['ask_menu'] = Math.max(scores['ask_menu'] || 0, 0.85);
  }

  // Check for phone
  if (/số điện thoại|hotline|số phone|liên hệ|sdt|gọi quán/gi.test(original)) {
    scores['ask_phone'] = Math.max(scores['ask_phone'] || 0, 0.85);
  }

  // Check for promotion
  if (/khuyến mãi|giảm giá|coupon|voucher|sale|combo|ưu đãi/gi.test(original)) {
    scores['ask_promotion'] = Math.max(scores['ask_promotion'] || 0, 0.85);
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const best = sorted[0];

  // If nothing matched, it's likely spam or a generic comment
  if (best[1] === 0) {
    return { intent: 'spam', confidence: 0.6, details: { reason: 'no_match' } };
  }

  const second = sorted[1] || ['', 0];
  let confidence = best[1];

  // Reduce confidence if intents are close
  if (second[1] > confidence * 0.7 && second[1] > 0.3) {
    confidence *= 0.8;
  }

  return {
    intent: best[0],
    confidence: Math.round(confidence * 100) / 100,
    details: {
      wordCount: original.split(/\s+/).length,
      originalText: commentText.substring(0, 200)
    }
  };
}

function meetsThreshold(classification, threshold = 0.8) {
  return classification.confidence >= threshold;
}

module.exports = { classify, meetsThreshold };
