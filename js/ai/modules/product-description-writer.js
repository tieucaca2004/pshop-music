/*
 * Product Description Generator (Sprint 2 — plugin chính thức #1) — sinh mô
 * tả chi tiết CHUẨN SEO cho 1 sản phẩm CÓ SẴN. Đọc đúng dữ liệu sản phẩm
 * thật qua DB.get() (js/db.js) làm căn cứ, không bịa thông số. Publish sẽ
 * gọi DB.update(targetId, {description}) có sẵn.
 */
AIModuleRegistry.register({
  id: 'product-description-writer',
  label: 'Product Description Generator',
  description: 'Sinh mô tả chi tiết chuẩn SEO cho 1 sản phẩm đã có trong Product Manager.',
  targetCollection: 'products',

  inputFields: [
    { key: 'productId', label: 'Chọn sản phẩm', type: 'productSelect' },
    { key: 'tone', label: 'Văn phong', type: 'select', options: ['Chuyên nghiệp', 'Thân thiện', 'Nhấn mạnh khuyến mãi'] }
  ],

  loadContext(inputParams) {
    if (typeof DB === 'undefined' || !inputParams.productId) return Promise.resolve({});
    return DB.get(inputParams.productId).then(product => ({ product }));
  },

  buildPrompt(inputParams, context) {
    const p = context.product || {};
    return `Viết mô tả chi tiết CHUẨN SEO (HTML, dùng <p>/<ul>) bằng tiếng Việt cho sản phẩm sau, văn phong ${inputParams.tone || 'Chuyên nghiệp'}. Lồng ghép tự nhiên tên sản phẩm và thương hiệu như từ khóa SEO, không nhồi nhét. CHỈ dùng đúng thông tin dưới đây, không bịa thêm thông số: Tên: ${p.name || ''}. Thương hiệu: ${p.brand || ''}. Thông số: ${p.specs || ''}. Danh mục: ${p.categoryLabel || p.category || ''}.`;
  },

  mapToDraftContent(providerOutput, inputParams, context) {
    return {
      description: providerOutput.text || '',
      _productName: (context.product && context.product.name) || inputParams.productId
    };
  }
});
