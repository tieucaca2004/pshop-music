/*
 * Facebook AI V2 (Sprint 12 Requirement #6 — Media AI: Facebook AI V2) —
 * sinh bài đăng Facebook publish-ready CHỈ từ 1 Sản phẩm có sẵn. Founder
 * CHỈ chọn Sản phẩm — Caption/Hook/CTA/Hashtags do AI viết, còn Featured
 * Image/Gallery Images/YouTube Video/Product Link đều lấy nguyên văn từ dữ
 * liệu Product thật qua DataProvider — AI KHÔNG BAO GIỜ tự bịa URL media/
 * link (AI_RULES.md mục 2).
 *
 * targetCollection vẫn = null (giữ nguyên từ bản cũ) — Facebook chưa có
 * tích hợp đăng bài thật, "Publish" ở đây chỉ đánh dấu Draft đã duyệt để
 * Founder tự copy nội dung đăng thủ công lên Facebook, KHÔNG tự động đăng.
 *
 * Publish sẽ không ghi vào collection nào (publishToTarget() trong
 * js/admin-ai.js đã xử lý targetCollection=null từ trước, không cần sửa).
 */
AIModuleRegistry.register({
  id: 'facebook-post-generator',
  label: 'Facebook AI V2',
  description: 'Tự động sinh bài đăng Facebook publish-ready từ 1 sản phẩm có sẵn — chèn ảnh/video/link thật, không tự bịa, chỉ để copy đăng thủ công.',
  targetCollection: null,

  inputFields: [
    { key: 'productId', label: 'Chọn sản phẩm', type: 'productSelect' }
  ],

  loadContext(inputParams) {
    if (!inputParams.productId) return Promise.resolve({});
    return DataProvider.getProduct(inputParams.productId).then(product => ({ product }));
  },

  buildPrompt(inputParams, context) {
    const p = context.product || {};
    return `Viết nội dung bài đăng Facebook quảng bá sản phẩm thật sau cho Pshop Music (shop thiết bị DJ & âm thanh Nha Trang) — chỉ dùng đúng thông tin đã cho, không bịa thêm thông số: Tên: ${p.name || ''}. Thương hiệu: ${p.brand || ''}. Thông số: ${p.specs || ''}. Mô tả ngắn: ${p.shortDescription || ''}.

Trả về DUY NHẤT 1 đối tượng JSON hợp lệ — không kèm giải thích, không bọc trong khối markdown, đúng các khóa sau:
{
  "hook": "1 câu mở đầu thật thu hút, gây tò mò",
  "mainContent": "Nội dung chính 2-4 câu giới thiệu sản phẩm, văn bản thuần không HTML",
  "cta": "1 câu kêu gọi hành động rõ ràng (VD: Nhắn tin ngay để được tư vấn!)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}

TUYỆT ĐỐI KHÔNG tự chèn ảnh/link, không tự bịa URL ảnh/video/link nào — hệ thống sẽ tự chèn ảnh/video/link thật vào đúng vị trí, bạn chỉ cần viết phần văn bản.`;
  },

  // parseJsonResponse — cùng pattern đã dùng ở Product AI V2/Blog AI V2
  // (Sprint 12 Requirement #4/#5) — loại bỏ code fence AI có thể tự thêm,
  // khoan dung nếu AI chèn thêm câu giải thích, không bao giờ throw.
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

  // buildProductHighlights — "Product Highlights" trong POST FORMAT lấy từ
  // dữ liệu Product THẬT đã có (features từ Product AI V2 nếu đã chạy, hoặc
  // specs) — KHÔNG để AI tự nghĩ thêm thông tin mới ("Use ONLY existing
  // Product data"). Không có dữ liệu nào thì trả mảng rỗng — bỏ qua đúng
  // phần này khi hiển thị.
  buildProductHighlights(p) {
    if (Array.isArray(p.features) && p.features.length) return p.features.slice(0, 5);
    if (p.specs) return [p.specs];
    return [];
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    const p = context.product || {};
    const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
    const parsed = this.parseJsonResponse(providerOutput.text);
    const highlights = this.buildProductHighlights(p);
    const embedUrl = this.getYoutubeEmbedUrl(p.youtubeUrl);
    const productLink = inputParams.productId ? `category.html?product=${encodeURIComponent(inputParams.productId)}` : '';

    let hook = '', mainContent, cta = '', hashtags = [];
    if (parsed) {
      hook = parsed.hook || '';
      mainContent = parsed.mainContent || '';
      cta = parsed.cta || '';
      hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
    } else {
      // Fallback an toàn: JSON không parse được vẫn giữ lại toàn văn phản
      // hồi làm nội dung chính — không bao giờ để Draft rỗng.
      mainContent = String(providerOutput.text || '').replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '').trim();
    }

    // postText — bản văn bản thuần lắp đúng POST FORMAT (Hook → Main
    // Content → Product Highlights → CTA → Hashtags → Product Link), để
    // Founder copy dán thủ công lên Facebook thật — KHÔNG có tích hợp API
    // tự đăng bài (đúng "Do NOT auto-post to Facebook").
    const textParts = [];
    if (hook) textParts.push(hook);
    if (mainContent) textParts.push(mainContent);
    if (highlights.length) textParts.push(highlights.map(h => '✓ ' + h).join('\n'));
    if (cta) textParts.push(cta);
    if (hashtags.length) textParts.push(hashtags.map(h => (h.indexOf('#') === 0 ? h : '#' + h)).join(' '));
    if (productLink) textParts.push('Xem chi tiết: ' + productLink);

    return {
      hook,
      mainContent,
      cta,
      hashtags,
      productHighlights: highlights,
      featuredImage: images[0] || '',
      galleryImages: images.slice(1),
      youtubeEmbedUrl: embedUrl,
      productLink,
      postText: textParts.join('\n\n')
    };
  }
});
