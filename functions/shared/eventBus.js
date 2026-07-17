/*
 * shared/eventBus.js — Sprint 14 Phase 6. "Event Bus" nội bộ nhẹ — KHÔNG
 * tạo message broker mới (Pub/Sub...), tái dùng ĐÚNG `shared/webhook.js`
 * (Phase 1, `sendWebhook()` đã có sẵn, chưa từng được gọi thật cho tới giờ)
 * để gửi HTTP callback tới URL Founder/OpenClaw đã đăng ký (`webhookSubs`,
 * node RTDB MỚI), cộng 1 log ngắn hạn (`apiEvents`, node RTDB MỚI, giữ 200
 * sự kiện gần nhất) để `GET /v1/events` cho phép poll lại — dự phòng khi
 * OpenClaw không có URL public để nhận webhook.
 *
 * emit() được gọi TỪ những nơi đã có hành động thật xảy ra (Draft publish,
 * Job hoàn tất/thất bại) — KHÔNG tự suy đoán sự kiện, KHÔNG viết Business
 * Logic mới ở đây, chỉ ghi log + gửi callback cho sự kiện ĐÃ XẢY RA THẬT.
 */
const admin = require('firebase-admin');
const listResource = require('./listResource');
const { sendWebhook } = require('./webhook');

const EVENTS_NODE = 'apiEvents';
const SUBS_NODE = 'webhookSubs';
const MAX_EVENTS_KEPT = 200;

async function emit(eventType, payload) {
  const event = await listResource.add(EVENTS_NODE, { eventType, payload, emittedAt: Date.now() });

  // Giữ node gọn — chỉ log ngắn hạn, không phải kho lưu trữ vĩnh viễn.
  const all = await listResource.getAll(EVENTS_NODE);
  if (all.length > MAX_EVENTS_KEPT) {
    const toRemove = all.sort((a, b) => (a.emittedAt || 0) - (b.emittedAt || 0)).slice(0, all.length - MAX_EVENTS_KEPT);
    await Promise.all(toRemove.map(e => listResource.remove(EVENTS_NODE, e.id)));
  }

  const subs = await listResource.getAll(SUBS_NODE);
  const matching = subs.filter(s => s.active !== false && (s.eventType === eventType || s.eventType === '*'));
  await Promise.all(matching.map(s => sendWebhook(s.url, { eventType, payload, emittedAt: event.emittedAt })));

  return event;
}

module.exports = { emit, EVENTS_NODE, SUBS_NODE };
