/*
 * shared/listResource.js — Sprint 14 Phase 2 (FINAL mục 20 Phase 1 gốc, đổi
 * số thành Phase 2 theo điều chỉnh Founder). CRUD RTDB generic cho các node
 * dạng danh sách (Products/Categories/Brands/Tags/Blog/Banner/Video) — server
 * song song với `makeListDB()` phía client (js/cms-db.js), CÙNG ngữ nghĩa
 * (getAll/get/add/update/remove, hard delete, sort theo `order` nếu có) —
 * KHÔNG đổi field/shape dữ liệu hiện có, chỉ thêm đường ghi mới qua API.
 */
const admin = require('firebase-admin');

async function getAll(node) {
  const snap = await admin.database().ref(node).once('value');
  const val = snap.val() || {};
  const items = Object.keys(val).map(id => Object.assign({ id }, val[id]));
  items.sort((a, b) => (a.order || 0) - (b.order || 0));
  return items;
}

async function getOne(node, id) {
  const snap = await admin.database().ref(node + '/' + id).once('value');
  if (!snap.exists()) return null;
  return Object.assign({ id }, snap.val());
}

async function add(node, data) {
  const ref = admin.database().ref(node).push();
  const record = Object.assign({}, data, { createdAt: admin.database.ServerValue.TIMESTAMP });
  await ref.set(record);
  return Object.assign({ id: ref.key }, record);
}

async function update(node, id, changes) {
  const existing = await getOne(node, id);
  if (!existing) return null;
  await admin.database().ref(node + '/' + id).update(changes);
  return getOne(node, id);
}

async function remove(node, id) {
  const existing = await getOne(node, id);
  if (!existing) return false;
  await admin.database().ref(node + '/' + id).remove();
  return true;
}

module.exports = { getAll, getOne, add, update, remove };
