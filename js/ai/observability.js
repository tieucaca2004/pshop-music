/*
 * ObservabilityService — Sprint 7 Requirement #1. Tổng hợp CHỈ ĐỌC toàn bộ
 * trạng thái AI Framework (Health/Provider/Queue/Plugin/Usage/Job/Draft)
 * thành 1 báo cáo duy nhất cho AI Observability Dashboard
 * (admin/ai/observability.html). Không phát sinh Business Logic mới — chỉ
 * gọi lại đúng các Service/Manager/DB đã có (HealthCheck, UsageStats,
 * PluginManager, AIProviderRegistry, ProviderConfigDB, JobDB, DraftDB) và
 * gộp kết quả. Không ghi/cập nhật/xóa bất kỳ node Firebase nào.
 */
const ObservabilityService = (function () {
  function computeHealth() {
    return ProviderConfigDB.get().then(config => {
      const activeId = config.activeProvider;
      if (!activeId || activeId === 'none') {
        return { skipped: true, message: 'Chưa chọn nhà cung cấp AI mặc định trong admin/ai/providers.html.' };
      }
      return HealthCheck.run(activeId);
    });
  }

  function computeProviders() {
    return ProviderConfigDB.get().then(config =>
      AIProviderRegistry.getAll().map(p => {
        const pc = (config.providers && config.providers[p.id]) || {};
        return {
          id: p.id,
          label: p.label || p.id,
          enabled: !!pc.enabled,
          model: pc.model || '',
          active: config.activeProvider === p.id
        };
      })
    );
  }

  // Queue Status (hoạt động NGAY BÂY GIỜ) và Job Summary (tổng hợp toàn bộ
  // trạng thái) đều dùng CHUNG 1 lượt đọc JobDB.getAll() — tránh đọc
  // Firebase 2 lần cho cùng 1 dữ liệu.
  function computeJobs() {
    return JobDB.getAll().then(jobs => {
      const byStatus = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
      jobs.forEach(j => {
        if (byStatus[j.status] === undefined) byStatus[j.status] = 0;
        byStatus[j.status] += 1;
      });
      return { total: jobs.length, byStatus, busy: byStatus.queued > 0 || byStatus.running > 0 };
    });
  }

  function computeDrafts() {
    return DraftDB.getAll().then(drafts => {
      const byStatus = { draft: 0, published: 0, rejected: 0 };
      drafts.forEach(d => {
        if (byStatus[d.status] === undefined) byStatus[d.status] = 0;
        byStatus[d.status] += 1;
      });
      return { total: drafts.length, byStatus };
    });
  }

  // Plugin Status — bắt buộc qua PluginManager.loadPlugins(), không đọc
  // thẳng PluginDB/AIModuleRegistry (đúng quy tắc "UI luôn qua Plugin
  // Manager", AI_RULES.md mục 5b).
  function computePlugins() {
    return PluginManager.loadPlugins().then(list =>
      list.map(p => p.metadata).sort((a, b) => a.id.localeCompare(b.id))
    );
  }

  // compute(usageRangeKey) — chạy đồng thời toàn bộ nhánh (đều chỉ đọc).
  // Mỗi nhánh tự bắt lỗi riêng ({ error: message }) để 1 thành phần lỗi
  // không làm hỏng cả report — đúng NFR "Không phụ thuộc AI Provider".
  function compute(usageRangeKey) {
    return Promise.all([
      computeHealth().catch(err => ({ error: err.message })),
      computeProviders().catch(err => ({ error: err.message })),
      computeJobs().catch(err => ({ error: err.message })),
      computePlugins().catch(err => ({ error: err.message })),
      UsageStats.compute(usageRangeKey || '7d').catch(err => ({ error: err.message })),
      computeDrafts().catch(err => ({ error: err.message }))
    ]).then(([health, providers, queue, plugins, usage, drafts]) => ({
      health, providers, queue, plugins, usage, drafts,
      generatedAt: Date.now()
    }));
  }

  return { compute };
})();
