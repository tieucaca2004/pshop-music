/*
 * Footer Manager (admin/footer.html) — edits siteContent.footer (columns,
 * social links, copyright text), rendered on every public page's footer by
 * js/site-chrome.js. Admin-only page.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'footer', title: 'QUẢN LÝ FOOTER', requiredRole: 'admin' }).then(load);

  let siteContent = null;
  let columns = [];
  let social = [];

      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'

  function load() {
    SiteContentDB.get().then(content => {
      siteContent = content;
      columns = (content.footer && Array.isArray(content.footer.columns)) ? content.footer.columns.slice() : [];
      social = (content.footer && Array.isArray(content.footer.social)) ? content.footer.social.slice() : [];
      document.getElementById('footerCopyText').value = (content.footer && content.footer.copyText) || '';
      renderColumns();
      renderSocial();

  function linksToText(links) {
    return (links || []).map(l => `${l.label} | ${l.link}`).join('\n');

  function textToLinks(text) {
    return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const idx = line.indexOf('|');
        label: (idx === -1 ? line : line.slice(0, idx)).trim(),
        link: (idx === -1 ? '' : line.slice(idx + 1)).trim()

  function renderColumns() {
    const wrap = document.getElementById('footerColumns');
    wrap.innerHTML = columns.map((col, i) => `
      <div class="panel" data-idx="${i}" style="margin-bottom:1rem">
        <div class="field-grid">
          <div class="form-group full">
            <label>TÊN CỘT ${i + 1}</label>
            <input type="text" value="${PSH.escapeHtml(col.title)}" oninput="AdminFooter.setColumnTitle(${i},this.value)">
          </div>
          <div class="form-group full">
            <label>LIÊN KẾT TRONG CỘT — mỗi dòng: Tên hiển thị | Link</label>
            <textarea rows="4" oninput="AdminFooter.setColumnLinks(${i},this.value)">${PSH.escapeHtml(linksToText(col.links))}</textarea>
          </div>
        </div>
        <div class="admin-actions">
          <button class="btn-secondary" ${i === 0 ? 'disabled' : ''} onclick="AdminFooter.moveColumn(${i},-1)">&#8593; LÊN</button>
          <button class="btn-secondary" ${i === columns.length - 1 ? 'disabled' : ''} onclick="AdminFooter.moveColumn(${i},1)">&#8595; XUỐNG</button>
          <button class="btn-danger" onclick="AdminFooter.removeColumn(${i})">XÓA CỘT</button>
        </div>
      </div>`).join('');

  function setColumnTitle(i, value) { columns[i].title = value; }
  function setColumnLinks(i, text) { columns[i].links = textToLinks(text); }

  function moveColumn(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= columns.length) return;
    [columns[i], columns[j]] = [columns[j], columns[i]];
    renderColumns();

  function removeColumn(i) {
    if (!confirm('Xóa cột footer này?')) return;
    columns.splice(i, 1);
    renderColumns();

  function addColumn() {
    columns.push({ title: 'Cột mới', links: [] });
    renderColumns();

  function renderSocial() {
    const wrap = document.getElementById('socialList');
    wrap.innerHTML = social.map((s, i) => `
      <div class="cms-row" data-idx="${i}">
        <div class="cms-row-fields">
          <select onchange="AdminFooter.setSocialField(${i},'platform',this.value)">
            <option value="facebook" ${s.platform === 'facebook' ? 'selected' : ''}>Facebook</option>
            <option value="messenger" ${s.platform === 'messenger' ? 'selected' : ''}>Messenger</option>
            <option value="zalo" ${s.platform === 'zalo' ? 'selected' : ''}>Zalo</option>
            <option value="shopee" ${s.platform === 'shopee' ? 'selected' : ''}>Shopee</option>
          </select>
          <input type="text" value="${PSH.escapeHtml(s.url)}" placeholder="https://..." oninput="AdminFooter.setSocialField(${i},'url',this.value)">
        </div>
        <div class="cms-row-actions">
          <button class="btn-danger" onclick="AdminFooter.removeSocial(${i})">Xóa</button>
        </div>
      </div>`).join('') || '<p class="small-muted">Chưa có mạng xã hội nào.</p>';

  function setSocialField(i, field, value) { social[i][field] = value; }
  function removeSocial(i) { social.splice(i, 1); renderSocial(); }
  function addSocial() { social.push({ platform: 'facebook', url: '' }); renderSocial(); }

  function saveAll() {
    const content = Object.assign({}, siteContent, {
      footer: { columns, social, copyText: document.getElementById('footerCopyText').value.trim() }
    SiteContentDB.save(content).then(() => {
      siteContent = content;
      showStatus('Đã lưu footer — có hiệu lực ngay trên mọi trang.');

  function showStatus(msg) {
    const el = document.getElementById('footerStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);

  document.getElementById('addColumnBtn').addEventListener('click', addColumn);
  document.getElementById('addSocialBtn').addEventListener('click', addSocial);
  document.getElementById('saveFooterBtn').addEventListener('click', saveAll);

  window.AdminFooter = { setColumnTitle, setColumnLinks, moveColumn, removeColumn, setSocialField, removeSocial };
});
