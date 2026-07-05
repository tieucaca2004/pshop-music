/*
 * Nhà cung cấp AI (admin/ai/providers.html, Admin-only) — chọn provider
 * đang active + bật/tắt từng provider. Sprint 3: OpenAI gọi qua Cloud
 * Function Proxy — trang này KHÔNG có ô nhập API Key, key chỉ tồn tại
 * trong Secret Manager phía server (xem functions/index.js).
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
    return ProviderConfigDB.save(config).then(() => showStatus('Đã lưu cấu hình nhà cung cấp AI.'));
  }

  function showStatus(msg) {
    const el = document.getElementById('providerStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  // "Kiểm tra kết nối" — lưu cấu hình hiện tại trước (để test đúng giá trị
  // model vừa sửa), rồi gọi provider.health() có sẵn (không thêm phương thức
  // mới vào IAIProvider) — health() của OpenAI tự gọi Cloud Function Proxy.
  function testConnection(id) {
    const resultEl = document.getElementById('testResult-' + id);
    if (!resultEl) return;
    resultEl.style.display = 'inline';
    resultEl.style.color = 'var(--ink-mute)';
    resultEl.textContent = 'Đang lưu cấu hình và kiểm tra kết nối...';
    save().then(() => {
      const provider = AIProviderRegistry.get(id);
      if (!provider || !provider.health) {
        resultEl.textContent = 'Provider chưa hỗ trợ kiểm tra kết nối.';
        return;
      }
      return provider.health().then(result => {
        resultEl.textContent = (result.healthy ? '✓ ' : '✗ ') + result.message;
        resultEl.style.color = result.healthy ? 'var(--gold-ink)' : '#c0392b';
      });
    }).catch(err => {
      resultEl.textContent = 'Lỗi: ' + err.message;
      resultEl.style.color = '#c0392b';
    });
  }

  document.getElementById('saveProvidersBtn').addEventListener('click', save);
  const testBtn = document.getElementById('testConnectionOpenaiBtn');
  if (testBtn) testBtn.addEventListener('click', () => testConnection('openai'));
});
