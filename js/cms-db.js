/*
 * Data layer for the CMS modules added on top of the original product/site-
 * content system in js/db.js — same Promise-based get/add/update/remove
 * shape, so admin pages and public pages never touch the Firebase SDK
 * directly. Requires js/firebase-config.js loaded before this file.
 */
function makeListDB(nodeName, seedArray) {
  function nodeRef() {
    return firebase.database().ref(nodeName);
  }

  function toArray(val) {
    return val ? Object.keys(val).map(k => val[k]) : [];
  }

  function sortByOrder(items) {
    return items.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function ensureSeeded() {
    return nodeRef().once('value').then(snapshot => {
      if (!snapshot.exists() && Array.isArray(seedArray) && seedArray.length) {
        const updates = {};
        seedArray.forEach(item => {
          const key = nodeRef().push().key;
          updates[key] = Object.assign({}, item, { id: key });
        });
        return nodeRef().set(updates);
      }
    });
  }

  return {
    getAll() {
      return ensureSeeded()
        .then(() => nodeRef().once('value'))
        .then(snap => sortByOrder(toArray(snap.val())));
    },

    get(id) {
      return nodeRef().child(id).once('value').then(snap => snap.val() || null);
    },

    add(item) {
      const key = nodeRef().push().key;
      const newItem = Object.assign({}, item, { id: key, createdAt: Date.now() });
      return nodeRef().child(key).set(newItem).then(() => newItem);
    },

    update(id, changes) {
      return nodeRef().child(id).once('value').then(snap => {
        if (!snap.exists()) return Promise.reject(new Error(nodeName + ' not found: ' + id));
        const updated = Object.assign({}, snap.val(), changes, { id });
        return nodeRef().child(id).set(updated).then(() => updated);
      });
    },

    remove(id) {
      return nodeRef().child(id).remove().then(() => true);
    },

    resetToSeed() {
      return nodeRef().remove().then(() => ensureSeeded());
    }
  };
}

const CategoryDB = makeListDB('categories', typeof SEED_CATEGORIES !== 'undefined' ? SEED_CATEGORIES : []);
const BannerDB = makeListDB('banners', []);
const BlogDB = (function () {
  const base = makeListDB('blogPosts', []);
  return Object.assign({}, base, {
    getBySlug(slug) {
      return base.getAll().then(posts => posts.find(p => p.slug === slug) || null);
    },
    getPublished() {
      return base.getAll().then(posts => posts.filter(p => p.status === 'published'));
    }
  });
})();
const VideoDB = makeListDB('videos', []);

const SeoDB = (function () {
  function ref() {
    return firebase.database().ref('seoSettings');
  }
  const SEED_SEO = {
    defaultTitle: 'Pshop Music - Thiết Bị DJ & Âm Thanh Chuyên Nghiệp | Nha Trang',
    defaultDescription: 'Mua bán, cho thuê thiết bị DJ, loa kiểm âm, soundcard, tai nghe chuyên nghiệp tại Nha Trang.',
    ogImage: '',
    gaId: '',
    searchConsoleTag: '',
    robotsExtra: ''
  };
  return {
    get() {
      return ref().once('value').then(snap => snap.val() || SEED_SEO);
    },
    save(settings) {
      return ref().set(settings).then(() => true);
    },
    resetToSeed() {
      return ref().set(SEED_SEO).then(() => true);
    }
  };
})();
