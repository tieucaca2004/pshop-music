# TOP 20 — VIỆC CẦN LÀM TIẾP THEO (PSH)

Sắp theo thứ tự ưu tiên (dependency trước). Mọi việc đều có bằng chứng từ PROJECT_STATUS.md. Không sửa code, không commit, không merge — chỉ đề xuất. **Độ khó:** S=nhỏ, M=trung bình, L=lớn. Đây là ước lượng.

---

## NHÓM 0 — GỠ KHỐI / HYGIENE (việc 1–6, dependency của mọi thứ khác)

**1. Deploy `aiGenerateWorker` (async AI worker)**
- Lý do: code hoàn chỉnh (`functions/index.js:965`) nhưng CHƯA deploy — comment `index.js:960-964` xác nhận. Async generation hiện không chạy nền thật.
- Lệnh (trên máy có Firebase CLI): `firebase deploy --only functions:aiGenerateWorker`
- Dependency: không có. ⏱ 15 phút. Độ khó: S.

**2. Deploy Database + Storage Rules (bảo mật)**
- Lý do: `database.rules.json` "chưa từng deploy" (sprint17-audit-summary; GAP §13). Production có thể đang chạy rules mặc định.
- Lệnh: `firebase deploy --only database,storage`
- Dependency: không. ⏱ 10 phút. S.

**3. Sửa 2 file broken ref trong PSH shell**
- Lý do: `psh/index.html:68,74` load `js/business-context.js` + `js/subscription-middleware.js` — **file không tồn tại** → 404/JS error khi mở `/psh/`. Bằng chứng `ls` xác nhận.
- Việc: tạo 2 file (hoặc xóa thẻ script nếu logic đã có chỗ khác).
- Dependency: không. ⏱ 30-60 phút. M.

**4. Sửa nav + trang Billing broken**
- Lý do: `psh/index.html:51,344` link `/admin/billing.html` — file không tồn tại.
- Việc: xóa khỏi nav hoặc tạo `admin/billing.html` thật.
- Dependency: #3 (cùng shell). ⏱ 30 phút. S-M.

**5. Sửa `admin/ai/content.html` rỗng + broken `admin-chrome.js`**
- Lý do: page load `js/admin-chrome.js` không tồn tại (`admin/ai/content.html:75`); page không content.
- Dependency: không. ⏱ 15-30 phút. S.

**6. Reconcile tài liệu vs code (lệch pha)**
- Lý do: `PSH_*.md`/`ROADMAP.md`/`GAP_ANALYSIS` snapshot 20/07, không khớp kiến trúc multi-tenant hiện tại → nguồn sự thật không đáng tin.
- Việc: cập nhật hoặc đánh dấu stale; bắt đầu từ `PROJECT_STATUS.md` này.
- Dependency: không. ⏱ 2-3 giờ. M.

---

## NHÓM 1 — HOÀN TẤT NỬA-DONE (việc 7–11)

**7. Bù RBAC enforcement (debt #1)**
- Lý do: `canAccess()` chỉ wire vào 3/~15 route files (GAP §13; Founder Review gọi đây là debt #1). Đây là rào chặn OpenClaw dùng được.
- Dependency: #1-#2 (rules thật mới enforce đúng). ⏱ 1 ngày. L.

**8. Kích hoạt role `agent` end-to-end (UI tạo được tài khoản agent)**
- Lý do: Founder Review rec #4 — UI không tạo được `agent` account; role vẫn rỗng. Cần cho Founder Agent hoạt động thật.
- Dependency: #7. ⏱ 4-6 giờ. M.

**9. Deploy/verify Sprint 15 frontend lên Netlify**
- Lý do: `CHANGELOG.md:5` "ĐANG CHỜ FRONTEND DEPLOY"; `ROADMAP.md:3` "⏳ NETLIFY PENDING". Cloud Functions đã xong.
- Dependency: #1. ⏱ 30 phút (cần login Netlify). S.

**10. Online/per-product SEO generation**
- Lý do: `GAP_ANALYSIS` §9 — AI SEO chỉ Blog, chưa per-product.
- Dependency: #1 (worker). ⏱ 1 ngày. M-L.

**11. Telegram draft-notify (business ops)**
- Lý do: Telegram hiện chỉ infra alerting (`health-center/notify-telegram.ps1`), chưa có route `/v1/telegram`. Founder rec #5.
- Dependency: #1 (async worker emits event). ⏱ 3-4 giờ. M.

---

## NHÓM 2 — OPENCLAW / ROUTER (việc 12–15)

**12. Commit `openclaw-router` lên GitHub + wire Telegram thật**
- Lý do: router đã hoàn chỉnh (13/13 test) nhưng **untracked** trong git và chưa connect Telegram. Đây là phần bạn yêu cầu làm.
- Dependency: #7 (agent role cần để router gọi đúng quyền). ⏱ 2-3 giờ. M.

**13. Kết nối OpenClaw session thật (Stage B→C)**
- Lý do: Founder Review rec #7 — phụ thuộc #8 (agent role). Hiện chưa session sống nào.
- Dependency: #7, #8. ⏱ 1 ngày (setup + test). L.

**14. Gỡ blocker Playwright MCP (cài system libs)**
- Lý do: cần screenshot/render verify thật. Bị chặn bởi thiếu 21 libs + không sudo trong sandbox.
- Việc: chạy apt install trên host (lệnh đã cung cấp) hoặc bật `tools.elevated`.
- Dependency: không (môi trường). ⏱ 10 phút (host). S.

**15. Verify render thật bằng Playwright (sau #14)**
- Lý do: hiện mới xác minh bằng HTTP + HTML; chưa console/network error check, chưa login test.
- Việc: launch → mở `pshopmusic.com` + `/psh/` → check console/network + screenshot + login + dashboard.
- Dependency: #14. ⏱ 1-2 giờ. M.

---

## NHÓM 3 — QUALITY / PRODUCTION (việc 16–18)

**16. Dọn dead code AI (services + content-engine + provider)**
- Lý do: ~20+ file orphan (PROJECT_STATUS §13) — không nơi load (`js/ai/services/*`, `js/ai/content-engine/*`). Tăng footprint JS (67 files ~788KB, ảnh hưởng Performance 58).
- Việc: xóa hoặc wire. Chỉ làm sau khi xác nhận không nơi dùng.
- Dependency: #6 (reconcile trước). ⏱ 1 ngày. M (cần thận trọng).

**17. Xây test suite thật + CI/CD**
- Lý do: chỉ có `functions/tests/apiAdapter.test.js` (2 `it()`); `functions/package.json` không script test; không `.github/workflows`. Hồ sơ "149-test" không nằm trong repo. Deploy thủ công.
- Dependency: không. ⏱ 2-3 ngày. L.

**18. Tối ưu Performance (Lighthouse 58 → ≥80)**
- Lý do: sprint17-audit: Performance 58 (LCP 8.87s home), Firebase waterfall, Google Fonts render-blocking, no critical CSS, không bundle. `GET /v1/health` ~5s (cold start).
- Dependency: #16 (giảm JS footprint trước). ⏱ 1-2 ngày. M-L.

---

## NHÓM 4 — TƯƠNG LAI (việc 19–20, CẦN QUYẾT ĐỊNH FOUNDER — Không tự build)

**19. Quyết định business: Orders / Inventory / Customers**
- Lý do: Founder Review rec #8 — Orders chạm tiền thật, KHÔNG tự build, cần quyết định. Hiện catalog-only (`GAP_ANALYSIS`: Orders/Customers/Inventory MISSING).
- Dependency: cần Founder quyết scope trước. Độ khó: L. ⏱ 2-4 tuần (nếu chọn làm).

**20. Multi-business (A Tiểu) + domain psh.vn hoàn tất**
- Lý do: 2 folder A Tiểu untracked; commit `1301d79` đổi `psh.vn` nhưng site vẫn `pshopmusic.com`; `DECISION_RECORD_BUSINESS_MANAGER` chưa implement (đúng chỉ thị — design-only).
- Dependency: #19 + tiến trình tiers. L. ⏱ 3-6 tuần.

---

## ƯU TIÊN GỢI Ý NGẮN

> Làm ngay nhóm 0 (1-6) — chúng gỡ khối và đều đã có code sẵn/chỉ sửa nhỏ. Trong nhóm 0, **#1 + #2 (deploy worker + rules) là 2 việc rẻ nhất, mở đường cho mọi thứ khác** — đúng phát hiện "2 gap rẻ đóng" của Founder Review. Sau đó nhóm 1 (RBAC + agent) rồi nhóm 2 (OpenClaw thật). Nhóm 4 chờ Founder quyết business.
