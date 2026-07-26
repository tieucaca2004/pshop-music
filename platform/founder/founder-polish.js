/* ============================================================
   founder-polish.js — Sprint A.4.1 Extension
   ============================================================
   Error boundaries, skeleton loaders, refresh actions,
   version banner, sort/pagination, deployment readiness.
   Extends the existing Founder SPA at platform/founder/index.html.
   ============================================================ */
(function() {
  'use strict';

  /* ─── Configuration ─────────────────────────────────────── */
  var CONFIG = {
    version: '1.0.0',
    branch: 'feature/cms-ai-sprint2',
    buildId: 'build-' + new Date().toISOString().slice(0,10).replace(/-/g,''),
    environment: 'Production',
    commitHash: '0f3a92a' // latest A.4 commit
  };

  /* ─── DOM Helpers ───────────────────────────────────────── */
  var $ = function(id) { return document.getElementById(id); };

  /* ─── Version Banner ────────────────────────────────────── */
  function injectVersionBanner() {
    var topbarRight = document.querySelector('.founder-topbar-right');
    if (!topbarRight) return;

    var envClass = CONFIG.environment.toLowerCase() === 'production' ? 'prod' : 'dev';

    var banner = document.createElement('div');
    banner.className = 'founder-version-banner';
    banner.innerHTML =
      '<span class="version-dot ' + envClass + '"></span>' +
      '<span>v' + CONFIG.version + '</span>' +
      '<span style="opacity:0.4">|</span>' +
      '<span>' + CONFIG.buildId + '</span>' +
      '<span style="opacity:0.4">|</span>' +
      '<span>' + CONFIG.branch + '</span>';

    topbarRight.insertBefore(banner, topbarRight.firstChild);
  }

  /* ─── Skeleton Loaders ──────────────────────────────────── */
  function renderSkeletonStats() {
    var html = '<div class="skeleton-stats-grid">';
    for (var i = 0; i < 5; i++) {
      html += '<div class="skeleton skeleton-card"></div>';
    }
    html += '</div>';
    return html;
  }

  function renderSkeletonTable(rows) {
    rows = rows || 6;
    var html = '<div class="data-table-wrapper"><div class="skeleton-table">';
    for (var i = 0; i < rows; i++) {
      html += '<div class="skeleton skeleton-row"></div>';
    }
    html += '</div></div>';
    return html;
  }

  function showSkeleton(page) {
    var content = $('founderContent');
    if (!content) return;

    if (page === 'dashboard') {
      content.innerHTML = renderSkeletonStats() + renderSkeletonTable(3);
    } else if (page === 'businesses' || page === 'members') {
      content.innerHTML = '<div class="panel"><div class="panel-header"><div><div class="skeleton skeleton-text" style="width:200px;height:1.2rem"></div><div class="skeleton skeleton-text" style="width:140px;height:0.8rem;margin-top:0.3rem"></div></div></div>' + renderSkeletonTable(8) + '</div>';
    } else if (page === 'platform') {
      content.innerHTML = renderSkeletonStats() + '<div class="panel">' + renderSkeletonTable(4) + '</div>';
    } else {
      content.innerHTML = renderSkeletonStats();
    }
  }

  /* ─── Retry Wrapper ─────────────────────────────────────── */
  function withErrorBoundary(renderFn, pageName, retryFn) {
    return function() {
      var content = $('founderContent');
      if (!content) { renderFn(); return; }

      showSkeleton(pageName);

      try {
        var result = renderFn();
        if (result && typeof result.then === 'function') {
          // Promise-based — catch errors
          result.catch(function(err) {
            showErrorState(pageName, err, retryFn);
          });
        }
      } catch (err) {
        showErrorState(pageName, err, retryFn);
      }
    };
  }

  function showErrorState(pageName, err, retryFn) {
    var content = $('founderContent');
    if (!content) return;

    var errMsg = err && err.message ? err.message : 'An unknown error occurred';
    var errCode = err && err.code ? err.code : '';
    var isPermission = errCode === 'PERMISSION_DENIED';
    var isTimeout = errMsg.toLowerCase().indexOf('timeout') >= 0 || errCode === 'NETWORK_ERROR';

    var title = isPermission ? 'Access Denied' : isTimeout ? 'Connection Timeout' : 'Something went wrong';
    var desc = isPermission
      ? 'You do not have permission to view this data. Please check your founder access.'
      : isTimeout
        ? 'The request timed out. Please check your connection and try again.'
        : 'Could not load ' + pageName + ' data. Please try again.';

    // Log technical details
    if (typeof console !== 'undefined') {
      console.warn('[Founder Workspace] Error loading ' + pageName + ':', errMsg, errCode);
    }

    content.innerHTML =
      '<div class="breadcrumb"><a onclick="window.location.hash=\'#\' + \'' + pageName + '\'">' + cap(pageName) + '</a> / Error</div>' +
      '<div class="error-container">' +
        '<div class="error-icon">⚠️</div>' +
        '<div class="error-title">' + title + '</div>' +
        '<div class="error-desc">' + desc + '</div>' +
        '<div class="error-tech">' +
          escHtml(errCode ? errCode + ': ' : '') + escHtml(errMsg) +
        '</div>' +
        '<button class="btn-retry" onclick="' + (typeof retryFn === 'function' ? 'FounderPolish.refresh(\'' + pageName + '\')' : 'window.location.reload()') + '">↻ Retry</button>' +
      '</div>';
  }

  /* ─── Refresh Actions ───────────────────────────────────── */
  function injectRefreshButton(pageName) {
    var panelHeader = document.querySelector('.panel-header .panel-actions');
    if (!panelHeader) return;

    // Avoid duplicate
    if (panelHeader.querySelector('.btn-refresh[data-page="' + pageName + '"]')) return;

    var btn = document.createElement('button');
    btn.className = 'btn-refresh';
    btn.setAttribute('data-page', pageName);
    btn.innerHTML = '<span class="refresh-icon">↻</span> Refresh';
    btn.title = 'Refresh ' + pageName + ' data';
    btn.onclick = function() {
      var self = this;
      self.classList.add('spinning');
      self.disabled = true;
      FounderPolish.refresh(pageName);
      setTimeout(function() {
        self.classList.remove('spinning');
        self.disabled = false;
      }, 2000);
    };

    panelHeader.appendChild(btn);
  }

  /* ─── Sort & Pagination ─────────────────────────────────── */
  function renderPagination(currentPage, totalItems, pageSize, onPageChange) {
    var totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    var start = (currentPage - 1) * pageSize + 1;
    var end = Math.min(currentPage * pageSize, totalItems);

    var html = '<div class="pagination-bar">' +
      '<div class="pagination-info">Showing ' + start + '–' + end + ' of ' + totalItems + '</div>' +
      '<div class="pagination-controls">' +
        '<button class="pagination-btn" onclick="' + onPageChange + '(' + (currentPage - 1) + ')"' + (currentPage <= 1 ? ' disabled' : '') + '>‹</button>';

    // Page numbers
    var maxVisible = 5;
    var pageStart = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    var pageEnd = Math.min(totalPages, pageStart + maxVisible - 1);
    if (pageEnd - pageStart < maxVisible - 1) {
      pageStart = Math.max(1, pageEnd - maxVisible + 1);
    }

    if (pageStart > 1) {
      html += '<button class="pagination-btn" onclick="' + onPageChange + '(1)">1</button>';
      if (pageStart > 2) html += '<span style="color:var(--text-tertiary);padding:0 0.25rem">…</span>';
    }

    for (var i = pageStart; i <= pageEnd; i++) {
      html += '<button class="pagination-btn' + (i === currentPage ? ' active' : '') + '" onclick="' + onPageChange + '(' + i + ')">' + i + '</button>';
    }

    if (pageEnd < totalPages) {
      if (pageEnd < totalPages - 1) html += '<span style="color:var(--text-tertiary);padding:0 0.25rem">…</span>';
      html += '<button class="pagination-btn" onclick="' + onPageChange + '(' + totalPages + ')">' + totalPages + '</button>';
    }

    html +=
        '<button class="pagination-btn" onclick="' + onPageChange + '(' + (currentPage + 1) + ')"' + (currentPage >= totalPages ? ' disabled' : '') + '>›</button>' +
        '<select class="pagination-size-select" onchange="' + onPageChange + '(1, this.value)">' +
          '<option value="10"' + (pageSize === 10 ? ' selected' : '') + '>10</option>' +
          '<option value="25"' + (pageSize === 25 ? ' selected' : '') + '>25</option>' +
          '<option value="50"' + (pageSize === 50 ? ' selected' : '') + '>50</option>' +
        '</select>' +
      '</div></div>';

    return html;
  }

  function paginateData(data, page, pageSize) {
    pageSize = pageSize || 10;
    var totalItems = data.length;
    var totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    page = Math.max(1, Math.min(page, totalPages));
    var start = (page - 1) * pageSize;
    var end = Math.min(start + pageSize, totalItems);
    return {
      items: data.slice(start, end),
      page: page,
      pageSize: pageSize,
      totalItems: totalItems,
      totalPages: totalPages
    };
  }

  function sortData(data, field, direction) {
    var sorted = data.slice();
    sorted.sort(function(a, b) {
      var aVal = getSortValue(a, field);
      var bVal = getSortValue(b, field);
      if (typeof aVal === 'string') {
        var cmp = aVal.toLowerCase().localeCompare(bVal.toLowerCase());
        return direction === 'asc' ? cmp : -cmp;
      }
      return direction === 'asc' ? (aVal - bVal) : (bVal - aVal);
    });
    return sorted;
  }

  function getSortValue(item, field) {
    if (field === 'name') return item.displayName || item.name || '';
    if (field === 'email') return item.email || '';
    if (field === 'plan') return item.plan || '';
    if (field === 'status') return item.status || '';
    if (field === 'role') return item.role || '';
    if (field === 'members') return item.memberCount || 0;
    if (field === 'business') return item.businessName || '';
    if (field === 'created') return item.createdDate || 0;
    if (field === 'assigned') return item.assignedAt || 0;
    return '';
  }

  /* ─── Deployment Readiness Diagnostics ──────────────────── */
  function runDeploymentCheck() {
    var checks = [];

    // Netlify SPA routing
    checks.push({
      name: 'Netlify SPA Routing',
      status: '⚠️',
      detail: 'Requires _redirects or netlify.toml with /* /index.html 200 for SPA routes. Verify at deploy.',
      passed: false
    });

    // Firebase config
    var hasFirebaseConfig = typeof firebaseConfig !== 'undefined' &&
      firebaseConfig.apiKey && firebaseConfig.apiKey !== '***' &&
      firebaseConfig.apiKey.indexOf('YOUR_API_KEY') < 0;
    checks.push({
      name: 'Firebase Configuration',
      status: hasFirebaseConfig ? '✅' : '❌',
      detail: hasFirebaseConfig ? 'API key configured' : 'API key not configured (placeholder still present)',
      passed: hasFirebaseConfig
    });

    // Super admin record
    var hasSuperAdmin = false;
    if (typeof firebase !== 'undefined' && firebase.auth().currentUser) {
      var uid = firebase.auth().currentUser.uid;
      checks.push({
        name: 'Super Admin Registration',
        status: '🔄',
        detail: 'UID: ' + uid + ' — requires superAdmins/' + uid + ' record in Firebase',
        passed: true
      });
    } else {
      checks.push({
        name: 'Super Admin Registration',
        status: '⚠️',
        detail: 'Not logged in — verify superAdmins/{uid} exists in Firebase',
        passed: false
      });
    }

    // Environment variables
    checks.push({
      name: 'Environment Variables',
      status: '⚠️',
      detail: 'Verify: FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_DATABASE_URL, FIREBASE_PROJECT_ID for production',
      passed: false
    });

    // Hosting configuration
    checks.push({
      name: 'Hosting Configuration',
      status: '⚠️',
      detail: 'Founder Workspace at /platform/founder/ — ensure hosting serves this path. Netlify or Firebase hosting.',
      passed: false
    });

    // Build check
    checks.push({
      name: 'Build Artifacts',
      status: '⚠️',
      detail: 'No build step configured — plain HTML/CSS/JS. Verify CDN caching and gzip.',
      passed: false
    });

    return checks;
  }

  function renderDeploymentCheck() {
    var checks = runDeploymentCheck();
    var passed = checks.filter(function(c) { return c.passed; }).length;
    var total = checks.length;

    var html = '<div class="panel">' +
      '<div class="panel-header">' +
        '<div><div class="panel-title">Deployment Readiness</div><div class="panel-subtitle">' + passed + '/' + total + ' checks passed. Run before production deploy.</div></div>' +
        '<div class="panel-actions"><button class="btn-retry" onclick="FounderPolish.refresh(\'deploy\')">↻ Re-check</button></div>' +
      '</div>' +
      '<div style="display:grid;gap:0.5rem">';

    checks.forEach(function(c) {
      html += '<div class="service-card"><div class="service-icon ' + (c.passed ? 'up' : 'warn') + '">' + c.status + '</div><div class="service-info"><div class="service-name">' + c.name + '</div><div class="service-meta">' + c.detail + '</div></div></div>';
    });

    html += '</div></div>';

    var content = $('founderContent');
    if (content) content.innerHTML += html;
  }

  /* ─── Network Recovery Monitor ──────────────────────────── */
  function monitorNetwork() {
    var content = $('founderContent');
    if (!content) return;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      content.innerHTML =
        '<div class="error-container">' +
          '<div class="error-icon">📡</div>' +
          '<div class="error-title">No Internet Connection</div>' +
          '<div class="error-desc">You appear to be offline. Please check your connection and try again.</div>' +
          '<button class="btn-retry" onclick="window.location.reload()">↻ Retry</button>' +
        '</div>';
    }
  }

  /* ─── Public API ────────────────────────────────────────── */
  window.FounderPolish = {
    version: CONFIG.version,

    init: function() {
      injectVersionBanner();
      monitorNetwork();
    },

    refresh: function(page) {
      if (page === 'dashboard' || page === '') {
        window.location.hash = '#dashboard';
      } else if (page === 'businesses') {
        window.location.hash = '#businesses';
      } else if (page === 'members') {
        window.location.hash = '#members';
      } else if (page === 'platform') {
        window.location.hash = '#platform';
      } else if (page === 'deploy') {
        renderDeploymentCheck();
      } else {
        window.location.reload();
      }
    },

    renderSkeletonStats: renderSkeletonStats,
    renderSkeletonTable: renderSkeletonTable,
    showSkeleton: showSkeleton,
    withErrorBoundary: withErrorBoundary,
    showErrorState: showErrorState,
    injectRefreshButton: injectRefreshButton,
    renderPagination: renderPagination,
    paginateData: paginateData,
    sortData: sortData,
    runDeploymentCheck: runDeploymentCheck,
    renderDeploymentCheck: renderDeploymentCheck
  };

  /* ─── Auto-init on DOM ready ───────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.FounderPolish.init();
    });
  } else {
    window.FounderPolish.init();
  }

  /* ─── Helpers ───────────────────────────────────────────── */
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function escHtml(s) {
    if (typeof s !== 'string') return String(s || '');
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
