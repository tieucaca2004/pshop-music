/*
 * AI Task Router — Sprint 4 Requirement #1. Đây là lớp DUY NHẤT hiểu yêu cầu
 * tự do (free text) của người dùng và chọn đúng Plugin phù hợp trong số các
 * Plugin đã Production (Product/SEO/Slider) — KHÔNG sinh nội dung, KHÔNG gọi
 * OpenAI trực tiếp, KHÔNG đọc Firebase trực tiếp. Danh sách ứng viên (sản
 * phẩm/bài viết) do AI Assistant (UI, js/admin-ai-assistant.js) tự tải qua
 * đúng DB.getAll()/BlogDB.getAll() có sẵn — giống hệt cách js/admin-ai.js đã
 * làm cho productSelect/blogSelect — rồi truyền vào route() làm tham số,
 * Router không tự query.
 *
 * Đây là logic RULE-BASED (khớp từ khóa + khớp tên thực thể), KHÔNG phải mô
 * hình AI/ML thật — vì Requirement #8 của Sprint 4 cấm "gọi OpenAI trực
 * tiếp" và "thêm AI Provider mới", nên Router không thể dùng AI thật để
 * phân loại ý định mà vẫn tuân thủ đúng ràng buộc này. Ghi rõ ở đây để
 * không ai hiểu lầm "AI Task Router" nghĩa là có 1 model học máy bên trong.
 *
 * Router CHỈ được phép gọi (Requirement #3): PermissionService ->
 * PluginManager.execute(). Không gọi Queue/Provider/OpenAI/Firebase trực
 * tiếp ở bất kỳ đâu trong file này.
 */
const AI_TASK_ROUTES = [
  {
    pluginId: 'product-description-writer',
    outcomeLabel: 'Mô tả sản phẩm',
    keywords: ['mô tả sản phẩm', 'mô tả', 'description', 'viết mô tả', 'giới thiệu sản phẩm'],
    targetType: 'product',
    buildInputParams: targetId => ({ productId: targetId, tone: 'Chuyên nghiệp' })
  },
  {
    pluginId: 'seo-generator',
    outcomeLabel: 'Gói SEO cho bài viết',
    keywords: ['seo', 'từ khóa', 'meta description', 'tối ưu tìm kiếm', 'tiêu đề seo'],
    targetType: 'blogPost',
    buildInputParams: targetId => ({ postId: targetId })
  },
  {
    pluginId: 'slider-generator',
    outcomeLabel: 'Nội dung slide quảng cáo',
    keywords: ['slide', 'slider', 'banner trang chủ', 'quảng cáo trang chủ', 'hero'],
    targetType: 'product',
    buildInputParams: targetId => ({ productId: targetId, ctaStyle: 'Xem chi tiết' })
  }
];

const AITaskRouter = (function () {
  function normalize(s) {
    return String(s || '').toLowerCase();
  }

  // "Chọn Plugin phù hợp" — đếm số từ khóa khớp cho mỗi route, chọn route có
  // nhiều từ khóa khớp nhất. >=2 từ khóa khớp = điểm plugin tối đa (1.0).
  function matchRoute(text) {
    const t = normalize(text);
    let best = null;
    AI_TASK_ROUTES.forEach(route => {
      const hits = route.keywords.filter(k => t.includes(k)).length;
      if (hits > 0 && (!best || hits > best.hits)) best = { route, hits };
    });
    if (!best) return { route: null, pluginScore: 0 };
    return { route: best.route, pluginScore: Math.min(1, best.hits / 2) };
  }

  // "Xác định đối tượng" — so khớp tên sản phẩm/tiêu đề bài viết xuất hiện
  // trong câu yêu cầu. Router không tự đọc Firebase — candidates do AI
  // Assistant (UI) truyền vào.
  function matchTarget(text, route, candidates) {
    if (!route) return { targetId: null, targetLabel: null, targetScore: 0, ambiguous: [] };
    const list = (route.targetType === 'product' ? candidates.products : candidates.posts) || [];
    const nameKey = route.targetType === 'product' ? 'name' : 'title';
    const t = normalize(text);
    const matches = list.filter(item => item[nameKey] && t.includes(normalize(item[nameKey])));
    if (matches.length === 1) {
      return { targetId: matches[0].id, targetLabel: matches[0][nameKey], targetScore: 1, ambiguous: [] };
    }
    if (matches.length > 1) {
      return { targetId: null, targetLabel: null, targetScore: 0.5, ambiguous: matches.map(m => ({ id: m.id, label: m[nameKey] })) };
    }
    return { targetId: null, targetLabel: null, targetScore: 0, ambiguous: [] };
  }

  // route(text, candidates) — hàm THUẦN (pure), không side effect, không I/O.
  // candidates: { products: [{id,name,...}], posts: [{id,title,...}] }
  function route(text, candidates) {
    const matched = matchRoute(text);
    if (!matched.route) {
      return { pluginId: null, outcomeLabel: null, confidence: 0, targetId: null, targetLabel: null, ambiguous: [], reason: 'plugin_not_found' };
    }
    const targetMatch = matchTarget(text, matched.route, candidates || {});
    const confidence = Math.round(((matched.pluginScore * 0.5) + (targetMatch.targetScore * 0.5)) * 100);
    if (!targetMatch.targetId) {
      return {
        pluginId: matched.route.pluginId,
        outcomeLabel: matched.route.outcomeLabel,
        confidence,
        targetId: null,
        targetLabel: null,
        ambiguous: targetMatch.ambiguous,
        reason: targetMatch.ambiguous.length ? 'target_ambiguous' : 'target_not_found'
      };
    }
    return {
      pluginId: matched.route.pluginId,
      outcomeLabel: matched.route.outcomeLabel,
      confidence,
      targetId: targetMatch.targetId,
      targetLabel: targetMatch.targetLabel,
      ambiguous: [],
      inputParams: matched.route.buildInputParams(targetMatch.targetId),
      reason: 'ok'
    };
  }

  // dispatch() — điểm DUY NHẤT Router được phép gây side-effect, và CHỈ theo
  // đúng thứ tự PermissionService -> PluginManager.execute() (Requirement #3).
  // Không tạo Job nếu: không xác định được Plugin, không xác định được đối
  // tượng, hoặc Permission không đạt (Requirement #6).
  function dispatch(routeResult, userId, userEmail) {
    if (!routeResult || !routeResult.pluginId) {
      return Promise.resolve({ dispatched: false, reason: 'plugin_not_found' });
    }
    if (!routeResult.targetId) {
      return Promise.resolve({ dispatched: false, reason: routeResult.reason || 'target_not_found', ambiguous: routeResult.ambiguous || [] });
    }
    return PermissionService.checkPluginExecution(userId, userEmail, routeResult.pluginId).then(check => {
      if (!check.granted) {
        // Không tự ghi Log ở đây — PermissionService.checkPluginExecution()
        // đã ghi "permission_denied" (ngoại lệ đã có sẵn trong Constitution,
        // xem AI_RULES.md mục 8). Router không thêm cơ chế ghi Log mới.
        return { dispatched: false, reason: 'permission_denied', permission: check.permission };
      }
      return PluginManager.loadPlugin(routeResult.pluginId).then(plugin => {
        if (!plugin) return { dispatched: false, reason: 'plugin_not_found' };
        return plugin.execute([routeResult.inputParams], userId, userEmail).then(job => ({ dispatched: true, job }));
      });
    });
  }

  return { route, dispatch, ROUTES: AI_TASK_ROUTES };
})();
