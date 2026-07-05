# Sprint 3 Completion Report — AI Framework: Framework → Production (OpenAI thật)

> **SPRINT 3 COMPLETED (Requirement #1–#6).** Báo cáo tổng kết cuối cùng: xem `docs/SPRINT_3_FINAL_REPORT.md`.

## ✅ Requirement #1–#5: HOÀN TẤT — đã commit, đã push lên `feature/cms-ai-sprint2`

**Sprint 4 trở đi: CHƯA bắt đầu.** Không triển khai thêm bất kỳ mục nào trong `ROADMAP.md` cho tới khi được giao rõ ràng ở sprint/requirement kế tiếp. Chưa merge `feature/cms-ai-sprint2` vào `main`.

Cập nhật lần cuối: xem `CHANGELOG.md` mục "Sprint 3". Lượt sau chỉ cần nói **"Tiếp tục theo SPRINT_3_PROGRESS.md"** để nối tiếp đúng phần còn thiếu.

---

## 1. Requirement Checklist

| # | Requirement | Trạng thái |
|---|---|---|
| 1 | Tích hợp OpenAI API thật vào Provider (API Key/Validate/Health/Test Connection) | ✅ Hoàn tất — kiến trúc Cloud Function Proxy (`functions/openaiProxy`) sau khi phát hiện rủi ro lưu key phía client, xem `ARCHITECTURE_REVIEW_SPRINT3.md` |
| 2 | Product AI Plugin: Framework → Production | ✅ Hoàn tất — không cần sửa code, hạ tầng Sprint 2 + Requirement #1 đã đủ |
| 3 | SEO AI Plugin: Framework → Production | ✅ Hoàn tất — không cần sửa code; ghi nhận SEO Plugin nhắm Blog Post (không phải Product) |
| 4 | Slider AI Plugin: Framework → Production | ✅ Hoàn tất — không cần sửa code; ghi nhận `ctaText` là field không có tác dụng (Sprint 2, không sửa) |
| 5 | End-to-End Integration Test + Regression Test + Completion Report | ✅ Hoàn tất — xem mục 2–5 bên dưới |

## 2. Bug Summary

Rà soát toàn bộ code AI Framework (Provider/Plugin/Queue/Permission/Draft/UI) phát hiện **2 bug** — cả 2 đều là thông báo UI/text lỗi thời (stale message), KHÔNG phải lỗi logic/kiến trúc. Đã sửa đúng phạm vi (chỉ sửa dòng text, không refactor, không đổi logic):

1. **`js/admin-ai.js` (hàm `runModule`)** — thông báo sau khi chạy job khẳng định "hiện chưa có nhà cung cấp AI thật nên mọi job sẽ báo lỗi... đúng thiết kế giai đoạn này" — câu này đúng ở Sprint 2 nhưng SAI kể từ Requirement #1 (OpenAI đã thật). Đã sửa thành thông báo trung lập, không giả định kết quả.
2. **`admin/ai/index.html`** — dòng giới thiệu Dashboard khẳng định tương tự ("Hiện chưa cấu hình nhà cung cấp AI thật... đây là thiết kế kiến trúc giai đoạn này, không phải lỗi"). Đã sửa để không còn khẳng định sai sự thật khi OpenAI đã Production.

Ngoài ra sửa 1 đoạn **comment** (không phải code chạy) trong `js/ai/provider-interface.js` mô tả `generate()`/`health()` là "luôn là stub" — nay ghi rõ OpenAI đã thật, Claude/Gemini/DeepSeek vẫn là stub, để tài liệu trong code khớp thực tế.

**Không phát hiện bug nào ở**: `permission-service.js`, `plugin-manager.js`, `provider-registry.js`, `job-queue.js`, `openai.js`, `functions/index.js`, `ai-db.js`, `cms-db.js` (`makeListDB`), `admin-ai-plugins.js`, `admin-ai-providers.js`, 3 plugin module (`product-description-writer.js`, `seo-generator.js`, `slider-generator.js`).

## 3. Architecture Verification

Xác nhận qua đọc code + chạy mô phỏng (mục 5) — Workflow đúng nguyên văn ở mọi bước, không có lệch pha kiến trúc:

```
User → Permission (PermissionService) → Queue (AIJobQueue) → AI Plugin
  → DataProvider → AI Provider (IAIProvider) → Cloud Function Proxy (chỉ OpenAI)
  → OpenAI API → Draft (DraftDB) → Human Review (admin/ai/drafts.html) → Completed
```

- `IAIPlugin` (metadata/validate/execute/cancel) và `IAIProvider` (generate/validate/health) — đúng 100% shape ban đầu, không method nào được thêm/bớt ở Sprint 3.
- Plugin không bao giờ biết provider cụ thể (OpenAI) — xác nhận qua `resolveForPlugin()` (Provider Manager) và qua việc `js/ai/modules/*.js` không import `js/ai/providers/*.js`.
- Cloud Function (`functions/openaiProxy`) không chứa Business Logic — chỉ Nhận/Validate/Gọi OpenAI/Trả kết quả (xem `functions/index.js`), đúng theo yêu cầu Requirement #1.
- Không có Database Structure/Collection mới nào phát sinh ở Requirement #2–#5 (chỉ Requirement #1 thêm 1 Cloud Function, không thêm node Firebase).

## 4. Security Verification

✅ **API Key không nằm trong Browser** — `js/ai/providers/openai.js` không chứa API key OpenAI ở đâu; chỉ gửi Firebase ID Token (`getIdToken()`) tới Cloud Function, không phải OpenAI key.
✅ **API Key không nằm trong Firebase Database** — `ProviderConfigDB`/`aiProviderConfig` (`js/ai/ai-db.js`) chỉ lưu `{enabled, model}` mỗi provider, không có field `apiKey` nào; đã xác nhận lại bằng cách đọc toàn bộ `admin/ai/providers.html`/`js/admin-ai-providers.js` — không có input field nào cho API key.
✅ **API Key chỉ tồn tại trong Cloud Function Environment** — `functions/index.js` dùng `defineSecret('OPENAI_API_KEY')` (Google Secret Manager qua Firebase Functions v2), chỉ đọc bằng `OPENAI_API_KEY.value()` bên trong function, không log ra ngoài, không trả về trong response.
✅ **Xác thực trước khi gọi OpenAI** — `validateRequest()` trong `functions/index.js` bắt buộc Bearer ID token hợp lệ (`admin.auth().verifyIdToken()`) + tài khoản có entry trong node `roles` (tái dùng đúng cơ chế phân quyền CMS, không tạo hệ thống auth mới) — chặn cả người dùng ẩn danh lẫn tài khoản không có vai trò CMS.

## 5. Integration Test Result

Do Cloud Function `openaiProxy` **chưa được deploy** (chặn ở bước `firebase login`/`firebase deploy`, cần người phụ trách hạ tầng tự thực hiện — xem mục 6), KHÔNG THỂ chạy 1 lượt Generate thật với response OpenAI thật trong phiên này. Thay vào đó, đã chạy **mô phỏng thực thi mã nguồn sản xuất thật** (không viết lại logic — dùng Node `vm` để load nguyên văn `js/ai/job-queue.js`, `js/ai/permission-service.js`, `js/ai/providers/openai.js`, và 3 file plugin, với Firebase/Cloud Function/OpenAI được thay bằng mock có kiểm soát) để xác nhận từng thành phần:

| Thành phần | Cách kiểm tra | Kết quả |
|---|---|---|
| Permission | `PermissionService.checkPluginExecution()` thật, mock `firebase.database()` trả về role | ✅ Editor được phép chạy plugin có quyền; user không có role / plugin không được gán quyền bị từ chối; **không tạo Job** (không gọi `enqueue()`); ghi đúng 1 Log `permission_denied` |
| Queue | `AIJobQueue` thật (`enqueue/resume/cancel/retryFailed`), mock Provider trả về thành công/lỗi tùy kịch bản | ✅ Pending(`queued`)→Running→Completed; item lỗi → Job `failed` khi TẤT CẢ item lỗi; `retryFailed()` đưa Job về `queued` và Resume thành công → `completed`, **không mất Job**; `cancel()` → `cancelled`, không bị `resume()` xử lý nhầm |
| AI Provider | `js/ai/providers/openai.js` thật, mock `firebase.auth()` + `fetch` (thay Cloud Function) | ✅ `validate()` đúng cả 3 trường hợp (chưa bật / chưa đăng nhập / hợp lệ); `health()` xử lý đúng cả thành công/lỗi/lỗi mạng, không crash; `generate()` trả đúng `text` khi thành công, `reject` đúng khi lỗi (để Queue Retry/Failed/Log); xác nhận request gửi Firebase ID token, KHÔNG gửi OpenAI key |
| AI Plugins | 3 file plugin thật, mock `DataProvider` với dữ liệu Product/Blog Post giả lập thực tế | ✅ Product/SEO/Slider Plugin đều `buildPrompt()` chứa dữ liệu thật (tên/brand/specs/category/title/excerpt) — không hardcode; `mapToDraftContent()` trả đúng cấu trúc Draft (kể cả xác nhận lại `ctaText` của Slider không phải AI sinh, đúng ghi nhận ở Requirement #4) |
| Draft Workflow | Suy ra từ Queue test — `DraftDB.add()` chỉ được gọi cho item `completed`, không cho item `failed` | ✅ Generate tạo đúng 1 Draft cho item thành công; publish thật vẫn qua nút "DUYỆT & PUBLISH" (`admin/ai/drafts.html`, không đổi ở Sprint 3) |
| Logging | Log thật ghi bởi Queue/PermissionService trong mô phỏng | ✅ Cả 4 trạng thái `completed`/`failed`/`cancelled`/`permission_denied` đều được ghi đúng, đủ field |
| Regression (Sprint 2) | `git log` xác nhận `js/ai/job-queue.js`, `plugin-manager.js`, `data-provider.js`, `provider-registry.js`, `permission-service.js` không bị sửa kể từ commit Sprint 2 Requirement #8 | ✅ Không Requirement nào của Sprint 2 bị đổi code; 2 bug fix ở mục 2 chỉ đổi text UI, không đổi logic |

Static check bổ sung: mở `admin/ai/index.html` qua static server nội bộ (không có phiên Firebase Auth) — toàn bộ ~30 script (Provider/Plugin/Queue/Permission/Modules) load không lỗi console, không 404; trang tự chuyển hướng đúng sang `admin/login` (đúng hành vi `AdminAuth` khi chưa đăng nhập).

**Việc CHƯA kiểm tra được** (phụ thuộc bên ngoài, không phải lỗi code): Generate thật với response OpenAI thật qua Cloud Function đã deploy; Test Connection/Health thật trên `admin/ai/providers.html` với phiên đăng nhập CMS thật.

## 6. Production Readiness

- **Code**: SẴN SÀNG Production cho cả 3 plugin (Product/SEO/Slider) — không cần thêm code, chỉ cần cấu hình vận hành.
- **Còn thiếu để chạy thật** (thao tác CLI, người phụ trách hạ tầng tự làm, không qua chat):
  1. `firebase login` (OAuth tương tác).
  2. `firebase functions:secrets:set OPENAI_API_KEY` — nhập **key KHÔNG bị lộ** (không dán vào chat) trực tiếp vào prompt CLI.
  3. `firebase deploy --only functions` — sau đó thay URL thật vào `OPENAI_PROXY_URL` ở đầu `js/ai/providers/openai.js` (hiện là placeholder `us-central1-pshop-music.cloudfunctions.net/openaiProxy`, cần đối chiếu lại URL Firebase CLI in ra vì Cloud Functions 2nd gen có thể trả URL dạng Cloud Run khác).
  4. Vào `admin/ai/providers.html` bật OpenAI + đặt model, vào `admin/ai/plugins.html` gán "OpenAI" cho từng plugin muốn chạy thật (Product/SEO/Slider).
  5. Chạy lại đúng checklist ở mục 5 (dòng "Việc CHƯA kiểm tra được") với dữ liệu/API thật.
- **Rủi ro còn lại đã biết** (không cấp bách, đã ghi `ROADMAP.md`): chưa có rate limiting cho Cloud Function Proxy; chưa version-control Firebase Database Rules trong repo (rules quản lý trực tiếp trên Console, không phải do Sprint 3 gây ra).

## 7. Ý tưởng phát sinh khi kiểm thử (không triển khai — đã ghi `ROADMAP.md`)

- Version-control Firebase Realtime Database Rules (`database.rules.json`) trong repo thay vì chỉ quản lý trên Console — giúp review/rollback rules dễ hơn, đặc biệt quan trọng sau khi có Cloud Function đọc node `roles`.
- Test tự động (unit test) cho `job-queue.js`/`permission-service.js`/3 plugin — mô phỏng ở mục 5 viết thủ công cho phiên này, chưa phải bộ test tự động chạy trong CI.

## Việc cần người dùng làm (không tự động được)

- Hoàn tất deploy Cloud Function theo 4 bước ở mục 6 — đây là điều kiện DUY NHẤT còn chặn để AI Framework chạy thật với OpenAI trên Production.
- Sau khi deploy, chạy thử 1 lượt Generate thật cho từng plugin (Product/SEO/Slider) và xác nhận Draft/Log đúng như mô phỏng ở mục 5.
