/*
 * shared/objectResource.js — Sprint 14 Phase 2. Đọc/ghi RTDB dạng "1 node =
 * 1 object cấu hình" (Menu/Footer/SEO/Settings đều là nhánh con của
 * `siteContent`, đúng `SiteContentDB` phía client, js/db.js; SEO nằm ở node
 * riêng `seoSettings`, đúng `SeoDB`, js/cms-db.js). PATCH = merge nông
 * (shallow `update()`), KHÔNG ghi đè toàn bộ object — giữ nguyên field khác
 * không được gửi trong body.
 */
const admin = require('firebase-admin');

async function getPath(path) {
  const snap = await admin.database().ref(path).once('value');
  return snap.val();
}

async function mergePath(path, changes) {
  await admin.database().ref(path).update(changes);
  return getPath(path);
}

async function setPath(path, value) {
  await admin.database().ref(path).set(value);
  return getPath(path);
}

module.exports = { getPath, mergePath, setPath };
