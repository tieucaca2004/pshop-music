/*
 * js/workspace-categories.js — Customer Workspace Categories (Phase 2, Task 2.5).
 *
 * Core CRUD only over CategoryDB (code/label/description/order/status) —
 * same DB layer admin-categories.js uses, tenant-branched by Task 2.4.
 * Deliberately excludes the Category Cover visual editor and homepage
 * category-tiles feature (admin-categories.js's SiteContentDB-backed
 * section) — both are platform-level/legacy-storefront concerns, not
 * appropriate for a per-tenant workspace, and out of this sprint's scope.
 */
document.addEventListener('DOMContentLoaded', function () {
  WorkspaceAuth.init('categories', 'Categories').then(function () {
    load();
  });

  var categories = [];


  function load() {
    var container = document.getElementById('categoryList');
    WorkspaceAuth.renderLoading(container);
    return CategoryDB.getAll().then(function (list) {
      categories = list;
      render();
      WorkspaceAuth.renderErrorState(container, 'Failed to load categories: ' + e.message);

  function render() {
    var wrap = document.getElementById('categoryList');
    if (!categories.length) { WorkspaceAuth.renderEmpty(wrap, 'No categories yet.'); return; }
    wrap.innerHTML = categories.map(function (c, i) {
      return '<div class="cms-row" data-id="' + c.id + '">' +
        '<div class="cms-row-fields">' +
          '<input type="text" value="' + PSH.escapeHtml(c.code) + '" placeholder="Code (e.g. drinks)" data-field="code">' +
          '<input type="text" value="' + PSH.escapeHtml(c.label) + '" placeholder="Display name" data-field="label">' +
          '<input type="text" value="' + PSH.escapeHtml(c.description) + '" placeholder="Description" data-field="description">' +
          '<label class="cms-toggle"><input type="checkbox" data-field="active" ' + (c.status !== 'inactive' ? 'checked' : '') + '> Active</label>' +
        '</div>' +
        '<div class="cms-row-actions">' +
          '<button class="btn-secondary" title="Up" ' + (i === 0 ? 'disabled' : '') + ' onclick="WorkspaceCategories.move(\'' + c.id + '\',-1)">&#8593;</button>' +
          '<button class="btn-secondary" title="Down" ' + (i === categories.length - 1 ? 'disabled' : '') + ' onclick="WorkspaceCategories.move(\'' + c.id + '\',1)">&#8595;</button>' +
          '<button class="link-btn" onclick="WorkspaceCategories.save(\'' + c.id + '\')">Save</button>' +
          '<button class="btn-danger" onclick="WorkspaceCategories.remove(\'' + c.id + '\')">Delete</button>' +
        '</div></div>';

  function rowValues(id) {
    var row = document.querySelector('.cms-row[data-id="' + id + '"]');
      code: row.querySelector('[data-field="code"]').value.trim(),
      label: row.querySelector('[data-field="label"]').value.trim(),
      description: row.querySelector('[data-field="description"]').value.trim(),
      status: row.querySelector('[data-field="active"]').checked ? 'active' : 'inactive'

  function save(id) {
    var values = rowValues(id);
    if (!values.code || !values.label) { alert('Code and Display name are required.'); return; }
    CategoryDB.update(id, values).then(function () {
      showStatus('Category saved.');
      load();

  function move(id, dir) {
    var idx = categories.findIndex(function (c) { return c.id === id; });
    var swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= categories.length) return;
    var a = categories[idx], b = categories[swapIdx];
    Promise.all([
      CategoryDB.update(a.id, { order: b.order || 0 }),
      CategoryDB.update(b.id, { order: a.order || 0 })
    ]).then(load);

  function remove(id) {
    var c = categories.find(function (x) { return x.id === id; });
    if (!c) return;
    if (!confirm('Delete category "' + c.label + '"?')) return;
    CategoryDB.remove(id).then(load);

  function addNew() {
    var maxOrder = categories.reduce(function (m, c) { return Math.max(m, c.order || 0); }, 0);
    CategoryDB.add({ code: '', label: 'New Category', description: '', order: maxOrder + 1, status: 'active' }).then(load);

  function showStatus(msg) {
    var el = document.getElementById('categoryStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 3000);

  document.getElementById('addCategoryBtn').addEventListener('click', addNew);

  window.WorkspaceCategories = { save: save, move: move, remove: remove };
});
