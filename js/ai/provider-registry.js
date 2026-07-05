/*
 * AIProviderRegistry — Provider Manager: nơi DUY NHẤT chịu trách nhiệm Đăng
 * ký Provider, Chọn Provider, và Trả về Provider đang hoạt động. AI Plugin
 * không được tự chọn Provider — chỉ AIJobQueue (js/ai/job-queue.js) mới
 * được hỏi qua registry này. Thêm provider mới = gọi
 * AIProviderRegistry.register() ở 1 file riêng (js/ai/providers/*.js),
 * không sửa file này.
 */
const AIProviderRegistry = (function () {
  const providers = {};

  function register(provider) {
    if (!provider || !provider.id) throw new Error('Provider phải có "id"');
    providers[provider.id] = provider;
  }

  function get(id) {
    return providers[id] || null;
  }

  function getAll() {
    return Object.values(providers);
  }

  function getActive() {
    return ProviderConfigDB.get().then(config => {
      const activeId = config.activeProvider || 'none';
      const provider = providers[activeId];
      if (!provider) {
        return Promise.reject(new Error('Chưa chọn nhà cung cấp AI nào trong admin/ai/providers.html.'));
      }
      return { provider, config: (config.providers && config.providers[activeId]) || {} };
    });
  }

  // "Chọn Provider" + "Trả về Provider đang hoạt động" cho 1 plugin cụ thể —
  // ưu tiên providerId riêng gán qua Plugin Manager (aiPlugins/{moduleId}.
  // providerId), rơi về provider mặc định toàn cục (getActive()) nếu không
  // có. Đây là nơi DUY NHẤT chứa logic chọn provider theo plugin — AIJobQueue
  // chỉ gọi hàm này, không tự quyết định provider.
  function resolveForPlugin(moduleId) {
    if (typeof PluginDB === 'undefined') return getActive();
    return PluginDB.get(moduleId).then(state => {
      if (state && state.providerId) {
        const provider = get(state.providerId);
        if (provider) {
          return ProviderConfigDB.get().then(config => ({
            provider,
            config: (config.providers && config.providers[state.providerId]) || {}
          }));
        }
      }
      return getActive();
    });
  }

  return { register, get, getAll, getActive, resolveForPlugin };
})();
