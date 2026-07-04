/*
 * Firebase Storage upload helper, shared by every admin manager that needs
 * an "Upload ảnh" button (banner, slider, category, blog cover, product
 * images). Requires firebase-storage-compat.js + js/firebase-config.js
 * loaded before this file.
 */
const StorageUpload = (function () {
  function uploadImage(file, folder, onProgress) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('Không có file')); return; }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = (folder || 'uploads') + '/' + Date.now() + '-' + safeName;
      const ref = firebase.storage().ref().child(path);
      const task = ref.put(file);
      task.on('state_changed', snapshot => {
        if (onProgress) onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      }, reject, () => {
        task.snapshot.ref.getDownloadURL().then(resolve).catch(reject);
      });
    });
  }

  // Wires a hidden <input type="file"> to upload-on-change, showing progress
  // in statusEl and handing the resulting download URL to onUploaded(url).
  function attachUploadInput(fileInputEl, statusEl, folder, onUploaded) {
    fileInputEl.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      statusEl.style.display = 'block';
      statusEl.textContent = 'Đang tải ảnh lên... 0%';
      uploadImage(file, folder, pct => { statusEl.textContent = 'Đang tải ảnh lên... ' + pct + '%'; })
        .then(url => {
          statusEl.textContent = 'Đã tải ảnh lên thành công.';
          onUploaded(url);
          setTimeout(() => { statusEl.style.display = 'none'; }, 2000);
        })
        .catch(err => {
          statusEl.textContent = 'Lỗi tải ảnh: ' + err.message;
        });
      e.target.value = '';
    });
  }

  return { uploadImage, attachUploadInput };
})();
