/**
 * js/db-mt.js — Multi-Tenant Data Layer (Phase 1, Option B).
 * Cấu trúc: businesses/{businessId}/{collection}/{id}
 * KHÔNG phá vỡ js/db.js cũ. Lớp này chỉ dùng cho code MỚI.
 */
var DBMT = (function() {
  'use strict';

  function ref(businessId, collection) {
    return firebase.database().ref('businesses/' + businessId + '/' + collection);
  }

  function getProducts(businessId) {
    return ref(businessId, 'products').once('value').then(function(s) {
      var d = s.val(); return d ? Object.keys(d).map(function(k) { return Object.assign({ id: k }, d[k]); }) : [];
    });
  }

  function getProduct(businessId, productId) {
    return ref(businessId, 'products/' + productId).once('value').then(function(s) { return s.val(); });
  }

  function addProduct(businessId, data) {
    return ref(businessId, 'products').push(data).then(function(r) { return r.key; });
  }

  function updateProduct(businessId, productId, data) {
    return ref(businessId, 'products/' + productId).update(data);
  }

  function deleteProduct(businessId, productId) {
    return ref(businessId, 'products/' + productId).remove();
  }

  function getCategories(businessId) {
    return ref(businessId, 'categories').once('value').then(function(s) {
      var d = s.val(); return d ? Object.keys(d).map(function(k) { return Object.assign({ id: k }, d[k]); }) : [];
    });
  }

  function addCategory(businessId, data) {
    return ref(businessId, 'categories').push(data).then(function(r) { return r.key; });
  }

  function getBlogPosts(businessId) {
    return ref(businessId, 'blogPosts').once('value').then(function(s) {
      var d = s.val(); return d ? Object.keys(d).map(function(k) { return Object.assign({ id: k }, d[k]); }) : [];
    });
  }

  function addBlogPost(businessId, data) {
    return ref(businessId, 'blogPosts').push(data).then(function(r) { return r.key; });
  }

  function getBanners(businessId) {
    return ref(businessId, 'banners').once('value').then(function(s) {
      var d = s.val(); return d ? Object.keys(d).map(function(k) { return Object.assign({ id: k }, d[k]); }) : [];
    });
  }

  function addBanner(businessId, data) {
    return ref(businessId, 'banners').push(data).then(function(r) { return r.key; });
  }

  function getSettings(businessId) {
    return ref(businessId, 'settings').once('value').then(function(s) { return s.val(); });
  }

  function updateSettings(businessId, data) {
    return ref(businessId, 'settings').update(data);
  }

  return {
    getProducts: getProducts, getProduct: getProduct, addProduct: addProduct,
    updateProduct: updateProduct, deleteProduct: deleteProduct,
    getCategories: getCategories, addCategory: addCategory,
    getBlogPosts: getBlogPosts, addBlogPost: addBlogPost,
    getBanners: getBanners, addBanner: addBanner,
    getSettings: getSettings, updateSettings: updateSettings
  };
})();
if (typeof module !== 'undefined' && module.exports) { module.exports = DBMT; }

// === Phase 2: Expanded Collections ===

function getOrders(businessId) { return getAll('orders', businessId); }
function getOrder(businessId, id) { return ref(businessId, 'orders/' + id).once('value').then(function(s) { return s.val(); }); }
function addOrder(businessId, data) { return ref(businessId, 'orders').push(data).then(function(r) { return r.key; }); }
function updateOrder(businessId, id, data) { return ref(businessId, 'orders/' + id).update(data); }

function getCustomers(businessId) { return getAll('customers', businessId); }
function getCustomer(businessId, id) { return ref(businessId, 'customers/' + id).once('value').then(function(s) { return s.val(); }); }
function addCustomer(businessId, data) { return ref(businessId, 'customers').push(data).then(function(r) { return r.key; }); }

function getInventory(businessId) { return getAll('inventory', businessId); }
function updateInventory(businessId, sku, data) { return ref(businessId, 'inventory/' + sku).update(data); }

function getMedia(businessId) { return getAll('media', businessId); }
function addMedia(businessId, data) { return ref(businessId, 'media').push(data).then(function(r) { return r.key; }); }

function getCms(businessId, collection) { return getAll('cms/' + collection, businessId); }
function updateCms(businessId, collection, id, data) { return ref(businessId, 'cms/' + collection + '/' + id).update(data); }

function getAiJobs(businessId) { return getAll('aiJobs', businessId); }
function getAiDrafts(businessId) { return getAll('aiDrafts', businessId); }
function addAiDraft(businessId, data) { return ref(businessId, 'aiDrafts').push(data).then(function(r) { return r.key; }); }

function getFiles(businessId) { return getAll('files', businessId); }
function getAnalytics(businessId, period) { return getAll('analytics/' + (period || 'daily'), businessId); }
function getNotifications(businessId) { return getAll('notifications', businessId); }
function addNotification(businessId, data) { return ref(businessId, 'notifications').push(data).then(function(r) { return r.key; }); }

// Helper
function getAll(collection, businessId) {
  return ref(businessId, collection).once('value').then(function(s) {
    var d = s.val(); return d ? Object.keys(d).map(function(k) { return Object.assign({ id: k }, d[k]); }) : [];
  });
}

// Export additions
if (typeof module !== 'undefined' && module.exports) { module.exports = DBMT; }
