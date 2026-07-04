/*
 * Registry cho AI Action Module (Blog Writer, SEO Generator, ...). Mỗi
 * module là 1 file riêng trong js/ai/modules/*.js, tự gọi register() —
 * thêm/gỡ module không cần sửa file này hay bất kỳ file nào khác.
 *
 * Shape 1 module:
 * {
 *   id, label, description,
 *   targetCollection: 'blogPosts'|'products'|'banners'|'siteContent.heroSlides'|null,
 *     // null = module chỉ sinh nội dung tham khảo (vd Facebook Post, Image
 *     // Prompt), không có nơi publish trực tiếp vào CMS.
 *   inputFields: [{ key, label, type: 'text'|'textarea'|'select'|'productSelect', options?, placeholder? }],
 *   loadContext(inputParams) -> Promise<object>   // đọc dữ liệu CMS thật liên quan (không bịa)
 *   buildPrompt(inputParams, context) -> string
 *   mapToDraftContent(providerOutput, inputParams, context) -> object  // khớp shape targetCollection
 * }
 */
const AIModuleRegistry = (function () {
  const modules = {};

  function register(module) {
    if (!module || !module.id) throw new Error('Module phải có "id"');
    modules[module.id] = module;
  }

  function get(id) {
    return modules[id] || null;
  }

  function getAll() {
    return Object.values(modules);
  }

  return { register, get, getAll };
})();
