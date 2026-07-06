/*
 * UsageStats — Sprint 5 Requirement #4. Tổng hợp mức độ sử dụng AI Framework
 * (Usage Visibility) — CHỈ ĐỌC, không ghi/cập nhật/xóa gì. Không tạo
 * Database/Collection/Field mới — tổng hợp hoàn toàn từ `aiLogs` đã có
 * (LogDB.getAll(), js/ai/ai-db.js). KHÔNG phải Cost Tracking/Billing —
 * chỉ đếm số lượng bản ghi Log, không tính token/chi phí (không có trong
 * schema hiện tại).
 */
const UsageStats = (function () {
  const RANGE_DAYS = { today: 0, '7d': 7, '30d': 30 };

  function rangeStartMs(rangeKey) {
    if (rangeKey === 'today') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    const days = RANGE_DAYS[rangeKey] || 30;
    return Date.now() - days * 24 * 60 * 60 * 1000;
  }

  // compute(rangeKey) — CHỈ đọc LogDB.getAll(), không gọi bất kỳ hàm ghi nào.
  // "Tổng số lần Generate" = tổng số bản ghi Log trong khoảng thời gian đã
  // chọn (mọi trạng thái) — cùng 1 tổng được chia nhỏ theo Plugin/Provider/
  // Trạng thái, không tính token/chi phí (Out of Scope — Cost Tracking).
  function compute(rangeKey) {
    return LogDB.getAll().then(logs => {
      const since = rangeStartMs(rangeKey);
      const filtered = logs.filter(l => (l.timestamp || 0) >= since);

      const byPlugin = {};
      const byProvider = {};
      const byStatus = { completed: 0, failed: 0, cancelled: 0, permission_denied: 0 };

      filtered.forEach(l => {
        const plugin = l.moduleId || '(không rõ)';
        const provider = l.provider || '(không rõ)';
        byPlugin[plugin] = (byPlugin[plugin] || 0) + 1;
        byProvider[provider] = (byProvider[provider] || 0) + 1;
        if (byStatus[l.status] === undefined) byStatus[l.status] = 0;
        byStatus[l.status] += 1;
      });

      return { total: filtered.length, byPlugin, byProvider, byStatus, rangeKey };
    });
  }

  return { compute };
})();
