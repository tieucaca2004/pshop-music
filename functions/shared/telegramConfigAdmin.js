/*
 * shared/telegramConfigAdmin.js — API quản trị cấu hình KHÔNG bí mật của PSH Telegram→Facebook Publisher cho CMS.
 *
 * Chỉ super_admin (guardSuperAdmin, kiểm phía server). Đọc/ghi qua Admin SDK; database.rules.json KHÔNG đổi, trình duyệt
 * không đọc/ghi telegramConfig trực tiếp.
 *
 *   GET  → { chatId, approverIds, approverMap, dryRun, effectiveMode, activePage, allowedPageIds, mappingStatus }
 *   POST → body chỉ gồm { chatId, approverIds, approverMap [, dryRun:true] }; trường khác ⇒ 400.
 *
 * Bất biến bảo mật:
 *   - KHÔNG trả/ghi token, webhook secret, Page Access Token. Response dựng từ danh sách trường cho phép (allowlist),
 *     không bao giờ spread nguyên node RTDB (node có thể còn trường bí mật cũ).
 *   - Giai đoạn này CMS chỉ giữ dryRun:true: mỗi lần lưu luôn ghi dryRun=true; body có dryRun khác true ⇒ 400.
 *   - Chỉ cập nhật 4 khoá (chatId, approverIds, approverMap, dryRun); publishRoles/allowedPageIds/allowGatewayCallback giữ nguyên.
 *   - Không sửa roles/superAdmins; mappingStatus chỉ ĐỌC để cảnh báo uid chưa đủ quyền.
 */
'use strict';
const admin = require('firebase-admin');
const { resolvePublishMode } = require('./publishMode');
const { DEFAULT_PUBLISH_ROLES, extractRole } = require('./approverPolicy');

const CHAT_ID_NUMERIC = /^-?[1-9]\d{0,19}$/;
const CHAT_ID_USERNAME = /^@[A-Za-z0-9_]{4,}$/;   // cùng định dạng checkApprover (routes/fbPublisher.js)
const TELEGRAM_USER_ID = /^[1-9]\d{0,19}$/;   // Telegram ID không bắt đầu bằng 0
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;       // cùng định dạng approverPolicy.js
const MAX_APPROVERS = 20;
const ALLOWED_BODY_KEYS = ['chatId', 'approverIds', 'approverMap', 'dryRun'];

const db = () => admin.database();

// validateConfigInput — trả { ok, errors[], value }. Thông báo lỗi tiếng Việt, KHÔNG chứa giá trị client gửi lên
// (tránh lặp lại thứ có thể là secret dán nhầm).
function validateConfigInput(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: ['Nội dung gửi lên không hợp lệ.'], value: null };

  const extra = Object.keys(body).filter(k => ALLOWED_BODY_KEYS.indexOf(k) < 0);
  if (extra.length) errors.push('Không được gửi các trường: ' + extra.map(k => '"' + String(k).slice(0, 40) + '"').join(', ') + '. Token và secret KHÔNG được lưu qua CMS (dùng Firebase Functions secret).');

  if ('dryRun' in body && body.dryRun !== true) errors.push('dryRun chỉ được là true trong giai đoạn này. CMS không bật chế độ đăng thật.');

  let chatId = null;
  const rawChat = typeof body.chatId === 'number' ? String(body.chatId) : body.chatId;
  if (typeof rawChat !== 'string' || !rawChat.trim()) errors.push('Thiếu chatId.');
  else {
    chatId = rawChat.trim();
    if (!CHAT_ID_NUMERIC.test(chatId) && !CHAT_ID_USERNAME.test(chatId)) { errors.push('chatId không hợp lệ: cần số (vd 123456 hoặc -1001234567890) hoặc @tên_kênh công khai (ít nhất 4 ký tự).'); chatId = null; }
  }

  let approverIds = null;
  if (!Array.isArray(body.approverIds)) errors.push('approverIds phải là danh sách.');
  else if (body.approverIds.length === 0) errors.push('approverIds không được rỗng (cần ít nhất 1 Telegram user ID người duyệt).');
  else if (body.approverIds.length > MAX_APPROVERS) errors.push('approverIds tối đa ' + MAX_APPROVERS + ' người.');
  else {
    const ids = []; let bad = 0; let dup = 0;
    for (const v of body.approverIds) {
      const s = typeof v === 'number' ? String(v) : v;
      if (typeof s !== 'string' || !TELEGRAM_USER_ID.test(s.trim())) { bad++; continue; }
      const t = s.trim();
      if (ids.indexOf(t) >= 0) { dup++; continue; }
      ids.push(t);
    }
    if (bad) errors.push('approverIds có ' + bad + ' mục không hợp lệ (Telegram user ID chỉ gồm chữ số).');
    if (dup) errors.push('approverIds có ' + dup + ' mục bị trùng.');
    if (!bad && !dup) approverIds = ids;
  }

  let approverMap = null;
  const m = body.approverMap;
  if (!m || typeof m !== 'object' || Array.isArray(m)) errors.push('approverMap phải là ánh xạ từ Telegram user ID sang Firebase UID.');
  else {
    const out = {}; let badKey = 0; let badUid = 0;
    for (const k of Object.keys(m)) {
      if (!TELEGRAM_USER_ID.test(k)) { badKey++; continue; }
      const uid = m[k];
      if (typeof uid !== 'string' || !UID_PATTERN.test(uid.trim())) { badUid++; continue; }
      out[k] = uid.trim();
    }
    if (badKey) errors.push('approverMap có ' + badKey + ' Telegram user ID không hợp lệ.');
    if (badUid) errors.push('approverMap có ' + badUid + ' Firebase UID không hợp lệ (chỉ chữ, số, "_" và "-", tối đa 128 ký tự).');
    if (!badKey && !badUid) {
      approverMap = out;
      if (approverIds) {
        const missing = approverIds.filter(id => !out[id]);
        if (missing.length) errors.push('Thiếu ánh xạ Firebase UID cho ' + missing.length + ' người duyệt (' + missing.join(', ') + ').');
        const orphan = Object.keys(out).filter(k => approverIds.indexOf(k) < 0);
        if (orphan.length) errors.push('approverMap có ' + orphan.length + ' Telegram user ID không nằm trong approverIds (' + orphan.join(', ') + ').');
      }
    }
  }

  if (errors.length) return { ok: false, errors, value: null };
  return { ok: true, errors: [], value: { chatId, approverIds, approverMap } };
}

// Chuẩn hoá mảng/ánh xạ đọc từ RTDB về dạng hiển thị an toàn (chỉ chuỗi hợp lệ).
function cleanIds(v) {
  const arr = Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
  return arr.map(x => String(x)).filter(x => TELEGRAM_USER_ID.test(x));
}
function cleanMap(v) {
  const out = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) for (const k of Object.keys(v)) if (TELEGRAM_USER_ID.test(k) && typeof v[k] === 'string' && UID_PATTERN.test(v[k])) out[k] = v[k];
  return out;
}

// buildView — dựng response từ allowlist. Tham số raw là node telegramConfig (có thể chứa trường bí mật cũ ⇒ KHÔNG bao giờ spread).
function buildView(raw, activePage, mappingStatus) {
  const cfg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const mode = resolvePublishMode(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
  const chat = cfg.chatId == null ? '' : String(cfg.chatId);
  return {
    chatId: (CHAT_ID_NUMERIC.test(chat) || CHAT_ID_USERNAME.test(chat)) ? chat : '',
    approverIds: cleanIds(cfg.approverIds),
    approverMap: cleanMap(cfg.approverMap),
    dryRun: !mode.live,                              // phản ánh chế độ THẬT đang hiệu lực (false = RTDB đang đăng thật)
    effectiveMode: mode.live ? 'live' : 'dry-run',   // 'live' = RTDB đang dryRun:false (CMS không đổi được) ⇒ giao diện cảnh báo
    activePage: activePage || { connected: false },
    allowedPageIds: Array.isArray(cfg.allowedPageIds) ? cfg.allowedPageIds.map(String).filter(x => /^[A-Za-z0-9_-]{1,64}$/.test(x)) : [],
    mappingStatus: mappingStatus || {}
  };
}

// Fanpage đang chọn — chỉ metadata không nhạy cảm từ facebookConnection (KHÔNG đọc facebookActiveToken/facebookPageTokens).
async function readActivePage() {
  const snap = await db().ref('facebookConnection').once('value');
  const c = snap.val();
  if (!c || typeof c !== 'object' || c.status === 'not_connected' || !c.pageId) return { connected: false };
  return {
    connected: true,
    pageId: String(c.pageId).slice(0, 64),
    pageName: String(c.pageName || '').slice(0, 120),
    isMock: !!c.isMock,
    status: typeof c.status === 'string' ? c.status.slice(0, 40) : ''
  };
}

// Chỉ ĐỌC: uid có đủ quyền đăng (super_admin / publishRoles) tại thời điểm này không. Không cấp, không sửa quyền.
async function readMappingStatus(map, publishRoles) {
  const roles = Array.isArray(publishRoles) && publishRoles.length ? publishRoles.map(String) : DEFAULT_PUBLISH_ROLES;
  const out = {};
  for (const tid of Object.keys(map)) {
    const uid = map[tid];
    const sa = await db().ref('superAdmins/' + uid).once('value');
    if (sa.exists() && sa.val() && sa.val().role === 'super_admin') { out[tid] = 'super_admin'; continue; }
    const r = await db().ref('roles/' + uid).once('value');
    const role = r.exists() ? extractRole(r.val()) : null;
    // Khớp approverPolicy.js: 'super_admin' trong roles/{uid} KHÔNG bao giờ được duyệt (chỉ superAdmins/{uid}).
    out[tid] = (typeof role === 'string' && role !== 'super_admin' && roles.indexOf(role) >= 0) ? 'role:' + role : 'no_publish_permission';
  }
  return out;
}

async function loadView() {
  const [cfgSnap, activePage] = await Promise.all([db().ref('telegramConfig').once('value'), readActivePage()]);
  const raw = cfgSnap.val();
  const map = cleanMap(raw && typeof raw === 'object' ? raw.approverMap : null);
  const status = await readMappingStatus(map, raw && typeof raw === 'object' ? raw.publishRoles : null);
  return buildView(raw, activePage, status);
}

// handle — dùng trong onRequest. deps.guardSuperAdmin(req,res) trả { uid,email } hoặc null (đã gửi lỗi).
async function handle(req, res, deps) {
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'Chỉ hỗ trợ GET và POST.' }); return; }
  const sa = await deps.guardSuperAdmin(req, res);
  if (!sa) return;
  try {
    if (req.method === 'GET') { res.status(200).json({ ok: true, config: await loadView() }); return; }

    const v = validateConfigInput(req.body);
    if (!v.ok) { res.status(400).json({ ok: false, errors: v.errors }); return; }
    // Atomic: KHÔNG ghi đè khi RTDB đang dryRun:false (đăng thật). CMS không được che giấu hay âm thầm đổi trạng thái đó —
    // từ chối (409) để người vận hành xử lý có chủ đích trực tiếp trong RTDB. dryRun thiếu/sai kiểu ⇒ đặt true (cùng hiệu lực fail-safe).
    const next = { chatId: v.value.chatId, approverIds: v.value.approverIds, approverMap: v.value.approverMap };
    let wasNotTrue = false;
    const tx = await db().ref('telegramConfig').transaction((cur) => {
      wasNotTrue = false;
      if (cur !== null && typeof cur === 'object' && !Array.isArray(cur)) {
        if (cur.dryRun === false) return undefined;      // abort: đang đăng thật
        wasNotTrue = cur.dryRun !== true;
        return Object.assign({}, cur, next, { dryRun: true });
      }
      wasNotTrue = cur !== null;                          // node sai kiểu ⇒ thay bằng cấu hình hợp lệ
      return Object.assign({}, next, { dryRun: true });
    });
    if (!tx.committed) {
      res.status(409).json({ ok: false, errors: ['RTDB đang đặt telegramConfig.dryRun = false (CHẾ ĐỘ ĐĂNG THẬT). CMS không lưu và không đổi chế độ này. Hãy chuyển về dryRun = true trực tiếp trong RTDB (Founder thao tác) rồi lưu lại.'], config: await loadView() });
      return;
    }
    if (deps.audit) { try { await deps.audit({ uid: sa.uid, email: sa.email, action: 'telegramPublisher.configSave', status: 'ok', details: { approvers: v.value.approverIds.length, dryRun: true } }); } catch (e) { /* best-effort */ } }
    res.status(200).json({ ok: true, config: await loadView(), dryRunWasNotTrue: wasNotTrue });
  } catch (e) {
    console.error('[telegramPublisherConfig] lỗi xử lý:', String((e && e.message) || e).slice(0, 160));
    res.status(500).json({ error: 'Không xử lý được cấu hình Telegram Publisher.' });
  }
}

module.exports = { validateConfigInput, buildView, loadView, handle, ALLOWED_BODY_KEYS };
