/*
 * Registry cho AI Provider — nơi duy nhất AIJobQueue/module tra cứu provider
 * đang active. Thêm provider mới = gọi AIProviderRegistry.register() ở 1
 * file riêng (js/ai/providers/*.js), không sửa file này.
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

  return { register, get, getAll, getActive };
})();
