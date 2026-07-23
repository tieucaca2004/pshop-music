// Facebook Comment AI Agent - Hu Tieu Xao A Tieu
// Native OpenClaw Workflow
// License: PSH Platform Internal

const fs = require('fs');
const path = require('path');
const https = require('https');

const KB_PATH = path.join(__dirname, 'knowledge', 'knowledge-base.json');
const LOG_PATH = path.join(__dirname, 'data', 'comments-log.jsonl');
const PAGE_ID = '109215528208008';
const API_HOST = 'graph.facebook.com';
const API_VER = 'v21.0';

// Load knowledge base
function loadKnowledge() {
  if (!fs.existsSync(KB_PATH)) {
    console.error('[AIAgent] Missing knowledge-base.json at', KB_PATH);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
}

// Graph API helper
function graph(path, params) {
  return new Promise((resolve, reject) => {
    var qs = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
    var opts = {
      hostname: API_HOST,
      path: '/' + API_VER + path + '?' + qs,
      method: 'GET',
      headers: {'User-Agent': 'OpenClaw-CommentAI/1.0'}
    };
    var req = https.request(opts, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('Parse error: ' + body.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Intent detection
function detectIntent(text, kb) {
  var t = text.toLowerCase().trim();

  // Define intents with keywords and priority
  var intents = [
    { name: 'menu', keywords: ['menu', 'th?c d?n', 'món ăn', 'ăn gì', 'có món'], faq: 'menu' },
    { name: 'address', keywords: ['địa chỉ', 'ở đâu', '??u', '??ng nào', 'maps', 'location'], faq: 'quán ở đâu' },
    { name: 'hours', keywords: ['giờ', 'm? c?a', 'mấy tiếng', 'tối', 'sáng'], faq: 'mấy giờ mở cửa' },
    { name: 'phone', keywords: ['số điện thoại', 'hotline', 'g?i', 'phone', 'call', 'liên h?'], faq: 'số điện thoại' },
    { name: 'grab', keywords: ['grab', 'grabfood', 'giao hàng', 'ship'], faq: 'grab' },
    { name: 'shopeefood', keywords: ['shopeefood', 'shopee'], faq: 'shopeefood' },
    { name: 'booking', keywords: ['đặt bàn', 'đặt món', 'reserve', 'book', 'đặt chỗ'], faq: 'đặt bàn' },
    { name: 'parking', keywords: ['đậu xe', 'gửi xe', 'xe máy', 'ô tô', 'parking'], faq: 'đậu xe' },
    { name: 'payment', keywords: ['thanh toán', 'trả tiền', 'tiền mặt', 'chuyển khoản', 'card'], faq: 'thanh toán' },
    { name: 'promo', keywords: ['khuyến mãi', 'giảm giá', 'sale', 'ưu đãi'], faq: 'khuyến mãi' },
    { name: 'busy', keywords: ['đông', 'vắng', 'ch?', 'gi? cao đi?m', 'x?p hàng'], faq: 'có đông không' },
    { name: 'wifi', keywords: ['wifi', 'mạng'], faq: 'wifi' },
    { name: 'price', keywords: ['giá', 'bao nhiêu', 'tiền', 'đ?t', 'r?'], faq: 'giá' },
    { name: 'complaint', keywords: ['không ngon', 'tệ', 'th?t v?ng', 'phàn nàn', 'khiếu nại'], faq: null },
    { name: 'praise', keywords: ['ngon', 'tuy?t', 'nh?t', 'ng?t', 't?t', 'thích'], faq: null },
    { name: 'unknown', keywords: ['spam', 'ads', 'xxx', 'link'], faq: null }
  ];

  // Score each intent
  var scores = intents.map(function(intent) {
    var matchCount = 0;
    for (var k of intent.keywords) {
      if (t.indexOf(k) >= 0) matchCount++;
    }
    var confidence = matchCount === 0 ? 0 : Math.min(100, Math.round((matchCount / intent.keywords.length) * 100 + 70));
    if (matchCount === 0) confidence = 0;
    return { intent: intent.name, confidence: confidence, matchCount: matchCount, faq: intent.faq };
  });

  scores.sort(function(a, b) { return b.confidence - a.confidence; });
  return scores[0];
}

// Generate reply from knowledge base
function generateReply(intent, kb) {
  if (!intent || intent.confidence < 80) return null;

  var nameMap = {menu:'menu', address:'địa chỉ', hours:'giờ', phone:'điện thoại', grab:'grab', shopeefood:'shopeefood', booking:'đặt', parking:'gửi xe', payment:'thanh toán', promo:'khuyến mãi', price:'giá', complaint:'khiếu nại', praise:'khen', unknown:'spam'};
  var target = nameMap[intent.intent] || intent.intent;

  for (var item of kb.intents) {
    if (item.reply && item.trigger.some(function(t) { return t.indexOf(target) >= 0 || target.indexOf(t) >= 0; })) {
      return item.reply;
    }
  }
  return null;
}

// Log comment activity
function logActivity(commentId, comment, reply, confidence, status) {
  var entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    commentId: commentId,
    comment: comment,
    reply: reply,
    confidence: confidence,
    status: status
  }) + '\n';
  fs.appendFileSync(LOG_PATH, entry, 'utf8');
}

// Main run
async function main() {
  var kb = loadKnowledge();
  var tokenFile = path.join(__dirname, '.facebook-credentials.json');
  if (!fs.existsSync(tokenFile)) {
    console.error('[AIAgent] Missing .facebook-credentials.json. Run:');
    console.error('  echo \'{\"pageAccessToken\":\"...\"}\' > ' + tokenFile);
    process.exit(1);
  }
  var creds = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
  var token = creds.pageAccessToken;

  // Test: detect intent from command line
  var testMsg = process.argv.slice(2).join(' ');
  if (testMsg) {
    var intent = detectIntent(testMsg, kb);
    var reply = generateReply(intent, kb);
    console.log('Comment:', testMsg);
    console.log('Intent:', intent.intent, '(' + intent.confidence + '%)');
    if (reply) console.log('Reply:', reply);
    else console.log('Reply: [below 80% - c?n duy?t]');
    return;
  }

  // Production: fetch latest comments
  console.log('[AIAgent] Fetching comments for page', PAGE_ID);
  var tokenFile = path.join(__dirname, '.facebook-credentials.json');
  if (!fs.existsSync(tokenFile)) {
    console.error('[AIAgent] Missing .facebook-credentials.json.');
    process.exit(1);
  }
  var comments = await graph('/' + PAGE_ID + '/feed', {
    fields: 'comments{id,message,from,created_time}',
    access_token: token,
    limit: 10
  });

  if (comments.error) {
    console.error('[AIAgent] API Error:', comments.error.message);
    console.error('[AIAgent] Can?t', comments.error.code, '-', comments.error.error_subcode || '');
    process.exit(1);
  }

  console.log('[AIAgent] Found', comments.data ? comments.data.length : 0, 'posts');
  process.exit(0);
}

main().catch(function(e) { console.error('[AIAgent] Fatal:', e.message); process.exit(1); });
