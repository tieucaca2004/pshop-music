/*
 * Data layer for the CMS modules added on top of the original product/site-
 * content system in js/db.js — same Promise-based get/add/update/remove
 * shape, so admin pages and public pages never touch the Firebase SDK
 * directly. Requires js/firebase-config.js loaded before this file.
 */
// tenantSubPath: path under businesses/{id}/ to use for a real (non-legacy)
// tenant business_admin/editor/viewer, e.g. 'categories' or 'cms/banners' —
// matches the equivalent backend route exactly (categories.js's dedicated
// businesses/{id}/categories, or tenantCms.js's businesses/{id}/cms/{name}).
// Omit for modules that stay platform-level only.
function makeListDB(nodeName, seedArray, tenantSubPath) {
  function effectiveBusinessId() {
    return (typeof AuthContext !== 'undefined') ? AuthContext.getEffectiveBusinessId() : null;
  }

  function nodeRef() {
    const businessId = tenantSubPath ? effectiveBusinessId() : null;
    if (businessId) return firebase.database().ref('businesses/' + businessId + '/' + tenantSubPath);
    return firebase.database().ref(nodeName);
  }

  function toArray(val) {
    return val ? Object.keys(val).map(k => val[k]) : [];
  }

  function sortByOrder(items) {
    return items.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function ensureSeeded() {
    // A real tenant starts empty (registration never seeds business content)
    // — only the legacy flat node gets the hardcoded seed data.
    if (tenantSubPath && effectiveBusinessId()) return Promise.resolve();
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

const CategoryDB = makeListDB('categories', typeof SEED_CATEGORIES !== 'undefined' ? SEED_CATEGORIES : [], 'categories');
const BannerDB = makeListDB('banners', [], 'cms/banners');
const BlogDB = (function () {
  const base = makeListDB('blogPosts', [], 'cms/blog');
  return Object.assign({}, base, {
    getBySlug(slug) {
      return base.getAll().then(posts => posts.find(p => p.slug === slug) || null);
    },
    getPublished() {
      return base.getAll().then(posts => posts.filter(p => p.status === 'published'));
    }
  });
})();
const VideoDB = makeListDB('videos', [], 'cms/videos');

// NOT made tenant-aware in Task 2.4: legacy seoSettings uses
// {defaultTitle,defaultDescription,ogImage,gaId,searchConsoleTag,robotsExtra},
// but the tenant settings/seo node (created at registration) uses a
// different shape {title,description,favicon}. Branching the ref alone
// would leave admin-seo.js's form silently blank for tenants (reading
// fields that don't exist on their data) and writing a second, unused set
// of fields alongside their real title/description/favicon. Needs
// admin-seo.js UI changes to bridge the two shapes before this can be
// branched safely — deferred, same reasoning as SiteContentDB in db.js.
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
