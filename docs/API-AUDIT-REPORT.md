# API ARCHITECTURE AUDIT — Báo cáo

Trạng thái: **Awaiting Founder Review** (audit-only, 0 sửa đổi code). Production: **NOT DEPLOYED**.

## 1. Baseline
- Branch `feature/cms-ai-sprint2`, HEAD `a450956` — **khác prompt (5ceccf1)**: HEAD thực tế gồm thêm các commit Workflow (WF-D1..D7, GAP1..6), đã push, working tree sạch.
- Commit frozen 8869226 / a950352 / 5ceccf1 không bị sửa.
- **Phát hiện về 5ceccf1:** micro-fix đó dựa trên tiền đề sai. Harness cũ dùng `shared/middleware.js` sendError (FORBIDDEN→400); gateway thật dùng `shared/response.js` vốn đã map FORBIDDEN→403. Thay đổi vô hại, không cần revert, nhưng lý do ghi trong commit là artefact của harness.

## 2. Inventory
`docs/API-AUDIT-INVENTORY.md`: 7 Cloud Functions, ~30 router gateway, 104 route đại diện đã probe runtime, cộng 8 entry standalone/async.

## 3. Architecture Map
Client → `apiGateway` (rate limit → router theo thứ tự) → auth legacy `authenticate()` hoặc tenant `verifyAuth→requireBusiness→requireRole` → RTDB. AI: `/v1/ai/:type/generate` → `apiAsyncJobs` → `aiGenerateWorker` → `aiDrafts` → `/v1/drafts/:id/publish`. Standalone `openaiProxy`/`facebook*` đi đường riêng qua `validateRequest` (index.js:79).

## 4. Auth
Token sai/thiếu → 401 ở route tenant. Legacy: ANON → **403 thay vì 401** (ERR-1). Người dùng chưa verify email bị chặn (EMAIL_NOT_VERIFIED) — OK.

## 5. Authorization
RBAC legacy đúng theo role trên 97 route. Lỗ hổng: PAY-1 (callback không có requireRole), OAI-1/FB-1 (standalone chấp nhận mọi role), JOB-1 (agent đọc mọi job), AGT-1 (agent publish draft — cần quyết định).

## 6. Tenant Isolation
Không rò rỉ cross-tenant: TEN-3/4 (không claim, qua path/header → 403), BODY-1 (businessId trong body bị bỏ qua), custom-claims fix giữ nguyên. TEN-1: có claim B gọi URL A → 200 với dữ liệu của B (mismatch im lặng, không lộ).

## 7. Input Validation
VAL-1/2/3: tenant product nhận name 200KB, name toàn khoảng trắng, price âm, `price:"abc"` → 201.

## 8. DB/Storage
USR-1: DELETE user không tồn tại → 200. PAY-1 ghi `orders.paymentStatus`. AI-2 tạo job trùng.

## 9. Error Contract
ERR-1 (403 cho anonymous), ERR-2 (`/v1/media`, `/v1/openclaw/capabilities` → 401 cho user đã xác thực), ERR-3 (sub-route tenant lạ → 403 SUPER_ADMIN_REQUIRED thay vì 404), TEAM-4 (502 lộ message nội bộ).

## 10. Async
`apiAsyncJobs` chạy qua worker. Không có idempotency key (AI-2). JOB-1 thiếu kiểm owner khi GET.

## 11. AI
AI-1 (không role → 403), AI-3 (agent ngoài scope → 403), AI-4 (type sai → 400) đều đúng. OAI-1: `openaiProxy` bỏ qua scope agent và không rate limit.

## 12. Workflow API
Đã audit ở sprint Workflow (tests/workflow-*.test.js). Workflow trả `status` đồng bộ `workflowState` (GAP5).

## 13. Existing Test Review
| Test | Phân loại |
|---|---|
| functions/tests/apiAdapter.test.js | **BROKEN** (`admin.database is not a function`) |
| registration-security.test.js, custom-claims-security.test.js | **WEAK_TEST**: assert HTTP status không qua gateway thật |
| runtime.integration.test.js, tests/e2e/t_reg.js | script-style, cần môi trường ngoài; không chạy trong audit (chưa phân loại chắc) |
| Rules tests | kỹ thuật chạy qua |
| tests/workflow-worker.test.js | chạy qua (chỉ orchestration) |
| Route gateway | **MISSING** gần như toàn bộ |

## 14. API Matrix
`docs/API-AUDIT-MATRIX.md`.

## 15. Bugs (triage)
| ID | API | File / Function | Severity | Reproduction | Expected | Actual | Root cause | Security | Data | Minimal fix | Regression test |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PAY-1 | POST /v1/businesses/:bid/payments/callback/:provider | routes/payments.js callback; shared/paymentAdapters.js verifyWebhook | **HIGH** | Đăng nhập business_viewer của A → POST callback/mock `{transactionId,status:'paid'}` | 403 | 200, transaction + order.paymentStatus = paid | Không có requireRole; verifyWebhook luôn `valid:true` | Thành viên quyền thấp làm giả thanh toán | Sai trạng thái đơn hàng | requireRole('business_admin') cho callback nội bộ + kiểm chữ ký thật | viewer/editor → 403; admin → 200 |
| PAY-2 | cùng route | routes/payments.js | HIGH (chức năng) | Provider gọi webhook không có Firebase token | 200 sau khi kiểm chữ ký | 401 | Webhook đặt sau verifyAuth | — | Callback thật không bao giờ tới | Route webhook công khai riêng + bắt buộc chữ ký | chữ ký sai → 401, đúng → 200 |
| OAI-1 | openaiProxy | index.js:79 validateRequest, :192 | MEDIUM | Token agent → POST openaiProxy | 403 ngoài scope | Qua auth (runtime 400 validation) | validateRequest nhận mọi role | Vượt RBAC AI, tốn chi phí OpenAI | — | Giới hạn role admin/editor (+ rate limit) | agent → 403 |
| FB-1 | facebookPublish | index.js:592 | MEDIUM | Token agent → POST facebookPublish | 403 | Qua auth (runtime 400 "Chưa kết nối") | Như trên | Agent đăng lên Fanpage thật | Bài đăng công khai | Check role admin/editor như gateway | agent → 403 |
| JOB-1 | GET /v1/jobs/:id | routes/jobsLogs.js | MEDIUM | agent GET job của người khác | 403/404 | 200, lộ uid + webhookUrl | Không kiểm owner/role | Lộ thông tin | — | Chỉ admin hoặc owner | agent xem job người khác → 403 |
| TEAM-3 | POST team/invite | routes/team.js | MEDIUM | admin mời user mới | Không trả mật khẩu | Response có tempPassword | Thiết kế trả thẳng | Mật khẩu vào log/proxy | — | Dùng password-reset link | response không chứa tempPassword |
| TEAM-4 | GET team | routes/team.js sort | LOW | member không có email/displayName | 200 | 502 + message nội bộ | `(a.displayName||a.email).localeCompare` trên undefined | Lộ chi tiết lỗi | — | fallback `|| ''` | member thiếu field → 200 |
| AI-2 | POST /v1/ai/:type/generate async | routes/aiGenerate.js | LOW | Gửi 2 request giống hệt | 1 job | 2 job | Không có idempotency key | — | Chi phí AI trùng | Idempotency-Key tùy chọn | 2 request cùng key → 1 job |
| VAL-1/2/3 | POST tenant products | routes/products.js | LOW | name 200KB / "   " / price -1 / "abc" | 400 | 201 | Thiếu validate | — | Dữ liệu rác | Validate trim/độ dài/số ≥ 0 | 4 case → 400 |
| USR-1 | DELETE /v1/users/:uid | routes/users.js | LOW | DELETE uid không tồn tại | 404 | 200 | Không kiểm tồn tại | — | — | Kiểm tồn tại trước | → 404 |
| ERR-1 | legacy writes/admin routes | shared/auth.js authenticate | LOW | ANON gọi | 401 | 403 | Mã lỗi chung | — | — | 401 khi thiếu token | ANON → 401 |
| ERR-2 | /v1/media, /v1/openclaw/capabilities | routes/media.js, openclaw.js | LOW | user không role gọi | 403 | 401 | Map sai mã | — | — | 403 | → 403 |
| ERR-3 | sub-route tenant lạ | routes/businesses.js catch-all | LOW | GET /businesses/A/reports/sales | 404 | 403 SUPER_ADMIN_REQUIRED | catch-all nuốt route | Gây hiểu nhầm | — | 404 cho sub-path không khớp | → 404 |
| TEN-1 | tenant routes | shared/tenant.js resolveBusinessId | LOW | claim B gọi URL A | 403 hoặc dữ liệu A theo quyền | 200 dữ liệu B | claims ưu tiên hơn URL | Không lộ | — | Trả 403 khi URL bid ≠ claims bid (trừ super) | → 403 |

## 16. Weak/False-Positive Tests
registration-security, custom-claims-security (assert status không qua gateway — chính kiểu này dẫn tới tiền đề sai của 5ceccf1); apiAdapter.test.js broken.

## 17. Missing Tests
Gần như mọi route gateway; payments callback; standalone openaiProxy/facebook*; idempotency async; ownership GET /v1/jobs/:id.

## 18. Security Findings
HIGH: PAY-1, PAY-2. MEDIUM: OAI-1, FB-1, JOB-1, TEAM-3. Không có rò rỉ cross-tenant. Không có lỗi CRITICAL nên **không sửa code** trong lượt này (đúng FIX POLICY).

## 19. Recommended Fix Order
1. PAY-1 + PAY-2 (payments callback)
2. OAI-1 + FB-1 (validateRequest theo role)
3. JOB-1
4. TEAM-3
5. TEAM-4, USR-1, VAL-*
6. ERR-1/2/3, TEN-1
7. AI-2
8. Test gateway + sửa apiAdapter.test.js

## 20. Founder Decisions
- AGT-1: agent có được publish draft (→ blogPosts thật) không? Hiện có, do quyền `drafts.manage`.
- PAY: đã có provider thanh toán thật chưa? Nếu chưa thì chỉ cần khoá callback cho business_admin.
- Duyệt thứ tự sửa ở mục 19.

## 21. Files Changed
Chỉ docs: `docs/API-AUDIT-INVENTORY.md`, `docs/API-AUDIT-MATRIX.md`, `docs/API-AUDIT-REPORT.md`. 0 sửa đổi code, Rules, dữ liệu.

## 22. Git
Commit docs trên `feature/cms-ai-sprint2`, đã push.

## 23. Production: NOT DEPLOYED
Ghi chú: `routes/facebook.js` hardcode `FUNCTIONS_BASE` là URL Production. Khi harness gọi `/v1/facebook/publish` bằng admin, gateway proxy ra URL đó và bị chặn 403 ở tầng mạng. Không có request nào thành công tới Production; dữ liệu Production không bị đụng.
