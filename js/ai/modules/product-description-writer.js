/*
 * Product AI V2 (Sprint 12 Requirement #1) — sinh đầy đủ nội dung
 * publish-ready cho 1 sản phẩm CÓ SẴN: Tên/Mô tả ngắn/Mô tả dài/Thông số/
 * Tính năng/FAQ/SEO Title/Meta Description/SEO Keywords/Slug/Tags/Danh mục/
 * ALT Text. Đọc dữ liệu sản phẩm + danh mục hợp lệ thật qua DataProvider
 * (js/ai/data-provider.js) — không gọi thẳng DB/CategoryDB — làm căn cứ,
 * không bịa thông số.
 *
 * Yêu cầu AI trả về 1 khối JSON DUY NHẤT (không phải tách theo dòng như bản
 * cũ) — tránh đúng lỗi đã gặp ở Blog AI (AI tự bọc markdown code fence/đặt
 * sai vị trí khiến parse theo dòng bị lệch, xem CHANGELOG.md mục Sprint 12
 * Requirement #3). parseJsonResponse() bên dưới luôn có fallback an toàn —
 * không bao giờ trả về Draft rỗng dù JSON parse thất bại.
 *
 * Publish sẽ gọi DB.update(targetId, content) có sẵn (ngoài phạm vi plugin,
 * xem js/admin-ai.js publishToTarget() — nơi validate "category" trước khi
 * ghi, tránh AI gán nhầm category không tồn tại).
 */
AIModuleRegistry.register({
  id: 'product-description-writer',
  label: 'Product AI V2',
  description: 'Sinh đầy đủ nội dung publish-ready cho 1 sản phẩm: mô tả, thông số, tính năng, FAQ, SEO, slug, tags, danh mục, ALT text.',
  targetCollection: 'products',

  inputFields: [
    { key: 'productId', label: 'Chọn sản phẩm', type: 'productSelect' },
    { key: 'tone', label: 'Văn phong', type: 'select', options: ['Chuyên nghiệp', 'Thân thiện', 'Nhấn mạnh khuyến mãi'] }
  ],

  loadContext(inputParams) {
    if (!inputParams.productId) return Promise.resolve({});
    return Promise.all([
      DataProvider.getProduct(inputParams.productId),
      DataProvider.getCategories()
    ]).then(([product, categories]) => ({ product, categories: categories || [] }));
  },

  // productCategoryLabels — Sprint 13 (Product Management V2: Category
  // Assignment). "Reuse the selected Categories" — đọc categoryIds Founder
  // ĐÃ chọn thật (nhiều danh mục), tương thích ngược với sản phẩm cũ chỉ có
  // "category" (1 mã). Danh mục đã bị xóa khỏi CategoryDB tự động lọc bỏ
  // (Ignore missing Categories gracefully), không lỗi.
  productCategoryLabels(p, categories) {
    const ids = Array.isArray(p.categoryIds) && p.categoryIds.length ? p.categoryIds : (p.category ? [p.category] : []);
    const byCode = {};
    (categories || []).forEach(c => { byCode[c.code] = c; });
    return ids.map(id => byCode[id]).filter(Boolean).map(c => c.label);
  },

  buildPrompt(inputParams, context) {
    const p = context.product || {};
    const categories = context.categories || [];
    const categoryList = categories.map(c => `${c.code} (${c.label})`).join(', ') || '(chưa có danh mục nào)';
    const assignedLabels = this.productCategoryLabels(p, categories);
    const assignedText = assignedLabels.length ? assignedLabels.join(', ') : (p.categoryLabel || p.category || '');
    return `Bạn là chuyên gia content SEO cho cửa hàng thiết bị DJ/âm thanh chuyên nghiệp tại Việt Nam. Dựa ĐÚNG vào thông tin sản phẩm thật dưới đây — KHÔNG bịa thêm thông số/tính năng không có căn cứ — viết đầy đủ nội dung publish-ready, văn phong ${inputParams.tone || 'Chuyên nghiệp'}.

Thông tin sản phẩm thật:
- Tên hiện tại: ${p.name || ''}
- Thương hiệu: ${p.brand || ''}
- Thông số ngắn hiện có: ${p.specs || ''}
- Danh mục đã gán (Founder đã chọn — dùng làm căn cứ ngữ cảnh, không tự đổi): ${assignedText || '(chưa gán danh mục nào)'}
- Danh sách mã danh mục HỢP LỆ (chỉ được chọn đúng 1 mã "code" trong danh sách này, giữ nguyên, không dịch, không bịa mã mới): ${categoryList}

Trả về DUY NHẤT 1 đối tượng JSON hợp lệ — không kèm câu giải thích nào trước/sau, không bọc trong khối markdown \`\`\`, đúng các khóa sau:
{
  "name": "Tên sản phẩm đã tối ưu SEO (giữ đúng model/thương hiệu thật)",
  "shortDescription": "Mô tả ngắn 1-2 câu, văn bản thuần, không HTML",
  "description": "Mô tả chi tiết đầy đủ, dạng HTML dùng <p>/<ul>/<li>, KHÔNG dùng markdown/code fence",
  "specifications": "Thông số kỹ thuật chi tiết dạng HTML <ul><li>...</li></ul>, CHỈ dùng thông tin đã cho ở trên, không bịa số liệu mới",
  "features": ["Tính năng nổi bật 1", "Tính năng nổi bật 2", "Tính năng nổi bật 3"],
  "faq": [{"question": "Câu hỏi thường gặp 1", "answer": "Trả lời ngắn gọn"}, {"question": "Câu hỏi 2", "answer": "..."}, {"question": "Câu hỏi 3", "answer": "..."}],
  "seoTitle": "Tiêu đề SEO, tối đa 60 ký tự",
  "metaDescription": "Mô tả SEO, tối đa 160 ký tự",
  "seoKeywords": ["từ khóa 1", "từ khóa 2", "từ khóa 3"],
  "slug": "duong-dan-khong-dau-khong-hoa-viet",
  "tags": ["tag1", "tag2"],
  "category": "đúng 1 mã trong danh sách mã hợp lệ ở trên — nếu không chắc, giữ nguyên mã danh mục hiện tại",
  "altText": "Mô tả ảnh ngắn gọn dùng cho thuộc tính alt, tối đa 125 ký tự"
}`;
  },

  // parseJsonResponse — loại bỏ markdown code fence AI có thể tự thêm dù
  // Prompt đã yêu cầu không dùng (cùng nguyên nhân đã sửa ở Blog AI V2), rồi
  // parse JSON. Nếu parse thất bại, thử tìm khối {...} đầu tiên trong text
  // (phòng AI chèn thêm câu giải thích dù đã yêu cầu không làm vậy). Không
  // bao giờ throw — trả về null để mapToDraftContent() tự có fallback an
  // toàn, tránh "Empty content after Publish".
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

  mapToDraftContent(providerOutput, inputParams, context) {
    const p = context.product || {};
    const parsed = this.parseJsonResponse(providerOutput.text);
    if (!parsed) {
      // Fallback an toàn: JSON không parse được — vẫn lưu lại được nội dung
      // (coi toàn văn phản hồi là Long Description) thay vì Draft rỗng.
      return {
        name: p.name || '',
        shortDescription: '',
        description: String(providerOutput.text || '').replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim(),
        specifications: '',
        features: [],
        faq: [],
        seoTitle: '',
        metaDescription: '',
        seoKeywords: [],
        slug: '',
        tags: [],
        category: '',
        altText: p.name || '',
        _productName: p.name || inputParams.productId
      };
    }
    return {
      name: parsed.name || p.name || '',
      shortDescription: parsed.shortDescription || '',
      description: parsed.description || '',
      specifications: parsed.specifications || '',
      features: Array.isArray(parsed.features) ? parsed.features : [],
      faq: Array.isArray(parsed.faq) ? parsed.faq.filter(f => f && f.question) : [],
      seoTitle: parsed.seoTitle || '',
      metaDescription: parsed.metaDescription || '',
      seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : [],
      slug: parsed.slug || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      category: parsed.category || '',
      altText: parsed.altText || parsed.name || p.name || '',
      _productName: parsed.name || p.name || inputParams.productId
    };
  }
});
