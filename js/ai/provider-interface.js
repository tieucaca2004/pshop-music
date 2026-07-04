/*
 * Hợp đồng chung (contract) mọi AI Provider phải tuân theo — cho phép đổi
 * nhà cung cấp AI (OpenAI/Claude/Gemini/DeepSeek/khác) mà không phải sửa
 * Workflow, Job Queue hay giao diện Admin.
 *
 * Một Provider hợp lệ là 1 object có đúng shape:
 * {
 *   id: 'openai',                 // khớp với key trong aiProviderConfig.providers
 *   label: 'OpenAI',
 *   isConfigured(config) -> boolean,
 *   generate({ moduleId, prompt, params, config }) -> Promise<{ text, raw }>
 * }
 *
 * generate() phải luôn trả về Promise — resolve khi có kết quả, hoặc reject
 * với Error khi thất bại/chưa cấu hình. AIJobQueue (js/ai/job-queue.js) chỉ
 * gọi qua AIProviderRegistry.getActive(), không bao giờ gọi thẳng 1 provider
 * cụ thể — nhờ vậy thêm/bớt/đổi provider không ảnh hưởng phần còn lại.
 */
function createProviderNotConfiguredError(providerLabel) {
  return new Error(`Nhà cung cấp AI "${providerLabel}" chưa được cấu hình API thật. Đây là bản thiết kế kiến trúc — xem admin/ai/providers.html và Roadmap trong README.md.`);
}
