/*
 * Slider Generator (Sprint 2 — plugin chính thức #2) — sinh nội dung 1 slide
 * mới cho hero slider trang chủ, dựa trên 1 sản phẩm CÓ SẴN (đọc qua
 * DB.get()). Dùng ảnh có sẵn của chính sản phẩm (product.images) làm gợi ý
 * — CMS hiện chưa có module Media Library riêng, xem ROADMAP.md.
 *
 * targetCollection dùng ký hiệu "siteContent.heroSlides" — Publish (trong
 * admin/ai/drafts.html) đọc SiteContentDB.get(), nối thêm slide vào mảng
 * heroSlides rồi SiteContentDB.save() lại, đúng hàm dữ liệu có sẵn.
 * Không tích hợp API tạo ảnh — "imagePrompt" chỉ là gợi ý để admin tự dùng
 * với công cụ tạo ảnh AI khác, không tự sinh ảnh.
 */
AIModuleRegistry.register({
  id: 'slider-generator',
  label: 'Slider Generator',
  description: 'Tạo Headline/Subheadline/CTA + gợi ý ảnh cho 1 slide mới, dựa trên 1 sản phẩm đã có.',
  targetCollection: 'siteContent.heroSlides',

  inputFields: [
    { key: 'productId', label: 'Chọn sản phẩm làm chủ đề slide', type: 'productSelect' },
    { key: 'ctaStyle', label: 'Kiểu kêu gọi hành động (CTA)', type: 'select', options: ['Mua ngay', 'Xem chi tiết', 'Liên hệ tư vấn'] }
  ],

  loadContext(inputParams) {
    if (typeof DB === 'undefined' || !inputParams.productId) return Promise.resolve({});
    return DB.get(inputParams.productId).then(product => ({ product }));
  },

  buildPrompt(inputParams, context) {
    const p = context.product || {};
    return [
      `Dựa trên sản phẩm sau, viết nội dung 1 slide banner trang chủ bằng tiếng Việt.`,
      `Sản phẩm: ${p.name || ''}. Thương hiệu: ${p.brand || ''}. Thông số: ${p.specs || ''}.`,
      `Trả về đúng 3 dòng: dòng 1 = Headline (in hoa, dưới 8 từ), dòng 2 = Subheadline (1 câu mô tả ngắn), dòng 3 = prompt tiếng Anh mô tả chi tiết để dùng với công cụ tạo ảnh AI khác (bối cảnh studio chuyên nghiệp cho sản phẩm này).`
    ].join(' ');
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    const p = context.product || {};
    const lines = (providerOutput.text || '').split('\n').filter(Boolean);
    const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
    return {
      image: images[0] || '',
      title: lines[0] || p.name || '',
      subtitle: lines[1] || '',
      link: p.category ? `category.html?cat=${p.category}` : '',
      ctaText: inputParams.ctaStyle || 'Xem chi tiết',
      imagePrompt: lines[2] || ''
    };
  }
});
