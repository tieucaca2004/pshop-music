const assert = require('assert');
const { resolveRef } = require('../shared/apiAdapter');
describe('API Adapter', () => {
  it('legacy ref for pshop-music', () => {
    const ref = resolveRef('pshop-music', 'products');
    assert.ok(ref, 'should return a ref');
  });
  it('mt ref for a-tieu', () => {
    const ref = resolveRef('a-tieu', 'products');
    assert.ok(ref, 'should return a ref');
  });
});
