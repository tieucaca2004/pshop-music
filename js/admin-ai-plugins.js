/*
 * Plugin Manager (admin/ai/plugins.html) — bật/tắt từng AI module, gán
 * provider riêng (ghi đè provider mặc định toàn cục), xem version/status,
 * link nhanh sang Nhật ký lọc theo module.
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
    PluginDB.getAll().then(list => {
      plugins = list.sort((a, b) => a.moduleId.localeCompare(b.moduleId));
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
      const module = AIModuleRegistry.get(p.moduleId);
      const label = module ? module.label : p.moduleId;
      return `
      <tr data-id="${p.moduleId}">
        <td>${escapeHtml(label)}<br><span class="small-muted">${escapeHtml(p.moduleId)}</span></td>
        <td>${escapeHtml(p.version || '1.0.0')}</td>
        <td><select onchange="AdminAIPlugins.setProvider('${p.moduleId}', this.value)">${providerOptions(p.providerId)}</select></td>
        <td>${p.status === 'ok' ? 'Sẵn sàng' : '<span style="color:var(--ink-mute)">Sắp ra mắt</span>'}</td>
        <td>
          <label class="cms-toggle">
            <input type="checkbox" ${p.enabled ? 'checked' : ''} onchange="AdminAIPlugins.toggleEnabled('${p.moduleId}', this.checked)">
            ${p.enabled ? 'Đang bật' : 'Đang tắt'}
          </label>
        </td>
        <td><a href="logs.html?module=${encodeURIComponent(p.moduleId)}" style="color:var(--gold-ink)">Xem log</a></td>
      </tr>`;
    }).join('');
  }

  function toggleEnabled(moduleId, enabled) {
    const p = plugins.find(x => x.moduleId === moduleId);
    const status = enabled ? 'ok' : 'coming_soon';
    PluginDB.update(moduleId, { enabled, status }).then(() => {
      if (p) { p.enabled = enabled; p.status = status; }
      render();
    });
  }

  function setProvider(moduleId, providerId) {
    PluginDB.update(moduleId, { providerId: providerId || null }).then(() => {
      const p = plugins.find(x => x.moduleId === moduleId);
      if (p) p.providerId = providerId || null;
    });
  }

  window.AdminAIPlugins = { toggleEnabled, setProvider };
});
