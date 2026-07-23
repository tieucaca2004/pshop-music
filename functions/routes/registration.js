/*
 * routes/registration.js — Business Self Registration & Auto Provisioning (Phase 5, Task 16.0).
 *
 * Complete SaaS onboarding flow:
 *   1. Register account (Firebase Auth)
 *   2. Auto-create business with owner as business_admin
 *   3. Activate trial subscription
 *   4. Initialize default settings, categories, permissions
 *
 * Public registration endpoint requires NO authentication.
 * Management endpoints require super_admin role.
 *
 * Email verification:
 *   After registration, sends a verification email via Firebase Auth's
 *   built-in email system (accounts:sendOobCode REST API).
 *   The Web API Key is read from firebase-functions config first,
 *   then falls back to process.env, then to a hardcoded dev value.
 */
const admin = require('firebase-admin');
const { getPlan, DEFAULT_PLANS } = require('../shared/subscriptionValidator');

// ─── Firebase Web API Key (for email verification / sendOobCode) ──────
function getWebApiKey() {
  try {
    const functions = require('firebase-functions');
    const key = functions.config().registration?.web_api_key;
    if (key) return key;
  } catch (_) { /* functions SDK not available */ }
  return process.env.FIREBASE_WEB_API_KEY || 'AIzaSyD-R2cQb-EI4I8wy60z1tuShIXny39Rawc';
}

function makeSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business';
}

function generateBusinessId(name) {
  const slug = makeSlug(name);
  const rand = Math.random().toString(36).substring(2, 6);
  return slug + '-' + rand;
}

async function initializeBusinessData(businessId, data) {
  const db = admin.database();
  const now = admin.database.ServerValue.TIMESTAMP;

  // 1. Business info
  await db.ref('businesses/' + businessId + '/info').set({
    businessId: businessId,
    displayName: data.displayName,
    slug: data.slug || makeSlug(data.displayName),
    ownerUid: data.ownerUid,
    ownerEmail: data.ownerEmail || '',
    status: 'active',
    plan: data.planId || 'starter',
    createdAt: now,
    updatedAt: now,
    timezone: data.timezone || 'Asia/Bangkok',
    currency: data.currency || 'VND',
    country: data.country || 'VN',
    language: data.language || 'vi',
    description: data.description || '',
    onboardingStatus: 'active'
  });

  // 2. Registry entry
  await db.ref('registry/' + businessId).set({
    name: data.displayName,
    slug: data.slug || makeSlug(data.displayName),
    ownerEmail: data.ownerEmail || '',
    created: now,
    status: 'active'
  });

  // 3. Owner as business_admin
  await db.ref('businesses/' + businessId + '/users/' + data.ownerUid).set({
    role: 'business_admin',
    email: data.ownerEmail || '',
    displayName: data.displayName || 'Owner',
    assignedAt: now,
    isOwner: true
  });

  // 4. Subscription with trial
  const trialDays = data.trialDays || 14;
  const trialEndsAt = Date.now() + (trialDays * 24 * 60 * 60 * 1000);
  const plan = await getPlan(data.planId || 'starter');

  await db.ref('businesses/' + businessId + '/subscription').set({
    subscriptionId: 'trial-' + Date.now().toString(36),
    businessId: businessId,
    planId: data.planId || 'starter',
    planName: (plan && plan.name) || 'Starter',
    status: 'active',
    billingCycle: 'trial',
    startAt: Date.now(),
    expiresAt: trialEndsAt + (30 * 24 * 60 * 60 * 1000),
    trialEndsAt: trialEndsAt,
    trialDays: trialDays,
    trialUsed: true,
    autoRenew: false,
    paymentProvider: data.paymentProvider || null,
    createdAt: now,
    updatedAt: now
  });

  // 5. Default settings
  await db.ref('businesses/' + businessId + '/settings').set({
    general: {
      businessName: data.displayName,
      timezone: data.timezone || 'Asia/Bangkok',
      currency: data.currency || 'VND',
      language: data.language || 'vi'
    },
    seo: {
      title: data.displayName,
      description: '',
      favicon: ''
    },
    theme: {
      primaryColor: '#4F46E5',
      secondaryColor: '#10B981',
      logo: ''
    },
    ai: {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o-mini'
    },
    payments: {
      currency: data.currency || 'VND',
      providers: { cash: { enabled: true } }
    },
    notifications: {
      email: true,
      telegram: false
    },
    dashboard: {
      defaultView: 'summary',
      refreshInterval: 30000
    }
  });

  // 6. Default categories
  const defaultCategories = [
    { code: 'food', label: 'Đồ ăn', description: 'Sản phẩm đồ ăn, thức uống', order: 1, status: 'active' },
    { code: 'drink', label: 'Đồ uống', description: 'Nước giải khát, trà sữa, cà phê', order: 2, status: 'active' },
    { code: 'snack', label: 'Ăn vặt', description: 'Đồ ăn nhẹ, snack', order: 3, status: 'active' },
    { code: 'combo', label: 'Combo', description: 'Combo ưu đãi', order: 4, status: 'active' },
    { code: 'other', label: 'Khác', description: 'Sản phẩm khác', order: 5, status: 'active' }
  ];

  var catPromises = defaultCategories.map(function(cat) {
    var ref = db.ref('businesses/' + businessId + '/categories').push();
    return ref.set({
      id: ref.key,
      code: cat.code,
      label: cat.label,
      description: cat.description,
      order: cat.order,
      status: cat.status,
      businessId: businessId,
      createdAt: now
    });
  });
  await Promise.all(catPromises);

  // 7. Feature flags
  const planFlags = (plan && plan.featureFlags) || DEFAULT_PLANS.starter.featureFlags;
  var featureFlags = {};
  (planFlags.length === 1 && planFlags[0] === '*' ? [
    'cms', 'products', 'orders', 'customers', 'inventory',
    'reports', 'ai', 'integrations', 'facebook', 'telegram'
  ] : planFlags).forEach(function(f) {
    featureFlags[f] = { enabled: true };
  });

  await db.ref('businesses/' + businessId + '/features').set(featureFlags);

  // 8. System metadata
  await db.ref('businesses/' + businessId + '/_meta').set({
    version: '1.0.0',
    platformVersion: '2.0.0',
    createdAt: now,
    createdBy: data.ownerUid,
    source: data.source || 'public_registration'
  });

  return businessId;
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  // ─── Public Registration Endpoint (NO AUTH) ─────────────────────────
  // POST /v1/register — Complete self-service onboarding
  if (path === '/v1/register' && req.method === 'POST') {
    const body = req.body || {};

    // Validate required fields
    if (!body.email || typeof body.email !== 'string') {
      return sendError(res, 'INVALID_REQUEST', 'Email là bắt buộc.');
    }
    if (!body.password || typeof body.password !== 'string') {
      return sendError(res, 'INVALID_REQUEST', 'Mật khẩu là bắt buộc.');
    }
    if (!body.displayName || typeof body.displayName !== 'string') {
      return sendError(res, 'INVALID_REQUEST', 'Tên doanh nghiệp là bắt buộc.');
    }

    // Prevent duplicate email
    try {
      await admin.auth().getUserByEmail(body.email);
      return sendError(res, 'CONFLICT', 'Email "' + body.email + '" đã được sử dụng.');
    } catch (err) {
      if (err.code !== 'auth/user-not-found') {
        return sendError(res, 'PROVIDER_ERROR', 'Lỗi xác thực email: ' + err.message);
      }
    }

    // Create Firebase Auth account
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email: body.email,
        password: body.password,
        displayName: body.displayName || body.businessName || 'Owner',
        emailVerified: false
      });
    } catch (err) {
      return sendError(res, 'INVALID_REQUEST', 'Tạo tài khoản thất bại: ' + err.message);
    }

    const uid = userRecord.uid;

    // Generate businessId
    const businessId = body.businessId || generateBusinessId(body.displayName);

    // Prevent duplicate business name
    const bizCheck = await admin.database()
      .ref('businesses/' + businessId + '/info')
      .once('value');
    if (bizCheck.exists()) {
      await admin.auth().deleteUser(uid); // Rollback auth account
      return sendError(res, 'CONFLICT', 'Doanh nghiệp "' + body.displayName + '" đã tồn tại. Vui lòng chọn tên khác.');
    }

    // Auto-provision business
    try {
      await initializeBusinessData(businessId, {
        displayName: body.displayName,
        ownerUid: uid,
        ownerEmail: body.email,
        slug: body.slug || '',
        planId: body.planId || 'starter',
        trialDays: body.trialDays || 14,
        timezone: body.timezone || 'Asia/Bangkok',
        currency: body.currency || 'VND',
        country: body.country || 'VN',
        language: body.language || 'vi',
        description: body.description || '',
        source: body.source || 'public_registration'
      });

      // Set custom claims
      await admin.auth().setCustomUserClaims(uid, {
        businessId: businessId,
        roles: { business_admin: true }
      });

    } catch (err) {
      // Rollback on failure
      await admin.auth().deleteUser(uid).catch(function() {});
      await admin.database().ref('businesses/' + businessId).remove().catch(function() {});
      await admin.database().ref('registry/' + businessId).remove().catch(function() {});
      return sendError(res, 'PROVISIONING_FAILED', 'Khởi tạo doanh nghiệp thất bại: ' + err.message);
    }

    // Create legacy roles entry for backward compatibility
    await admin.database().ref('roles/' + uid).set({
      email: body.email,
      name: body.displayName || 'Owner',
      role: 'admin',
      createdAt: admin.database.ServerValue.TIMESTAMP
    });

    // ─── Send verification email ──────────────────────────────────────
    // Uses Firebase Auth's built-in email system via the REST API.
    // Signs the user in to obtain an idToken, then calls sendOobCode
    // which triggers Firebase to send the verification email with a
    // secure link.
    try {
      const API_KEY = getWebApiKey();
        const signInRes = await fetch(
          'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + API_KEY,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: body.email,
              password: body.password,
              returnSecureToken: true
            })
          }
        );
        const signInData = await signInRes.json();
        if (signInData.idToken) {
          const oobRes = await fetch(
            'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + API_KEY,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestType: 'VERIFY_EMAIL',
                idToken: signInData.idToken
              })
            }
          );
          if (oobRes.ok) {
            console.log('Verification email sent to:', body.email);
          } else {
            const oobData = await oobRes.json();
            console.warn('sendOobCode returned', oobRes.status, 'for', body.email, ':', JSON.stringify(oobData));
          }
        } else {
          console.warn('Could not sign in to send verification email for', body.email, ':', signInData.error ? signInData.error.message : 'no idToken');
        }
      } else {
        console.warn('Could not obtain Web API Key — skipping verification email');
      }
    } catch (emailErr) {
      console.warn('Failed to send verification email:', emailErr.message);
    }

    return sendSuccess(res, {
      businessId: businessId,
      uid: uid,
      email: body.email,
      displayName: body.displayName,
      planId: body.planId || 'starter',
      trialDays: body.trialDays || 14,
      message: 'Registration successful. Please check your email to verify your account.',
      emailVerified: false
    }, { status: 201 });
  }

  // ─── Email Verification (mock) ─────────────────────────────────────
  // POST /v1/register/verify-email
  if (path === '/v1/register/verify-email' && req.method === 'POST') {
    const body = req.body || {};
    if (!body.uid) return sendError(res, 'INVALID_REQUEST', 'uid là bắt buộc.');

    try {
      await admin.auth().updateUser(body.uid, { emailVerified: true });
    } catch (err) {
      return sendError(res, 'NOT_FOUND', 'Không tìm thấy tài khoản: ' + err.message);
    }

    return sendSuccess(res, { uid: body.uid, emailVerified: true });
  }

  // ─── Resend Verification Email ────────────────────────────────────
  // POST /v1/register/resend-verification
  if (path === '/v1/register/resend-verification' && req.method === 'POST') {
    const body = req.body || {};
    if (!body.email) return sendError(res, 'INVALID_REQUEST', 'Email là bắt buộc.');

    try {
      // Get user by email
      const userRecord = await admin.auth().getUserByEmail(body.email);
      if (userRecord.emailVerified) {
        return sendSuccess(res, { email: body.email, emailVerified: true, message: 'Email đã được xác thực trước đó.' });
      }

      // Sign in to get idToken
      const API_KEY = getWebApiKey();

      // We need the password — require it in the request
      if (!body.password) return sendError(res, 'INVALID_REQUEST', 'Cần mật khẩu để gửi lại email xác thực.');

      const signInRes = await fetch(
        'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + API_KEY,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: body.email,
            password: body.password,
            returnSecureToken: true
          })
        }
      );
      const signInData = await signInRes.json();
      if (!signInData.idToken) {
        return sendError(res, 'AUTH_FAILED', 'Đăng nhập thất bại: ' + ((signInData.error && signInData.error.message) || 'sai email hoặc mật khẩu'));
      }

      // Send verification email
      const oobRes = await fetch(
        'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + API_KEY,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestType: 'VERIFY_EMAIL',
            idToken: signInData.idToken
          })
        }
      );

      if (!oobRes.ok) {
        const oobData = await oobRes.json();
        return sendError(res, 'EMAIL_FAILED', 'Gửi email xác thực thất bại: ' + ((oobData.error && oobData.error.message) || 'lỗi không xác định'));
      }

      return sendSuccess(res, {
        email: body.email,
        emailVerified: false,
        message: 'Email xác thực đã được gửi lại. Vui lòng kiểm tra hộp thư của bạn.'
      });

    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        return sendError(res, 'NOT_FOUND', 'Không tìm thấy tài khoản với email: ' + body.email);
      }
      return sendError(res, 'PROVIDER_ERROR', 'Lỗi gửi email xác thực: ' + err.message);
    }
  }

  return null;
}

module.exports = { handle };
