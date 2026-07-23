/* Authentication API — /api/v1/auth/* routes
 * Registers routes with the API Gateway.
 * Requires: api-gateway.js
 */
const admin = require('firebase-admin');
const gw = require('./api-gateway.js');

/* GET /api/v1/auth/me — Current user profile */
gw.get('/auth/me', async (req) => {
  const uid = req.user.uid;
  const snap = await admin.database().ref('roles/' + uid).once('value');
  const roleData = snap.val() || {};
  return {
    uid,
    email: req.user.email || req.user.firebase?.identities?.email?.[0] || '',
    name: roleData.name || req.user.name || '',
    role: roleData.role || 'none',
    authTime: req.user.auth_time ? new Date(req.user.auth_time * 1000).toISOString() : null
  };
});

/* GET /api/v1/auth/users — List all users (admin only) */
gw.get('/auth/users', async (req) => {
  const rolesSnap = await admin.database().ref('roles').once('value');
  const roles = rolesSnap.val() || {};
  const users = [];
  for (const [uid, data] of Object.entries(roles)) {
    try {
      const userRecord = await admin.auth().getUser(uid);
      users.push({ uid, email: userRecord.email, name: data.name, role: data.role, createdAt: userRecord.metadata.creationTime });
    } catch {
      users.push({ uid, email: '(deleted)', name: data.name, role: data.role });
    }
  }
  return users.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
}, { role: 'admin' });

/* POST /api/v1/auth/login — Verify token and return user data */
gw.post('/auth/login', async (req) => {
  // Token already verified by gateway middleware; return profile
  const uid = req.user.uid;
  const snap = await admin.database().ref('roles/' + uid).once('value');
  const roleData = snap.val();
  if (!roleData) return gw.fail('AUTH_NO_ROLE', 'No role assigned. Contact admin.');
  return {
    uid,
    email: req.user.email || '',
    name: roleData.name || '',
    role: roleData.role,
    token: req.headers.authorization?.split('Bearer ')[1]
  };
});

module.exports = {};
