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

// CmsSaveError — báo LƯU THẤT BẠI rõ ràng (trước đây mọi nút Lưu của CMS
// không có .catch: Firebase từ chối ghi → UI im lặng, Founder tưởng đã lưu).
const CmsSaveError = (function () {
  function classify(err) {
    const msg = String((err && (err.code || err.message)) || err || '');
    if (/PERMISSION_DENIED|permission.denied|permission_denied/i.test(msg)) return 'Không có quyền ghi — phiên đăng nhập có thể đã hết hạn hoặc tài khoản bị đổi quyền. Tải lại trang rồi đăng nhập lại.';
    if (/network|offline|disconnect|Failed to fetch/i.test(msg)) return 'Lỗi mạng — kiểm tra kết nối rồi bấm Lưu lại.';
    if (/timeout/i.test(msg)) return 'Hết thời gian chờ máy chủ — bấm Lưu lại.';
    if (/invalid|validation|undefined value|contains an invalid/i.test(msg)) return 'Dữ liệu không hợp lệ: ' + msg;
    return 'Lỗi không xác định: ' + msg;
  }
  function report(err) {
    console.error('[CMS save failed]', err);
    alert('LƯU THẤT BẠI — dữ liệu CHƯA được lưu.\n' + classify(err));
  }
  return { report, classify };
})();

// CmsEditGuard — phát hiện XUNG ĐỘT khi Lưu: chụp bản ghi lúc mở form, lúc
// Lưu đọc lại DB và so sánh. Không cần field version/schema mới. Khác nhau
// → KHÔNG ghi, hỏi Founder (mặc định an toàn = giữ form, chưa lưu).
const CmsEditGuard = (function () {
  const snapshots = {};
  function stable(r) {
    if (!r || typeof r !== 'object') return JSON.stringify(r === undefined ? null : r);
    if (Array.isArray(r)) return '[' + r.map(stable).join(',') + ']';
    return '{' + Object.keys(r).sort().map(k => JSON.stringify(k) + ':' + stable(r[k])).join(',') + '}';
  }
  function capture(scope, record) { snapshots[scope] = stable(record); }
  function clear(scope) { delete snapshots[scope]; }
  function changedSince(scope, current) { return scope in snapshots && snapshots[scope] !== stable(current); }
  // askConflict() → Promise<'keep'|'reload'|'overwrite'>
  function askConflict() {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center';
      wrap.innerHTML = '<div role="dialog" aria-modal="true" style="background:#fff;max-width:460px;padding:1.4rem;border-radius:10px;font-size:.95rem;line-height:1.5">' +
        '<h3 style="margin:0 0 .6rem">Dữ liệu đã được thay đổi ở nơi khác</h3>' +
        '<p style="margin:0 0 1rem">Bản ghi này đã bị sửa (tab khác / AI / Founder Agent / người khác) SAU khi bạn mở form. Chưa có gì được lưu — nội dung bạn đang nhập vẫn còn nguyên.</p>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap;justify-content:flex-end">' +
        '<button type="button" data-a="keep" class="submit-btn">GIỮ FORM, CHƯA LƯU</button>' +
        '<button type="button" data-a="reload" class="btn-secondary">TẢI LẠI DỮ LIỆU</button>' +
        '<button type="button" data-a="overwrite" class="btn-danger">TIẾP TỤC GHI ĐÈ</button></div></div>';
      wrap.addEventListener('click', e => {
        const a = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
        if (!a) return;
        wrap.remove(); resolve(a);
      });
      document.body.appendChild(wrap);
      wrap.querySelector('[data-a="keep"]').focus();
    });
  }
  // guardedSave(scope, id, fetchCurrent, doSave, onReload): chỉ ghi khi bản
  // ghi chưa bị đổi từ lúc mở form, hoặc Founder chủ động chọn GHI ĐÈ.
  function guardedSave(scope, id, fetchCurrent, doSave, onReload) {
    if (!id) return doSave();
    return fetchCurrent(id).then(current => {
      if (!changedSince(scope, current)) return doSave();
      return askConflict().then(choice => {
        if (choice === 'overwrite') return doSave();
        if (choice === 'reload' && onReload) onReload(id);
        return { conflict: choice };
      });
    });
  }
  return { capture, clear, changedSince, askConflict, guardedSave };
})();

// CmsDirtyForm — cảnh báo khi rời trang / reload / đóng tab mà form đã có
// thay đổi CHƯA LƯU. Theo từng form (panel), chỉ đánh dấu khi NGƯỜI DÙNG
// gõ/chọn (sự kiện input/change); điền form bằng code không làm form "bẩn".
const CmsDirtyForm = (function () {
  const dirty = {};
  let installed = false;
  function any() { return Object.keys(dirty).some(k => dirty[k]); }
  function watch(panelId) {
    const el = document.getElementById(panelId);
    if (!el) return;
    dirty[panelId] = false;
    const mark = () => { dirty[panelId] = true; };
    el.addEventListener('input', mark, true);
    el.addEventListener('change', mark, true);
    if (!installed) {
      installed = true;
      window.addEventListener('beforeunload', e => {
        if (!any()) return;
        e.preventDefault();
        e.returnValue = 'Bạn có thay đổi chưa lưu. Bạn có chắc muốn rời trang?';
        return e.returnValue;
      });
    }
  }
  function clean(panelId) { dirty[panelId] = false; }
  function markDirty(panelId) { dirty[panelId] = true; }
  function isDirty(panelId) { return panelId ? !!dirty[panelId] : any(); }
  return { watch, clean, markDirty, isDirty };
})();
