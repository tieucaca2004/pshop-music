# WORKFLOW ENGINE — Architecture

Kiến trúc Workflow Engine của PSH Platform. Nội dung chi tiết nằm tại `AI_RULES.md` (quy tắc bắt buộc) — file này là chỉ mục tổng hợp.

## 1. Mô hình

PSH AI Assistant là **Workflow Engine dạng Plugin**, không phải chatbot.

```
CMS → AI Plugin → Draft → Admin Review → Publish
```

- AI KHÔNG tự publish. Mọi kết quả dừng ở **Draft** (node `aiDrafts`), chỉ chuyển thành dữ liệu thật khi Admin/Editor bấm **Duyệt & Publish** trong `admin/ai/drafts.html`.

## 2. Pipeline bắt buộc (DataProvider)

```
AI Plugin → DataProvider (IDataProvider) → CMS Database → Context → AI Provider
```

- AI chỉ đọc qua `DataProvider`, không gọi thẳng `DB`/`CategoryDB`/`BlogDB`/`SeoDB`/`SiteContentDB`.
- Hàm ghi thật chỉ gọi ở `publishToTarget()` trong `js/admin-ai.js`, chạy khi Admin bấm Publish.

## 3. Async AI Generation (Sprint 15)

```
queueGeneration() → apiAsyncJobs (job) → aiGenerateWorker (RTDB trigger onValueCreated)
→ runGeneration() (loadContext → buildPrompt → OpenAI → mapToDraftContent → DraftDB.add)
```

- Job transition: `queued → running → completed`.
- `aiGenerateWorker` (asia-southeast1) + `apiGateway` (us-central1) — CHƯA deploy đầy đủ theo PROJECT_STATUS.

## 4. Workflow Automation (Sprint 7)

- `js/ai/workflow-engine.js` — ghép nhiều Plugin chạy tuần tự thủ công (Admin tự bấm "Chạy Workflow"), không lưu định nghĩa Workflow, chưa có trigger tự động nối chuỗi.

## 5. Agent RBAC (Sprint 15)

- Permission-based access cho role `agent` (3 module: blog-writer, image-generator, image-prompt-generator).

## Liên quan

- `AI_RULES.md` (chi tiết) · `docs/decision-records/ADRs.md`
