/*
 * Image AI (Sprint 12 Requirement #11) — sinh ẢNH THẬT (không phải prompt mô
 * tả ảnh như `image-prompt-generator` cũ, Sprint 6 Requirement #4, vẫn giữ
 * nguyên không đổi) cho 7 loại ảnh marketing: Product Hero/Facebook Post/
 * Facebook Carousel/Banner/Promotion Banner/Blog Cover/Blog Inline.
 *
 * Tái sử dụng NGUYÊN VẸN Plugin Framework/Queue/Provider Manager/Draft System
 * đã có — 0 sửa đổi 3 file đó. Điểm khác biệt DUY NHẤT so với Plugin văn bản:
 * `provider.generate()` (js/ai/providers/openai.js) tự nhận diện
 * `moduleId === 'image-generator'` để gọi nhánh Images API thay vì Chat
 * Completions — Queue coi kết quả trả về là hộp đen như mọi Plugin khác,
 * không cần biết/không cần sửa gì.
 *
 * Founder chọn ĐÚNG 1 trong 4 nguồn (Product/Promotion/Blog Article/Custom
 * Prompt, cùng pattern "1-trong-N field tuỳ chọn" đã dùng ở Facebook AI V3/
 * Banner AI V2) — Product Mode tự động nạp Tên/Thương hiệu/Danh mục/Mô tả/
 * Ảnh có sẵn làm ngữ cảnh thật cho AI, không bịa thông tin sản phẩm.
 *
 * targetCollection = null — ảnh sinh ra không có 1 đích Publish cố định duy
 * nhất (Founder có thể chọn Product Gallery HOẶC Featured Image HOẶC Blog
 * Cover HOẶC Banner sau khi xem Draft) — các hành động "Save to..." nằm ở
 * Experience Layer (js/admin-image-ai.js), gọi thẳng DB/BlogDB/BannerDB đã có
 * (tái sử dụng Product Management/Blog/Banner data layer, không viết lại).
 */
AIModuleRegistry.register({
  id: 'image-generator',
  label: 'Image AI',
  description: 'Sinh ảnh marketing thật (Product Hero/Facebook/Banner/Blog Cover...) từ Sản phẩm, Khuyến mãi, Bài Blog, hoặc Prompt tự do — luôn dừng ở Draft để Founder chọn nơi dùng.',
  targetCollection: null,

  inputFields: [
    { key: 'imageType', label: 'Loại ảnh', type: 'select', options: [
      'Product Hero Image', 'Facebook Post Image', 'Facebook Carousel Image',
      'Banner Image', 'Promotion Banner', 'Blog Cover Image', 'Blog Inline Image'
    ] },
    { key: 'productId', label: 'Sản phẩm (chọn 1 trong 4: Sản phẩm / Khuyến mãi / Bài Blog / Prompt tự do)', type: 'productSelect', optional: true },
    { key: 'promotion', label: 'Khuyến mãi (nếu không chọn Sản phẩm/Blog/Prompt)', type: 'text', placeholder: 'VD: Giảm 15% dịp 30/4', optional: true },
    { key: 'blogPostId', label: 'Bài Blog (nếu không chọn Sản phẩm/Khuyến mãi/Prompt)', type: 'blogSelect', optional: true },
    { key: 'customPrompt', label: 'Mô tả ảnh tự do (nếu không chọn 3 nguồn trên)', type: 'text', placeholder: 'VD: Ảnh DJ đang chơi nhạc trên nền neon rực rỡ', optional: true },
    { key: 'size', label: 'Kích thước', type: 'select', options: ['1:1', '4:5', '16:9'] }
  ],

  loadContext(inputParams) {
    if (inputParams.productId) return DataProvider.getProduct(inputParams.productId).then(product => ({ product }));
    if (inputParams.blogPostId) return DataProvider.getBlogPost(inputParams.blogPostId).then(post => ({ post }));
    return Promise.resolve({});
  },

  // Định hướng nhiếp ảnh/thiết kế riêng cho từng loại ảnh — KHÔNG do AI tự
  // quyết định phong cách, tránh 7 loại ảnh trông giống hệt nhau.
  IMAGE_TYPE_DIRECTION: {
    'Product Hero Image': 'professional studio product photography, clean neutral background, soft even studio lighting, centered composition, high detail',
    'Facebook Post Image': 'eye-catching square social media post image, vibrant colors, modern marketing style',
    'Facebook Carousel Image': 'clean modern e-commerce carousel image, consistent studio lighting, product-focused composition',
    'Banner Image': 'wide marketing banner background, bold and eye-catching, professional advertising style',
    'Promotion Banner': 'promotional sale banner background, energetic composition, bold contrasting colors',
    'Blog Cover Image': 'editorial blog cover image, professional magazine-style composition',
    'Blog Inline Image': 'illustrative supporting image for a blog article, clean and contextually relevant'
  },

  // buildPrompt() — chỉ dùng dữ liệu THẬT đọc được qua loadContext() (Product/
  // Blog) hoặc văn bản Founder tự gõ (Promotion/Custom Prompt) — không bịa
  // thêm chi tiết sản phẩm không có căn cứ. "Do not include any text..." vì
  // model sinh ảnh thường vẽ chữ bị lỗi/méo, không phải chữ thật dùng được.
  buildPrompt(inputParams, context) {
    const direction = this.IMAGE_TYPE_DIRECTION[inputParams.imageType] || 'professional marketing photography';
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
      imageUrl: providerOutput.imageUrl || '',
      prompt: this.buildPrompt(inputParams, context),
      imageType: inputParams.imageType,
      size: inputParams.size,
      sourceProductId: inputParams.productId || null,
      sourceProductName: (p && p.name) || null,
      sourceBlogPostId: inputParams.blogPostId || null,
      sourceBlogPostTitle: (post && post.title) || null,
      usedIn: []
    };
  }
});
