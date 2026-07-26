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

// === Invitation System ===
const INV = 'businessInvitations';
const crypto = require('crypto');

async function invite(businessId, invitedBy, email, role) {
  const token = crypto.randomBytes(32).toString('hex');
  const id = 'inv-' + Date.now();
  await db.ref(INV + '/' + id).set({
    businessId, invitedBy, invitedEmail: email, role: role || 'viewer',
    token, status: 'pending', createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  });
  await log(businessId, invitedBy, 'invitation.created', { invitationId: id, email, role });
  return { invitationId: id, token };
}

async function acceptInvitation(token, uid, email) {
  const snap = await db.ref(INV).orderByChild('token').equalTo(token).once('value');
  let invId, inv;
  snap.forEach(s => { invId = s.key; inv = s.val(); });
  if (!inv) throw new Error('Invalid token');
  if (inv.status !== 'pending') throw new Error('Invitation already ' + inv.status);
  if (inv.expiresAt < Date.now()) { await db.ref(INV + '/' + invId + '/status').set('expired'); throw new Error('Invitation expired'); }
  if (inv.invitedEmail !== email) throw new Error('Email mismatch');
  await db.ref(MEMBERS + '/' + inv.businessId + '/' + uid).set({ role: inv.role, email, name: '', assignedAt: Date.now(), invitedBy: inv.invitedBy });
  await db.ref(INV + '/' + invId + '/status').set('accepted');
  await log(inv.businessId, uid, 'invitation.accepted', { invitationId: invId });
}

async function cancelInvitation(invId, uid) {
  await db.ref(INV + '/' + invId + '/status').set('cancelled');
  const snap = await db.ref(INV + '/' + invId + '/businessId').once('value');
  await log(snap.val(), uid, 'invitation.cancelled', { invitationId: invId });
}

async function listInvitations(businessId) {
  const snap = await db.ref(INV).orderByChild('businessId').equalTo(businessId).once('value');
  const d = snap.val(); return d ? Object.keys(d).map(k => Object.assign({ id: k }, d[k])) : [];
}

// === Member Management ===
async function removeMember(businessId, uid, removedBy) {
  await db.ref(MEMBERS + '/' + businessId + '/' + uid).remove();
  await log(businessId, removedBy, 'member.removed', { targetUid: uid });
}

async function changeRole(businessId, uid, newRole, changedBy) {
  await db.ref(MEMBERS + '/' + businessId + '/' + uid + '/role').set(newRole);
  await log(businessId, changedBy, 'member.role_changed', { targetUid: uid, newRole });
}

async function suspendMember(businessId, uid, suspendedBy) {
  await db.ref(MEMBERS + '/' + businessId + '/' + uid + '/status').set('suspended');
  await log(businessId, suspendedBy, 'member.suspended', { targetUid: uid });
}

async function unsuspendMember(businessId, uid, unsuspendedBy) {
  await db.ref(MEMBERS + '/' + businessId + '/' + uid + '/status').set('active');
  await log(businessId, unsuspendedBy, 'member.unsuspended', { targetUid: uid });
}

async function listMembers(businessId) {
  const snap = await db.ref(MEMBERS + '/' + businessId).once('value');
  const d = snap.val(); return d ? Object.keys(d).map(k => Object.assign({ uid: k }, d[k])) : [];
}

// Export additions
module.exports = { create, update, archive, restore, softDelete, transfer, getInfo, listByUser, log, invite, acceptInvitation, cancelInvitation, listInvitations, removeMember, changeRole, suspendMember, unsuspendMember, listMembers };
