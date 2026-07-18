/*
 * shared/corsConfig.js — Sprint 15 Phase 1 (Security & Verification
 * Foundation, IMPLEMENTATION_QUEUE.md Task 1.2). Danh sách origin thật được
 * phép gọi apiGateway qua trình duyệt (CORS) — trước đây `cors: true` cho
 * phép BẤT KỲ origin nào (kể cả 1 site lạ tự host JS gọi thẳng API này nếu
 * có token hợp lệ trong tay). Domain thật xác nhận qua index.html
 * (og:url/canonical = https://pshopmusic.com).
 *
 * KHÔNG ảnh hưởng gọi không có Origin header (curl/Postman/server gọi
 * server, kể cả mọi kiểm thử `curl` đã dùng suốt Sprint 14) — CORS chỉ do
 * trình duyệt thực thi, request không phải trình duyệt không bị chặn bởi
 * allowlist này.
 */
const ALLOWED_ORIGINS = [
  'https://pshopmusic.com',
  'https://www.pshopmusic.com'
];

module.exports = { ALLOWED_ORIGINS };
