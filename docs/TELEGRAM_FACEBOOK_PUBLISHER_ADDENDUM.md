# Telegram Facebook Publisher — phụ lục vận hành

Phụ lục cho `TELEGRAM_FACEBOOK_PUBLISHER.md` (giữ nguyên bản đã commit). File này chỉ chứa nội dung MỚI: xử lý ảnh/tin nhắn ở bước nhận, trạng thái Production 2026-10-30, bật Compositor, chất lượng nội dung AI, Founder Recovery và Post ID claim.
Graph API: mã dùng `v25.0` (`functions/facebook-graph-api.js`, `functions/shared/fbReconcileRead.js`); xem mục 8 của bản chính về phần chưa xác minh với Meta thật.

## Bổ sung cho mục 4 (nhận tin nhắn)

Ảnh có thể gửi dạng **Ảnh** hoặc **Tệp** (chỉ JPEG/PNG/WEBP). Ảnh gửi dạng tệp vẫn đi đúng pipeline, dùng bytes gốc.
Ảnh không có chú thích → bot trả hướng dẫn mẫu (không im lặng); album chỉ nhắc 1 lần.
Chú thích thiếu Tên/Giá/Tình trạng → bot liệt kê trường thiếu + mẫu.
Tin chữ thường (vd `hello`, `xin chào`) → AI trả lời (cùng `OPENAI_API_KEY`, `gpt-4o-mini`); nếu thiếu/lỗi khoá → bot báo rõ, không im lặng.
Tin chữ có >=2 nhãn Tên/Giá/Tình trạng nhưng thiếu ảnh → bot nhắc gửi ảnh, KHÔNG đưa sang AI.

## 8. Trạng thái Production — kiểm tra 2026-10-30 (đợt 2, chỉ đọc)
Project `pshop-music`, hàm `telegramWebhook` (us-central1, `https://us-central1-pshop-music.cloudfunctions.net/telegramWebhook`), bot `@PSH_Flatform_Bot` (ID 9281952823).

**Đã kiểm chứng (đọc production, không thay đổi gì):**
- `/telegramConfig`: `chatId` = `"<CHAT_ID>"` (**nhóm**), `approverIds` = `["<APPROVER_ID>"]`, `approverMap` 1 mục, **`dryRun` = `true`**; không còn trường secret cũ trong RTDB.
- Webhook: `getWebhookInfo` trả URL đúng hàm, `pending_update_count=0`, không có `last_error_message`, `allowed_updates=message,callback_query`.
- **Bot đang BẬT Telegram Privacy Mode**: `getMe.can_read_all_group_messages=false`; `getChatMember(<CHAT_ID>, 9281952823).status='member'` (bot là thành viên thường, **không phải admin** — admin sẽ nhận được nhiều tin hơn). Trong nhóm, Telegram chỉ gửi cho bot lệnh `/…`, tin trả lời trực tiếp vào tin của bot và service message; **tin chữ thường và ảnh KHÔNG được gửi tới webhook**. Đây là nguyên nhân trực tiếp khiến `hello` và ảnh trong nhóm `<CHAT_ID>` không có phản hồi, trong khi `/start`, `/help` (lệnh) vẫn tới.
- Bản đang chạy: `updateTime=2026-10-30T09:30:43Z`; giải nén source archive của hàm: có log chẩn đoán `update kind=… branch=…` nhưng **KHÔNG có** `aiChatReply`/`callOpenAiChat` → bản production hiện tại chưa trả lời bằng AI; nếu tin chữ tới được, code cũ chỉ trả "Hãy gửi kèm 1 ảnh sản phẩm".
- `OPENAI_API_KEY`: có trong Secret Manager, hợp lệ (`GET /v1/models` HTTP 200, có `gpt-4o-mini`); gọi thật `callOpenAiChat` từ máy local trả `"OK"`. **Chưa** xác nhận model trả lời qua webhook production (vì chưa deploy).
- Facebook: `facebookConnection.status=connected`, có Page active; `dryRun=true` nên không có bài thật nào được đăng trong đợt kiểm tra này.

**Mã đã sửa trong workspace (CHƯA deploy):**
- Tin chữ thường → AI hội thoại (`gpt-4o-mini`, system prompt chống bịa); lỗi/thiếu khoá → báo rõ.
- Ảnh gửi dạng `document` (JPEG/PNG/WEBP) → đúng pipeline; định dạng khác → báo rõ.
- Ảnh/album thiếu chú thích → phản hồi hướng dẫn (album chỉ 1 lần); tin chữ giống mẫu sản phẩm nhưng thiếu ảnh → nhắc gửi ảnh, không gọi AI.
- Log chẩn đoán chỉ có kind/caption/branch + id dạng số; không log nội dung/token.

**Test (local, KHÔNG phải production):** `node tests/telegramFbPipeline.test.js` → 114/114 PASS; `node tests/facebookCopyQuality.test.js` → 50/50 PASS; các suite liên quan PASS (fbPublisher 62, hardening 44, authz 90, graph 30, secrets 9…). Emulator test CHƯA chạy: Firebase Emulator yêu cầu Java ≥21, máy hiện có Java 17. `tests/apiAdapter.test.js` lỗi sẵn (`admin.database is not a function`), không liên quan thay đổi này.

**CHƯA KIỂM CHỨNG:** webhook production nhận ảnh/tin chữ thật sau khi deploy; AI trả lời qua production; việc tắt Privacy Mode.

**Founder cần làm để xác minh production (tối thiểu):**
1. BotFather → `/setprivacy` → chọn bot → **Disable** (tắt Privacy Mode). Sau đó **xoá bot khỏi nhóm và thêm lại** (Telegram chỉ áp dụng thay đổi privacy khi bot được thêm lại).
2. Deploy đúng hàm đã sửa (khi Founder đồng ý): `firebase deploy --only functions:telegramWebhook --project pshop-music`.
3. Trong nhóm `<CHAT_ID>`, gửi `hello` → phải nhận câu trả lời AI (hoặc thông báo lỗi cấu hình rõ ràng); gửi 1 ảnh kèm `Tên/Giá/Tình trạng` → phải nhận bản xem trước (`dryRun=true`, KHÔNG đăng Facebook).
4. Nếu vẫn im lặng: xem log `telegramWebhook` cho dòng `branch=…`/`reason=…` (không chứa nội dung/token) để biết tin có tới hàm hay không.

**Giới hạn:** `dryRun: true`; KHÔNG deploy/commit/push trong đợt này; chưa kết luận PASS (chỉ Founder tuyên bố).

## 9. Bật Python Compositor (ảnh quảng cáo) — trạng thái 2026-10-30

### 9.1 Vì sao preview báo "skipped"
- RTDB `/imageRouterConfig` trên production đang là **chuỗi `"null"`** (không phải object). `imageRouter` cũ trả `skipped` với thông báo chung "chưa bật provider", nên preview không nêu đúng nguyên nhân.
- Ngay cả khi sửa object, vẫn **chưa có máy chủ compositor** để gọi: không có Cloud Run service, VM hay Python Cloud Function nào trong project.
- `COMPOSITOR_SECRET` đã tồn tại (>= 24 ký tự) và đã bind cho `telegramWebhook` — thiếu duy nhất host + cấu hình object.

### 9.2 Python Compositor có chạy trong Cloud Functions hiện tại không?
**Không.** Bằng chứng:
- `firebase.json` chỉ deploy thư mục `functions/`; `tools/compositor/` nằm ngoài nguồn deploy.
- Source archive của `telegramWebhook` đã deploy: **0 file `.py`**, không có `tools/`, không có Pillow/numpy/rembg.
- Runtime là Node 22 (`functions/package.json`); compositor cần Python 3.10+, Pillow, numpy, rembg/onnxruntime và mô hình tách nền.

=> Giữ nguyên kiến trúc hiện có: compositor là **service Python riêng**, router gọi qua HTTPS. Không chạy `subprocess` Python trong Cloud Function.

### 9.3 Tối thiểu để bật (Founder thực hiện)
1. Chạy compositor trên máy chủ có Python 3.10+:
   ```powershell
   cd tools\compositor
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   $env:COMPOSITOR_SECRET = "<đúng secret đang dùng cho Functions>"
   .\run_compositor.ps1 -ListenHost 127.0.0.1 -Port 8765
   ```
   Đặt sau HTTPS reverse proxy/tunnel (router chỉ nhận `https://`). Host phải dùng **cùng** `COMPOSITOR_SECRET` với Functions secret; secret KHÔNG ghi vào RTDB.
2. Kiểm chứng host trước khi bật:
   ```powershell
   $env:COMPOSITOR_SECRET = "<secret>"
   node scripts\compositor-check.js --url https://<host> --no-mask
   ```
   Kỳ vọng: `health: OK`; `report: preserved=true core>0 mismatched=0`; mở `tools/compositor/out/after-no-mask.png` kiểm tra bằng mắt. Nếu `NO_SEGMENTATION` → host chưa cài rembg/mô hình.
3. Xem trước cấu hình (KHÔNG ghi):
   ```powershell
   .\scripts\telegram-set-compositor.ps1 -Url https://<host> -TimeoutMs 60000 -Style studio
   ```
4. Ghi cấu hình (chỉ khi đã kiểm bước 2):
   ```powershell
   .\scripts\telegram-set-compositor.ps1 -Url https://<host> -TimeoutMs 60000 -Style studio -Apply
   ```
   Script ghi `imageRouterConfig.providers.compositor` (enabled, approvedForProductPhotos, url, timeoutMs, style; canvas tuỳ chọn) và **không** ghi secret.
5. Gửi lại ảnh sản phẩm qua Telegram (dryRun=true) và kiểm preview: ảnh phải là ảnh ghép nền, không phải ảnh gốc.

### 9.4 Kiểm tra ảnh đầu ra trước khi cho phép đăng
- `report.product_pixels_preserved === true`.
- `report.core_pixels > 0` và `report.core_pixels_mismatched === 0`.
- `report.background` = `procedural:studio|warm|dark` (hoặc `provider` nếu dùng nền AI).
- `report.product_size` / `report.canvas`: sản phẩm không bị resize; canvas nới nếu sản phẩm lớn.
- Xem `imageReport` trong draft RTDB và ảnh preview Telegram; so vùng sản phẩm với ảnh gốc (logo/chữ/màu/chi tiết).
- Chỉ sau khi đạt các bước trên mới cân nhắc tắt dryRun; **đợt này không tắt**.

### 9.5 Fallback / rollback
- Provider tắt, config sai kiểu, thiếu secret, URL sai, timeout, lỗi mask/compositor, report không đạt → **dùng ảnh GỐC**, preview ghi rõ lý do; không lưu `final.png`, không đánh dấu `composited` giả.
- Nền AI lỗi nhưng compositor thành công → vẫn dùng nền tự tạo và preview ghi rõ fallback nền.
- Tắt khẩn cấp: `.\scripts\telegram-set-compositor.ps1 -Disable -Apply` (hoặc xoá node config); ảnh gốc vẫn còn trong Storage.

## 10. Chất lượng nội dung Facebook do AI tạo — 2026-10-30

### 10.1 Nguồn prompt
- Prompt thật: `functions/shared/aiModulesCore.js` → `MODULES['facebook-post-generator'].buildPrompt`.
- `functions/shared/aiModules.js` chỉ load context; `js/ai/modules-core.js` là bản **byte-identical** cho CMS.
- Telegram gọi qua `contentOrchestrator.generateCaption` với `{ productBrief: {name}, singleVersion: true }`; CMS vẫn nhận 3 phiên bản.
- CMS dùng `context.product` thật: `description`, `specs`, `features`, `applications`, `categoryLabel`, `price`, `status`, `badgeText` (trước đây prompt chỉ đọc `shortDescription` nên mất mô tả catalogue).

### 10.2 Quy tắc đã áp
- Văn bản thuần, không Markdown: không heading, bold/italic bằng `*`, bullet `-`, danh sách số, code block, HTML.
- Không mở bằng câu sáo rỗng; cấm các cụm như "lựa chọn hoàn hảo", "giải pháp lý tưởng", "nâng tầm", "đẳng cấp", "tối ưu nhất"…
- Chỉ dùng dữ kiện đã cho; không bịa thông số, chất liệu, kích thước, công suất, tần số, trọng lượng, tương thích, bảo hành, khuyến mãi, nguồn gốc.
- Tên chỉ là thương hiệu + mã model **và không có catalogue data** (vd "Pioneer DDJ-400") → chỉ tên + lời mời liên hệ. Có `category/description/specs/giá` thì dùng dữ liệu đó; không ép name-only.
- Telegram: giá/tình trạng do `factsBlock` chèn. CMS: `productFactsBlock` chèn giá/tình trạng/bảo hành từ `price/status/badgeText`; `stripFactClaims` bỏ câu AI tự nói các facts này.
- `sanitizeFacebookText` + claim guard (`UNSUPPORTED_CLAIM`) bỏ Markdown, URL bịa, câu sáo rỗng và claim thiết kế/ổn định/chất âm không có trong dữ kiện; **miễn trừ câu CTA** ("liên hệ/tư vấn/ghé") để không xoá nhầm.
- Câu trộn claim + dữ kiện: chỉ bỏ modifier/claim hẹp (vd "ổn định", "chắc chắn", "tùy chỉnh" → "tinh chỉnh" theo nguồn), **giữ dữ kiện**; nếu còn claim hoặc câu cụt thì bỏ câu và dùng 2 câu đầu `description` catalogue làm fallback.
- Link hệ thống `category.html?product=...` được ghép **sau** sanitizer nên không bị tách thành "category. html? ..."; hashtag luôn ở cuối.
- `ensureProductName` bảo đảm tên sản phẩm xuất hiện; chấp nhận phần lõi trước dấu "–" (vd "KRK ROKIT 8 G4") để không tạo tiêu đề trùng; `dedupeProductNameStarts` đổi tên lặp ở đoạn sau thành "Sản phẩm …".
- Telegram preview vẫn giữ định dạng riêng (emoji/nhãn); chỉ caption Facebook được làm sạch.

### 10.3 Kiểm thử / mẫu
- `node tests/facebookCopyQuality.test.js` â†’ **50/50 PASS** (prompt, sanitizer, claim guard, product facts, fallback description, link, CTA, client/server byte-identical).
- Prompt 2026-10-31: giọng tư vấn trực tiếp, thông số gắn với việc người mua làm được, CTA đa dạng, 3 góc khác thật; claim guard bổ sung chất lượng/availability và chặn câu cụt.
- `node tests/telegramFbPipeline.test.js` → **114/114 PASS** (Telegram preview, publisher, AI hội thoại không đổi).
- `node scripts/facebook-copy-scenarios.js` (model thật, cần `OPENAI_API_KEY`) → 5 tình huống A–E; lưu `functions/tests/out/facebook-copy-scenarios.json` + `.md`; mỗi lần gọi có timeout 45s (`AbortController`) để không treo vô hạn.

Mẫu thực tế với `gpt-4o-mini` (đã qua sanitizer; giá/tình trạng do hệ thống chèn):
```
Tên: Chân loa Aura 1 2 3 4
Giá: 1.800.000đ
Tình trạng: Mới 100%
```
Kết quả (model thật, đã qua sanitizer):
```
Chân loa Aura 1 2 3 4 giúp đặt loa đúng vị trí trong không gian nghe nhạc.

Sản phẩm này hỗ trợ bạn bố trí hệ thống âm thanh gọn gàng và dễ dàng hơn.

Liên hệ Pshop Music để được tư vấn thêm.

Giá: 1.800.000đ
Tình trạng: Mới 100%

#PshopMusic #ChanLoa #ThietBiAmThanh
```
- Không Markdown, không câu sáo rỗng, không URL bịa, không thông số tự bịa; giá/tình trạng khớp dữ liệu.
- Một CTA duy nhất; tên sản phẩm có mặt; không lặp lại giá/tình trạng trong câu AI.
- Đầu ra model có thể thay đổi giữa các lần; prompt + sanitizer + facts từ catalogue là hàng rào cố định.
- Kết quả 5 tình huống A–E (model thật) lưu tại `functions/tests/out/facebook-copy-scenarios.{json,md}`; đây là artifact kiểm thử, chưa commit.

### 10.4 Chưa deploy
- Chưa deploy/commit/push; production vẫn dùng prompt cũ cho tới khi deploy `telegramWebhook`.
- CMS tĩnh `js/ai/modules-core.js` cần deploy Netlify để nhận prompt mới ở client.
- `dryRun` vẫn `true`; không có bài Facebook thật nào được đăng.

## Founder Recovery — draft kẹt PUBLISHING / FAILED(publish_unknown)

Chỉ **super_admin** (uid ánh xạ từ `telegramConfig.approverMap` có `superAdmins/{uid}.role = super_admin`). Không POST Facebook, không bypass Approval Gate.

| Lệnh | Tác dụng |
|---|---|
| `/reconcile <mã>` | Tự đối soát với Fanpage (GET). Chốt PUBLISHED khi đúng 1 bài khớp. |
| `/confirm_posted <mã> <Post ID>` | Xác nhận bài ĐÃ đăng. Hệ thống GET Post ID với token Page: id khớp, tiền tố/`from` đúng Page, tạo trong cửa sổ đăng, nội dung khớp, chưa thuộc draft khác, không có draft cạnh tranh. Đạt → PUBLISHED + URL. |
| `/confirm_not_posted <mã>` | Xác nhận CHƯA đăng. Chỉ khi ≥ 45 phút sau khi bắt đầu đăng, token đọc được bài của Page, quét ĐỦ cửa sổ [bắt đầu−2′, bắt đầu+15′] và cửa sổ RỖNG. Đạt → FAILED(publish); vẫn phải `/retry` rồi Duyệt lại. |

Mọi lần thử (kể cả bị từ chối) ghi `fbPostDrafts/{id}/recoveryAudit/{khoá}`: thời điểm, hành động, kết quả, uid, Telegram ID, Page ID, Post ID, bằng chứng. Không đủ bằng chứng → giữ khoá, Chief Architect xử lý.

### Post ID claim (`fbPostIdClaims/{postId}`) — chặn hai draft cùng giữ một Post ID

`/confirm_posted` và `/reconcile` cùng đi qua một claim nguyên tử trước khi chốt PUBLISHED. Một Post ID chỉ thuộc về MỘT draft; claim của draft khác không bao giờ bị ghi đè.

- Draft khác đã giữ Post ID (kể cả draft cũ chưa có claim) → bị từ chối `post_already_claimed`, không để lại claim.
- Chốt thất bại hoặc ném lỗi → claim do chính lần gọi đó tạo ra được giải phóng.
- **Claim kẹt** (Function sập giữa claim và chốt draft; draft vẫn PUBLISHING): chạy lại đúng lệnh trên CHÍNH draft đó sẽ nhận lại claim và hoàn tất. Draft khác bị chặn `claim_in_progress` trong 5 phút; từ 5 phút mới được tiếp quản, và không bao giờ nếu chủ claim đã PUBLISHED với Post ID đó.
- Claim hỏng (sai kiểu dữ liệu) → `claim_corrupt`, không tiếp quản (fail-closed). Chưa có lệnh Founder để xoá claim thủ công.
- Đường đăng bình thường (Post ID mới do Facebook trả về) không đi qua claim.
