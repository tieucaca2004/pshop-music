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
