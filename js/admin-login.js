/*
 * Logic for admin/login.html — normal Firebase Auth login, plus a one-time
 * bootstrap flow: if the "roles" node is completely empty (first run), show
 * a "create first admin account" form instead of the login form. Once at
 * least one role exists, the bootstrap form never appears again — further
 * accounts must be created by an existing admin via admin/users.html.
 */
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const bootstrapForm = document.getElementById('bootstrapForm');
  const loginError = document.getElementById('loginError');
  const bootstrapError = document.getElementById('bootstrapError');

  if (new URLSearchParams(location.search).get('denied')) {
    loginError.textContent = 'Tài khoản này chưa được cấp quyền truy cập admin. Liên hệ Admin để được thêm quyền.';
    loginError.style.display = 'block';
  }

  firebase.database().ref('roles').once('value').then(snap => {
    if (!snap.exists()) {
      bootstrapForm.style.display = 'block';
      loginForm.style.display = 'none';
    } else {
      bootstrapForm.style.display = 'none';
      loginForm.style.display = 'block';
    }
  }).catch(err => {
    // Most likely cause: Database Rules haven't been updated yet to allow
    // reading "roles" — show the login form anyway with a clear warning
    // instead of leaving a blank page.
    console.error('Không đọc được node "roles":', err);
    loginForm.style.display = 'block';
    bootstrapForm.style.display = 'none';
    const warning = document.getElementById('rulesWarning');
    if (warning) warning.style.display = 'block';
  });

  document.getElementById('loginBtn').addEventListener('click', () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    loginError.style.display = 'none';
    firebase.auth().signInWithEmailAndPassword(email, password)
      .then(() => { location.href = 'index.html'; })
      .catch(err => {
        loginError.textContent = 'Đăng nhập thất bại: ' + translateAuthError(err);
        loginError.style.display = 'block';
      });
  });

  document.getElementById('bootstrapBtn').addEventListener('click', () => {
    const email = document.getElementById('bsEmail').value.trim();
    const password = document.getElementById('bsPassword').value;
    const name = document.getElementById('bsName').value.trim();
    bootstrapError.style.display = 'none';
    if (password.length < 6) {
      bootstrapError.textContent = 'Mật khẩu cần tối thiểu 6 ký tự.';
      bootstrapError.style.display = 'block';
      return;
    }

    function claimAdmin(user) {
      return firebase.database().ref('roles/' + user.uid).set({
        email, name: name || email, role: 'admin', createdAt: Date.now()
      });
    }

    firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(claimAdmin)
      .then(() => { location.href = 'index.html'; })
      .catch(err => {
        if (err.code === 'auth/email-already-in-use') {
          // Account was likely created on a previous attempt but the "roles"
          // write got blocked (e.g. rules not finished yet) — sign back in
          // with the same credentials and claim admin now, since "roles" is
          // still empty at this point.
          firebase.auth().signInWithEmailAndPassword(email, password)
            .then(cred => claimAdmin(cred.user))
            .then(() => { location.href = 'index.html'; })
            .catch(err2 => {
              bootstrapError.textContent = 'Không tạo được tài khoản: ' + translateAuthError(err2);
              bootstrapError.style.display = 'block';
            });
          return;
        }
        bootstrapError.textContent = 'Không tạo được tài khoản: ' + translateAuthError(err);
        bootstrapError.style.display = 'block';
      });
  });

  function translateAuthError(err) {
    const map = {
      'auth/invalid-email': 'Email không hợp lệ.',
      'auth/user-not-found': 'Không tìm thấy tài khoản.',
      'auth/wrong-password': 'Sai mật khẩu.',
      'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
      'auth/email-already-in-use': 'Email đã được sử dụng.',
      'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự).',
      'auth/operation-not-allowed': 'Đăng nhập Email/Mật khẩu chưa được bật trong Firebase Console (Authentication → Sign-in method).'
    };
    return map[err.code] || err.message;
  }

  [document.getElementById('loginPassword')].forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginBtn').click(); });
  });
});
