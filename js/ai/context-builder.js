/*
 * ContextBuilder — Sprint 7 Requirement #3 (AI Context Foundation). Lớp
 * Context DÙNG CHUNG cho AI Framework, đứng giữa DataProvider (Sprint 2
 * Requirement #3, cổng đọc CMS thật DUY NHẤT — không sửa file đó) và AI
 * Provider — đóng gói dữ liệu đã đọc thành 1 "Context Package" chuẩn hoá,
 * sẵn sàng đưa vào Prompt trước khi gọi AI Provider.
 *
 * Luồng: User -> Context Builder -> Existing Data (DataProvider) -> Context
 * Package -> AI Provider.
 *
 * Phạm vi CHỈ dừng ở đây:
 * - KHÔNG triển khai Memory dài hạn: build() là hàm THUẦN ĐỌC, không ghi vào
 *   bất kỳ Database/collection nào, không cache giữa các lần gọi — mỗi lần
 *   build() là 1 lượt đọc mới hoàn toàn từ DataProvider.
 * - KHÔNG triển khai RAG: không tìm kiếm ngữ nghĩa/vector, chỉ đọc trực tiếp
 *   theo id có sẵn trong inputParams (productId/postId), giống hệt cách
 *   từng module Sprint 2-6 đã tự làm trong loadContext() của mình.
 * - KHÔNG tạo Collection/Field mới trong Firebase.
 *
 * Sprint 2-6 + Requirement #1/#2 KHÔNG đổi cách hoạt động: mỗi module trong
 * js/ai/modules/*.js vẫn tự loadContext() riêng như cũ, job-queue.js không
 * gọi tới file này. ContextBuilder là nền tảng CHUNG, SẴN SÀNG cho Plugin
 * tương lai muốn dùng (opt-in, gọi trực tiếp build() giống hệt cách gọi
 * DataProvider) — không bắt buộc module cũ phải đổi theo (đúng "Không
 * Refactor Sprint 2-6").
 */
const ContextBuilder = (function () {
  // Thu thập dữ liệu hiện có liên quan tới inputParams, qua đúng
  // DataProvider (không gọi thẳng DB/BlogDB/...). Mỗi nguồn tự bắt lỗi/rỗng
  // riêng — 1 nguồn thiếu/lỗi không làm hỏng cả Context Package (Functional
  // Requirement #6 "thiếu Context vẫn hoạt động bình thường").
  function collect(inputParams) {
    const missing = [];
    const tasks = [];

    if (inputParams.productId) {
      tasks.push(
        DataProvider.getProduct(inputParams.productId)
          .catch(() => null)
          .then(product => {
            if (!product) missing.push('product');
            return ['product', product];
          })
      );
      tasks.push(
        DataProvider.getMedia(inputParams.productId)
          .catch(() => [])
          .then(media => ['media', media || []])
      );
    }

    if (inputParams.postId) {
      tasks.push(
        DataProvider.getBlogPost(inputParams.postId)
          .catch(() => null)
          .then(post => {
            if (!post) missing.push('post');
            return ['post', post];
          })
      );
    }

    // Settings là ngữ cảnh nền tảng chung (tên site, liên hệ...) — luôn thử
    // đọc bất kể inputParams, vì hữu ích cho mọi loại Prompt trong tương lai.
    tasks.push(
      DataProvider.getSettings()
        .catch(() => { missing.push('settings'); return {}; })
        .then(settings => ['settings', settings || {}])
    );

    return Promise.all(tasks).then(pairs => {
      const data = {};
      pairs.forEach(pair => { data[pair[0]] = pair[1]; });
      return { data, missing };
    });
  }

  // build(moduleId, inputParams) -> Promise<ContextPackage>. KHÔNG BAO GIỜ
  // reject — mọi lỗi đọc từng phần đã bắt ở collect(); lỗi ngoài dự kiến (vd
  // DataProvider chưa được nạp script) vẫn trả về Context Package rỗng thay
  // vì throw, đúng Functional Requirement #6.
  function build(moduleId, inputParams) {
    if (typeof DataProvider === 'undefined') {
      return Promise.resolve({
        moduleId: moduleId || null, builtAt: Date.now(), data: {}, missing: ['data-provider-unavailable']
      });
    }
    return collect(inputParams || {})
      .then(({ data, missing }) => ({ moduleId: moduleId || null, builtAt: Date.now(), data, missing }))
      .catch(() => ({ moduleId: moduleId || null, builtAt: Date.now(), data: {}, missing: ['build-error'] }));
  }

  // toPromptText(contextPackage) -> string. Định dạng Context Package thành
  // 1 đoạn text đơn giản — CHỨNG MINH Context Package tương thích để ghép
  // vào tham số `prompt` (string) mà IAIProvider.generate({prompt}) chấp
  // nhận (xem js/ai/provider-interface.js). Hàm này KHÔNG tự gọi
  // AIProviderRegistry/provider.generate() — việc chọn Provider và gọi AI
  // thật vẫn CHỈ thuộc về AIJobQueue (AI_RULES.md mục 6), ContextBuilder chỉ
  // dừng ở bước đóng gói Context.
  function toPromptText(contextPackage) {
    if (!contextPackage || !contextPackage.data) return '';
    const d = contextPackage.data;
    const lines = [];
    if (d.product) {
      lines.push(`Sản phẩm có sẵn: ${d.product.name || ''}${d.product.brand ? ' (' + d.product.brand + ')' : ''}.`);
    }
    if (d.media && d.media.length) lines.push(`Ảnh sản phẩm có sẵn: ${d.media.length} ảnh.`);
    if (d.post) lines.push(`Bài viết có sẵn: ${d.post.title || ''}.`);
    if (d.settings && d.settings.siteName) lines.push(`Website: ${d.settings.siteName}.`);
    return lines.join(' ');
  }

  return { build, toPromptText };
})();
