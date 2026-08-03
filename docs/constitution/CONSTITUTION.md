# CONSTITUTION — PSH Platform (Pshop Music)

Quy ước điều hành nền tảng. Đây là quy tắc tối thượng — mọi Sprint/directive làm việc phải tuân thủ trừ khi Founder ra directive mới hơn (directive mới nhất thắng).

## 1. Founder

- **Founder:** StormT (Telegram @StormT) — Lead user / Founder / First production customer.
- Founder là người duy nhất ra directive và quyết định scope.

## 2. Nguyên tắc Code (bất biến)

1. **Không sửa code hiện có khi chưa Founder duyệt.** Nếu cần đổi code → STOP, giải thích, liệt kê file bị ảnh hưởng, chờ duyệt.
2. **Không cải tiến tự phát.** Không refactor/rename/restructure/redesign trừ khi được yêu cầu.
3. **Chỉ implement scope Sprint hiện tại.** Không thêm tính năng, không đổi kiến trúc, không mở module kinh doanh ngoài phạm vi.
4. **Code production hiện có là nguồn sự thật.** Đọc trước khi viết. Tái dùng trước khi tạo mới.
5. **Reuse Platform Core.** Không duplicate business logic/component/service/API/route.
6. **Luôn deploy chuẩn production.** Không placeholder, không mock, không demo card, không prototype.
7. **Thích thực thi hơn lên kế hoạch.** Khi Founder nói "Execute deployment" → thực thi, đừng lên kế hoạch/giải thích.
8. **Git workflow:** dev trên `feature/cms-ai-sprint2`. Một commit sạch mỗi Sprint. Không force push, không rewrite history.
9. **Không build nền tảng cho khách hàng công cộng.** PSH là hệ điều hành cá nhân của Founder.
10. **Nếu bị chặn bởi sandbox:** giải thích đúng hạn chế + thay đổi tối thiểu để gỡ.

## 3. Nguồn sự thật

- **GitHub = Single Source of Truth** — gồm code + toàn bộ tài liệu kiến trúc (constitution, directives, architecture, ADR, roadmap, changelog, sprint log, product/cms/workflow/automation architecture, release verification, runtime trace, root cause, migration plan, TODO).
- Tài liệu cũ lệch pha code multi-tenant hiện tại không còn là nguồn đáng tin nếu không đối chiếu code.
- Runtime Evidence thắng suy luận.

## 4. Release / Verification

- **Release Pipeline:** Netlify static site (`command=""`, `publish="."`) — KHÔNG có build step, `node --check` KHÔNG thuộc pipeline.
- **Release Verification** = State Machine Atomic Transaction, chỉ Runtime: STEP 1 Login → 2 Business → 3 CMS → 4 Product → 5 SEO → 6 Save → 7 Refresh → 8 Reopen → 9 Website → 10 Runtime HTML (DB ↔ Website) → 11 Google SEO. Chỉ PASS/FAIL từ Runtime Evidence; dừng tại bước FAIL; không retry/recover/audit/build.

## 5. AI Assistant (Workflow Engine Plugin)

- Workflow bắt buộc: `CMS → AI Plugin → Draft → Admin Review → Publish`. AI KHÔNG tự publish.
- AI chỉ đọc qua `DataProvider`; chỉ ghi qua `publishToTarget()` khi Admin bấm Publish.

## Liên quan

- `AI_RULES.md` (chi tiết AI) · `docs/decision-records/ADRs.md` · `docs/architecture/*`
