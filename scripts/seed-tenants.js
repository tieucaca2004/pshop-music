const https = require('https');
const FB = 'https://pshop-music-default-rtdb.asia-southeast1.firebasedatabase.app';

function put(path, data) { return new Promise((resolve, reject) => { const d = JSON.stringify(data); const r = https.request({ hostname: FB.replace('https://',''), path: path + '.json', method: 'PUT', headers: {'Content-Type':'application/json'} }, res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve(JSON.parse(b))); }); r.on('error', reject); r.write(d); r.end(); }); }

async function seed() {
  console.log('Seeding tenant templates (dry-run: SHOW ONLY)');
  const tenants = [
    { id: 'pshop-music', name: 'PShop Music', slug: 'pshop-music', desc: 'DJ & audio equipment store', plan: 'enterprise' },
    { id: 'a-tieu', name: 'Hủ Tiếu Xào A Tiểu', slug: 'a-tieu', desc: 'Vietnamese restaurant', plan: 'starter' }
  ];
  for (const t of tenants) {
    console.log('Tenant: ' + t.id + ' (' + t.name + ')');
    console.log('  businesses/' + t.id + '/info → { displayName, plan, status, timezone }');
    console.log('  businesses/' + t.id + '/settings → { seo, theme, general }');
    console.log('');
  }
  console.log('Run with --execute flag to apply. READ-ONLY by default.');
}
seed().catch(console.error);
