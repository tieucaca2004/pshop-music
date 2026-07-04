/*
 * Nhà cung cấp AI (admin/ai/providers.html, Admin-only) — chọn provider
 * đang active + bật/tắt từng provider. CHƯA nhập được API key thật ở giai
 * đoạn này (xem Roadmap README.md) — trang này chỉ chuẩn bị sẵn cấu trúc để
 * cắm provider thật vào sau mà không cần đổi Workflow/UI.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'ai', title: 'AI ASSISTANT — NHÀ CUNG CẤP AI', requiredRole: 'admin' }).then(load);

  const PROVIDER_IDS = ['openai', 'claude', 'gemini', 'deepseek'];

  function load() {
    ProviderConfigDB.get().then(config => {
      document.getElementById('activeProvider').value = config.activeProvider || 'none';
      PROVIDER_IDS.forEach(id => {
        const p = (config.providers && config.providers[id]) || {};
        document.getElementById('enabled-' + id).checked = !!p.enabled;
        document.getElementById('model-' + id).value = p.model || '';
      });
    });
  }

  function save() {
    const config = {
      activeProvider: document.getElementById('activeProvider').value,
      providers: {}
    };
    PROVIDER_IDS.forEach(id => {
      config.providers[id] = {
        enabled: document.getElementById('enabled-' + id).checked,
        model: document.getElementById('model-' + id).value.trim()
      };
    });
    ProviderConfigDB.save(config).then(() => showStatus('Đã lưu cấu hình nhà cung cấp AI.'));
  }

  function showStatus(msg) {
    const el = document.getElementById('providerStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  document.getElementById('saveProvidersBtn').addEventListener('click', save);
});
