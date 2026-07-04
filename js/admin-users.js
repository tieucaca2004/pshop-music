/*
 * Users & Roles (admin/users.html) — admin-only. Lists everyone who has an
 * entry in the "roles" node, lets an admin create new accounts (via a
 * secondary Firebase app instance so creating a user doesn't sign the
 * current admin out), and revoke access.
 *
 * Limitation: revoking only deletes the "roles" entry (blocks CMS login),
 * it does NOT delete the underlying Firebase Auth account — the client SDK
 * has no permission to delete other users' Auth accounts. To fully remove
 * an account, delete it in Firebase Console → Authentication.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'users', title: 'NGƯỜI DÙNG & PHÂN QUYỀN', requiredRole: 'admin' }).then(load);

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function load() {
    firebase.database().ref('roles').once('value').then(snap => {
      const val = snap.val() || {};
      const users = Object.keys(val).map(uid => Object.assign({ uid }, val[uid]));
      render(users);
    });
  }

  function render(users) {
    document.getElementById('userTotal').textContent = users.length;
    const body = document.getElementById('userTableBody');
    if (!users.length) {
      body.innerHTML = '<tr><td colspan="4" style="color:var(--ink-mute);text-align:center;padding:2rem">Chưa có người dùng nào.</td></tr>';
      return;
    }
    const currentUid = AdminAuth.getUser() ? AdminAuth.getUser().uid : null;
    body.innerHTML = users.map(u => `
      <tr>
        <td>${escapeHtml(u.name || '')}</td>
        <td>${escapeHtml(u.email || '')}</td>
        <td>${u.role === 'admin' ? 'Admin' : 'Editor'}</td>
        <td>
          ${u.uid === currentUid
            ? '<span class="small-muted">Tài khoản của bạn</span>'
            : `<button class="btn-danger" onclick="AdminUsers.revoke('${u.uid}')">Thu hồi quyền</button>`}
        </td>
      </tr>`).join('');
  }

  function revoke(uid) {
    if (!confirm('Thu hồi quyền truy cập CMS của tài khoản này? Tài khoản đăng nhập vẫn còn tồn tại trên Firebase, chỉ mất quyền vào trang quản trị.')) return;
    firebase.database().ref('roles/' + uid).remove().then(load);
  }

  function createUser() {
    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    if (!email || password.length < 6) {
      alert('Cần nhập email hợp lệ và mật khẩu tối thiểu 6 ký tự.');
      return;
    }
    const secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary-' + Date.now());
    secondaryApp.auth().createUserWithEmailAndPassword(email, password)
      .then(cred => firebase.database().ref('roles/' + cred.user.uid).set({ email, name: name || email, role, createdAt: Date.now() }))
      .then(() => secondaryApp.auth().signOut())
      .then(() => secondaryApp.delete())
      .then(() => {
        showStatus('Đã tạo tài khoản mới.');
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserPassword').value = '';
        load();
      })
      .catch(err => {
        alert('Không tạo được tài khoản: ' + (err.code === 'auth/email-already-in-use' ? 'Email đã được sử dụng.' : err.message));
        secondaryApp.delete();
      });
  }

  function showStatus(msg) {
    const el = document.getElementById('userStatus');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  document.getElementById('createUserBtn').addEventListener('click', createUser);

  window.AdminUsers = { revoke };
});
