/*
 * Data layer for Pshop Music — Firebase Realtime Database.
 * Same public API as the old localStorage version (getAll/get/add/update/
 * remove/replaceAll/resetToSeed), so main.js and admin.js needed no changes.
 * Requires js/firebase-config.js (loaded before this file) with real config.
 */
const DB = (function () {
  if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
    console.error('Firebase chưa được cấu hình. Kiểm tra js/firebase-config.js.');
  }

  // Tenant-aware: a real (non-pshop-music) business_admin/editor/viewer
  // reads/writes businesses/{id}/products; everyone else (legacy admin/
  // editor, pshop-music, or AuthContext not yet initialized) keeps using
  // the flat 'products' node unchanged — same RTDB rules already cover both.
  function productsRef() {
    var businessId = (typeof AuthContext !== 'undefined') ? AuthContext.getEffectiveBusinessId() : null;
    if (businessId) return firebase.database().ref('businesses/' + businessId + '/products');
    return firebase.database().ref('products');
  }

  function toArray(val) {
    return val ? Object.keys(val).map(k => val[k]) : [];
  }

  function sortById(products) {
    return products.slice().sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0));
  }

  function ensureSeeded() {
    return productsRef().once('value').then(snapshot => {
      if (!snapshot.exists() && typeof SEED_PRODUCTS !== 'undefined') {
        const updates = {};
        SEED_PRODUCTS.forEach(p => { updates[p.id] = p; });
        return productsRef().set(updates);
      }
    });
  }

  function nextId(products) {
    const max = products.reduce((m, p) => Math.max(m, parseInt(p.id, 10) || 0), 0);
    return String(max + 1);
  }

  return {
    getAll() {
      return ensureSeeded()
        .then(() => productsRef().once('value'))
        .then(snap => sortById(toArray(snap.val())));
    },

    get(id) {
      return productsRef().child(id).once('value').then(snap => snap.val() || null);
    },

    add(product) {
      return productsRef().once('value').then(snap => {
        const products = toArray(snap.val());
        const newProduct = Object.assign({}, product, {
          id: nextId(products),
          createdAt: Date.now()
        });
        return productsRef().child(newProduct.id).set(newProduct).then(() => newProduct);
      });
    },

    update(id, changes) {
      return productsRef().child(id).once('value').then(snap => {
        if (!snap.exists()) return Promise.reject(new Error('Product not found: ' + id));
        const updated = Object.assign({}, snap.val(), changes, { id });
        return productsRef().child(id).set(updated).then(() => updated);
      });
    },

    remove(id) {
      return productsRef().child(id).remove().then(() => true);
    },

    replaceAll(products) {
      const updates = {};
      products.forEach(p => { updates[p.id] = p; });
      return productsRef().set(updates).then(() => true);
    },

    resetToSeed() {
      const updates = {};
      (typeof SEED_PRODUCTS !== 'undefined' ? SEED_PRODUCTS : []).forEach(p => { updates[p.id] = p; });
      return productsRef().set(updates).then(() => true);
    }
  };
})();

/*
 * Site content (hero slideshow images, services section text) — separate
 * Firebase node from products, edited via the "Cài đặt trang" admin panel.
 *
 * NOT made tenant-aware in Task 2.4: this single node mixes menu/footer
 * (approved as platform-level, not tenant data) with heroSlides (approved
 * as tenant data, businesses/{id}/settings/heroSlides per Phase 1's
 * tenantSettings.js). Since admin-sliders.js reads/writes this whole object
 * as one blob, branching it here would risk a tenant business_admin's Save
 * silently clobbering platform-level menu/footer data (or vice versa).
 * Deferred — needs admin-sliders.js UI changes to split heroSlides out
 * before this can be branched safely.
 */
const SiteContentDB = (function () {
  function contentRef() {
    return firebase.database().ref('siteContent');
  }

  function ensureSeeded() {
    return contentRef().once('value').then(snapshot => {
      if (typeof SEED_SITE_CONTENT === 'undefined') return;
      if (!snapshot.exists()) {
        return contentRef().set(SEED_SITE_CONTENT);
      }
      // Backfill any top-level keys added to SEED_SITE_CONTENT after this
      // database was first seeded (e.g. menu/footer/settings), without
      // touching keys the admin has already customized.
      const existing = snapshot.val();
      const missing = {};
      Object.keys(SEED_SITE_CONTENT).forEach(key => {
        if (!(key in existing)) missing[key] = SEED_SITE_CONTENT[key];
      });
      if (Object.keys(missing).length) {
        return contentRef().update(missing);
      }
    });
  }

  return {
    get() {
      return ensureSeeded()
        .then(() => contentRef().once('value'))
        .then(snap => snap.val() || (typeof SEED_SITE_CONTENT !== 'undefined' ? SEED_SITE_CONTENT : {}));
    },

    save(content) {
      return contentRef().set(content).then(() => true);
    },

    resetToSeed() {
      return contentRef().set(typeof SEED_SITE_CONTENT !== 'undefined' ? SEED_SITE_CONTENT : {}).then(() => true);
    }
  };
})();
