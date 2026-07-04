/*
 * PluginDB — trạng thái Plugin Manager cho từng AI module (node aiPlugins,
 * key = moduleId, không dùng push-id vì cần tra cứu trực tiếp theo module).
 * Sprint 2: chỉ 3 module dưới đây bật mặc định, các module khác đã viết ở
 * Sprint 1 giữ nguyên code nhưng đánh dấu "coming_soon" cho tới sprint sau.
 */
const SPRINT2_ENABLED_MODULES = ['product-description-writer', 'slider-generator', 'seo-generator'];

const PluginDB = (function () {
  function ref(id) {
    return firebase.database().ref('aiPlugins' + (id ? '/' + id : ''));
  }

  function ensureSeeded() {
    return ref().once('value').then(snapshot => {
      const existing = snapshot.val() || {};
      const modules = (typeof AIModuleRegistry !== 'undefined') ? AIModuleRegistry.getAll() : [];
      const updates = {};
      modules.forEach(m => {
        if (existing[m.id]) return;
        const enabled = SPRINT2_ENABLED_MODULES.includes(m.id);
        updates[m.id] = {
          moduleId: m.id,
          enabled,
          version: '1.0.0',
          providerId: null,
          status: enabled ? 'ok' : 'coming_soon',
          updatedAt: Date.now()
        };
      });
      if (Object.keys(updates).length) return ref().update(updates);
    });
  }

  return {
    getAll() {
      return ensureSeeded().then(() => ref().once('value')).then(snap => {
        const val = snap.val() || {};
        return Object.keys(val).map(id => val[id]);
      });
    },
    get(id) {
      return ref(id).once('value').then(snap => snap.val() || null);
    },
    update(id, changes) {
      return ref(id).update(Object.assign({}, changes, { updatedAt: Date.now() })).then(() => true);
    }
  };
})();
