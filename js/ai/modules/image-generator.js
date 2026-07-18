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
 *
 * Refactored Sprint 15 Phase 2 (AI Architecture Consolidation, Option B —
 * approved by Founder): `buildPrompt()`/`mapToDraftContent()` (+
 * IMAGE_TYPE_DIRECTION/STYLE_DIRECTION) now live in
 * `AiModulesCore.MODULES['image-generator']` (js/ai/modules-core.js) — the
 * single source of truth also used verbatim by
 * `functions/shared/aiModules.js` server-side. Prompt wording/direction
 * tables did NOT change — only where the code physically lives.
 * `loadContext`/`inputFields` stay here (client-specific, uses DataProvider).
 */
AIModuleRegistry.register({
  id: 'image-generator',
  label: 'Image AI',
  description: 'Sinh ảnh marketing thật (Product Hero/Facebook/Banner/Blog Cover...) từ Sản phẩm, Khuyến mãi, Bài Blog, hoặc Prompt tự do — luôn dừng ở Draft để Founder chọn nơi dùng.',
  targetCollection: AiModulesCore.MODULES['image-generator'].targetCollection,

  inputFields: [
    { key: 'imageType', label: 'Loại ảnh', type: 'select', options: [
      'Product Hero Image', 'Facebook Post Image', 'Facebook Carousel Image',
      'Banner Image', 'Promotion Banner', 'Blog Cover Image', 'Blog Inline Image',
      'Category Background Image', 'Product Background Image'
    ] },
    { key: 'productId', label: 'Sản phẩm (chọn 1 trong 4: Sản phẩm / Khuyến mãi / Bài Blog / Prompt tự do)', type: 'productSelect', optional: true },
    { key: 'promotion', label: 'Khuyến mãi (nếu không chọn Sản phẩm/Blog/Prompt)', type: 'text', placeholder: 'VD: Giảm 15% dịp 30/4', optional: true },
    { key: 'blogPostId', label: 'Bài Blog (nếu không chọn Sản phẩm/Khuyến mãi/Prompt)', type: 'blogSelect', optional: true },
    { key: 'customPrompt', label: 'Mô tả ảnh tự do (nếu không chọn 3 nguồn trên)', type: 'text', placeholder: 'VD: Ảnh DJ đang chơi nhạc trên nền neon rực rỡ', optional: true },
    // style (Sprint 13, Product Image Presentation) — CHỈ có ý nghĩa với 2
    // loại "Background Image" mới, nhưng để optional cho MỌI imageType thay
    // vì thêm cơ chế field điều kiện mới (0 thay đổi UI render engine đã có,
    // Founder chỉ cần bỏ trống nếu không dùng loại ảnh nền).
    { key: 'style', label: 'Phong cách nền (chỉ áp dụng cho Category/Product Background Image)', type: 'select', options: ['Mặc định', 'Studio', 'Lifestyle', 'Dark', 'Light', 'Luxury', 'Minimal', 'Technology'], optional: true },
    { key: 'size', label: 'Kích thước', type: 'select', options: ['1:1', '4:5', '16:9'] }
  ],

  loadContext(inputParams) {
    if (inputParams.productId) return DataProvider.getProduct(inputParams.productId).then(product => ({ product }));
    if (inputParams.blogPostId) return DataProvider.getBlogPost(inputParams.blogPostId).then(post => ({ post }));
    return Promise.resolve({});
  },

  buildPrompt(inputParams, context) {
    return AiModulesCore.MODULES['image-generator'].buildPrompt(inputParams, context);
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    return AiModulesCore.MODULES['image-generator'].mapToDraftContent(providerOutput, inputParams, context);
  }
});
