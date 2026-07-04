/*
 * Blog Manager (admin/blog.html) — CRUD over "blogPosts" node (BlogDB).
 * Public site reads only status:"published" posts (js/blog-list.js,
 * js/blog-post.js) so drafts stay invisible until published.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'blog', title: 'QUẢN LÝ BLOG' }).then(load);

  let posts = [];
  let editingId = null;
  let quill = null;
  let slugManuallyEdited = false;

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function slugify(str) {
    return String(str || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function load() {
    BlogDB.getAll().then(list => {
      posts = list.slice().sort((a, b) => (b.publishedAt || b.createdAt || 0) - (a.publishedAt || a.createdAt || 0));
      render();
    });
  }

  function render() {
    document.getElementById('blogTotal').textContent = posts.length;
    const body = document.getElementById('blogTableBody');
    if (!posts.length) {
      body.innerHTML = '<tr><td colspan="5" style="color:var(--ink-mute);text-align:center;padding:2rem">Chưa có bài viết nào.</td></tr>';
      return;
    }
    body.innerHTML = posts.map(p => `
      <tr>
        <td>${p.coverImage ? `<img src="${escapeHtml(p.coverImage)}" onerror="this.style.display='none'">` : '—'}</td>
        <td>${escapeHtml(p.title)}<br><span class="small-muted">/blog-post.html?slug=${escapeHtml(p.slug)}</span></td>
        <td>${escapeHtml(p.author || '')}</td>
        <td>${p.status === 'published' ? 'Đã đăng' : '<span style="color:var(--ink-mute)">Bản nháp</span>'}</td>
        <td>
          <div class="row-actions">
            <button class="link-btn" onclick="AdminBlog.edit('${p.id}')">Sửa</button>
            <button class="btn-danger" onclick="AdminBlog.remove('${p.id}')">Xóa</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function edit(id) {
    const p = posts.find(x => x.id === id);
    if (!p) return;
    editingId = id;
    slugManuallyEdited = true;
    document.getElementById('postTitle').value = p.title || '';
    document.getElementById('postSlug').value = p.slug || '';
    document.getElementById('postExcerpt').value = p.excerpt || '';
    document.getElementById('postCover').value = p.coverImage || '';
    document.getElementById('postAuthor').value = p.author || 'Pshop Music';
    document.getElementById('postTags').value = (p.tags || []).join(', ');
    document.getElementById('postStatus').value = p.status || 'draft';
    document.getElementById('postSeoTitle').value = p.seoTitle || '';
    document.getElementById('postSeoDescription').value = p.seoDescription || '';
    if (quill) quill.root.innerHTML = p.contentHtml || '';
    document.getElementById('blogFormTitle').textContent = 'SỬA BÀI VIẾT';
    document.getElementById('blogSaveBtn').textContent = 'CẬP NHẬT BÀI VIẾT';
    document.getElementById('blogFormPanel').scrollIntoView({ behavior: 'smooth' });
  }

  function resetForm() {
    editingId = null;
    slugManuallyEdited = false;
    ['postTitle', 'postSlug', 'postExcerpt', 'postCover', 'postTags', 'postSeoTitle', 'postSeoDescription'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('postAuthor').value = 'Pshop Music';
    document.getElementById('postStatus').value = 'draft';
    if (quill) quill.setText('');
    document.getElementById('blogFormTitle').textContent = 'THÊM BÀI VIẾT MỚI';
    document.getElementById('blogSaveBtn').textContent = 'LƯU BÀI VIẾT';
  }

  function save() {
    const title = document.getElementById('postTitle').value.trim();
    if (!title) { alert('Vui lòng nhập tiêu đề bài viết.'); return; }
    let slug = document.getElementById('postSlug').value.trim() || slugify(title);
    slug = slugify(slug);
    const duplicate = posts.find(p => p.slug === slug && p.id !== editingId);
    if (duplicate) { alert('Slug này đã được dùng cho bài viết khác — vui lòng đổi slug.'); return; }

    const data = {
      title,
      slug,
      excerpt: document.getElementById('postExcerpt').value.trim(),
      coverImage: document.getElementById('postCover').value.trim(),
      author: document.getElementById('postAuthor').value.trim() || 'Pshop Music',
      tags: document.getElementById('postTags').value.split(',').map(t => t.trim()).filter(Boolean),
      status: document.getElementById('postStatus').value,
      seoTitle: document.getElementById('postSeoTitle').value.trim(),
      seoDescription: document.getElementById('postSeoDescription').value.trim(),
      contentHtml: quill ? quill.root.innerHTML : '',
      updatedAt: Date.now()
    };
    if (data.status === 'published' && !(editingId && posts.find(p => p.id === editingId).publishedAt)) {
      data.publishedAt = Date.now();
    }

    const action = editingId ? BlogDB.update(editingId, data) : BlogDB.add(data);
    action.then(() => {
      showStatus(editingId ? 'Đã cập nhật bài viết.' : 'Đã thêm bài viết mới.');
      resetForm();
      load();
    });
  }

  function remove(id) {
    const p = posts.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Xóa bài viết "${p.title}"?`)) return;
    BlogDB.remove(id).then(load);
  }

  function showStatus(msg) {
    const el = document.getElementById('blogStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  document.getElementById('blogSaveBtn').addEventListener('click', save);
  document.getElementById('blogResetBtn').addEventListener('click', resetForm);
  document.getElementById('postTitle').addEventListener('input', e => {
    if (!slugManuallyEdited) document.getElementById('postSlug').value = slugify(e.target.value);
  });
  document.getElementById('postSlug').addEventListener('input', () => { slugManuallyEdited = true; });

  StorageUpload.attachUploadInput(
    document.getElementById('postCoverUpload'),
    document.getElementById('postCoverUploadStatus'),
    'blog',
    url => { document.getElementById('postCover').value = url; }
  );

  if (typeof Quill !== 'undefined') {
    quill = new Quill('#postContentEditor', {
      theme: 'snow',
      placeholder: 'Nội dung đầy đủ của bài viết...',
      modules: {
        toolbar: [
          [{ header: [2, 3, false] }],
          ['bold', 'italic', 'underline'],
          [{ color: [] }, { background: [] }],
          [{ align: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['image', 'link'],
          ['clean']
        ]
      }
    });
  }

  window.AdminBlog = { edit, remove };
});
