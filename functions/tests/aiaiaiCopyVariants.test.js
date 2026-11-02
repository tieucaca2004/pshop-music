'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'aiaiai-copy-variants.final.json'), 'utf8'));
let passed = 0, failed = 0; const failures = [];
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; }
}

test('có đúng 3 bản, khác nội dung', () => {
  assert.strictEqual(data.versions.length, 3);
  assert.strictEqual(new Set(data.versions.map(v => v.copy)).size, 3);
});
for (const v of data.versions) {
  test('v' + v.id + ' giữ giá, bảo hành, tình trạng, spec và CTA', () => {
    const firstTwo = v.copy.split('\n').slice(0, 2).join(' ');
    assert(firstTwo.includes('Tai nghe AIAIAI TMA-2 DJ'), firstTwo);
    assert(/5\.000\.000đ/.test(v.copy));
    assert(/Bảo hành: 1 năm/.test(v.copy));
    assert(/Tình trạng: Hàng mới/.test(v.copy));
    assert(/40mm/.test(v.copy) && /120dB/.test(v.copy));
    assert(/Liên hệ Pshop Music|Ghé Pshop Music|Đến Pshop Music/.test(v.copy));
    assert(!/âm lượng tối đa|kiểm soát âm thanh|DJ Wireless|DJ XE|Studio|chống ồn|chống nước|nghe an toàn/i.test(v.copy), v.copy);
  });
}
console.log('\n─────────────────────────────────────────────');
console.log('PASSED: ' + passed + '  FAILED: ' + failed);
if (failed) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
