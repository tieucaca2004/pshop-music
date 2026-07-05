/*
 * PluginManager — điểm gọi Plugin AI DUY NHẤT. UI (js/admin-ai.js,
 * js/admin-ai-plugins.js) không được gọi thẳng AIModuleRegistry/PluginDB/
 * AIJobQueue để load/enable/disable/chạy/hủy 1 plugin — phải đi qua đây.
 *
 * PluginManager CHỈ quản lý Plugin — không chứa Business Logic (đó là việc
 * của từng file js/ai/modules/*.js), không chứa Prompt, không chứa AI
 * Provider (đó là việc của js/ai/provider-registry.js). Đổi provider
 * (OpenAI/Claude/Gemini/DeepSeek) không bao giờ cần sửa file này.
 *
 * Mỗi Plugin trả về qua loadPlugin()/loadPlugins() tuân theo interface
 * IAIPlugin — chỉ đúng 4 thứ, không thêm gì khác:
 *   metadata   — { id, name, description, version, provider, enabled, status }
 *   validate(inputParams) -> { valid, missingFields }
 *   execute(items, userId, userEmail) -> Promise (CHỈ gửi job vào
 *     AIJobQueue — không tự chạy AI, Queue chịu trách nhiệm thực thi)
 *   cancel(jobId) -> Promise (ủy quyền cho AIJobQueue.cancel — Plugin
 *     Manager không tự quản lý vòng đời job)
 *
 * Log: mọi lượt chạy plugin đi qua execute() → AIJobQueue → LogDB (aiLogs)
 * — hệ thống log đã có sẵn từ Sprint 1, không xây thêm cơ chế log mới ở đây.
 */
const PluginManager = (function () {
  function toIAIPlugin(state) {
    const module = AIModuleRegistry.get(state.moduleId);
    if (!module) return null;

    return {
      metadata: {
        id: module.id,
        name: module.label,
        description: module.description,
        version: state.version || '1.0.0',
        provider: state.providerId || null,
        enabled: !!state.enabled,
        status: state.status || 'coming_soon'
      },

      validate(inputParams) {
        const missingFields = (module.inputFields || [])
          .filter(f => !f.optional)
          .filter(f => {
            const v = inputParams ? inputParams[f.key] : undefined;
            return v === undefined || v === null || v === '';
          })
          .map(f => f.key);
        return { valid: missingFields.length === 0, missingFields };
      },

      execute(items, userId, userEmail) {
        if (!state.enabled) {
          return Promise.reject(new Error(`Plugin "${module.label}" đang tắt trong Plugin Manager.`));
        }
        const invalid = items.map(item => this.validate(item)).find(r => !r.valid);
        if (invalid) {
          return Promise.reject(new Error('Thiếu dữ liệu bắt buộc: ' + invalid.missingFields.join(', ')));
        }
        // Chỉ gửi job vào Queue — AIJobQueue chịu trách nhiệm thực thi tuần tự.
        return AIJobQueue.enqueue(module.id, items, userId, userEmail);
      },

      cancel(jobId) {
        return AIJobQueue.cancel(jobId);
      }
    };
  }

  function loadPlugins() {
    return PluginDB.getAll().then(states => states.map(toIAIPlugin).filter(Boolean));
  }

  function loadPlugin(id) {
    return PluginDB.get(id).then(state => (state ? toIAIPlugin(state) : null));
  }

  function isEnabled(id) {
    return PluginDB.get(id).then(state => !!(state && state.enabled));
  }

  function enablePlugin(id) {
    return PluginDB.update(id, { enabled: true, status: 'ok' });
  }

  function disablePlugin(id) {
    return PluginDB.update(id, { enabled: false, status: 'coming_soon' });
  }

  function setProvider(id, providerId) {
    return PluginDB.update(id, { providerId: providerId || null });
  }

  return { loadPlugins, loadPlugin, isEnabled, enablePlugin, disablePlugin, setProvider };
})();
