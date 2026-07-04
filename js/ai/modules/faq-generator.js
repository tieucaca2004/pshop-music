/*
 * FAQ Generator — sinh 1 bài blog dạng hỏi-đáp (FAQ) mới theo chủ đề.
 * Publish sẽ gọi BlogDB.add() có sẵn, giống Blog Writer.
 */
AIModuleRegistry.register({
  id: 'faq-generator',
  label: 'FAQ Generator',
  description: 'Tạo bài viết dạng hỏi-đáp (FAQ) mới theo chủ đề hoặc nhóm sản phẩm.',
  targetCollection: 'blogPosts',

  inputFields: [
    { key: 'topic', label: 'Chủ đề FAQ', type: 'text', placeholder: 'VD: Câu hỏi thường gặp khi mua loa kiểm âm' },
    { key: 'questionCount', label: 'Số câu hỏi', type: 'select', options: ['5', '8', '10'] }
  ],

  loadContext() {
    return Promise.resolve({});
  },

  buildPrompt(inputParams) {
    return `Tạo ${inputParams.questionCount || '5'} câu hỏi thường gặp (FAQ) bằng tiếng Việt về chủ đề "${inputParams.topic}", mỗi câu hỏi kèm câu trả lời ngắn gọn. Trả về dòng đầu là tiêu đề bài viết, các dòng sau là nội dung HTML dùng <h3> cho câu hỏi và <p> cho câu trả lời.`;
  },

  mapToDraftContent(providerOutput, inputParams) {
    const lines = (providerOutput.text || '').split('\n').filter(Boolean);
    return {
      title: lines[0] || inputParams.topic,
      slug: '',
      excerpt: `Câu hỏi thường gặp: ${inputParams.topic}`,
      coverImage: '',
      author: 'Pshop Music',
      tags: ['faq'],
      status: 'draft',
      seoTitle: '',
      seoDescription: '',
      contentHtml: lines.slice(1).join('\n')
    };
  }
});
