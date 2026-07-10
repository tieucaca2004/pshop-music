/*
 * Blog AI V2 (Sprint 12 Requirement #5 — Media AI: Product & Blog Media) —
 * sinh 1 bài blog mới (draft) theo chủ đề. TUỲ CHỌN chọn 1 Sản phẩm có sẵn
 * (productId) để tự động chèn ẢNH/VIDEO THẬT của sản phẩm đó vào bài viết —
 * KHÔNG BAO GIỜ để AI tự bịa URL ảnh/video (AI_RULES.md mục 2): mọi ảnh/
 * video trong bài đều lấy nguyên văn từ dữ liệu CMS thật qua DataProvider,
 * chỉ phần văn bản (tiêu đề/mở bài/các mục/kết bài) do AI viết.
 *
 * Yêu cầu AI trả về 1 khối JSON DUY NHẤT (không tách theo dòng như bản cũ —
 * chính cách tách dòng cũ đã gây lỗi title/slug ở lần sửa lỗi trước, xem
 * CHANGELOG.md mục Sprint 12 Requirement #3) — parseJsonResponse() luôn có
 * fallback an toàn (giữ hành vi tách-dòng CŨ nếu JSON hỏng), không bao giờ
 * để Draft rỗng.
 *
 * Publish sẽ gọi BlogDB.add() có sẵn trong js/cms-db.js (ngoài phạm vi
 * plugin, xem js/admin-ai.js publishToTarget()) — không đổi Draft System/
 * Publish Pipeline.
 */
AIModuleRegistry.register({
  id: 'blog-writer',
  label: 'Blog AI V2',
  description: 'Viết bài blog mới theo chủ đề — tuỳ chọn chèn tự động ảnh/video thật của 1 sản phẩm có sẵn + link sản phẩm liên quan cuối bài.',
  targetCollection: 'blogPosts',

  inputFields: [
    { key: 'topic', label: 'Chủ đề bài viết', type: 'text', placeholder: 'VD: Cách chọn loa kiểm âm cho phòng thu tại nhà' },
    { key: 'tone', label: 'Văn phong', type: 'select', options: ['Chuyên nghiệp', 'Thân thiện', 'Hài hước'] },
    { key: 'keywords', label: 'Từ khóa SEO (phân tách bằng dấu phẩy)', type: 'text', placeholder: 'loa kiểm âm, phòng thu tại nhà' },
    { key: 'productId', label: 'Sản phẩm liên quan (không bắt buộc — tự chèn ảnh/video thật)', type: 'productSelect', optional: true }
  ],

  loadContext(inputParams) {
    if (!inputParams.productId) return Promise.resolve({});
    return DataProvider.getProduct(inputParams.productId).then(product => ({ product }));
  },

  buildPrompt(inputParams, context) {
    const p = context.product || {};
    const grounding = p.name
      ? `\n\nBài viết này xoay quanh sản phẩm thật sau — chỉ dùng đúng thông tin đã cho, không bịa thêm thông số: Tên: ${p.name}. Thương hiệu: ${p.brand || ''}. Thông số: ${p.specs || ''}.`
      : '';
    return `Viết 1 bài blog bằng tiếng Việt, văn phong ${inputParams.tone || 'Chuyên nghiệp'}, chủ đề: "${inputParams.topic}". Từ khóa SEO cần lồng ghép: ${inputParams.keywords || '(không có)'}.${grounding}

Trả về DUY NHẤT 1 đối tượng JSON hợp lệ — không kèm giải thích, không bọc trong khối markdown, đúng các khóa sau:
{
  "title": "Tiêu đề bài viết",
  "intro": "Đoạn mở đầu 2-3 câu, văn bản thuần không HTML",
  "sections": [{"heading": "Tiêu đề mục 1", "paragraph": "Nội dung mục 1, văn bản thuần"}, {"heading": "Tiêu đề mục 2", "paragraph": "..."}, {"heading": "Tiêu đề mục 3", "paragraph": "..."}],
  "conclusion": "Đoạn kết 2-3 câu"
}

TUYỆT ĐỐI KHÔNG tự chèn thẻ <img>/<iframe>, không tự bịa URL ảnh hay link video — hệ thống sẽ tự chèn ảnh/video thật vào đúng vị trí, bạn chỉ cần viết phần văn bản.`;
  },

  // parseJsonResponse — loại bỏ markdown code fence AI có thể tự thêm dù
  // Prompt đã yêu cầu không dùng (cùng nguyên nhân đã sửa ở Sprint 12
  // Requirement #3/#4), rồi parse JSON. Không bao giờ throw.
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

  // getYoutubeEmbedUrl — chỉ dùng link YouTube Admin đã tự nhập thủ công cho
  // sản phẩm (product.youtubeUrl, xem admin/products.html) — KHÔNG BAO GIỜ
  // do AI sinh ra. Trả về '' nếu không nhận diện được URL, để phần video tự
  // bỏ qua (đúng "If media does not exist, skip that section gracefully").
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

  escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    const p = context.product || {};
    const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
    const parsed = this.parseJsonResponse(providerOutput.text);

    if (!parsed) {
      // Fallback an toàn (hành vi cũ, tách theo dòng) nếu JSON không parse
      // được — vẫn giữ được nội dung, không để Draft rỗng.
      const lines = (providerOutput.text || '').split('\n').filter(Boolean);
      return {
        title: lines[0] || inputParams.topic,
        slug: '',
        excerpt: lines[1] || '',
        coverImage: images[0] || '',
        author: 'Pshop Music',
        tags: (inputParams.keywords || '').split(',').map(t => t.trim()).filter(Boolean),
        status: 'draft',
        seoTitle: '',
        seoDescription: '',
        contentHtml: lines.slice(2).join('\n'),
        relatedProductId: inputParams.productId || null
      };
    }

    // Cấu trúc bài viết theo đúng yêu cầu: Title → Featured Image → Intro →
    // (H2 → Paragraph → Image) lặp lại → YouTube Video (nếu có) → Conclusion
    // → Related Product. Ảnh/video CHỈ lấy từ dữ liệu Product thật — không
    // có ảnh/video nào thì bỏ qua đúng phần đó, không để trống.
    const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
    const htmlParts = [];
    if (images[0]) {
      htmlParts.push(`<img src="${this.escapeHtml(images[0])}" alt="${this.escapeHtml(parsed.title || p.name || '')}" class="blog-featured-image">`);
    }
    if (parsed.intro) htmlParts.push(`<p>${this.escapeHtml(parsed.intro)}</p>`);
    sections.forEach((s, i) => {
      if (s && s.heading) htmlParts.push(`<h2>${this.escapeHtml(s.heading)}</h2>`);
      if (s && s.paragraph) htmlParts.push(`<p>${this.escapeHtml(s.paragraph)}</p>`);
      const inlineImg = images[i + 1]; // ảnh đầu đã dùng làm Featured Image, các ảnh sau chèn xen giữa các mục
      if (inlineImg) htmlParts.push(`<img src="${this.escapeHtml(inlineImg)}" alt="${this.escapeHtml(p.name || '')}" class="blog-inline-image">`);
    });
    const embedUrl = this.getYoutubeEmbedUrl(p.youtubeUrl);
    if (embedUrl) {
      htmlParts.push(`<div class="blog-video-embed"><iframe src="${this.escapeHtml(embedUrl)}" title="${this.escapeHtml(p.name || '')}" allowfullscreen loading="lazy"></iframe></div>`);
    }
    if (parsed.conclusion) htmlParts.push(`<p>${this.escapeHtml(parsed.conclusion)}</p>`);
    if (inputParams.productId && p.name) {
      htmlParts.push(`<p class="blog-related-product">Sản phẩm liên quan: <a href="category.html?product=${encodeURIComponent(inputParams.productId)}">${this.escapeHtml(p.name)}</a></p>`);
    }

    return {
      title: parsed.title || inputParams.topic,
      slug: '',
      excerpt: parsed.intro || '',
      coverImage: images[0] || '',
      author: 'Pshop Music',
      tags: (inputParams.keywords || '').split(',').map(t => t.trim()).filter(Boolean),
      status: 'draft',
      seoTitle: '',
      seoDescription: '',
      contentHtml: htmlParts.join('\n'),
      relatedProductId: inputParams.productId || null
    };
  }
});
