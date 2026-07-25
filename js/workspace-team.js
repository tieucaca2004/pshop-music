/*
 * js/workspace-team.js — Customer Workspace Team Management (Task 2.9).
 *
 * All reads/writes go through the existing functions/routes/team.js Cloud
 * Function (verifyAuth -> requireBusiness -> requireRole('business_admin',
 * 'super_admin')) via WorkspaceAuth.apiFetch() (hoisted in Task 2.9 from the
 * fetch()/getIdToken() pattern workspace-dashboard.js already used for its
 * team-count card). No new backend route, no direct RTDB/Auth access from
 * the client, no duplicated permission logic — the server alone decides who
 * can see/change what, deriving businessId from the caller's own ID token
 * (never from the URL), same as every other Workspace module.
 *
 * Backend capabilities actually available today (functions/routes/team.js):
 *   POST   /v1/businesses/{id}/team/invite  — create member (role: business_editor|business_viewer)
 *   GET    /v1/businesses/{id}/team         — list members
 *   PATCH  /v1/businesses/{id}/team/{uid}   — change role
 *   DELETE /v1/businesses/{id}/team/{uid}   — remove member
 * There is no invitation-token/email flow (invite creates the Firebase Auth
 * account immediately and returns a temp password to show the admin) and no
 * activate/deactivate flag on a member. Per the task brief ("if a backend
 * capability does not already exist, do NOT build a new backend — mark
 * Deferred"), Resend Invitation and Activate/Deactivate are not implemented
 * here; see the Team panel's deferred note and the task completion report.
 */
document.addEventListener('DOMContentLoaded', function () {
  var ROLE_LABELS = { business_admin: 'Owner', business_editor: 'Editor', business_viewer: 'Viewer' };
  var EDITABLE_ROLES = ['business_editor', 'business_viewer'];
  var businessId = null;
  var currentUid = null;

  WorkspaceAuth.init('team', 'Team').then(function (ctx) {
    if (!ctx) return;
    businessId = ctx.businessId;
    currentUid = ctx.user.uid;
    document.getElementById('tInviteBtn').addEventListener('click', invite);
    load();
  });


  function PSH.initials(member) {
    var src = (member.displayName || member.email || '?').trim();
    var parts = src.split(/\s+/).filter(Boolean);
    var chars = parts.length > 1 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
    return PSH.escapeHtml(chars.toUpperCase());

  function PSH.formatDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  function roleSelectHtml(member) {
    if (member.isOwner || member.uid === currentUid) {
      return '<span class="admin-role-badge">' + (ROLE_LABELS[member.role] || member.role) + '</span>';
    return '<select class="t-role-select">' + EDITABLE_ROLES.map(function (r) {
      return '<option value="' + r + '"' + (member.role === r ? ' selected' : '') + '>' + ROLE_LABELS[r] + '</option>';

  function load() {
    var body = document.getElementById('tTableBody');
    var empty = document.getElementById('tEmpty');
    body.innerHTML = '';
    empty.style.display = 'block';
    empty.style.color = '';
    empty.textContent = 'Loading...';
    return WorkspaceAuth.apiFetch('/v1/businesses/' + businessId + '/team').then(function (members) {
      empty.style.display = 'none';
      if (!members.length) {
        empty.style.display = 'block';
        empty.textContent = 'No team members yet.';
        return;
      body.innerHTML = members.map(function (m) {
        var canManage = !m.isOwner && m.uid !== currentUid;
        return '<tr data-uid="' + PSH.escapeHtml(m.uid) + '">' +
          '<td><span class="team-avatar">' + PSH.initials(m) + '</span></td>' +
          '<td>' + PSH.escapeHtml(m.displayName || '—') + '</td>' +
          '<td>' + PSH.escapeHtml(m.email) + '</td>' +
          '<td>' + roleSelectHtml(m) + '</td>' +
          '<td><span class="admin-role-badge">' + (m.isOwner ? 'Owner' : 'Active') + '</span></td>' +
          '<td>' + PSH.formatDate(m.assignedAt) + '</td>' +
          '<td class="admin-actions">' +
            (canManage ? '<button class="btn-danger t-remove-btn">Remove</button>' : '<span class="small-muted">—</span>') +
          '</td></tr>';
      body.querySelectorAll('.t-role-select').forEach(function (sel) {
        sel.addEventListener('change', function () {
          changeRole(sel.closest('[data-uid]').dataset.uid, sel.value);
      body.querySelectorAll('.t-remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          removeMember(btn.closest('[data-uid]').dataset.uid);
      empty.style.display = 'block';
      empty.style.color = '#c0392b';
      empty.textContent = 'Failed to load team: ' + e.message;

  function invite() {
    var email = document.getElementById('tInviteEmail').value.trim();
    var role = document.getElementById('tInviteRole').value;
    var status = document.getElementById('tInviteStatus');
    if (!email) { status.textContent = 'Enter an email address.'; return; }
    status.textContent = 'Inviting...';
    WorkspaceAuth.apiFetch('/v1/businesses/' + businessId + '/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, role: role })
      status.textContent = 'Invited ' + result.email + '. Temporary password: ' + result.tempPassword + ' (share this with them — it is only shown once).';
      document.getElementById('tInviteEmail').value = '';
      load();
      status.textContent = 'Invite failed: ' + e.message;

  function changeRole(uid, role) {
    WorkspaceAuth.apiFetch('/v1/businesses/' + businessId + '/team/' + uid, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: role })
      alert('Role change failed: ' + e.message);
      load();

  function removeMember(uid) {
    if (!confirm('Remove this member from your team? They will lose access immediately.')) return;
    WorkspaceAuth.apiFetch('/v1/businesses/' + businessId + '/team/' + uid, { method: 'DELETE' })
      .then(load)
      .catch(function (e) { alert('Remove failed: ' + e.message); });
});
