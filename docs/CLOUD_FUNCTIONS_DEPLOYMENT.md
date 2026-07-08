# Cloud Function `openaiProxy` — AI Provider Runtime Activation Guide

Sprint 11 Requirement #3 (AI Provider Runtime Activation). Tài liệu này chuẩn bị đầy đủ để người vận hành (người có quyền truy cập Firebase Console/CLI thật + 1 API Key OpenAI thật) kích hoạt AI Runtime thật lần đầu tiên — môi trường phát triển hiện tại **không có Firebase CLI cài đặt, không có phiên đăng nhập, không có API Key nào** (đã xác nhận: `firebase` không tồn tại trong PATH, xem mục 0), nên bước deploy/kích hoạt thật sự **chưa được thực hiện và không được giả lập là đã thực hiện**.

Đây là khoảng hở đã biết, xuyên suốt từ Sprint 3 (`ARCHITECTURE_REVIEW_SPRINT3.md`, `functions/index.js` tạo lần đầu) — mọi Sprint từ đó tới nay đều ghi nhận lại đúng tình trạng này, không có gì thay đổi.

---

## 0. Tình trạng hiện tại (đã xác nhận, không suy đoán)

| Câu hỏi | Trả lời |
|---|---|
| `functions/index.js` (Cloud Function `openaiProxy`) có tồn tại, đúng kiến trúc Proxy không lộ API Key phía client? | ✅ Có — dùng `defineSecret('OPENAI_API_KEY')` (Firebase Secret Manager, KHÔNG lưu Realtime Database/KHÔNG gửi xuống browser), xác thực Firebase Auth ID token + kiểm tra `roles/{uid}` (đúng cơ chế phân quyền CMS đã có, không tạo hệ thống Auth mới). |
| `functions/package.json`/`node_modules` có hợp lệ? | ✅ Có — `node -c functions/index.js` PASS, `firebase-admin`/`firebase-functions` đã có trong `node_modules`. |
| `firebase.json` có wiring đúng `functions`? | ✅ Có — `{"source": "functions", "codebase": "default", ...}`. |
| `.firebaserc` có trỏ đúng project? | ✅ Có — `"default": "pshop-music"`. |
| `js/ai/providers/openai.js` (Provider phía client) có gọi đúng qua Cloud Function Proxy (không gọi thẳng OpenAI)? | ✅ Có — `callOpenAiProxy()` lấy Firebase ID token, gọi `OPENAI_PROXY_URL` (hằng số, xem mục 2). |
| **Cloud Function `openaiProxy` đã từng được deploy lên Firebase thật chưa?** | ❌ **CHƯA — xác nhận, không suy đoán.** Môi trường này không có `firebase` CLI (kiểm tra `command -v firebase` → không tìm thấy), nên không thể tự deploy hay xác minh trạng thái deploy thật. |
| **`OPENAI_API_KEY` đã được thiết lập trong Firebase Secret Manager chưa?** | ❌ **CHƯA — không thể xác nhận từ môi trường này**, vì chưa từng deploy nên Secret cũng chưa từng được yêu cầu thiết lập. |
| **`OPENAI_PROXY_URL` trong `js/ai/providers/openai.js` (hiện là `https://us-central1-pshop-music.cloudfunctions.net/openaiProxy`) đã được xác nhận là URL THẬT chưa?** | ❓ **CHƯA XÁC NHẬN** — đây là URL suy ra theo đúng quy ước đặt tên Cloud Functions v2 của Firebase (region + project id + tên function), NHƯNG chưa từng được xác nhận thật vì Function chưa deploy. Comment TODO ngay trong file đã ghi rõ: "thay đúng URL thật (Firebase CLI in ra sau khi `firebase deploy --only functions` chạy xong) vào hằng số này." |
| Claude/Gemini/DeepSeek Provider có tích hợp thật chưa? | ❌ Vẫn là stub CỐ Ý (`generate()` luôn reject rõ ràng, không bịa nội dung) — quyết định kinh doanh "có cần đa dạng Provider hay không" **chưa từng được đưa ra** (ghi nhận từ Sprint 8 Architecture Challenge #5, `ROADMAP.md`). Đây KHÔNG phải lỗi/thiếu sót của Requirement này — mở rộng 3 Provider này là 1 quyết định kinh doanh + kỹ thuật riêng (cần API Key Anthropic/Google thật), ngoài phạm vi "kích hoạt Runtime đã có" của Requirement #3. |

**Không tuyên bố "AI Runtime đã hoạt động thật"/"Provider đã kích hoạt"/"Generate thành công thật" — vì chưa từng deploy, chưa có Secret, chưa gọi được API OpenAI thật từ môi trường này.**

---

## 1. Điều kiện tiên quyết (người vận hành cần chuẩn bị)

1. **Tài khoản Firebase có quyền Owner/Editor trên project `pshop-music`**, đã cài `firebase-tools` (`npm install -g firebase-tools`) và đăng nhập (`firebase login` — luồng OAuth mở trình duyệt, phải làm thủ công, không thể tự động hoá).
2. **Project `pshop-music` phải ở gói Blaze (Pay as you go)** — Cloud Functions v2 (dùng `onRequest` từ `firebase-functions/v2/https`, đã có sẵn trong `functions/index.js`) yêu cầu gói Blaze, không chạy được ở gói Spark miễn phí. Đây là yêu cầu của Firebase, không phải của PSH Platform.
3. **1 API Key OpenAI thật** (tạo tại https://platform.openai.com/api-keys) — **tuyệt đối không dán API Key vào bất kỳ file nào trong repo, không gửi qua chat, chỉ nhập trực tiếp qua lệnh CLI ở mục 2** (Secret Manager mã hoá khi lưu, không ai — kể cả người có quyền Owner project — đọc lại được giá trị gốc sau khi thiết lập, chỉ có thể "set" giá trị mới).

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
