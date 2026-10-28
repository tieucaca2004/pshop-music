// MT-enabled
/*
 * routes/fbPublisher.js — PSH Facebook Auto-Publisher pipeline.
 *
 * Sprint 15 Phase FB: nhận yêu cầu đăng bài từ Telegram/OpenClaw, tạo draft,
 * gọi AI generate (tùy chọn), gửi preview lên Telegram kèm inline keyboard,
 * xử lý approve/cancel từ callback_query, publish thật lên đúng Fanpage.
 *
 * Ba endpoints:
 *   POST /v1/facebook-publisher/drafts
 *     — tạo draft mới, generate AI caption + AI image (nếu generateAi:true),
 *       gửi preview Telegram, trả về {draftId, status}.
 *       Idempotency: telegramUpdateId làm dedup key.
 *   POST /v1/facebook-publisher/drafts/:draftId/edits
 *     — chỉnh sửa draft hiện có (caption/imageUrls/regenerateCaption/regenerateImage).
 *       Bump version counter, gửi preview mới. Vô hiệu hoá approve button cũ.
 *   POST /v1/facebook-publisher/callback
 *     — nhận callback_query từ Telegram (qua webhook forwarding).
 *       Auth bằng X-PSH-Webhook-Secret header.
 *       Xử lý: fb_approve:{draftId}:{version} → publish thật (RTDB transaction);
 *               fb_cancel:{draftId} → cancel.
 *
 * Publish thật: gọi facebook-graph-api.js TRỰC TIẾP (Option B) thay vì
 * proxy qua facebookPublish Cloud Function — tránh race condition với
 * facebookActiveToken global khi nhiều request song song.
 *
 * Double-approve prevention: fb_approve dùng approveTransaction() (RTDB
 * atomic check-and-set) — hai approve click đồng thời chỉ 1 cái commit được.
 *
 * Per-version approval: callback_data chứa version số (fb_approve:{id}:{v}).
 * Nếu version không khớp với draft.version hiện tại → reject với thông báo
 * rõ ràng. Mỗi lần edit draft → bumpVersion() → approve button cũ vô hiệu.
 *
 * Security constraints (từ Founder):
 *   - Không ghi token vào source code hay log
 *   - Token đọc từ RTDB facebookPageTokens (server-only node)
 *   - Telegram bot token: Functions secret TELEGRAM_BOT_TOKEN (Secret Manager), KHÔNG ở RTDB (shared/telegramSecrets.js)
 *   - telegramConfig (RTDB) chỉ chứa cấu hình KHÔNG bí mật (chatId, approverIds, approverMap, dryRun...)
 *   - Secret gateway: Functions secret WEBHOOK_SIGNING_SECRET
 *   - Mock mode tự động nếu page.isMock === true (không cần config thêm)
 */
const admin = require('firebase-admin');
const fbDraftStore = require('../shared/fbDraftStore');
const fbPageConfig = require('../shared/fbPageConfig');
const { sendMessage, sendPhoto, answerCallbackQuery } = require('../shared/telegram');
const { generateForModule } = require('../shared/aiGenerate');
const facebookGraphApi = require('../facebook-graph-api');
const { safeEqual } = require('../shared/secretCompare');
const { isRelayTrusted } = require('../shared/relayTrust');
const { resolvePshActor } = require('../shared/approverPolicy');
const secrets = require('../shared/telegramSecrets');
const { resolvePublishMode, describeMode } = require('../shared/publishMode');

// ── Helpers đọc config từ RTDB (server-only nodes) ───────────────────────────

// Phase 5: cấu hình KHÔNG bí mật từ RTDB + bot token từ Functions secret TELEGRAM_BOT_TOKEN (xem shared/telegramSecrets.js).
async function getTelegramConfig() {
  return secrets.loadTelegramConfig();
}

// notifyChat — tin nhắn kết quả vào chat đã cấu hình (best-effort, không ném lỗi).
async function notifyChat(tgConfig, text) {
  if (!tgConfig || !tgConfig.token || !tgConfig.chatId) return;
  try { await sendMessage({ token: tgConfig.token, chatId: tgConfig.chatId, text: String(text).slice(0, 3900) }); } catch (e) { /* best-effort */ }
}

// Secret gateway = Functions secret WEBHOOK_SIGNING_SECRET (đã bind cho apiGateway), không còn đọc RTDB.
async function getWebhookSecret() {
  return secrets.getGatewaySigningSecret();
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function isStaffOrAgent(auth) {
  return auth.ok && (auth.role === 'admin' || auth.role === 'editor' || auth.role === 'agent');
}

// ── checkApprover (G1O → G1Q fail-closed) — ai được bấm Duyệt/Huỷ ───────────────
// callback_query.from / message.chat CHỈ đáng tin khi request đã qua relay Telegram (xem
// shared/relayTrust.js). Quy tắc (TỪ CHỐI khi cấu hình thiếu/sai định dạng — không bỏ qua im lặng):
//   1. telegramConfig.chatId PHẢI có và hợp lệ:
//        - dạng số (vd "123", "-1001234")  → message.chat.id phải bằng
//        - dạng "@username" (kênh/nhóm công khai) → message.chat.username phải khớp (không phân biệt hoa thường)
//        - thiếu / dạng khác               → TỪ CHỐI ('chat_not_configured' / 'chat_config_invalid')
//      (Nếu chatId thiếu hoặc sai thì bản xem trước cũng không gửi được → không có nút nào để bấm hợp lệ.)
//   2. Nếu telegramConfig.approverIds là mảng không rỗng: from.id PHẢI nằm trong đó.
// Trả { ok, reason, approvedBy } — approvedBy được lưu vào draft để truy vết.
function checkApprover(callbackQuery, tgConfig) {
  const from = (callbackQuery && callbackQuery.from) || {};
  const chat = (callbackQuery && callbackQuery.message && callbackQuery.message.chat) || null;
  const approvedBy = { id: from.id != null ? String(from.id) : null, username: from.username || null };
  const cfgChat = tgConfig && tgConfig.chatId != null ? String(tgConfig.chatId).trim() : '';
  if (!cfgChat) return { ok: false, reason: 'chat_not_configured', approvedBy };
  if (/^-?\d+$/.test(cfgChat)) {
    if (!chat || chat.id == null || String(chat.id) !== cfgChat) return { ok: false, reason: 'chat_mismatch', approvedBy };
  } else if (/^@[A-Za-z0-9_]{4,}$/.test(cfgChat)) {
    if (!chat || !chat.username || ('@' + String(chat.username)).toLowerCase() !== cfgChat.toLowerCase()) {
      return { ok: false, reason: 'chat_mismatch', approvedBy };
    }
  } else {
    return { ok: false, reason: 'chat_config_invalid', approvedBy };
  }
  const allow = tgConfig && Array.isArray(tgConfig.approverIds) ? tgConfig.approverIds.map(String) : [];
  if (allow.length > 0 && (approvedBy.id === null || allow.indexOf(approvedBy.id) < 0)) {
    return { ok: false, reason: 'approver_not_allowed', approvedBy };
  }
  return { ok: true, approvedBy };
}

// ── generateAiImage — gọi image-generator module để tạo ảnh quảng cáo ────────
// inputParams: body từ request (có thể chứa productId, customPrompt, v.v.)
// caption: caption đã được AI hoặc user viết — dùng làm customPrompt nếu không có productId
async function generateAiImage(inputParams, caption, uid, email) {
  const imageParams = {
    imageType: inputParams.imageType || 'Facebook Post Image',
    style: inputParams.imageStyle || 'Minimal',
    size: inputParams.imageSize || '1024x1024'
  };
  // Ưu tiên productId nếu có (để load context sản phẩm thật)
  if (inputParams.productId) {
    imageParams.productId = inputParams.productId;
  } else {
    // Dùng caption đã generate làm grounding prompt cho ảnh
    imageParams.customPrompt = caption || inputParams.promotion || 'Facebook post for Pshop Music';
  }
  try {
    const aiDraft = await generateForModule('image-generator', imageParams, uid, email);
    const content = aiDraft.content || aiDraft;
    return content.imageUrl || null;
  } catch (err) {
    // image gen thất bại không block flow — trả null, dùng ảnh gốc nếu có
    return null;
  }
}

// ── Gửi preview Telegram (best-effort — không block flow nếu lỗi) ─────────────

async function sendTelegramPreview(tgConfig, draftId, version, caption, pageId, imageUrls, generatedImageUrl) {
  if (!tgConfig.token || !tgConfig.chatId) return null;
  const v = version || 1;
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Duyệt & Đăng', callback_data: 'fb_approve:' + draftId + ':' + v },
        { text: '❌ Huỷ', callback_data: 'fb_cancel:' + draftId }
      ]
    ]
  };
  const previewText = '📋 Xem trước bài đăng Facebook\nPage ID: ' + pageId + '\nPhiên bản: v' + v + '\n\n' + caption;
  // Ưu tiên: ảnh AI generate trước, sau đó ảnh gốc của user
  const displayImage = generatedImageUrl || (Array.isArray(imageUrls) && imageUrls.length > 0 ? imageUrls[0] : null);
  if (displayImage) {
    return sendPhoto({
      token: tgConfig.token,
      chatId: tgConfig.chatId,
      photo: displayImage,
      caption: previewText,
      replyMarkup
    });
  }
  return sendMessage({
    token: tgConfig.token,
    chatId: tgConfig.chatId,
    text: previewText,
    replyMarkup
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

async function handle(req, res, helpers) {
  const { sendSuccess, sendError, auth } = helpers;
  const path = req.__pshPath;

  // ── POST /v1/facebook-publisher/drafts ─────────────────────────────────────
  if (path === '/v1/facebook-publisher/drafts' && req.method === 'POST') {
    if (!auth.ok) {
      return sendError(res, 'UNAUTHENTICATED', 'Cần đăng nhập để tạo draft Facebook.');
    }
    if (!isStaffOrAgent(auth)) {
      return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor/Agent được tạo draft Facebook.');
    }

    const body = req.body || {};
    const { telegramUpdateId, pageId, caption, imageUrls, requestedBy, generateAi } = body;

    if (!pageId) {
      return sendError(res, 'INVALID_REQUEST', 'Thiếu pageId — phải chỉ rõ Fanpage đích.');
    }
    if (!caption && !generateAi) {
      return sendError(res, 'INVALID_REQUEST', 'Thiếu caption hoặc generateAi:true.');
    }

    // Idempotency: nếu telegramUpdateId đã xử lý rồi → trả về ngay
    if (telegramUpdateId != null) {
      const existing = await fbDraftStore.findByTelegramUpdateId(Number(telegramUpdateId));
      if (existing) {
        return sendSuccess(res, { draftId: existing.id, status: existing.status, idempotent: true });
      }
    }

    // Verify pageId có token (mock hoặc thật)
    const pageToken = await fbPageConfig.getPageToken(pageId);
    if (!pageToken) {
      return sendError(res, 'NOT_FOUND',
        'Fanpage "' + pageId + '" chưa kết nối hoặc không có token. ' +
        'Vào Facebook Configuration → OAuth để kết nối page này trước.'
      );
    }

    // Tạo draft ở RECEIVED
    const draft = await fbDraftStore.createDraft({
      telegramUpdateId: telegramUpdateId != null ? Number(telegramUpdateId) : null,
      pageId,
      caption: caption || '',
      imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
      requestedBy: requestedBy || auth.uid || 'unknown'
    });

    let finalCaption = caption || '';
    let generatedImageUrl = null;

    if (generateAi) {
      // AI generate caption + (tuỳ chọn) AI generate image
      await fbDraftStore.updateStatus(draft.id, 'PROCESSING');
      try {
        const aiDraft = await generateForModule('facebook-post-generator', body, auth.uid, auth.email);
        const aiContent = aiDraft.content || aiDraft;
        // facebook-post-generator trả về: {versions:[{hook, caption, cta, hashtags}], ...}
        const firstVersion = Array.isArray(aiContent.versions) && aiContent.versions[0];
        if (firstVersion) {
          const parts = [];
          if (firstVersion.hook) parts.push(firstVersion.hook);
          if (firstVersion.caption) parts.push(firstVersion.caption);
          if (firstVersion.cta) parts.push(firstVersion.cta);
          if (Array.isArray(firstVersion.hashtags) && firstVersion.hashtags.length) {
            parts.push(firstVersion.hashtags.map(h => h.startsWith('#') ? h : '#' + h).join(' '));
          }
          finalCaption = parts.join('\n\n') || caption || '';
        } else {
          finalCaption = aiContent.caption || aiContent.hook || caption || '';
        }

        // Generate AI image nếu user không cung cấp ảnh (hoặc muốn ảnh AI)
        const hasOriginalImages = Array.isArray(imageUrls) && imageUrls.length > 0;
        if (!hasOriginalImages || body.generateAiImage) {
          generatedImageUrl = await generateAiImage(body, finalCaption, auth.uid, auth.email);
        }

        await fbDraftStore.updateStatus(draft.id, 'PENDING_APPROVAL', {
          aiCaption: finalCaption,
          generatedImageUrl: generatedImageUrl || null
        });
      } catch (err) {
        await fbDraftStore.updateStatus(draft.id, 'FAILED', { failReason: 'AI generate lỗi: ' + err.message });
        return sendError(res, 'UPSTREAM_ERROR', 'AI generate thất bại: ' + err.message);
      }
    } else {
      // Non-AI path: caption đến thẳng từ user, vẫn cần PROCESSING trước PENDING_APPROVAL
      finalCaption = caption;
      await fbDraftStore.updateStatus(draft.id, 'PROCESSING');
      await fbDraftStore.updateStatus(draft.id, 'PENDING_APPROVAL');
    }

    // Gửi preview Telegram (best-effort)
    const tgConfig = await getTelegramConfig();
    const tgResult = await sendTelegramPreview(
      tgConfig, draft.id, draft.version || 1, finalCaption, pageId,
      Array.isArray(imageUrls) ? imageUrls : [], generatedImageUrl
    );
    if (tgResult && tgResult.ok && tgResult.result && tgResult.result.result) {
      const msgId = tgResult.result.result.message_id;
      await admin.database().ref('fbPostDrafts/' + draft.id).update({
        telegramMessageId: msgId || null,
        telegramChatId: tgConfig.chatId || null
      });
    }

    return sendSuccess(res, { draftId: draft.id, status: 'PENDING_APPROVAL' }, { status: 201 });
  }

  // ── POST /v1/facebook-publisher/drafts/:draftId/edits ─────────────────────
  // Multi-round editing: chỉnh sửa caption/ảnh trên draft đang PENDING_APPROVAL.
  // Mỗi lần edit → bumpVersion() → approve button cũ vô hiệu hoá.
  const editMatch = path && path.match(/^\/v1\/facebook-publisher\/drafts\/([^/]+)\/edits$/);
  if (editMatch && req.method === 'POST') {
    if (!auth.ok) {
      return sendError(res, 'UNAUTHENTICATED', 'Cần đăng nhập để chỉnh sửa draft.');
    }
    if (!isStaffOrAgent(auth)) {
      return sendError(res, 'PERMISSION_DENIED', 'Chỉ Admin/Editor/Agent được chỉnh sửa draft.');
    }

    const draftId = editMatch[1];
    const draft = await fbDraftStore.getDraft(draftId);
    if (!draft) {
      return sendError(res, 'NOT_FOUND', 'Draft không tìm thấy: ' + draftId);
    }
    if (draft.status !== 'PENDING_APPROVAL') {
      return sendError(res, 'INVALID_STATE',
        'Chỉ có thể chỉnh sửa draft đang ở PENDING_APPROVAL. Trạng thái hiện tại: ' + draft.status
      );
    }

    const body = req.body || {};
    const { caption, imageUrls, regenerateCaption, regenerateImage } = body;

    let newCaption = draft.aiCaption || draft.caption;
    let newImageUrls = draft.imageUrls || [];
    let newGeneratedImageUrl = draft.generatedImageUrl || null;
    const patches = {};

    // Cập nhật caption trực tiếp
    if (caption !== undefined && caption !== null) {
      newCaption = caption;
      patches.caption = caption;
      patches.aiCaption = caption; // aiCaption là caption hiển thị preview
    }

    // Cập nhật imageUrls
    if (Array.isArray(imageUrls)) {
      newImageUrls = imageUrls;
      patches.imageUrls = imageUrls;
    }

    // Regenerate caption bằng AI
    if (regenerateCaption) {
      try {
        const aiDraft = await generateForModule('facebook-post-generator', Object.assign({}, body, { pageId: draft.pageId }), auth.uid, auth.email);
        const aiContent = aiDraft.content || aiDraft;
        const firstVersion = Array.isArray(aiContent.versions) && aiContent.versions[0];
        if (firstVersion) {
          const parts = [];
          if (firstVersion.hook) parts.push(firstVersion.hook);
          if (firstVersion.caption) parts.push(firstVersion.caption);
          if (firstVersion.cta) parts.push(firstVersion.cta);
          if (Array.isArray(firstVersion.hashtags) && firstVersion.hashtags.length) {
            parts.push(firstVersion.hashtags.map(h => h.startsWith('#') ? h : '#' + h).join(' '));
          }
          newCaption = parts.join('\n\n') || newCaption;
        } else {
          newCaption = aiContent.caption || aiContent.hook || newCaption;
        }
        patches.aiCaption = newCaption;
      } catch (err) {
        return sendError(res, 'UPSTREAM_ERROR', 'AI regenerate caption thất bại: ' + err.message);
      }
    }

    // Regenerate image bằng AI
    if (regenerateImage) {
      const newImg = await generateAiImage(body, newCaption, auth.uid, auth.email);
      if (newImg) {
        newGeneratedImageUrl = newImg;
        patches.generatedImageUrl = newImg;
      }
    }

    // Lưu thay đổi + tăng version trong MỘT transaction (G1O): chỉ thành công khi draft vẫn
    // PENDING_APPROVAL; nút Duyệt cũ bị vô hiệu cùng lúc nội dung đổi.
    const edit = await fbDraftStore.applyEditTransaction(draftId, patches);
    if (!edit.committed) {
      return sendError(res, 'INVALID_STATE',
        'Draft đã thay đổi trạng thái (' + (edit.reason || 'unknown') + ') nên không chỉnh sửa được nữa.');
    }
    const newVersion = edit.newVersion;

    // Gửi preview Telegram mới với version mới
    const tgConfig = await getTelegramConfig();
    const tgResult = await sendTelegramPreview(
      tgConfig, draftId, newVersion, newCaption, draft.pageId,
      newImageUrls, newGeneratedImageUrl
    );
    if (tgResult && tgResult.ok && tgResult.result && tgResult.result.result) {
      const msgId = tgResult.result.result.message_id;
      await admin.database().ref('fbPostDrafts/' + draftId).update({
        telegramMessageId: msgId || null,
        telegramChatId: tgConfig.chatId || null
      });
    }

    return sendSuccess(res, {
      draftId,
      version: newVersion,
      status: 'PENDING_APPROVAL',
      aiCaption: newCaption,
      generatedImageUrl: newGeneratedImageUrl
    });
  }

  // ── POST /v1/facebook-publisher/callback ───────────────────────────────────
  if (path === '/v1/facebook-publisher/callback' && req.method === 'POST') {
    // G1Q — hai đường vào, mức tin cậy khác nhau:
    //   (a) relayTrusted: request nội bộ do shared/telegramWebhookRelay.js tạo SAU KHI đã kiểm
    //       X-Telegram-Bot-Api-Secret-Token → payload (from/chat) là của Telegram thật.
    //   (b) gọi thẳng qua gateway bằng X-PSH-Webhook-Secret: payload do người gọi tự điền, không thể
    //       chứng minh from/chat. Mặc định KHÔNG cho duyệt/huỷ qua đường này (xem allowGatewayCallback).
    const relayTrusted = isRelayTrusted(req);
    if (!relayTrusted) {
      const providedSecret = (req.get && req.get('X-PSH-Webhook-Secret')) || '';
      const expectedSecret = await getWebhookSecret();
      if (!expectedSecret || !safeEqual(providedSecret, expectedSecret)) {
        return sendError(res, 'UNAUTHENTICATED', 'Webhook secret không hợp lệ hoặc chưa cấu hình.');
      }
    }

    const body = req.body || {};
    const { callback_query } = body;
    if (!callback_query) {
      return sendError(res, 'INVALID_REQUEST', 'Thiếu callback_query trong request body.');
    }

    const callbackQueryId = callback_query.id;
    const callbackData = callback_query.data || '';

    // Không phải callback của fbPublisher → trả 200, không làm gì
    if (!callbackData.startsWith('fb_')) {
      return sendSuccess(res, { handled: false });
    }

    // Parse format: {action}:{draftId} hoặc {action}:{draftId}:{version}
    const parts = callbackData.split(':');
    if (parts.length < 2) {
      return sendError(res, 'INVALID_REQUEST', 'callback_data sai format.');
    }
    const action = parts[0];              // 'fb_approve' | 'fb_cancel'
    const draftId = parts[1];            // RTDB push key
    const versionInCallback = parts.length >= 3 ? parseInt(parts[2], 10) : null; // version hoặc null (backward compat)

    if (!draftId) {
      return sendError(res, 'INVALID_REQUEST', 'Thiếu draftId trong callback_data.');
    }
    // draftId được ghép vào đường dẫn RTDB: chỉ nhận khoá push hợp lệ (không có "/", ".", "$"...).
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(draftId)) {
      return sendError(res, 'INVALID_REQUEST', 'draftId trong callback_data không hợp lệ.');
    }

    let tgConfig;
    try { tgConfig = await getTelegramConfig(); }
    catch (e) {
      // Không đọc được cấu hình ⇒ KHÔNG xử lý duyệt/huỷ và KHÔNG đăng (fail-safe). Log không chứa giá trị cấu hình.
      console.error('[fbPublisher] không đọc được telegramConfig — bỏ qua callback (không đăng).');
      return sendSuccess(res, { handled: true, draftId, action, skipped: true, reason: 'config_unreadable' });
    }

    // G1Q — gọi thẳng qua gateway: không xác thực được người bấm → từ chối trừ khi chủ dự án chủ động
    // bật telegramConfig.allowGatewayCallback === true (chấp nhận rủi ro: ai giữ secret đều giả được duyệt).
    if (!relayTrusted && tgConfig.allowGatewayCallback !== true) {
      return sendSuccess(res, { handled: true, draftId, action, skipped: true, reason: 'gateway_callback_disabled' });
    }

    // G1O — chỉ người/ chat được phép mới duyệt hoặc huỷ.
    const approver = checkApprover(callback_query, tgConfig);
    if (!approver.ok) {
      if (tgConfig.token && callbackQueryId) {
        await answerCallbackQuery({ token: tgConfig.token, callbackQueryId, text: '⛔ Bạn không có quyền duyệt bài này.' });
      }
      return sendSuccess(res, { handled: true, draftId, action, skipped: true, reason: approver.reason });
    }
    // Đồng bộ với intake: phải có approverIds tường minh VÀ ánh xạ sang uid PSH còn quyền đăng (fail-closed, G1).
    const allowIds = Array.isArray(tgConfig.approverIds) ? tgConfig.approverIds : [];
    const actor = allowIds.length === 0 ? { ok: false, reason: 'approver_ids_not_configured' } : await resolvePshActor(approver.approvedBy.id, tgConfig);
    if (!actor.ok) {
      if (tgConfig.token && callbackQueryId) {
        await answerCallbackQuery({ token: tgConfig.token, callbackQueryId, text: '⛔ Tài khoản Telegram này chưa được cấp quyền đăng bài trong PSH.' });
      }
      return sendSuccess(res, { handled: true, draftId, action, skipped: true, reason: actor.reason });
    }
    approver.approvedBy.pshUid = actor.uid;
    approver.approvedBy.pshRole = actor.role;

    // ── fb_approve ────────────────────────────────────────────────────────────
    if (action === 'fb_approve') {
      // Đọc draft để kiểm tra version trước khi dùng transaction
      const draft = await fbDraftStore.getDraft(draftId);
      if (!draft) {
        if (tgConfig.token && callbackQueryId) {
          await answerCallbackQuery({ token: tgConfig.token, callbackQueryId, text: 'Draft không tồn tại.' });
        }
        return sendError(res, 'NOT_FOUND', 'Draft không tìm thấy: ' + draftId);
      }

      // Version check: nếu callback có version và version không khớp → reject
      if (versionInCallback !== null && !isNaN(versionInCallback) && draft.version != null) {
        if (versionInCallback !== draft.version) {
          if (tgConfig.token && callbackQueryId) {
            await answerCallbackQuery({
              token: tgConfig.token, callbackQueryId,
              text: '⚠️ Bản nháp đã được chỉnh sửa, phiên bản này không còn hợp lệ. Vui lòng dùng nút Duyệt mới nhất.'
            });
          }
          return sendSuccess(res, { handled: true, draftId, action, skipped: true, reason: 'version_mismatch', draftVersion: draft.version, callbackVersion: versionInCallback });
        }
      }

      // RTDB transaction để ngăn double-approve (hai click đồng thời) VÀ kiểm version ngay trong
      // transaction (G1O) — kiểm version ở bước đọc phía trên có thể lỗi thời nếu có người sửa draft.
      const expectedVersion = (versionInCallback !== null && !isNaN(versionInCallback)) ? versionInCallback : null;
      const txn = await fbDraftStore.approveTransaction(draftId, { expectedVersion, approvedBy: approver.approvedBy });
      const { committed, currentStatus } = txn;
      if (!committed && txn.reason === 'version_mismatch') {
        if (tgConfig.token && callbackQueryId) {
          await answerCallbackQuery({
            token: tgConfig.token, callbackQueryId,
            text: '⚠️ Bản nháp vừa được chỉnh sửa, phiên bản này không còn hợp lệ. Vui lòng dùng nút Duyệt mới nhất.'
          });
        }
        return sendSuccess(res, { handled: true, draftId, action, skipped: true, reason: 'version_mismatch', callbackVersion: versionInCallback });
      }
      if (!committed) {
        // Draft không ở PENDING_APPROVAL (đã được xử lý bởi request song song khác)
        if (tgConfig.token && callbackQueryId) {
          await answerCallbackQuery({
            token: tgConfig.token, callbackQueryId,
            text: 'Draft đã được xử lý rồi (trạng thái: ' + (currentStatus || 'unknown') + ').'
          });
        }
        return sendSuccess(res, { handled: true, draftId, action, skipped: true, currentStatus: currentStatus || 'not_pending' });
      }

      // Transaction thành công → APPROVED, tiếp tục publish
      // Nội dung đăng = bản ghi tại ĐÚNG thời điểm duyệt (snapshot của transaction), không đọc lại.
      const approvedDraft = txn.draft;
      await fbDraftStore.updateStatus(draftId, 'PUBLISHING');

      // Bản nháp từ Telegram: Page đích phải VẪN là Page đang được chọn (hoặc nằm trong allowedPageIds) tại lúc đăng — nếu Super Admin
      // đã đổi Page giữa lúc xem trước và lúc duyệt, KHÔNG đăng (kể cả khi còn token chờ chọn của Page cũ).
      if (approvedDraft.source === 'telegram' && !(await fbPageConfig.isPageAllowedForTelegram(approvedDraft.pageId, tgConfig))) {
        await fbDraftStore.updateStatus(draftId, 'FAILED', { failReason: 'Page đích không còn là Page đang được chọn: ' + approvedDraft.pageId, failStage: 'publish' });
        if (tgConfig.token && callbackQueryId) {
          await answerCallbackQuery({ token: tgConfig.token, callbackQueryId, text: '⛔ Page đích không còn là Page đang chọn — không đăng.' });
        }
        await notifyChat(tgConfig, '⛔ Không đăng: Page đích (' + approvedDraft.pageId + ') không còn là Page đang được chọn trong trang quản trị. Gửi lại sản phẩm sau khi kiểm tra Page.');
        return sendSuccess(res, { handled: true, draftId, action, skipped: true, reason: 'page_not_active' });
      }

      // CHẾ ĐỘ DRY-RUN (telegramConfig.dryRun === true, do chủ dự án bật tường minh): chạy đủ intake → AI → ảnh → xem trước →
      // duyệt nhưng KHÔNG gọi Facebook (không upload ảnh, không đăng). Dùng để thử đầu-cuối trên Telegram/Storage/AI thật
      // mà không tạo bài công khai. Bản nháp ghi dryRun:true, facebookPostId rỗng; Telegram báo rõ "không đăng".
      // F2 (Phase 8): FAIL-SAFE — chỉ đăng thật khi telegramConfig.dryRun === false (boolean, tường minh). Thiếu/null/sai kiểu/true/cấu hình hỏng ⇒ dry-run.
      const publishMode = resolvePublishMode(tgConfig);
      if (!publishMode.live) {
        await fbDraftStore.updateStatus(draftId, 'PUBLISHED', { publishedAt: Date.now(), dryRun: true, dryRunReason: publishMode.reason, facebookPostId: null });
        if (tgConfig.token && callbackQueryId) {
          await answerCallbackQuery({ token: tgConfig.token, callbackQueryId, text: '🧪 DRY-RUN: đã duyệt, KHÔNG đăng lên Facebook.' });
        }
        await notifyChat(tgConfig, '🧪 [DRY-RUN] Đã duyệt nhưng KHÔNG đăng lên Facebook — chế độ: ' + describeMode(publishMode) + '.\nSẽ đăng lên Page: ' + (approvedDraft.pageName || approvedDraft.pageId) + ' (' + approvedDraft.pageId + ')\nẢnh: ' + (Array.isArray(approvedDraft.publishImages) ? approvedDraft.publishImages.length : 0) + ' · Mã bản nháp: ' + draftId + (publishMode.reason === 'dryRun_true' ? '' : '\n⚠️ Muốn đăng thật, chủ dự án phải đặt telegramConfig.dryRun = false (boolean) trong RTDB.'));
        return sendSuccess(res, { handled: true, draftId, action, dryRun: true });
      }

      const pageToken = await fbPageConfig.getPageToken(approvedDraft.pageId);
      if (!pageToken) {
        await fbDraftStore.updateStatus(draftId, 'FAILED', { failReason: 'Không tìm thấy page token cho pageId: ' + approvedDraft.pageId, failStage: 'publish' });
        await notifyChat(tgConfig, '❌ Không đăng được: không còn token cho Page ' + approvedDraft.pageId + '. Dùng /retry ' + draftId + ' sau khi Super Admin kết nối lại Page.');
        if (tgConfig.token && callbackQueryId) {
          await answerCallbackQuery({ token: tgConfig.token, callbackQueryId, text: '❌ Lỗi: Không tìm thấy token page.' });
        }
        return sendError(res, 'NOT_FOUND', 'Không tìm thấy page token cho pageId: ' + approvedDraft.pageId);
      }

      const messageToPost = approvedDraft.aiCaption || approvedDraft.caption;
      const mockMode = pageToken.isMock;

      try {
        let publishResult;
        // Xác minh token truy cập ĐÚNG Page trước khi đăng (chỉ đọc, không đăng). Lỗi → dừng, báo thật.
        await facebookGraphApi.getPageInfo({ mockMode, pageId: approvedDraft.pageId, pageAccessToken: pageToken.accessToken });
        // Ảnh đăng = đúng danh sách người duyệt đã THẤY trong bản xem trước (publishImages, do pipeline Telegram chốt).
        // Bản nháp cũ (không có publishImages): giữ hành vi cũ — ảnh AI trước rồi ảnh gốc.
        const allImages = [];
        if (Array.isArray(approvedDraft.publishImages) && approvedDraft.publishImages.length > 0) {
          approvedDraft.publishImages.forEach(u => { if (u && !allImages.includes(u)) allImages.push(u); });
        } else {
          if (approvedDraft.generatedImageUrl) allImages.push(approvedDraft.generatedImageUrl);
          const origImages = Array.isArray(approvedDraft.imageUrls) ? approvedDraft.imageUrls : [];
          origImages.forEach(u => { if (u && !allImages.includes(u)) allImages.push(u); });
        }

        if (allImages.length > 0) {
          const photoIds = [];
          for (const imgUrl of allImages) {
            try {
              const uploadResult = await facebookGraphApi.uploadPhoto({
                guard: true,
                mockMode,
                pageId: approvedDraft.pageId,
                imageUrl: imgUrl,
                pageAccessToken: pageToken.accessToken
              });
              if (uploadResult.id) photoIds.push({ media_fbid: uploadResult.id });
            } catch (uploadErr) {
              // KHÔNG đăng "chỉ chữ" khi ảnh người duyệt đã xem bị lỗi: dừng và báo (chưa có bài nào được tạo).
              throw new Error('Facebook từ chối ảnh: ' + uploadErr.message);
            }
          }
          publishResult = await facebookGraphApi.publishToFeed({
            guard: true,
            mockMode,
            pageId: approvedDraft.pageId,
            message: messageToPost,
            attachedMedia: photoIds.length > 0 ? photoIds : null,
            pageAccessToken: pageToken.accessToken
          });
        } else {
          publishResult = await facebookGraphApi.publishToFeed({
            guard: true,
            mockMode,
            pageId: approvedDraft.pageId,
            message: messageToPost,
            attachedMedia: null,
            pageAccessToken: pageToken.accessToken
          });
        }

        // Kiểm tra Graph API có trả về id không — chỉ coi là thành công khi có id
        if (!publishResult || !publishResult.id) {
          throw new Error('Graph API không trả về post ID — bài đăng có thể không thành công.');
        }

        const facebookPostId = publishResult.id;
        await fbDraftStore.updateStatus(draftId, 'PUBLISHED', {
          publishedAt: Date.now(),
          facebookPostId
        });

        const postUrl = !mockMode
          ? 'https://www.facebook.com/' + facebookPostId
          : null;

        const successText = mockMode
          ? '✅ [MOCK] Đăng bài thành công (mock mode). Post ID: ' + facebookPostId
          : '✅ Đã đăng bài lên Facebook!' + (postUrl ? ' ' + postUrl : '');

        if (tgConfig.token && callbackQueryId) {
          await answerCallbackQuery({ token: tgConfig.token, callbackQueryId, text: successText });
        }
        await notifyChat(tgConfig, postUrl
          ? '🎉 Bài đã lên sóng: ' + postUrl
          : '✅ [MOCK] Bài giả lập đã "đăng" (Page thử, không có bài thật). Post ID: ' + facebookPostId);

        return sendSuccess(res, { handled: true, draftId, action, facebookPostId, postUrl, mockMode });

      } catch (err) {
        const safeMsg = String(err && err.message || 'lỗi không rõ').replace(/\s+/g, ' ').slice(0, 300);
        const ambiguous = !!(err && err.ambiguous);
        await fbDraftStore.updateStatus(draftId, 'FAILED', { failReason: 'Publish lỗi: ' + safeMsg, failStage: ambiguous ? 'publish_unknown' : 'publish' });
        if (tgConfig.token && callbackQueryId) {
          await answerCallbackQuery({ token: tgConfig.token, callbackQueryId, text: '❌ Đăng bài thất bại: ' + safeMsg.slice(0, 150) });
        }
        await notifyChat(tgConfig, ambiguous
          ? '⚠️ Đăng bài KHÔNG RÕ KẾT QUẢ: ' + safeMsg + '\nHãy KIỂM TRA Fanpage (mục bài viết của Page) TRƯỚC khi làm gì tiếp. /retry bị khoá để tránh đăng trùng (Facebook không đảm bảo idempotency).\n• Nếu bài ĐÃ có trên Fanpage: không cần làm gì thêm.\n• Nếu bài CHƯA có: gửi lại sản phẩm để tạo bản nháp MỚI. Mã: ' + draftId
          : '❌ Đăng bài THẤT BẠI (Facebook trả lỗi rõ ràng, chưa tạo bài): ' + safeMsg + '\nCó thể dùng /retry ' + draftId + ' để duyệt lại. Hệ thống không thể bảo đảm tuyệt đối — nếu nghi ngờ, hãy kiểm tra Fanpage trước khi /retry.');
        return sendError(res, 'UPSTREAM_ERROR', 'Publish Facebook thất bại: ' + err.message);
      }
    }

    // ── fb_cancel ─────────────────────────────────────────────────────────────
    if (action === 'fb_cancel') {
      const draft = await fbDraftStore.getDraft(draftId);
      if (!draft) {
        if (tgConfig.token && callbackQueryId) {
          await answerCallbackQuery({ token: tgConfig.token, callbackQueryId, text: 'Draft không tồn tại.' });
        }
        return sendError(res, 'NOT_FOUND', 'Draft không tìm thấy: ' + draftId);
      }
      // Chỉ cho phép huỷ khi ở PENDING_APPROVAL
      if (draft.status !== 'PENDING_APPROVAL') {
        if (tgConfig.token && callbackQueryId) {
          await answerCallbackQuery({
            token: tgConfig.token, callbackQueryId,
            text: 'Không thể huỷ ở trạng thái này (' + draft.status + ').'
          });
        }
        return sendSuccess(res, { handled: true, draftId, action, skipped: true });
      }
      const cancelled = await fbDraftStore.cancelTransaction(draftId, { cancelledBy: approver.approvedBy });
      if (!cancelled.committed) {
        if (tgConfig.token && callbackQueryId) {
          await answerCallbackQuery({ token: tgConfig.token, callbackQueryId, text: 'Không thể huỷ ở trạng thái này (' + (cancelled.currentStatus || 'unknown') + ').' });
        }
        return sendSuccess(res, { handled: true, draftId, action, skipped: true, currentStatus: cancelled.currentStatus });
      }
      if (tgConfig.token && callbackQueryId) {
        await answerCallbackQuery({ token: tgConfig.token, callbackQueryId, text: '🚫 Đã huỷ bài đăng.' });
      }
      return sendSuccess(res, { handled: true, draftId, action });
    }

    // Callback action không nhận dạng được
    return sendSuccess(res, { handled: false, draftId, action });
  }

  return null;
}

module.exports = { handle, checkApprover };
