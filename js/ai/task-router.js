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
    keywords: ['mô tả sản phẩm', 'mô tả', 'description', 'viết mô tả', 'giới thiệu sản phẩm', 'product description'],
    targetType: 'product',
    buildInputParams: targetId => ({ productId: targetId, tone: 'Chuyên nghiệp' })
  },
  {
    pluginId: 'seo-generator',
    outcomeLabel: 'Gói SEO cho bài viết',
    keywords: ['seo', 'từ khóa', 'meta description', 'meta title', 'tối ưu tìm kiếm', 'tiêu đề seo'],
    targetType: 'blogPost',
    buildInputParams: targetId => ({ postId: targetId })
  },
  {
    pluginId: 'slider-generator',
    outcomeLabel: 'Nội dung slide quảng cáo',
    keywords: ['slide', 'slider', 'banner trang chủ', 'quảng cáo trang chủ', 'hero'],
    targetType: 'product',
    buildInputParams: targetId => ({ productId: targetId, ctaStyle: 'Xem chi tiết' })
  },
  // Sprint 12 Requirement #1 — 3 route mới, đúng "chỉ cải thiện AI Assistant
  // hội thoại", không sửa Plugin/Queue/Provider Registry/PermissionService.
  {
    pluginId: 'facebook-post-generator',
    outcomeLabel: 'Bài đăng Facebook',
    keywords: ['facebook', 'bài facebook', 'viết facebook', 'post facebook'],
    targetType: 'product',
    targetRequired: false, // productId của Plugin này vốn optional (xem js/ai/modules/facebook-post-generator.js) — Founder có thể không nhắc sản phẩm cụ thể
    buildInputParams: (targetId, freeText, targetLabel) => ({
      productId: targetId || '',
      message: freeText || (targetLabel ? ('Giới thiệu ' + targetLabel) : 'Nội dung quảng bá mới')
    })
  },
  {
    pluginId: 'blog-writer',
    outcomeLabel: 'Bài blog',
    keywords: ['blog', 'viết blog', 'bài blog', 'website'],
    targetType: 'freeText', // Blog Writer viết bài MỚI theo chủ đề tự do, không nhắm 1 thực thể CMS có sẵn (xem js/ai/modules/blog-writer.js)
    buildInputParams: (targetId, freeText) => ({
      topic: freeText || 'Chủ đề mới',
      tone: 'Chuyên nghiệp',
      keywords: freeText || ''
    })
  },
  {
    pluginId: 'banner-generator',
    outcomeLabel: 'Banner quảng cáo',
    keywords: ['banner', 'tạo banner', 'làm banner'],
    targetType: 'freeText', // Banner Generator không có khái niệm target CMS (xem js/ai/modules/banner-generator.js)
    buildInputParams: (targetId, freeText) => ({
      theme: freeText || 'Khuyến mãi mới',
      link: 'index.html'
    })
  },
  // Sprint 12 Requirement #2 — 2 route còn thiếu (Plugin đã có sẵn trong
  // js/ai/modules/ và trên admin/ai/index.html từ trước, nhưng chưa từng
  // được đăng ký route ở đây — AI Assistant hội thoại trả "plugin_not_found"
  // cho MỌI câu liên quan tới ảnh/FAQ, bất kể diễn đạt thế nào).
  {
    pluginId: 'faq-generator',
    outcomeLabel: 'Bài FAQ',
    keywords: ['faq', 'câu hỏi thường gặp', 'hỏi đáp'],
    targetType: 'freeText', // FAQ Generator viết bài MỚI theo chủ đề tự do, không nhắm 1 thực thể CMS có sẵn (xem js/ai/modules/faq-generator.js)
    buildInputParams: (targetId, freeText) => ({
      topic: freeText || 'Chủ đề mới',
      questionCount: '5'
    })
  },
  {
    pluginId: 'image-prompt-generator',
    outcomeLabel: 'Prompt tạo ảnh AI',
    keywords: ['tạo ảnh', 'vẽ ảnh', 'vẽ hình', 'prompt ảnh', 'ảnh ai', 'image prompt'],
    targetType: 'freeText', // Image Prompt Generator không có khái niệm target CMS — chỉ sinh văn bản prompt (xem js/ai/modules/image-prompt-generator.js)
    buildInputParams: (targetId, freeText) => ({
      subject: freeText || 'Sản phẩm âm thanh',
      style: 'Ảnh sản phẩm studio'
    })
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
  // NEAR_MISS_THRESHOLD — Sprint 12 Requirement #2. Khi KHÔNG ứng viên nào
  // đạt đủ MIN_TOKEN_OVERLAP_RATIO (100%) ở bất kỳ tầng nào, nhưng có ứng
  // viên khớp được phần lớn số từ có nghĩa (vd Founder gõ tên viết tắt/nhớ
  // nhầm 1 phần model — "AlphaTheta XDJ AN" cho sản phẩm thật "PIONEER
  // XDJ-RX3 ALL-IN-ONE DJ SYSTEM", brand AlphaTheta — khớp 2/3 từ), đưa ứng
  // viên đó vào "ambiguous" (danh sách mơ hồ) để Founder TỰ XÁC NHẬN qua
  // picker đã có sẵn (js/admin-ai-assistant.js showAmbiguousPicker) — KHÔNG
  // BAO GIỜ tự chọn/tự chạy Plugin trên ứng viên chưa đủ 100% (vẫn đúng
  // nguyên tắc "không đoán mò" của Requirement #3.2). Ngưỡng 0.5 nghĩa là ít
  // nhất một nửa số từ có nghĩa trong câu gõ phải khớp được thì mới đề xuất.
  const NEAR_MISS_THRESHOLD = 0.5;
  const MATCH_TIER = { NONE: 0, PARTIAL: 1, ALIAS: 2, TOKEN_OVERLAP: 3, EXACT: 4 };
  const GENERIC_STOPWORDS = ['cho', 'của', 'là', 'và', 'làm', 'tạo', 'giúp', 'với', 'các', 'một', 'hãy', 'về', 'tại', 'trong'];

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

  // extractFreeText — dùng cho route targetType:'freeText' (Blog/Banner,
  // không có thực thể CMS để nhắm) hoặc route targetType:'product' với
  // targetRequired:false (Facebook, sản phẩm là tuỳ chọn) khi KHÔNG có ứng
  // viên nào khớp. Loại bỏ từng TỪ ĐƠN thuộc "từ khóa ý định" của mọi route
  // + từ nối chung + (nếu có) tên đối tượng đã nhận diện được — GIỮ NGUYÊN
  // chữ hoa/thường gốc của phần còn lại (khác meaningfulQueryTokens(), vốn
  // chỉ dùng nội bộ để SO KHỚP, không dùng để hiển thị/làm input Prompt).
  function extractFreeText(text, excludeLabel) {
    const excludeTokens = excludeLabel ? tokenize(excludeLabel) : [];
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const kept = words.filter(w => {
      const norm = tokenize(w)[0];
      if (!norm) return false;
      if (ROUTE_KEYWORD_WORDS[norm]) return false;
      if (GENERIC_STOPWORDS.indexOf(norm) !== -1) return false;
      if (excludeTokens.indexOf(norm) !== -1) return false;
      return true;
    });
    return kept.join(' ').trim();
  }

  // scoreItem — chấm 1 ứng viên theo 4 tầng ở trên. Trả { tier, ratio,
  // weakRatio }. weakRatio (Sprint 12 Requirement #2) luôn phản ánh tỷ lệ
  // khớp CAO NHẤT đạt được ở bất kỳ tầng nào — kể cả khi chưa đủ
  // MIN_TOKEN_OVERLAP_RATIO để "thắng" tầng đó — để matchTarget() có dữ
  // liệu đề xuất "gần đúng" (near-miss) khi không ứng viên nào đạt đủ 100%.
  function scoreItem(rawTextLoose, queryTokens, item, nameKey) {
    const name = item[nameKey] || '';
    const nameLoose = normalizeLoose(name);
    if (!nameLoose) return { tier: MATCH_TIER.NONE, ratio: 0, weakRatio: 0 };

    if (rawTextLoose.indexOf(nameLoose) !== -1) return { tier: MATCH_TIER.EXACT, ratio: 1, weakRatio: 1 };
    if (!queryTokens.length) return { tier: MATCH_TIER.NONE, ratio: 0, weakRatio: 0 };

    const nameTokens = tokenize(name);
    const nameHits = queryTokens.filter(t => nameTokens.indexOf(t) !== -1).length;
    const nameRatio = nameHits / queryTokens.length;
    if (nameRatio >= MIN_TOKEN_OVERLAP_RATIO) {
      return { tier: MATCH_TIER.TOKEN_OVERLAP, ratio: nameRatio, weakRatio: nameRatio };
    }

    // Alias — chỉ Product mới có brand/specs (Blog Post không có) — dùng
    // đúng field đã có sẵn, không thêm field/Database mới.
    const aliasTokens = tokenize([item.brand, item.specs].filter(Boolean).join(' '));
    let aliasRatio = 0;
    if (aliasTokens.length) {
      const aliasHits = queryTokens.filter(t => nameTokens.indexOf(t) !== -1 || aliasTokens.indexOf(t) !== -1).length;
      aliasRatio = aliasHits / queryTokens.length;
      if (aliasRatio >= MIN_TOKEN_OVERLAP_RATIO) {
        return { tier: MATCH_TIER.ALIAS, ratio: aliasRatio, weakRatio: aliasRatio };
      }
    }

    const allTokens = nameTokens.concat(aliasTokens);
    const partialHits = queryTokens.filter(t => allTokens.some(nt => nt.indexOf(t) !== -1)).length;
    const partialRatio = partialHits / queryTokens.length;
    if (partialRatio >= MIN_TOKEN_OVERLAP_RATIO) {
      return { tier: MATCH_TIER.PARTIAL, ratio: partialRatio, weakRatio: partialRatio };
    }

    // weakRatio (near-miss) CHỈ tính từ nameRatio/aliasRatio (khớp ĐÚNG 1 từ
    // trọn vẹn) — cố tình KHÔNG tính partialRatio (khớp chuỗi con) vào đây.
    // Lý do: chuỗi con dễ trùng giả với từ ngắn (vd "an" là chuỗi con của
    // "sandisk") — nếu tính cả partialRatio, near-miss sẽ đề xuất nhầm sản
    // phẩm không liên quan. nameRatio/aliasRatio đáng tin hơn vì đòi hỏi
    // khớp ĐÚNG 1 token, không chỉ là chuỗi con.
    return { tier: MATCH_TIER.NONE, ratio: 0, weakRatio: Math.max(nameRatio, aliasRatio) };
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
    const nearMisses = [];
    list.forEach(item => {
      const s = scoreItem(rawTextLoose, queryTokens, item, nameKey);
      if (s.tier > MATCH_TIER.NONE) {
        scored.push({ item, tier: s.tier, ratio: s.ratio });
        if (s.tier > bestTier) bestTier = s.tier;
      } else if (s.weakRatio >= NEAR_MISS_THRESHOLD) {
        nearMisses.push({ item, ratio: s.weakRatio });
      }
    });

    if (!scored.length) {
      if (!nearMisses.length) return { targetId: null, targetLabel: null, targetScore: 0, ambiguous: [] };
      // Không ứng viên nào đạt đủ 100% ở tầng nào, nhưng có ứng viên khớp
      // được phần lớn — đề xuất qua picker "mơ hồ" đã có sẵn thay vì báo
      // thẳng "không tìm thấy" (Sprint 12 Requirement #2). Vẫn KHÔNG tự chọn
      // — trả về ambiguous để Founder xác nhận, kể cả khi chỉ có 1 đề xuất.
      const bestWeakRatio = Math.max.apply(null, nearMisses.map(w => w.ratio));
      const topNearMisses = nearMisses.filter(w => w.ratio === bestWeakRatio);
      return { targetId: null, targetLabel: null, targetScore: 0.4, ambiguous: topNearMisses.map(w => ({ id: w.item.id, label: w.item[nameKey] })) };
    }

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
  //
  // Sprint 12 Requirement #1 — mở rộng để hỗ trợ 2 dạng route KHÔNG bắt
  // buộc phải xác định 1 thực thể CMS có sẵn (Blog Writer/Banner Generator
  // viết nội dung MỚI theo chủ đề tự do; Facebook Post Generator có
  // productId TUỲ CHỌN — xem inputFields của từng module):
  //   - targetType:'freeText'      → bỏ qua matchTarget() hoàn toàn, dùng
  //     nguyên văn phần còn lại của câu (sau khi loại từ khóa ý định) làm
  //     input tự do.
  //   - targetRequired:false       → vẫn thử matchTarget() như route
  //     product/blogPost thường; nếu KHÔNG có ứng viên nào khớp (không
  //     phải mơ hồ) thì vẫn tiếp tục (dùng phần văn bản còn lại), CHỈ dừng
  //     lại nếu có NHIỀU ứng viên cùng khớp (target_ambiguous — không bao
  //     giờ đoán mò, giữ nguyên nguyên tắc Sprint 4 Requirement #3).
  // 3 route cũ (Product/SEO/Slider) không khai báo 2 thuộc tính này nên
  // targetRequired mặc định coi như true — hành vi giữ NGUYÊN VẸN.
  function route(text, candidates) {
    const matched = matchRoute(text);
    if (!matched.route) {
      return { pluginId: null, outcomeLabel: null, confidence: 0, targetId: null, targetLabel: null, ambiguous: [], reason: 'plugin_not_found' };
    }

    if (matched.route.targetType === 'freeText') {
      const freeText = extractFreeText(text);
      const confidence = Math.round(matched.pluginScore * 100);
      return {
        pluginId: matched.route.pluginId,
        outcomeLabel: matched.route.outcomeLabel,
        confidence,
        targetId: null,
        targetLabel: freeText || null,
        ambiguous: [],
        inputParams: matched.route.buildInputParams(null, freeText),
        reason: 'ok'
      };
    }

    const targetRequired = matched.route.targetRequired !== false;
    const targetMatch = matchTarget(text, matched.route, candidates || {});
    const confidence = Math.round(((matched.pluginScore * 0.5) + (targetMatch.targetScore * 0.5)) * 100);

    if (!targetMatch.targetId) {
      if (targetRequired || targetMatch.ambiguous.length) {
        // Bắt buộc phải có target (Product/SEO/Slider, hành vi cũ) HOẶC
        // đang mơ hồ giữa nhiều ứng viên (dù target không bắt buộc, KHÔNG
        // được tự đoán 1 trong số đó — Founder phải xác nhận).
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
      // targetRequired:false + không có ứng viên nào (không phải mơ hồ) —
      // tiếp tục với nội dung tự do còn lại (vd Facebook không nhắc sản
      // phẩm cụ thể vẫn hợp lệ).
      const freeText = extractFreeText(text);
      return {
        pluginId: matched.route.pluginId,
        outcomeLabel: matched.route.outcomeLabel,
        confidence,
        targetId: null,
        targetLabel: freeText || null,
        ambiguous: [],
        inputParams: matched.route.buildInputParams(null, freeText, null),
        reason: 'ok'
      };
    }

    const freeTextRemainder = targetRequired ? undefined : extractFreeText(text, targetMatch.targetLabel);
    return {
      pluginId: matched.route.pluginId,
      outcomeLabel: matched.route.outcomeLabel,
      confidence,
      targetId: targetMatch.targetId,
      targetLabel: targetMatch.targetLabel,
      ambiguous: [],
      inputParams: matched.route.buildInputParams(targetMatch.targetId, freeTextRemainder, targetMatch.targetLabel),
      reason: 'ok'
    };
  }

  // dispatch() — điểm DUY NHẤT Router được phép gây side-effect, và CHỈ theo
  // đúng thứ tự PermissionService -> PluginManager.execute() (Requirement #3).
  // Không tạo Job nếu: không xác định được Plugin, chưa sẵn sàng thực thi
  // (reason khác 'ok' — bao gồm cả trường hợp cũ "không xác định được đối
  // tượng" lẫn "đang mơ hồ chờ Founder chọn"), hoặc Permission không đạt
  // (Requirement #6, Sprint 4). Sprint 12 Requirement #1: đổi điều kiện
  // chặn từ "!targetId" sang "reason !== 'ok'" — route targetType:'freeText'
  // hoặc targetRequired:false hợp lệ có thể có targetId=null nhưng
  // reason='ok' (đã có đủ inputParams để chạy), khác hẳn target thật sự
  // chưa xác định được — không đổi cách gọi PermissionService/PluginManager.
  function dispatch(routeResult, userId, userEmail) {
    if (!routeResult || !routeResult.pluginId || routeResult.reason !== 'ok') {
      return Promise.resolve({
        dispatched: false,
        reason: (routeResult && routeResult.reason) || 'plugin_not_found',
        ambiguous: (routeResult && routeResult.ambiguous) || []
      });
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
