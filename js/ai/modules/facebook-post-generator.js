/*
 * Facebook AI V3 (Sprint 12 Requirement #7 — Media AI: Facebook AI V3) —
 * nâng cấp Facebook AI V2 (Requirement #6) để dùng được cho marketing thật:
 * Founder chọn 1 TRONG 3 nguồn (Sản phẩm HOẶC Chủ đề HOẶC Khuyến mãi — cả 3
 * field đều optional, chỉ cần điền đúng 1) và nhận về 3 PHIÊN BẢN khác nhau
 * (A/B/C) để tự chọn bản ưng ý nhất, thay vì chỉ 1 bản như V2.
 *
 * Media (Featured Image/Gallery/YouTube/Product Link) CHỈ gắn khi có chọn
 * Sản phẩm — lấy nguyên văn từ dữ liệu Product thật qua DataProvider, AI
 * KHÔNG BAO GIỜ tự bịa URL (AI_RULES.md mục 2). Không chọn Sản phẩm (dùng
 * Chủ đề/Khuyến mãi) → chỉ sinh văn bản, đúng "Generate text only."
 *
 * targetCollection vẫn = null — Facebook chưa có tích hợp đăng bài thật,
 * "Publish" chỉ đánh dấu Draft đã duyệt để Founder tự copy đăng thủ công,
 * KHÔNG tự động đăng lên Facebook.
 */
AIModuleRegistry.register({
  id: 'facebook-post-generator',
  label: 'Facebook AI V3',
  description: 'Sinh 3 phiên bản bài đăng Facebook (Hook/Caption/CTA/Hashtags) từ Sản phẩm, Chủ đề, hoặc Khuyến mãi — tự chèn ảnh/video/link thật nếu chọn Sản phẩm.',
  targetCollection: null,

  inputFields: [
    { key: 'productId', label: 'Sản phẩm (chọn 1 trong 3: Sản phẩm / Chủ đề / Khuyến mãi)', type: 'productSelect', optional: true },
    { key: 'topic', label: 'Chủ đề (nếu không chọn Sản phẩm)', type: 'text', placeholder: 'VD: Bí quyết setup dàn âm thanh phòng khách', optional: true },
    { key: 'promotion', label: 'Chương trình khuyến mãi (nếu không chọn Sản phẩm)', type: 'text', placeholder: 'VD: Giảm 10% cuối tuần, tặng kèm phụ kiện', optional: true }
  ],

  loadContext(inputParams) {
    if (!inputParams.productId) return Promise.resolve({});
    return Promise.all([
      DataProvider.getProduct(inputParams.productId),
      DataProvider.getCategories()
    ]).then(([product, categories]) => ({ product, categories: categories || [] }));
  },

  // productCategoryLabels — Sprint 13 (Product Management V2: Category
  // Assignment). "Reuse the selected Categories" — cùng logic đọc
  // categoryIds (tương thích ngược "category" cũ) đã dùng ở Product AI V2
  // (js/ai/modules/product-description-writer.js), lặp lại ở đây vì đây là
  // Experience Layer riêng của Facebook AI (cùng nguyên tắc đã áp dụng cho
  // getYoutubeEmbedUrl() — xem PROJECT_ARCHITECTURE.md).
  productCategoryLabels(p, categories) {
    const ids = Array.isArray(p.categoryIds) && p.categoryIds.length ? p.categoryIds : (p.category ? [p.category] : []);
    const byCode = {};
    (categories || []).forEach(c => { byCode[c.code] = c; });
    return ids.map(id => byCode[id]).filter(Boolean).map(c => c.label);
  },

  buildPrompt(inputParams, context) {
    const p = context.product || {};
    const categoryLabels = this.productCategoryLabels(p, context.categories);
    let grounding;
    if (p.name) {
      grounding = `sản phẩm thật sau — chỉ dùng đúng thông tin đã cho, không bịa thêm thông số: Tên: ${p.name}. Thương hiệu: ${p.brand || ''}. Thông số: ${p.specs || ''}. Mô tả ngắn: ${p.shortDescription || ''}.${categoryLabels.length ? ` Thuộc danh mục: ${categoryLabels.join(', ')}.` : ''}`;
    } else if (inputParams.promotion) {
      grounding = `chương trình khuyến mãi sau: ${inputParams.promotion}.`;
    } else if (inputParams.topic) {
      grounding = `chủ đề sau: ${inputParams.topic}.`;
    } else {
      grounding = `giới thiệu chung về Pshop Music (không có chủ đề/sản phẩm/khuyến mãi cụ thể nào được chọn).`;
    }
    return `Viết nội dung bài đăng Facebook cho Pshop Music (shop thiết bị DJ & âm thanh chuyên nghiệp tại Nha Trang), xoay quanh ${grounding}

Viết ĐÚNG 3 PHIÊN BẢN KHÁC NHAU (góc tiếp cận khác nhau — VD: 1 bản nhấn mạnh cảm xúc, 1 bản nhấn mạnh lý tính/thông số, 1 bản tạo cảm giác khan hiếm/khuyến mãi) để so sánh chọn bản tốt nhất.

Trả về DUY NHẤT 1 đối tượng JSON hợp lệ — không kèm giải thích, không bọc trong khối markdown, đúng cấu trúc sau:
{
  "versions": [
    {"hook": "Câu mở đầu thu hút", "caption": "Nội dung chính 2-4 câu, văn bản thuần không HTML", "cta": "Câu kêu gọi hành động", "hashtags": ["tag1", "tag2", "tag3"]},
    {"hook": "...", "caption": "...", "cta": "...", "hashtags": ["..."]},
    {"hook": "...", "caption": "...", "cta": "...", "hashtags": ["..."]}
  ]
}

TUYỆT ĐỐI KHÔNG tự chèn ảnh/link, không tự bịa URL ảnh/video/link nào — hệ thống sẽ tự chèn ảnh/video/link thật vào đúng vị trí, bạn chỉ cần viết phần văn bản.`;
  },

  // parseJsonResponse — cùng pattern đã dùng ở Product AI V2/Blog AI V2/
  // Facebook AI V2 (Sprint 12 Requirement #4/#5/#6) — loại bỏ code fence AI
  // có thể tự thêm, khoan dung nếu AI chèn thêm câu giải thích, không throw.
  parseJsonResponse(text) {
    const cleaned = String(text || '')
      .replace(/^\s*```[a-zA-Z]*\s*\n?/, '')
      .replace(/\n?\s*```\s*$/, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (e2) { return null; }
      }
      return null;
    }
  },

  // getYoutubeEmbedUrl — chỉ dùng link YouTube Admin đã tự nhập thủ công
  // (product.youtubeUrl, xem admin/products.html) — KHÔNG do AI sinh ra.
  getYoutubeEmbedUrl(url) {
    const str = String(url || '').trim();
    if (!str) return '';
    let id = '';
    let m = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) id = m[1];
    if (!id) { m = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    return id ? `https://www.youtube.com/embed/${id}` : '';
  },

  // buildProductHighlights — lấy từ dữ liệu Product THẬT đã có (features từ
  // Product AI V2 nếu đã chạy, hoặc specs) — KHÔNG để AI tự nghĩ thêm
  // ("Use ONLY existing Product data"). Không có sản phẩm/dữ liệu → mảng rỗng.
  buildProductHighlights(p) {
    if (Array.isArray(p.features) && p.features.length) return p.features.slice(0, 5);
    if (p.specs) return [p.specs];
    return [];
  },

  // buildPostText — lắp 1 phiên bản thành văn bản thuần để Founder copy dán
  // thủ công lên Facebook thật — KHÔNG có tích hợp API tự đăng bài (đúng
  // "No Facebook API yet"/"Publish manually").
  buildPostText(version, highlights, productLink) {
    const parts = [];
    if (version.hook) parts.push(version.hook);
    if (version.caption) parts.push(version.caption);
    if (highlights.length) parts.push(highlights.map(h => '✓ ' + h).join('\n'));
    if (version.cta) parts.push(version.cta);
    if (version.hashtags.length) parts.push(version.hashtags.map(h => (h.indexOf('#') === 0 ? h : '#' + h)).join(' '));
    if (productLink) parts.push('Xem chi tiết: ' + productLink);
    return parts.join('\n\n');
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    const p = context.product || {};
    const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
    const parsed = this.parseJsonResponse(providerOutput.text);
    const highlights = this.buildProductHighlights(p);
    const embedUrl = this.getYoutubeEmbedUrl(p.youtubeUrl);
    const productLink = inputParams.productId ? `category.html?product=${encodeURIComponent(inputParams.productId)}` : '';

    const rawVersions = (parsed && Array.isArray(parsed.versions) && parsed.versions.length)
      ? parsed.versions
      : null;

    let versions;
    if (rawVersions) {
      versions = rawVersions.map(v => ({
        hook: (v && v.hook) || '',
        caption: (v && v.caption) || '',
        cta: (v && v.cta) || '',
        hashtags: (v && Array.isArray(v.hashtags)) ? v.hashtags : []
      }));
    } else {
      // Fallback an toàn: JSON không parse được/không có "versions" hợp lệ —
      // vẫn giữ lại toàn văn phản hồi làm 1 phiên bản duy nhất, không bao
      // giờ để Draft rỗng.
      versions = [{
        hook: '',
        caption: String(providerOutput.text || '').replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim(),
        cta: '',
        hashtags: []
      }];
    }

    const labels = ['A', 'B', 'C', 'D', 'E'];
    const versionsWithText = versions.map((v, i) => Object.assign({ label: labels[i] || String(i + 1) }, v, {
      postText: this.buildPostText(v, highlights, productLink)
    }));

    return {
      versions: versionsWithText,
      productHighlights: highlights,
      featuredImage: images[0] || '',
      galleryImages: images.slice(1),
      youtubeEmbedUrl: embedUrl,
      productLink
    };
  }
});
