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
 * Đồng bộ (synchronous) trong 1 request — CHƯA có worker nền thật (Cloud
 * Task/Pub-Sub) để làm đúng tinh thần "KHÔNG chờ đồng bộ" của FINAL mục 9 —
 * xây worker nền là quyết định hạ tầng GCP mới, cùng loại quyết định đã gắn
 * cờ ở Phase 3 (Social Media Center schedule)/Phase 4 (Conversation TTL
 * cleanup), không tự ý provision. `shared/asyncJob.js` (Phase 1) vẫn được
 * dùng để ghi lại vết Job (queued→running→completed/failed) cho mục đích
 * quan sát/lịch sử — response HTTP chỉ trả về sau khi generate xong thật.
 */
const admin = require('firebase-admin');
const { defineSecret } = require('firebase-functions/params');
const listResource = require('./listResource');
const asyncJob = require('./asyncJob');
const eventBus = require('./eventBus');
const { MODULES, parseJsonResponse } = require('./aiModules');

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const IMAGE_SIZE_MAP = { '1:1': '1024x1024', '4:5': '1024x1792', '16:9': '1792x1024' };

async function callOpenAiText(prompt) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_API_KEY.value() },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.7 })
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || 'OpenAI API lỗi.');
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return { text: (text || '').trim(), raw: data };
}

// callOpenAiImage — CÙNG hành vi action "generate_image" của openaiProxy
// (functions/index.js) — tải ảnh b64 tạm thời về, lưu vĩnh viễn vào Firebase
// Storage (Admin SDK) trước khi trả URL, vì ảnh OpenAI trả về sẽ hết hạn.
async function callOpenAiImage(prompt, size) {
  const openAiSize = IMAGE_SIZE_MAP[size] || '1024x1024';
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_API_KEY.value() },
    body: JSON.stringify({ model: 'dall-e-3', prompt, size: openAiSize, n: 1, response_format: 'b64_json' })
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || 'OpenAI Images API lỗi.');
  const item = data.data && data.data[0];
  if (!item || !item.b64_json) throw new Error('OpenAI không trả về ảnh.');
  const buffer = Buffer.from(item.b64_json, 'base64');
  const path = `ai-generated/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  const bucket = admin.storage().bucket();
  const token = require('crypto').randomUUID();
  await bucket.file(path).save(buffer, { metadata: { contentType: 'image/png', metadata: { firebaseStorageDownloadTokens: token } } });
  return { imageUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}` };
}

async function generateForModule(moduleId, inputParams, uid, email) {
  const module = MODULES[moduleId];
  if (!module) throw new Error('Không nhận diện được module AI: ' + moduleId);

  const job = await asyncJob.createJob({ uid, type: 'ai-generate:' + moduleId, payload: { inputParams } });
  await asyncJob.updateJobStatus(job.id, 'running');

  try {
    const context = await module.loadContext(inputParams);
    const prompt = module.buildPrompt(inputParams, context);
    const providerOutput = module.isImageGen
      ? await callOpenAiImage(prompt, inputParams.size)
      : await callOpenAiText(prompt);
    const content = module.mapToDraftContent(providerOutput, inputParams, context);

    const draft = await listResource.add('aiDrafts', {
      moduleId, targetCollection: module.targetCollection,
      targetId: inputParams.targetId || inputParams.productId || inputParams.postId || null,
      inputParams, content, status: 'draft', providerUsed: 'openai', createdBy: uid
    });

    await asyncJob.updateJobStatus(job.id, 'completed', { draftId: draft.id });
    await eventBus.emit('ai.generate.completed', { moduleId, jobId: job.id, draftId: draft.id, uid });
    return draft;
  } catch (err) {
    await asyncJob.updateJobStatus(job.id, 'failed', err);
    await eventBus.emit('ai.generate.failed', { moduleId, jobId: job.id, uid, error: err.message });
    throw err;
  }
}

module.exports = { generateForModule, callOpenAiText, callOpenAiImage, OPENAI_API_KEY };
