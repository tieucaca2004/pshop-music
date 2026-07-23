/*
 * routes/reports.js — Multi-Tenant Reports & Dashboard (Phase 3, Task 14.0).
 *
 * Dashboard summaries and detailed reports for all business modules.
 * Data is computed on-the-fly from live RTDB data and cached under
 * /businesses/{businessId}/reports/{type}/{period}.
 *
 * Uses production middleware:
 *   verifyAuth() → requireBusiness() → requireRole()
 */
const admin = require('firebase-admin');
const { verifyAuth, requireBusiness, requireRole } = require('../shared/auth');

const ROLE_READ = ['super_admin', 'business_admin', 'business_editor', 'business_viewer'];

function getTimeRange(filter) {
  const now = Date.now();
  const d = new Date(now);
  let start, label;

  switch (filter) {
    case 'today':
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      label = new Date(start).toISOString().slice(0, 10);
      break;
    case 'week':
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(d.getFullYear(), d.getMonth(), diff).getTime();
      label = 'week-' + new Date(start).toISOString().slice(0, 10);
      break;
    case 'month':
      start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      label = 'month-' + new Date(start).toISOString().slice(0, 7);
      break;
    case 'year':
      start = new Date(d.getFullYear(), 0, 1).getTime();
      label = 'year-' + d.getFullYear();
      break;
    default:
      // Custom range
      start = 0;
      label = 'custom';
  }

  return { start, end: now, label };
}

async function computeDashboard(businessId) {
  const db = admin.database();

  // Parallel reads for speed
  const [ordersSnap, custSnap, prodSnap, invSnap, paySnap] = await Promise.all([
    db.ref('businesses/' + businessId + '/orders').once('value'),
    db.ref('businesses/' + businessId + '/customers').once('value'),
    db.ref('businesses/' + businessId + '/products').once('value'),
    db.ref('businesses/' + businessId + '/inventory').once('value'),
    db.ref('businesses/' + businessId + '/payments').once('value')
  ]);

  const orders = ordersSnap.val() || {};
  const customers = custSnap.val() || {};
  const products = prodSnap.val() || {};
  const inventory = invSnap.val() || {};
  const payments = paySnap.val() || {};

  const orderIds = Object.keys(orders);
  const custIds = Object.keys(customers);
  const prodIds = Object.keys(products);
  const invIds = Object.keys(inventory);
  const payIds = Object.keys(payments);

  // Compute summary
  let totalRevenue = 0;
  let totalOrders = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let pendingOrders = 0;
  let avgOrderValue = 0;

  orderIds.forEach(function(id) {
    var o = orders[id];
    if (o.orderStatus === 'cancelled') cancelledOrders++;
    else if (o.orderStatus === 'completed') completedOrders++;
    else pendingOrders++;
    if (o.total && o.orderStatus !== 'cancelled') {
      totalRevenue += o.total;
    }
    totalOrders++;
  });
  avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Payments stats
  let successPayments = 0;
  let failedPayments = 0;
  let refundAmount = 0;
  let providerStats = {};
  payIds.forEach(function(id) {
    var p = payments[id];
    if (p.status === 'paid') successPayments++;
    else if (p.status === 'failed') failedPayments++;
    else if (p.status === 'refunded') {
      refundAmount += p.amount || 0;
    }
    var prov = p.provider || 'unknown';
    if (!providerStats[prov]) providerStats[prov] = { count: 0, total: 0 };
    providerStats[prov].count++;
    providerStats[prov].total += p.amount || 0;
  });

  // Inventory stats
  let lowStock = 0;
  let outOfStock = 0;
  invIds.forEach(function(id) {
    var inv = inventory[id];
    var stock = inv.stock || 0;
    var threshold = inv.lowStockThreshold || 5;
    if (stock === 0) outOfStock++;
    else if (stock <= threshold) lowStock++;
  });

  var runningOrdersCount = 0;
  var today = new Date();
  var todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  orderIds.forEach(function(id) {
    if ((orders[id].createdAt || 0) >= todayStart) runningOrdersCount++;
  });

  return {
    summary: {
      totalRevenue: totalRevenue,
      totalOrders: totalOrders,
      completedOrders: completedOrders,
      pendingOrders: pendingOrders,
      cancelledOrders: cancelledOrders,
      averageOrderValue: avgOrderValue,
      todayOrders: runningOrdersCount
    },
    customers: {
      total: custIds.length,
      active: Object.values(customers).filter(function(c) { return c.status !== 'deleted'; }).length
    },
    products: {
      total: prodIds.length,
      published: Object.values(products).filter(function(p) { return p.status === 'published' || !p.status; }).length
    },
    inventory: {
      total: invIds.length,
      lowStock: lowStock,
      outOfStock: outOfStock
    },
    payments: {
      total: payIds.length,
      successful: successPayments,
      failed: failedPayments,
      refundAmount: refundAmount,
      providers: providerStats
    }
  };
}

async function computeRevenueReport(businessId, filter) {
  const db = admin.database();
  const range = getTimeRange(filter);
  const ordersSnap = await db.ref('businesses/' + businessId + '/orders').once('value');
  const orders = ordersSnap.val() || {};

  var daily = {};
  var monthly = {};
  var byProvider = {};
  var byProduct = {};
  var byCategory = {};
  var total = 0;
  var count = 0;

  Object.keys(orders).forEach(function(id) {
    var o = orders[id];
    var ts = o.createdAt || 0;
    if (ts < range.start) return;
    if (o.orderStatus === 'cancelled') return;

    var d = new Date(ts);
    var dayKey = d.toISOString().slice(0, 10);
    var monthKey = d.toISOString().slice(0, 7);
    var amount = o.total || 0;

    daily[dayKey] = (daily[dayKey] || 0) + amount;
    monthly[monthKey] = (monthly[monthKey] || 0) + amount;

    var provider = o.paymentMethod || 'unknown';
    byProvider[provider] = (byProvider[provider] || 0) + amount;

    (o.items || []).forEach(function(item) {
      var pName = item.productName || item.productId || 'unknown';
      byProduct[pName] = (byProduct[pName] || 0) + (item.total || 0);
    });

    total += amount;
    count++;
  });

  return {
    period: filter,
    label: range.label,
    totalRevenue: total,
    orderCount: count,
    averageOrderValue: count > 0 ? Math.round(total / count) : 0,
    byDay: daily,
    byMonth: monthly,
    byPaymentProvider: byProvider,
    byProduct: byProduct,
    byCategory: byCategory
  };
}

async function computeCustomerReport(businessId, filter) {
  const db = admin.database();
  const range = getTimeRange(filter);
  const custSnap = await db.ref('businesses/' + businessId + '/customers').once('value');
  const ordersSnap = await db.ref('businesses/' + businessId + '/orders').once('value');
  const customers = custSnap.val() || {};
  const orders = ordersSnap.val() || {};

  var custIds = Object.keys(customers);
  var newCustomers = 0;
  var returning = 0;
  var customerOrders = {};
  var customerSpent = {};

  Object.keys(orders).forEach(function(id) {
    var o = orders[id];
    var cid = o.customerId || '';
    if (cid) {
      customerOrders[cid] = (customerOrders[cid] || 0) + 1;
      customerSpent[cid] = (customerSpent[cid] || 0) + (o.total || 0);
    }
  });

  custIds.forEach(function(id) {
    var c = customers[id];
    var ts = c.createdAt || 0;
    if (ts >= range.start && ts <= range.end) newCustomers++;
    if ((customerOrders[id] || 0) > 1) returning++;
  });

  // Top customers
  var topCustomers = Object.keys(customerSpent)
    .map(function(id) {
      return { customerId: id, orders: customerOrders[id] || 0, totalSpent: customerSpent[id] || 0 };
    })
    .sort(function(a, b) { return b.totalSpent - a.totalSpent; })
    .slice(0, 20);

  return {
    period: filter,
    label: range.label,
    total: custIds.length,
    newCustomers: newCustomers,
    returningCustomers: returning,
    topCustomers: topCustomers,
    totalLTV: Object.values(customerSpent).reduce(function(s, v) { return s + v; }, 0),
    averageLTV: custIds.length > 0
      ? Math.round(Object.values(customerSpent).reduce(function(s, v) { return s + v; }, 0) / custIds.length)
      : 0
  };
}

async function computeInventoryReport(businessId) {
  const db = admin.database();
  const invSnap = await db.ref('businesses/' + businessId + '/inventory').once('value');
  const ordersSnap = await db.ref('businesses/' + businessId + '/orders').once('value');
  const inventory = invSnap.val() || {};
  const orders = ordersSnap.val() || {};

  var invIds = Object.keys(inventory);
  var lowStock = [];
  var outOfStock = [];
  var productSales = {};

  invIds.forEach(function(id) {
    var inv = inventory[id];
    var stock = inv.stock || 0;
    var threshold = inv.lowStockThreshold || 5;
    var entry = {
      id: id,
      sku: inv.sku || '',
      productName: inv.productName || '',
      stock: stock,
      threshold: threshold
    };
    if (stock === 0) outOfStock.push(entry);
    else if (stock <= threshold) lowStock.push(entry);
  });

  // Compute product sales from orders
  Object.keys(orders).forEach(function(id) {
    var o = orders[id];
    if (o.orderStatus === 'cancelled') return;
    (o.items || []).forEach(function(item) {
      var key = item.productId || item.productName || 'unknown';
      if (!productSales[key]) {
        productSales[key] = { productId: item.productId, productName: item.productName, totalSold: 0, totalRevenue: 0 };
      }
      productSales[key].totalSold += item.quantity || 0;
      productSales[key].totalRevenue += item.total || 0;
    });
  });

  var sortedBySales = Object.values(productSales).sort(function(a, b) { return b.totalSold - a.totalSold; });
  var bestSelling = sortedBySales.slice(0, 30);
  var slowMoving = sortedBySales.filter(function(p) { return p.totalSold <= 2; });

  return {
    total: invIds.length,
    lowStock: lowStock,
    outOfStock: outOfStock,
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
    bestSelling: bestSelling,
    slowMoving: slowMoving,
    slowMovingCount: slowMoving.length
  };
}

async function exportCSV(data, filename) {
  if (!data || data.length === 0) return '';
  var headers = Object.keys(data[0]);
  var lines = [headers.join(',')];
  data.forEach(function(row) {
    lines.push(headers.map(function(h) {
      var val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
      // Escape CSV
      if (val.indexOf(',') >= 0 || val.indexOf('"') >= 0 || val.indexOf('\n') >= 0) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(','));
  });
  return lines.join('\n');
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError } = helpers;
  const path = req.__pshPath;

  if (path.indexOf('/api/v1/businesses/') !== 0) return null;

  const authRes = await verifyAuth(req);
  if (!authRes.ok) return sendError(res, authRes.code, authRes.error);

  const bizRes = await requireBusiness(req);
  if (!bizRes.ok) return sendError(res, bizRes.code, bizRes.error);

  const roleRes = await requireRole(req, ROLE_READ);
  if (!roleRes.ok) return sendError(res, roleRes.code, roleRes.error);

  const businessId = req.tenant.businessId;
  const db = admin.database();

  // Routes:
  // GET /.../reports/dashboard — Dashboard summary
  // GET /.../reports/revenue — Revenue report (?filter=today|week|month|year)
  // GET /.../reports/orders — Orders report (?filter=...)
  // GET /.../reports/customers — Customer report (?filter=...)
  // GET /.../reports/inventory — Inventory report
  // GET /.../reports/payments — Payment report (?filter=...)

  const reportPattern = /^\/api\/v1\/businesses\/([^/]+)\/reports\/([a-z]+)$/;
  const match = path.match(reportPattern);
  if (!match) return null;

  const reportType = match[2];
  const filter = req.query && req.query.filter ? String(req.query.filter) : 'month';
  const format = req.query && req.query.format ? String(req.query.format) : 'json';
  const cacheKey = 'businesses/' + businessId + '/reports/' + reportType + '/' + getTimeRange(filter).label;

  // Try cache first (skip if ?nocache=true)
  var skipCache = req.query && req.query.nocache === 'true';
  if (!skipCache && reportType !== 'dashboard') {
    var cachedSnap = await db.ref(cacheKey).once('value');
    if (cachedSnap.exists()) {
      var cached = cachedSnap.val();
      if (format === 'csv') {
        var csvData = Array.isArray(cached) ? cached : [cached];
        var csv = await exportCSV(csvData, reportType + '-' + getTimeRange(filter).label);
        res.set('Content-Type', 'text/csv');
        res.set('Content-Disposition', 'attachment; filename="' + reportType + '-' + getTimeRange(filter).label + '.csv"');
        return res.status(200).send(csv);
      }
      return sendSuccess(res, cached);
    }
  }

  // ─── Dashboard ───────────────────────────────────────────────────
  if (reportType === 'dashboard') {
    var dashboard = await computeDashboard(businessId);
    return sendSuccess(res, dashboard);
  }

  // ─── Revenue Report ──────────────────────────────────────────────
  if (reportType === 'revenue') {
    var revenue = await computeRevenueReport(businessId, filter);
    if (!skipCache) {
      await db.ref(cacheKey).set(revenue);
    }
    if (format === 'csv') {
      var revCsv = [];
      Object.keys(revenue.byDay || {}).forEach(function(d) {
        revCsv.push({ date: d, revenue: revenue.byDay[d] });
      });
      var csv = await exportCSV(revCsv, 'revenue-' + getTimeRange(filter).label);
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', 'attachment; filename="revenue-' + getTimeRange(filter).label + '.csv"');
      return res.status(200).send(csv);
    }
    return sendSuccess(res, revenue);
  }

  // ─── Orders Report ───────────────────────────────────────────────
  if (reportType === 'orders') {
    var range = getTimeRange(filter);
    var ordersSnap = await db.ref('businesses/' + businessId + '/orders').once('value');
    var orders = ordersSnap.val() || {};
    var total = 0, completed = 0, pending = 0, cancelled = 0, revenue = 0;

    Object.keys(orders).forEach(function(id) {
      var o = orders[id];
      var ts = o.createdAt || 0;
      if (ts < range.start) return;
      if (o.orderStatus === 'cancelled') cancelled++;
      else if (o.orderStatus === 'completed') completed++;
      else pending++;
      total++;
      if (o.total && o.orderStatus !== 'cancelled') revenue += o.total;
    });

    var result = {
      period: filter,
      label: range.label,
      total: total,
      completed: completed,
      pending: pending,
      cancelled: cancelled,
      revenue: revenue,
      averageOrderValue: total > 0 ? Math.round(revenue / total) : 0
    };

    if (!skipCache) await db.ref(cacheKey + '-summary').set(result);
    return sendSuccess(res, result);
  }

  // ─── Customer Report ─────────────────────────────────────────────
  if (reportType === 'customers') {
    var customerReport = await computeCustomerReport(businessId, filter);
    if (!skipCache) await db.ref(cacheKey).set(customerReport);
    return sendSuccess(res, customerReport);
  }

  // ─── Inventory Report ────────────────────────────────────────────
  if (reportType === 'inventory') {
    var invReport = await computeInventoryReport(businessId);
    if (!skipCache) await db.ref(cacheKey).set(invReport);
    if (format === 'csv') {
      var allItems = invReport.lowStock.concat(invReport.outOfStock);
      var csv = await exportCSV(allItems, 'inventory-' + new Date().toISOString().slice(0, 10));
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', 'attachment; filename="inventory.csv"');
      return res.status(200).send(csv);
    }
    return sendSuccess(res, invReport);
  }

  // ─── Payment Report ──────────────────────────────────────────────
  if (reportType === 'payments') {
    var range = getTimeRange(filter);
    var paySnap = await db.ref('businesses/' + businessId + '/payments').once('value');
    var payments = paySnap.val() || {};
    var successful = 0, failed = 0, refunded = 0, refundTotal = 0, totalAmount = 0;
    var providerStats = {};

    Object.keys(payments).forEach(function(id) {
      var p = payments[id];
      var ts = p.createdAt || 0;
      if (ts < range.start) return;
      if (p.status === 'paid') successful++;
      else if (p.status === 'failed') failed++;
      else if (p.status === 'refunded') {
        refunded++;
        refundTotal += p.amount || 0;
      }
      totalAmount += p.amount || 0;
      var prov = p.provider || 'unknown';
      if (!providerStats[prov]) providerStats[prov] = { count: 0, total: 0, refunded: 0 };
      providerStats[prov].count++;
      providerStats[prov].total += p.amount || 0;
      if (p.status === 'refunded') providerStats[prov].refunded += p.amount || 0;
    });

    var result = {
      period: filter,
      label: range.label,
      successful: successful,
      failed: failed,
      refunded: refunded,
      refundTotal: refundTotal,
      totalAmount: totalAmount,
      providers: providerStats
    };
    if (!skipCache) await db.ref(cacheKey).set(result);
    return sendSuccess(res, result);
  }

  return null;
}

module.exports = { handle };
