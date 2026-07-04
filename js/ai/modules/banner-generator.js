/*
 * Banner Generator — sinh nội dung 1 banner quảng cáo mới. Publish sẽ gọi
 * BannerDB.add() có sẵn trong js/cms-db.js.
 */
AIModuleRegistry.register({
  id: 'banner-generator',
  label: 'Banner Generator',
  description: 'Tạo nội dung banner quảng cáo mới (tiêu đề nội bộ + gợi ý link).',
  targetCollection: 'banners',

  inputFields: [
    { key: 'theme', label: 'Chủ đề banner', type: 'text', placeholder: 'VD: Giảm giá tai nghe DJ tháng 7' },
    { key: 'link', label: 'Link khi bấm vào banner', type: 'text', placeholder: 'category.html?cat=tainghe' }
  ],

  loadContext() {
    return Promise.resolve({});
  },

  buildPrompt(inputParams) {
    return `Viết 1 dòng tiêu đề nội bộ ngắn gọn (không hiển thị công khai, chỉ để admin dễ nhận diện) cho banner quảng cáo chủ đề: "${inputParams.theme}".`;
  },

  mapToDraftContent(providerOutput, inputParams) {
    return {
      title: (providerOutput.text || inputParams.theme || '').split('\n')[0],
      image: '',
      link: inputParams.link || '',
      zone: 'home-top',
      order: 0,
      active: true
    };
  }
});
