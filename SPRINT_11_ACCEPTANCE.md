# SPRINT 11 ACCEPTANCE CRITERIA

**Trạng thái: DỰ THẢO.** Tiêu chí nghiệm thu cho từng Requirement — dùng khi đóng Sprint 11, đối chiếu tại `docs/SPRINT_11_FINAL_REPORT.md`.

## Requirement #1 — One Click Marketing: Cầu nối Generate Thật

- [ ] Bấm "GENERATE" tạo đúng 1 Job/output cho 5 output có Plugin tương ứng (Website Article/Facebook Post/SEO Metadata/Banner Request/AI Image Request).
- [ ] "Video Request" vẫn hiển thị "chưa có năng lực" — không tạo Job giả.
- [ ] Review Center hiển thị trạng thái Job thật (queued/running/completed/failed), cập nhật theo thời gian thực hoặc khi làm mới trang.
- [ ] Kết quả cuối là Draft trong `aiDrafts`, KHÔNG tự Publish.
- [ ] `js/one-click-marketing.js` không bị sửa để gọi AI trực tiếp.
- [ ] Editor thiếu quyền `ai.generate.*` tương ứng bị chặn đúng, có ghi Log `permission_denied`.
- [ ] 0 commit chạm vào `plugin-manager.js`/`job-queue.js`/`provider-registry.js`/`permission-service.js`.

## Requirement #2 — AI-Assist Inline trong CMS Forms

- [ ] Form Product có nút "Viết mô tả bằng AI" cạnh field Description.
- [ ] Nút chạy đúng Plugin "Product Description Generator" với `productId` hiện tại, không yêu cầu chọn lại.
- [ ] Kết quả là Draft, Founder vẫn phải Review & Publish thủ công.
- [ ] Nút ẩn nếu Editor không có quyền `ai.generate.product` hoặc Plugin bị Disable.
- [ ] `admin/ai/index.html` không bị đổi hành vi.
- [ ] Ghi rõ trong Final Report nếu chỉ làm Product (chưa làm Blog/Banner/Slider) — không tuyên bố đã làm toàn bộ CMS.

## Requirement #3 — Gói Marketing: Decision Record Lưu trữ bền vững

- [ ] `docs/DECISION_RECORD_MARKETING_PACKAGE_PERSISTENCE.md` tồn tại, trình bày đủ Option A/B.
- [ ] Không có code Database Structure nào được viết.
- [ ] Không tự chọn phương án thay Chief Architect.

## Requirement #4 — Sprint 11 Final Review & Close

- [ ] Bảng Verify Requirements #1-#3 xác nhận qua `git log` thật (không dựa hội thoại).
- [ ] 0 Regression trên AI Framework/Queue/Provider Manager/Permission Service/AI Task Router/Firebase Rules/Workflow Engine.
- [ ] `docs/SPRINT_11_FINAL_REPORT.md` được tạo, gồm Sprint Health Score.
- [ ] `CHANGELOG.md`/`PROJECT_ARCHITECTURE.md`/`ROADMAP.md` cập nhật đầy đủ.
- [ ] Commit + push lên `feature/cms-ai-sprint2`, không merge `main`, không tự bắt đầu Sprint 12.
