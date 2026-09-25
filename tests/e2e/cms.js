// Harness: site local (http.server :8765) + Firebase SDK từ npm + Emulator (auth 9099, db 9000, storage 9199).
const { chromium } = require('/home/user/pshop-music/node_modules/playwright');
const path = require('path'); const fs = require('fs');
const DEPS = process.env.E2E_DEPS || __dirname; // thư mục có node_modules: firebase, quill@1.3.7, sortablejs@1.15.2
const FB = path.join(DEPS, 'node_modules/firebase');
const BASE = 'http://127.0.0.1:8765';
const HOOK = `
;(function(){
  var done={};
  function hook(){ try{ if(!firebase.apps||!firebase.apps.length) return;
    if(firebase.auth&&!done.a){ firebase.auth().useEmulator('http://127.0.0.1:9099',{disableWarnings:true}); done.a=1; }
    if(firebase.database&&!done.d){ firebase.database().useEmulator('127.0.0.1',9000); done.d=1; }
    if(firebase.storage&&!done.s){ firebase.storage().useEmulator('127.0.0.1',9199); done.s=1; }
  }catch(e){ console.warn('emu hook', e.message); } }
  window.__emuHook=hook;
  if(firebase.initializeApp && !firebase.__wrapped){ var o=firebase.initializeApp.bind(firebase); firebase.initializeApp=function(){ var a=o.apply(null,arguments); hook(); return a; }; firebase.__wrapped=1; }
  hook();
})();`;
async function launch() {
  return chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
}
async function newPage(browser, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts || {});
  const page = await ctx.newPage();
  const log = { errors: [], console: [], failed: [], blocked: new Set(), http: [] };
  page.on('pageerror', e => log.errors.push(e.message.split('\n')[0]));
  page.on('console', m => { if (m.type() === 'error') log.console.push(m.text().slice(0, 200)); });
  page.on('dialog', d => { log.console.push('[dialog ' + d.type() + '] ' + d.message().slice(0, 150)); d.accept(); });
  page.on('response', r => { const u = r.url(); if (u.startsWith(BASE) && r.status() >= 400) log.http.push(r.status() + ' ' + u.replace(BASE, '')); });
  await page.route('**/*', async route => {
    const u = route.request().url();
    const m = u.match(/gstatic\.com\/firebasejs\/[^/]+\/([a-z-]+\.js)/);
    if (m) { const f = path.join(FB, m[1]); if (fs.existsSync(f)) return route.fulfill({ body: fs.readFileSync(f, 'utf8') + HOOK, contentType: 'application/javascript' }); }
    if (/cdn\.quilljs\.com\/1\.3\.7\/quill\.min\.js/.test(u)) return route.fulfill({ path: path.join(DEPS, 'node_modules/quill/dist/quill.min.js'), contentType: 'application/javascript' });
    if (/cdn\.quilljs\.com\/1\.3\.7\/quill\.snow\.css/.test(u)) return route.fulfill({ path: path.join(DEPS, 'node_modules/quill/dist/quill.snow.css'), contentType: 'text/css' });
    if (/sortablejs@1\.15\.2\/Sortable\.min\.js/.test(u)) return route.fulfill({ path: path.join(DEPS, 'node_modules/sortablejs/Sortable.min.js'), contentType: 'application/javascript' });
    if (u.startsWith(BASE) || u.startsWith('http://127.0.0.1:9')) return route.continue();
    if (u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    log.blocked.add(new URL(u).host); return route.abort();
  });
  return { ctx, page, log };
}
async function login(page, email, pw) {
  await page.goto(BASE + '/admin/login.html');
  await page.waitForSelector('#loginForm', { state: 'visible', timeout: 15000 });
  await page.fill('#loginEmail', email); await page.fill('#loginPassword', pw || 'Test12345!');
  await Promise.all([page.waitForURL(u => !/login\.html/.test(u), { timeout: 15000 }).catch(() => {}), page.click('#loginBtn')]);
}
module.exports = { launch, newPage, login, BASE };
