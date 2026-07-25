/*
 * js/workspace-products.js — Customer Workspace Products (Phase 2, Task 2.5).
 *
 * Core CRUD only over DB (name/price/category/image/pubStatus) — same DB
 * layer admin-products.js uses, tenant-branched by Task 2.4. Deliberately
 * excludes AI-assist buttons, Quill rich-text editor, brand dropdown,
 * export/import JSON, and YouTube preview — those pull in the AI module
 * framework (out of scope until the deferred AI Workspace sprint) or add
 * risk without being core CRUD. categoryIds/category are both written for
 * schema compatibility with the existing DB shape.
 */
document.addEventListener('DOMContentLoaded', function () {
  WorkspaceAuth.init('products', 'Products').then(function () {
    loadCategories().then(load);
    mountImagePicker();
  });

  var products = [];
  var categories = [];
  var editingId = null;
  var imagePicker = null;


  function catLabel(code) {
    var c = categories.find(function (x) { return x.code === code; });
    return c ? c.label : code;

  function loadCategories() {
    return CategoryDB.getAll().then(function (list) {
      categories = list;
      var select = document.getElementById('pCategory');
      select.innerHTML = '<option value="">-- Select --</option>' +
        categories.map(function (c) { return '<option value="' + PSH.escapeHtml(c.code) + '">' + PSH.escapeHtml(c.label) + '</option>'; }).join('');

  function mountImagePicker() {
    imagePicker = MediaLibraryPicker.renderSlot('', function (url) {
      document.getElementById('pImage').value = url || '';
    document.getElementById('pImageSlot').innerHTML = imagePicker;

  function load() {
    var container = document.getElementById('productTableBody');
    return DB.getAll().then(function (list) {
      products = list;
      render();
      WorkspaceAuth.renderErrorState(container.parentElement, 'Failed to load products: ' + e.message);

  function render() {
    var tbody = document.getElementById('productTableBody');
    document.getElementById('productTotal').textContent = products.length;
    if (!products.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="small-muted">No products yet.</td></tr>';
      return;
    tbody.innerHTML = products.map(function (p) {
      return '<tr>' +
        '<td>' + (p.image ? '<img src="' + PSH.escapeHtml(p.image) + '" alt="">' : '') + '</td>' +
        '<td>' + PSH.escapeHtml(p.name) + '</td>' +
        '<td>' + PSH.escapeHtml(catLabel(p.category)) + '</td>' +
        '<td>' + PSH.escapeHtml(p.price) + '</td>' +
        '<td>' + PSH.escapeHtml(p.pubStatus || 'draft') + '</td>' +
        '<td>' +
          '<button class="link-btn" onclick="WorkspaceProducts.editProduct(\'' + p.id + '\')">Edit</button> ' +
          '<button class="btn-danger" onclick="WorkspaceProducts.deleteProduct(\'' + p.id + '\')">Delete</button>' +
        '</td></tr>';

  function editProduct(id) {
    var p = products.find(function (x) { return x.id === id; });
    if (!p) return;
    editingId = id;
    document.getElementById('pName').value = p.name || '';
    document.getElementById('pPrice').value = p.price || '';
    document.getElementById('pCategory').value = p.category || '';
    document.getElementById('pPubStatus').value = p.pubStatus || 'draft';
    document.getElementById('pImage').value = p.image || '';
    imagePicker = MediaLibraryPicker.renderSlot(p.image || '', function (url) {
      document.getElementById('pImage').value = url || '';
    document.getElementById('pImageSlot').innerHTML = imagePicker;
    document.getElementById('formTitle').textContent = 'EDIT PRODUCT';
    document.getElementById('saveBtn').textContent = 'SAVE CHANGES';

  function deleteProduct(id) {
    var p = products.find(function (x) { return x.id === id; });
    if (!p) return;
    if (!confirm('Delete product "' + p.name + '"?')) return;
    DB.remove(id).then(load);

  function resetForm() {
    editingId = null;
    document.getElementById('pName').value = '';
    document.getElementById('pPrice').value = '';
    document.getElementById('pCategory').value = '';
    document.getElementById('pPubStatus').value = 'draft';
    document.getElementById('pImage').value = '';
    imagePicker = MediaLibraryPicker.renderSlot('', function (url) {
      document.getElementById('pImage').value = url || '';
    document.getElementById('pImageSlot').innerHTML = imagePicker;
    document.getElementById('formTitle').textContent = 'ADD NEW PRODUCT';
    document.getElementById('saveBtn').textContent = 'SAVE PRODUCT';

  function saveProduct() {
    var name = document.getElementById('pName').value.trim();
    if (!name) { alert('Product name is required.'); return; }
    var category = document.getElementById('pCategory').value;
    var image = document.getElementById('pImage').value.trim();
    var data = {
      name: name,
      price: document.getElementById('pPrice').value.trim(),
      category: category,
      categoryLabel: catLabel(category),
      categoryIds: category ? [category] : [],
      pubStatus: document.getElementById('pPubStatus').value,
      image: image,
      images: image ? [image] : []
    var action = editingId ? DB.update(editingId, data) : DB.add(data);
    action.then(function () {
      showStatus(editingId ? 'Product updated.' : 'Product added.');
      resetForm();
      load();

  function showStatus(msg) {
    var el = document.getElementById('formStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 3000);

  document.getElementById('saveBtn').addEventListener('click', saveProduct);
  document.getElementById('resetBtn').addEventListener('click', resetForm);

  window.WorkspaceProducts = { editProduct: editProduct, deleteProduct: deleteProduct };
});
