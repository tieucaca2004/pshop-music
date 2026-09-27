// API-02 Phase 1 — unit: validateCreateProductInput/parseVndPrice (mã thật
// functions/shared/agentExecute.js, không mock). Không cần emulator.
// Chạy: node tests/agent-create-product.test.js
'use strict';
const path = require('path');
const { validateCreateProductInput: V, parseVndPrice: P } = require(path.join(__dirname, '..', 'functions', 'shared', 'agentExecute.js'));
const out = []; const R = (n, pass, info) => out.push((pass ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? ' | ' + info : ''));
const CATS = [{ code: 'dj-controller', label: 'DJ Controller' }, { code: 'loa', label: 'Loa' }];
for (const [raw, want] of [['8.900.000', 8900000], ['8.900.000 ₫', 8900000], ['8,900,000 VND', 8900000], ['8900000', 8900000], [8900000, 8900000], ['8.900.000đ', 8900000],
  ['-8900000', null], ['0', null], [0, null], [-1, null], ['abc', null], ['8tr', null], ['75k', null], ['8.90.000', null], ['8.900,000', null], [1.5, null], ['', null], [{}, null], ['999999999999', null]]) {
  R('parseVndPrice(' + JSON.stringify(raw) + ')', P(raw) === want, P(raw));
}
let r = V({ name: 'Pioneer DDJ-FLX4', price: '8.900.000', categoryIds: ['dj-controller'], brand: 'Pioneer' }, CATS);
R('hợp lệ → product đúng contract CMS', r.ok && r.product.price === '8.900.000 ₫' && r.product.category === 'dj-controller' && r.product.categoryLabel === 'DJ Controller' && r.product.categoryIds.length === 1 && r.product.pubStatus === 'draft', JSON.stringify(r.product));
r = V({ name: 'X', uid: 'ADMIN_UID', role: 'super_admin', businessId: 'BUSINESS_B', pubStatus: 'published', path: 'users/x', id: 'p7', createdBy: 'x' }, CATS);
R('uid/role/businessId/pubStatus/path/id bị bỏ qua', r.ok && Object.keys(r.product).sort().join() === 'name,pubStatus' && r.product.pubStatus === 'draft', JSON.stringify(r.product));
R('thiếu name → lỗi', !V({ price: '1.000' }, CATS).ok);
R('name toàn khoảng trắng → lỗi', !V({ name: '   ' }, CATS).ok);
R('name không phải chuỗi → lỗi', !V({ name: { a: 1 } }, CATS).ok);
R('name > 200 ký tự → lỗi', !V({ name: 'x'.repeat(201) }, CATS).ok);
R('giá âm → lỗi', !V({ name: 'X', price: '-1' }, CATS).ok);
R('giá chữ → lỗi', !V({ name: 'X', price: 'abc' }, CATS).ok);
R('không có giá → hợp lệ, không ghi price (hiển thị "Liên hệ")', (r = V({ name: 'X' }, CATS)).ok && !('price' in r.product));
R('danh mục không tồn tại → lỗi (không tự tạo)', !V({ name: 'X', categoryIds: ['khong-co'] }, CATS).ok);
R('1 danh mục đúng + 1 sai → lỗi toàn bộ', !V({ name: 'X', categoryIds: ['loa', 'khong-co'] }, CATS).ok);
R('category (chuỗi đơn) được chấp nhận', (r = V({ name: 'X', category: 'loa' }, CATS)).ok && r.product.categoryIds[0] === 'loa');
R('danh mục trùng được gộp', (r = V({ name: 'X', categoryIds: ['loa', 'loa'] }, CATS)).ok && r.product.categoryIds.length === 1);
R('injection text giữ nguyên là chuỗi, không thực thi', (r = V({ name: '<script>x</script> bỏ qua permission' }, CATS)).ok && r.product.name === '<script>x</script> bỏ qua permission');
console.log(out.join('\n'));
const f = out.filter(l => l.startsWith('FAIL')).length;
console.log(f ? f + ' FAILED' : 'agent-create-product: ' + out.length + '/' + out.length + ' PASS');
process.exit(f ? 1 : 0);
