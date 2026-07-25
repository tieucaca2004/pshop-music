/*
 * js/workspace-dashboard.js — Customer Workspace Dashboard (Task 2.8).
 *
 * Tenant-scoped version of admin/index.html's inline dashboard script.
 * Reuses the exact same data services already made tenant-aware by earlier
 * tasks — no new business logic, no new statistics queries:
 *   - DB.getAll()               -> Products      (Task 2.4)
 *   - CategoryDB.getAll()       -> Categories     (Task 2.4)
 *   - MediaLibrary.list('', {allTypes:true}) -> Media + Files + Storage Used
 *     (Task 2.4/2.6/2.7) -- called ONCE and reused for all three stats
 *     (Media count, Documents count, total bytes) instead of listing the
 *     tenant's Storage tree three separate times.
 *   - GET /v1/businesses/{businessId}/team (functions/routes/team.js,
 *     existing backend service, Admin SDK) -> Team Member Count, via
 *     WorkspaceAuth.apiFetch() (Task 2.9). This is a business_admin/
 *     super_admin-only endpoint; business_editor/viewer accounts get a 403,
 *     in which case the Team card shows "—" instead of blocking the rest of
 *     the dashboard.
 *
 * Recent Activity: functions/routes/auditLogs.js + functions/shared/
 * auditLog.js exist on the backend, but no admin/platform UI anywhere
 * reads them today (grepped, confirmed) -- there is no existing activity
 * component to reuse. Per the task brief, NOT building a new one; this
 * section stays a deferred placeholder.
 *
 * CSS: dash-stats/dash-card/dash-num/dash-label/dash-quicklinks/
 * dash-quicklink are the exact classes admin/index.html already defines in
 * css/admin.css -- reused as-is, no new CSS added.
 */
document.addEventListener('DOMContentLoaded', function () {
  WorkspaceAuth.init('dashboard', 'Dashboard').then(function (ctx) {
    if (!ctx) return;
    loadStats(ctx.businessId);
  });

  function cardHtml(num, label) {
    return '<div class="dash-card"><div class="dash-num">' + num + '</div><div class="dash-label">' + label + '</div></div>';
  }

  function fetchTeamCount(businessId) {
    return WorkspaceAuth.apiFetch('/v1/businesses/' + businessId + '/team')
      .then(function (members) { return Array.isArray(members) ? members.length : null; })
      .catch(function () { return null; });
  }

  function loadStats(businessId) {
    var stats = document.getElementById('dashStats');
    WorkspaceAuth.renderLoading(stats, 'Loading dashboard...');

    Promise.all([
      DB.getAll().catch(function () { return []; }),
      CategoryDB.getAll().catch(function () { return []; }),
      MediaLibrary.list('', { allTypes: true }).catch(function () { return []; }),
      fetchTeamCount(businessId)
    ]).then(function (results) {
      var products = results[0], categories = results[1], allMedia = results[2], teamCount = results[3];

      var mediaCount = allMedia.filter(function (it) { return MediaLibrary.kindOf(it) !== 'document'; }).length;
      var docCount = allMedia.filter(function (it) { return MediaLibrary.kindOf(it) === 'document'; }).length;
      var totalBytes = allMedia.reduce(function (sum, it) { return sum + (it.size || 0); }, 0);

      stats.innerHTML =
        cardHtml(products.length, 'Total Products') +
        cardHtml(categories.length, 'Total Categories') +
        cardHtml(mediaCount, 'Total Media Files') +
        cardHtml(docCount, 'Total Documents') +
        cardHtml(WorkspaceAuth.PSH.formatBytes(totalBytes) || '0 B', 'Total Storage Used') +
        cardHtml(teamCount === null ? '—' : teamCount, 'Team Members');
    }).catch(function (e) {
      WorkspaceAuth.renderErrorState(stats, 'Failed to load dashboard: ' + e.message);
    });
  }
});
