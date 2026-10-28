/*
 * shared/approverPolicy.js — ánh xạ danh tính Telegram → quyền PSH cho luồng đăng Facebook qua Telegram.
 *
 * Chính sách (fail-closed, tương thích G1):
 *   - Chỉ chat được cấu hình (telegramConfig.chatId) và các Telegram user trong telegramConfig.approverIds
 *     mới được gửi sản phẩm / duyệt / huỷ (kiểm ở checkApprover — fbPublisher.js).
 *   - MỖI Telegram user phải được ánh xạ tường minh sang một uid PSH: telegramConfig.approverMap[telegramId] = uid.
 *   - uid đó phải có quyền hiện hành trong RTDB (đọc tại thời điểm thao tác, không cache):
 *       superAdmins/{uid}.role === 'super_admin'   → được
 *       roles/{uid} ∈ telegramConfig.publishRoles (mặc định ['admin','editor']) → được
 *     (giống quyền đăng bài qua gateway ở G1: admin/editor/super_admin). 'agent' KHÔNG nằm trong mặc định.
 *   - Thiếu ánh xạ / uid không còn quyền / cấu hình sai → TỪ CHỐI, không có ngoại lệ ngầm.
 * Không ai được tự cấp quyền: bản đồ nằm trong RTDB `telegramConfig` (server-only, chỉ Founder/Admin SDK ghi).
 */
'use strict';
const admin = require('firebase-admin');

const DEFAULT_PUBLISH_ROLES = ['admin', 'editor'];
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

async function resolvePshActor(telegramUserId, tgConfig) {
  const tid = telegramUserId == null ? '' : String(telegramUserId);
  if (!tid) return { ok: false, reason: 'telegram_user_missing' };
  const map = tgConfig && tgConfig.approverMap && typeof tgConfig.approverMap === 'object' ? tgConfig.approverMap : null;
  const uid = map ? map[tid] : null;
  if (!uid) return { ok: false, reason: 'approver_unmapped' };
  if (typeof uid !== 'string' || !UID_PATTERN.test(uid)) return { ok: false, reason: 'approver_map_invalid' };

  const sa = await admin.database().ref('superAdmins/' + uid).once('value');
  if (sa.exists() && sa.val() && sa.val().role === 'super_admin') return { ok: true, uid, role: 'super_admin' };

  const allowed = Array.isArray(tgConfig.publishRoles) && tgConfig.publishRoles.length
    ? tgConfig.publishRoles.map(String) : DEFAULT_PUBLISH_ROLES;
  const roleSnap = await admin.database().ref('roles/' + uid).once('value');
  const role = roleSnap.exists() ? roleSnap.val() : null;
  if (typeof role === 'string' && allowed.indexOf(role) >= 0 && role !== 'super_admin') return { ok: true, uid, role };
  return { ok: false, reason: 'approver_role_not_allowed', uid };
}

module.exports = { resolvePshActor, DEFAULT_PUBLISH_ROLES };
