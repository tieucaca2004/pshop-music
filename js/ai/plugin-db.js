/*
 * PluginDB — trạng thái Plugin Manager cho từng AI module (node aiPlugins,
 * key = moduleId, không dùng push-id vì cần tra cứu trực tiếp theo module).
 * Sprint 2: 3 module đầu tiên bật mặc định. Sprint 5 Requirement #3: thêm
 * 'faq-generator'. Sprint 6 Requirement #1: thêm 'blog-writer'. Sprint 6
 * Requirement #2: thêm 'facebook-post-generator'. Sprint 6 Requirement #3:
 * thêm 'banner-generator' (kích hoạt Banner Generator sang Production). Các
 * module còn lại viết ở Sprint 1 giữ nguyên code nhưng đánh dấu
 * "coming_soon" cho tới khi được kích hoạt ở sprint sau.
 *
 * LƯU Ý: danh sách này chỉ quyết định giá trị SEED MẶC ĐỊNH cho bản ghi
 * `aiPlugins/{id}` CHƯA TỪNG TỒN TẠI trong Firebase (xem ensureSeeded() bên
 * dưới — bỏ qua module đã có bản ghi). Trên môi trường Production đã seed
 * từ trước, Admin vẫn cần tự bật "Enable" cho Banner Generator trong
 * admin/ai/plugins.html — đổi hằng số này không tự động bật lại cho môi
 * trường đã tồn tại dữ liệu.
 */
const SPRINT2_ENABLED_MODULES = ['product-description-writer', 'slider-generator', 'seo-generator', 'faq-generator', 'blog-writer', 'facebook-post-generator', 'banner-generator'];

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
