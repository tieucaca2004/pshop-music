# Sprint 12 Handover — điền khi đóng Sprint 11

**Mục đích**: gói gọn mọi thứ Sprint 12 Planning cần biết mà KHÔNG phải đọc lại toàn bộ lịch sử Sprint 1-11. Điền ngay sau khi `docs/SPRINT_11_FINAL_REPORT.md` hoàn tất.

## 1. Trạng thái Repository tại thời điểm bàn giao

- Branch: `feature/cms-ai-sprint2` (chưa merge `main`).
- Commit cuối cùng Sprint 11: `_______`
- Working tree: [ ] sạch / [ ] còn file DRAFT chưa commit (liệt kê: _______)

## 2. Sprint 11 — tóm tắt 1 dòng mỗi Requirement

1. One Click Marketing — Cầu nối Generate Thật: _______
2. AI-Assist Inline trong CMS Forms: _______
3. Gói Marketing — Decision Record Lưu trữ bền vững: _______
4. Sprint 11 Final Review & Close: _______

## 3. Quyết định đang CHỜ Chief Architect (không tự chọn thay)

- [ ] 3 quyết định Business Manager (`docs/DECISION_RECORD_BUSINESS_MANAGER.md`) — vẫn treo từ Sprint 10, chưa chọn.
- [ ] Quyết định Gói Marketing Persistence (`docs/DECISION_RECORD_MARKETING_PACKAGE_PERSISTENCE.md`, nếu Requirement #3 Sprint 11 đã tạo) — Option A hay B.
- [ ] Số phận việc tách "AI Content"/"AI Image" thành 2 trang riêng (đã ghi nhận từ Sprint 10, chưa quyết định có làm hay không).

## 4. Việc vận hành đang CHỜ người thật thao tác (không phải code)

- [ ] Deploy Cloud Function `openaiProxy` (`firebase deploy --only functions`).
- [ ] Deploy Firebase Database Rules (`firebase deploy --only database`, xem `docs/FIREBASE_RULES_DEPLOYMENT.md`).
- [ ] Deploy Firebase Storage Rules (`firebase deploy --only storage`, xem `docs/FIREBASE_STORAGE_RULES_DEPLOYMENT.md`).

## 5. Technical Debt kế thừa (không đổi từ Sprint 10 trừ khi Sprint 11 có xử lý)

- `escapeHtml()` lặp 26 file, `rangeStartMs()` lặp 3 file.
- `ContextBuilder` chưa Plugin nào dùng.
- Cost Tracking vẫn ước tính.
- AI Task Router rule-based.
- Job Queue V1 (chạy phía trình duyệt).
- [ ] Cập nhật thêm nếu Sprint 11 phát sinh nợ mới: _______

## 6. Founder Journey — trạng thái tại thời điểm bàn giao

| Bước | Trạng thái |
|---|---|
| Home | _______ |
| Add Product (+ AI-assist inline nếu Sprint 11 làm) | _______ |
| Marketing | _______ |
| Review | _______ |
| Generate (thật hay giả) | _______ |
| Publish | _______ |

## 7. Gợi ý ưu tiên cho Sprint 12 Planning (chỉ gợi ý, không phải Requirement đã duyệt)

- [ ] điền dựa trên mục "Mục đề xuất chuyển sang Sprint 12" trong `docs/SPRINT_11_FINAL_REPORT.md`

## 8. Câu mở đầu chuẩn cho phiên Sprint 12 Planning

> "Tiếp tục theo SPRINT_12_HANDOVER.md — [tên file thật sau khi đổi từ Template này]."
