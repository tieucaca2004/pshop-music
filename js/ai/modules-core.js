/*
 * shared/aiModulesCore.js — Sprint 15 Phase 2 (AI Architecture
 * Consolidation, Option B — approved by Founder). PURE, environment-
 * agnostic content for the 9 AI modules: shared helpers +
 * targetCollection/buildPrompt/mapToDraftContent (+ IMAGE_TYPE_DIRECTION/
 * STYLE_DIRECTION for image-generator). Contains NO `require()`, NO
 * `DataProvider`, NO `listResource` — nothing environment-specific, so the
 * exact same file content works loaded via <script> in the browser
 * (attaches to `window.AiModulesCore`) or via `require()` in Node
 * (`module.exports`).
 *
 * This file is deliberately BYTE-IDENTICAL to `js/ai/modules-core.js`. The
 * two physical copies exist because this project has no build/bundle step
 * (Firebase only deploys `functions/`, Netlify serves everything else as
 * static files) and introducing one would itself be an architectural change
 * — out of scope for this Phase ("no architectural redesign"). Keeping two
 * files in sync BY HAND is exactly the risk Sprint 14 Tech Debt #1 called
 * out ("mỗi lần đổi prompt phải sửa đúng ở cả 2 nơi, không có gì đảm bảo
 * đồng bộ") — `test_sprint15_phase2_local.js` enforces byte-identity
 * between the two copies as a regression test, so any future edit to one
 * without mirroring to the other fails tests immediately, instead of
 * silently drifting.
 *
 * `loadContext()` is deliberately NOT here — it's the one genuinely
 * environment-specific piece (client: `DataProvider`, server:
 * `shared/listResource.js`) and stays in each environment's own adapter
 * (`functions/shared/aiModules.js` server-side, each `js/ai/modules/*.js`
 * file client-side).
 *
 * Content below is a verbatim extraction of what was previously duplicated,
 * by hand, between `functions/shared/aiModules.js` (Sprint 14 Phase 5) and
 * the 9 `js/ai/modules/*.js` files (Sprint 2-13) — confirmed identical
 * module-by-module before this extraction (see AI_CONSOLIDATION_REPORT.md).
 * No prompt wording, no parsing logic, no field mapping was changed.
 */
(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    global.AiModulesCore = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function stripCodeFence(str) {
    return String(str || '')
      .replace(/^\s*```[a-zA-Z]*\s*\n?/, '')
      .replace(/\n?\s*```\s*$/, '')
      .trim();
  }

  // ── Facebook copy sanitizer (CHỈ dùng cho nội dung bài đăng Facebook) ─────
  // Prompt đã cấm Markdown, nhưng model vẫn có thể trả về **, #, -, code fence…;
  // lớp này bảo đảm đầu ra cuối là văn bản thuần và bỏ câu mở đầu sáo rỗng.
  // KHÔNG dùng cho Telegram preview/log/tài liệu.
  // Lưu ý: KHÔNG dùng \b sau cụm tiếng Việt — "để"/"kiếm"… có ký tự Unicode không phải \w,
  // khiến \b không khớp. Dùng lookahead khoảng trắng/dấu câu thay thế.
  const FACEBOOK_CLICHE_PREFIX = /^(bạn đang tìm kiếm|bạn đang tìm|bạn đang cần|bạn muốn|nếu bạn đang|hãy để|đừng bỏ lỡ|đỉnh cao|một lựa chọn hoàn hảo|sự lựa chọn hoàn hảo|sự kết hợp hoàn hảo|giải pháp hoàn hảo|nâng tầm|chinh phục|khám phá ngay|trong thế giới|khi nhắc đến|không chỉ là|đã bao giờ bạn|liệu bạn)(?=\s|$|[,.!?…:;])/i;

  function splitSentencesForCleanup(block) {
    const out = [];
    for (const line of String(block == null ? '' : block).split(/\n+/)) {
      // Bảo vệ dấu chấm trong số (1.800.000đ, 3.5tr) khỏi bị coi là dấu hết câu.
      const safe = line.replace(/(\d)\.(\d)/g, '$1\uE000$2');
      const re = /[^.!?…]+[.!?…]?/g;
      let m; let found = false;
      while ((m = re.exec(safe))) {
        const t = String(m[0] || '').trim().replace(/\uE000/g, '.');
        if (t) { out.push(t); found = true; }
      }
      if (!found && line.trim()) out.push(line.trim());
    }
    return out;
  }

  // Câu chứa claim kỹ thuật/thiết kế/uy tín KHÔNG có trong dữ kiện (name/specs) bị bỏ.
  // Nếu chính dữ kiện có cụm đó thì giữ (vd sản phẩm ghi rõ "chống rung").
  const UNSUPPORTED_CLAIM = /(thiết kế|sự ổn định|độ ổn định|ổn định|chống rung|giảm rung|cách âm|chất âm|âm thanh\s+(?:rõ ràng|chính xác|hay hơn|tốt hơn)|chính xác hơn|rõ ràng hơn|độ bền|bền bỉ|chịu lực|tải trọng|chất liệu|kim loại|nhôm|thép|cao cấp|chất lượng|hiệu suất|hiệu quả|sang trọng|đẳng cấp|hoàn hảo|tốt nhất|số 1|tuyệt vời|tối ưu|mạnh mẽ|nghe rõ|rõ nét|sống động|tiện lợi|hữu ích|nổi bật|thăng bằng|đang có|còn hàng|chiều cao|cân bằng âm thanh|hàng đầu|trải nghiệm âm thanh|kích thước|nghệ sĩ|nhạc sĩ|nhà sản xuất|kỹ sư|người mới|ca sĩ|streamer|nhiều thể loại|thể loại|mọi không gian|không gian (?:biểu diễn|nghe nhạc|làm việc)|tại nhà|ở nhà|trong nhà|gia đình|sân khấu|buổi biểu diễn|biểu diễn|phòng thu|home studio|quán bar|câu lạc bộ|\bclub\b|karaoke|mọi thể loại|mọi phong cách|kiểm soát âm thanh|âm lượng tối đa|nghe nhạc với âm lượng|nghe ở mức|hài lòng|đắc lực|đáng sở hữu|không thể bỏ qua|lựa chọn hoàn hảo|giải pháp lý tưởng|tương thích với|dùng được với|tín đồ|chuyên nghiệp|giao diện|tính năng|đáp ứng nhu cầu|ấn tượng|điều thú vị|cần thiết|chắc chắn|vững chắc|vững vàng|đáng tin cậy|đảm bảo|điều chỉnh|độ cao|góc nghiêng|tùy chỉnh|không thể thiếu|lý tưởng|giải pháp|tuyệt vời|lựa chọn thiết thực|sự lựa chọn thiết thực|lựa chọn lý tưởng|sự lựa chọn lý tưởng|trợ thủ đắc lực|phù hợp cho mọi|phù hợp cho cả|phù hợp với mọi|mọi tình huống|mọi trường hợp|mọi buổi|mọi nhu cầu|phù hợp với (?:nhiều|hầu hết|các)|phù hợp cho (?:nhiều|hầu hết|các)|phù hợp cho những ai|lựa chọn thích hợp|sự lựa chọn thích hợp|mọi bộ dàn|mọi thiết bị|mọi loại|tối ưu hóa trải nghiệm|tối ưu trải nghiệm)/i;

  // Câu CTA hợp lệ ("Liên hệ/tư vấn/ghé…") không bị coi là claim chỉ vì có chữ "tính năng"/"tình trạng".
  const CTA_TEXT = /(liên hệ|tư vấn|ghé|hỏi thêm|inbox|nhắn tin|đến Pshop|ghé Pshop)/i;

  // THÔNG SỐ SỐ HỌC (công suất, tần số, kích thước, trọng lượng…): mọi "số + đơn vị" Writer nêu PHẢI có trong dữ kiện nguồn
  // (so khớp sau khi chuẩn hoá: 203 Watts = 203W, 8" = 8 inch, 5,12KΩ = 5.12kohm). Không có ⇒ coi là thông số tự bịa.
  const SPEC_NUM = /(\d+(?:[.,]\d+)?)\s*(watts?|w|khz|hz|mhz|ghz|db|inch(?:es)?|"|”|″|mm|cm|kg|lbs?|gb|tb|mb|kω|ω|kohms?|ohms?|bit)(?![\p{L}\p{N}])/giu;
  function specTokens(text) {
    const out = new Set();
    const t = String(text == null ? '' : text).toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
    let m; const re = new RegExp(SPEC_NUM.source, 'giu');
    while ((m = re.exec(t))) {
      let u = m[2];
      if (/^watts?$/.test(u)) u = 'w'; else if (/^(inch(?:es)?|"|”|″)$/.test(u)) u = 'inch'; else if (/^lbs?$/.test(u)) u = 'lb'; else if (u === 'ω' || u === 'ohms') u = 'ohm'; else if (u === 'kω' || u === 'kohms') u = 'kohm';
      out.add(String(parseFloat(m[1].replace(',', '.'))) + u);
    }
    return out;
  }
  // Từ làm tròn/ước chừng đứng trước thông số ("gần 8 inch", "khoảng 200W", "hơn 10kg") biến số chính xác của nguồn thành số ước lượng
  // do Writer tự thêm ⇒ chỉ cho phép khi chính nguồn dùng từ đó.
  const APPROX_SPEC = /(?:^|[\s,(])(gần|khoảng|xấp xỉ|hơn|trên|dưới|lên tới|lên đến|ít nhất|tầm|cỡ)\s+\d+(?:[.,]\d+)?\s*(?:watts?|w|khz|hz|mhz|ghz|db|inch(?:es)?|"|”|″|mm|cm|kg|lbs?|gb|tb|mb|kω|ω|kohm|ohm|bit)(?![\p{L}\p{N}])/iu;
  function unsupportedSpecNumberIn(sentence, allowedText) {
    const ap = APPROX_SPEC.exec(String(sentence == null ? '' : sentence));
    if (ap && String(allowedText || '').toLowerCase().indexOf(ap[1].toLowerCase()) < 0) return ap[0].trim();
    const mine = specTokens(sentence);
    if (!mine.size) return null;
    const ok = specTokens(allowedText);
    for (const tok of mine) if (!ok.has(tok)) return tok;
    return null;
  }

  function unsupportedClaimIn(sentence, allowedText) {
    const re = new RegExp(UNSUPPORTED_CLAIM.source, 'gi');
    let m;
    while ((m = re.exec(sentence))) {
      const claim = String(m[0] || '').toLowerCase();
      const allowed = allowedText.indexOf(claim) >= 0 ||
        // "tương thích với" và "tương thích hoàn toàn với" là cùng một dữ kiện.
        (claim.indexOf('tương thích') >= 0 && allowedText.indexOf('tương thích') >= 0);
      if (!allowed) return m[0];
    }
    return unsupportedSpecNumberIn(sentence, allowedText);
  }

  // Chỉ bỏ các modifier khen chung (không phải danh từ/tính năng) để giữ dữ kiện trong cùng câu.
  const SAFE_CLAIM_ADJ = /(?:ổn định|chắc chắn|vững chắc|vững vàng|bền bỉ|hoàn hảo|tuyệt vời|cao cấp|chuyên nghiệp|hiệu quả|tiện lợi|dễ dàng|linh hoạt|chính xác|rõ ràng|ấn tượng|đáng tin cậy|cần thiết)/gi;
  const SOURCE_STOP = new Set(['sản', 'phẩm', 'của', 'cho', 'với', 'và', 'một', 'những', 'các', 'là', 'có', 'được', 'khi', 'trong', 'trên', 'dưới', 'này', 'đó', 'thì', 'rất', 'hơn', 'như', 'để', 'từ', 'đến', 'theo', 'về', 'tại', 'cũng', 'nhưng', 'hoặc', 'nếu', 'vì', 'do', 'bởi', 'mới', 'cũ']);
  function hasSourceToken(text, allowedText) {
    const allow = String(allowedText || '').toLowerCase();
    return String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)
      .filter(t => t.length >= 3 && !SOURCE_STOP.has(t))
      .some(t => allow.includes(t));
  }

  // Câu trộn claim + dữ kiện: chỉ bỏ modifier/claim hẹp, giữ phần dữ kiện; nếu còn claim hoặc câu cụt thì bỏ câu.
  function ensureSentenceEnd(s) {
    const t = String(s || '').replace(/[,;:\s]+$/, '').trim();
    return !t || /[.!?…]$/.test(t) ? t : t + '.';
  }

  // Cụm địa điểm/môi trường/tình huống sử dụng; chỉ bỏ khi cụm đó KHÔNG có trong dữ kiện nguồn.
  const VENUE_TERM = '(?:không gian (?:biểu diễn|nghe nhạc|làm việc)|(?:các |những )?buổi biểu diễn|biểu diễn|sân khấu|phòng thu|home studio|quán bar|câu lạc bộ|club|karaoke|tại nhà|ở nhà|trong nhà|gia đình)';
  const VENUE_LEAD = '(?:trong|tại|ở|cho|khi|như|hoặc|hay|và|trên|vào|ngay)';
  function stripUnsupportedVenue(sentence, allow) {
    const re = new RegExp('(?:\\s*,)?(?:\\s+' + VENUE_LEAD + ')*\\s+(?:(?:các|những|một)\\s+)?' + VENUE_TERM, 'gi');
    const MARK = '\u0000';
    const marked = String(sentence || '').replace(re, (m) => {
      const term = m.toLowerCase().replace(new RegExp('^[\\s,]*(?:' + VENUE_LEAD + '\\s+)*'), '').replace(/^(?:các|những)\s+/, '').trim();
      return allow.includes(term) ? m : MARK;
    });
    if (marked.indexOf(MARK) < 0) return String(sentence || '');
    // Cụm địa điểm không nguồn nằm GIỮA câu (sau nó còn từ khác, vd "…ngay tại nhà bạn!"): bỏ cụm sẽ để câu sai ngữ pháp → bỏ cả câu.
    // Chỉ cắt được khi cụm nằm ở CUỐI câu (sau nó chỉ còn dấu câu kết thúc).
    if (!/^[^\u0000]*(?:\u0000(?:\s*\u0000)*)\s*[.!?…]*\s*$/.test(marked)) return null;
    return marked.replace(/\u0000/g, '').replace(/\s+([,.!?…])/g, '$1');
  }

  function stripAdjClauses(sentence) {
    const out = [];
    for (const part of String(sentence).split(/,\s*/)) {
      const orig = part.trim();
      const cleaned = orig.replace(SAFE_CLAIM_ADJ, ' ').replace(/(^|\s)(?:rất|khá|cực kỳ|vô cùng|hết sức|quá)(?=\s+(?:cho|với|để|và|của|trong|khi)(?:\s|$)|\s*$)/gi, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned === orig) { out.push(orig); continue; }
      const words = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
      if (words.length < 3 || /^(?:cho|với|để|của|và|nhưng|thì|khi|trong)(?:\s|$)/i.test(cleaned)) continue;
      out.push(cleaned);
    }
    return out.join(', ');
  }
  function repairUnsupportedSentence(sentence, allow) {
    let s = String(sentence || '');
    // "tùy chỉnh" là biến thể của "tinh chỉnh" có trong catalogue → dùng đúng từ nguồn.
    if (allow.includes('tinh chỉnh')) s = s.replace(/tùy chỉnh/gi, 'tinh chỉnh');
    // So sánh hơn không có nguồn: nếu nguồn có tính từ gốc thì bỏ "hơn", giữ tính từ đã xác minh.
    if (allow.includes('chính xác')) s = s.replace(/chính xác\s+hơn/gi, 'chính xác');
    if (allow.includes('rõ ràng')) s = s.replace(/rõ ràng\s+hơn/gi, 'rõ ràng');
    s = s.replace(/\b(?:chính xác|rõ ràng)\s+hơn\b/gi, ' ');
    // "Tối ưu không gian..." / "cho âm thanh chính xác và chặt chẽ" — sửa theo dữ kiện nguồn.
    s = s.replace(/(^|[.!?…]\s+)Tối ưu không gian (.*?) với /gi, '$1Dành cho không gian $2 với ');
    s = s.replace(/\btối ưu không gian\b/gi, 'bố trí không gian');
    s = s.replace(/cho âm thanh chính xác và chặt chẽ/gi, 'cho âm bass chặt và chính xác');
    // Địa điểm/môi trường/tình huống KHÔNG có trong nguồn: bỏ riêng cụm đó, giữ công dụng chung còn lại.
    const strippedVenue = stripUnsupportedVenue(s, allow);
    if (strippedVenue === null) return null;
    if (strippedVenue !== s) {
      s = strippedVenue;
      if (!unsupportedClaimIn(s, allow)) {
        // Phần còn lại sau khi bỏ cụm địa điểm phải còn là câu có nghĩa và có dữ kiện nguồn; không thì bỏ cả câu.
        const w = s.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
        if (w.length < 3 || isFragmentSentence(s) || !hasSourceToken(s, allow) || /(?:^|\s)(?:và|hoặc|hay|cho|với|để|của|các|những|một|như|tại|ở|trong|ngay|trên|vào)\s*[.!?…]?$/i.test(s)) return null;
        return ensureSentenceEnd(s);
      }
    }
    // Sau khi chuẩn hoá theo nguồn mà không còn claim thì giữ nguyên câu.
    if (!unsupportedClaimIn(s, allow)) return ensureSentenceEnd(s);
    // "là giải pháp hoàn hảo để" → "giúp" (giữ công dụng, bỏ claim).
    s = s.replace(/(^|\s)là\s+giải pháp(?:\s+hoàn hảo)?\s+để(?=\s|$)/gi, '$1giúp');
    // "được thiết kế để" → "giúp" (giữ đúng công dụng, không để lại "được để").
    s = s.replace(/(^|\s)được\s+thiết kế\s+để(?=\s|$)/gi, '$1giúp');
    s = s.replace(/(^|\s)được\s+thiết kế\s+cho(?=\s|$)/gi, '$1dùng cho');
    s = s.replace(/\bmột cách\s+(?:ổn định|chắc chắn|vững chắc|vững vàng|bền bỉ|hoàn hảo|tuyệt vời|cao cấp|chuyên nghiệp|hiệu quả|tiện lợi|dễ dàng|linh hoạt|chính xác|rõ ràng|cần thiết)\b/gi, ' ');
    s = stripAdjClauses(s);
    if (!s) return null;
    s = s.replace(/\bthiết kế\s+(?=để|giúp|cho|với|vỏ|kim loại|nhôm|thép|nhựa|cao su|da|gỗ)/gi, ' ');
    s = s.replace(/\s+/g, ' ').replace(/\s+([,.!?…])/g, '$1').replace(/,\s*([.!?…])/g, '$1').replace(/([,.!?…])\1+/g, '$1').replace(/^[,\s]+/, '').trim();
    // Nếu vẫn còn claim ở một mệnh đề, bỏ mệnh đề đó và giữ mệnh đề có dữ kiện nguồn.
    if (unsupportedClaimIn(s, allow)) {
      const pieces = s.split(/,\s*/).map(piece => piece.trim()).filter(Boolean);
      // Mệnh đề ĐẦU (mang chủ ngữ) chứa claim không nguồn: các mệnh đề sau chỉ còn là phần phụ không chủ ngữ → bỏ cả câu.
      if (pieces.length > 1 && unsupportedClaimIn(pieces[0], allow)) return null;
      const kept = pieces.filter(piece =>
        !unsupportedClaimIn(piece, allow) &&
        hasSourceToken(piece, allow) &&
        piece.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).length >= 3 &&
        !/^(và|cho|với|thì|nhưng)\b/i.test(piece)
      );
      // Chỉ chấp nhận khi bỏ được phần ĐUÔI mà các mệnh đề giữ lại vẫn là phần đầu nguyên vẹn của câu và đủ dài để là một câu
      // hoàn chỉnh (>= 5 từ). Nếu không (mất mệnh đề giữa/đầu, hoặc chỉ còn mẩu 2-4 từ như "Thiết kế nhẹ.") → bỏ cả câu.
      const prefixOnly = kept.length > 0 && kept.every((k, i) => k === pieces[i]);
      const keptWords = kept.join(' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).length;
      if (!prefixOnly || keptWords < 5) return null;
      s = kept.join(', ');
    }
    if (!s || unsupportedClaimIn(s, allow)) return null;
    if (/\bmột cách\b/i.test(s)) return null;
    if (/\blà\s+(?:cho|với|để|những|một|các)\b/i.test(s)) return null;
    // Bỏ modifier trong cụm "sự chắc chắn và tiện lợi" có thể để lại "sự và…" — bỏ câu.
    if (/(?:^|\s)sự\s+(?:và|cho|với|của|để)(?=\s|[.!?…]|$)/i.test(s) || /(?:^|\s)sự\s*[.!?…]?$/i.test(s)) return null;
    const words = s.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    if (words.length < 2) return null;
    if (/(\b(?:là|cho|của|với|và|một|những|các|để))\s*[.!?…]?$/i.test(s)) return null;
    if (!hasSourceToken(s, allow)) return null;
    if (isFragmentSentence(s)) return null;
    return ensureSentenceEnd(s);
  }

  // Câu bắt đầu bằng động từ không có chủ ngữ (thường do cắt claim) — bỏ để không trả câu cụt.
  const FRAGMENT_START = /^(giúp|hỗ trợ|tạo|đảm bảo|phù hợp|cho phép|mở ra)(?=\s|$)/i;
  function isFragmentSentence(sentence) {
    const t = String(sentence || '').trim();
    if (FRAGMENT_START.test(t)) return true;
    // Cụm trạng ngữ đứng riêng không có mệnh đề chính, vd "Trong một buổi thu âm."
    if (/^(trong|với|khi|để|từ|tại|nhờ|qua|bằng)(?=\s|$)/i.test(t) && !t.includes(',')) return true;
    return false;
  }
  // Nhận xét "tính cách âm thanh/trải nghiệm" (vocal ấm, bass sâu, độ chi tiết...): trong luồng Telegram có nguồn chỉ được nói khi
  // CHÍNH cụm đó có trong dữ kiện nguồn; mọi diễn đạt khác là nhận xét tự thêm → loại cả câu.
  const SOUND_CHARACTER_CLAIM = /(?:vocal|giọng hát|dải trung|dải cao|bass|âm trầm|âm bass)\s+(?:ấm|trong|rõ|chi tiết|mượt|dày|nổi|sâu|mạnh|uy lực|căng|chắc|cân bằng|tự nhiên)|độ chi tiết|độ ấm|độ thoải mái|đeo (?:êm|thoải mái)|âm thanh (?:ấm|trong|sâu|dày|đầy đặn|phong phú)|chi tiết âm thanh/giu;
  function stripUnsupportedClaims(text, allowedText, opts) {
    const noRepair = !!(opts && opts.noRepair);
    const allow = String(allowedText || '').toLowerCase();
    return String(text == null ? '' : text).split(/\n{2,}/)
      .map(block => splitSentencesForCleanup(block).map(sentence => {
        if (CTA_TEXT.test(sentence)) return sentence;
        if (isFragmentSentence(sentence)) return null;
        if (noRepair) {
          const sc = sentence.match(SOUND_CHARACTER_CLAIM);
          if (sc && sc.some(m => allow.indexOf(m.toLowerCase()) < 0)) return null;
        }
        if (!unsupportedClaimIn(sentence, allow)) return sentence;
        // noRepair (luồng Telegram có nguồn): KHÔNG viết lại câu bằng regex — viết lại có thể đổi nghĩa hoặc ghép sai từ
        // ("được thiết kế để" → "giúp"). Câu có claim không nguồn bị loại cả câu.
        if (noRepair) return null;
        // (xem SOUND_CHARACTER_CLAIM bên dưới: kiểm riêng cho noRepair ở nhánh trước)
        return repairUnsupportedSentence(sentence, allow);
      }).filter(Boolean).join(' ').trim())
      .filter(Boolean).join('\n\n');
  }

  // Giá/tình trạng/bảo hành/khuyến mãi do AI tự nói có thể sai hoặc trùng với factsBlock do hệ thống chèn.
  // Telegram dùng stripFactClaims() trước khi ghép facts; "Giá đỡ micro" không bị coi là giá bán.
  const FACT_CLAIM = /(?:^|[\s(])giá\s*(?:bán|:|=|là|chỉ|sẽ|từ|khoảng)?\s*\d|tình trạng|mới\s*100%|like\s*new|\bnew\b|\bused\b|\d{1,3}(?:[.,]\d{3})+\s*(?:đ|vnd)?|\d+(?:[.,]\d+)?\s*(?:tr|triệu|k|nghìn)(?![\p{L}\p{N}])|hàng\s*cũ|đã\s*qua\s*sử\s*dụng|bảo\s*hành|khuyến\s*mãi|giảm\s*giá|trả\s*góp|chính\s*hãng|nhập\s*khẩu|xuất\s*xứ|nguyên\s*seal|full\s*box/iu;
  function stripFactClaims(text, opts) {
    const dropSentence = !!(opts && opts.dropSentence);
    return String(text == null ? '' : text).split(/\n{2,}/)
      .map(block => splitSentencesForCleanup(block).map(sentence => {
        // CTA không nêu con số cụ thể vẫn hữu ích (vd "tư vấn về tình trạng sản phẩm") — giữ.
        if (CTA_TEXT.test(sentence) && !/\d/.test(sentence)) return sentence;
        if (!FACT_CLAIM.test(sentence)) return sentence;
        // dropSentence: không cắt mệnh đề rồi ghép lại (dễ tạo câu cụt/sai nghĩa) — câu nói giá/tình trạng/bảo hành bị bỏ cả câu.
        if (dropSentence) return null;
        // Giá/tình trạng/bảo hành nằm chung câu với thông số: chỉ bỏ clause fact, giữ clause kỹ thuật.
        const clauses = sentence.split(/,\s*|\s+và\s+/i).map(s => s.trim()).filter(Boolean);
        const kept = clauses.filter(clause =>
          !FACT_CLAIM.test(clause) &&
          clause.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).length >= 2
        );
        if (!kept.length) return null;
        const out = kept.join(', ').replace(/^[,;]\s*/, '').trim();
        // Đã bỏ clause fact mà phần còn lại là mệnh đề không chủ ngữ ("giúp…", "với…"): không đủ dữ kiện để thành câu → bỏ cả câu.
        if (kept.length < clauses.length && isFragmentSentence(out)) return null;
        return out || null;
      }).filter(Boolean).join(' ').trim())
      .filter(Boolean).join('\n\n');
  }

  // Facts chuẩn cho bài CMS (Telegram có factsBlock riêng trong contentOrchestrator).
  function productFactsBlock(p) {
    const out = [];
    if (p && p.price != null && String(p.price).trim() !== '') out.push('Giá: ' + String(p.price).trim());
    const condRaw = p && (p.condition || p.status);
    if (condRaw != null && String(condRaw).trim() !== '') {
      const c = String(condRaw).trim();
      out.push('Tình trạng: ' + (/^new$/i.test(c) ? 'Mới' : (/^used$/i.test(c) ? 'Đã qua sử dụng' : c)));
    }
    const badge = String((p && p.badgeText) || '');
    const m = badge.match(/(?:BH|bảo hành)\s*(\d{1,2})\s*(năm|tháng|th)?/i);
    const genuine = /chính hãng/i.test(badge) ? 'Chính hãng' : '';
    const unit = m && m[2] ? (/^th$/i.test(m[2]) ? 'tháng' : m[2].toLowerCase()) : 'tháng';
    const warranty = m ? 'Bảo hành ' + m[1] + ' ' + unit : '';
    if (genuine || warranty) out.push([genuine, warranty].filter(Boolean).join(' · '));
    return out.join('\n');
  }

  // Bảo đảm tên sản phẩm xuất hiện trong bài; nếu model gọi "sản phẩm này/giá đỡ này" thì chèn tên ở đầu.
  // Chấp nhận cả phần lõi trước dấu "–" (vd "KRK ROKIT 8 G4" của tên đầy đủ "… – LOA KIỂM ÂM 1 CÁI")
  // để không tạo thêm một dòng tiêu đề trùng lặp.
  function productNameCore(name) { return String(name == null ? '' : name).split(/\s+[–—-]\s+/)[0].trim(); }
  const TYPE_PREFIX = /^(?:loa(?:\s+kiểm\s+âm|\s+sub|\s+bluetooth)?|tai\s+nghe|chân\s+loa|giá\s+đỡ(?:\s+micro)?|bàn\s+mixer|mixer|controller|đầu\s+đĩa|ampli|amply|micro(?:phone)?|soundcard|sound\s+card)\s+/i;
  function nameWithoutTypePrefix(name) { return String(name == null ? '' : name).trim().replace(TYPE_PREFIX, '').trim(); }
  function ensureProductName(text, name) {
    const t = String(text == null ? '' : text).trim();
    const n = String(name == null ? '' : name).trim();
    if (!n) return t;
    const core = productNameCore(n);
    const lower = t.toLowerCase();
    if (lower.includes(n.toLowerCase()) || (core && lower.includes(core.toLowerCase()))) return t;
    const bare = nameWithoutTypePrefix(core);
    if (bare.length >= 6 && lower.includes(bare.toLowerCase())) return t; // hook đã nêu tên (bỏ tiền tố loại) ⇒ không chèn thêm dòng tên
    return (n + (t ? '\n\n' + t : '')).trim();
  }

  // Nếu model lặp nguyên tên sản phẩm ở đoạn thứ hai, đổi đoạn sau thành "Sản phẩm …" để bài không lặp tên.
  function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function productMentionAlias(name) {
    const core = productNameCore(name);
    const trimmed = core.replace(/(?:\s+\d+){2,}$/, '').trim();
    return trimmed.length >= 8 ? trimmed : core;
  }
  // Giữ lần xuất hiện đầu, các lần sau đổi thành "mẫu này" để không lặp tên.
  function dedupeProductMentions(text, name) {
    const alias = productMentionAlias(name);
    if (!alias) return String(text == null ? '' : text);
    const full = String(name || '').trim();
    const bare = nameWithoutTypePrefix(alias);
    const alts = [full, alias, bare.length >= 6 ? bare : ''].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).sort((x, y) => y.length - x.length);
    const pattern = new RegExp(alts.map(escapeRegExp).join('|'), 'gi');
    let seen = false;
    // Lần sau đứng ngay sau danh từ/tính từ mô tả ("USB drive cao cấp <TÊN>, chuẩn…") là đồng vị của danh từ đó:
    // đổi thành "mẫu này" sẽ thành "USB drive cao cấp mẫu này" (sai ngữ pháp) ⇒ bỏ hẳn tên, giữ cụm danh từ đứng trước.
    const FUNC_BEFORE = /^(?:của|với|là|cho|từ|bởi|như|và|hoặc|hay|giữa|tại|ở|trong|khi|nên|thì|đây|này|để|cùng|theo|trên|dưới|qua|bằng|về|đến|tới|sau|trước|nếu|vì|do|rằng|mà|nhờ|cả|các|những|một|mẫu|sản|phẩm|chiếc|bộ|dòng)$/i;
    const src = String(text == null ? '' : text);
    let removed = false;
    const out = src.replace(pattern, (m, offset) => {
      if (!seen) { seen = true; return m; }
      const prev = src.slice(0, offset).match(/([\p{L}\p{N}]+)[ \t]+$/u);
      if (prev && !FUNC_BEFORE.test(prev[1]) && !/(?:^|[.!?…\n])\s*$/.test(src.slice(0, offset - prev[0].length))) { removed = true; return ''; }
      return 'mẫu này';
    }).replace(/[ \t]{2,}/g, ' ');
    return removed ? out.replace(/([\p{L}\p{N}]) ([,;.!?…])/gu, '$1$2') : out;
  }

  function dedupeProductNameStarts(text, name) {
    const t = String(text == null ? '' : text);
    const n = String(name == null ? '' : name).trim();
    if (!n) return t;
    const core = productNameCore(n);
    let seen = false;
    return t.split(/\n{2,}/).map(paragraph => {
      const lower = paragraph.toLowerCase();
      const startsFull = lower.startsWith(n.toLowerCase());
      const startsCore = !!core && lower.startsWith(core.toLowerCase());
      if ((startsFull || startsCore) && seen) {
        const len = startsFull ? n.length : core.length;
        const rest = paragraph.slice(len).replace(/^[:\s,–—-]+/, '').trim();
        // Phần còn lại chỉ gồm lại tên sản phẩm (kể cả dạng bỏ tiền tố loại) → đoạn lặp vô nghĩa, bỏ.
        const nameForms = [n, core, nameWithoutTypePrefix(n)].filter(x => x && x.length >= 3).sort((x, y) => y.length - x.length);
        let restNoName = rest.toLowerCase();
        for (const f of nameForms) restNoName = restNoName.split(f.toLowerCase()).join(' ');
        return /[\p{L}\p{N}]/u.test(restNoName) ? 'Sản phẩm ' + rest : ''; // đoạn chỉ còn tên lặp → bỏ, không để lại "Sản phẩm." cụt
      }
      if (startsFull || startsCore) seen = true;
      return paragraph;
    }).filter(Boolean).join('\n\n');
  }

  // Dọn tàn dư khi bỏ claim: "Với, …" / "cùng …" đầu câu, và viết hoa đầu câu.
  function polishFacebookText(text) {
    let s = String(text == null ? '' : text);
    s = s.replace(/^\s*Đặc biệt,\s*/i, '');
    s = s.replace(/(^|[.!?…]\s+|\n\n)\s*(và|với|cho|nhưng|thì|cùng)\s*[,:]\s*/gi, '$1');
    s = s.replace(/(^|[.!?…]\s+|\n\n)([a-zà-ỹ])/g, (m, prefix, ch) => prefix + ch.toUpperCase());
    // Các câu cụt/khẩu ngữ đã gặp trong output thật — sửa tối thiểu, không thêm dữ kiện mới.
    s = s.replace(/\bKim loại và nắp trượt\b/g, 'Vỏ kim loại và nắp trượt');
    s = s.replace(/(^|\s)không lo hết chỗ(?=\s|[,.!?…]|$)/gi, '$1đủ chỗ cho nhu cầu lưu trữ');
    s = s.replace(/\bmang đến âm bass\./gi, 'mang đến âm bass chặt và chính xác.');
    s = s.replace(/\s+với thiết kế\.\s*$/gi, '.');
    s = s.replace(/\s+cực kỳ tiện lợi/gi, '');
    s = s.replace(/\s+an toàn và hiệu quả/gi, ' bảo mật');
    s = s.replace(/\s+giúp sản phẩm luôn\.\s*$/gi, '.');
    s = s.replace(/\s+giúp tái tạo âm thanh\./gi, ' cho âm thanh trung thực.');
    s = s.replace(/,\s*cho DJ\.\s*$/gi, '.');
    s = s.replace(/\bvà\s+hơn\b/gi, 'hơn');
    // Mệnh đề "Khi …" đứng riêng thành câu cụt — nối với câu sau.
    s = s.replace(/(^|[.!?…]\s+)(Khi [^.!?…]{3,100})\.\s+(Tốc độ|Dung lượng|Sản phẩm|USB|Với)(?=\s|$)/g,
      (m, prefix, clause, next) => prefix + clause + ', ' + (next === 'USB' ? next : next.charAt(0).toLowerCase() + next.slice(1)));
    return s.replace(/\s+([,.!?…])/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
  }

  function sourceDescriptionFallback(p, allowedText) {
    const desc = String((p && p.description) || '').trim();
    if (!desc) return '';
    return sanitizeFacebookText(splitSentencesForCleanup(desc).slice(0, 2).join(' '), allowedText);
  }

  const CTA_SENTENCE = /(liên hệ|ghé|đến|nhắn tin|inbox|gọi)\s+(?:với\s+)?(?:Pshop Music|Pshop)|Pshop Music\s+để/i;
  function stripCtaSentences(text) {
    return String(text == null ? '' : text).split(/\n{2,}/).map(block =>
      splitSentencesForCleanup(block).filter(sentence => !CTA_SENTENCE.test(sentence)).join(' ').trim()
    ).filter(Boolean).join('\n\n');
  }

  // Final plain-text guard. Protect single-# hashtags before removing Markdown.
  function toPlainFacebookText(text) {
    const tags = [];
    let s = String(text == null ? '' : text)
      .replace(/\r\n?/g, '\n')
      .replace(/(^|\s)(#[\p{L}\p{N}_]+)/gu, (m, pre, tag) => {
        tags.push(tag);
        return pre + '\u0001PSHTAG' + (tags.length - 1) + '\u0001';
      })
      .replace(/```[a-zA-Z0-9_-]*\s*/g, '')
      .replace(/```/g, '')
      .replace(/^\s{0,3}#{2,6}\s*/gm, '')
      .replace(/^\s{0,3}#\s+/gm, '')
      .replace(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      .replace(/__([^_\n]+)__/g, '$1')
      .replace(/~~([^~\n]+)~~/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/\*\*/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    s = s.replace(/\u0001PSHTAG(\d+)\u0001/g, (m, i) => tags[Number(i)] || '');
    return s;
  }

  function sanitizeFacebookText(text, allowedText, opts) {
    let s = String(text == null ? '' : text)
      .replace(/\r\n?/g, '\n')
      .replace(/```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)```/g, '$1')
      .replace(/<[^>\n]{1,200}>/g, '')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s{0,3}(?:[-*+•–—]|\d{1,2}[.)])\s+/gm, '')
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/gi, '')
      // URL tương đối (category.html?product=...) không được để bộ tách câu biến thành "category. html? ..."
      .replace(/\b[\w./-]+\.(?:html?|php|aspx)(?:\?[^\s]*)?/gi, '')
      .replace(/^(xem thêm tại|tham khảo tại|xem tại|chi tiết tại)\s*[:\-–]?\s*$/gim, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!s) return '';
    s = stripUnsupportedClaims(s, allowedText, opts);
    if (!s) return '';

    // Bỏ MỌI câu sáo rỗng (vd "Bạn đang tìm kiếm…", "Hãy để…", "Đỉnh cao…") — kể cả khi nằm giữa bài.
    // Giữ nguyên các câu có thông tin cụ thể; block rỗng bị loại.
    const blocks = s.split(/\n{2,}/)
      .map(block => splitSentencesForCleanup(block).filter(sentence => !FACEBOOK_CLICHE_PREFIX.test(sentence)).join(' ').trim())
      .filter(Boolean);
    s = blocks.join('\n\n')
      .replace(/^(dưới đây là|bài đăng|bài viết|nội dung bài đăng|phiên bản\s*\d+)\s*[:\-–]?\s*/i, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return toPlainFacebookText(s);
  }

  // Nhận diện tên có NÊU RÕ loại thiết bị hay không. Nếu tên chỉ là thương hiệu + mã model
  // (vd "Pioneer DDJ-400"), model AI không được suy đoán công dụng/tính năng từ kiến thức ngoài.
  const PRODUCT_TYPE_HINT = /(chân\s*loa|loa|tai\s*nghe|headphone|speaker|monitor|mixer|controller|dj\s*system|all[- ]in[- ]one|audio\s*interface|soundcard|ampli|amply|đầu\s*đĩa|turntable|cdj|nắp\s*bảo\s*vệ|túi|dây|cáp|giá\s*đỡ|phụ\s*kiện|micro|\bmic\b|subwoofer|vang|effect|processor|phono|preamp|bàn\s*dj|bluetooth|thu\s*phát|jumpdrive|usb|ổ\s*cứng|thẻ\s*nhớ|đệm|mút|cách\s*âm|đèn|khói|laser|remote|điều\s*khiển)/i;
  function hasProductTypeHint(name) { return PRODUCT_TYPE_HINT.test(String(name || '')); }

  function parseJsonResponse(text) {
    const cleaned = stripCodeFence(text);
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch (e2) { return null; }
      }
      return null;
    }
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function getYoutubeEmbedUrl(url) {
    const str = String(url || '').trim();
    if (!str) return '';
    let id = '';
    let m = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) id = m[1];
    if (!id) { m = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    if (!id) { m = str.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/); if (m) id = m[1]; }
    return id ? `https://www.youtube.com/embed/${id}` : '';
  }

  function productCategoryLabels(p, categories) {
    if (!p) return [];
    const ids = Array.isArray(p.categoryIds) && p.categoryIds.length ? p.categoryIds : (p.category ? [p.category] : []);
    const byCode = {};
    (categories || []).forEach(c => { byCode[c.code] = c; });
    return ids.map(id => byCode[id]).filter(Boolean).map(c => c.label);
  }

  const MODULES = {

    'blog-writer': {
      targetCollection: 'blogPosts',
      buildPrompt(inputParams, context) {
        const p = context.product || {};
        const categoryLabels = productCategoryLabels(p, context.categories);
        const grounding = p.name
          ? `\n\nBài viết này xoay quanh sản phẩm thật sau — chỉ dùng đúng thông tin đã cho, không bịa thêm thông số: Tên: ${p.name}. Thương hiệu: ${p.brand || ''}. Thông số: ${p.specs || ''}.${categoryLabels.length ? ` Thuộc danh mục: ${categoryLabels.join(', ')}.` : ''}`
          : '';
        return `Viết 1 bài blog bằng tiếng Việt, văn phong ${inputParams.tone || 'Chuyên nghiệp'}, chủ đề: "${inputParams.topic}". Từ khóa SEO cần lồng ghép: ${inputParams.keywords || '(không có)'}.${grounding}

Trả về DUY NHẤT 1 đối tượng JSON hợp lệ — không kèm giải thích, không bọc trong khối markdown, đúng các khóa sau:
{
  "title": "Tiêu đề bài viết",
  "intro": "Đoạn mở đầu 2-3 câu, văn bản thuần không HTML",
  "sections": [{"heading": "Tiêu đề mục 1", "paragraph": "Nội dung mục 1, văn bản thuần"}, {"heading": "Tiêu đề mục 2", "paragraph": "..."}, {"heading": "Tiêu đề mục 3", "paragraph": "..."}],
  "conclusion": "Đoạn kết 2-3 câu"
}

TUYỆT ĐỐI KHÔNG tự chèn thẻ <img>/<iframe>, không tự bịa URL ảnh hay link video — hệ thống sẽ tự chèn ảnh/video thật vào đúng vị trí, bạn chỉ cần viết phần văn bản.`;
      },
      mapToDraftContent(providerOutput, inputParams, context) {
        const p = context.product || {};
        const images = (Array.isArray(inputParams.images) && inputParams.images.length)
          ? inputParams.images.slice(0, 5)
          : (Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []));
        const parsed = parseJsonResponse(providerOutput.text);

        if (!parsed) {
          const lines = (providerOutput.text || '').split('\n').filter(Boolean);
          return {
            title: lines[0] || inputParams.topic, slug: '', excerpt: lines[1] || '', coverImage: images[0] || '',
            author: 'Pshop Music', tags: (inputParams.keywords || '').split(',').map(t => t.trim()).filter(Boolean),
            status: 'draft', seoTitle: '', seoDescription: '', contentHtml: lines.slice(2).join('\n'),
            relatedProductId: inputParams.productId || null
          };
        }

        const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
        const htmlParts = [];
        if (images[0]) htmlParts.push(`<img src="${escapeHtml(images[0])}" alt="${escapeHtml(parsed.title || p.name || '')}" class="blog-featured-image">`);
        if (parsed.intro) htmlParts.push(`<p>${escapeHtml(parsed.intro)}</p>`);
        sections.forEach((s, i) => {
          if (s && s.heading) htmlParts.push(`<h2>${escapeHtml(s.heading)}</h2>`);
          if (s && s.paragraph) htmlParts.push(`<p>${escapeHtml(s.paragraph)}</p>`);
          const inlineImg = images[i + 1];
          if (inlineImg) htmlParts.push(`<img src="${escapeHtml(inlineImg)}" alt="${escapeHtml(p.name || '')}" class="blog-inline-image">`);
        });
        const embedUrl = getYoutubeEmbedUrl(p.youtubeUrl);
        if (embedUrl) htmlParts.push(`<div class="blog-video-embed"><iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(p.name || '')}" allowfullscreen loading="lazy"></iframe></div>`);
        if (parsed.conclusion) htmlParts.push(`<p>${escapeHtml(parsed.conclusion)}</p>`);
        if (inputParams.productId && p.name) {
          htmlParts.push(`<p class="blog-related-product">Sản phẩm liên quan: <a href="category.html?product=${encodeURIComponent(inputParams.productId)}">${escapeHtml(p.name)}</a></p>`);
        }

        return {
          title: parsed.title || inputParams.topic, slug: '', excerpt: parsed.intro || '', coverImage: images[0] || '',
          author: 'Pshop Music', tags: (inputParams.keywords || '').split(',').map(t => t.trim()).filter(Boolean),
          status: 'draft', seoTitle: '', seoDescription: '', contentHtml: htmlParts.join('\n'),
          relatedProductId: inputParams.productId || null
        };
      }
    },

    'product-description-writer': {
      targetCollection: 'products',
      buildPrompt(inputParams, context) {
        const p = context.product || {};
        const categories = context.categories || [];
        const categoryList = categories.map(c => `${c.code} (${c.label})`).join(', ') || '(chưa có danh mục nào)';
        const assignedLabels = productCategoryLabels(p, categories);
        const assignedText = assignedLabels.length ? assignedLabels.join(', ') : (p.categoryLabel || p.category || '');
        return `Bạn là chuyên gia content SEO cho cửa hàng thiết bị DJ/âm thanh chuyên nghiệp tại Việt Nam. Dựa ĐÚNG vào thông tin sản phẩm thật dưới đây — KHÔNG bịa thêm thông số/tính năng không có căn cứ — viết đầy đủ nội dung publish-ready, văn phong ${inputParams.tone || 'Chuyên nghiệp'}.

Thông tin sản phẩm thật:
- Tên hiện tại: ${p.name || ''}
- Thương hiệu: ${p.brand || ''}
- Thông số ngắn hiện có: ${p.specs || ''}
- Danh mục đã gán (Founder đã chọn — dùng làm căn cứ ngữ cảnh, không tự đổi): ${assignedText || '(chưa gán danh mục nào)'}
- Danh sách mã danh mục HỢP LỆ (chỉ được chọn đúng 1 mã "code" trong danh sách này, giữ nguyên, không dịch, không bịa mã mới): ${categoryList}

Trả về DUY NHẤT 1 đối tượng JSON hợp lệ — không kèm câu giải thích nào trước/sau, không bọc trong khối markdown \`\`\`, đúng các khóa sau:
{
  "name": "Tên sản phẩm đã tối ưu SEO (giữ đúng model/thương hiệu thật)",
  "shortDescription": "Mô tả ngắn 1-2 câu, văn bản thuần, không HTML",
  "description": "Mô tả chi tiết đầy đủ, dạng HTML dùng <p>/<ul>/<li>, KHÔNG dùng markdown/code fence",
  "specifications": "Thông số kỹ thuật chi tiết dạng HTML <ul><li>...</li></ul>, CHỈ dùng thông tin đã cho ở trên, không bịa số liệu mới",
  "features": ["Tính năng nổi bật 1", "Tính năng nổi bật 2", "Tính năng nổi bật 3"],
  "faq": [{"question": "Câu hỏi thường gặp 1", "answer": "Trả lời ngắn gọn"}, {"question": "Câu hỏi 2", "answer": "..."}, {"question": "Câu hỏi 3", "answer": "..."}],
  "seoTitle": "Tiêu đề SEO, tối đa 60 ký tự",
  "metaDescription": "Mô tả SEO, tối đa 160 ký tự",
  "seoKeywords": ["từ khóa 1", "từ khóa 2", "từ khóa 3"],
  "slug": "duong-dan-khong-dau-khong-hoa-viet",
  "tags": ["tag1", "tag2"],
  "category": "đúng 1 mã trong danh sách mã hợp lệ ở trên — nếu không chắc, giữ nguyên mã danh mục hiện tại",
  "altText": "Mô tả ảnh ngắn gọn dùng cho thuộc tính alt, tối đa 125 ký tự"
}`;
      },
      mapToDraftContent(providerOutput, inputParams, context) {
        const p = context.product || {};
        const parsed = parseJsonResponse(providerOutput.text);
        if (!parsed) {
          return {
            name: p.name || '', shortDescription: '', description: stripCodeFence(providerOutput.text),
            specifications: '', features: [], faq: [], seoTitle: '', metaDescription: '', seoKeywords: [],
            slug: '', tags: [], category: '', altText: p.name || '', _productName: p.name || inputParams.productId
          };
        }
        return {
          name: parsed.name || p.name || '', shortDescription: parsed.shortDescription || '', description: parsed.description || '',
          specifications: parsed.specifications || '', features: Array.isArray(parsed.features) ? parsed.features : [],
          faq: Array.isArray(parsed.faq) ? parsed.faq.filter(f => f && f.question) : [],
          seoTitle: parsed.seoTitle || '', metaDescription: parsed.metaDescription || '',
          seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : [], slug: parsed.slug || '',
          tags: Array.isArray(parsed.tags) ? parsed.tags : [], category: parsed.category || '',
          altText: parsed.altText || parsed.name || p.name || '', _productName: parsed.name || p.name || inputParams.productId
        };
      }
    },

    'seo-generator': {
      targetCollection: 'blogPosts',
      buildPrompt(inputParams, context) {
        const post = context.post || {};
        const categoryLabels = productCategoryLabels(context.product, context.categories);
        const categoryLine = categoryLabels.length ? ` Sản phẩm liên quan thuộc danh mục: ${categoryLabels.join(', ')}.` : '';
        return [
          `Dựa trên bài viết sau, tạo gói SEO gồm đúng 6 dòng:`,
          `dòng 1 = Meta Title (dưới 60 ký tự),`,
          `dòng 2 = Meta Description (dưới 160 ký tự),`,
          `dòng 3 = danh sách từ khóa (phân tách bằng dấu phẩy),`,
          `dòng 4 = Open Graph Title,`,
          `dòng 5 = Open Graph Description,`,
          `dòng 6 = gợi ý loại Schema.org phù hợp (vd: Article, Product, FAQPage) kèm lý do ngắn gọn.`,
          `Tiêu đề gốc: "${post.title || ''}". Mô tả ngắn: "${post.excerpt || ''}".${categoryLine}`
        ].join(' ');
      },
      mapToDraftContent(providerOutput, inputParams, context) {
        const lines = (providerOutput.text || '').split('\n').filter(Boolean);
        return {
          seoTitle: lines[0] || '', seoDescription: lines[1] || '',
          keywords: (lines[2] || '').split(',').map(k => k.trim()).filter(Boolean),
          ogTitle: lines[3] || '', ogDescription: lines[4] || '',
          ogImage: (context.post && context.post.coverImage) || '', schemaSuggestion: lines[5] || '',
          _postTitle: (context.post && context.post.title) || inputParams.postId
        };
      }
    },

    'facebook-post-generator': {
      targetCollection: null,
      buildPrompt(inputParams, context) {
        const p = context.product || {};
        const categoryLabels = productCategoryLabels(p, context.categories);
        const brief = inputParams.productBrief && inputParams.productBrief.name ? inputParams.productBrief : null;
        const productName = p.name || (brief && brief.name) || '';
        // Brief giàu dữ kiện (Telegram: đã nhận diện + research nguồn thật). Có dữ kiện thật thì KHÔNG ép viết 1 dòng,
        // và được viết dài theo lượng dữ kiện thay vì khuôn 3-5 câu.
        const briefList = (v) => Array.isArray(v) ? v.map(x => String(x || '').trim()).filter(Boolean) : (v ? [String(v).trim()] : []);
        const briefFeatures = brief ? briefList(brief.features) : [];
        const briefApps = brief ? briefList(brief.applications) : [];
        const briefNotes = brief ? briefList(brief.referenceNotes) : [];
        const richBrief = !!(brief && !p.name && (brief.specs || brief.description || briefFeatures.length || briefApps.length || briefNotes.length));
        const hasCatalogData = richBrief || !!(p.name && (p.description || p.shortDescription || p.specs || (Array.isArray(p.features) && p.features.length) ||
          categoryLabels.length || p.categoryLabel || p.category || p.price != null || p.condition || p.status || p.badgeText));
        // nameOnly chỉ khi THỰC SỰ chỉ có cái tên (Telegram brief hoặc product không có dữ liệu catalog).
        // Có category/description/specs/giá/tình trạng ⇒ dùng dữ liệu đó, không ép model viết 1 dòng.
        const nameOnly = !hasCatalogData && !!productName && !hasProductTypeHint(productName);
        let grounding;
        if (p.name) {
          const desc = String(p.description || p.shortDescription || '').trim();
          const featureText = Array.isArray(p.features) ? p.features.map(x => String(x || '').trim()).filter(Boolean).join('; ') : String(p.features || '').trim();
          const appText = Array.isArray(p.applications) ? p.applications.map(x => String(x || '').trim()).filter(Boolean).join('; ') : String(p.applications || p.useCases || '').trim();
          const price = p.price != null && p.price !== '' ? ` Giá: ${p.price}.` : '';
          const conditionValue = p.condition || p.status || '';
          const condition = conditionValue ? ` Tình trạng: ${conditionValue}.` : '';
          const badge = p.badgeText ? ` Thông tin bán hàng: ${p.badgeText}.` : '';
          grounding = `sản phẩm thật sau — chỉ dùng đúng thông tin đã cho, không bịa thêm: Tên: ${p.name}. Thương hiệu: ${p.brand || ''}. Thông số: ${p.specs || ''}.${desc ? ' Mô tả: ' + desc + '.' : ''}${featureText ? ' Tính năng: ' + featureText + '.' : ''}${appText ? ' Ứng dụng: ' + appText + '.' : ''}${price}${condition}${badge}${categoryLabels.length ? ` Thuộc danh mục: ${categoryLabels.join(', ')}.` : ''}`;
        } else if (richBrief) {
          grounding = `sản phẩm thật sau — chỉ dùng đúng thông tin đã cho, không bịa thêm: Tên: ${brief.name}. Thương hiệu: ${brief.brand || ''}. Model: ${brief.model || ''}.`
            + (brief.productType ? ` Loại: ${brief.productType}.` : '')
            + (brief.verification ? ` Mức xác minh: ${brief.verification}.` : '')
            + (brief.dataDepth ? ` Mức dữ liệu: ${brief.dataDepth}.` : '')
            + (brief.specs ? ` Thông số đã xác minh: ${brief.specs}.` : '')
            + (brief.description ? ` Mô tả: ${brief.description}.` : '')
            + (briefFeatures.length ? ` Tính năng: ${briefFeatures.join('; ')}.` : '')
            + (briefApps.length ? ` Ứng dụng: ${briefApps.join('; ')}.` : '')
            + (briefNotes.length ? `
TÀI LIỆU THAM KHẢO (trích từ trang web thật, có thể là tiếng Anh và lẫn nội dung thừa như menu/giá/vận chuyển — chỉ rút ý kỹ thuật/tính năng/công dụng có thật, diễn đạt lại bằng tiếng Việt tự nhiên; bỏ giá, khuyến mãi, vận chuyển, bảo hành của trang khác):
- ${briefNotes.join('\n- ')}` : '')
            + (brief.unverified && brief.unverified.length ? `
CHƯA XÁC MINH (TUYỆT ĐỐI không viết như sự thật): ${brief.unverified.join('; ')}.` : '');
        } else if (brief) {
          grounding = `sản phẩm thật sau — CHỈ có đúng thông tin này: Tên: ${brief.name}.`;
        } else if (inputParams.promotion) {
          grounding = `chương trình khuyến mãi sau: ${inputParams.promotion}.`;
        } else if (inputParams.topic) {
          grounding = `chủ đề sau: ${inputParams.topic}.`;
        } else {
          grounding = `giới thiệu chung về Pshop Music (không có chủ đề/sản phẩm/khuyến mãi cụ thể nào được chọn).`;
        }
        const factRule = 'Giá và tình trạng sẽ do hệ thống chèn từ dữ liệu thật — KHÔNG nhắc lại giá hoặc tình trạng trong phần bạn viết.';
        const single = inputParams.singleVersion === true;
        const countLine = single
          ? 'Viết ĐÚNG 1 PHIÊN BẢN duy nhất, tập trung vào chất lượng và độ cụ thể.'
          : 'Viết ĐÚNG 3 PHIÊN BẢN KHÁC NHAU THỰC SỰ: bản 1 đi thẳng vào sản phẩm/điểm nổi bật; bản 2 đặt sản phẩm vào một tình huống sử dụng cụ thể nếu loại sản phẩm/dữ liệu cho phép; bản 3 là góc mua hàng thực tế (chọn đúng loại, không gian, cách dùng) nếu có căn cứ. Không chỉ thay từ đồng nghĩa, không lặp mở bài/CTA; nếu một góc không có dữ liệu thì viết ngắn hơn, KHÔNG bịa. KHÔNG lặp nguyên câu/đoạn giữa các bản; bản 2 và 3 phải có ít nhất một ý/chi tiết khác bản 1. KHÔNG tạo khan hiếm giả, KHÔNG bịa khuyến mãi.';
        const vExample = richBrief
          ? '{"hook": "Dòng mở đầu có sức hút, đúng sản phẩm, nêu tên + điều đáng chú ý thật sự", "caption": "MỘT chuỗi duy nhất gồm nhiều đoạn văn bản thuần, các đoạn ngăn cách bằng \\n\\n bên trong chuỗi: (1) sản phẩm là gì và định vị; (2) các tính năng nổi bật đã xác minh, mỗi ý một câu kèm lợi ích thực tế; (3) phù hợp với nhóm khách nào nếu nguồn nêu", "cta": "Lời mời nhắn/liên hệ Pshop Music để được tư vấn, nhẹ nhàng; KHÔNG hứa test thử, dùng thử, cài đặt, copy dữ liệu, giao hàng, hỗ trợ nhanh hay dịch vụ nào dữ liệu không nêu", "hashtags": ["PshopMusic", "ThietBiAmThanh"]}'
          : nameOnly
          ? '{"hook": "Đúng tên sản phẩm", "caption": "", "cta": "Liên hệ Pshop Music để được tư vấn về sản phẩm.", "hashtags": ["PshopMusic", "ThietBiAmThanh"]}'
          : '{"hook": "Dòng đầu nêu tên sản phẩm + điểm đáng chú ý, không phải câu hỏi, không sáo rỗng", "caption": "2-4 câu tư vấn thực tế, văn bản thuần", "cta": "Lời mời nhắn/liên hệ Pshop Music để được tư vấn, nhẹ nhàng; KHÔNG hứa test thử, dùng thử, cài đặt, copy dữ liệu, giao hàng, hỗ trợ nhanh hay dịch vụ nào dữ liệu không nêu", "hashtags": ["PshopMusic", "ChanLoa", "ThietBiAmThanh"]}';
        const jsonShape = single
          ? `{\n  "versions": [\n    ${vExample}\n  ]\n}`
          : `{\n  "versions": [\n    ${vExample},\n    {"hook": "...", "caption": "...", "cta": "...", "hashtags": ["..."]},\n    {"hook": "...", "caption": "...", "cta": "...", "hashtags": ["..."]}\n  ]\n}`;
        const nameOnlyBlock = nameOnly
          ? '\nLƯU Ý ĐẶC BIỆT: Tên sản phẩm KHÔNG nêu rõ loại thiết bị. Bài viết CHỈ được gồm: (1) một dòng tên sản phẩm; (2) một câu mời liên hệ Pshop Music để được tư vấn. KHÔNG mô tả công dụng, tính năng, thiết kế, giao diện, đối tượng người dùng; KHÔNG suy đoán từ kiến thức bên ngoài.\n'
          : '';
        const examplesBlock = nameOnly
          ? '- Kém: "Pioneer DDJ-400 mang đến trải nghiệm DJ chuyên nghiệp với thiết kế thân thiện."\n- Tốt: "Pioneer DDJ-400 đang có tại Pshop Music. Liên hệ để được tư vấn về sản phẩm."'
          : '- Kém (chung chung): "Chân loa Aura là lựa chọn hoàn hảo, nâng cao sự ổn định và độ chính xác cho dàn âm thanh."\n- Tốt (phụ kiện): "Chân loa Aura giúp đặt loa đúng vị trí; hệ thống gọn gàng, dễ bố trí trong góc nghe cần sắp xếp."\n- Tốt (monitor): "KRK ROKIT 8 G4 là monitor nearfield 8 inch. Công suất 203W, DSP và 25 preset EQ giúp chỉnh âm theo phòng; cổng bass trước cho bass chặt."\n- Kém (thêm vế ngoài dữ kiện): "Công suất 203W, đủ cho mọi buổi tập tại nhà." — vế sau không có trong dữ kiện nên cả câu bị xoá và mất luôn 203W.\n- Kém (liệt kê cụt, khô): "Công suất 203W. Cổng bass phía trước. DSP 25 preset EQ."\n- Tốt (gộp dữ kiện cùng nguồn, tự nhiên): "KRK ROKIT 8 G4 là monitor nearfield 8 inch, công suất 203W. Mẫu này có cổng bass phía trước và DSP tích hợp 25 preset EQ."';
        return `Bạn là nhân viên tư vấn thiết bị âm thanh và DJ của Pshop Music (Nha Trang). Viết bài đăng Facebook bằng tiếng Việt cho ${grounding}
${nameOnlyBlock}

QUY TẮC BẮT BUỘC — bài nào vi phạm cũng không dùng được:
1. Văn bản THUẦN, không Markdown: không dùng # cho tiêu đề, không **, *, gạch đầu dòng -, danh sách số thứ tự, code block, HTML. Hashtag ở cuối bài vẫn được (mục 8). Chỉ xuống dòng hợp lý, emoji vừa phải.
2. Đi thẳng vào sản phẩm/chủ đề: mở bằng tên sản phẩm hoặc một chi tiết/tình huống cụ thể đáng chú ý; tên đầy đủ phải có trong hook hoặc câu đầu. Câu đầu PHẢI chứa tên đầy đủ của sản phẩm (không mở bằng "Với...", "Sản phẩm...", "Mẫu..."). KHÔNG mở bằng "Bạn đang tìm kiếm...", "Hãy để...", "Đỉnh cao trải nghiệm...", "Không chỉ là...", "Sự kết hợp hoàn hảo...", "Nâng tầm...", câu hỏi tu từ hoặc lời quảng cáo chung chung.
3. Chỉ dùng đúng dữ kiện đã cho. KHÔNG bịa thông số, chất liệu, kích thước, công suất, tần số, trọng lượng, khả năng tương thích, bảo hành, khuyến mãi, nguồn gốc, xuất xứ, tình trạng. KHÔNG hứa cải thiện chất âm, độ chính xác, độ ổn định, chống rung hay cách âm nếu dữ liệu không nêu. KHÔNG thêm tính từ chất âm/trải nghiệm như "rõ ràng", "chi tiết", "ấm", "mềm", "sống động", "nghe rõ" nếu nguồn không có. KHÔNG nói "đang có", "còn hàng" nếu dữ liệu không xác nhận. Không có dữ liệu thì không nhắc tới.
4. Không khẳng định sản phẩm tương thích/dùng được với thiết bị khác nếu dữ liệu không nêu. Nếu tên sản phẩm nêu rõ loại thiết bị (vd "chân loa" → đặt/giữ loa; "giá đỡ micro" → giữ/cố định micro; "loa" → phát âm thanh; "tai nghe" → nghe nhạc; "mixer/controller" → trộn/điều khiển nhạc), chỉ nói công dụng chung đó; KHÔNG suy đoán thông số, model, kích thước hay khả năng tương thích. Riêng "chân loa": chỉ nói dùng để đặt loa đúng vị trí và bố trí hệ thống gọn gàng; không nói cải thiện âm thanh hay độ chính xác. Riêng "giá đỡ micro": chỉ nói dùng để giữ/cố định micro; không nói chắc chắn, vững, di chuyển tự do, điều chỉnh được, thiết kế, mọi tình huống hay mọi buổi biểu diễn.
4b. ${richBrief ? 'Công dụng/tính năng CHỈ được lấy từ thông số, mô tả, tính năng và tài liệu tham khảo đã cho ở trên (đã khớp đúng model); không dùng kiến thức bên ngoài, không dùng thông tin của model/phiên bản khác. Mục CHƯA XÁC MINH nếu có thì không được viết như sự thật.' : ''}CHỈ được mô tả công dụng khi cụm chỉ loại thiết bị xuất hiện NGUYÊN VĂN trong tên sản phẩm (hoặc khi dữ kiện đã cho nêu rõ công dụng). Nếu tên chỉ là thương hiệu + mã model (vd "Pioneer DDJ-400") hoặc không nêu loại, TUYỆT ĐỐI không suy đoán công dụng, tính năng, thiết kế, giao diện, đối tượng người dùng; chỉ nêu tên sản phẩm và mời liên hệ Pshop Music để được tư vấn.
4c. Viết theo loại sản phẩm, không dùng một khuôn cho tất cả: monitor/loa kiểm âm → vị trí nearfield/phòng thu và thông số nếu có; USB/ổ cứng → dung lượng, tốc độ, tương thích nếu có; phụ kiện → công dụng cơ bản. Không suy đoán điều chỉnh, độ bền, chất liệu.
5. Giọng người bán hàng đang tư vấn trực tiếp: câu ngắn, có nhịp, động từ cụ thể; giải thích ngắn thông số quan trọng bằng đúng lời nguồn; chỉ nói người mua làm được gì khi chính dữ kiện nêu điều đó. Không viết như brochure, không khoe kiến thức, không lặp tên sản phẩm quá một lần (sau đó dùng "mẫu này/sản phẩm này" nếu tự nhiên). Không mở tất cả các bản bằng cùng một kiểu câu.
6. ${richBrief ? 'Bài đủ sâu để người mua hiểu sản phẩm TRƯỚC khi đến lời mời liên hệ, văn phong tự nhiên của người bán đang tư vấn (có thể xưng "anh em" khi mở bài), bố cục dễ đọc trên Facebook (đoạn ngắn, ngăn cách bằng dòng trống), CHỈ dùng dữ kiện thật. Triển khai linh hoạt theo các phần dưới đây, phần nào KHÔNG có dữ kiện hỗ trợ thì BỎ HẲN phần đó (không viết câu thay thế): (a) mở bài: sản phẩm là gì, thuộc loại nào, định vị theo mô tả nguồn; chỉ nêu nhóm người dùng/nhu cầu khi nguồn nêu rõ, nếu không thì chỉ gọi chung theo loại sản phẩm (vd "anh em đang tìm một chiếc loa kiểm âm"); (b) thiết kế và cấu tạo: chất liệu, kiểu dáng, cách lắp, cổng kết nối, kích thước theo đúng từ ngữ nguồn; (c) hiệu năng hoặc chất âm: CHỈ khi nguồn mô tả (vd công suất, dải tần, DSP, EQ, driver) và chỉ diễn đạt đúng mức nguồn nói; tuyệt đối không tự nhận xét vocal, mid, bass, độ chi tiết, độ ấm, độ bền, độ thoải mái nếu nguồn không viết; (d) giá trị sử dụng: giải thích một tính năng giúp người dùng làm gì CHỈ khi chính câu nguồn nêu kết quả đó; nguồn chỉ nêu tên tính năng thì chỉ mô tả tính năng; (e) nhu cầu phù hợp (biểu diễn, luyện tập, làm nhạc, phòng thu, nghe nhạc...) CHỈ lấy từ mục Ứng dụng/nguồn đã nêu; (f) ai nên cân nhắc: chỉ khi nguồn nêu đối tượng, không khẳng định hợp với mọi người, không ép mua. Khai thác HẾT các tính năng, đặc điểm, công dụng đã xác minh (không giới hạn số ý; độ dài tỉ lệ với lượng dữ kiện thật), mỗi ý chỉ nói một lần, không lặp ý/lặp thông số, không câu quảng cáo rỗng để kéo dài. Mỗi câu trọn vẹn chủ ngữ–vị ngữ, tiếng Việt tự nhiên, không dịch từng chữ, không câu cụt. Nếu dữ kiện cho trước mỏng (mức "dữ liệu mỏng") thì viết NGẮN đúng phần có căn cứ, không viết như bài đánh giá chuyên sâu, không giả vờ đã đủ thông tin. Bảng thông số kỹ thuật đầy đủ do HỆ THỐNG chèn bên dưới bài; khi nêu thông số trong bài, gắn với tính năng tương ứng, đừng chép lại cả bảng.' : 'Độ dài 3-5 câu (không tính hashtag), 1-2 đoạn.'} Chỉ dùng MỘT lời mời liên hệ duy nhất ở trường "cta"; KHÔNG viết lời mời liên hệ/trải nghiệm/ghé shop trong hook/caption; CTA ngắn, tự nhiên, không mở đầu bằng "Hãy..." một cách máy móc; tối đa một dấu chấm than, không lạm dụng emoji.
7. ${factRule}
8. Hashtags: 3-5 tag liên quan trực tiếp, đặt ở cuối, dạng #Tag (không dấu cách, không markdown).
9. Mỗi câu phải cho người mua một thông tin cụ thể lấy từ dữ kiện (sản phẩm là gì, thông số nào, tương thích gì, đặc điểm gì). Công dụng, nhu cầu, đối tượng chỉ nêu khi dữ kiện nêu. Nếu nêu thông số, chỉ nói nó giúp gì khi dữ kiện nêu điều đó; tối đa 2-3 thông số, không liệt kê suông, không lặp ý. Câu nào chỉ khen chung chung thì bỏ.
9b. Khi dữ kiện có thông số kỹ thuật đã xác minh (trường specs/features), MỖI phiên bản PHẢI nêu ít nhất một thông số đã có và chỉ nói lợi ích gắn với thông số đó khi dữ kiện nêu lợi ích đó; không được thay toàn bộ bằng mô tả thiết kế/cảm tính và không chỉ liệt kê thông số. Không suy ra chất âm, cách âm, độ bền, độ thoải mái hoặc an toàn ngoài nguồn. Nếu chỉ có một thông số, dùng đúng thông số đó.
9d. MỖI CÂU ĐƯỢC KIỂM CHỨNG RIÊNG với dữ kiện: câu có DÙ CHỈ MỘT vế ngoài dữ kiện sẽ bị xoá NGUYÊN CÂU, kéo theo mất cả thông tin thật trong câu đó. Vì vậy mọi vế trong câu phải là dữ kiện đã cho; KHÔNG nối thêm vế kết quả/tình huống/địa điểm/đối tượng/lợi ích mà dữ kiện không nêu (vd "đi show", "tại booth", "trong balo", "tiết kiệm thời gian", "cho anh em DJ", "thuận tiện", "yên tâm"). Bài vẫn phải đọc TỰ NHIÊN như người bán đang nói chuyện, KHÔNG phải danh sách thông số: gộp 2-3 dữ kiện CÙNG MỘT MỤC nguồn (cùng dòng Thông số, hoặc cùng một câu Mô tả) thành một câu có chủ ngữ rõ ràng; KHÔNG ghép dữ kiện của hai mục khác nhau (Thông số với Mô tả) vào một câu — tách thành hai câu, nối bằng "và", "đi cùng", "cùng với", dấu phẩy; không viết mỗi dữ kiện một câu cụt ("Vỏ kim loại." "Dung lượng 128GB."); thông tin cùng nhóm (kết nối/tương thích, cấu tạo, dung lượng) đi chung một đoạn ngắn. MỌI câu phải có chủ ngữ rõ ("Mẫu này…", "USB này…", tên sản phẩm…); KHÔNG mở câu bằng động từ trơ trọi như "Hỗ trợ…", "Giúp…", "Tạo…", "Đảm bảo…", "Phù hợp…", "Cho phép…" (câu thiếu chủ ngữ sẽ bị hệ thống loại và mất thông tin). Không đặt câu hỏi trong hook/caption. Hook và caption KHÔNG lặp thông tin: mỗi dữ kiện (tốc độ, chuẩn kết nối, dung lượng, thiết bị tương thích) chỉ xuất hiện MỘT lần trong cả bài; câu đầu của caption nói điều hook CHƯA nói. Danh sách tương thích (thiết bị/phần mềm) viết đủ như nguồn trong một câu riêng, không thêm vế nhận xét; cấm cụm trấn an/cảm xúc như "yên tâm", "an tâm", "đúng hệ sinh thái". Hook là MỘT câu hoàn chỉnh có nhịp: nêu tên sản phẩm và gắn với ý nổi bật nhất CÓ TRONG dữ kiện (con số, chuẩn kết nối, thiết bị tương thích) bằng cách diễn đạt có sức hút, không chỉ ghép "tên + thông số", và không thêm vế đối tượng/tình huống. Sức hấp dẫn đến từ nhịp câu, động từ cụ thể và thứ tự (ý mạnh nhất trước), KHÔNG đến từ thêm ý. "anh em" chỉ là lời xưng hô ở mở bài, không gắn hành động hay tình huống.
9c. Không diễn đạt Max SPL thành "nghe nhạc với âm lượng tối đa", "nghe ở mức 120dB", cam kết an toàn thính giác hoặc lời khuyên nghe ở mức tối đa; chỉ nêu Max SPL như một thông số của sản phẩm.
10. Cấm các cụm sáo rỗng: "lựa chọn hoàn hảo", "giải pháp lý tưởng", "đáng sở hữu", "không thể bỏ qua", "nâng tầm", "đẳng cấp", "số 1", "tốt nhất", "tuyệt vời", "hoàn hảo", "tối ưu nhất", "mang đến trải nghiệm tuyệt vời", "nâng tầm trải nghiệm", "nâng cao sự ổn định/độ chính xác" khi không có dữ liệu.
11. Trước khi trả JSON, tự kiểm tra: có Markdown không? có câu nào chỉ khen chung hoặc hứa cải thiện âm thanh/độ chính xác không? có số liệu nào không nằm trong dữ liệu không? có suy đoán công dụng/tính năng khi tên sản phẩm không nêu rõ loại không? Nếu có, viết lại câu đó.

VÍ DỤ CÁCH VIẾT (chỉ học mức độ cụ thể, KHÔNG copy nguyên văn cho sản phẩm khác):
${examplesBlock}

${countLine}

Trả về DUY NHẤT 1 đối tượng JSON hợp lệ — không kèm giải thích, không bọc trong khối markdown. Mỗi khóa (hook, caption, cta, hashtags) chỉ xuất hiện ĐÚNG MỘT LẦN trong mỗi phiên bản; nhiều đoạn văn thì nằm trong cùng một chuỗi "caption". Đúng cấu trúc sau:
${jsonShape}

TUYỆT ĐỐI KHÔNG tự chèn ảnh/link, không tự bịa URL ảnh/video/link nào — hệ thống sẽ tự chèn ảnh/video/link thật vào đúng vị trí, bạn chỉ cần viết phần văn bản.`;
      },
      mapToDraftContent(providerOutput, inputParams, context) {
        const p = context.product || {};
        const allowedText = [p.name, p.brand, p.specs, p.description, p.shortDescription, Array.isArray(p.features) ? p.features.join(' ') : p.features,
          Array.isArray(p.applications) ? p.applications.join(' ') : (p.applications || p.useCases), p.badgeText, p.categoryLabel, p.category, p.status, p.condition, p.price,
          inputParams.promotion, inputParams.topic, inputParams.productBrief && inputParams.productBrief.name,
          // Brief giàu dữ kiện: chỉ nguồn đã xác minh/nguồn tham khảo thật mới làm "dữ kiện được phép" cho bộ lọc claim.
          inputParams.productBrief && inputParams.productBrief.specs, inputParams.productBrief && inputParams.productBrief.description,
          inputParams.productBrief && inputParams.productBrief.brand, inputParams.productBrief && inputParams.productBrief.model,
          inputParams.productBrief && [].concat(inputParams.productBrief.features || [], inputParams.productBrief.applications || [], inputParams.productBrief.referenceNotes || []).join(' ')
        ].filter(Boolean).join(' ');
        const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
        const parsed = parseJsonResponse(providerOutput.text);
        const highlights = Array.isArray(p.features) && p.features.length ? p.features.slice(0, 5) : (p.specs ? [p.specs] : []);
        const embedUrl = getYoutubeEmbedUrl(p.youtubeUrl);
        const productLink = inputParams.productId ? `category.html?product=${encodeURIComponent(inputParams.productId)}` : '';

        const rawVersions = (parsed && Array.isArray(parsed.versions) && parsed.versions.length) ? parsed.versions : null;
        let versions;
        if (rawVersions) {
          versions = rawVersions.map(v => {
            const tags = (v && Array.isArray(v.hashtags)) ? v.hashtags
              .map(h => String(h || '').replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '').trim())
              .filter(Boolean) : [];
            return {
              hook: sanitizeFacebookText(v && v.hook, allowedText),
              caption: sanitizeFacebookText(v && v.caption, allowedText),
              cta: sanitizeFacebookText(v && v.cta, allowedText),
              hashtags: Array.from(new Set(tags.map(t => '#' + t)))
            };
          });
          // Không lặp nguyên câu mô tả giữa các phiên bản; giữ câu đầu tiên xuất hiện.
          const seenSentences = new Set();
          versions = versions.map(v => {
            if (!v.caption) return v;
            const sentences = splitSentencesForCleanup(v.caption);
            const kept = sentences.filter(s => {
              const key = String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
              if (!key) return false;
              if (seenSentences.has(key)) return false;
              seenSentences.add(key);
              return true;
            });
            return Object.assign({}, v, { caption: kept.join(' '), __skipFallback: kept.length < sentences.length });
          });
          // Bản sau không còn câu nào riêng thì bỏ (không giữ hook/CTA rỗng nghĩa).
          versions = versions.filter((v, i) => i === 0 || String(v.caption || '').trim().length > 0);
          // Không giữ 2 bản có cùng nội dung caption (khác hook/CTA không đủ tạo giá trị riêng).
          const seenCaptions = new Set();
          versions = versions.filter(v => {
            const key = String(v.caption || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (!key) return true;
            if (seenCaptions.has(key)) return false;
            seenCaptions.add(key);
            return true;
          });
        } else {
          versions = [{ hook: '', caption: sanitizeFacebookText(stripCodeFence(providerOutput.text), allowedText), cta: '', hashtags: [] }];
        }

        const buildPostText = (version) => {
          const contentParts = [];
          if (version.hook) contentParts.push(version.hook);
          if (version.caption) contentParts.push(version.caption);
          // Giá/tình trạng/bảo hành lấy từ catalog, không lấy câu AI tự nói.
          let coreText = stripFactClaims(sanitizeFacebookText(contentParts.join('\n\n'), allowedText));
          const ctaText = version.cta ? sanitizeFacebookText(version.cta, allowedText) : '';
          // CTA nằm trong caption lẫn trường cta: chỉ giữ trường cta, bỏ CTA lặp trong body.
          if (ctaText) coreText = stripCtaSentences(coreText);
          // AI bị lọc quá tay (rỗng/ngắn) → dùng 2 câu đầu description catalogue (dữ liệu thật) làm fallback.
          if (!version.__skipFallback && p.description && (!coreText || coreText.length < 120)) {
            const fb = sourceDescriptionFallback(p, allowedText);
            if (fb) coreText = [coreText, fb].filter(Boolean).join('\n\n');
          }
          // Spec/highlight là dữ liệu catalogue, ghép sau phần văn AI.
          if (highlights.length) coreText = [coreText, highlights.join('\n')].filter(Boolean).join('\n\n');
          const body = polishFacebookText(dedupeProductMentions(dedupeProductNameStarts(ensureProductName([coreText, ctaText].filter(Boolean).join('\n\n'), p.name), p.name), p.name));
          const facts = productFactsBlock(p);
          // Link hệ thống ghép SAU sanitizer để không bị tách câu thành "category. html?..."
          const linkLine = productLink ? 'Xem chi tiết: ' + productLink : '';
          // Hashtag luôn ở cuối bài.
          const tagLine = version.hashtags.length ? version.hashtags.map(h => (h.indexOf('#') === 0 ? h : '#' + h)).join(' ') : '';
          // Kiểm tra lại SAU KHI ghép hook/caption/CTA/facts/tags — đây là đầu ra Facebook thật.
          return toPlainFacebookText([body, facts, linkLine, tagLine].filter(Boolean).join('\n\n'));
        };

        const labels = ['A', 'B', 'C', 'D', 'E'];
        const versionsWithText = versions.map((v, i) => Object.assign({ label: labels[i] || String(i + 1) }, v, { postText: buildPostText(v) }));
        versionsWithText.forEach(v => { delete v.__skipFallback; });

        return { versions: versionsWithText, productHighlights: highlights, featuredImage: images[0] || '', galleryImages: images.slice(1), youtubeEmbedUrl: embedUrl, productLink };
      }
    },

    'banner-generator': {
      targetCollection: 'banners',
      buildPrompt(inputParams, context) {
        const p = context.product || {};
        const categoryLabels = productCategoryLabels(p, context.categories);
        let grounding;
        if (p.name) {
          grounding = `sản phẩm thật sau — chỉ dùng đúng thông tin đã cho, không bịa thêm: Tên: ${p.name}. Thương hiệu: ${p.brand || ''}.${categoryLabels.length ? ` Thuộc danh mục: ${categoryLabels.join(', ')}.` : ''}`;
        } else if (inputParams.promotion) {
          grounding = `chương trình khuyến mãi sau: ${inputParams.promotion}.`;
        } else if (inputParams.event) {
          grounding = `sự kiện sau: ${inputParams.event}.`;
        } else {
          grounding = `giới thiệu chung về Pshop Music (không có sản phẩm/khuyến mãi/sự kiện cụ thể nào được chọn).`;
        }
        return `Viết nội dung banner quảng cáo ngắn gọn, thu hút cho Pshop Music (shop thiết bị DJ & âm thanh chuyên nghiệp tại Nha Trang), xoay quanh ${grounding}

Trả về DUY NHẤT 1 đối tượng JSON hợp lệ — không kèm giải thích, không bọc trong khối markdown, đúng các khóa sau:
{
  "title": "Tiêu đề banner ngắn gọn, thu hút, tối đa 8 từ",
  "subtitle": "Phụ đề bổ sung 1 câu ngắn",
  "cta": "Cụm từ kêu gọi hành động ngắn (VD: Mua ngay, Xem thêm)"
}

TUYỆT ĐỐI KHÔNG tự chèn ảnh, không tự bịa URL ảnh nào — hệ thống sẽ tự chèn ảnh sản phẩm thật vào banner nếu có.`;
      },
      mapToDraftContent(providerOutput, inputParams, context) {
        const p = context.product || {};
        const images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
        const parsed = parseJsonResponse(providerOutput.text);
        let title = '', subtitle = '', cta = '';
        if (parsed) {
          title = parsed.title || ''; subtitle = parsed.subtitle || ''; cta = parsed.cta || '';
        } else {
          title = stripCodeFence(providerOutput.text).split('\n')[0];
        }
        if (!title) title = inputParams.promotion || inputParams.event || (p.name ? ('Banner ' + p.name) : 'Banner quảng cáo mới');
        return { title, subtitle, cta, image: images[0] || '', galleryImages: images.slice(1), link: inputParams.link || '', zone: 'home-top', order: 0, active: true };
      }
    },

    'image-generator': {
      targetCollection: null,
      isImageGen: true,
      IMAGE_TYPE_DIRECTION: {
        'Product Hero Image': 'professional studio product photography, clean neutral background, soft even studio lighting, centered composition, high detail',
        'Facebook Post Image': 'eye-catching square social media post image, vibrant colors, modern marketing style',
        'Facebook Carousel Image': 'clean modern e-commerce carousel image, consistent studio lighting, product-focused composition',
        'Banner Image': 'wide marketing banner background, bold and eye-catching, professional advertising style',
        'Promotion Banner': 'promotional sale banner background, energetic composition, bold contrasting colors',
        'Blog Cover Image': 'editorial blog cover image, professional magazine-style composition',
        'Blog Inline Image': 'illustrative supporting image for a blog article, clean and contextually relevant',
        'Category Background Image': 'wide professional retail category header background, subtle negative space reserved on one side for a product image overlay, no visible product in frame, no text',
        'Product Background Image': 'clean professional background composition for product photography, subtle negative space reserved for a product overlay, no visible product in frame, no text'
      },
      STYLE_DIRECTION: {
        'Studio': 'studio background style, seamless clean backdrop, professional even lighting',
        'Lifestyle': 'lifestyle setting background style, real-world environment, natural ambient lighting',
        'Dark': 'dark theme background style, deep tones, moody dramatic lighting',
        'Light': 'light theme background style, bright airy tones, soft even lighting',
        'Luxury': 'luxury premium background style, elegant refined aesthetic, rich materials',
        'Minimal': 'minimal background style, clean negative space, simple geometric composition',
        'Technology': 'technology theme background style, sleek modern digital aesthetic, cool tones, subtle circuit/grid motif'
      },
      buildPrompt(inputParams, context) {
        let direction = this.IMAGE_TYPE_DIRECTION[inputParams.imageType] || 'professional marketing photography';
        const styleDirection = this.STYLE_DIRECTION[inputParams.style];
        if (styleDirection) direction += ', ' + styleDirection;
        const p = context.product;
        const post = context.post;
        let grounding;
        if (p && p.name) {
          const details = [p.brand, p.categoryLabel].filter(Boolean).join(', ');
          grounding = `featuring "${p.name}"${details ? ' (' + details + ')' : ''}${p.shortDescription ? '. ' + p.shortDescription : (p.specs ? '. ' + p.specs : '')}`;
        } else if (post && post.title) {
          grounding = `related to the article "${post.title}"`;
        } else if (inputParams.promotion) {
          grounding = `for the promotion: "${inputParams.promotion}"`;
        } else if (inputParams.customPrompt) {
          grounding = inputParams.customPrompt;
        } else {
          grounding = 'for Pshop Music, a professional DJ and audio equipment store in Nha Trang, Vietnam';
        }
        return `${direction}, ${grounding}. Do not include any text, caption, watermark, or logo in the image.`;
      },
      mapToDraftContent(providerOutput, inputParams, context) {
        const p = context.product;
        const post = context.post;
        return {
          imageUrl: providerOutput.imageUrl || '', prompt: this.buildPrompt(inputParams, context),
          imageType: inputParams.imageType, style: inputParams.style || null, size: inputParams.size,
          sourceProductId: inputParams.productId || null, sourceProductName: (p && p.name) || null,
          sourceBlogPostId: inputParams.blogPostId || null, sourceBlogPostTitle: (post && post.title) || null, usedIn: []
        };
      }
    },

    'image-prompt-generator': {
      targetCollection: null,
      buildPrompt(inputParams) {
        return `Viết 1 prompt tiếng Anh chi tiết để tạo ảnh AI, chủ thể: "${inputParams.subject}", phong cách: ${inputParams.style || 'Ảnh sản phẩm studio'}. Mô tả rõ bố cục, ánh sáng, góc máy.`;
      },
      mapToDraftContent(providerOutput) { return { imagePrompt: providerOutput.text || '' }; }
    },

    'slider-generator': {
      targetCollection: 'siteContent.heroSlides',
      buildPrompt(inputParams, context) {
        const p = context.product || {};
        return [
          `Dựa trên sản phẩm sau, viết nội dung 1 slide banner trang chủ bằng tiếng Việt.`,
          `Sản phẩm: ${p.name || ''}. Thương hiệu: ${p.brand || ''}. Thông số: ${p.specs || ''}.`,
          `Trả về đúng 3 dòng: dòng 1 = Headline (in hoa, dưới 8 từ), dòng 2 = Subheadline (1 câu mô tả ngắn), dòng 3 = prompt tiếng Anh mô tả chi tiết để dùng với công cụ tạo ảnh AI khác (bối cảnh studio chuyên nghiệp cho sản phẩm này).`
        ].join(' ');
      },
      mapToDraftContent(providerOutput, inputParams, context) {
        const p = context.product || {};
        const lines = (providerOutput.text || '').split('\n').filter(Boolean);
        const media = context.media || [];
        return {
          image: media[0] || '', title: lines[0] || p.name || '', subtitle: lines[1] || '',
          link: p.category ? `category.html?cat=${p.category}` : '', ctaText: inputParams.ctaStyle || 'Xem chi tiết',
          imagePrompt: lines[2] || ''
        };
      }
    },

    'faq-generator': {
      targetCollection: 'blogPosts',
      buildPrompt(inputParams) {
        return `Tạo ${inputParams.questionCount || '5'} câu hỏi thường gặp (FAQ) bằng tiếng Việt về chủ đề "${inputParams.topic}", mỗi câu hỏi kèm câu trả lời ngắn gọn. Trả về dòng đầu là tiêu đề bài viết, các dòng sau là nội dung HTML dùng <h3> cho câu hỏi và <p> cho câu trả lời.`;
      },
      mapToDraftContent(providerOutput, inputParams) {
        const lines = (providerOutput.text || '').split('\n').filter(Boolean);
        return {
          title: lines[0] || inputParams.topic, slug: '', excerpt: `Câu hỏi thường gặp: ${inputParams.topic}`, coverImage: '',
          author: 'Pshop Music', tags: ['faq'], status: 'draft', seoTitle: '', seoDescription: '',
          contentHtml: lines.slice(1).join('\n')
        };
      }
    },

    // Kiểm chứng từng câu của bài Facebook với dữ kiện nguồn (lượt thứ 2 sau Writer). Nội bộ — không có UI/targetCollection.
    // Mỗi câu → nhãn (spec/feature/benefit/unsupported) + trích dẫn NGUYÊN VĂN từ dữ kiện nguồn; mã nguồn kiểm lại trích dẫn.
    'facebook-claim-verifier': {
      targetCollection: null,
      buildPrompt(inputParams) {
        const ev = String(inputParams.evidenceText || '').slice(0, 16000);
        const sentences = (Array.isArray(inputParams.sentences) ? inputParams.sentences : []).map((s, i) => i + ': ' + s).join('\n');
        return `Bạn là người kiểm chứng nội dung bán hàng của Pshop Music. Dưới đây là DỮ KIỆN NGUỒN của một sản phẩm và các câu trong bài Facebook (tiếng Việt). Với MỖI câu, xác định nó có căn cứ trong dữ kiện nguồn hay không.

DỮ KIỆN NGUỒN (có thể bằng tiếng Anh):
${ev}

CÁC CÂU CẦN KIỂM:
${sentences}

Nhãn cho mỗi câu:
- "spec": nêu thông số kỹ thuật (số, đơn vị, kích thước, công suất...) khớp đúng dữ kiện nguồn.
- "feature": nêu tính năng/đặc điểm/công dụng có trong dữ kiện nguồn (diễn đạt lại bằng tiếng Việt vẫn đúng nghĩa). Câu chỉ giới thiệu đúng tên/loại sản phẩm như dữ kiện cho trước cũng là "feature".
- "benefit": lợi ích diễn giải hợp lý, đi thẳng từ MỘT tính năng có trong nguồn, KHÔNG thêm sự kiện mới và KHÔNG thêm tính từ khen.
- "unsupported": mọi trường hợp còn lại, gồm: thông số/tính năng không có trong nguồn; đối tượng người dùng, địa điểm, không gian, tình huống sử dụng mà nguồn không nêu; so sánh hơn/siêu hạng ("tốt nhất", "vượt trội"); tính từ chất lượng/chất âm nguồn không nêu; tương thích, bảo hành, xuất xứ, phụ kiện, tình trạng không có trong nguồn; thông tin của model khác.

NGUYÊN TẮC ĐỐI CHIẾU: dữ kiện nguồn là bằng chứng DUY NHẤT. Việc sản phẩm có tài liệu nguồn KHÔNG chứng minh mọi câu; câu có con số cũng KHÔNG mặc nhiên hợp lệ (số phải khớp và phần còn lại của câu cũng phải có căn cứ). Ngược lại, câu mô tả đúng tính năng/công dụng có trong nguồn thì hợp lệ dù KHÔNG chứa số. Phải suy xét NGHĨA của câu so với đoạn trích, không chỉ trùng từ.
Luôn gắn "unsupported" cho: (a) câu khen/định vị trừu tượng mà đoạn trích không nói (vd "mang đến sự đổi mới cho không gian sáng tạo âm nhạc", "âm thanh đầy đủ và phong phú", "trải nghiệm đẳng cấp", "phù hợp cho mọi nhu cầu"); (b) câu chỉ lặp lại tên/loại sản phẩm rồi thêm tính từ hoặc lợi ích mà nguồn không nêu; (c) đối tượng/không gian/thể loại âm nhạc nguồn không nhắc. Một số/thông số trong câu không cứu được phần khen không căn cứ của chính câu đó. Đoạn "evidence" chỉ là tên sản phẩm thì CHỈ chứng minh câu giới thiệu "đây là sản phẩm gì", không chứng minh lợi ích/tính năng.

QUY TẮC NGHIÊM: một câu chỉ được gắn spec/feature/benefit khi MỌI thành phần của câu đều có căn cứ trong dữ kiện nguồn — kể cả tính từ và cụm khen/mô tả chất lượng ("nổi tiếng", "mạnh mẽ", "rõ ràng", "chi tiết", "chính xác", "chuyên nghiệp", "đẳng cấp", "mượt mà", "thực thụ"...), đối tượng ("người mới", "nhà sản xuất"...), nơi dùng và so sánh. Nếu có BẤT KỲ cụm nào không có trong nguồn, ghi cụm đó vào trường "unsupported_phrase" (nguyên văn trong câu) — câu sẽ bị loại.
Với nhãn khác "unsupported", BẮT BUỘC trường "evidence" là một đoạn trích NGUYÊN VĂN (copy y nguyên, 4-25 từ) từ DỮ KIỆN NGUỒN làm căn cứ. Không trích được nguyên văn thì phải gắn "unsupported". Khi nghi ngờ, gắn "unsupported".

LỢI ÍCH: nhãn "benefit" chỉ dùng khi chính đoạn nguồn NÊU KẾT QUẢ/LỢI ÍCH đó (vd "gives tight bass response", "helps…", "lets you…"). Khi đó BẮT BUỘC điền "benefit_quote" = cụm nguyên văn trong "evidence" nêu lợi ích. Nếu nguồn chỉ mô tả tính năng mà câu lại thêm lợi ích/kết quả (vd nguồn "Front-firing port" nhưng câu nói "cho âm trầm chặt") thì gắn "unsupported" cho câu đó. Câu chỉ mô tả tính năng thì gắn "feature", benefit_quote để trống.

Trả về DUY NHẤT 1 đối tượng JSON hợp lệ, không giải thích, không bọc trong khối markdown, đúng cấu trúc:
{"results": [{"i": 0, "label": "spec", "evidence": "trích nguyên văn từ dữ kiện nguồn", "benefit_quote": "", "unsupported_phrase": ""}]}`;
      },
      mapToDraftContent(providerOutput) {
        const parsed = parseJsonResponse(providerOutput.text);
        const list = parsed && Array.isArray(parsed.results) ? parsed.results : null;
        return { results: list ? list.map(r => ({ i: Number(r && r.i), label: String((r && r.label) || '').toLowerCase(), evidence: String((r && r.evidence) || ''), benefit_quote: String((r && r.benefit_quote) || ''), unsupported_phrase: String((r && r.unsupported_phrase) || '') })) : null };
      }
    }
  };

  return { MODULES, parseJsonResponse, stripCodeFence, escapeHtml, getYoutubeEmbedUrl, productCategoryLabels, sanitizeFacebookText, hasProductTypeHint, stripFactClaims, productFactsBlock, ensureProductName, dedupeProductNameStarts, dedupeProductMentions, stripCtaSentences, polishFacebookText, splitSentencesForCleanup };
});
