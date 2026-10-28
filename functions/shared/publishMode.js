/*
 * shared/publishMode.js — quyết định luồng Telegram có được ĐĂNG THẬT lên Facebook hay không (F2, Phase 8). FAIL-SAFE:
 *
 *   Chỉ đăng thật khi telegramConfig.dryRun là boolean `false` được đặt TƯỜNG MINH. MỌI trường hợp khác ⇒ DRY-RUN (không gọi Facebook để
 *   tạo bài): thiếu khoá, null, undefined, sai kiểu ("false", 0, 1, "true", [], {}), true, cấu hình không phải object, hoặc không đọc được RTDB.
 *
 * Đây là điều kiện BỔ SUNG, không thay thế: đăng thật còn phải qua secret relay, kiểm chat/approverIds, ánh xạ uid + role, approveTransaction,
 * kiểm Page đang chọn (isPageAllowedForTelegram) và getPageInfo.
 */
'use strict';

function resolvePublishMode(cfg) {
  if (cfg === null || cfg === undefined || typeof cfg !== 'object' || Array.isArray(cfg) || cfg.__configInvalid === true) {
    return { live: false, reason: 'config_invalid' };
  }
  if (!Object.prototype.hasOwnProperty.call(cfg, 'dryRun')) return { live: false, reason: 'dryRun_missing' };
  const v = cfg.dryRun;
  if (v === false) return { live: true, reason: 'dryRun_false' };
  if (v === true) return { live: false, reason: 'dryRun_true' };
  if (v === null || v === undefined) return { live: false, reason: 'dryRun_missing' };
  return { live: false, reason: 'dryRun_invalid_type' };
}

// Mô tả cho người vận hành (tiếng Việt, không chứa giá trị cấu hình)
function describeMode(mode) {
  if (mode.live) return 'ĐĂNG THẬT (telegramConfig.dryRun = false)';
  if (mode.reason === 'dryRun_true') return 'DRY-RUN (telegramConfig.dryRun = true)';
  return 'DRY-RUN mặc định an toàn (telegramConfig.dryRun chưa đặt đúng boolean false: ' + mode.reason + ')';
}

module.exports = { resolvePublishMode, describeMode };
