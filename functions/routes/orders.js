/*
 * routes/orders.js — Multi-Tenant Orders (Phase 2, Task 11.0).
 *
 * Full order management with automatic inventory deduction/restore
 * and customer statistics updates.
 *
 * Order number format: ORD-{businessId}-{timestamp}
 * Inventory deducted on order creation, restored on cancellation.
 * Customer totalOrders/totalSpent/lastOrderAt updated automatically.
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');

const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];
const ROLE_WRITE = ['super_admin', 'business_admin', 'business_editor'];
const ROLE_ADMIN = ['super_admin', 'business_admin'];

function generateOrderNumber(businessId) {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return 'ORD-' + ts + '-' + rand;
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  if (path.indexOf('/api/v1/businesses/') !== 0) return null;

  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const businessId = req.tenant.businessId;
  const uid = req.user.uid;
  const db = admin.database();
  const ordersPath = 'businesses/' + businessId + '/orders';

  const listPattern = /^\/api\/v1\/businesses\/([^/]+)\/orders$/;
  const itemPattern = /^\/api\/v1\/businesses\/([^/]+)\/orders\/([^/]+)$/;

  const listMatch = path.match(listPattern);
  const itemMatch = path.match(itemPattern);
  if (!listMatch && !itemMatch) return null;

  // ─── GET /.../orders — List / Search ─────────────────────────────────
  if (listMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(ordersPath).once('value');
    const val = snap.val() || {};
    let items = Object.keys(val).map(function(id) {
      return Object.assign({ id: id }, val[id]);
    });

    // Search filter
    const q = req.query && req.query.q ? String(req.query.q).toLowerCase().trim() : '';
    if (q) {
      items = items.filter(function(o) {
        return (o.orderNumber && o.orderNumber.toLowerCase().indexOf(q) >= 0)
          || (o.customerName && o.customerName.toLowerCase().indexOf(q) >= 0)
          || (o.customerPhone && o.customerPhone.indexOf(q) >= 0);
      });
    }

    // Status filter
    const statusFilter = req.query && req.query.status ? String(req.query.status).trim() : '';
    if (statusFilter) {
      items = items.filter(function(o) { return o.orderStatus === statusFilter; });
    }

    items.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return sendSuccess(res, items);
  }

  // ─── POST /.../orders — Create Order ────────────────────────────────
  if (listMatch && req.method === 'POST') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const body = req.body || {};
    if (!body.customerId && !body.customerName) {
      return sendError(res, 'INVALID_REQUEST', 'customerId hoặc customerName là bắt buộc.');
    }
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return sendError(res, 'INVALID_REQUEST', 'Đơn hàng phải có ít nhất một sản phẩm.');
    }

    // Validate customer exists (if customerId provided)
    let customerName = body.customerName || '';
    if (body.customerId) {
      const custSnap = await db.ref('businesses/' + businessId + '/customers/' + body.customerId).once('value');
      if (!custSnap.exists()) {
        return sendError(res, 'NOT_FOUND', 'Khách hàng không tồn tại.');
      }
      const custData = custSnap.val();
      customerName = customerName || custData.fullName || '';
    }

    // Validate and process items
    var calculatedSubtotal = 0;
    var itemRecords = [];

    for (var i = 0; i < body.items.length; i++) {
      var item = body.items[i];
      if (!item.productId && !item.productName) {
        return sendError(res, 'INVALID_REQUEST', 'Mỗi sản phẩm phải có productId hoặc productName.');
      }

      var quantity = typeof item.quantity === 'number' ? item.quantity : 1;
      if (quantity <= 0) {
        return sendError(res, 'INVALID_REQUEST', 'Số lượng phải lớn hơn 0.');
      }

      var unitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
      var itemDiscount = typeof item.discount === 'number' ? item.discount : 0;
      var itemTotal = (unitPrice * quantity) - itemDiscount;
      calculatedSubtotal += itemTotal;

      itemRecords.push({
        productId: item.productId || '',
        productName: item.productName || '',
        quantity: quantity,
        unitPrice: unitPrice,
        discount: itemDiscount,
        total: itemTotal
      });

      // Validate and deduct inventory (if productId provided)
      if (item.productId) {
        var invSnap = await db.ref('businesses/' + businessId + '/inventory')
          .orderByChild('productId')
          .equalTo(item.productId)
          .once('value');

        if (!invSnap.exists()) {
          return sendError(res, 'INVALID_REQUEST', 'Sản phẩm "' + (item.productName || item.productId) + '" chưa có trong kho.');
        }

        var inventoryUpdated = false;
        invSnap.forEach(function(inv) {
          var invData = inv.val();
          var currentStock = invData.stock || 0;
          if (currentStock < quantity) {
            return; // continue — but we track this
          }
          // Deduct inventory
          var afterStock = currentStock - quantity;
          db.ref('businesses/' + businessId + '/inventory/' + inv.key).update({
            stock: afterStock,
            updatedAt: admin.database.ServerValue.TIMESTAMP
          });

          // Record history
          var histRef = db.ref('businesses/' + businessId + '/inventory/' + inv.key + '/history').push();
          histRef.set({
            productId: item.productId,
            sku: invData.sku || '',
            action: 'sell',
            quantity: quantity,
            before: currentStock,
            after: afterStock,
            note: 'Bán hàng - Đơn hàng mới',
            createdAt: admin.database.ServerValue.TIMESTAMP,
            createdBy: uid
          });
          inventoryUpdated = true;
        });

        if (!inventoryUpdated) {
          return sendError(res, 'INSUFFICIENT_STOCK', 'Sản phẩm "' + (item.productName || item.productId) + '" không đủ hàng trong kho.');
        }
      }
    }

    // Calculate financials
    var discount = typeof body.discount === 'number' ? body.discount : 0;
    var tax = typeof body.tax === 'number' ? body.tax : 0;
    var shippingFee = typeof body.shippingFee === 'number' ? body.shippingFee : 0;
    var total = calculatedSubtotal - discount + tax + shippingFee;
    var orderNumber = generateOrderNumber(businessId);

    // Create order
    var ref = db.ref(ordersPath).push();
    var order = {
      id: ref.key,
      orderNumber: orderNumber,
      customerId: body.customerId || '',
      customerName: customerName,
      customerPhone: body.customerPhone || '',
      items: itemRecords,
      subtotal: calculatedSubtotal,
      discount: discount,
      tax: tax,
      shippingFee: shippingFee,
      total: total,
      paymentMethod: body.paymentMethod || '',
      paymentStatus: 'pending',
      orderStatus: 'confirmed',
      note: body.note || '',
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      createdBy: uid,
      updatedBy: uid,
      businessId: businessId
    };
    await ref.set(order);

    // Update customer statistics
    if (body.customerId) {
      db.ref('businesses/' + businessId + '/customers/' + body.customerId).update({
        totalOrders: admin.database.ServerValue.increment(1),
        totalSpent: admin.database.ServerValue.increment(total),
        lastOrderAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP
      });
    }

    return sendSuccess(res, order, { status: 201 });
  }

  // ─── GET /.../orders/{id} — Read One ────────────────────────────────
  if (itemMatch && req.method === 'GET') {
    const roleRes = await requireRole(req, ROLE_READ);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const snap = await db.ref(ordersPath + '/' + itemMatch[2]).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Đơn hàng không tồn tại.');
    return sendSuccess(res, Object.assign({ id: itemMatch[2] }, snap.val()));
  }

  // ─── PATCH /.../orders/{id} — Update ────────────────────────────────
  if (itemMatch && req.method === 'PATCH') {
    const roleRes = await requireRole(req, ROLE_WRITE);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(ordersPath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Đơn hàng không tồn tại.');

    const body = req.body || {};
    const changes = {};

    ['paymentMethod', 'paymentStatus', 'orderStatus', 'note',
      'discount', 'tax', 'shippingFee'].forEach(function(f) {
      if (body[f] !== undefined) changes[f] = body[f];
    });

    // Recalculate total if financial fields changed
    var current = snap.val();
    if (body.discount !== undefined || body.tax !== undefined || body.shippingFee !== undefined) {
      changes.total = (current.subtotal || 0)
        - (changes.discount !== undefined ? changes.discount : (current.discount || 0))
        + (changes.tax !== undefined ? changes.tax : (current.tax || 0))
        + (changes.shippingFee !== undefined ? changes.shippingFee : (current.shippingFee || 0));
    }

    changes.updatedAt = admin.database.ServerValue.TIMESTAMP;
    changes.updatedBy = uid;

    await db.ref(ordersPath + '/' + id).update(changes);
    const updated = await db.ref(ordersPath + '/' + id).once('value');
    return sendSuccess(res, Object.assign({ id: id }, updated.val()));
  }

  // ─── PATCH /.../orders/{id}?action=cancel — Cancel Order ──────────
  if (itemMatch && req.method === 'PATCH' && req.query && req.query.action === 'cancel') {
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(ordersPath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Đơn hàng không tồn tại.');

    const order = snap.val();
    if (order.orderStatus === 'cancelled') {
      return sendError(res, 'CONFLICT', 'Đơn hàng đã được hủy trước đó.');
    }
    if (order.orderStatus === 'completed') {
      return sendError(res, 'CONFLICT', 'Không thể hủy đơn hàng đã hoàn thành.');
    }

    // Restore inventory
    var items = order.items || [];
    var restorePromises = [];
    items.forEach(function(item) {
      if (item.productId && item.quantity) {
        // Find inventory record by productId
        var p = db.ref('businesses/' + businessId + '/inventory')
          .orderByChild('productId')
          .equalTo(item.productId)
          .once('value')
          .then(function(invSnap) {
            invSnap.forEach(function(inv) {
              var invData = inv.val();
              var currentStock = invData.stock || 0;
              var afterStock = currentStock + item.quantity;
              db.ref('businesses/' + businessId + '/inventory/' + inv.key).update({
                stock: afterStock,
                updatedAt: admin.database.ServerValue.TIMESTAMP
              });
              var histRef = db.ref('businesses/' + businessId + '/inventory/' + inv.key + '/history').push();
              histRef.set({
                productId: item.productId,
                sku: invData.sku || '',
                action: 'cancel_order',
                quantity: item.quantity,
                before: currentStock,
                after: afterStock,
                note: 'Hủy đơn hàng #' + order.orderNumber,
                createdAt: admin.database.ServerValue.TIMESTAMP,
                createdBy: uid
              });
            });
          });
        restorePromises.push(p);
      }
    });
    await Promise.all(restorePromises);

    // Update order status
    await db.ref(ordersPath + '/' + id).update({
      orderStatus: 'cancelled',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      updatedBy: uid
    });

    // Restore customer statistics
    if (order.customerId) {
      db.ref('businesses/' + businessId + '/customers/' + order.customerId).update({
        totalOrders: admin.database.ServerValue.increment(-1),
        totalSpent: admin.database.ServerValue.increment(-(order.total || 0)),
        updatedAt: admin.database.ServerValue.TIMESTAMP
      });
    }

    const updated = await db.ref(ordersPath + '/' + id).once('value');
    return sendSuccess(res, Object.assign({ id: id }, updated.val()));
  }

  // ─── DELETE /.../orders/{id} — Cancel (same as cancel) ─────────────
  if (itemMatch && req.method === 'DELETE') {
    // Redirect to cancel — we don't hard-delete orders
    const roleRes = await requireRole(req, ROLE_ADMIN);
    if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

    const id = itemMatch[2];
    const snap = await db.ref(ordersPath + '/' + id).once('value');
    if (!snap.exists()) return sendError(res, 'NOT_FOUND', 'Đơn hàng không tồn tại.');

    await db.ref(ordersPath + '/' + id).update({
      orderStatus: 'cancelled',
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      updatedBy: uid
    });

    return sendSuccess(res, { cancelled: true, id: id, orderStatus: 'cancelled' });
  }

  return null;
}

module.exports = { handle };
