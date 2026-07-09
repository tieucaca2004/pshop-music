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
  // KHÔNG đổi ở Sprint 11 Requirement #3.2 — chỉ nâng cấp matchTarget() bên
  // dưới, đúng phạm vi "Improve ONLY the entity matching algorithm".
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

  // ============== Xác định đối tượng — so khớp nhiều tầng (Sprint 11
  // Requirement #3.2) ==============
  //
  // Bản cũ (Sprint 4) bắt buộc câu gõ chứa NGUYÊN VĂN tên đầy đủ — Founder
  // gõ tự nhiên ("RX3", "FLX4", "AlphaTheta XDJ AN"...) không đủ tên đầy đủ
  // sẽ luôn báo "target_not_found" dù ý định đã hiểu đúng. Vẫn RULE-BASED
  // tuyệt đối (không AI/LLM, không gọi OpenAI, không embedding/vector search
  // — đúng ràng buộc Sprint 4 Requirement #8 và Requirement #3.2) — chỉ
  // thêm nhiều tầng so khớp xác định (deterministic), ƯU TIÊN THEO THỨ TỰ,
  // KHÔNG BAO GIỜ đoán mò: nếu nhiều ứng viên cùng đạt tầng/độ khớp cao nhất
  // → trả về danh sách mơ hồ (ambiguous), giữ nguyên hành vi đã có từ
  // Requirement #3 (Sprint 4) — không tạo đường xử lý mới.
  //
  //   Tầng 4 EXACT         — câu gõ (đã chuẩn hoá dấu câu/gạch nối thành
  //                          khoảng trắng) chứa nguyên tên (chuẩn hoá tương
  //                          tự) — cùng tinh thần bản cũ, chỉ chuẩn hoá tốt
  //                          hơn (dấu gạch nối không còn làm khác biệt giả).
  //   Tầng 3 TOKEN OVERLAP — mọi từ có nghĩa trong câu gõ (sau khi loại từ
  //                          thuộc chính "từ khóa ý định" của mọi route +
  //                          từ nối chung) đều khớp ĐÚNG 1 từ trong tên.
  //   Tầng 2 ALIAS         — giống Token Overlap nhưng so thêm với
  //                          brand/specs ĐÃ CÓ SẴN trên Product (KHÔNG thêm
  //                          field/Database mới) — cho phép gõ theo
  //                          thương hiệu/mã tắt không nằm trong tên chính.
  //   Tầng 1 PARTIAL       — mỗi từ có nghĩa trong câu gõ là CHUỖI CON của
  //                          1 từ trong tên/brand/specs (vd "8050" khớp
  //                          "8050b").
  //
  // MIN_TOKEN_OVERLAP_RATIO — ngưỡng khớp tối thiểu, có thể chỉnh (hiện yêu
  // cầu khớp ĐỦ 100% số từ có nghĩa trong câu gõ, tránh khớp nhầm khi câu
  // gõ có nhiều hơn 1 từ nhận diện sản phẩm).
  const MIN_TOKEN_OVERLAP_RATIO = 1;
  const MATCH_TIER = { NONE: 0, PARTIAL: 1, ALIAS: 2, TOKEN_OVERLAP: 3, EXACT: 4 };
  const GENERIC_STOPWORDS = ['cho', 'của', 'là', 'và', 'làm', 'tạo', 'giúp', 'với', 'các', 'một', 'hãy'];

  // normalizeLoose — giống normalize() nhưng thay mọi ký tự không phải
  // chữ/số (gạch nối, dấu câu...) bằng khoảng trắng rồi gộp khoảng trắng
  // thừa — để "XDJ-RX3" và "XDJ RX3" được coi là như nhau khi so khớp.
  function normalizeLoose(s) {
    return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  function tokenize(s) {
    return normalizeLoose(s).split(' ').filter(Boolean);
  }

  // Tập hợp toàn bộ từ đơn xuất hiện trong "từ khóa ý định" của MỌI route
  // (không chỉ route hiện tại) — dùng để loại các từ mô tả HÀNH ĐỘNG yêu
  // cầu (vd "mô"/"tả"/"sản"/"phẩm"/"viết"/"seo"...) ra khỏi câu gõ trước khi
  // so khớp TÊN thực thể, mà không cần so khớp cả cụm từ dễ vỡ khi có từ
  // chen giữa (vd "viết ... mô tả" thay vì đúng cụm "viết mô tả"). Tự cập
  // nhật khi thêm route/từ khóa mới — không cần sửa danh sách tay.
  const ROUTE_KEYWORD_WORDS = (function () {
    const words = {};
    AI_TASK_ROUTES.forEach(r => r.keywords.forEach(k => tokenize(k).forEach(w => { words[w] = true; })));
    return words;
  })();

  function meaningfulQueryTokens(text) {
    return tokenize(text).filter(t => !ROUTE_KEYWORD_WORDS[t] && GENERIC_STOPWORDS.indexOf(t) === -1);
  }

  // scoreItem — chấm 1 ứng viên theo 4 tầng ở trên. Trả { tier, ratio }.
  function scoreItem(rawTextLoose, queryTokens, item, nameKey) {
    const name = item[nameKey] || '';
    const nameLoose = normalizeLoose(name);
    if (!nameLoose) return { tier: MATCH_TIER.NONE, ratio: 0 };

    if (rawTextLoose.indexOf(nameLoose) !== -1) return { tier: MATCH_TIER.EXACT, ratio: 1 };
    if (!queryTokens.length) return { tier: MATCH_TIER.NONE, ratio: 0 };

    const nameTokens = tokenize(name);
    const nameHits = queryTokens.filter(t => nameTokens.indexOf(t) !== -1).length;
    if (nameHits / queryTokens.length >= MIN_TOKEN_OVERLAP_RATIO) {
      return { tier: MATCH_TIER.TOKEN_OVERLAP, ratio: nameHits / queryTokens.length };
    }

    // Alias — chỉ Product mới có brand/specs (Blog Post không có) — dùng
    // đúng field đã có sẵn, không thêm field/Database mới.
    const aliasTokens = tokenize([item.brand, item.specs].filter(Boolean).join(' '));
    if (aliasTokens.length) {
      const aliasHits = queryTokens.filter(t => nameTokens.indexOf(t) !== -1 || aliasTokens.indexOf(t) !== -1).length;
      if (aliasHits / queryTokens.length >= MIN_TOKEN_OVERLAP_RATIO) {
        return { tier: MATCH_TIER.ALIAS, ratio: aliasHits / queryTokens.length };
      }
    }

    const allTokens = nameTokens.concat(aliasTokens);
    const partialHits = queryTokens.filter(t => allTokens.some(nt => nt.indexOf(t) !== -1)).length;
    if (partialHits / queryTokens.length >= MIN_TOKEN_OVERLAP_RATIO) {
      return { tier: MATCH_TIER.PARTIAL, ratio: partialHits / queryTokens.length };
    }

    return { tier: MATCH_TIER.NONE, ratio: 0 };
  }

  // "Xác định đối tượng" — so khớp tên sản phẩm/tiêu đề bài viết xuất hiện
  // trong câu yêu cầu. Router không tự đọc Firebase — candidates do AI
  // Assistant (UI) truyền vào. Chỉ so khớp trong đúng danh sách ứng viên đã
  // tải (không tự query gì thêm) — không đổi tham số/chữ ký hàm.
  function matchTarget(text, route, candidates) {
    if (!route) return { targetId: null, targetLabel: null, targetScore: 0, ambiguous: [] };
    const list = (route.targetType === 'product' ? candidates.products : candidates.posts) || [];
    const nameKey = route.targetType === 'product' ? 'name' : 'title';
    const rawTextLoose = normalizeLoose(text);
    const queryTokens = meaningfulQueryTokens(text);

    let bestTier = MATCH_TIER.NONE;
    const scored = [];
    list.forEach(item => {
      const s = scoreItem(rawTextLoose, queryTokens, item, nameKey);
      if (s.tier > MATCH_TIER.NONE) {
        scored.push({ item, tier: s.tier, ratio: s.ratio });
        if (s.tier > bestTier) bestTier = s.tier;
      }
    });

    if (!scored.length) return { targetId: null, targetLabel: null, targetScore: 0, ambiguous: [] };

    // Chỉ so trong đúng tầng cao nhất đã đạt được — không bao giờ để 1 ứng
    // viên tầng thấp hơn (vd Partial) thắng 1 ứng viên tầng cao hơn (vd
    // Token Overlap) dù độ khớp số học có thể trùng nhau.
    const topTier = scored.filter(s => s.tier === bestTier);
    const bestRatio = Math.max.apply(null, topTier.map(s => s.ratio));
    const finalists = topTier.filter(s => s.ratio === bestRatio);

    if (finalists.length === 1) {
      const m = finalists[0].item;
      return { targetId: m.id, targetLabel: m[nameKey], targetScore: bestTier / MATCH_TIER.EXACT, ambiguous: [] };
    }
    // Nhiều ứng viên CÙNG tầng CÙNG độ khớp cao nhất — không đoán mò, trả
    // về danh sách mơ hồ đúng cơ chế đã có (Sprint 4 Requirement #3).
    return { targetId: null, targetLabel: null, targetScore: 0.5, ambiguous: finalists.map(s => ({ id: s.item.id, label: s.item[nameKey] })) };
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
