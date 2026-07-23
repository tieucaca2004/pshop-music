/*
 * Shared Firebase Auth guard + sidebar/topbar chrome for every /admin/*.html
 * page. Requires firebase-auth-compat.js + firebase-database-compat.js +
 * js/firebase-config.js loaded before this file. Each admin page must include
 * an empty <aside id="adminSidebar"></aside> and <div id="adminTopbar"></div>
 * — this script fills them in once the user's role is confirmed.
 *
 * Sprint 10.x — Smart CMS Completion: thêm Smart Mode ↔ Advanced Mode (chỉ
 * đổi DANH SÁCH nav hiển thị trong sidebar, KHÔNG đổi Permission/RBAC).
 * `ADMIN_NAV` (Advanced Mode) giữ NGUYÊN VẸN, không sửa/xoá mục nào —
 * "Advanced Mode hiển thị toàn bộ chức năng hiện có". `FOUNDER_SMART_NAV`
 * (Smart Mode) là 1 danh sách RIÊNG, tự chọn lọc theo đúng yêu cầu Vision
 * ("Founder chỉ nhìn thấy công việc cần làm") — không phải bản lọc từ
 * `ADMIN_NAV`, vì Smart Mode cố tình đưa lên sidebar vài lối tắt AI
 * (One Click Marketing/AI Content/AI Image/Marketing Drafts) mà Advanced
 * Mode xưa nay chỉ có ở dạng liên kết chéo bên trong `admin/ai/*.html`,
 * không có trong `ADMIN_NAV`.
 */
// Href dùng đường dẫn tuyệt đối từ gốc site (/admin/...) — bắt buộc vì sidebar
// này còn được dùng lại ở admin/ai/*.html (lồng sâu hơn 1 cấp thư mục), href
// tương đối sẽ bị sai đường dẫn nếu render từ thư mục con.
const ADMIN_NAV = [
  { key: 'founder-home', label: 'Trang chủ', href: '/admin/home.html', icon: '&#127968;' },
  { key: 'dashboard', label: 'Dashboard', href: '/admin/index.html', icon: '&#9776;' },
  { key: 'products', label: 'Sản phẩm', href: '/admin/products.html', icon: '&#127925;' },
  { key: 'categories', label: 'Danh mục', href: '/admin/categories.html', icon: '&#128193;' },
  { key: 'banners', label: 'Banner', href: '/admin/banners.html', icon: '&#128247;' },
  { key: 'sliders', label: 'Slider', href: '/admin/sliders.html', icon: '&#127909;' },
  { key: 'blog', label: 'Blog', href: '/admin/blog.html', icon: '&#128221;' },
  { key: 'videos', label: 'Video', href: '/admin/videos.html', icon: '&#127916;' },
  { key: 'atieu-menu', label: 'A Tiểu', href: '/admin/a-tieu/menu.html', icon: '&#127859;' },
  { key: 'media-library', label: 'Thư viện ảnh', href: '/admin/media-library.html', icon: '&#128444;' },
  { key: 'ai-assistant', label: 'Trợ lý AI', href: '/admin/ai/assistant.html', icon: '&#129302;' },
  { key: 'ai', label: 'Plugin AI (Thủ công)', href: '/admin/ai/index.html', icon: '&#129302;' },
  { key: 'ai-images', label: 'Image AI', href: '/admin/ai/images.html', icon: '&#128444;' },
  { key: 'founder-agent', label: 'Founder Agent', href: '/admin/ai/agent.html', icon: '&#129776;' },
  { key: 'social-media-center', label: 'Social Media Center', href: '/admin/social-media-center.html', icon: '&#128241;' },
  { key: 'menu', label: 'Menu', href: '/admin/menu.html', icon: '&#9776;', role: 'admin' },
  { key: 'footer', label: 'Footer', href: '/admin/footer.html', icon: '&#11015;', role: 'admin' },
  { key: 'seo', label: 'SEO', href: '/admin/seo.html', icon: '&#128269;', role: 'admin' },
  { key: 'settings', label: 'Cài đặt', href: '/admin/settings.html', icon: '&#9881;', role: 'admin' },
  { key: 'facebook-settings', label: 'Facebook Configuration', href: '/admin/facebook-settings.html', icon: '&#128288;', role: 'admin' },
  { key: 'users', label: 'Người dùng', href: '/admin/users.html', icon: '&#128100;', role: 'admin' }
];

// Smart Mode — ban đầu đúng 13 mục Requirement Sprint 10.x đã liệt kê, nay
// 14 mục sau khi thêm "Facebook Configuration" (Sprint 12, Facebook AI V5) —
// Founder PHẢI tự kết nối Facebook thật được từ Smart Mode, không chỉ
// Advanced Mode, nên đây là bổ sung có chủ đích theo đúng Requirement mới,
// không phải scope creep. Ẩn hoàn toàn Slider/Video/Menu/Footer/SEO/Người
// dùng/Trợ lý AI kỹ thuật và mọi trang Engineer-only (Queue/Workflow/Plugin
// Manager/Provider Manager/Cost/Observability/Context Builder — vốn dĩ chưa
// từng có trong sidebar, chỉ liên kết chéo nội bộ, nên "ẩn" ở đây nghĩa là
// KHÔNG thêm chúng vào danh sách này). "AI Content" vẫn trỏ
// `admin/ai/index.html` (Plugin Dashboard) — giới hạn đã ghi nhận ở Sprint 10
// Requirement #5 (Founder Home Quick Actions), chưa có trang Founder-friendly
// riêng cho nội dung văn bản. "AI Image" (Sprint 12 Requirement #11) ĐÃ có
// trang riêng thật (`admin/ai/images.html`) — không còn dùng chung Plugin
// Dashboard nữa. "AI Video" chưa có `href` (chưa có năng lực AI Video nào) —
// hiển thị dạng vô hiệu hoá, không phải liên kết giả.
const FOUNDER_SMART_NAV = [
  { key: 'founder-home', label: 'Trang chủ', href: '/admin/home.html', icon: '&#127968;' },
  { key: 'dashboard', label: 'Dashboard', href: '/admin/index.html', icon: '&#9776;' },
  { key: 'products', label: 'Sản phẩm', href: '/admin/products.html', icon: '&#127925;' },
  { key: 'categories', label: 'Danh mục', href: '/admin/categories.html', icon: '&#128193;' },
  { key: 'blog', label: 'Blog', href: '/admin/blog.html', icon: '&#128221;' },
  { key: 'banners', label: 'Banner', href: '/admin/banners.html', icon: '&#128247;' },
  { key: 'media-library', label: 'Thư viện ảnh', href: '/admin/media-library.html', icon: '&#128444;' },
  { key: 'ai-one-click-marketing', label: 'One Click Marketing', href: '/admin/ai/one-click-marketing.html', icon: '&#128640;' },
  { key: 'ai-content', label: 'AI Content', href: '/admin/ai/index.html', icon: '&#129302;' },
  { key: 'ai-image', label: 'AI Image', href: '/admin/ai/images.html', icon: '&#128444;' },
  { key: 'founder-agent', label: 'Founder Agent', href: '/admin/ai/agent.html', icon: '&#129776;' },
  { key: 'ai-video', label: 'AI Video (Sắp có)', href: null, icon: '&#127916;' },
  { key: 'marketing-drafts', label: 'Marketing Drafts', href: '/admin/ai/drafts.html', icon: '&#128203;' },
  { key: 'social-media-center', label: 'Social Media Center', href: '/admin/social-media-center.html', icon: '&#128241;' },
  { key: 'settings', label: 'Cài đặt', href: '/admin/settings.html', icon: '&#9881;', role: 'admin' },
  { key: 'facebook-settings', label: 'Facebook Configuration', href: '/admin/facebook-settings.html', icon: '&#128288;', role: 'admin' }
];

const UI_MODE_STORAGE_KEY = 'pshopAdminUiMode';

// Lựa chọn Smart/Advanced lưu ở localStorage — KHÔNG ghi Firebase (không
// đổi Database Structure, không cần Decision Record), cùng nguyên tắc "Lưu
// nháp" của One Click Marketing (Sprint 10 Requirement #3). Giới hạn đã
// biết: lựa chọn gắn theo TRÌNH DUYỆT, không theo tài khoản — đổi máy/trình
// duyệt khác sẽ về lại mặc định. Mặc định là Smart Mode (đúng Vision
// "Founder chỉ nhìn thấy công việc cần làm" — Advanced Mode là lựa chọn
// chủ động, không phải mặc định).
function getUiMode() {
  try {
    const stored = localStorage.getItem(UI_MODE_STORAGE_KEY);
    return (stored === 'advanced') ? 'advanced' : 'smart';
  } catch (e) {
    return 'smart';
  }
}

function setUiMode(mode) {
  try { localStorage.setItem(UI_MODE_STORAGE_KEY, mode); } catch (e) { /* localStorage không khả dụng - bỏ qua */ }
}

const AdminAuth = (function () {
  let currentUser = null;
  let currentRole = null;
  let currentName = '';
  let currentActivePage = null;
  let currentPageTitle = '';

  function rolesRef(uid) {
    return firebase.database().ref('roles/' + uid);
  }

  function navItemHtml(item, activePage) {
    if (!item.href) {
      // Muc chua co nang luc that (vd "AI Video") - hien dang vo hieu hoa,
      // khong phai lien ket gia.
      return `<span class="admin-nav-item" style="opacity:0.5;cursor:default"><span class="admin-nav-icon">${item.icon}</span>${item.label}</span>`;
    }
    return `<a class="admin-nav-item${item.key === activePage ? ' active' : ''}" href="${item.href}"><span class="admin-nav-icon">${item.icon}</span>${item.label}</a>`;
  }

  function renderShell(activePage, pageTitle) {
    currentActivePage = activePage;
    currentPageTitle = pageTitle;
    const sidebar = document.getElementById('adminSidebar');
    const topbar = document.getElementById('adminTopbar');
    const mode = getUiMode();
    const navSource = mode === 'advanced' ? ADMIN_NAV : FOUNDER_SMART_NAV;
    if (sidebar) {
      // Cung DUNG 1 dieu kien loc theo vai tro (!i.role || currentRole ===
      // 'admin') o CA HAI che do - Smart Mode chi doi DANH SACH nav hien
      // thi, KHONG bao gio bo qua RBAC da co (vd Editor van khong thay
      // "Cai dat" du o Smart hay Advanced Mode).
      const items = navSource.filter(i => !i.role || currentRole === 'admin' || currentRole === 'super_admin');
      sidebar.innerHTML = `
        <div class="admin-brand">P<span>·</span>SHOP <span>ADMIN</span></div>
        <nav class="admin-nav">${items.map(i => navItemHtml(i, activePage)).join('')}</nav>
      `;
    }
    if (topbar) {
      topbar.innerHTML = `
        <div class="admin-topbar-title">${pageTitle || ''}</div>
        <div class="admin-topbar-actions">
          <button class="btn-secondary" onclick="AdminAuth.toggleUiMode()">${mode === 'advanced' ? 'CHUYỂN SANG SMART MODE' : 'CHUYỂN SANG ADVANCED MODE'}</button>
          <a href="/index.html" class="btn-secondary" target="_blank" style="text-decoration:none;display:inline-block">XEM WEBSITE</a>
          <span class="admin-user">${currentName || (currentUser ? currentUser.email : '')} <span class="admin-role-badge admin-role-${currentRole}">${currentRole === 'super_admin' ? 'SUPER ADMIN' : (currentRole === 'admin' ? 'ADMIN' : 'EDITOR')}</span></span>
          <button class="btn-secondary" onclick="AdminAuth.logout()">ĐĂNG XUẤT</button>
        </div>
      `;
    }
  }

  function toggleUiMode() {
    setUiMode(getUiMode() === 'advanced' ? 'smart' : 'advanced');
    renderShell(currentActivePage, currentPageTitle);
  }

  function init(options) {
    options = options || {};
    return AuthContext.init().then(function() {
      var user = AuthContext.getCurrentUser();
      var role = AuthContext.getCurrentRole();

      if (!user) {
        location.href = '/admin/login.html';
        return;
      }

      // AuthContext resolves role from custom claims, then legacy /roles/{uid}
      if (!role) {
        firebase.auth().signOut().then(function() { location.href = '/admin/login.html?denied=1'; });
        return;
      }

      currentUser = user;
      currentRole = role;

      // Read name from legacy /roles/{uid} for backward compatibility
      return firebase.database().ref('roles/' + user.uid).once('value').then(function(snap) {
        if (snap.exists()) {
          currentName = snap.val().name || '';
        } else {
          currentName = user.displayName || '';
        }

        if (options.requiredRole && options.requiredRole !== currentRole && currentRole !== 'admin' && currentRole !== 'super_admin') {
          alert('B\u1EA1n kh\u00F4ng c\u00F3 quy\u1EC1n truy c\u1EADp trang n\u00E0y.');
          location.href = '/admin/index.html';
          return;
        }
        renderShell(options.page, options.title);
        return { user: user, role: currentRole, name: currentName };
      });
    });
  }

  function logout() {
    firebase.auth().signOut().then(() => { location.href = '/admin/login.html'; });
  }

  return {
    init,
    logout,
    toggleUiMode,
    getRole() { return currentRole; },
    getUser() { return currentUser; },
    getUiMode
  };
})();
