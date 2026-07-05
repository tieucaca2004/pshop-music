/*
 * Facebook Post Generator — sinh nội dung bài đăng Facebook để copy thủ
 * công. targetCollection = null vì không có nơi publish trực tiếp trong
 * CMS — draft chỉ dùng để xem/copy trong admin/ai/drafts.html.
 */
AIModuleRegistry.register({
  id: 'facebook-post-generator',
  label: 'Facebook Post Generator',
  description: 'Tạo nội dung bài đăng Facebook quảng bá sản phẩm/sự kiện (chỉ để copy, không tự đăng).',
  targetCollection: null,

  inputFields: [
    { key: 'productId', label: 'Sản phẩm liên quan (không bắt buộc)', type: 'productSelect', optional: true },
    { key: 'message', label: 'Nội dung chính muốn nhấn mạnh', type: 'textarea', placeholder: 'VD: Giảm giá 10% cuối tuần, hàng chính hãng bảo hành 12 tháng' }
  ],

  loadContext(inputParams) {
    if (!inputParams.productId) return Promise.resolve({});
    return DataProvider.getProduct(inputParams.productId).then(product => ({ product }));
  },

  buildPrompt(inputParams, context) {
    const p = context.product;
    const productLine = p ? `Sản phẩm: ${p.name} (${p.brand || ''}).` : '';
    return `Viết 1 bài đăng Facebook ngắn gọn, hấp dẫn bằng tiếng Việt cho Pshop Music (shop thiết bị DJ & âm thanh Nha Trang). ${productLine} Nội dung cần nhấn mạnh: ${inputParams.message}. Có kèm 2-3 hashtag liên quan cuối bài.`;
  },

  mapToDraftContent(providerOutput, inputParams) {
    return { postText: providerOutput.text || '' };
  }
});
