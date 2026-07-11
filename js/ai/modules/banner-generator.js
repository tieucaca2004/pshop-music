/*
 * Banner AI V2 (Sprint 12 Requirement #8 — Media AI: Banner AI V2) — nâng
 * cấp Banner Generator để sinh banner publish-ready từ Sản phẩm, Khuyến mãi,
 * hoặc Sự kiện có sẵn — Founder chọn ĐÚNG 1 trong 3, cả 3 field đều tuỳ
 * chọn. Có Sản phẩm → tự động gắn Featured Product Image/Gallery THẬT qua
 * DataProvider (AI KHÔNG BAO GIỜ tự bịa URL ảnh, AI_RULES.md mục 2); không
 * có Sản phẩm → chỉ sinh văn bản, đúng "Generate text only."
 *
 * Publish vẫn gọi BannerDB.add() có sẵn trong js/cms-db.js (ngoài phạm vi
 * plugin, xem js/admin-ai.js publishToTarget() — không cần sửa, field mới
 * chỉ CỘNG THÊM vào content đã có, không đổi field cũ).
 */
AIModuleRegistry.register({
  id: 'banner-generator',
  label: 'Banner AI V2',
  description: 'Sinh banner quảng cáo publish-ready (Tiêu đề/Phụ đề/CTA) từ Sản phẩm, Khuyến mãi, hoặc Sự kiện — tự gắn ảnh sản phẩm thật nếu có, không tự bịa ảnh.',
  targetCollection: 'banners',

  inputFields: [
    { key: 'productId', label: 'Sản phẩm (chọn 1 trong 3: Sản phẩm / Khuyến mãi / Sự kiện)', type: 'productSelect', optional: true },
    { key: 'promotion', label: 'Chương trình khuyến mãi (nếu không chọn Sản phẩm)', type: 'text', placeholder: 'VD: Giảm 15% dịp 30/4', optional: true },
    { key: 'event', label: 'Sự kiện (nếu không chọn Sản phẩm)', type: 'text', placeholder: 'VD: Hội chợ âm thanh Nha Trang 2026', optional: true },
    { key: 'link', label: 'Link khi bấm vào banner (không bắt buộc)', type: 'text', placeholder: 'category.html?cat=tainghe', optional: true }
  ],

  loadContext(inputParams) {
    if (!inputParams.productId) return Promise.resolve({});
    return DataProvider.getProduct(inputParams.productId).then(product => ({ product }));
  },

  buildPrompt(inputParams, context) {
    const p = context.product || {};
    let grounding;
    if (p.name) {
      grounding = `sản phẩm thật sau — chỉ dùng đúng thông tin đã cho, không bịa thêm: Tên: ${p.name}. Thương hiệu: ${p.brand || ''}.`;
    } else if (inputParams.promotion) {
      grounding = `chương trình khuyến mãi sau: ${inputParams.promotion}.`;
    } else if (inputParams.event) {
      grounding = `sự kiện sau: ${inputParams.event}.`;
    } else {
      grounding = `giới thiệu chung về Pshop Music (không có sản phẩm/khuyến mãi/sự kiện cụ thể nào được chọn).`;
    }
    return `Viết nội dung banner quảng cáo ngắn gọn, thu hút cho Pshop Music (shop thiết bị DJ & âm thanh chuyên nghiệp tại Nha Trang), xoay quanh ${grounding}

Trả về DUY NHẤT 1 đối tượng JSON hợp lệ — không kèm giải thích, không bọc trong khối markdown, đúng các khóa sau:
{
  "title": "Tiêu đề banner ngắn gọn, thu hút, tối đa 8 từ",
  "subtitle": "Phụ đề bổ sung 1 câu ngắn",
  "cta": "Cụm từ kêu gọi hành động ngắn (VD: Mua ngay, Xem thêm)"
}

TUYỆT ĐỐI KHÔNG tự chèn ảnh, không tự bịa URL ảnh nào — hệ thống sẽ tự chèn ảnh sản phẩm thật vào banner nếu có.`;
  },

  // parseJsonResponse — cùng pattern đã dùng ở Product AI V2/Blog AI V2/
  // Facebook AI V2-V3 (Sprint 12 Requirement #4/#5/#6/#7) — loại bỏ code
  // fence AI có thể tự thêm, khoan dung nếu AI chèn thêm câu giải thích,
  // không bao giờ throw.
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
    // "If no Product is selected, generate text only" — image/galleryImages
    // chỉ lấy khi CÓ chọn Sản phẩm, nguyên văn từ dữ liệu thật qua
    // DataProvider — không có Sản phẩm thì cả 2 field này đều rỗng.
    const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
    const parsed = this.parseJsonResponse(providerOutput.text);

    let title = '', subtitle = '', cta = '';
    if (parsed) {
      title = parsed.title || '';
      subtitle = parsed.subtitle || '';
      cta = parsed.cta || '';
    } else {
      // Fallback an toàn: JSON không parse được vẫn giữ lại dòng đầu của
      // toàn văn phản hồi làm title — không bao giờ để Draft rỗng.
      title = String(providerOutput.text || '')
        .replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim()
        .split('\n')[0];
    }
    if (!title) title = inputParams.promotion || inputParams.event || (p.name ? ('Banner ' + p.name) : 'Banner quảng cáo mới');

    return {
      title,
      subtitle,
      cta,
      image: images[0] || '',
      galleryImages: images.slice(1),
      link: inputParams.link || '',
      zone: 'home-top',
      order: 0,
      active: true
    };
  }
});
