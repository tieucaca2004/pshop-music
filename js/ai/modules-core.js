/*
 * shared/aiModulesCore.js — Sprint 15 Phase 2 (AI Architecture
 * Consolidation, Option B — approved by Founder). PURE, environment-
 * agnostic content for the 9 AI modules: shared helpers +
 * targetCollection/buildPrompt/mapToDraftContent (+ IMAGE_TYPE_DIRECTION/
 * STYLE_DIRECTION for image-generator). Contains NO `require()`, NO
 * `DataProvider`, NO `listResource` — nothing environment-specific, so the
 * exact same file content works loaded via <script> in the browser
 * (attaches to `window.AiModulesCore`) or via `require()` in Node
 * (`module.exports`).
 *
 * This file is deliberately BYTE-IDENTICAL to `js/ai/modules-core.js`. The
 * two physical copies exist because this project has no build/bundle step
 * (Firebase only deploys `functions/`, Netlify serves everything else as
 * static files) and introducing one would itself be an architectural change
 * — out of scope for this Phase ("no architectural redesign"). Keeping two
 * files in sync BY HAND is exactly the risk Sprint 14 Tech Debt #1 called
 * out ("mỗi lần đổi prompt phải sửa đúng ở cả 2 nơi, không có gì đảm bảo
 * đồng bộ") — `test_sprint15_phase2_local.js` enforces byte-identity
 * between the two copies as a regression test, so any future edit to one
 * without mirroring to the other fails tests immediately, instead of
 * silently drifting.
 *
 * `loadContext()` is deliberately NOT here — it's the one genuinely
 * environment-specific piece (client: `DataProvider`, server:
 * `shared/listResource.js`) and stays in each environment's own adapter
 * (`functions/shared/aiModules.js` server-side, each `js/ai/modules/*.js`
 * file client-side).
 *
 * Content below is a verbatim extraction of what was previously duplicated,
 * by hand, between `functions/shared/aiModules.js` (Sprint 14 Phase 5) and
 * the 9 `js/ai/modules/*.js` files (Sprint 2-13) — confirmed identical
 * module-by-module before this extraction (see AI_CONSOLIDATION_REPORT.md).
 * No prompt wording, no parsing logic, no field mapping was changed.
 */
(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    global.AiModulesCore = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function stripCodeFence(str) {
    return String(str || '')
      .replace(/^\s*```[a-zA-Z]*\s*\n?/, '')
      .replace(/\n?\s*```\s*$/, '')
      .trim();
  }

  function parseJsonResponse(text) {
    const cleaned = stripCodeFence(text);
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (e2) { return null; }
      }
      return null;
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function getYoutubeEmbedUrl(url) {
    const str = String(url || '').trim();
    if (!str) return '';
    let id = '';
    let m = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) id = m[1];
    if (!id) { m = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    return id ? `https://www.youtube.com/embed/${id}` : '';
  }

  function productCategoryLabels(p, categories) {
    if (!p) return [];
    const ids = Array.isArray(p.categoryIds) && p.categoryIds.length ? p.categoryIds : (p.category ? [p.category] : []);
    const byCode = {};
    (categories || []).forEach(c => { byCode[c.code] = c; });
    return ids.map(id => byCode[id]).filter(Boolean).map(c => c.label);
  }

  const MODULES = {

    'blog-writer': {
      targetCollection: 'blogPosts',
      buildPrompt(inputParams, context) {
        const p = context.product || {};
        const categoryLabels = productCategoryLabels(p, context.categories);
        const grounding = p.name
          ? `\n\nBài viết này xoay quanh sản phẩm thật sau — chỉ dùng đúng thông tin đã cho, không bịa thêm thông số: Tên: ${p.name}. Thương hiệu: ${p.brand || ''}. Thông số: ${p.specs || ''}.${categoryLabels.length ? ` Thuộc danh mục: ${categoryLabels.join(', ')}.` : ''}`
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
      mapToDraftContent(providerOutput, inputParams, context) {
        const p = context.product || {};
        const images = (Array.isArray(inputParams.images) && inputParams.images.length)
          ? inputParams.images.slice(0, 5)
          : (Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []));
        const parsed = parseJsonResponse(providerOutput.text);

        if (!parsed) {
          const lines = (providerOutput.text || '').split('\n').filter(Boolean);
          return {
            title: lines[0] || inputParams.topic, slug: '', excerpt: lines[1] || '', coverImage: images[0] || '',
            author: 'Pshop Music', tags: (inputParams.keywords || '').split(',').map(t => t.trim()).filter(Boolean),
            status: 'draft', seoTitle: '', seoDescription: '', contentHtml: lines.slice(2).join('\n'),
            relatedProductId: inputParams.productId || null
          };
        }

        const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
        const htmlParts = [];
        if (images[0]) htmlParts.push(`<img src="${escapeHtml(images[0])}" alt="${escapeHtml(parsed.title || p.name || '')}" class="blog-featured-image">`);
        if (parsed.intro) htmlParts.push(`<p>${escapeHtml(parsed.intro)}</p>`);
        sections.forEach((s, i) => {
          if (s && s.heading) htmlParts.push(`<h2>${escapeHtml(s.heading)}</h2>`);
          if (s && s.paragraph) htmlParts.push(`<p>${escapeHtml(s.paragraph)}</p>`);
          const inlineImg = images[i + 1];
          if (inlineImg) htmlParts.push(`<img src="${escapeHtml(inlineImg)}" alt="${escapeHtml(p.name || '')}" class="blog-inline-image">`);
        });
        const embedUrl = getYoutubeEmbedUrl(p.youtubeUrl);
        if (embedUrl) htmlParts.push(`<div class="blog-video-embed"><iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(p.name || '')}" allowfullscreen loading="lazy"></iframe></div>`);
        if (parsed.conclusion) htmlParts.push(`<p>${escapeHtml(parsed.conclusion)}</p>`);
        if (inputParams.productId && p.name) {
          htmlParts.push(`<p class="blog-related-product">Sản phẩm liên quan: <a href="category.html?product=${encodeURIComponent(inputParams.productId)}">${escapeHtml(p.name)}</a></p>`);
        }

        return {
          title: parsed.title || inputParams.topic, slug: '', excerpt: parsed.intro || '', coverImage: images[0] || '',
          author: 'Pshop Music', tags: (inputParams.keywords || '').split(',').map(t => t.trim()).filter(Boolean),
          status: 'draft', seoTitle: '', seoDescription: '', contentHtml: htmlParts.join('\n'),
          relatedProductId: inputParams.productId || null
        };
      }
    },

    'product-description-writer': {
      targetCollection: 'products',
      buildPrompt(inputParams, context) {
        const p = context.product || {};
        const categories = context.categories || [];
        const categoryList = categories.map(c => `${c.code} (${c.label})`).join(', ') || '(chưa có danh mục nào)';
        const assignedLabels = productCategoryLabels(p, categories);
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
      mapToDraftContent(providerOutput, inputParams, context) {
        const p = context.product || {};
        const parsed = parseJsonResponse(providerOutput.text);
        if (!parsed) {
          return {
            name: p.name || '', shortDescription: '', description: stripCodeFence(providerOutput.text),
            specifications: '', features: [], faq: [], seoTitle: '', metaDescription: '', seoKeywords: [],
            slug: '', tags: [], category: '', altText: p.name || '', _productName: p.name || inputParams.productId
          };
        }
        return {
          name: parsed.name || p.name || '', shortDescription: parsed.shortDescription || '', description: parsed.description || '',
          specifications: parsed.specifications || '', features: Array.isArray(parsed.features) ? parsed.features : [],
          faq: Array.isArray(parsed.faq) ? parsed.faq.filter(f => f && f.question) : [],
          seoTitle: parsed.seoTitle || '', metaDescription: parsed.metaDescription || '',
          seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : [], slug: parsed.slug || '',
          tags: Array.isArray(parsed.tags) ? parsed.tags : [], category: parsed.category || '',
          altText: parsed.altText || parsed.name || p.name || '', _productName: parsed.name || p.name || inputParams.productId
        };
      }
    },

    'seo-generator': {
      targetCollection: 'blogPosts',
      buildPrompt(inputParams, context) {
        const post = context.post || {};
        const categoryLabels = productCategoryLabels(context.product, context.categories);
        const categoryLine = categoryLabels.length ? ` Sản phẩm liên quan thuộc danh mục: ${categoryLabels.join(', ')}.` : '';
        return [
          `Dựa trên bài viết sau, tạo gói SEO gồm đúng 6 dòng:`,
          `dòng 1 = Meta Title (dưới 60 ký tự),`,
          `dòng 2 = Meta Description (dưới 160 ký tự),`,
          `dòng 3 = danh sách từ khóa (phân tách bằng dấu phẩy),`,
          `dòng 4 = Open Graph Title,`,
          `dòng 5 = Open Graph Description,`,
          `dòng 6 = gợi ý loại Schema.org phù hợp (vd: Article, Product, FAQPage) kèm lý do ngắn gọn.`,
          `Tiêu đề gốc: "${post.title || ''}". Mô tả ngắn: "${post.excerpt || ''}".${categoryLine}`
        ].join(' ');
      },
      mapToDraftContent(providerOutput, inputParams, context) {
        const lines = (providerOutput.text || '').split('\n').filter(Boolean);
        return {
          seoTitle: lines[0] || '', seoDescription: lines[1] || '',
          keywords: (lines[2] || '').split(',').map(k => k.trim()).filter(Boolean),
          ogTitle: lines[3] || '', ogDescription: lines[4] || '',
          ogImage: (context.post && context.post.coverImage) || '', schemaSuggestion: lines[5] || '',
          _postTitle: (context.post && context.post.title) || inputParams.postId
        };
      }
    },

    'facebook-post-generator': {
      targetCollection: null,
      buildPrompt(inputParams, context) {
        const p = context.product || {};
        const categoryLabels = productCategoryLabels(p, context.categories);
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
      mapToDraftContent(providerOutput, inputParams, context) {
        const p = context.product || {};
        const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
        const parsed = parseJsonResponse(providerOutput.text);
        const highlights = Array.isArray(p.features) && p.features.length ? p.features.slice(0, 5) : (p.specs ? [p.specs] : []);
        const embedUrl = getYoutubeEmbedUrl(p.youtubeUrl);
        const productLink = inputParams.productId ? `category.html?product=${encodeURIComponent(inputParams.productId)}` : '';

        const rawVersions = (parsed && Array.isArray(parsed.versions) && parsed.versions.length) ? parsed.versions : null;
        let versions;
        if (rawVersions) {
          versions = rawVersions.map(v => ({
            hook: (v && v.hook) || '', caption: (v && v.caption) || '', cta: (v && v.cta) || '',
            hashtags: (v && Array.isArray(v.hashtags)) ? v.hashtags : []
          }));
        } else {
          versions = [{ hook: '', caption: stripCodeFence(providerOutput.text), cta: '', hashtags: [] }];
        }

        const buildPostText = (version) => {
          const parts = [];
          if (version.hook) parts.push(version.hook);
          if (version.caption) parts.push(version.caption);
          if (highlights.length) parts.push(highlights.map(h => '✓ ' + h).join('\n'));
          if (version.cta) parts.push(version.cta);
          if (version.hashtags.length) parts.push(version.hashtags.map(h => (h.indexOf('#') === 0 ? h : '#' + h)).join(' '));
          if (productLink) parts.push('Xem chi tiết: ' + productLink);
          return parts.join('\n\n');
        };

        const labels = ['A', 'B', 'C', 'D', 'E'];
        const versionsWithText = versions.map((v, i) => Object.assign({ label: labels[i] || String(i + 1) }, v, { postText: buildPostText(v) }));

        return { versions: versionsWithText, productHighlights: highlights, featuredImage: images[0] || '', galleryImages: images.slice(1), youtubeEmbedUrl: embedUrl, productLink };
      }
    },

    'banner-generator': {
      targetCollection: 'banners',
      buildPrompt(inputParams, context) {
        const p = context.product || {};
        const categoryLabels = productCategoryLabels(p, context.categories);
        let grounding;
        if (p.name) {
          grounding = `sản phẩm thật sau — chỉ dùng đúng thông tin đã cho, không bịa thêm: Tên: ${p.name}. Thương hiệu: ${p.brand || ''}.${categoryLabels.length ? ` Thuộc danh mục: ${categoryLabels.join(', ')}.` : ''}`;
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
      mapToDraftContent(providerOutput, inputParams, context) {
        const p = context.product || {};
        const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
        const parsed = parseJsonResponse(providerOutput.text);
        let title = '', subtitle = '', cta = '';
        if (parsed) {
          title = parsed.title || ''; subtitle = parsed.subtitle || ''; cta = parsed.cta || '';
        } else {
          title = stripCodeFence(providerOutput.text).split('\n')[0];
        }
        if (!title) title = inputParams.promotion || inputParams.event || (p.name ? ('Banner ' + p.name) : 'Banner quảng cáo mới');
        return { title, subtitle, cta, image: images[0] || '', galleryImages: images.slice(1), link: inputParams.link || '', zone: 'home-top', order: 0, active: true };
      }
    },

    'image-generator': {
      targetCollection: null,
      isImageGen: true,
      IMAGE_TYPE_DIRECTION: {
        'Product Hero Image': 'professional studio product photography, clean neutral background, soft even studio lighting, centered composition, high detail',
        'Facebook Post Image': 'eye-catching square social media post image, vibrant colors, modern marketing style',
        'Facebook Carousel Image': 'clean modern e-commerce carousel image, consistent studio lighting, product-focused composition',
        'Banner Image': 'wide marketing banner background, bold and eye-catching, professional advertising style',
        'Promotion Banner': 'promotional sale banner background, energetic composition, bold contrasting colors',
        'Blog Cover Image': 'editorial blog cover image, professional magazine-style composition',
        'Blog Inline Image': 'illustrative supporting image for a blog article, clean and contextually relevant',
        'Category Background Image': 'wide professional retail category header background, subtle negative space reserved on one side for a product image overlay, no visible product in frame, no text',
        'Product Background Image': 'clean professional background composition for product photography, subtle negative space reserved for a product overlay, no visible product in frame, no text'
      },
      STYLE_DIRECTION: {
        'Studio': 'studio background style, seamless clean backdrop, professional even lighting',
        'Lifestyle': 'lifestyle setting background style, real-world environment, natural ambient lighting',
        'Dark': 'dark theme background style, deep tones, moody dramatic lighting',
        'Light': 'light theme background style, bright airy tones, soft even lighting',
        'Luxury': 'luxury premium background style, elegant refined aesthetic, rich materials',
        'Minimal': 'minimal background style, clean negative space, simple geometric composition',
        'Technology': 'technology theme background style, sleek modern digital aesthetic, cool tones, subtle circuit/grid motif'
      },
      buildPrompt(inputParams, context) {
        let direction = this.IMAGE_TYPE_DIRECTION[inputParams.imageType] || 'professional marketing photography';
        const styleDirection = this.STYLE_DIRECTION[inputParams.style];
        if (styleDirection) direction += ', ' + styleDirection;
        const p = context.product;
        const post = context.post;
        let grounding;
        if (p && p.name) {
          const details = [p.brand, p.categoryLabel].filter(Boolean).join(', ');
          grounding = `featuring "${p.name}"${details ? ' (' + details + ')' : ''}${p.shortDescription ? '. ' + p.shortDescription : (p.specs ? '. ' + p.specs : '')}`;
        } else if (post && post.title) {
          grounding = `related to the article "${post.title}"`;
        } else if (inputParams.promotion) {
          grounding = `for the promotion: "${inputParams.promotion}"`;
        } else if (inputParams.customPrompt) {
          grounding = inputParams.customPrompt;
        } else {
          grounding = 'for Pshop Music, a professional DJ and audio equipment store in Nha Trang, Vietnam';
        }
        return `${direction}, ${grounding}. Do not include any text, caption, watermark, or logo in the image.`;
      },
      mapToDraftContent(providerOutput, inputParams, context) {
        const p = context.product;
        const post = context.post;
        return {
          imageUrl: providerOutput.imageUrl || '', prompt: this.buildPrompt(inputParams, context),
          imageType: inputParams.imageType, style: inputParams.style || null, size: inputParams.size,
          sourceProductId: inputParams.productId || null, sourceProductName: (p && p.name) || null,
          sourceBlogPostId: inputParams.blogPostId || null, sourceBlogPostTitle: (post && post.title) || null, usedIn: []
        };
      }
    },

    'image-prompt-generator': {
      targetCollection: null,
      buildPrompt(inputParams) {
        return `Viết 1 prompt tiếng Anh chi tiết để tạo ảnh AI, chủ thể: "${inputParams.subject}", phong cách: ${inputParams.style || 'Ảnh sản phẩm studio'}. Mô tả rõ bố cục, ánh sáng, góc máy.`;
      },
      mapToDraftContent(providerOutput) { return { imagePrompt: providerOutput.text || '' }; }
    },

    'slider-generator': {
      targetCollection: 'siteContent.heroSlides',
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
        const media = context.media || [];
        return {
          image: media[0] || '', title: lines[0] || p.name || '', subtitle: lines[1] || '',
          link: p.category ? `category.html?cat=${p.category}` : '', ctaText: inputParams.ctaStyle || 'Xem chi tiết',
          imagePrompt: lines[2] || ''
        };
      }
    },

    'faq-generator': {
      targetCollection: 'blogPosts',
      buildPrompt(inputParams) {
        return `Tạo ${inputParams.questionCount || '5'} câu hỏi thường gặp (FAQ) bằng tiếng Việt về chủ đề "${inputParams.topic}", mỗi câu hỏi kèm câu trả lời ngắn gọn. Trả về dòng đầu là tiêu đề bài viết, các dòng sau là nội dung HTML dùng <h3> cho câu hỏi và <p> cho câu trả lời.`;
      },
      mapToDraftContent(providerOutput, inputParams) {
        const lines = (providerOutput.text || '').split('\n').filter(Boolean);
        return {
          title: lines[0] || inputParams.topic, slug: '', excerpt: `Câu hỏi thường gặp: ${inputParams.topic}`, coverImage: '',
          author: 'Pshop Music', tags: ['faq'], status: 'draft', seoTitle: '', seoDescription: '',
          contentHtml: lines.slice(1).join('\n')
        };
      }
    }
  };

  return { MODULES, parseJsonResponse, stripCodeFence, escapeHtml, getYoutubeEmbedUrl, productCategoryLabels };
});
