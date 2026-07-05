/*
 * Plugin Manager (admin/ai/plugins.html) — bật/tắt từng AI module, gán
 * provider riêng (ghi đè provider mặc định toàn cục), xem version/status,
 * link nhanh sang Nhật ký lọc theo module.
 *
 * Toàn bộ Load/Enable/Disable/gán Provider đều gọi qua PluginManager
 * (js/ai/plugin-manager.js) — trang này không đọc/ghi thẳng PluginDB.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'ai', title: 'AI ASSISTANT — PLUGIN MANAGER' }).then(load);

  let plugins = [];

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function load() {
    // PluginManager.loadPlugins() — không đọc thẳng PluginDB/AIModuleRegistry.
    PluginManager.loadPlugins().then(list => {
      plugins = list.sort((a, b) => a.metadata.id.localeCompare(b.metadata.id));
      render();
    });
  }

  function providerOptions(selected) {
    const opts = [{ value: '', label: 'Mặc định toàn cục' }].concat(
      AIProviderRegistry.getAll().map(p => ({ value: p.id, label: p.label }))
    );
    return opts.map(o => `<option value="${escapeHtml(o.value)}" ${o.value === (selected || '') ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
  }

  function render() {
    const body = document.getElementById('pluginTableBody');
    body.innerHTML = plugins.map(p => {
      const m = p.metadata;
      return `
      <tr data-id="${m.id}">
        <td>${escapeHtml(m.name)}<br><span class="small-muted">${escapeHtml(m.id)}</span></td>
        <td>${escapeHtml(m.version)}</td>
        <td><select onchange="AdminAIPlugins.setProvider('${m.id}', this.value)">${providerOptions(m.provider)}</select></td>
        <td>${m.status === 'ok' ? 'Sẵn sàng' : '<span style="color:var(--ink-mute)">Sắp ra mắt</span>'}</td>
        <td>
          <label class="cms-toggle">
            <input type="checkbox" ${m.enabled ? 'checked' : ''} onchange="AdminAIPlugins.toggleEnabled('${m.id}', this.checked)">
            ${m.enabled ? 'Đang bật' : 'Đang tắt'}
          </label>
        </td>
        <td><a href="logs.html?module=${encodeURIComponent(m.id)}" style="color:var(--gold-ink)">Xem log</a></td>
      </tr>`;
    }).join('');
  }

  function toggleEnabled(moduleId, enabled) {
    const action = enabled ? PluginManager.enablePlugin(moduleId) : PluginManager.disablePlugin(moduleId);
    action.then(load);
  }

  function setProvider(moduleId, providerId) {
    PluginManager.setProvider(moduleId, providerId).then(() => {
      const p = plugins.find(x => x.metadata.id === moduleId);
      if (p) p.metadata.provider = providerId || null;
    });
  }

  window.AdminAIPlugins = { toggleEnabled, setProvider };
});
