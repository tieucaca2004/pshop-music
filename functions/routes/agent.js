/*
 * routes/agent.js — Sprint 14 Phase 4 (FINAL mục 17.18, 18). Founder Agent
 * Plan/Execute/Undo/Resume/Discard + Conversation Session.
 *
 * Plan/Step KHÔNG có nơi lưu bền phía client (chỉ biến JS trong bộ nhớ +
 * 1 bản snapshot localStorage cho Resume — xác nhận qua khảo sát mã nguồn
 * trước khi viết file này) — 1 API HTTP không trạng thái (stateless) BẮT
 * BUỘC phải có nơi lưu Plan thật giữa các lượt gọi, nên Phase 4 thêm 2 node
 * RTDB HOÀN TOÀN MỚI, tách biệt khỏi mọi node đã có: `agentPlans/{id}` (Plan
 * + Step, sống cho tới khi Founder Discard hoặc hoàn tất) và
 * `agentConversations/{id}` (lịch sử chat + pendingClarification — cơ chế
 * "hỏi lại khi thiếu thông tin" vốn chỉ là biến `let pendingClarification`
 * phía client, giờ chuyển hẳn vào Backend, TTL mềm 30 phút không hoạt động
 * — CHƯA có Cloud Scheduler dọn dẹp bản ghi hết hạn thật, chỉ kiểm tra tại
 * thời điểm gọi API, cùng nguyên tắc "không tự provision hạ tầng GCP mới"
 * đã ghi ở Phase 3 cho Social Media Center schedule).
 *
 * `undoLastStep()` bỏ qua `confirm()` (chỉ tồn tại trong trình duyệt) khi
 * hoàn tác `create-product` — API caller (UI Founder/OpenClaw) phải tự xác
 * nhận với người dùng TRƯỚC khi gọi endpoint undo cho bước này, vì đây là
 * xoá sản phẩm thật, không thể khôi phục.
 */
const listResource = require('../shared/listResource');
const { buildPlan } = require('../shared/agentPlanner');
const { executeStep, undoLastStep } = require('../shared/agentExecute');
const { TOOL_MAP, TOOL_GROUPS } = require('../shared/agentTools');

const PLANS_NODE = 'agentPlans';
const CONVERSATIONS_NODE = 'agentConversations';
const CONVERSATION_TTL_MS = 30 * 60 * 1000;

function isStaff(auth) {
  return auth.ok && (auth.role === 'admin' || auth.role === 'editor');
}

function normalizeStep(raw) {
  return {
    tool: raw.tool, target: raw.target || '', inputParams: raw.inputParams || {},
    status: 'pending', errorText: null, draftId: null, productId: null
  };
}

async function createPlan(text, attachments, authHeader, uid, email) {
  const plan = await buildPlan(text, attachments, authHeader);
  if (!plan.steps || !plan.steps.length) {
    return { planId: null, steps: [], reason: plan.reason || 'Không phân tích được kế hoạch.' };
  }
  const steps = plan.steps.map(normalizeStep);
  const record = await listResource.add(PLANS_NODE, { uid, email, steps, status: 'active' });
  return { planId: record.id, steps: record.steps };
}

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;
  const isAgentPath = path.indexOf('/v1/agent/') === 0;
  if (!isAgentPath) return null;

  if (!isStaff(auth)) return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor được dùng Founder Agent.');
  const authHeader = req.get('Authorization') || '';

  if (path === '/v1/agent/tools' && req.method === 'GET') {
    const tools = Object.keys(TOOL_MAP).map(id => ({ id, label: TOOL_MAP[id].label, group: TOOL_GROUPS[id] }));
    return sendSuccess(res, tools);
  }

  if (path === '/v1/agent/plan' && req.method === 'POST') {
    const text = (req.body && req.body.text || '').trim();
    if (!text) return sendError(res, 'INVALID_REQUEST', 'Thiếu "text" (yêu cầu của Founder).');
    const result = await createPlan(text, req.body && req.body.attachments, authHeader, auth.uid, auth.email);
    return sendSuccess(res, result, { status: result.planId ? 201 : 200 });
  }

  if (path.indexOf('/v1/agent/plan/') === 0) {
    const rest = path.slice('/v1/agent/plan/'.length);
    const parts = rest.split('/');
    const planId = parts[0];
    if (!planId) return sendError(res, 'INVALID_REQUEST', 'Thiếu planId.');
    const plan = await listResource.getOne(PLANS_NODE, planId);
    if (!plan) return sendError(res, 'NOT_FOUND', 'Không tìm thấy Plan.');

    // /v1/agent/plan/{planId}/steps/{i}/execute
    if (parts[1] === 'steps' && parts[3] === 'execute' && req.method === 'POST') {
      const i = parseInt(parts[2], 10);
      const step = plan.steps[i];
      if (!step) return sendError(res, 'NOT_FOUND', 'Không tìm thấy Step.');
      if (step.status === 'running') return sendError(res, 'INVALID_REQUEST', 'Step đang chạy.');
      const updatedStep = await executeStep(step, plan.steps, { authHeader });
      plan.steps[i] = updatedStep;
      const allDone = plan.steps.every(s => ['completed', 'skipped', 'failed'].indexOf(s.status) !== -1);
      const updated = await listResource.update(PLANS_NODE, planId, { steps: plan.steps, status: allDone ? 'finished' : 'active' });
      return sendSuccess(res, updated);
    }

    if (parts[1] === 'undo' && req.method === 'POST') {
      const result = await undoLastStep(plan.steps);
      if (!result.ok) return sendError(res, 'INVALID_REQUEST', result.message);
      const updated = await listResource.update(PLANS_NODE, planId, { steps: plan.steps, status: 'active' });
      return sendSuccess(res, updated);
    }

    if (parts[1] === 'resume' && req.method === 'POST') {
      if (plan.status === 'discarded') return sendError(res, 'INVALID_REQUEST', 'Plan đã bị Bỏ qua, không thể tiếp tục.');
      const updated = await listResource.update(PLANS_NODE, planId, { status: 'active' });
      return sendSuccess(res, updated);
    }

    if (parts[1] === 'discard' && req.method === 'POST') {
      const updated = await listResource.update(PLANS_NODE, planId, { status: 'discarded' });
      return sendSuccess(res, updated);
    }

    if (!parts[1] && req.method === 'GET') {
      return sendSuccess(res, plan);
    }

    return sendError(res, 'METHOD_NOT_ALLOWED', 'Route/method Plan không hợp lệ.');
  }

  if (path === '/v1/agent/conversations' && req.method === 'POST') {
    const record = await listResource.add(CONVERSATIONS_NODE, {
      uid: auth.uid, email: auth.email, messages: [], pendingClarification: null, lastActivityAt: Date.now()
    });
    return sendSuccess(res, { conversationId: record.id }, { status: 201 });
  }

  if (path.indexOf('/v1/agent/conversations/') === 0) {
    const rest = path.slice('/v1/agent/conversations/'.length);
    const [conversationId, action] = rest.split('/');
    if (!conversationId) return sendError(res, 'INVALID_REQUEST', 'Thiếu conversationId.');
    const convo = await listResource.getOne(CONVERSATIONS_NODE, conversationId);
    if (!convo) return sendError(res, 'NOT_FOUND', 'Không tìm thấy Conversation.');

    if (action === 'messages' && req.method === 'POST') {
      const idleMs = Date.now() - (convo.lastActivityAt || convo.createdAt || 0);
      if (idleMs > CONVERSATION_TTL_MS) {
        return sendError(res, 'INVALID_REQUEST', 'Conversation đã hết hạn (không hoạt động quá 30 phút) — hãy tạo Conversation mới.');
      }
      const text = (req.body && req.body.text || '').trim();
      if (!text) return sendError(res, 'INVALID_REQUEST', 'Thiếu "text".');
      const newAttachments = (req.body && req.body.attachments) || [];

      let effectiveText = text;
      let effectiveAttachments = newAttachments;
      if (convo.pendingClarification) {
        effectiveText = convo.pendingClarification.originalText + '. ' + text;
        effectiveAttachments = (convo.pendingClarification.attachments || []).concat(newAttachments);
      }

      const messages = (convo.messages || []).concat([{ role: 'user', text, createdAt: Date.now() }]);
      const result = await createPlan(effectiveText, effectiveAttachments, authHeader, auth.uid, auth.email);

      let pendingClarification = null;
      if (!result.planId) {
        pendingClarification = { originalText: effectiveText, attachments: effectiveAttachments };
        messages.push({ role: 'agent', text: result.reason, createdAt: Date.now() });
      } else {
        messages.push({ role: 'agent', text: 'Đã lập kế hoạch ' + result.steps.length + ' bước.', planId: result.planId, createdAt: Date.now() });
      }

      const updated = await listResource.update(CONVERSATIONS_NODE, conversationId, {
        messages, pendingClarification, lastActivityAt: Date.now()
      });
      return sendSuccess(res, Object.assign({ conversationId }, result, { conversation: updated }));
    }

    if (!action && req.method === 'GET') {
      return sendSuccess(res, convo);
    }

    return sendError(res, 'METHOD_NOT_ALLOWED', 'Route/method Conversation không hợp lệ.');
  }

  return sendError(res, 'NOT_FOUND', 'Không tìm thấy route Founder Agent.');
}

module.exports = { handle };
