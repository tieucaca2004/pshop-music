/*
 * CostTrackingService — Sprint 7 Requirement #2. Ước tính chi phí AI theo
 * Provider/Plugin cho AI Cost Tracking (admin/ai/cost-tracking.html) — CHỈ
 * ĐỌC, tái sử dụng đúng `aiLogs` đã có (LogDB.getAll(), js/ai/ai-db.js) và
 * logic lọc thời gian/tổng hợp của UsageStats (js/ai/usage-stats.js, Sprint
 * 5 Requirement #4) — không viết lại, không sửa file đó.
 *
 * QUYẾT ĐỊNH KIẾN TRÚC QUAN TRỌNG (không cần Decision Record — xem
 * CHANGELOG.md/ROADMAP.md để biết lý do đầy đủ): `aiLogs` hiện KHÔNG lưu
 * token/chi phí thật (chỉ có `moduleId`/`provider`/`status`/`timestamp`...).
 * Thêm field mới vào `aiLogs` sẽ là 1 thay đổi Database Structure, đúng
 * Architectural Constraint của Requirement này thì phải có Decision Record
 * + chờ phê duyệt riêng trước khi làm — nên KHÔNG tự thêm field nào ở đây.
 * Thay vào đó, "chi phí ước tính" được tính bằng: (số lượt Generate THÀNH
 * CÔNG, status:'completed') × (đơn giá ước tính trung bình mỗi lượt, hằng
 * số tĩnh theo Provider — KHÔNG dựa trên token thực tế). Đây là ước tính
 * tham khảo thô, không phải Billing chính xác — đúng tinh thần "chi phí ước
 * tính" của Requirement, không phải "Billing" (Out of Scope).
 *
 * Chỉ đếm lượt 'completed' (không tính failed/cancelled/permission_denied)
 * vì đây là trạng thái DUY NHẤT chắc chắn đã nhận phản hồi AI thật — tránh
 * ước tính cao hơn thực tế.
 */
const CostTrackingService = (function () {
  // Đơn giá ước tính trung bình (USD) mỗi lượt Generate THÀNH CÔNG. Chỉ
  // OpenAI có giá trị vì đây là Provider DUY NHẤT đã tích hợp API thật
  // (Sprint 3, Requirement #1) — Claude/Gemini/DeepSeek vẫn là stub, không
  // có lượt 'completed' nào nên cố tình KHÔNG định nghĩa giá ở đây (đúng NFR
  // "Không phụ thuộc Provider cụ thể" — Provider nào chưa có giá sẽ tự động
  // hiển thị "Cost estimation unavailable", không suy đoán/hardcode số 0).
  const ESTIMATED_COST_PER_CALL_USD = {
    openai: 0.0015
  };

  const RANGE_DAYS = { today: 0, '7d': 7, '30d': 30 };

  // Trùng lặp có chủ đích với rangeStartMs() nội bộ của usage-stats.js —
  // không export hàm đó nên không tái sử dụng trực tiếp được; giữ nguyên
  // js/ai/usage-stats.js (Sprint 5 Requirement #4), không sửa file đó.
  function rangeStartMs(rangeKey) {
    if (rangeKey === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    const days = RANGE_DAYS[rangeKey] || 30;
    return Date.now() - days * 24 * 60 * 60 * 1000;
  }

  function estimateFor(providerId, completedCount) {
    const rate = ESTIMATED_COST_PER_CALL_USD[providerId];
    if (rate === undefined || completedCount === 0) {
      return { count: completedCount, available: rate !== undefined, cost: rate !== undefined ? rate * completedCount : null };
    }
    return { count: completedCount, available: true, cost: rate * completedCount };
  }

  // completedCounts(logs, since) — đếm lượt 'completed' theo Provider và
  // theo Plugin trong khoảng thời gian đã lọc.
  function completedCounts(logs, since) {
    const byProvider = {};
    const byPlugin = {};
    logs.filter(l => l.status === 'completed' && (l.timestamp || 0) >= since).forEach(l => {
      const provider = l.provider || '(không rõ)';
      const plugin = l.moduleId || '(không rõ)';
      byProvider[provider] = (byProvider[provider] || 0) + 1;
      byPlugin[plugin] = (byPlugin[plugin] || 0) + 1;
    });
    return { byProvider, byPlugin };
  }

  // compute(rangeKey) — tái sử dụng UsageStats.compute() cho Usage Summary
  // (Functional Requirement #1/#2/#3), tự tính thêm Cost Estimate (Functional
  // Requirement #4/#5) từ CHÍNH cùng 1 dữ liệu LogDB.getAll(). Chỉ đọc,
  // không gọi bất kỳ hàm ghi nào.
  function compute(rangeKey) {
    return Promise.all([
      UsageStats.compute(rangeKey),
      LogDB.getAll()
    ]).then(([usage, logs]) => {
      const since = rangeStartMs(rangeKey);
      const { byProvider, byPlugin } = completedCounts(logs, since);

      const costByProvider = {};
      Object.keys(byProvider).forEach(id => { costByProvider[id] = estimateFor(id, byProvider[id]); });

      const costByPlugin = {};
      Object.keys(byPlugin).forEach(id => {
        // Chi phí theo Plugin: cộng dồn theo Provider đã xử lý từng lượt
        // 'completed' của chính Plugin đó (đọc lại logs 1 lần thay vì đoán
        // Provider chung — 1 Plugin có thể được gán Provider khác nhau theo
        // thời gian qua Plugin Manager).
        const pluginLogs = logs.filter(l => l.status === 'completed' && (l.timestamp || 0) >= since && (l.moduleId || '(không rõ)') === id);
        let cost = 0;
        let available = true;
        pluginLogs.forEach(l => {
          const rate = ESTIMATED_COST_PER_CALL_USD[l.provider];
          if (rate === undefined) { available = false; return; }
          cost += rate;
        });
        costByPlugin[id] = { count: byPlugin[id], available: available && byPlugin[id] > 0, cost: available ? cost : null };
      });

      const costAvailable = Object.keys(costByProvider).some(id => costByProvider[id].available) ||
        Object.keys(costByPlugin).some(id => costByPlugin[id].available);

      return Object.assign({}, usage, { costByProvider, costByPlugin, costAvailable });
    });
  }

  return { compute };
})();
