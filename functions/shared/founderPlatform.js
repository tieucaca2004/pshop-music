const admin = require('firebase-admin');
const db = admin.database();

// === Tenant Management ===
async function createTenant(data) { return require('./businessLifecycle').create(data); }
async function getTenant(id) { return require('./businessLifecycle').getInfo(id); }
async function listTenants() { const s = await db.ref('businesses').once('value'); const d = s.val(); if (!d) return []; return Object.keys(d).map(k => ({ businessId: k, info: d[k].info || {}, status: (d[k].info||{}).status || 'unknown' })); }
async function suspendTenant(id, uid) { await db.ref('businesses/' + id + '/info/status').set('suspended'); await db.ref('businessAuditLogs/' + id).push({ uid, action: 'tenant.suspended', timestamp: Date.now() }); }
async function restoreTenant(id, uid) { await db.ref('businesses/' + id + '/info/status').set('active'); await db.ref('businessAuditLogs/' + id).push({ uid, action: 'tenant.restored', timestamp: Date.now() }); }
async function deleteTenant(id, uid) { await db.ref('businesses/' + id + '/info/status').set('deleted'); await db.ref('businessAuditLogs/' + id).push({ uid, action: 'tenant.deleted', timestamp: Date.now() }); }
async function transferTenant(id, fromUid, toUid) { return require('./businessLifecycle').transfer(id, fromUid, toUid); }

// === Founder Dashboard Stats ===
async function getDashboardStats() {
  const tenants = await listTenants();
  const total = tenants.length;
  const active = tenants.filter(t => t.status === 'active').length;
  const suspended = tenants.filter(t => t.status === 'suspended').length;
  const archived = tenants.filter(t => t.status === 'archived').length;
  const s = await db.ref('businessMembers').once('value'); const m = s.val(); let users = new Set(); if (m) Object.values(m).forEach(b => { if (b) Object.keys(b).forEach(u => users.add(u)); });
  return { totalTenants: total, activeTenants: active, suspendedTenants: suspended, archivedTenants: archived, totalUsers: users.size };
}

// === Usage Tracking ===
async function getUsage(period) {
  const p = period || 'daily';
  const stats = await getDashboardStats();
  let aiTokens = 0, storageMb = 0, apiCalls = 0;
  const tenants = await listTenants();
  for (const t of tenants) {
    const s = await db.ref('businesses/' + t.businessId + '/subscription/usage').once('value');
    const u = s.val() || {};
    aiTokens += u.aiTokens || 0; storageMb += u.storageMb || 0; apiCalls += u.apiCalls || 0;
  }
  return Object.assign(stats, { aiTokens, storageMb, apiCalls, period: p });
}

// === System Monitoring ===
async function getSystemHealth() {
  const result = { firebase: false, apiGateway: false, ai: false, storage: false };
  const https = require('https');
  try { await new Promise((resolve, reject) => { https.get('https://pshop-music-default-rtdb.asia-southeast1.firebasedatabase.app/products.json?shallow=true', r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try { JSON.parse(d); result.firebase = true; } catch(e){} resolve(); }); }).on('error', reject); }); } catch(e) {}
  try { await new Promise((resolve, reject) => { https.get('https://us-central1-pshop-music.cloudfunctions.net/apiGateway/v1/health', r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try { const j = JSON.parse(d); result.apiGateway = j.success && j.data.healthy; } catch(e){} resolve(); }); }).on('error', reject); }); } catch(e) {}
  return result;
}

// === Billing Foundation (design only) ===
const PLANS = { starter: { monthlyPrice: 0, aiTokens: 1000, storageMb: 500, teamLimit: 3, apiCalls: 1000 },
  pro: { monthlyPrice: 29, aiTokens: 10000, storageMb: 2048, teamLimit: 10, apiCalls: 10000 },
  enterprise: { monthlyPrice: 99, aiTokens: 100000, storageMb: 10240, teamLimit: 999, apiCalls: 100000 } };
async function getPlan(name) { return PLANS[name] || PLANS.starter; }

module.exports = { createTenant, getTenant, listTenants, suspendTenant, restoreTenant, deleteTenant, transferTenant, getDashboardStats, getUsage, getSystemHealth, getPlan, PLANS };
