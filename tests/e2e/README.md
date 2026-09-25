# E2E CMS (Firebase Emulator + Chromium) — Full CMS Audit 2026-09-25

Chạy CMS thật (site phục vụ local) với Firebase Auth/Database/Storage **Emulator**
(rules = `database.rules.json` + `storage.rules` của repo) — KHÔNG chạm Production.

1. `npm i firebase-tools firebase quill@1.3.7 sortablejs@1.15.2` vào thư mục `$E2E_DEPS`.
2. Emulator: `firebase emulators:start --only auth,database,storage --project pshop-music --config tests/e2e/emulator.firebase.json`
   (copy `database.rules.json`, `storage.rules` cạnh file config).
3. Tạo user test qua Auth Emulator REST (admin/editor/norole @test.local, mật khẩu `Test12345!`) + `roles/uid_admin|uid_editor`.
4. `python3 -m http.server 8765 --bind 127.0.0.1` tại gốc repo.
5. `E2E_DEPS=... node tests/e2e/t_products.js` (v.v.). `t_reg.js` chạy trong `functions/` (cần `npm ci`).

Không có test nào ghi vào Production; ghi/xoá chỉ trên dữ liệu emulator.
