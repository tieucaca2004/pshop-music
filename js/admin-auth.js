/*
 * Shared Firebase Auth guard + sidebar/topbar chrome for every /admin/*.html
 * page. Requires firebase-auth-compat.js + firebase-database-compat.js +
 * js/firebase-config.js loaded before this file. Each admin page must include
 * an empty <aside id="adminSidebar"></aside> and <div id="adminTopbar"></div>
 * — this script fills them in once the user's role is confirmed.
 */
// Href dùng đường dẫn tuyệt đối từ gốc site (/admin/...) — bắt buộc vì sidebar
// này còn được dùng lại ở admin/ai/*.html (lồng sâu hơn 1 cấp thư mục), href
// tương đối sẽ bị sai đường dẫn nếu render từ thư mục con.
const ADMIN_NAV = [
  { key: 'dashboard', label: 'Dashboard', href: '/admin/index.html', icon: '&#9776;' },
  { key: 'products', label: 'Sản phẩm', href: '/admin/products.html', icon: '&#127925;' },
  { key: 'categories', label: 'Danh mục', href: '/admin/categories.html', icon: '&#128193;' },
  { key: 'banners', label: 'Banner', href: '/admin/banners.html', icon: '&#128247;' },
  { key: 'sliders', label: 'Slider', href: '/admin/sliders.html', icon: '&#127909;' },
  { key: 'blog', label: 'Blog', href: '/admin/blog.html', icon: '&#128221;' },
  { key: 'videos', label: 'Video', href: '/admin/videos.html', icon: '&#127916;' },
  { key: 'ai-assistant', label: 'Trợ lý AI', href: '/admin/ai/assistant.html', icon: '&#129302;' },
  { key: 'ai', label: 'AI Assistant', href: '/admin/ai/index.html', icon: '&#129302;' },
  { key: 'menu', label: 'Menu', href: '/admin/menu.html', icon: '&#9776;', role: 'admin' },
  { key: 'footer', label: 'Footer', href: '/admin/footer.html', icon: '&#11015;', role: 'admin' },
  { key: 'seo', label: 'SEO', href: '/admin/seo.html', icon: '&#128269;', role: 'admin' },
  { key: 'settings', label: 'Cài đặt', href: '/admin/settings.html', icon: '&#9881;', role: 'admin' },
  { key: 'users', label: 'Người dùng', href: '/admin/users.html', icon: '&#128100;', role: 'admin' }
];

const AdminAuth = (function () {
  let currentUser = null;
  let currentRole = null;
  let currentName = '';

  function rolesRef(uid) {
    return firebase.database().ref('roles/' + uid);
  }

  function renderShell(activePage, pageTitle) {
    const sidebar = document.getElementById('adminSidebar');
    const topbar = document.getElementById('adminTopbar');
    if (sidebar) {
      const items = ADMIN_NAV.filter(i => !i.role || currentRole === 'admin');
      sidebar.innerHTML = `
        <div class="admin-brand">P<span>·</span>SHOP <span>ADMIN</span></div>
        <nav class="admin-nav">${items.map(i => `<a class="admin-nav-item${i.key === activePage ? ' active' : ''}" href="${i.href}"><span class="admin-nav-icon">${i.icon}</span>${i.label}</a>`).join('')}</nav>
      `;
    }
    if (topbar) {
      topbar.innerHTML = `
        <div class="admin-topbar-title">${pageTitle || ''}</div>
        <div class="admin-topbar-actions">
          <a href="/index.html" class="btn-secondary" target="_blank" style="text-decoration:none;display:inline-block">XEM WEBSITE</a>
          <span class="admin-user">${currentName || (currentUser ? currentUser.email : '')} <span class="admin-role-badge admin-role-${currentRole}">${currentRole === 'admin' ? 'ADMIN' : 'EDITOR'}</span></span>
          <button class="btn-secondary" onclick="AdminAuth.logout()">ĐĂNG XUẤT</button>
        </div>
      `;
    }
  }

  function init(options) {
    options = options || {};
    return new Promise((resolve, reject) => {
      firebase.auth().onAuthStateChanged(user => {
        if (!user) {
          location.href = '/admin/login.html';
          return;
        }
        rolesRef(user.uid).once('value').then(snap => {
          const roleData = snap.val();
          if (!roleData) {
            firebase.auth().signOut().then(() => { location.href = '/admin/login.html?denied=1'; });
            return;
          }
          currentUser = user;
          currentRole = roleData.role;
          currentName = roleData.name || '';
          if (options.requiredRole && options.requiredRole !== currentRole && currentRole !== 'admin') {
            alert('Bạn không có quyền truy cập trang này.');
            location.href = '/admin/index.html';
            return;
          }
          renderShell(options.page, options.title);
          resolve({ user, role: currentRole, name: currentName });
        }).catch(reject);
      });
    });
  }

  function logout() {
    firebase.auth().signOut().then(() => { location.href = '/admin/login.html'; });
  }

  return {
    init,
    logout,
    getRole() { return currentRole; },
    getUser() { return currentUser; }
  };
})();
