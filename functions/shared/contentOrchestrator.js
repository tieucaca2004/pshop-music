/*
 * shared/contentOrchestrator.js — CONTENT ORCHESTRATOR + Telegram Product Intake.
 *
 * Điều phối: intake → validate → save draft → generate content → process image → preview → (approval, ở
 * routes/fbPublisher.js) → publish → result. Dùng lại fbDraftStore (state machine + approveTransaction),
 * fbPageConfig, aiGenerate, shared/telegram — KHÔNG tạo pipeline song song.
 *
 * Bất biến:
 *   - Không bao giờ đăng bài ở module này. Đăng chỉ xảy ra sau nút DUYỆT hợp lệ (fbPublisher.js).
 *   - Webhook gửi lặp không tạo thêm bản nháp: mỗi update_id được "claim" nguyên tử (transaction) ở
 *     telegramUpdates/{update_id}; claim treo > CLAIM_STALE_MS mới được tiếp quản và chạy tiếp ĐÚNG bản nháp cũ.
 *   - Mỗi bước ghi trạng thái vào draft.steps; chạy lại pipeline bỏ qua bước đã 'ok' (idempotent).
 *   - pageId KHÔNG lấy từ tin nhắn một cách mù quáng: chỉ nhận Page mà server có token hợp lệ
 *     (fbPageConfig.getPageToken) và đã xác minh bằng Graph (getPageInfo) — mặc định Page đang active.
 *   - Người gửi phải qua checkApprover (chat + approverIds) VÀ resolvePshActor (ánh xạ uid PSH + quyền hiện hành).
 *   - Không ghi token/URL Telegram vào log hay draft.
 */
'use strict';
const admin = require('firebase-admin');
const fbDraftStore = require('./fbDraftStore');
const fbPageConfig = require('./fbPageConfig');
const telegram = require('./telegram');
const media = require('./telegramMedia');
const imageRouter = require('./imageRouter');
const graph = require('../facebook-graph-api');
const { resolvePshActor } = require('./approverPolicy');

const CLAIM_STALE_MS = 5 * 60 * 1000;
const MAX_MESSAGE_AGE_S = 60 * 60;      // tin nhắn cũ hơn 1 giờ bị coi là phát lại và bỏ qua
const AI_TIMEOUT_MS = 60 * 1000;
const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DRAFT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// ── Parse tin nhắn sản phẩm ──────────────────────────────────────────────────

function stripDiacritics(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D'); }
function cleanText(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Trả số VND nguyên hoặc null.
function parsePriceVnd(raw) {
  let t = stripDiacritics(String(raw == null ? '' : raw)).toLowerCase().replace(/\s+/g, '');
  t = t.replace(/(vnd|dong|d)$/g, '');
  let v = null; let m;
  if ((m = t.match(/^(\d+)(?:tr|trieu|m)(\d{1,3})$/))) v = Number(m[1]) * 1e6 + Math.round(Number('0.' + m[2]) * 1e6);
  else if ((m = t.match(/^(\d+(?:[.,]\d+)?)(?:tr|trieu|m)$/))) v = Math.round(parseFloat(m[1].replace(',', '.')) * 1e6);
  else if ((m = t.match(/^(\d+(?:[.,]\d+)?)k$/))) v = Math.round(parseFloat(m[1].replace(',', '.')) * 1e3);
  else if (/^\d{1,3}([.,]\d{3})+$/.test(t)) v = Number(t.replace(/[.,]/g, ''));
  else if (/^\d+$/.test(t)) v = Number(t);
  if (v == null || !isFinite(v) || v < 1000 || v > 1e10) return null;
  return v;
}
function formatVnd(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ'; }

const LABELS = {
  ten: 'name', 'ten san pham': 'name', 'san pham': 'name',
  gia: 'price', 'gia ban': 'price',
  'tinh trang': 'condition', 'tinh trang may': 'condition',
  page: 'page', fanpage: 'page', trang: 'page'
};
const TEMPLATE = 'Tên: <tên sản phẩm>\nGiá: <giá, vd 3.500.000 hoặc 3tr5>\nTình trạng: <vd Mới 100% / Like new 95%>\nPage: <ID Fanpage — bỏ trống để dùng Page đang chọn>';

// parseProductCaption — chấp nhận các dòng "Nhãn: giá trị" (không phân biệt hoa thường/dấu).
function parseProductCaption(text) {
  const out = { name: null, price: null, condition: null, pageHint: null };
  const errors = [];
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  for (const line of lines) {
    const idx = line.search(/[:：]/);
    if (idx <= 0) continue;
    const key = stripDiacritics(line.slice(0, idx)).toLowerCase().replace(/\s+/g, ' ').trim();
    const field = LABELS[key];
    if (!field) continue;
    const val = line.slice(idx + 1);
    if (field === 'name') out.name = cleanText(val, 120);
    else if (field === 'condition') out.condition = cleanText(val, 80);
    else if (field === 'page') out.pageHint = cleanText(val, 64) || null;
    else if (field === 'price') { out.price = parsePriceVnd(val); if (out.price == null) errors.push('Giá không hợp lệ (cần số tiền VND từ 1.000đ trở lên).'); }
  }
  if (!out.name) errors.push('Thiếu tên sản phẩm.');
  if (out.price == null && !errors.some(e => e.startsWith('Giá'))) errors.push('Thiếu giá.');
  if (!out.condition) errors.push('Thiếu tình trạng.');
  return { ok: errors.length === 0, product: { name: out.name, price: out.price, condition: out.condition }, pageHint: out.pageHint, errors };
}

// ── Telegram helpers ─────────────────────────────────────────────────────────

async function reply(tgConfig, chatId, text) {
  if (!tgConfig || !tgConfig.token || chatId == null) return { ok: false };
  try { return await telegram.sendMessage({ token: tgConfig.token, chatId, text: String(text).slice(0, 3900) }); } catch (e) { return { ok: false }; }
}

// ── Claim idempotency ────────────────────────────────────────────────────────

async function claimUpdate(updateId) {
  const ref = admin.database().ref('telegramUpdates/' + updateId);
  let takeover = null;
  const res = await ref.transaction((cur) => {
    takeover = null;
    const now = Date.now();
    if (cur == null) return { state: 'processing', startedAt: now };
    if (cur.state === 'processing' && now - (cur.startedAt || 0) > CLAIM_STALE_MS) { takeover = cur.draftId || null; return Object.assign({}, cur, { startedAt: now }); }
    return undefined; // trùng → abort
  });
  return { claimed: !!res.committed, takeoverDraftId: res.committed ? takeover : null };
}
async function finishClaim(updateId, patch) {
  await admin.database().ref('telegramUpdates/' + updateId).update(Object.assign({ finishedAt: Date.now() }, patch));
}

// ── Chọn Fanpage (không tin pageId từ tin nhắn) ──────────────────────────────

async function resolveTargetPage(pageHint) {
  const conn = await admin.database().ref('facebookConnection/status').once('value');
  if (conn.exists() && conn.val() === 'not_connected') return { ok: false, error: 'Facebook đang ở trạng thái đã ngắt kết nối. Super Admin cần kết nối lại trong trang quản trị.' };
  let pageId = pageHint;
  if (!pageId) {
    const act = await admin.database().ref('facebookActiveToken/pageId').once('value');
    pageId = act.exists() ? String(act.val()) : '';
    if (!pageId) return { ok: false, error: 'Chưa có Fanpage nào được chọn. Super Admin cần kết nối và chọn Page trong trang quản trị.' };
  }
  if (!PAGE_ID_PATTERN.test(pageId)) return { ok: false, error: 'Page ID không hợp lệ.' };
  const tok = await fbPageConfig.getPageToken(pageId);
  if (!tok) return { ok: false, error: 'Page "' + pageId + '" chưa được kết nối hoặc không có token. Chỉ đăng được lên Page đã kết nối trong trang quản trị.' };
  try {
    const info = await graph.getPageInfo({ mockMode: !!tok.isMock, pageId, pageAccessToken: tok.accessToken });
    return { ok: true, pageId, pageName: cleanText(info && info.name, 120) || pageId, isMock: !!tok.isMock };
  } catch (e) {
    return { ok: false, error: 'Token không truy cập được Page "' + pageId + '": ' + media.redact(e && e.message).slice(0, 160) };
  }
}

// ── Bước nội dung ────────────────────────────────────────────────────────────

function factsBlock(product) {
  return '💰 Giá: ' + formatVnd(product.price) + '\n📦 Tình trạng: ' + product.condition;
}
function templateCaption(product) {
  return product.name + '\n\n' + 'Sản phẩm sẵn tại Pshop Music. Liên hệ để được tư vấn và xem hàng trực tiếp.' + '\n\n' + factsBlock(product);
}
async function generateCaption(draft, deps) {
  const p = draft.product;
  const topic = 'Sản phẩm: ' + p.name + '. Tình trạng: ' + p.condition + '. CHỈ dùng đúng thông tin này; không bịa thông số, không nêu giá, không thêm link hay hashtag liên quan giá.';
  let timer = null;
  try {
    const timeoutMs = Number(deps.aiTimeoutMs) > 0 ? Number(deps.aiTimeoutMs) : AI_TIMEOUT_MS;
    const ai = await Promise.race([
      deps.generateForModule('facebook-post-generator', { topic }, deps.uid, deps.email),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('AI timeout')), timeoutMs); })
    ]);
    const content = (ai && (ai.content || ai)) || {};
    const v = content.versions && content.versions[0];
    const parts = [];
    if (v) { if (v.hook) parts.push(v.hook); if (v.caption) parts.push(v.caption); if (v.cta) parts.push(v.cta); }
    else if (content.caption) parts.push(content.caption);
    let body = cleanTextKeepLines(parts.join('\n\n'), 1500);
    if (!body) throw new Error('AI trả nội dung rỗng');
    const tags = v && Array.isArray(v.hashtags) ? v.hashtags.map(t => String(t).replace(/[^\p{L}\p{N}_#]/gu, '')).filter(Boolean).slice(0, 6).map(t => t.startsWith('#') ? t : '#' + t).join(' ') : '';
    // Giá + tình trạng luôn do hệ thống chèn từ dữ liệu người gửi — AI không thể làm sai lệch.
    return { caption: body + '\n\n' + factsBlock(p) + (tags ? '\n\n' + tags : ''), source: 'ai', note: null };
  } catch (e) {
    return { caption: templateCaption(p), source: 'template', note: 'AI tạo nội dung lỗi/không khả dụng — đang dùng nội dung mẫu, hãy kiểm tra kỹ trước khi duyệt.' };
  } finally { if (timer) clearTimeout(timer); }
}
function cleanTextKeepLines(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

// ── Preview ──────────────────────────────────────────────────────────────────

function buildPreviewText(draft) {
  const p = draft.product || {};
  const lines = ['📋 Xem trước bài đăng Facebook', 'Fanpage: ' + (draft.pageName || draft.pageId) + ' (' + draft.pageId + ')',
    'Sản phẩm: ' + (p.name || '') + ' — ' + (p.price ? formatVnd(p.price) : '') + ' — ' + (p.condition || ''), 'Phiên bản: v' + (draft.version || 1), ''];
  lines.push(draft.aiCaption || draft.caption || '');
  const notices = Array.isArray(draft.notices) ? draft.notices : [];
  if (notices.length) { lines.push(''); for (const n of notices) lines.push('⚠️ ' + n); }
  lines.push(''); lines.push('Ảnh đăng: ' + (draft.imageMode === 'composited' ? 'ảnh quảng cáo (nền mới, sản phẩm giữ nguyên pixel gốc)' : 'ẢNH GỐC (chưa ghép nền)'));
  return lines.join('\n');
}

async function sendPreview(tgConfig, draft) {
  const v = draft.version || 1;
  const replyMarkup = { inline_keyboard: [[
    { text: '✅ DUYỆT & ĐĂNG', callback_data: 'fb_approve:' + draft.id + ':' + v },
    { text: '❌ HỦY', callback_data: 'fb_cancel:' + draft.id }
  ]] };
  const text = buildPreviewText(draft);
  const img = Array.isArray(draft.publishImages) && draft.publishImages[0];
  if (img && text.length <= 1000) {
    return telegram.sendPhoto({ token: tgConfig.token, chatId: tgConfig.chatId, photo: img, caption: text, replyMarkup });
  }
  if (img) {
    const ph = await telegram.sendPhoto({ token: tgConfig.token, chatId: tgConfig.chatId, photo: img, caption: 'Ảnh sẽ đăng — ' + ((draft.product && draft.product.name) || '') });
    if (!ph || !ph.ok) return ph;
  }
  return telegram.sendMessage({ token: tgConfig.token, chatId: tgConfig.chatId, text: text.slice(0, 3900), replyMarkup });
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

async function saveSteps(draftId, steps) { await fbDraftStore.patchFields(draftId, { steps }); }
function markStep(steps, name, status, note) { steps[name] = { status, at: Date.now(), note: note || null }; }

// runPipeline — chạy các bước còn lại của một draft đang PROCESSING. Idempotent.
async function runPipeline(draftId, deps) {
  let draft = await fbDraftStore.getDraft(draftId);
  if (!draft) return { ok: false, reason: 'not_found' };
  if (draft.status !== 'PROCESSING') return { ok: true, skipped: true, status: draft.status };
  const steps = Object.assign({}, draft.steps || {});
  const notices = Array.isArray(draft.notices) ? draft.notices.slice() : [];
  const done = (n) => steps[n] && steps[n].status === 'ok';
  const addNotice = (n) => { if (n && notices.indexOf(n) < 0) notices.push(n); };

  // 1) content
  if (!done('content')) {
    const cap = await generateCaption(draft, deps);
    if (cap.note) addNotice(cap.note);
    await fbDraftStore.patchFields(draftId, { aiCaption: cap.caption, contentSource: cap.source, notices });
    markStep(steps, 'content', 'ok', cap.source); await saveSteps(draftId, steps);
    draft = await fbDraftStore.getDraft(draftId);
  }

  // 2) image
  if (!done('image')) {
    let original = null;
    try { original = await media.readFromStorage(draft.originalStoragePath); } catch (e) { original = null; }
    const routed = original ? await imageRouter.routeImage(draft, original, deps)
      : { status: 'failed', provider: null, note: 'Không đọc được ảnh gốc từ kho lưu trữ.' };
    const fields = {};
    if (routed.status === 'ok') {
      fields.generatedImageUrl = routed.url; fields.publishImages = [routed.url]; fields.imageMode = 'composited'; fields.finalStoragePath = routed.storagePath;
    } else {
      fields.generatedImageUrl = null; fields.publishImages = Array.isArray(draft.imageUrls) ? draft.imageUrls.slice(0, 1) : []; fields.imageMode = 'original';
      addNotice('Ảnh quảng cáo CHƯA được tạo (' + routed.status + '): ' + (routed.note || 'không rõ lý do') + ' Nếu duyệt, bài sẽ đăng bằng ảnh GỐC.');
    }
    fields.notices = notices;
    await fbDraftStore.patchFields(draftId, fields);
    // Mọi kết quả (ok/skipped/blocked/failed) đều là "đã xử lý xong bước" vì người duyệt đã được báo rõ qua notices;
    // kết quả thật được giữ ở steps.image.result để truy vết.
    markStep(steps, 'image', 'ok', routed.note);
    steps.image.result = routed.status;
    await saveSteps(draftId, steps);
    draft = await fbDraftStore.getDraft(draftId);
  }

  // 3) preview → PENDING_APPROVAL
  const tgConfig = await getTgConfig();
  if (!tgConfig.token || !tgConfig.chatId) {
    await fbDraftStore.updateStatus(draftId, 'FAILED', { failReason: 'Thiếu telegramConfig.token/chatId để gửi bản xem trước.', failStage: 'preview' });
    return { ok: false, reason: 'telegram_not_configured' };
  }
  await fbDraftStore.updateStatus(draftId, 'PENDING_APPROVAL');
  draft = await fbDraftStore.getDraft(draftId);
  const sent = await sendPreview(tgConfig, draft);
  if (!sent || !sent.ok) {
    markStep(steps, 'preview', 'failed', 'Gửi xem trước thất bại'); await saveSteps(draftId, steps);
    await admin.database().ref('fbPostDrafts/' + draftId).update({ status: 'CANCELLED', failReason: 'Không gửi được bản xem trước Telegram.', failStage: 'preview', updatedAt: Date.now() });
    return { ok: false, reason: 'preview_failed' };
  }
  const msgId = sent.result && sent.result.result && sent.result.result.message_id;
  markStep(steps, 'preview', 'ok', null);
  await fbDraftStore.patchFields(draftId, { steps, telegramMessageId: msgId || null, telegramChatId: String(tgConfig.chatId) });
  return { ok: true, draftId, status: 'PENDING_APPROVAL' };
}

async function getTgConfig() {
  const snap = await admin.database().ref('telegramConfig').once('value');
  return snap.val() || {};
}

function defaultDeps(actor) {
  return {
    fetch: global.fetch,
    generateForModule: (...a) => require('./aiGenerate').generateForModule(...a),
    uid: actor && actor.uid || null,
    email: null
  };
}

// ── Xử lý một tin nhắn Telegram ──────────────────────────────────────────────

const HELP = 'Gửi 1 ẢNH sản phẩm kèm chú thích theo mẫu:\n\n' + TEMPLATE + '\n\nSau đó bạn sẽ nhận bản xem trước với nút DUYỆT / HỦY. Lệnh: /retry <mã bản nháp> để duyệt lại bài đăng lỗi.';

async function handleTelegramMessage(update, depsIn) {
  const message = update && update.message;
  if (!message || !message.from || !message.chat || typeof update.update_id !== 'number') return { handled: false, reason: 'not_a_message' };
  const tgConfig = (depsIn && depsIn.tgConfig) || await getTgConfig();
  const { checkApprover } = require('../routes/fbPublisher');
  // Chống phát lại: tin nhắn có thời điểm gửi quá cũ bị bỏ qua (Telegram retry thật chỉ trong thời gian ngắn).
  if (typeof message.date === 'number' && Date.now() / 1000 - message.date > MAX_MESSAGE_AGE_S) return { handled: true, skipped: true, reason: 'stale_message' };

  // 1) Chat + người gửi (fail-closed). Chat lạ: im lặng.
  const who = checkApprover({ from: message.from, message: { chat: message.chat } }, tgConfig);
  if (!who.ok) {
    if (who.reason === 'chat_mismatch' || who.reason === 'chat_not_configured' || who.reason === 'chat_config_invalid') return { handled: true, skipped: true, reason: who.reason };
    await reply(tgConfig, message.chat.id, '⛔ Bạn không có quyền gửi sản phẩm / duyệt bài trong PSH.\nTelegram ID của bạn: ' + message.from.id + ' (gửi cho Founder để được cấp quyền).');
    return { handled: true, skipped: true, reason: who.reason };
  }
  const allowList = Array.isArray(tgConfig.approverIds) ? tgConfig.approverIds : [];
  if (allowList.length === 0) {
    await reply(tgConfig, message.chat.id, '⛔ Chưa cấu hình telegramConfig.approverIds — luồng đăng bài bị khoá cho tới khi Founder cấu hình.');
    return { handled: true, skipped: true, reason: 'approver_ids_not_configured' };
  }
  const actor = await resolvePshActor(message.from.id, tgConfig);
  if (!actor.ok) {
    await reply(tgConfig, message.chat.id, '⛔ Tài khoản Telegram của bạn chưa được liên kết với quyền đăng bài trong PSH (' + actor.reason + ').\nTelegram ID của bạn: ' + message.from.id + ' (gửi cho Founder để cấu hình approverMap).');
    return { handled: true, skipped: true, reason: actor.reason };
  }
  const deps = Object.assign(defaultDeps(actor), depsIn || {});
  deps.uid = deps.uid || actor.uid;

  const text = typeof message.text === 'string' ? message.text.trim() : '';
  // 2) Lệnh
  if (/^\/(start|help)(@\w+)?\b/i.test(text)) { await reply(tgConfig, message.chat.id, HELP); return { handled: true, command: 'help' }; }
  const m = text.match(/^\/retry(@\w+)?\s+(\S+)/i);
  if (m) return handleRetry(m[2], tgConfig, message);

  // 3) Sản phẩm: cần ảnh
  const photo = media.pickLargestPhoto(message.photo);
  if (!photo) {
    if (text) await reply(tgConfig, message.chat.id, 'Hãy gửi kèm 1 ảnh sản phẩm.\n\n' + HELP);
    return { handled: true, skipped: true, reason: 'no_photo' };
  }
  const parsed = parseProductCaption(message.caption);
  if (message.media_group_id && !message.caption) return { handled: true, skipped: true, reason: 'album_without_caption' };

  // 4) Idempotency — chỉ SAU khi chắc chắn là yêu cầu hợp lệ về mặt quyền
  const claim = await claimUpdate(update.update_id);
  if (!claim.claimed) return { handled: true, duplicate: true };
  if (claim.takeoverDraftId) {
    const r = await runPipeline(claim.takeoverDraftId, deps);
    await finishClaim(update.update_id, { state: 'done', draftId: claim.takeoverDraftId });
    return { handled: true, resumed: true, draftId: claim.takeoverDraftId, result: r };
  }

  if (!parsed.ok) {
    await finishClaim(update.update_id, { state: 'rejected', reason: 'invalid_caption' });
    await reply(tgConfig, message.chat.id, '❌ Chưa nhận được sản phẩm:\n- ' + parsed.errors.join('\n- ') + '\n\nMẫu chú thích:\n' + TEMPLATE);
    return { handled: true, rejected: true, errors: parsed.errors };
  }
  const page = await resolveTargetPage(parsed.pageHint);
  if (!page.ok) {
    await finishClaim(update.update_id, { state: 'rejected', reason: 'page_invalid' });
    await reply(tgConfig, message.chat.id, '❌ ' + page.error);
    return { handled: true, rejected: true, reason: 'page_invalid' };
  }

  // 5) Lưu bản nháp (RECEIVED → PROCESSING) rồi tải + lưu ảnh
  const steps = {};
  const draft = await fbDraftStore.createDraft({
    telegramUpdateId: update.update_id, pageId: page.pageId, caption: '', imageUrls: [],
    requestedBy: 'telegram:' + actor.uid,
    extra: { source: 'telegram', product: parsed.product, pageName: page.pageName, telegramUserId: String(message.from.id), pshUid: actor.uid, pshRole: actor.role, steps, notices: [] }
  });
  await admin.database().ref('telegramUpdates/' + update.update_id).update({ draftId: draft.id });
  await fbDraftStore.updateStatus(draft.id, 'PROCESSING');
  try {
    const file = await media.downloadTelegramFile(tgConfig.token, photo.file_id);
    const saved = await media.saveToStorage('fbDrafts/' + draft.id + '/original.' + file.ext, file.buffer, file.mime);
    markStep(steps, 'intake', 'ok', null);
    await fbDraftStore.patchFields(draft.id, { imageUrls: [saved.url], originalStoragePath: saved.path, steps });
  } catch (e) {
    const msg = media.redact(e && e.message, tgConfig.token).slice(0, 200);
    markStep(steps, 'intake', 'failed', msg);
    await fbDraftStore.patchFields(draft.id, { steps });
    await fbDraftStore.updateStatus(draft.id, 'FAILED', { failReason: 'Tải/lưu ảnh thất bại: ' + msg, failStage: 'intake' });
    await finishClaim(update.update_id, { state: 'failed', draftId: draft.id });
    await reply(tgConfig, message.chat.id, '❌ Không lưu được ảnh sản phẩm: ' + msg + '\nHãy gửi lại ảnh.');
    return { handled: true, failed: true, draftId: draft.id, reason: 'image_failed' };
  }
  await reply(tgConfig, message.chat.id, '✅ Đã nhận sản phẩm "' + parsed.product.name + '". Đang tạo nội dung và ảnh quảng cáo… (mã: ' + draft.id + ')');

  let result;
  try { result = await runPipeline(draft.id, deps); }
  catch (e) {
    const msg = media.redact(e && e.message, tgConfig.token).slice(0, 200);
    try { await fbDraftStore.updateStatus(draft.id, 'FAILED', { failReason: 'Pipeline lỗi: ' + msg, failStage: 'pipeline' }); } catch (_) { /* trạng thái đã đổi */ }
    await finishClaim(update.update_id, { state: 'failed', draftId: draft.id });
    await reply(tgConfig, message.chat.id, '❌ Xử lý bản nháp lỗi: ' + msg);
    return { handled: true, failed: true, draftId: draft.id, reason: 'pipeline_error' };
  }
  await finishClaim(update.update_id, { state: result.ok ? 'done' : 'failed', draftId: draft.id });
  if (!result.ok) await reply(tgConfig, message.chat.id, '❌ Không hoàn tất được bản nháp (' + result.reason + ').');
  return { handled: true, draftId: draft.id, result };
}

async function handleRetry(draftId, tgConfig, message) {
  if (!DRAFT_ID_PATTERN.test(draftId)) { await reply(tgConfig, message.chat.id, 'Mã bản nháp không hợp lệ.'); return { handled: true, skipped: true, reason: 'bad_id' }; }
  const r = await fbDraftStore.retryFailedPublish(draftId);
  if (!r.committed) {
    const why = { not_found: 'không tìm thấy bản nháp', not_failed: 'bản nháp không ở trạng thái lỗi', not_publish_failure: 'lỗi không phải ở bước đăng — hãy gửi lại sản phẩm', already_posted: 'bài ĐÃ được Facebook ghi nhận — không đăng lại để tránh trùng' }[r.reason] || r.reason;
    await reply(tgConfig, message.chat.id, '⚠️ Không thể thử lại: ' + why + '.');
    return { handled: true, skipped: true, reason: r.reason };
  }
  const draft = await fbDraftStore.getDraft(draftId);
  const sent = await sendPreview(tgConfig, draft);
  return { handled: true, retried: true, draftId, version: r.newVersion, previewSent: !!(sent && sent.ok) };
}

module.exports = {
  parseProductCaption, parsePriceVnd, formatVnd, handleTelegramMessage, runPipeline, resolveTargetPage,
  claimUpdate, buildPreviewText, sendPreview, TEMPLATE
};
