/*
 * js/workspace-auth.js — Customer Workspace Authentication Gate (Phase 2, Task 2.2).
 *
 * Consumes auth-context.js exclusively for authentication and role resolution.
 * No window.TENANT_ID or window.USER_ROLE globals are read or set.
 *
 * Exposed API:
 *   WorkspaceAuth.init(page, title)  → Promise, resolves when gate passes
 *   WorkspaceAuth.getUser()          → Firebase user or null
 *   WorkspaceAuth.getRole()          → current role string
 *   WorkspaceAuth.logout()           → sign out + redirect
 *
 * Navigation:
 *   - Unauthenticated → redirect to /platform/login.html
 *   - super_admin → redirect to /admin/ (Platform Admin area chưa được xây)
 *   - Legacy admin (role == 'admin') → access denied with message
 *   - business_admin / business_editor / business_viewer → access granted
 *     with a filtered workspace nav (no admin-only items)
 *
 * Dependencies: auth-context.js must be loaded BEFORE this file.
 * Page must include: <aside id="workspaceSidebar"></aside>, <div id="workspaceTopbar"></div>
 */

var WorkspaceAuth = (function () {
  'use strict';

  // ─── Workspace-specific navigation (no admin-only items) ─────────
  var WORKSPACE_NAV = [
    { key: 'dashboard',      label: 'Dashboard',       href: '/platform/workspace/dashboard.html', icon: '&#9776;' },
    { key: 'products',       label: 'Products',         href: '/platform/workspace/products.html',  icon: '&#127925;' },
    { key: 'categories',     label: 'Categories',       href: '/platform/workspace/categories.html', icon: '&#128193;' },
    { key: 'banners',        label: 'Banners',          href: '/platform/workspace/banners.html',   icon: '&#128247;' },
    { key: 'blog',           label: 'Blog',             href: '/platform/workspace/blog.html',      icon: '&#128221;' },
    { key: 'videos',         label: 'Videos',           href: '/platform/workspace/videos.html',    icon: '&#127916;' },
    { key: 'orders',         label: 'Orders',           href: '/platform/workspace/orders.html',    icon: '&#128230;' },
    { key: 'customers',      label: 'Customers',        href: '/platform/workspace/customers.html', icon: '&#128101;' },
    { key: 'reports',        label: 'Reports',          href: '/platform/workspace/reports.html',   icon: '&#128200;' },
    { key: 'media-library',  label: 'Media',            href: '/platform/workspace/media-library.html', icon: '&#128444;' },
    { key: 'files',          label: 'Files',            href: '/platform/workspace/files.html',     icon: '&#128194;' },
    { key: 'settings',       label: 'Settings',         href: '/platform/workspace/settings.html',  icon: '&#9881;' },
    { key: 'team',           label: 'Team',             href: '/platform/workspace/team.html',      icon: '&#128101;' },
    { key: 'business-settings', label: 'Business Settings', href: '/platform/workspace/business-settings.html', icon: '&#128100;' }
  ];

  // ─── Internal State ──────────────────────────────────────────────
  var currentUser = null;
  var currentRole = null;
  var currentPage = null;
  var currentTitle = '';

  // ─── Helpers ─────────────────────────────────────────────────────
  // Reuses the existing admin-*.css classes (admin-nav-item, admin-brand,
  // admin-topbar-title, admin-user, admin-role-badge, ...) instead of
  // inventing new unstyled ones — same visual layout as the Admin CMS,
  // just a different brand string and container IDs.
  function navItemHtml(item, activePage) {
    return '<a class="admin-nav-item' + (item.key === activePage ? ' active' : '') + '" href="' + item.href + '">' +
      '<span class="admin-nav-icon">' + item.icon + '</span>' + item.label + '</a>';
  }

  // Breadcrumb: "Workspace / {current page label}" — looked up from
  // WORKSPACE_NAV so every page gets it for free just by passing its nav
  // key to init(), no per-page breadcrumb markup to maintain. New to this
  // codebase (Admin CMS has no breadcrumb) — one small CSS rule added
  // alongside the existing admin-topbar-* rules in admin.css.
  function breadcrumbHtml(activePage) {
    var item = WORKSPACE_NAV.filter(function (i) { return i.key === activePage; })[0];
    var label = item ? item.label : '';
    return '<div class="admin-breadcrumb"><a href="/platform/workspace/dashboard.html">Workspace</a>' +
      (label ? ' <span>/</span> ' + label : '') + '</div>';
  }

  function renderSidebar(activePage, pageTitle) {
    currentPage = activePage;
    currentTitle = pageTitle;
    var sidebar = document.getElementById('workspaceSidebar');
    var topbar = document.getElementById('workspaceTopbar');

    if (sidebar) {
      sidebar.innerHTML =
        '<div class="admin-brand">PSH <span>WORKSPACE</span></div>' +
        '<nav class="admin-nav">' + WORKSPACE_NAV.map(function(i) { return navItemHtml(i, activePage); }).join('') + '</nav>';
    }

    if (topbar) {
      topbar.innerHTML =
        '<div>' + breadcrumbHtml(activePage) +
          '<div class="admin-topbar-title">' + (pageTitle || '') + '</div>' +
        '</div>' +
        '<div class="admin-topbar-actions">' +
          '<span class="admin-user">' + (currentUser ? currentUser.email : '') +
            ' <span class="admin-role-badge admin-role-' + (currentRole || '') + '">' + (currentRole || '').toUpperCase() + '</span></span>' +
          '<button class="btn-secondary" onclick="WorkspaceAuth.logout()">Sign Out</button>' +
        '</div>';
    }
  }

  // ─── Shared Page-Container Helpers ────────────────────────────────
  // Every Workspace module page renders its content into one container
  // element (conventionally id="workspaceContent") using these three
  // states, so future modules (Orders/Customers/Media/...) plug into the
  // exact same shell without re-inventing loading/empty/error markup.
  function renderLoading(containerEl, msg) {
    if (containerEl) containerEl.innerHTML = '<p class="small-muted">' + (msg || 'Đang tải...') + '</p>';
  }

  function renderEmpty(containerEl, msg) {
    if (containerEl) containerEl.innerHTML = '<p class="small-muted">' + (msg || 'Chưa có dữ liệu.') + '</p>';
  }

  function renderErrorState(containerEl, msg) {
    if (containerEl) containerEl.innerHTML = '<p style="color:#c0392b">' + (msg || 'Đã xảy ra lỗi.') + '</p>';
  }

  // PSH.formatBytes(n) -> human-readable size string. Shared (Task 2.8) — was
  // duplicated identically in workspace-media-library.js and
  // workspace-files.js (Task 2.6/2.7); both now call this instead, and the
  // Dashboard's "Storage Used" card reuses it too, so there is exactly one
  // implementation of this formatting rule.
  function formatBytes(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // apiFetch(path, options) -> Promise<data> — shared caller for the
  // tenant-scoped Cloud Functions API (functions/routes/*.js via
  // apiGateway). Attaches the current user's ID token, parses the
  // { success, data } / { success:false, error } envelope from
  // functions/shared/response.js, and rejects with an Error carrying the
  // backend's error code/message on failure. Hoisted here (Task 2.9) so
  // workspace-dashboard.js's team-count call and workspace-team.js's CRUD
  // calls share one implementation instead of each duplicating
  // getIdToken()+fetch()+base-URL (previously only duplicated once, in
  // workspace-dashboard.js — fixed before a third copy was added).
  var API_BASE = 'https://us-central1-pshop-music.cloudfunctions.net/apiGateway';

  function apiFetch(path, options) {
    var user = firebase.auth().currentUser;
    if (!user) return Promise.reject(new Error('Not authenticated.'));
    return user.getIdToken().then(function (token) {
      var opts = Object.assign({}, options);
      opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers);
      return fetch(API_BASE + path, opts);
    }).then(function (r) {
      return r.json().then(function (body) {
        if (!body || body.success !== true) {
          var err = (body && body.error) || {};
          throw new Error(err.message || 'Request failed.');
        }
        return body.data;
      });
    });
  }

  // ─── Init: Auth Gate ─────────────────────────────────────────────
  function init(page, title) {
    return AuthContext.init().then(function () {
      var user = AuthContext.getCurrentUser();
      var role = AuthContext.getCurrentRole();

      // 1. Unauthenticated → redirect to login
      if (!user) {
        window.location.href = '/platform/login.html';
        return;
      }

      // 2. super_admin → Platform Admin area chưa được xây (route này 404 —
      // Founder xác nhận live 2026-08-15: tài khoản super_admin vào bất kỳ
      // trang Customer Workspace nào (business-settings/media-library/files)
      // đều bị đưa thẳng tới "Page not found"). Chưa có trang Platform Admin
      // thật để trỏ tới — không tự dựng trang mới ở đây (ngoài phạm vi sửa
      // lỗi), tạm đưa về /admin/ (đã có, đang hoạt động) giống hệt cách xử
      // lý "admin/editor" ngay bên dưới.
      if (AuthContext.isSuperAdmin()) {
        window.location.href = '/admin/';
        return;
      }

      // 3. Legacy admin without businessId → access denied
      if (role === 'admin' || role === 'editor') {
        document.body.innerHTML =
          '<div style="font-family:sans-serif;text-align:center;padding:40px">' +
          '<h1>Access Denied</h1>' +
          '<p>Your account is a platform administrator and cannot access the Customer Workspace.</p>' +
          '<p>Please use the <a href="/admin/">Admin Panel</a> instead.</p>' +
          '</div>';
        return;
      }

      // 4. Check for valid business user role
      var validRoles = ['business_admin', 'business_editor', 'business_viewer'];
      if (validRoles.indexOf(role) < 0) {
        document.body.innerHTML =
          '<div style="font-family:sans-serif;text-align:center;padding:40px">' +
          '<h1>Access Denied</h1>' +
          '<p>Your account does not have permission to access the Customer Workspace.</p>' +
          '</div>';
        return;
      }

      // 5. Access granted — set user/role state and render
      currentUser = user;
      currentRole = role;
      renderSidebar(page, title);
      return { user: user, role: role, businessId: AuthContext.getCurrentBusinessId() };
    });
  }

  function getUser() { return currentUser; }
  function getRole() { return currentRole; }

  function logout() {
    firebase.auth().signOut().then(function () {
      window.location.href = '/platform/login.html';
    });
  }

  // ─── Public API ──────────────────────────────────────────────────
  return {
    init: init,
    getUser: getUser,
    getRole: getRole,
    logout: logout,
    renderLoading: renderLoading,
    renderEmpty: renderEmpty,
    renderErrorState: renderErrorState,
    formatBytes: formatBytes,
    apiFetch: apiFetch
  };
})();
