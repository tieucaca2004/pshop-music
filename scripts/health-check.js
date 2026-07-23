const http = require('http');
const checks = {
  timestamp: new Date().toISOString(),
  status: 'ok',
  services: {}
};

// Website check
const sites = {
  pshop: 'https://pshopmusic.com',
  atieu: 'https://atieu.com',
  api: 'http://localhost:18789'
};

Promise.all(Object.entries(sites).map(([name,url]) =>
  new Promise(resolve => {
    const req = http.get(url, res => {
      checks.services[name] = { status: res.statusCode === 200 ? 'up' : 'degraded', code: res.statusCode };
      resolve();
    });
    req.on('error', e => { checks.services[name] = { status: 'down', error: e.message }; resolve(); });
    req.setTimeout(5000, () => { checks.services[name] = { status: 'timeout' }; req.destroy(); resolve(); });
  })
)).then(() => {
  checks.health = Object.values(checks.services).every(s => s.status === 'up') ? 'healthy' : 'degraded';
  console.log(JSON.stringify(checks, null, 2));
});
