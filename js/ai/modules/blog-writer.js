/*
 * Blog Writer — sinh 1 bài blog mới (draft) dựa trên chủ đề người dùng nhập.
 * Publish sẽ gọi BlogDB.add() có sẵn trong js/cms-db.js.
 */
AIModuleRegistry.register({
  id: 'blog-writer',
  label: 'Blog Writer',
  description: 'Viết bài blog mới theo chủ đề, tự tạo slug + mô tả ngắn.',
  targetCollection: 'blogPosts',

  inputFields: [
    { key: 'topic', label: 'Chủ đề bài viết', type: 'text', placeholder: 'VD: Cách chọn loa kiểm âm cho phòng thu tại nhà' },
    { key: 'tone', label: 'Văn phong', type: 'select', options: ['Chuyên nghiệp', 'Thân thiện', 'Hài hước'] },
    { key: 'keywords', label: 'Từ khóa SEO (phân tách bằng dấu phẩy)', type: 'text', placeholder: 'loa kiểm âm, phòng thu tại nhà' }
  ],

  loadContext() {
    // Không cần dữ liệu CMS bổ sung — chủ đề do người dùng cung cấp trực tiếp.
    return Promise.resolve({});
  },

  buildPrompt(inputParams) {
    return `Viết 1 bài blog bằng tiếng Việt, văn phong ${inputParams.tone || 'Chuyên nghiệp'}, chủ đề: "${inputParams.topic}". Từ khóa SEO cần lồng ghép: ${inputParams.keywords || '(không có)'}. Trả về: dòng đầu tiên là tiêu đề, dòng thứ hai là mô tả ngắn 1-2 câu, các dòng sau là nội dung đầy đủ dạng HTML (dùng <h2>, <p>).`;
  },

  mapToDraftContent(providerOutput, inputParams) {
    const lines = (providerOutput.text || '').split('\n').filter(Boolean);
    const title = lines[0] || inputParams.topic;
    const excerpt = lines[1] || '';
    const contentHtml = lines.slice(2).join('\n');
    return {
      title,
      slug: '',
      excerpt,
      coverImage: '',
      author: 'Pshop Music',
      tags: (inputParams.keywords || '').split(',').map(t => t.trim()).filter(Boolean),
      status: 'draft',
      seoTitle: '',
      seoDescription: '',
      contentHtml
    };
  }
});
