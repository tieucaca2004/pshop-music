const admin = require('firebase-admin');
const db = admin.database();
const BIZ = 'businesses';
const MEMBERS = 'businessMembers';
const INVITES = 'businessInvitations';
const AUDIT = 'businessAuditLogs';

async function create(data) {
  const id = data.businessId || 'biz-' + Date.now();
  const now = Date.now();
  await db.ref(BIZ + '/' + id).update({
    info: { businessId: id, displayName: data.name, slug: data.slug || id, status: 'active', plan: data.plan || 'starter', createdAt: now, updatedAt: now, timezone: data.timezone || 'Asia/Ho_Chi_Minh', currency: data.currency || 'VND', country: data.country || 'VN', language: data.language || 'vi' },
    settings: { general: {}, branding: {}, localization: { timezone: data.timezone || 'Asia/Ho_Chi_Minh', currency: data.currency || 'VND', country: data.country || 'VN', language: data.language || 'vi' } },
    subscription: { plan: data.plan || 'starter', status: 'active', createdAt: now }
  });
  if (data.ownerUid) await db.ref(MEMBERS + '/' + id + '/' + data.ownerUid).set({ role: 'owner', email: data.ownerEmail || '', name: data.ownerName || '', assignedAt: now });
  await log(id, data.ownerUid || 'system', 'business.created', { businessId: id });
  return id;
}
async function update(businessId, data) { await db.ref(BIZ + '/' + businessId + '/info').update(Object.assign(data, { updatedAt: Date.now() })); }
async function archive(businessId, uid) { await db.ref(BIZ + '/' + businessId + '/info/status').set('archived'); await log(businessId, uid, 'business.archived', { businessId }); }
async function restore(businessId, uid) { await db.ref(BIZ + '/' + businessId + '/info/status').set('active'); await log(businessId, uid, 'business.restored', { businessId }); }
async function softDelete(businessId, uid) { await db.ref(BIZ + '/' + businessId + '/info/status').set('deleted'); await log(businessId, uid, 'business.deleted', { businessId }); }
async function transfer(businessId, fromUid, toUid) { const snap = await db.ref(MEMBERS + '/' + businessId + '/' + fromUid).once('value'); const from = snap.val(); if (!from || from.role !== 'owner') throw new Error('Only owner can transfer'); await db.ref(MEMBERS + '/' + businessId + '/' + fromUid + '/role').set('admin'); await db.ref(MEMBERS + '/' + businessId + '/' + toUid + '/role').set('owner'); await log(businessId, fromUid, 'business.transferred', { from: fromUid, to: toUid }); }
async function getInfo(businessId) { const snap = await db.ref(BIZ + '/' + businessId + '/info').once('value'); return snap.val(); }
async function listByUser(uid) { const snap = await db.ref(MEMBERS).once('value'); const all = snap.val(); if (!all) return []; const result = []; for (const bid of Object.keys(all)) { if (all[bid] && all[bid][uid]) { const info = await getInfo(bid); if (info && info.status !== 'deleted') result.push({ businessId: bid, role: all[bid][uid].role, info }); } } return result; }
async function log(businessId, uid, action, details) { await db.ref(AUDIT + '/' + businessId).push({ uid, action, details: details || {}, timestamp: Date.now() }); }

module.exports = { create, update, archive, restore, softDelete, transfer, getInfo, listByUser, log };
