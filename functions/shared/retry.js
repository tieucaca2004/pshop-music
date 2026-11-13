/*
 * shared/retry.js — Retry Framework (Sprint 14 Phase 1, FINAL mục 13). Hàm
 * thuần (không phụ thuộc Firebase) — gọi lại 1 async function tối đa N lần
 * với backoff, dùng chung cho mọi nghiệp vụ Phase sau (thay vì mỗi nơi tự
 * viết retry riêng — đúng nguyên tắc "Shared API Infrastructure"). KHÔNG
 * thay thế logic "1 lần tự động thử lại" đã có sẵn trong js/admin-agent.js
 * (runOnce() gọi 2 lần) — đó là hành vi Frontend cũ, giữ nguyên, không đổi
 * ở Phase 1 này.
 */

// withRetry — gọi fn() tối đa `attempts` lần, dừng ngay khi thành công.
// backoffMs(i) mặc định 500ms * 2^i (exponential), có thể override.
// timeoutMs (tùy chọn, ms) — nếu set, mỗi lần thử bị giới hạn thời gian; quá hạn coi như lỗi lần đó (backward-compat: mặc định KHÔNG timeout).
async function withRetry(fn, { attempts = 3, backoffMs = i => 500 * Math.pow(2, i), onAttemptFail, timeoutMs } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      if (timeoutMs) {
        const result = await Promise.race([
          fn(i),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Retry timeout after ' + timeoutMs + 'ms')), timeoutMs))
        ]);
        return result;
      }
      return await fn(i);
    } catch (err) {
      lastError = err;
      if (onAttemptFail) onAttemptFail(err, i);
      if (i < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, backoffMs(i)));
      }
    }
  }
  throw lastError;
}

module.exports = { withRetry };
