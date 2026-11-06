/*
 * tests/productContentBrief.test.js — Product Content Engine: research thật phải đi vào prompt viết content.
 * Chạy: node tests/productContentBrief.test.js (từ functions/). Không gọi OpenAI; prompt/brief/preview là mã thật.
 */
'use strict';
const assert = require('assert');
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'firebase-admin') return { database: () => ({ ref: () => ({}) }), apps: [1], initializeApp() {} };
  return origLoad.apply(this, arguments);
};
const orch = require('../shared/contentOrchestrator');
const Core = require('../shared/aiModulesCore');
const mod = Core.MODULES['facebook-post-generator'];
// Bước kiểm chứng câu mặc định = duyệt mọi câu (trích dẫn lấy từ chính dữ kiện nguồn); deps.verifierFn ghi đè.
const quoteOf = (ev) => String(ev || '').split(/\n/).map(x => x.trim()).sort((a, b) => b.length - a.length)[0].split(/\s+/).slice(0, 8).join(' ');
const approveAll = async (m, input) => ({ content: { results: (input.sentences || []).map((x, i) => ({ i, label: 'feature', evidence: quoteOf(input.evidenceText) })) } });
const _generateCaption = orch.generateCaption;
orch.generateCaption = (draft, deps) => _generateCaption(draft, Object.assign({}, deps, {
  generateForModule: (m, input, ...r) => (m === 'facebook-claim-verifier' ? (deps.verifierFn || approveAll)(m, input) : deps.generateForModule(m, input, ...r))
}));

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; }
}
const research = {
  status: 'verified', matchedSku: 'TMA-2 DJ',
  sources: [
    { title: 'TMA-2 DJ', url: 'https://aiaiai.audio/headphones/tma-2-dj', type: 'official', claims: [
      'Modular DJ headphones with a 40mm driver and a coiled cable, built for tough club use.',
      'Add to cart — $199 free shipping', 'short', 'Max SPL 120dB at 1kHz with a detachable cable system for fast repairs.' ] },
    { title: 'Reseller', url: 'https://example.com/x', type: 'other', claims: ['Reseller says the headphones are made for monitoring in the booth and on the go.'] }
  ],
  warnings: ['Không có nguồn hãng chính thức'].slice(0, 0)
};
const draftOf = (extra) => ({ product: Object.assign({ name: 'Tai nghe AIAIAI TMA-2 DJ', brand: 'AIAIAI', model: 'TMA-2 DJ', productType: 'Tai nghe chụp tai DJ', specs: 'Driver diameter: 40mm · Max SPL: 120dB @ 1kHz', price: 5000000, condition: 'new' }, extra || {}), research });

(async () => {
  await test('brief có research verified: mang brand/model/specs/nguồn hãng, lọc dòng giá/giỏ hàng/quá ngắn', async () => {
    const b = orch.buildProductBrief(draftOf());
    assert.strictEqual(b.name, 'Tai nghe AIAIAI TMA-2 DJ');
    assert.strictEqual(b.brand, 'AIAIAI'); assert.strictEqual(b.model, 'TMA-2 DJ');
    assert(/40mm/.test(b.specs));
    assert(/xác minh bằng nguồn hãng/.test(b.verification));
    assert.strictEqual(b.referenceNotes.length, 3, JSON.stringify(b.referenceNotes));
    assert(b.referenceNotes[0].startsWith('[Nguồn hãng]'));
    assert(b.referenceNotes.every(n => !/cart|\$|short/i.test(n)));
  });
  await test('không có research → brief chỉ có tên (giữ hành vi cũ, không bịa)', async () => {
    const b = orch.buildProductBrief({ product: { name: 'Pioneer DDJ-400', brand: 'Pioneer', specs: 'x' }, research: { status: 'unconfigured', sources: [] } });
    assert.deepStrictEqual(b, { name: 'Pioneer DDJ-400' });
    assert.deepStrictEqual(orch.buildProductBrief({ product: { name: 'A' } }), { name: 'A' });
  });
  await test('model chỉ do Vision gợi ý được đánh dấu CHƯA XÁC MINH, không thành model', async () => {
    const b = orch.buildProductBrief(draftOf({ model: null, visionModel: 'TMA-2 Studio' }));
    assert(b.unverified.some(u => /TMA-2 Studio/.test(u)));
    assert(!b.model);
  });
  await test('prompt brief giàu: có specs + tài liệu tham khảo + mức xác minh, bỏ khuôn 3-5 câu & nameOnly', async () => {
    const b = orch.buildProductBrief(draftOf());
    const pr = mod.buildPrompt({ productBrief: b, singleVersion: true }, { product: {}, categories: [] });
    assert(/Driver diameter: 40mm/.test(pr) && /TÀI LIỆU THAM KHẢO/.test(pr) && /Nguồn hãng/.test(pr) && /đã xác minh bằng nguồn hãng/.test(pr));
    assert(!/Độ dài 3-5 câu/.test(pr) && /Bài đủ sâu/.test(pr) && /Bảng thông số kỹ thuật đầy đủ do HỆ THỐNG chèn/.test(pr) && /Khai thác HẾT/.test(pr));
    assert(!/Bài viết CHỈ được gồm/.test(pr));
    assert(/KHÔNG bịa thông số/.test(pr) && /không nhắc lại giá/i.test(pr));
  });
  await test('REGRESSION: brief chỉ có tên → prompt y như trước (nameOnly, 3-5 câu)', async () => {
    const pr = mod.buildPrompt({ productBrief: { name: 'Pioneer DDJ-400' }, singleVersion: true }, { product: {}, categories: [] });
    assert(/Độ dài 3-5 câu/.test(pr) && /Bài viết CHỈ được gồm/.test(pr) && /CHỈ có đúng thông tin này: Tên: Pioneer DDJ-400/.test(pr));
  });
  await test('generateCaption gửi brief giàu cho module, giữ giá/tình trạng do hệ thống chèn', async () => {
    let seen = null;
    const deps = { uid: 'u', email: 'e', generateForModule: async (m, input) => { seen = input; return { content: { versions: [{
      hook: 'Tai nghe AIAIAI TMA-2 DJ dùng driver 40mm cho DJ trong booth.',
      caption: 'Dây cáp rời giúp thay nhanh khi hỏng.\n\nMax SPL 120dB là thông số của sản phẩm.',
      cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['PshopMusic', 'AIAIAI'] }] } }; } };
    const out = await orch.generateCaption(draftOf(), deps);
    assert.strictEqual(out.source, 'ai');
    assert(seen.productBrief.referenceNotes.length === 3 && seen.productBrief.specs);
    assert(/Giá: 5\.000\.000đ/.test(out.caption) && /driver 40mm/.test(out.caption), out.caption);
  });
  await test('preview KHÔNG lộ metadata nội bộ (mức xác minh/phiên bản/nguồn/model gợi ý); thông tin đó nằm ở log quản trị', async () => {
    const d1 = Object.assign(draftOf(), { id: 'd1', pageId: '1', version: 2, aiCaption: 'Nội dung bài đăng.', notices: ['Vision gợi ý model X'] });
    const t1 = orch.buildPreviewText(d1);
    assert(!/Mức xác minh|ĐÃ XÁC MINH|Phiên bản|v2|Nguồn:|⚠️|Model|Thông số|Thương hiệu/.test(t1), t1);
    assert(t1.includes('Nội dung bài đăng.') && t1.includes('Sản phẩm: Tai nghe AIAIAI TMA-2 DJ'), t1);
    const t2 = orch.buildPreviewText({ product: { name: 'A', visionModel: 'Z-1' }, pageId: '1', aiCaption: 'x' });
    assert(!/CHƯA XÁC MINH|Model gợi ý|Z-1/.test(t2), t2);
    const info = orch.adminPreviewInfo(d1);
    assert(info.researchStatus === 'verified' && info.noticeCount === 1 && info.version === 2 && info.sourceCount === research.sources.length, JSON.stringify(info));
    assert(!JSON.stringify(info).includes('AIAIAI') && !JSON.stringify(info).includes('Vision'), 'log quản trị không chứa tên sản phẩm/nội dung');
  });
  // Bộ lọc claim so khớp từ Việt; nguồn research là tiếng Anh ⇒ từ khoá nguồn có thật phải cho phép từ Việt tương ứng.
  const capOf = async (draft, caption) => (await orch.generateCaption(draft, { uid: 'u', email: 'e', generateForModule: async () => ({ content: { versions: [{
    hook: 'Tai nghe AIAIAI TMA-2 DJ cho DJ.', caption, cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['PshopMusic'] }] } }) })).caption;
  const enResearch = { status: 'verified', sources: [{ title: 'x', url: 'https://aiaiai.audio/x', type: 'official', claims: [
    'Features a foldable design and a lightweight aluminum headband for portability.', 'Professional modular DJ headphones with a durable detachable cable.' ] }] };
  const enDraft = { product: { name: 'Tai nghe AIAIAI TMA-2 DJ', brand: 'AIAIAI', model: 'TMA-2 DJ', specs: 'Driver: 40mm' }, research: enResearch };
  await test('claim EN→VI: nguồn tiếng Anh có design/aluminum/professional/durable ⇒ câu tiếng Việt tương ứng được giữ', async () => {
    const c = await capOf(enDraft, 'Thiết kế gập gọn giúp dễ mang theo. Khung đầu bằng nhôm nhẹ. Cáp rời bền bỉ, dòng chuyên nghiệp cho DJ.');
    assert(/Thiết kế gập gọn/.test(c) && /nhôm nhẹ/.test(c) && /bền bỉ/.test(c) && /chuyên nghiệp/.test(c), c);
  });
  await test('claim EN→VI (âm tính): nguồn KHÔNG có aluminum/design ⇒ câu Việt tương ứng vẫn bị bỏ', async () => {
    const noClaim = { status: 'verified', sources: [{ title: 'x', url: 'https://aiaiai.audio/x', type: 'official', claims: ['Modular DJ headphones with a 40mm driver and a coiled cable.'] }] };
    const c = await capOf(Object.assign({}, enDraft, { research: noClaim }), 'Thiết kế gập gọn giúp dễ mang theo. Khung đầu bằng nhôm nhẹ. Driver 40mm cho DJ.');
    assert(!/Thiết kế/.test(c) && !/nhôm/.test(c) && /Driver 40mm/.test(c), c);
  });
  await test('địa điểm không nguồn bị loại khỏi caption cuối; giá/tình trạng/bảo hành và công dụng từ tên vẫn còn', async () => {
    // Có dữ kiện nguồn (brief KHÔNG chỉ-có-tên) thì Writer/lọc claim mới chạy; chỉ-có-tên thì không gọi AI (xem test pipeline).
    const rs0 = { status: 'partial', sources: [{ title: 'Chân loa Aura', url: 'https://example.com/aura', type: 'other', claims: ['Chân loa Aura dùng để đặt loa đúng vị trí và bố trí hệ thống gọn gàng.'] }] };
    const d = { product: { name: 'Chân loa Aura 1 2 3 4', price: 1800000, condition: 'new', badgeText: 'Chính hãng · BH 12 tháng' }, research: rs0 };
    const cap = (await orch.generateCaption(d, { uid: 'u', email: 'e', generateForModule: async () => ({ content: { versions: [{
      hook: 'Chân loa Aura 1 2 3 4 giúp đặt loa đúng vị trí.', caption: 'Mẫu này rất phù hợp cho việc bố trí loa trong không gian biểu diễn hoặc tại nhà.',
      cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['PshopMusic'] }] } }) })).caption;
    assert(!/biểu diễn|tại nhà/.test(cap), cap);
    assert(/đặt loa đúng vị trí/.test(cap) && !/bố trí loa/.test(cap), 'câu có địa điểm không nguồn phải bị loại cả câu, không viết lại: ' + cap);
    assert(/1\.800\.000/.test(cap) && /Tình trạng: Mới/.test(cap) && /BH 12 tháng/.test(cap), cap);
  });
  await test('đường đi đầy đủ generateCaption: câu có "2 kênh" nguồn xác nhận giữ nguyên; câu có claim không nguồn bị loại CẢ CÂU, không để mệnh đề cụt', async () => {
    const rs = { status: 'partial', sources: [{ title: 'DDJ-400', url: 'https://www.pioneerdj.com/en/product/dj-controllers/ddj-400', type: 'other', claims: [
      '2-channel DJ controller for rekordbox that lets you develop your skills on a club-style layout.', 'Plug and play with a built-in sound card and the provided USB cable for power.'] }] };
    const d = { product: { name: 'Pioneer DJ DDJ-400', price: 3500000, condition: 'new' }, research: rs };
    const run = async (caption) => (await orch.generateCaption(d, { uid: 'u', email: 'e', generateForModule: async () => ({ content: { versions: [{
      hook: 'Pioneer DJ DDJ-400 là controller DJ 2 kênh cho rekordbox.', caption, cta: 'Liên hệ Pshop Music.', hashtags: ['PshopMusic'] }] } }) })).caption;
    const kept = await run('Mẫu này là controller DJ 2 kênh, giúp người dùng làm quen và phát triển kỹ năng.');
    assert(/controller DJ 2 kênh/.test(kept) && !/(^|\n)Giúp /.test(kept), kept);
    const dropped = await run('Giá 8tr, giúp bạn làm quen với DJ. Có sound card tích hợp, cắm cáp USB kèm theo để cấp nguồn.');
    assert(/sound card tích hợp/.test(dropped), dropped);
    assert(!/8tr|làm quen với DJ/.test(dropped) && !/(^|\n)Giúp /.test(dropped), 'không được để mệnh đề cụt: ' + dropped);
    assert(/3\.500\.000/.test(dropped) && /Tình trạng: Mới/.test(dropped), 'giá/tình trạng do hệ thống chèn vẫn còn: ' + dropped);
  });
  // ═══ Content engine: Research → Writer → bài chi tiết ═══
  const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);
  const KRK = { status: 'verified', matchedSku: 'ROKIT 8 G4', verification: { verified: true, evidence: [] }, contentLevel: 'page', schema: 2,
    product: { name: 'ROKIT 8 G4', model: 'ROKIT 8 G4', description: 'The ROKIT 8 G4 is a powered studio monitor for tracking and mixing.' },
    specs: { 'Wattage': '203 Watts', 'Power Output': '203 Watts', 'Frequency Response': '36Hz - 40KHz', 'Max SPL': '111 dB', 'LF Driver': '8"', 'Height': '15.75" / 400 mm', 'Weight': '22.6 lb / 10.25 kg' },
    features: ['DSP-driven EQ: 25 EQ settings tune the monitor to your room.', 'Front-firing port: tight bass response.'], applications: ['Designed for studio tracking and mixing.'],
    sources: [{ title: 'ROKIT 8 Generation 4 | KRK', url: 'https://www.krkmusic.com/products/rokit-8-generation-4-powered-studio-monitor-white', type: 'official', claims: ['25 EQ settings tune the monitor to your room.', 'Front-firing port gives tight bass response.'] }], warnings: [] };
  const krkDraft = (r) => ({ product: { name: 'Loa kiểm âm KRK ROKIT 8 G4', price: 8500000, condition: 'new', description: KRK.product.description, features: KRK.features, applications: KRK.applications, specs: 'Wattage: 203 Watts · Frequency Response: 36Hz - 40KHz' }, research: r });
  const writer = (hook, caption) => ({ uid: 'u', email: 'e', generateForModule: async () => ({ content: { versions: [{ hook, caption, cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['PshopMusic', 'KRK'] }] } }) });
  await test('specSheet: research xác minh bằng nguồn HÃNG → bảng thông số Việt hoá nhãn, giá trị NGUYÊN VĂN, bỏ trùng (Wattage = Power Output), ghi rõ host', async () => {
    const t = orch.specSheet(KRK);
    assert(/^Thông số kỹ thuật \(theo krkmusic\.com\):/.test(t), t);
    assert(t.includes('• Công suất: 203 Watts') && t.includes('• Dải tần đáp ứng: 36Hz - 40KHz') && t.includes('• Mức SPL tối đa: 111 dB'), t);
    assert(t.includes('• Loa trầm (LF): 8"') && t.includes('• Chiều cao: 15.75" / 400 mm') && t.includes('• Trọng lượng: 22.6 lb / 10.25 kg'), t);
    eq(t.split('Công suất:').length - 1, 1, 'bỏ dòng công suất trùng');
    assert(t.indexOf('Công suất') < t.indexOf('Dải tần') && t.indexOf('Dải tần') < t.indexOf('Trọng lượng'), 'thứ tự ưu tiên thông số âm thanh trước');
  });
  await test('specSheet: KHÔNG in bảng khi research chỉ partial (không có nguồn hãng), rejected, unconfigured hoặc không có specs', async () => {
    eq(orch.specSheet(Object.assign({}, KRK, { status: 'partial' })), '');
    eq(orch.specSheet({ status: 'rejected', sources: [], warnings: ['x'] }), '');
    eq(orch.specSheet({ status: 'unconfigured' }), '');
    eq(orch.specSheet(Object.assign({}, KRK, { specs: {} })), '');
    eq(orch.specSheet(null), '');
  });
  await test('Research nhiều thông số + feature/benefit → bài có đoạn viết từ tính năng THẬT, bảng thông số đầy đủ, giá Founder nguyên vẹn, thứ tự: nội dung → thông số → giá → hashtag', async () => {
    const cap = (await orch.generateCaption(krkDraft(KRK), writer('KRK ROKIT 8 G4 là loa kiểm âm dùng cho ghi âm và phối nhạc.',
      'Bộ EQ điều khiển bằng DSP có 25 thiết lập giúp chỉnh loa theo phòng của bạn.\n\nCổng bass phía trước cho âm trầm chặt.\n\nCông suất 203W cùng dải tần 36Hz–40kHz phục vụ công việc phối nhạc.'))).caption;
    assert(/25 thiết lập/.test(cap) && /Cổng bass phía trước/.test(cap), 'đoạn tính năng: ' + cap);
    assert(/203W/.test(cap) && cap.includes('• Công suất: 203 Watts') && cap.includes('Thông số kỹ thuật (theo krkmusic.com):'), cap);
    assert(cap.includes('Giá: 8.500.000đ'), 'giá Founder: ' + cap);
    assert(cap.indexOf('25 thiết lập') < cap.indexOf('Thông số kỹ thuật') && cap.indexOf('Thông số kỹ thuật') < cap.indexOf('Giá:') && cap.indexOf('Giá:') < cap.indexOf('#PshopMusic'), cap);
    assert(cap.length > 500 && cap.split('\n\n').length >= 6, 'bài chi tiết, không chỉ vài câu: ' + cap.length);
  });
  await test('Thông số SỐ HỌC Writer tự bịa (500W, 120 dB, 12 inch) bị loại; thông số có trong nguồn được giữ', async () => {
    const cap = (await orch.generateCaption(krkDraft(KRK), writer('KRK ROKIT 8 G4 là loa kiểm âm.',
      'Công suất lên tới 500W cho phòng thu lớn.\n\nMức SPL 120 dB rất lớn.\n\nWoofer 12 inch.\n\nWoofer 8 inch là loa trầm của mẫu này.'))).caption;
    const bodyOnly = cap.split('Thông số kỹ thuật')[0];
    assert(!/500W|120 dB|12 inch/.test(bodyOnly), 'thông số bịa lọt qua: ' + bodyOnly);
    assert(/Woofer 8 inch/.test(bodyOnly), 'thông số có nguồn bị xoá nhầm: ' + bodyOnly);
  });
  await test('Research SAI model/generation (rejected) hoặc không có → bài chỉ có tên + giá + CTA; không bảng thông số, không dữ kiện của model khác', async () => {
    for (const r of [{ status: 'rejected', reason: 'no_matching_source', sources: [], warnings: ['x'] }, null]) {
      let called = 0;
      const d = { product: { name: 'Loa kiểm âm KRK Rokit Gen 2 màu xanh', price: 12000000 }, research: r };
      const cap = (await orch.generateCaption(d, { uid: 'u', email: 'e', generateForModule: async () => { called++; return { content: { versions: [{ hook: 'x', caption: 'Công suất 203W', cta: 'c', hashtags: [] }] } }; } })).caption;
      eq(called, 0); assert(!/Thông số kỹ thuật|203|Wattage|Công suất/.test(cap), cap);
      assert(cap.includes('Giá: 12.000.000đ') && /^Pshop Music giới thiệu Loa kiểm âm KRK Rokit Gen 2 màu xanh\./.test(cap), cap);
    }
  });
  await test('missingInfoNotes: nêu rõ phần chưa có dữ liệu (không có trong bài đăng)', async () => {
    const n1 = orch.missingInfoNotes({ product: { name: 'A', price: 1 }, research: { status: 'rejected' } }).join(' | ');
    assert(/Chưa tìm được nguồn khớp/.test(n1) && /Tình trạng sản phẩm/.test(n1), n1);
    const n2 = orch.missingInfoNotes({ product: { name: 'A', condition: 'new' }, research: Object.assign({}, KRK, { status: 'partial', specs: {} }) }).join(' | ');
    assert(/Chưa có trang chính thức/.test(n2) && /Nguồn chưa có thông số/.test(n2) && !/Tình trạng/.test(n2), n2);
    eq(orch.missingInfoNotes({ product: { name: 'A', condition: 'new' }, research: KRK }), []);
  });
  // ═══ Kiểm chứng từng câu (claim grounding) ═══
  const drep = (hook, caption) => writer(hook, caption);
  const verdict = (map) => async (m, input) => ({ content: { results: input.sentences.map((t, i) => {
    const rule = Object.keys(map).find(k => t.includes(k));
    const label = rule ? map[rule] : 'unsupported';
    return { i, label, evidence: label === 'unsupported' ? '' : quoteOf(input.evidenceText) };
  }) } });
  await test('quoteInEvidence: trích dẫn đúng nguồn qua; trích dẫn bịa/không có trong nguồn bị loại', async () => {
    const ev = new Set(['25', 'eq', 'settings', 'tune', 'the', 'monitor', 'your', 'room', 'front', 'firing', 'port', 'tight', 'bass', 'response']);
    assert(orch.quoteInEvidence('25 EQ settings tune the monitor to your room', ev));
    assert(!orch.quoteInEvidence('best in class wireless bluetooth streaming', ev));
    assert(!orch.quoteInEvidence('', ev) && !orch.quoteInEvidence('bass', ev), 'trích dẫn quá ngắn không hợp lệ');
  });
  await test('Verifier: câu "unsupported" bị loại CẢ CÂU và được đếm; câu feature/benefit/spec không có số vẫn được giữ', async () => {
    const d = krkDraft(KRK);
    const r = await orch.generateCaption(d, Object.assign(writer('KRK ROKIT 8 G4 là loa kiểm âm của KRK.',
      'Bộ EQ điều khiển bằng DSP giúp chỉnh loa theo phòng của bạn.\n\nĐây là loa vượt trội so với đối thủ cùng tầm giá.\n\nLoa có cổng bass ở mặt trước.'),
      { verifierFn: verdict({ 'loa kiểm âm': 'feature', 'Bộ EQ': 'feature', 'cổng bass': 'feature' }) }));
    assert(/Bộ EQ điều khiển/.test(r.caption) && /cổng bass ở mặt trước/.test(r.caption), 'câu hợp lệ không số bị loại oan: ' + r.caption);
    assert(!/vượt trội|đối thủ/.test(r.caption), 'claim không căn cứ lọt qua: ' + r.caption);
    eq(r.dropped, 1); eq(r.source, 'ai');
    assert(r.caption.includes('Giá: 8.500.000đ') && r.caption.includes('Thông số kỹ thuật (theo krkmusic.com):'));
  });
  await test('Verifier: nhãn hợp lệ nhưng TRÍCH DẪN không có trong nguồn ⇒ coi như unsupported (chống bịa dẫn chứng)', async () => {
    const fake = async (m, input) => ({ content: { results: input.sentences.map((t, i) => ({ i, label: 'feature', evidence: 'wireless bluetooth streaming with ten hour battery' })) } });
    const r = await orch.generateCaption(krkDraft(KRK), Object.assign(writer('KRK ROKIT 8 G4 là loa kiểm âm của KRK.', 'Loa có Bluetooth và pin 10 giờ.'), { verifierFn: fake }));
    assert(!/Bluetooth|pin 10/.test(r.caption), r.caption);
    assert(r.dropped >= 1);
  });
  await test('Verifier LỖI/không trả đúng định dạng ⇒ fail-closed: lời Writer KHÔNG vào bài; vẫn có tên, bảng thông số nguồn hãng, giá, CTA', async () => {
    for (const bad of [async () => { throw new Error('openai 429'); }, async () => ({ content: { results: null } })]) {
      const r = await orch.generateCaption(krkDraft(KRK), Object.assign(writer('KRK ROKIT 8 G4 là loa kiểm âm của KRK.', 'Loa có cổng bass ở mặt trước.'), { verifierFn: bad }));
      eq(r.source, 'verifier-unavailable'); assert(r.note);
      assert(!/cổng bass ở mặt trước/.test(r.caption), 'lời Writer chưa kiểm chứng lọt vào bài: ' + r.caption);
      assert(/^Pshop Music giới thiệu Loa kiểm âm KRK ROKIT 8 G4\./.test(r.caption) && r.caption.includes('• Công suất: 203 Watts') && r.caption.includes('Giá: 8.500.000đ'), r.caption);
    }
  });
  await test('Evidence gửi verifier CHỈ gồm dữ kiện của chính sản phẩm này (không lẫn dữ kiện model khác)', async () => {
    let seen = null;
    const spy = async (m, input) => { seen = input.evidenceText; return approveAll(m, input); };
    const other = Object.assign({}, KRK, { specs: { 'Wattage': '999 Watts' }, features: ['Bluetooth 9.0 streaming'] });
    const d = { product: { name: 'Loa kiểm âm KRK ROKIT 5 G4', price: 5000000, description: 'A powered monitor.', features: ['Front-firing port'] }, research: { status: 'partial', specs: {}, features: ['Front-firing port'], sources: [{ url: 'https://x.example/a', type: 'other', claims: ['Front-firing port gives tight bass response.'] }] } };
    await orch.generateCaption(d, Object.assign(writer('KRK ROKIT 5 G4 là loa kiểm âm.', 'Có cổng bass phía trước.'), { verifierFn: spy }));
    assert(seen && /Front-firing port/.test(seen) && !/999|Bluetooth 9\.0/.test(seen), 'evidence: ' + seen);
    void other;
  });
  await test('Tên sản phẩm KHÔNG lặp đầu bài: hook dùng tên bỏ tiền tố loại ("KRK ROKIT 8 G4") thì không chèn thêm dòng "Loa kiểm âm KRK ROKIT 8 G4"', async () => {
    const r = await orch.generateCaption(krkDraft(KRK), writer('KRK ROKIT 8 G4 là loa kiểm âm bi-amp của KRK.', 'Bộ EQ điều khiển bằng DSP giúp chỉnh loa theo phòng.'));
    const paras = r.caption.split('\n\n');
    assert(/^KRK ROKIT 8 G4 là loa kiểm âm/.test(paras[0]), 'đoạn đầu phải là hook, không phải dòng tên lặp: ' + paras[0]);
    eq(paras.slice(0, 2).join(' ').split('KRK ROKIT 8 G4').length - 1, 1, 'tên chỉ xuất hiện 1 lần ở phần mở đầu');
    // Hook không nêu tên ⇒ vẫn chèn tên đầy đủ đúng 1 lần
    const r2 = await orch.generateCaption(krkDraft(KRK), writer('Một chiếc loa monitor bi-amp.', 'Bộ EQ điều khiển bằng DSP giúp chỉnh loa theo phòng.'));
    assert(/^Loa kiểm âm KRK ROKIT 8 G4\n\n/.test(r2.caption), r2.caption);
  });
  await test('Verifier chỉ ra "unsupported_phrase" (tính từ/cụm thêm thắt trong câu có phần đúng) ⇒ loại cả câu', async () => {
    const strict = async (m, input) => ({ content: { results: input.sentences.map((t, i) => ({ i, label: 'feature', evidence: quoteOf(input.evidenceText),
      unsupported_phrase: /nổi tiếng/.test(t) ? 'nổi tiếng' : '' })) } });
    const r = await orch.generateCaption(krkDraft(KRK), Object.assign(writer('KRK ROKIT 8 G4 là loa kiểm âm bi-amp 8 inch của KRK.',
      'Đây là loa kiểm âm bi-amp 8 inch, thuộc dòng monitor nổi tiếng của KRK.\n\nCổng bass phía trước cho âm trầm chặt.'), { verifierFn: strict }));
    assert(!/nổi tiếng/.test(r.caption) && /Cổng bass phía trước/.test(r.caption) && /bi-amp 8 inch/.test(r.caption), r.caption);
    eq(r.dropped, 1);
  });
  await test('Tên không lặp liên tiếp: lần nhắc sau (kể cả dạng bỏ tiền tố loại) được đổi thành "mẫu này"; câu hợp lệ vẫn đủ nghĩa', async () => {
    const r = await orch.generateCaption(krkDraft(KRK), writer('Loa kiểm âm KRK ROKIT 8 G4 là loa kiểm âm bi-amp của KRK.',
      'KRK ROKIT 8 G4 có bộ EQ điều khiển bằng DSP. KRK ROKIT 8 G4 có cổng bass phía trước.'));
    const body = r.caption.split('Thông số kỹ thuật')[0];
    eq(body.split('KRK ROKIT 8 G4').length - 1, 1, 'tên chỉ xuất hiện 1 lần trong thân bài: ' + body);
    assert(/Mẫu này có bộ EQ/.test(body) || /mẫu này có bộ EQ/i.test(body), body);
  });
  await test('Alias "studio" ⇒ "phòng thu": loa "Studio Monitor" của hãng được phép nói dùng trong phòng thu; không có chữ studio trong nguồn thì vẫn bị loại', async () => {
    const withStudio = Object.assign({}, KRK, { product: Object.assign({}, KRK.product, { description: 'The ROKIT 8 G4 is a powered studio monitor.' }) });
    const d1 = krkDraft(withStudio); d1.product.description = withStudio.product.description;
    const r1 = await orch.generateCaption(d1, writer('KRK ROKIT 8 G4 là loa kiểm âm.', 'Loa dùng để phối nhạc trong phòng thu.'));
    assert(/phòng thu/.test(r1.caption), r1.caption);
    const d2 = krkDraft(KRK); d2.product.description = 'A powered monitor.'; d2.product.applications = []; d2.product.features = ['Front-firing port gives tight bass response.']; d2.research = Object.assign({}, KRK, { product: { name: 'x', description: 'A powered monitor.' }, sources: [{ title: 't', url: 'https://www.krkmusic.com/p', type: 'official', claims: ['Front-firing port gives tight bass response.'] }] });
    const r2 = await orch.generateCaption(d2, writer('KRK ROKIT 8 G4 là loa kiểm âm.', 'Loa dùng để phối nhạc trong phòng thu.'));
    assert(!/phòng thu/.test(r2.caption.split('Thông số kỹ thuật')[0]), r2.caption);
  });
  await test('(từ OpenAI thật) Đối tượng dùng ("người mới", "nghệ sĩ") chỉ được nói khi nguồn nêu (new DJs/artists); mệnh đề mất vị ngữ ("rất cho việc…") bị bỏ gọn', async () => {
    const ddj = (claims) => ({ product: { name: 'Pioneer DJ DDJ-400', price: 3500000, description: 'The Pioneer DJ DDJ-400 is a portable two-channel Rekordbox DJ controller' + claims },
      research: { status: 'partial', sources: [{ title: 'DDJ-400', url: 'https://x.example/ddj-400', type: 'other', claims: ['The Pioneer DJ DDJ-400 is a portable two-channel Rekordbox DJ controller' + claims + '.'] }] } });
    const hook = 'Pioneer DJ DDJ-400 là bộ điều khiển DJ hai kênh dành cho người mới bắt đầu, rất tiện lợi cho việc sử dụng Rekordbox DJ.';
    const ok = (await orch.generateCaption(ddj(' aimed at new DJs'), writer(hook, 'Loa mang lại sự sáng tạo cho các nghệ sĩ.'))).caption;
    // Câu có "tiện lợi" (không nguồn) bị loại CẢ CÂU, không cắt mệnh đề rồi ghép lại.
    assert(!/rất cho|rất tiện lợi|cho việc sử dụng|dành cho người mới/.test(ok), 'câu có claim không nguồn phải bị loại cả câu: ' + ok);
    const okClean = (await orch.generateCaption(ddj(' aimed at new DJs'), writer('Pioneer DJ DDJ-400 là bộ điều khiển DJ hai kênh dành cho người mới bắt đầu.', 'x'))).caption;
    assert(/dành cho người mới bắt đầu/.test(okClean), 'đối tượng CÓ nguồn bị loại oan: ' + okClean);
    assert(!/nghệ sĩ/.test(ok), 'đối tượng không có nguồn lọt qua: ' + ok);
    const no = (await orch.generateCaption(ddj(''), writer(hook, 'Hai kênh cho Rekordbox DJ.'))).caption;
    assert(!/người mới/.test(no), 'nguồn không nêu đối tượng thì không được nói: ' + no);
    const art = (await orch.generateCaption(ddj(' used by artists and producers'), writer('Pioneer DJ DDJ-400 dành cho nghệ sĩ và nhà sản xuất.', 'x'))).caption;
    assert(/nghệ sĩ và nhà sản xuất/.test(art), 'đối tượng có nguồn bị loại oan: ' + art);
  });
  await test('Module facebook-claim-verifier: prompt chứa evidence + câu đánh số + yêu cầu trích dẫn nguyên văn; mapToDraftContent parse đúng', async () => {
    const V = Core.MODULES['facebook-claim-verifier'];
    const pr = V.buildPrompt({ sentences: ['Câu A.', 'Câu B.'], evidenceText: 'EVIDENCE-XYZ 203 Watts' }, {});
    assert(pr.includes('EVIDENCE-XYZ 203 Watts') && pr.includes('0: Câu A.') && pr.includes('1: Câu B.') && /NGUYÊN VĂN/.test(pr) && /unsupported/.test(pr), pr.slice(0, 400));
    const out = V.mapToDraftContent({ text: '{"results":[{"i":0,"label":"SPEC","evidence":"203 Watts"},{"i":1,"label":"unsupported","evidence":""}]}' });
    eq(out.results.map(x => x.label), ['spec', 'unsupported']);
    eq(V.mapToDraftContent({ text: 'không phải json' }).results, null);
  });
  console.log('\nPASSED: ' + passed + '  FAILED: ' + failed);
  if (failed) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
})();
