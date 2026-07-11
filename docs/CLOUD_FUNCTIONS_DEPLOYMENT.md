# Cloud Function `openaiProxy` — AI Provider Runtime Activation Guide

**Cập nhật (Sprint 12 Requirement #11 — Image AI):** `functions/index.js` vừa thêm action **`generate_image`** (gọi OpenAI Images API `dall-e-3` bằng ĐÚNG `OPENAI_API_KEY` đã có — không cần Secret/API Key mới, không cần bật thêm API nào ngoài những gì mục 0 bên dưới đã liệt kê) để phục vụ Plugin `image-generator` mới (`admin/ai/images.html`). **Nếu Cloud Function `openaiProxy` đã từng deploy trước đó, PHẢI chạy lại `firebase deploy --only functions` để bản deploy có action mới này — code cũ trên Production sẽ báo lỗi 400 "action không hợp lệ" cho tới khi redeploy.** Có phát sinh CHI PHÍ THẬT mới (DALL-E 3 tính phí theo mỗi lần gọi, khác cơ chế Chat Completions đã dùng cho các Plugin văn bản — Chief Architect nên biết trước khi cho phép Founder dùng rộng rãi). Xem checklist bổ sung ở mục 4.

Sprint 11 Requirement #3 (AI Provider Runtime Activation). Tài liệu này chuẩn bị đầy đủ để người vận hành (người có quyền truy cập Firebase Console/CLI thật + 1 API Key OpenAI thật) kích hoạt AI Runtime thật lần đầu tiên — bước deploy/kích hoạt thật sự **chưa được thực hiện và không được giả lập là đã thực hiện**.

Đây là khoảng hở đã biết, xuyên suốt từ Sprint 3 (`ARCHITECTURE_REVIEW_SPRINT3.md`, `functions/index.js` tạo lần đầu) — mọi Sprint từ đó tới nay đều ghi nhận lại đúng tình trạng này.

**Cập nhật (Sprint 11 Requirement #3, đợt Deployment Phase)** — đã xác minh CHÍNH XÁC hơn (không chỉ "không có CLI" chung chung như trước) bằng `gcloud` CLI (đã có sẵn, đã đăng nhập account `tieucaca2012@gmail.com` — xem mục 0). Chỉ đọc thông tin (mọi lệnh đều là `describe`/`list`, KHÔNG deploy/KHÔNG tạo/KHÔNG sửa gì trên project thật), để biết CHÍNH XÁC còn thiếu gì thay vì suy đoán chung chung.

**Cập nhật (đợt Blocker Resolution, cùng Requirement #3)** — Chief Architect đã xác nhận cho phép bật 2 API còn thiếu. Đã bật thành công `cloudfunctions.googleapis.com` và `secretmanager.googleapis.com` (`gcloud services enable` — cả 2 lệnh báo "finished successfully"). Trong lúc xác minh lại, phát hiện **1 blocker MỚI, nghiêm trọng hơn 2 API đã bật**: **Billing Account "Firebase Payment" (`01B88C-CA9680-D7BE63`) đang ở trạng thái ĐÓNG (`open: false`)** — xem mục 0. Đây là lý do thật khiến `gcloud secrets list` vẫn báo lỗi `BILLING_DISABLED` ngay cả sau khi Secret Manager API đã bật. Khắc phục billing account đóng là hành động quản lý tài khoản/thanh toán — **tuyệt đối ngoài phạm vi tự động hoá được, không ai (kể cả Chief Architect qua Claude) nên xử lý thay** — chỉ chủ tài khoản Google Cloud Billing mới mở lại được qua Console.

---

## 0. Tình trạng hiện tại (đã xác nhận bằng lệnh thật, không suy đoán)

| Câu hỏi | Trả lời |
|---|---|
| `functions/index.js` (Cloud Function `openaiProxy`) có tồn tại, đúng kiến trúc Proxy không lộ API Key phía client? | ✅ Có — dùng `defineSecret('OPENAI_API_KEY')` (Firebase Secret Manager, KHÔNG lưu Realtime Database/KHÔNG gửi xuống browser), xác thực Firebase Auth ID token + kiểm tra `roles/{uid}` (đúng cơ chế phân quyền CMS đã có, không tạo hệ thống Auth mới). |
| `functions/package.json`/`node_modules` có hợp lệ? | ✅ Có — `node -c functions/index.js` PASS, `firebase-admin`/`firebase-functions` đã có trong `node_modules`. |
| `firebase.json` có wiring đúng `functions`? | ✅ Có — `{"source": "functions", "codebase": "default", ...}`. |
| `.firebaserc` có trỏ đúng project? | ✅ Có — `"default": "pshop-music"`. |
| `js/ai/providers/openai.js` (Provider phía client) có gọi đúng qua Cloud Function Proxy (không gọi thẳng OpenAI)? | ✅ Có — `callOpenAiProxy()` lấy Firebase ID token, gọi `OPENAI_PROXY_URL` (hằng số, xem mục 2). |
| Firebase CLI (`firebase`) có cài đặt sẵn/xác thực không? | ⚠️ Không cài cố định trong PATH, nhưng chạy được qua `npx firebase-tools` — **CHƯA đăng nhập** (`npx firebase-tools projects:list` → `Error: Failed to authenticate, have you run firebase login?`). `firebase login` là luồng OAuth mở trình duyệt, phải làm thủ công 1 lần bởi người vận hành — không thể tự động hoá từ môi trường này. |
| gcloud CLI (Google Cloud SDK, độc lập với Firebase CLI) có xác thực không? | ✅ **Có** — `gcloud auth list` xác nhận account đang đăng nhập: `tieucaca2012@gmail.com`. Đây là phát hiện MỚI ở đợt này — xác nhận đúng account người vận hành có quyền thật trên Google Cloud, nhưng **KHÔNG thay thế được `firebase login`** (2 kho thông tin xác thực độc lập với nhau). |
| Account này có quyền truy cập project `pshop-music` thật không? | ✅ **Có** — `gcloud projects describe pshop-music` trả về project THẬT, tồn tại, `lifecycleState: ACTIVE`, `labels.firebase: enabled`. |
| Billing (gói trả phí, bắt buộc cho Cloud Functions v2) đã bật chưa? | ✅ **Đã bật** — `gcloud billing projects describe pshop-music` → `billingEnabled: true`. Không còn là điều kiện tiên quyết cần lo — đã thoả. |
| **Cloud Functions API (`cloudfunctions.googleapis.com`) đã bật trên project chưa?** | ✅ **ĐÃ BẬT** (đợt Blocker Resolution, Chief Architect đã xác nhận) — `gcloud services enable cloudfunctions.googleapis.com --project=pshop-music` → "finished successfully". Xác nhận lại bằng `gcloud functions list --project=pshop-music` → "Listed 0 items" (không còn lỗi `SERVICE_DISABLED`). |
| **Secret Manager API (`secretmanager.googleapis.com`) đã bật trên project chưa?** | ⚠️ **Lệnh bật API đã "finished successfully"**, NHƯNG gọi thật (`gcloud secrets list`) vẫn báo lỗi **`BILLING_DISABLED`** — nguyên nhân THẬT không phải API chưa bật, mà là **Billing Account đang đóng** (xem dòng "Billing Account" bên dưới). API đã bật đúng nghĩa, nhưng KHÔNG dùng được cho tới khi billing account được mở lại. |
| **Billing Account thật sự có "mở" (open) không — không chỉ "đã liên kết"?** | ❌ **ĐÓNG — phát hiện MỚI, quan trọng nhất đợt này.** `gcloud billing projects describe pshop-music` báo `billingEnabled: true` (chỉ có nghĩa "có liên kết 1 billing account"), nhưng `gcloud billing accounts describe 01B88C-CA9680-D7BE63` (tên: "Firebase Payment") trả về **`open: false`**. Đây là lý do thật khiến Secret Manager (và nhiều khả năng cả bước Cloud Build/deploy sau này) từ chối hoạt động dù API đã bật. **Chỉ chủ tài khoản Google Cloud Billing mới mở lại được** (Console → Billing → có thể do phương thức thanh toán hết hạn/bị từ chối, hoặc tài khoản bị đóng thủ công) — ngoài phạm vi tự động hoá, không xử lý thay. |
| **`OPENAI_API_KEY` đã được thiết lập trong Firebase Secret Manager chưa?** | ❌ **CHƯA** — dù Secret Manager API đã bật, KHÔNG THỂ tạo Secret cho tới khi Billing Account được mở lại (xem trên) VÀ chưa có giá trị Key thật nào được cung cấp bởi người vận hành. |
| **`OPENAI_PROXY_URL` trong `js/ai/providers/openai.js` (hiện là `https://us-central1-pshop-music.cloudfunctions.net/openaiProxy`) đã được xác nhận là URL THẬT chưa?** | ❓ **CHƯA XÁC NHẬN** — URL suy ra theo đúng quy ước đặt tên Cloud Functions v2, chưa xác nhận thật vì Function chưa deploy. |
| Claude/Gemini/DeepSeek Provider có tích hợp thật chưa? | ❌ Vẫn là stub CỐ Ý — quyết định kinh doanh "có cần đa dạng Provider hay không" chưa từng được đưa ra (Sprint 8 Architecture Challenge #5). Ngoài phạm vi Requirement #3. |

**Không tuyên bố "AI Runtime đã hoạt động thật"/"Provider đã kích hoạt"/"Generate thành công thật" — vì Cloud Functions API/Secret Manager API còn tắt, chưa deploy, chưa có Secret, chưa gọi được API OpenAI thật.**

**Quan trọng — vì sao KHÔNG tự động bật 2 API còn thiếu dù đã có quyền gcloud**: bật `cloudfunctions.googleapis.com`/`secretmanager.googleapis.com` là hành động thật trên 1 project Production đã bật Billing (có thể phát sinh chi phí khi các API này được SỬ DỤNG sau đó) — đây là hành động ảnh hưởng hạ tầng thật ngoài phạm vi máy cục bộ, cần Chief Architect/người vận hành xác nhận rõ ràng trước khi bật, đúng nguyên tắc "affects shared systems beyond local environment — always confirm first". Lệnh `gcloud functions list`/`gcloud secrets list` ở trên đã tự hỏi "(y/N)" để bật kèm theo — đã KHÔNG xác nhận, chỉ dùng để xác minh trạng thái (read-only).

---

## 1. Điều kiện tiên quyết (người vận hành cần chuẩn bị)

1. ~~Bật 2 API còn thiếu trên project `pshop-music`~~ — **✅ ĐÃ BẬT** (Chief Architect xác nhận, `gcloud services enable cloudfunctions.googleapis.com secretmanager.googleapis.com --project=pshop-music` — cả 2 "finished successfully").
2. **⚠️ MỞ LẠI Billing Account "Firebase Payment" (`01B88C-CA9680-D7BE63`)** — hiện đang **ĐÓNG** (`gcloud billing accounts describe 01B88C-CA9680-D7BE63` → `open: false`). Đây là blocker MỚI PHÁT HIỆN, chặn Secret Manager hoạt động dù API đã bật. **Chỉ chủ tài khoản Google Cloud Billing thực hiện được** — đăng nhập https://console.cloud.google.com/billing → chọn billing account "Firebase Payment" → kiểm tra phương thức thanh toán (thẻ hết hạn/bị từ chối là nguyên nhân phổ biến nhất) → mở lại. KHÔNG thể tự động hoá, không xử lý thay (liên quan thanh toán thật).
3. **`firebase login`** (luồng OAuth mở trình duyệt, làm thủ công 1 lần — gcloud đã đăng nhập KHÔNG thay thế được bước này, 2 hệ xác thực độc lập).
4. **1 API Key OpenAI thật** (tạo tại https://platform.openai.com/api-keys) — **tuyệt đối không dán API Key vào bất kỳ file nào trong repo, không gửi qua chat, chỉ nhập trực tiếp qua lệnh CLI ở mục 2** (Secret Manager mã hoá khi lưu, không ai — kể cả người có quyền Owner project — đọc lại được giá trị gốc sau khi thiết lập, chỉ có thể "set" giá trị mới). **Chỉ tạo/dùng Key sau khi Billing Account đã mở lại** (mục 2), nếu không `firebase functions:secrets:set` sẽ tiếp tục báo lỗi `BILLING_DISABLED`.

---

## 2. Deploy Cloud Function + thiết lập Secret

```bash
firebase login                       # nếu chưa đăng nhập
firebase use pshop-music             # xác nhận đúng project (khớp .firebaserc)

# Thiết lập Secret OPENAI_API_KEY trong Firebase Secret Manager (lệnh sẽ
# hỏi nhập giá trị Key ngay trong terminal — KHÔNG gõ Key vào bất kỳ đâu
# khác, không gõ vào file, không gửi qua chat):
firebase functions:secrets:set OPENAI_API_KEY

# Deploy đúng function openaiProxy (đọc functions/index.js qua firebase.json)
firebase deploy --only functions
```

Sau khi deploy xong, Firebase CLI sẽ in ra URL Cloud Function thật, dạng:

```
✔  functions[openaiProxy(us-central1)]: Successful create operation.
Function URL (openaiProxy(us-central1)): https://us-central1-pshop-music.cloudfunctions.net/openaiProxy
```

**Đối chiếu URL in ra với hằng số `OPENAI_PROXY_URL`** ở đầu file `js/ai/providers/openai.js` — nếu KHÁC (vd khác region), phải sửa lại hằng số này cho khớp URL thật (đây là 1 dòng code duy nhất cần sửa sau deploy, đã ghi rõ trong TODO comment của chính file đó).

---

## 3. Kích hoạt Provider trong CMS (sau khi deploy thành công)

Không cần sửa code gì thêm — chỉ cấu hình qua UI đã có:

1. Đăng nhập `admin/ai/providers.html` bằng tài khoản Admin.
2. Tick "Bật" (Enable) cho OpenAI, chọn Model (mặc định gợi ý `gpt-4o-mini`), bấm **LƯU**.
3. Bấm **KIỂM TRA KẾT NỐI** (gọi `provider.health()` → Cloud Function Proxy → OpenAI `/v1/models`) — phải trả về "Kết nối OpenAI thành công."
4. Vào `admin/ai/index.html`, chạy thử 1 Plugin bất kỳ (khuyến nghị Product Description Generator, cần chọn 1 sản phẩm có sẵn) — xác nhận Draft được tạo ra với nội dung THẬT (không phải lỗi "Chưa chọn nhà cung cấp AI").

---

## 4. Checklist xác minh sau kích hoạt (bắt buộc, không bỏ qua)

Đánh dấu từng mục sau khi tự tay xác nhận THẬT trên Production — không đánh dấu nếu chưa tự kiểm tra:

- [ ] `firebase deploy --only functions` chạy thành công, không lỗi.
- [ ] URL Cloud Function in ra khớp với `OPENAI_PROXY_URL` trong `js/ai/providers/openai.js` (sửa lại nếu khác, commit riêng 1 dòng).
- [ ] `admin/ai/providers.html` → "KIỂM TRA KẾT NỐI" cho OpenAI → trả về "Kết nối OpenAI thành công."
- [ ] Chạy Product Description Generator (qua `admin/ai/index.html` HOẶC nút "Viết mô tả bằng AI" trong `admin/products.html`, Sprint 11 Requirement #2) cho 1 sản phẩm có sẵn → Draft tạo ra với nội dung tiếng Việt hợp lý, không phải lỗi.
- [ ] Chạy One Click Marketing (`admin/ai/one-click-marketing.html`, Sprint 11 Requirement #1) → bấm GENERATE → 4 Job (Website/Facebook/Banner/Image) đều chuyển trạng thái `completed`, Draft xuất hiện trong `admin/ai/drafts.html`.
- [ ] Thử nhập sai API Key (hoặc tạm xoá Secret) → xác nhận `health()`/`generate()` trả về lỗi THẬT từ OpenAI (vd "Invalid API Key"), không phải thành công giả.
- [ ] Kiểm tra `admin/ai/logs.html` → mỗi lượt Generate/health đều có 1 dòng Log tương ứng (đúng nguyên tắc "chỉ Queue ghi Log", không đổi).
- [ ] Xác nhận API Key KHÔNG xuất hiện ở bất kỳ đâu phía client (View Source/Network tab của trình duyệt, Firebase Realtime Database) — chỉ tồn tại trong Secret Manager + bộ nhớ runtime của Cloud Function.

Nếu bất kỳ mục nào THẤT BẠI — ghi rõ lỗi thật (không suy đoán nguyên nhân) vào `ROADMAP.md`, cân nhắc rollback (mục 5).

**Bổ sung cho Image AI (Sprint 12 Requirement #11) — chỉ áp dụng sau khi đã redeploy `openaiProxy` với action `generate_image`:**

- [ ] Vào `admin/ai/plugins.html`, xác nhận Plugin "Image AI" (`image-generator`) đã "Enable" (seed mặc định KHÔNG tự bật lại cho Production đã tồn tại dữ liệu — xem `js/ai/plugin-db.js`).
- [ ] Vào `admin/ai/images.html`, chọn 1 Sản phẩm có sẵn, Loại ảnh "Product Hero Image", kích thước 1:1, bấm "TẠO ẢNH" → xác nhận ảnh THẬT xuất hiện trong lưới bên dưới (không phải lỗi "OpenAI trả về ảnh rỗng"/"Cloud Function Proxy báo lỗi").
- [ ] Xác nhận ảnh vẫn hiển thị đúng sau khi tải lại trang (ảnh đã được lưu vĩnh viễn vào Firebase Storage server-side, không phải URL tạm thời của OpenAI — nếu vỡ ảnh sau khi tải lại, kiểm tra quyền `admin.storage()` của Cloud Function).
- [ ] Bấm "Đặt làm Ảnh đại diện" cho ảnh vừa tạo → xác nhận sản phẩm được chọn cập nhật đúng Featured Image trong `admin/products.html`, ảnh cũ trong Gallery không bị mất.

---

## 5. Rollback (nếu có sự cố sau deploy)

```bash
firebase functions:delete openaiProxy    # gỡ function khỏi Production
```

Không ảnh hưởng Database/Storage Rules/CMS — Cloud Function độc lập hoàn toàn, gỡ bỏ không làm mất dữ liệu nào (Draft/Job/Log đã tạo trước đó vẫn còn nguyên trong Realtime Database).

---

## 6. Giới hạn đã biết (không thay đổi bởi tài liệu này)

- Chỉ OpenAI có đường kích hoạt thật. Claude/Gemini/DeepSeek vẫn là stub cố ý — muốn kích hoạt cần: (a) quyết định kinh doanh có nên trả phí đa dạng Provider hay không, (b) API Key thật của từng bên, (c) 1 Requirement riêng viết `generate()` thật cho từng Provider (hiện `validate()`/`health()` đã đúng khuôn `IAIProvider`, chỉ `generate()` là stub) — không tự làm ở tài liệu này.
- Job Queue vẫn là V1 (chạy phía trình duyệt Admin, không có backend xử lý nền) — kích hoạt Provider KHÔNG thay đổi giới hạn này, vẫn cần tab trình duyệt đang mở để Job xử lý xong.
- Cost Tracking (Sprint 7 #2) vẫn là ước tính, không phải billing token thật từ OpenAI — kích hoạt Provider không tự động làm Cost Tracking trở nên chính xác hơn.
