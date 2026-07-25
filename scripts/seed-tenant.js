// Multi-tenant seed script
// Creates a second test tenant for isolation verification
const https = require('https');
const API_KEY = '<%= apiKey %>';
const FB = 'pshop-music-default-rtdb.asia-southeast1.firebasedatabase.app';
function fbReq(method, path, data) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: FB, path: path + '.json', method: method, headers: {'Content-Type':'application/json'} };
    const req = https.request(opts, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){resolve(d)}}); });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}
async function seed() {
  console.log('Creating tenant B...');
  const tid = 'tenant-b-' + Date.now();
  await fbReq('PUT', '/businesses/' + tid + '/info', {
    businessId: tid, slug: tid, displayName: 'Tenant B Test',
    status: 'active', plan: 'free', timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VND', country: 'VN', language: 'vi'
  });
  await fbReq('PUT', '/registry/' + tid, { name: 'Tenant B Test', slug: tid, created: Date.now() });
  // Seed products for tenant B
  for (let i = 1; i <= 3; i++) {
    await fbReq('POST', '/businesses/' + tid + '/products', {
      name: 'Tenant B Product ' + i, brand: 'Test', category: 'phukien', price: (i * 100000).toString()
    });
  }
  console.log('Tenant B created:', tid);
  console.log('Verify isolation: data should NOT be readable from other tenants');
}
seed().catch(console.error);
