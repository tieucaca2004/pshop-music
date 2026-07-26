/**
 * scripts/prepare-migration.js — Chuẩn bị Migration Layer (KHÔNG CHẠY).
 * Phase 1 chỉ chuẩn bị, KHÔNG migrate dữ liệu thật.
 * Chạy script này để KIỂM TRA cấu trúc, không thay đổi dữ liệu.
 *
 * Cách dùng: node scripts/prepare-migration.js --dry-run
 */
const FB = 'https://pshop-music-default-rtdb.asia-southeast1.firebasedatabase.app';
const https = require('https');

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(FB + path + '.json', res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('Migration Preparation Script (DRY RUN = ' + dryRun + ')');
  console.log('');
  console.log('=== Current Data Structure ===');
  const root = await get('/');
  if (root) {
    const keys = Object.keys(root).filter(k => !k.startsWith('_') && !k.includes('error'));
    console.log('Root nodes:', keys.join(', '));
    // Check if businesses node already exists
    if (keys.includes('businesses')) {
      const biz = await get('/businesses');
      console.log('businesses/: ' + (biz ? Object.keys(biz).length + ' tenants' : 'empty'));
    } else {
      console.log('businesses/: NOT FOUND — first run needed');
    }
    console.log('');
    console.log('=== Data to migrate ===');
    ['products','categories','blogPosts','banners','videos'].forEach(async (node) => {
      const data = await get('/' + node);
      const count = data ? Object.keys(data).length : 0;
      console.log(node + ': ' + count + ' records (target: businesses/pshop-music/' + node + ')');
    });
  }
  console.log('');
  console.log('Migration NOT executed (--dry-run). Ready for Phase 2.');
}
main().catch(e => console.error('Error:', e.message));
