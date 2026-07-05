/*
 * IAIProvider — hợp đồng chung DUY NHẤT mọi AI Provider phải tuân theo, cho
 * phép đổi nhà cung cấp AI (OpenAI/Claude/Gemini/DeepSeek/khác) mà KHÔNG
 * phải sửa UI, Workflow, AI Plugin, hay Job Queue.
 *
 * Một Provider hợp lệ là 1 object có đúng shape — chỉ 3 phương thức, không
 * thêm phương thức nào khác:
 * {
 *   id: 'openai',                 // khớp với key trong aiProviderConfig.providers
 *   label: 'OpenAI',
 *
 *   generate({ moduleId, prompt, params, config }) -> Promise<{ text, raw }>
 *     // Gọi AI thật. OpenAI (Sprint 3): đã tích hợp thật qua Cloud Function
 *     // Proxy — xem js/ai/providers/openai.js. Claude/Gemini/DeepSeek: vẫn
 *     // là stub, luôn reject vì chưa tích hợp API.
 *
 *   validate(config) -> { valid: boolean, reason: string }
 *     // Kiểm tra provider đã đủ điều kiện dùng chưa (đã bật, đủ cấu hình...)
 *     // TRƯỚC khi gọi generate() — không gọi thử API thật.
 *
 *   health() -> Promise<{ healthy: boolean, message: string }>
 *     // Kiểm tra kết nối/tình trạng provider hiện tại (vd ping thử API).
 *     // OpenAI: gọi Cloud Function Proxy để kiểm tra thật. Claude/Gemini/
 *     // DeepSeek: vẫn luôn trả healthy:false vì chưa tích hợp API thật.
 * }
 *
 * AI Plugin (js/ai/modules/*.js) KHÔNG BAO GIỜ gọi thẳng 1 provider cụ thể
 * và không biết provider nào đang chạy — chỉ AIJobQueue (js/ai/job-queue.js)
 * mới được gọi qua AIProviderRegistry (Provider Manager, js/ai/
 * provider-registry.js) để lấy provider đang active. Đổi provider chỉ đổi
 * cấu hình trong admin/ai/providers.html hoặc admin/ai/plugins.html.
 */
function createProviderNotConfiguredError(providerLabel) {
  return new Error(`Nhà cung cấp AI "${providerLabel}" chưa được cấu hình API thật. Đây là bản thiết kế kiến trúc — xem admin/ai/providers.html và Roadmap trong README.md.`);
}
