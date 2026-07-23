/*
 * js/workspace-files.js — Customer Workspace Files / Documents (Task 2.7).
 *
 * Reuses MediaLibrary.list()/upload()/remove()/rename()/kindOf() exactly
 * (js/media-library.js, tenant-branched by Task 2.4, extended in Task 2.6
 * and 2.7) — no separate Storage/upload logic, no separate media system.
 * Files and Media Library are two filtered views over the same tenant
 * Storage tree: MediaLibrary.list(term, { kind: 'documents' }) returns only
 * non-image/non-video items (kindOf() === 'document'), so PDFs/DOCX/XLSX/
 * TXT/ZIP uploaded here also show up in the tenant's Media Library, and
 * vice versa — exactly like Products/Categories are two views of one DB.
 *
 * Download uses the same Storage download URL Media Library already reads
 * via getDownloadURL() (toMediaItem() in media-library.js) — no new
 * Storage read path.
 *
 * No AI processing of any kind.
 */
document.addEventListener('DOMContentLoaded', function () {
  WorkspaceAuth.init('files', 'Files').then(function () {
    document.getElementById('fSearchInput').addEventListener('input', function () {
      load(document.getElementById('fSearchInput').value);
    });
    document.getElementById('fUploadInput').addEventListener('change', handleUpload);
    load('');
  });

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function load(searchTerm) {
    var body = document.getElementById('fTableBody');
    var empty = document.getElementById('fEmpty');
    body.innerHTML = '';
    empty.style.color = '';
    empty.style.display = 'block';
    empty.textContent = 'Loading...';
    return MediaLibrary.list(searchTerm, { kind: 'documents' }).then(function (items) {
      empty.style.display = 'none';
      if (!items.length) {
        body.innerHTML = '';
        empty.style.display = 'block';
        empty.textContent = searchTerm ? 'No files match "' + escapeHtml(searchTerm) + '".' : 'No files yet — upload a document to get started.';
        return;
      }
      body.innerHTML = items.map(function (item) {
        return '<tr data-path="' + escapeHtml(item.fullPath) + '">' +
          '<td>' + escapeHtml(item.name) + '</td>' +
          '<td>' + WorkspaceAuth.formatBytes(item.size) + '</td>' +
          '<td>' + formatDate(item.timeCreated) + '</td>' +
          '<td class="admin-actions">' +
            '<a class="link-btn f-download-btn" href="' + escapeHtml(item.url || '#') + '" target="_blank" rel="noopener">Download</a>' +
            '<button class="link-btn f-rename-btn">Rename</button>' +
            '<button class="btn-danger f-remove-btn">Delete</button>' +
          '</td></tr>';
      }).join('');
      body.querySelectorAll('.f-remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { removeItem(btn.closest('[data-path]').dataset.path, searchTerm); });
      });
      body.querySelectorAll('.f-rename-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { renameItem(btn.closest('[data-path]').dataset.path, searchTerm); });
      });
    }).catch(function (e) {
      body.innerHTML = '';
      empty.style.display = 'block';
      empty.style.color = '#c0392b';
      empty.textContent = 'Failed to load files: ' + e.message;
    });
  }

  function removeItem(fullPath, searchTerm) {
    if (!confirm('Delete this file? Anything referencing it elsewhere will lose the file.')) return;
    MediaLibrary.remove(fullPath).then(function () { load(searchTerm); });
  }

  function renameItem(fullPath, searchTerm) {
    var currentName = fullPath.substring(fullPath.lastIndexOf('/') + 1);
    var newName = prompt('New file name:', currentName);
    if (!newName || newName === currentName) return;
    MediaLibrary.rename(fullPath, newName).then(function () {
      load(searchTerm);
    }).catch(function (e) {
      alert('Rename failed: ' + e.message);
    });
  }

  function handleUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    var status = document.getElementById('fUploadStatus');
    status.textContent = 'Uploading... 0%';
    MediaLibrary.upload(file, function (pct) { status.textContent = 'Uploading... ' + pct + '%'; }).then(function () {
      status.textContent = 'Uploaded.';
      e.target.value = '';
      load(document.getElementById('fSearchInput').value);
      setTimeout(function () { status.textContent = ''; }, 2000);
    }).catch(function (err) {
      status.textContent = 'Upload failed: ' + err.message;
    });
  }
});
