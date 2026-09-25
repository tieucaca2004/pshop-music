# Deploy + Founder Acceptance Test — HEAD feature/cms-ai-sprint2 (Audit đợt 1–4)

Chưa deploy. Chưa verify Production (môi trường Claude bị chặn mạng).

## 1. Frontend (Netlify, site 48256e20-1403-4017-af01-35588713a3a0)
```
git archive <HEAD> | tar -x -C /tmp/psh-deploy
netlify deploy --site 48256e20-1403-4017-af01-35588713a3a0 --dir /tmp/psh-deploy        # draft
netlify deploy --site 48256e20-1403-4017-af01-35588713a3a0 --dir /tmp/psh-deploy --prod # sau khi draft đạt
```
Rollback: Netlify UI → Deploys → bản trước → "Publish deploy".

## 2. Kiểm tra sau deploy (curl)
| URL | Kỳ vọng |
|---|---|
| https://pshopmusic.com/n8n-data/config | 404 |
| https://pshopmusic.com/CLAUDE.md | 404 |
| https://pshopmusic.com/admin/a-tieu/seed.html | 404 |
| https://pshopmusic.com/workspace/pshop-music | 200 (console/workspace.html) |
| https://pshopmusic.com/sitemap.xml | 200, bắt đầu `<?xml`, domain pshopmusic.com |
| https://pshopmusic.com/ | 200, canonical https://pshopmusic.com |

## 3. Founder Acceptance Test (UI)
1. Sản phẩm: sửa SP A → Lưu → tạo SP mới B → B KHÔNG có slug/SEO của A.
2. Duyệt nội dung: publish 1 nháp Product AI → chỉ field có nội dung thay đổi.
3. Banner AI publish → banner ở trạng thái "Tạm tắt".
4. Media Center / Plugin AI: nút "+ THÊM ẢNH" mở thư viện ảnh.
5. Thư viện ảnh: danh sách ảnh hiện (cần deploy storage.rules).
6. Founder Agent: xoá phông → phải bấm "ÁP DỤNG" mới đổi ảnh.

## 4. Chờ Founder duyệt (KHÔNG deploy khi chưa duyệt)
- `docs/security/registration-security.patch` → `git apply -p0 …` → `firebase deploy --only functions`.
- `docs/security/tenant-dashboard-bid.patch` → `git apply -p0 …`.
- `firebase deploy --only storage` (storage.rules list fix).
- Database Rules: KHÔNG deploy database.rules.json nguyên trạng (thiếu 9 node).
