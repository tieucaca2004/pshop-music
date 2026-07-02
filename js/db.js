/*
 * Data layer for Pshop Music.
 * Backed by localStorage today; every function is async and returns the
 * same shape a Firebase Realtime Database swap would return, so switching
 * later means rewriting the bodies of this file only — nothing that calls
 * db.* needs to change. See README.md "Nâng cấp lên Firebase" for the swap.
 */
const DB = (function () {
  const STORAGE_KEY = 'pshop_products';

  function readAll() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('DB parse error', e);
      return null;
    }
  }

  function writeAll(products) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }

  function ensureSeeded() {
    const existing = readAll();
    if (existing === null) {
      writeAll(typeof SEED_PRODUCTS !== 'undefined' ? SEED_PRODUCTS : []);
    }
  }

  function nextId(products) {
    const max = products.reduce((m, p) => Math.max(m, parseInt(p.id, 10) || 0), 0);
    return String(max + 1);
  }

  return {
    getAll() {
      ensureSeeded();
      return Promise.resolve(readAll().slice().sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0)));
    },

    get(id) {
      ensureSeeded();
      const found = readAll().find(p => p.id === id) || null;
      return Promise.resolve(found);
    },

    add(product) {
      ensureSeeded();
      const products = readAll();
      const newProduct = Object.assign({}, product, {
        id: nextId(products),
        createdAt: Date.now()
      });
      products.push(newProduct);
      writeAll(products);
      return Promise.resolve(newProduct);
    },

    update(id, changes) {
      ensureSeeded();
      const products = readAll();
      const idx = products.findIndex(p => p.id === id);
      if (idx === -1) return Promise.reject(new Error('Product not found: ' + id));
      products[idx] = Object.assign({}, products[idx], changes, { id });
      writeAll(products);
      return Promise.resolve(products[idx]);
    },

    remove(id) {
      ensureSeeded();
      const products = readAll().filter(p => p.id !== id);
      writeAll(products);
      return Promise.resolve(true);
    },

    replaceAll(products) {
      writeAll(products);
      return Promise.resolve(true);
    },

    resetToSeed() {
      writeAll(typeof SEED_PRODUCTS !== 'undefined' ? SEED_PRODUCTS : []);
      return Promise.resolve(true);
    }
  };
})();
