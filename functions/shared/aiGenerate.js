/*
 * shared/aiGenerate.js — Sprint 14 Phase 5. Orchestrator cho 9 module AI
 * (`shared/aiModules.js`): loadContext → buildPrompt → gọi OpenAI → parse →
 * mapToDraftContent → `DraftDB.add()` — CÙNG 4 bước `AIJobQueue.processItem()`
 * đã làm phía client (job-queue.js:88-145), khác ở chỗ gọi OpenAI TRỰC TIẾP
 * (dùng lại ĐÚNG `OPENAI_API_KEY` Secret) thay vì gọi vòng qua Cloud Function
 * `openaiProxy` — đỡ 1 lượt HTTP nội bộ không cần thiết. `openaiProxy` GIỮ
 * NGUYÊN, không đổi — client cũ vẫn gọi được như trước.
 *
 * `defineSecret('OPENAI_API_KEY')` ở đây trỏ về CÙNG 1 secret Cloud Run thật
 * đã có trong `functions/index.js` (đã nằm sẵn trong `secrets:[...]` của
 * `apiGateway`) — KHÔNG được liệt kê THÊM 1 lần nữa vào mảng `secrets` của
 * `apiGateway` (khác `WEBHOOK_SIGNING_SECRET` ở Phase 1, vốn là secret hoàn
 * toàn MỚI, chưa có ở đâu khác) — Cloud Run từ chối deploy nếu cùng 1 tên
 * secret bị liệt kê 2 lần ("Duplicate secret environment variable") — đã
 * gặp lỗi này thật lúc deploy Phase 5, sửa bằng cách bỏ khỏi mảng, KHÔNG bỏ
 * dòng `defineSecret()` này (vẫn cần để gọi `.value()` trong file này).
 *
 * Đồng bộ (synchronous) trong 1 request — hành vi GỐC, KHÔNG đổi
 * (`generateForModule()` vẫn tạo Job rồi CHẠY NGAY, chờ xong mới trả kết
 * quả) — mọi caller cũ (routes/founder.js one-click-marketing, test suite,
 * đường /v1/ai/{module}/generate mặc định) không cần sửa gì.
 *
 * Sprint 15 Phase 3 (Task 3.2, IMPLEMENTATION_QUEUE.md) — Async + Webhook
 * thật cho AI Generate. `generateForModule()` được tách thành 2 hàm:
 * `queueGeneration()` (tạo Job status:'queued', payload.async=true, TRẢ VỀ
 * NGAY — không chạy generate) + `runGeneration()` (phần logic thật, dùng
 * chung bởi CẢ 2 đường). `generateForModule()` (sync) giờ chỉ là
 * `queueGeneration({async:false}) rồi runGeneration() ngay` — 0 thay đổi
 * hành vi quan sát được từ bên ngoài.
 *
 * Worker nền THẬT: `functions/index.js` có Cloud Function mới
 * (`aiGenerateWorker`, RTDB trigger `onValueCreated` trên
 * `apiAsyncJobs/{jobId}`) — CHỈ xử lý Job có `payload.async === true` (Job
 * do đường sync tạo có `payload.async === false`, trigger BỎ QUA — tránh
 * chạy generate 2 lần cho cùng 1 request). Webhook (`ai.generate.completed`/
 * `.failed`) đã tồn tại SẴN từ Phase 5/6 bên trong `runGeneration()` (trước
 * đây là thân `generateForModule()`) — KHÔNG cần viết thêm, tự động áp dụng
 * cho CẢ 2 đường sync/async như nhau.
 *
 * LƯU Ý: `aiGenerateWorker` chỉ THẬT SỰ chạy sau khi được deploy — code này
 * viết + test xong trong phiên này nhưng "No deploy" theo chỉ thị Founder,
 * nên Job tạo qua đường async sẽ nằm ở status "queued" mãi cho tới khi
 * Founder deploy (xem AGENT_ASYNC_IMPLEMENTATION_REPORT.md).
 */
const admin = require('firebase-admin');
const { defineSecret } = require('firebase-functions/params');
const listResource = require('./listResource');
const asyncJob = require('./asyncJob');
const eventBus = require('./eventBus');
const { MODULES, parseJsonResponse } = require('./aiModules');
const providerRouter = require('./providerRouter');

// callOpenAiText / callOpenAiImage — Wrapper giữ signature/export cũ (backward-compat),
// logic thực tế ĐÃ chuyển sang openaiProvider (Provider Abstraction) — không duplicate.
async function callOpenAiText(prompt) {
  return providerRouter.route({ type: 'text', prompt: prompt });
}

async function callOpenAiImage(prompt, size) {
  return providerRouter.route({ type: 'image', prompt: prompt, size: size });
}

// runGeneration — logic thật (KHÔNG đổi 1 dòng nào so với thân
// generateForModule() cũ) — nhận sẵn jobId (đã tồn tại, status bất kỳ) thay
// vì tự tạo Job, để dùng chung được cho cả đường sync (gọi ngay sau khi tạo
// Job) và đường async (gọi từ Cloud Function trigger, sau khi Job đã "queued"
// một khoảng thời gian).
async function runGeneration(jobId, moduleId, inputParams, uid) {
  const module = MODULES[moduleId];
  if (!module) throw new Error('Không nhận diện được module AI: ' + moduleId);

  await asyncJob.updateJobStatus(jobId, 'running');

  try {
    const context = await module.loadContext(inputParams);
    const prompt = module.buildPrompt(inputParams, context);
    const providerOutput = module.isImageGen
      ? await providerRouter.route({ type: 'image', prompt: prompt, size: inputParams.size, providerId: inputParams.providerId })
      : await providerRouter.route({ type: 'text', prompt: prompt, inputParams: inputParams, providerId: inputParams.providerId });
    const content = module.mapToDraftContent(providerOutput, inputParams, context);

    // FIX: targetId trước đây rơi về inputParams.productId cho MỌI module,
    // bất kể module đó có thật sự target 'products' hay không. Với
    // blog-writer/facebook-post-generator/banner-generator (được Auto-
    // Trigger truyền productId chỉ để LOAD CONTEXT sản phẩm, không phải để
    // update chính bản ghi đó), targetId bị gán nhầm = productId — Founder
    // publish Blog draft sẽ gọi listResource.update('blogPosts', productId,
    // ...), không tìm thấy bản ghi blogPosts nào khớp id đó, im lặng
    // return null, bài Blog không bao giờ được tạo. productId chỉ hợp lệ làm
    // targetId khi module thật sự update lại chính record sản phẩm
    // (targetCollection === 'products', vd product-description-writer).
    const targetId = inputParams.targetId
      || (module.targetCollection === 'products' ? inputParams.productId : null)
      || inputParams.postId || null;
    const draft = await listResource.add('aiDrafts', {
      moduleId, targetCollection: module.targetCollection,
      targetId: targetId,
      inputParams, content, status: 'draft', providerUsed: inputParams.providerId || 'openai', createdBy: uid
    });

    await asyncJob.updateJobStatus(jobId, 'completed', { draftId: draft.id });
    await eventBus.emit('ai.generate.completed', { moduleId, jobId, draftId: draft.id, uid });
    return draft;
  } catch (err) {
    await asyncJob.updateJobStatus(jobId, 'failed', err);
    await eventBus.emit('ai.generate.failed', { moduleId, jobId, uid, error: err.message });
    throw err;
  }
}

// generateForModule — đường ĐỒNG BỘ, GIỮ NGUYÊN hành vi gốc: tạo Job rồi
// chạy runGeneration() NGAY, chờ xong mới trả kết quả. `payload.async: false`
// đánh dấu rõ Job này KHÔNG cần aiGenerateWorker xử lý (đã tự chạy xong ở
// đây rồi) — tránh trigger RTDB chạy lại lần 2.
async function generateForModule(moduleId, inputParams, uid, email) {
  if (!MODULES[moduleId]) throw new Error('Không nhận diện được module AI: ' + moduleId);
  const job = await asyncJob.createJob({ uid, type: 'ai-generate:' + moduleId, payload: { inputParams, moduleId, async: false } });
  return runGeneration(job.id, moduleId, inputParams, uid);
}

// queueGeneration — đường BẤT ĐỒNG BỘ (mới, Sprint 15 Phase 3): CHỈ tạo Job
// (status:'queued', payload.async:true) rồi TRẢ VỀ NGAY — KHÔNG tự chạy
// generate. `aiGenerateWorker` (functions/index.js, RTDB trigger) sẽ nhận
// đúng Job này (nhờ payload.async===true) và gọi runGeneration() thật sau đó.
async function queueGeneration(moduleId, inputParams, uid) {
  if (!MODULES[moduleId]) throw new Error('Không nhận diện được module AI: ' + moduleId);
  return asyncJob.createJob({ uid, type: 'ai-generate:' + moduleId, payload: { inputParams, moduleId, async: true } });
}

module.exports = { generateForModule, queueGeneration, runGeneration, callOpenAiText, callOpenAiImage };
