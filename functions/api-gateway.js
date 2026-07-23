/* VSH API Gateway v1 - RESTful API layer for PSH
 * Routes: /api/v1/{module}/{action}
 * Auth: Firebase ID token via Authorization header
 * Response: { success: bool, data: ?, error: ?, meta: { requestId, timestamp } }
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

/* --- Configuration --- */
const API_PREFIX = '/api/v1';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['https://pshopmusic.com', 'https://atieu.com', 'http://localhost:3000'];

/* --- Response helpers --- */
function ok(data, meta) {
  return { success: true, data: data || null, error: null, meta: { timestamp: Date.now(), ...meta } };
}

function fail(code, message, details) {
  return { success: false, data: null, error: { code, message, details: details || null }, meta: { timestamp: Date.now() } };
}

/* --- Auth middleware --- */
async function authenticate(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return fail('AUTH_MISSING', 'Missing or invalid Authorization header');
  const token = header.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    return null;
  } catch (e) {
    return fail('AUTH_INVALID', 'Invalid or expired token: ' + e.message);
  }
}

/* --- RBAC middleware --- */
async function authorize(req, requiredRole) {
  if (!requiredRole) return null;
  try {
    const snap = await admin.database().ref('roles/' + req.user.uid).once('value');
    const roleData = snap.val();
    if (!roleData) return fail('AUTH_NO_ROLE', 'User has no role assigned');
    if (requiredRole === 'admin' && roleData.role !== 'admin') return fail('AUTH_FORBIDDEN', 'Admin role required');
    if (requiredRole === 'editor' && roleData.role !== 'editor' && roleData.role !== 'admin') return fail('AUTH_FORBIDDEN', 'Editor role required');
    req.role = roleData.role;
    return null;
  } catch (e) {
    return fail('AUTH_ERROR', 'Role check failed: ' + e.message);
  }
}

/* --- CORS handler --- */
function handleCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
    res.set('Access-Control-Allow-Origin', origin || '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.set('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') { res.status(204).send(''); return true; }
  return false;
}

/* --- Route registration --- */
const routes = [];

function register(method, path, handler, options) {
  routes.push({ method: method.toUpperCase(), path: API_PREFIX + path, handler, options: options || {} });
}

function get(path, handler, opts) { register('GET', path, handler, opts); }
function post(path, handler, opts) { register('POST', path, handler, opts); }
function put(path, handler, opts) { register('PUT', path, handler, opts); }
function patch(path, handler, opts) { register('PATCH', path, handler, opts); }
function del(path, handler, opts) { register('DELETE', path, handler, opts); }

/* --- Router --- */
function matchRoute(method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = {};
    const pattern = '^' + route.path.replace(/:(\w+)/g, (_, name) => { params[name] = true; return '([^/]+)'; }) + '$';
    const match = pathname.match(new RegExp(pattern));
    if (match) {
      const routeParams = {};
      let i = 1;
      for (const name of Object.keys(params)) { routeParams[name] = match[i++]; }
      return { handler: route.handler, options: route.options, params: routeParams };
    }
  }
  return null;
}

/* --- Request handler --- */
async function handleRequest(req, res) {
  const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const start = Date.now();

  // CORS
  if (handleCors(req, res)) return;

  // Route matching
  const method = req.method;
  const pathname = req.path || '/';
  const matched = matchRoute(method, pathname);

  if (!matched) {
    res.status(404).json(fail('NOT_FOUND', 'No route: ' + method + ' ' + pathname));
    return;
  }

  // Auth
  const authErr = await authenticate(req);
  if (authErr && !matched.options.public) {
    res.status(401).json(authErr);
    return;
  }

  // RBAC
  const authzErr = await authorize(req, matched.options.role);
  if (authzErr) {
    res.status(403).json(authzErr);
    return;
  }

  // Execute
  try {
    req.params = matched.params || {};
    const result = await matched.handler(req, res);
    const elapsed = Date.now() - start;
    if (!res.headersSent) {
      res.json(ok(result, { requestId, elapsed }));
    }
  } catch (e) {
    functions.logger.error('API error:', { requestId, method, pathname, error: e.message, stack: e.stack });
    if (!res.headersSent) {
      res.status(500).json(fail('INTERNAL', 'Internal server error', { requestId }));
    }
  }
}

/* --- Health endpoint (public, no auth) --- */
get('/health', async () => {
  return { status: 'ok', version: '1.0.0', uptime: process.uptime() };
}, { public: true });

/* --- Export --- */
module.exports = { handleRequest, register, get, post, put, patch, del, ok, fail, routes };
