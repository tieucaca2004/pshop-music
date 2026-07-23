/*
 * js/workspace-media-library.js — Customer Workspace Media Library (Task 2.6).
 *
 * Reuses MediaLibrary.list()/upload()/remove()/rename() exactly (js/media-
 * library.js, tenant-branched by Task 2.4) — no new Storage logic here,
 * no separate media system. Passes { allTypes: true } to see images, video,
 * and documents (existing callers like media-library-picker.js don't pass
 * this, so their image-only behavior is unchanged).
 *
 * Folder browsing/creation: not implemented — no such feature exists
 * anywhere in the codebase to reuse today ("if already available" per the
 * task brief). Deferred.
 *
 * No AI processing of any kind — this is a pure storage browser, intended
 * as the future AI Workspace's data source per the task brief.
 */
document.addEventListener('DOMContentLoaded', function () {
  WorkspaceAuth.init('media-library', 'Media Library').then(function () {
    document.getElementById('mlSearchInput').addEventListener('input', function () {
      load(document.getElementById('mlSearchInput').value);
    });
    document.getElementById('mlUploadInput').addEventListener('change', handleUpload);
    load('');
  });

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatBytes(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function thumbHtml(item) {
    var kind = MediaLibrary.kindOf(item);
    if (kind === 'image') {
      return '<img src="' + escapeHtml(item.url || '') + '" alt="' + escapeHtml(item.name) + '" style="width:100%;height:120px;object-fit:cover;border-radius:6px;background:var(--bg-alt)">';
    }
    var icon = kind === 'video' ? '&#127909;' : '&#128196;';
    return '<div style="width:100%;height:120px;border-radius:6px;background:var(--bg-alt);display:flex;align-items:center;justify-content:center;font-size:2.5rem">' + icon + '</div>';
  }

  function load(searchTerm) {
    var grid = document.getElementById('mlGrid');
    WorkspaceAuth.renderLoading(grid);
    return MediaLibrary.list(searchTerm, { allTypes: true }).then(function (items) {
      if (!items.length) {
        WorkspaceAuth.renderEmpty(grid, searchTerm ? 'No files match "' + escapeHtml(searchTerm) + '".' : 'No media yet — upload a file to get started.');
        return;
      }
      grid.innerHTML = items.map(function (item) {
        return '<div class="panel" style="padding:0.75rem" data-path="' + escapeHtml(item.fullPath) + '">' +
          thumbHtml(item) +
          '<p class="small-muted" style="margin:0.5rem 0 0;word-break:break-all">' + escapeHtml(item.name) + '</p>' +
          '<p class="small-muted" style="margin:0.1rem 0 0">' + formatBytes(item.size) + '</p>' +
          '<div class="admin-actions" style="margin-top:0.5rem">' +
            '<button class="link-btn ml-rename-btn">Rename</button>' +
            '<button class="btn-danger ml-remove-btn">Delete</button>' +
          '</div></div>';
      }).join('');
      grid.querySelectorAll('.ml-remove-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { removeItem(btn.closest('[data-path]').dataset.path, searchTerm); });
      });
      grid.querySelectorAll('.ml-rename-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { renameItem(btn.closest('[data-path]').dataset.path, searchTerm); });
      });
    }).catch(function (e) {
      WorkspaceAuth.renderErrorState(grid, 'Failed to load media: ' + e.message);
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
    var status = document.getElementById('mlUploadStatus');
    status.textContent = 'Uploading... 0%';
    MediaLibrary.upload(file, function (pct) { status.textContent = 'Uploading... ' + pct + '%'; }).then(function () {
      status.textContent = 'Uploaded.';
      e.target.value = '';
      load(document.getElementById('mlSearchInput').value);
      setTimeout(function () { status.textContent = ''; }, 2000);
    }).catch(function (err) {
      status.textContent = 'Upload failed: ' + err.message;
    });
  }
});
