/*
 * Image Prompt Generator — sinh prompt mô tả ảnh (để dán vào công cụ tạo
 * ảnh AI khác). targetCollection = null — chỉ tạo văn bản tham khảo.
 */
AIModuleRegistry.register({
  id: 'image-prompt-generator',
  label: 'Image Prompt Generator',
  description: 'Tạo prompt mô tả ảnh chi tiết để dùng với công cụ tạo ảnh AI khác.',
  targetCollection: null,

  inputFields: [
    { key: 'subject', label: 'Chủ thể ảnh', type: 'text', placeholder: 'VD: Loa kiểm âm KRK đặt trên bàn DJ, ánh sáng studio' },
    { key: 'style', label: 'Phong cách hình ảnh', type: 'select', options: ['Ảnh sản phẩm studio', 'Chụp đời thực (lifestyle)', 'Poster quảng cáo'] }
  ],

  loadContext() {
    return Promise.resolve({});
  },

  buildPrompt(inputParams) {
    return `Viết 1 prompt tiếng Anh chi tiết để tạo ảnh AI, chủ thể: "${inputParams.subject}", phong cách: ${inputParams.style || 'Ảnh sản phẩm studio'}. Mô tả rõ bố cục, ánh sáng, góc máy.`;
  },

  mapToDraftContent(providerOutput) {
    return { imagePrompt: providerOutput.text || '' };
  }
});
