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

// add() — GHI "id" NGAY TRONG bản ghi (không chỉ trả về ở response) — đúng
// hành vi makeListDB() phía client (js/cms-db.js add()) đã làm từ trước.
// Bug phát hiện qua kiểm thử thật (Founder dùng OpenClaw tạo 1 bài Blog qua
// API): bản ghi tạo qua API trước đây KHÔNG có "id" bên trong dữ liệu lưu —
// giao diện Admin (BlogDB/DraftDB/... đều dùng chung makeListDB()) đọc
// nguyên văn dữ liệu lưu (không tự suy ra "id" từ RTDB key khi đọc), nên nút
// Sửa/Xóa gọi với id=undefined, không tìm thấy bản ghi nào khớp, im lặng
// không phản ứng. Lỗi này ảnh hưởng MỌI node dùng listResource.js (Products/
// Categories/Brands/Tags/Blog/Banners/Videos qua routes/cmsLists.js, và
// aiDrafts qua shared/aiGenerate.js/agentExecute.js) — không riêng Blog.
async function add(node, data) {
  const ref = admin.database().ref(node).push();
  const record = Object.assign({}, data, { id: ref.key, createdAt: admin.database.ServerValue.TIMESTAMP });
  await ref.set(record);
  return record;
}

// update() — cùng lý do trên: luôn ghi lại "id" đúng trong lượt update (vô
// hại nếu đã có sẵn, tự "chữa" các bản ghi cũ tạo trước khi sửa lỗi này nếu
// sau này được update lại).
async function update(node, id, changes) {
  const existing = await getOne(node, id);
  if (!existing) return null;
  await admin.database().ref(node + '/' + id).update(Object.assign({}, changes, { id }));
  return getOne(node, id);
}

async function remove(node, id) {
  const existing = await getOne(node, id);
  if (!existing) return false;
  await admin.database().ref(node + '/' + id).remove();
  return true;
}

module.exports = { getAll, getOne, add, update, remove };
