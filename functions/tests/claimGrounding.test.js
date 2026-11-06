/*
 * tests/claimGrounding.test.js — Writer → Claim Validation → Preview: bài chi tiết, có căn cứ, không lời khen rỗng.
 * Chạy: node tests/claimGrounding.test.js (từ functions/). KHÔNG gọi OpenAI/Telegram/Facebook thật:
 * Writer và Verifier là stub mô phỏng; prompt, bộ lọc, đối chiếu trích dẫn, preview là MÃ THẬT.
 * "Verifier dễ dãi" mô phỏng gpt-4o-mini cho lọt câu khen rỗng (đã thấy thật trên Production-like run).
 */
'use strict';
const assert = require('assert');
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'firebase-admin') return { database: () => ({ ref: () => ({}) }), apps: [1], initializeApp() {} };
  return origLoad.apply(this, arguments);
};
const orch = require('../shared/contentOrchestrator');
const Core = require('../shared/aiModulesCore');

let passed = 0, failed = 0; const failures = [];
async function test(name, fn) {
  try { await fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; }
}
const eq = (a, b, m) => assert.deepStrictEqual(a, b, m);

// Research KRK ROKIT 8 G4 (nguồn hãng) — nhiều thông số + tính năng + công dụng.
const KRK = {
  status: 'verified', matchedSku: 'ROKIT 8 G4', schema: 2, contentLevel: 'page',
  product: { name: 'ROKIT 8 G4', model: 'ROKIT 8 G4', description: 'The ROKIT 8 G4 is a powered studio monitor for tracking and mixing.' },
  specs: { 'Wattage': '203 Watts', 'Frequency Response': '36Hz - 40KHz', 'Max SPL': '111 dB', 'LF Driver': '8"', 'Weight': '22.6 lb / 10.25 kg' },
  features: ['DSP-driven EQ: 25 EQ settings tune the monitor to your room.', 'Front-firing port: tight bass response.', 'Kevlar woofer with a soft-dome tweeter.'],
  applications: ['Designed for studio tracking and mixing.'],
  sources: [{ title: 'ROKIT 8 Generation 4 | KRK', url: 'https://www.krkmusic.com/products/rokit-8-generation-4', type: 'official', claims: [
    '25 EQ settings tune the monitor to your room.', 'Front-firing port gives tight bass response.', 'Designed for studio tracking and mixing.'] }],
  warnings: []
};
const krkDraft = (r) => ({ product: { name: 'Loa kiểm âm KRK ROKIT 8 G4', price: 8500000, condition: 'new', description: KRK.product.description,
  features: KRK.features, applications: KRK.applications, specs: 'Wattage: 203 Watts · Frequency Response: 36Hz - 40KHz' }, research: r });
// Research chỉ có mô tả + 1 tính năng, KHÔNG có lợi ích quảng cáo nào.
const SPARSE = { status: 'partial', schema: 2, specs: {}, features: ['Front-firing port.'], applications: [],
  sources: [{ title: 'Loa X', url: 'https://example.com/x', type: 'other', claims: ['Front-firing port on the front panel of the monitor speaker.'] }], warnings: [] };
const sparseDraft = () => ({ product: { name: 'Loa kiểm âm KRK ROKIT 8 G4', price: 8500000, features: ['Front-firing port.'] }, research: SPARSE });

const writerOf = (hook, caption, extra) => ({ uid: 'u', email: 'e', generateForModule: async () => ({ content: { versions: [{ hook, caption,
  cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['PshopMusic', 'KRK'] }] } }), verifierFn: extra && extra.verifierFn });
const wire = (deps) => Object.assign({}, deps, { generateForModule: (m, input, ...r) => m === 'facebook-claim-verifier'
  ? (deps.verifierFn || strictVerifier)(m, input) : deps.generateForModule(m, input, ...r) });
const gen = (draft, deps) => orch.generateCaption(draft, wire(deps));
const lines = (ev) => String(ev || '').split('\n').map(x => x.trim()).filter(Boolean);
const longest = (ev) => lines(ev).sort((a, b) => b.length - a.length)[0].split(/\s+/).slice(0, 8).join(' ');

// Verifier "dễ dãi" như gpt-4o-mini ngoài đời: gắn "benefit" cho mọi câu; trích dẫn là DÒNG TÊN (dòng đầu của evidence).
const lenientNameQuote = async (m, input) => ({ content: { results: input.sentences.map((t, i) => ({ i, label: 'benefit', evidence: lines(input.evidenceText)[0] + ' ' + lines(input.evidenceText)[1], unsupported_phrase: '' })) } });
// Dễ dãi kiểu "ghép từ rời": trích dẫn gồm từ có trong nguồn nhưng không phải đoạn trích thật của bất kỳ dòng nào.
const lenientScrambled = async (m, input) => ({ content: { results: input.sentences.map((t, i) => ({ i, label: 'feature', evidence: 'monitor your room tracking port bass settings mixing tune', unsupported_phrase: '' })) } });
// Verifier chuẩn: câu nào có từ khoá trong map thì cho qua kèm trích dẫn nguyên văn của đúng dòng nguồn.
const supportedBy = (map) => async (m, input) => ({ content: { results: input.sentences.map((t, i) => {
  const hit = Object.keys(map).find(k => t.toLowerCase().includes(k.toLowerCase()));
  if (!hit) return { i, label: 'unsupported', evidence: '', unsupported_phrase: '' };
  return { i, label: map[hit][0], evidence: map[hit][1], unsupported_phrase: '' };
}) } });
const strictVerifier = supportedBy({});

const PRAISE = ['mang đến sự đổi mới cho không gian sáng tạo âm nhạc', 'âm thanh đầy đủ và phong phú'];

(async () => {
  console.log('\n=== Claim validation: câu khen không căn cứ ===');
  await test('2 câu thật sự lọt từ gpt-4o-mini ("đổi mới…", "âm thanh đầy đủ và phong phú") bị loại dù verifier dễ dãi trích DÒNG TÊN làm bằng chứng', async () => {
    const r = await gen(krkDraft(KRK), writerOf('KRK ROKIT 8 G4 là loa kiểm âm của KRK.',
      'KRK ROKIT 8 G4 mang đến sự đổi mới cho không gian sáng tạo âm nhạc.\n\nLoa cho âm thanh đầy đủ và phong phú.\n\nBộ EQ có 25 thiết lập để chỉnh loa theo phòng.', { verifierFn: lenientNameQuote }));
    const body = r.caption.split('Thông số kỹ thuật')[0];
    assert(!/đổi mới|sáng tạo|phong phú|đầy đủ/.test(body), 'câu khen không căn cứ lọt qua: ' + body);
    assert(r.dropped >= 2, 'dropped=' + r.dropped);
  });
  await test('Verifier dễ dãi trích dẫn "ghép từ rời" (không phải đoạn trích thật của một dòng nguồn) ⇒ vẫn bị loại', async () => {
    const r = await gen(krkDraft(KRK), writerOf('KRK ROKIT 8 G4 là loa kiểm âm của KRK.', 'Loa mang lại âm thanh đầy đủ và phong phú cho mọi nhu cầu.', { verifierFn: lenientScrambled }));
    assert(!/phong phú|mọi nhu cầu/.test(r.caption), r.caption);
  });
  await test('Câu mô tả đúng tính năng KHÔNG có số, có trích dẫn nguyên văn thật ⇒ KHÔNG bị loại oan', async () => {
    const v = supportedBy({ 'loa kiểm âm': ['feature', 'The ROKIT 8 G4 is a powered studio monitor for tracking and mixing.'], 'cổng bass': ['feature', 'Front-firing port gives tight bass response.'], 'phối nhạc': ['feature', 'Designed for studio tracking and mixing.'] });
    const r = await gen(krkDraft(KRK), writerOf('KRK ROKIT 8 G4 là loa kiểm âm của KRK.',
      'Cổng bass phía trước giúp âm trầm chặt.\n\nLoa được thiết kế cho thu âm và phối nhạc tại phòng thu.', { verifierFn: v }));
    assert(/Cổng bass phía trước/.test(r.caption) && /phối nhạc/.test(r.caption), r.caption);
    eq(r.dropped, 0, 'không câu hợp lệ nào bị loại oan');
  });
  await test('Câu giới thiệu nêu lại TÊN sản phẩm không bị coi là "lặp ý" của hook chỉ vì trùng token tên (mất dữ kiện "chuẩn…")', async () => {
    const v = supportedBy({ 'công suất': ['spec', 'Wattage: 203 Watts'], 'loa kiểm âm': ['feature', 'The ROKIT 8 G4 is a powered studio monitor for tracking and mixing.'] });
    const r = await gen(krkDraft(KRK), writerOf('Loa kiểm âm KRK ROKIT 8 G4 có công suất 203W.',
      'Loa kiểm âm KRK ROKIT 8 G4 là loa kiểm âm của KRK.', { verifierFn: v }));
    assert(/là loa kiểm âm của KRK/.test(r.caption), r.caption);
  });
  await test('Câu có SỐ khớp nhưng kèm lời khen không căn cứ: verifier chỉ ra cụm thêm thắt ⇒ loại cả câu (số không cứu được câu)', async () => {
    const v = async (m, input) => ({ content: { results: input.sentences.map((t, i) => /đổi mới/.test(t)
      ? { i, label: 'spec', evidence: 'Wattage: 203 Watts', unsupported_phrase: 'đổi mới cho không gian sáng tạo' }
      : { i, label: /loa kiểm âm/.test(t) ? 'feature' : 'spec', evidence: /loa kiểm âm/.test(t) ? 'The ROKIT 8 G4 is a powered studio monitor for tracking and mixing.' : 'Wattage: 203 Watts', unsupported_phrase: '' }) } });
    const r = await gen(krkDraft(KRK), writerOf('KRK ROKIT 8 G4 là loa kiểm âm của KRK.', 'Công suất 203W mang đến sự đổi mới cho không gian sáng tạo âm nhạc.\n\nLoa có công suất 203W theo thông số của hãng.', { verifierFn: v }));
    assert(!/đổi mới/.test(r.caption) && /công suất 203W theo thông số/.test(r.caption), r.caption);
  });
  await test('Trích dẫn dòng TÊN chỉ chứng minh câu giới thiệu loại sản phẩm: nhãn feature giữ, nhãn benefit/spec bị loại', async () => {
    const mk = (label) => async (m, input) => ({ content: { results: input.sentences.map((t, i) => ({ i, label, evidence: lines(input.evidenceText)[0], unsupported_phrase: '' })) } });
    const evText = orch.evidenceTextFor(krkDraft(KRK), orch.buildProductBrief(krkDraft(KRK)));
    const ident = 'Loa kiểm âm KRK ROKIT 8 G4';
    const keep = await orch.verifyBody('Loa kiểm âm KRK ROKIT 8 G4 là loa kiểm âm.', evText, { generateForModule: mk('feature') }, 1000, ident);
    const drop = await orch.verifyBody('Loa kiểm âm KRK ROKIT 8 G4 là loa kiểm âm.', evText, { generateForModule: mk('benefit') }, 1000, ident);
    assert(keep.body && keep.dropped === 0, JSON.stringify(keep)); eq(drop.dropped, 1);
  });
  await test('quoteLineMatch: khớp có THỨ TỰ trong MỘT dòng; túi-từ rải khắp nguồn không qua', async () => {
    const L = orch.buildEvidenceLines('25 EQ settings tune the monitor to your room\nFront-firing port gives tight bass response', '');
    assert(orch.quoteLineMatch('25 EQ settings tune the monitor to your room', L));
    assert(orch.quoteLineMatch('Front-firing port gives tight bass', L));
    assert(!orch.quoteLineMatch('room tune settings port bass monitor', L), 'ghép từ rời phải bị loại');
    assert(!orch.quoteLineMatch('bass', L), 'quá ngắn');
  });

  console.log('\n=== Writer khai thác Research ===');
  await test('Research đầy đủ → prompt Writer chứa MỌI tính năng/công dụng/thông số đã xác minh và yêu cầu khai thác hết, không khen thêm', async () => {
    const mod = Core.MODULES['facebook-post-generator'];
    const pr = mod.buildPrompt({ productBrief: orch.buildProductBrief(krkDraft(KRK)), singleVersion: true }, { product: {}, categories: [] });
    for (const k of ['25 EQ settings', 'Front-firing port', 'Kevlar woofer', 'studio tracking and mixing', '203 Watts']) assert(pr.includes(k), 'prompt thiếu dữ kiện: ' + k);
    assert(/Khai thác HẾT/.test(pr) && /tuyệt đối không tự nhận xét vocal/.test(pr) && /trọn vẹn chủ ngữ/.test(pr) && /BỎ HẲN phần đó/.test(pr));
  });
  await test('Research nhiều thông số + tính năng → bài giữ ĐỦ các đoạn có căn cứ (mô tả riêng, từng tính năng, công dụng), dài hơn bài từ research thưa', async () => {
    const v = supportedBy({
      'loa kiểm âm': ['feature', 'The ROKIT 8 G4 is a powered studio monitor for tracking and mixing.'],
      'EQ': ['feature', '25 EQ settings tune the monitor to your room.'],
      'cổng bass': ['feature', 'Front-firing port gives tight bass response.'],
      'Kevlar': ['feature', 'Kevlar woofer with a soft-dome tweeter.'],
      'phối nhạc': ['feature', 'Designed for studio tracking and mixing.']
    });
    const rich = (await gen(krkDraft(KRK), writerOf('KRK ROKIT 8 G4 là loa kiểm âm có nguồn điện riêng, dùng cho thu âm và phối nhạc.',
      'Bộ EQ điều khiển bằng DSP có 25 thiết lập để chỉnh loa theo phòng của bạn.\n\nCổng bass phía trước cho âm trầm chặt.\n\nLoa dùng củ woofer Kevlar kết hợp tweeter dạng dome mềm.\n\nLoa được thiết kế cho thu âm và phối nhạc.', { verifierFn: v }))).caption;
    for (const k of ['25 thiết lập', 'Cổng bass phía trước', 'woofer Kevlar', 'phối nhạc']) assert(rich.includes(k), 'mất đoạn có căn cứ: ' + k + '\n' + rich);
    assert(rich.includes('• Công suất: 203 Watts') && rich.includes('Giá: 8.500.000đ'), rich);
    const sparse = (await gen(sparseDraft(), writerOf('KRK ROKIT 8 G4 có cổng bass phía trước.', 'Cổng bass nằm ở mặt trước của loa.',
      { verifierFn: supportedBy({ 'ổng bass': ['feature', 'Front-firing port on the front panel of the monitor speaker.'] }) }))).caption;
    assert(rich.length > sparse.length * 1.5, 'bài giàu dữ liệu phải dài hơn rõ rệt: ' + rich.length + ' vs ' + sparse.length);
    assert(!/Thông số kỹ thuật/.test(sparse), 'research thưa không được có bảng thông số bịa');
  });
  await test('Research KHÔNG có lợi ích quảng cáo → câu khen/lợi ích thêm vào bị loại, bài chỉ còn mô tả tính năng thật', async () => {
    const r = await gen(sparseDraft(), writerOf('KRK ROKIT 8 G4 có cổng bass phía trước.',
      'Cổng bass nằm ở mặt trước của loa.\n\nNhờ vậy loa mang lại trải nghiệm nghe sống động và đáng tin cậy.\n\nĐây là lựa chọn chuyên nghiệp cho mọi nhà sản xuất.',
      { verifierFn: supportedBy({ 'ổng bass nằm': ['feature', 'Front-firing port on the front panel of the monitor speaker.'] }) }));
    assert(/Cổng bass nằm ở mặt trước/.test(r.caption), r.caption);
    assert(!/sống động|đáng tin cậy|chuyên nghiệp|nhà sản xuất/.test(r.caption), 'lời khen tự thêm lọt qua: ' + r.caption);
    assert(r.dropped >= 1, 'dropped=' + r.dropped);
  });
  await test('Tên sản phẩm không lặp: thân bài chỉ chứa tên đầy đủ đúng 1 lần; lần nhắc sau đổi thành "mẫu này"', async () => {
    const v = supportedBy({ 'loa kiểm âm': ['feature', 'The ROKIT 8 G4 is a powered studio monitor for tracking and mixing.'], 'cổng bass': ['feature', 'Front-firing port gives tight bass response.'] });
    const r = await gen(krkDraft(KRK), writerOf('Loa kiểm âm KRK ROKIT 8 G4 là loa kiểm âm có nguồn điện riêng.',
      'Loa kiểm âm KRK ROKIT 8 G4 có cổng bass phía trước.\n\nLoa kiểm âm KRK ROKIT 8 G4 dùng cho thu âm và phối nhạc.', { verifierFn: v }));
    const body = r.caption.split('Thông số kỹ thuật')[0];
    eq((body.match(/KRK ROKIT 8 G4/g) || []).length <= 1, true, 'tên lặp: ' + body);
  });

  console.log('\n=== Model không xác định (KRK Rokit Gen 2) ===');
  await test('Research bị từ chối (Gen 2 không khớp nguồn nào): brief chỉ có tên; không gọi Writer; không Rokit 5/6/8 G2, không thông số G4', async () => {
    const rejected = { status: 'rejected', reason: 'no_matching_source', sources: [], warnings: ['Không nguồn nào khớp đúng model.'], specs: { Wattage: '203 Watts' }, features: ['Front-firing port'] };
    let writerCalls = 0;
    const d = { product: { name: 'Loa kiểm âm KRK Rokit Gen 2 màu xanh', price: 12000000 }, research: rejected };
    eq(orch.buildProductBrief(d), { name: 'Loa kiểm âm KRK Rokit Gen 2 màu xanh' });
    const out = await orch.generateCaption(d, { uid: 'u', email: 'e', generateForModule: async () => { writerCalls++; return { content: { versions: [{ hook: 'Rokit 8 G2 công suất 203W', caption: 'x', cta: 'c', hashtags: [] }] } }; } });
    eq(writerCalls, 0); eq(out.source, 'name-only');
    assert(!/Rokit [568] G2|203|G4|Thông số kỹ thuật/i.test(out.caption), out.caption);
    assert(out.caption.includes('KRK Rokit Gen 2'), out.caption);
  });
  await test('Preview nêu RÕ phần chưa xác minh cho model không xác định; vẫn giữ tên Founder nguyên văn và giá', async () => {
    const rejected = { status: 'rejected', reason: 'no_matching_source', sources: [], warnings: [] };
    const d = { product: { name: 'Loa kiểm âm KRK Rokit Gen 2 màu xanh', price: 12000000 }, research: rejected, pageId: '1',
      aiCaption: 'Pshop Music giới thiệu Loa kiểm âm KRK Rokit Gen 2 màu xanh.\n\nGiá: 12.000.000đ' };
    const t = orch.buildPreviewText(d);
    assert(/Chưa tìm được nguồn khớp đúng sản phẩm/.test(t) && /Tên chưa nêu rõ model\/cỡ cụ thể/.test(t), t);
    assert(t.includes('Loa kiểm âm KRK Rokit Gen 2 màu xanh') && t.includes('Giá: 12.000.000đ'));
  });
  await test('Evidence gửi verifier không chứa dữ kiện của research bị từ chối (model/thế hệ khác)', async () => {
    const seen = [];
    const spy = async (m, input) => { seen.push(input.evidenceText); return strictVerifier(m, input); };
    const rejected = { status: 'rejected', sources: [], specs: { Wattage: '203 Watts' }, features: ['Front-firing port'] };
    await gen({ product: { name: 'Loa kiểm âm KRK Rokit Gen 2', price: 1 }, research: rejected }, writerOf('x', 'y', { verifierFn: spy }));
    eq(seen.length, 0, 'không có dữ kiện nguồn ⇒ không có lượt kiểm chứng thừa');
  });

  console.log('\n=== Lợi ích phải do nguồn nêu trực tiếp ===');
  const PORT_ONLY = { status: 'partial', schema: 2, specs: {}, features: ['Front-firing port.'], applications: [],
    sources: [{ title: 'Loa X', url: 'https://example.com/x', type: 'other', claims: ['Front-firing port on the front panel of the monitor speaker.'] }], warnings: [] };
  const portDraft = (r) => ({ product: { name: 'Loa kiểm âm KRK ROKIT 8 G4', price: 8500000, features: ['Front-firing port.'] }, research: r });
  const benefitVerifier = (benefit_quote) => async (m, input) => ({ content: { results: input.sentences.map((t, i) => /âm trầm chặt/.test(t)
    ? { i, label: 'benefit', evidence: 'Front-firing port on the front panel of the monitor speaker.', benefit_quote, unsupported_phrase: '' }
    : { i, label: 'feature', evidence: /loa kiểm âm/i.test(t) ? 'Loa kiểm âm KRK ROKIT 8 G4' : 'Front-firing port on the front panel of the monitor speaker.', benefit_quote: '', unsupported_phrase: '' }) } });
  await test('"Cổng bass phía trước cho âm trầm chặt" khi nguồn chỉ nêu "Front-firing port": benefit không có/giả benefit_quote ⇒ bị loại; câu chỉ mô tả tính năng vẫn giữ', async () => {
    for (const bq of ['', 'tight bass response']) {
      const r = await gen(portDraft(PORT_ONLY), writerOf('KRK ROKIT 8 G4 là loa kiểm âm của KRK.', 'Loa có cổng bass ở mặt trước.\n\nCổng bass phía trước cho âm trầm chặt.', { verifierFn: benefitVerifier(bq) }));
      assert(!/âm trầm chặt/.test(r.caption), 'lợi ích không có trong nguồn lọt qua (benefit_quote="' + bq + '"): ' + r.caption);
      assert(/cổng bass ở mặt trước/.test(r.caption), 'câu mô tả tính năng bị loại oan: ' + r.caption);
    }
  });
  await test('Nguồn NÊU kết quả ("gives tight bass response") + benefit_quote nguyên văn trong nguồn ⇒ lợi ích được giữ', async () => {
    const SRC = Object.assign({}, PORT_ONLY, { sources: [{ title: 'ROKIT', url: 'https://www.krkmusic.com/p', type: 'official', claims: ['Front-firing port gives tight bass response.'] }], features: ['Front-firing port gives tight bass response.'] });
    const v = async (m, input) => ({ content: { results: input.sentences.map((t, i) => /âm trầm chặt/.test(t)
      ? { i, label: 'benefit', evidence: 'Front-firing port gives tight bass response.', benefit_quote: 'gives tight bass response', unsupported_phrase: '' }
      : { i, label: 'feature', evidence: 'Loa kiểm âm KRK ROKIT 8 G4', benefit_quote: '', unsupported_phrase: '' }) } });
    const r = await gen(portDraft(SRC), writerOf('KRK ROKIT 8 G4 là loa kiểm âm của KRK.', 'Cổng bass phía trước cho âm trầm chặt.', { verifierFn: v }));
    assert(/Cổng bass phía trước cho âm trầm chặt/.test(r.caption), r.caption);
  });

  console.log('\n=== Không có câu bị ghép/viết lại (tính toàn vẹn) ===');
  await test('Luồng Telegram không viết lại câu: "được thiết kế để thu âm" KHÔNG biến thành "giúp thu âm"; câu có claim không nguồn bị loại cả câu', async () => {
    const allowed = 'loa kiểm âm krk rokit 8 g4 powered studio monitor for tracking and mixing';
    const withRepair = Core.sanitizeFacebookText('Loa được thiết kế để thu âm.', allowed);
    const noRepair = Core.sanitizeFacebookText('Loa được thiết kế để thu âm.', allowed, { noRepair: true });
    assert(/giúp thu âm/.test(withRepair), 'luồng CMS cũ phải giữ hành vi cũ: ' + withRepair);
    eq(noRepair, '');
  });
  await test('Bất biến toàn vẹn (2000 tổ hợp câu ngẫu nhiên có seed): mọi từ trong bài cuối đều có trong lời Writer/tên sản phẩm — không từ nào do bộ lọc tự sinh/ghép', async () => {
    const frag = ['loa kiểm âm', 'có nguồn điện riêng', 'dùng cho thu âm và phối nhạc', 'có thiết kế cho thu âm', 'được thiết kế để thu âm', 'phù hợp với phòng thu',
      'trong phòng thu', 'tại nhà', 'cho âm trầm chặt', 'cho âm thanh chính xác', 'rất phù hợp cho việc thu âm', 'giúp chỉnh loa theo phòng của bạn',
      'có cổng bass phía trước', 'ổn định', 'chuyên nghiệp', 'KRK ROKIT 8 G4'];
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const words = (s) => String(s).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const approve = async (m, input) => ({ content: { results: input.sentences.map((t, i) => ({ i, label: 'feature', evidence: longest(input.evidenceText), benefit_quote: '', unsupported_phrase: '' })) } });
    const bad = [];
    for (let n = 0; n < 2000; n++) {
      const k = 2 + Math.floor(rnd() * 3); const parts = [];
      for (let i = 0; i < k; i++) parts.push(frag[Math.floor(rnd() * frag.length)]);
      const text = parts.join(rnd() < 0.5 ? ' ' : ', ') + '.';
      const r = await gen(krkDraft(KRK), writerOf(text, text, { verifierFn: approve }));
      const body = r.caption.split('Thông số kỹ thuật')[0];
      const ok = new Set(words(text + ' Loa kiểm âm KRK ROKIT 8 G4 mẫu này Pshop Music Liên hệ để được tư vấn thêm Giá Tình trạng Mới PshopMusic KRK ThietBiAmThanh'));
      const extra = words(body).filter(w => !ok.has(w));
      if (extra.length) bad.push(JSON.stringify(text) + ' => ' + extra.join(',') + ' | ' + JSON.stringify(body));
    }
    assert(!bad.length, bad.length + ' ca có từ lạ, vd: ' + bad.slice(0, 3).join(' | '));
  });
  await test('Giá Founder không bị đổi: Writer nêu giá/BH/tình trạng khác ⇒ bị bỏ cả câu; chỉ còn giá thật do hệ thống chèn', async () => {
    const r = await gen(krkDraft(KRK), writerOf('KRK ROKIT 8 G4 là loa kiểm âm của KRK.', 'Giá chỉ 5.000.000đ, bảo hành 24 tháng.\n\nLoa có cổng bass ở mặt trước.', { verifierFn: supportedBy({ 'loa kiểm âm': ['feature', 'The ROKIT 8 G4 is a powered studio monitor for tracking and mixing.'], 'cổng bass': ['feature', 'Front-firing port gives tight bass response.'] }) }));
    assert(!/5\.000\.000|24 tháng/.test(r.caption) && r.caption.includes('Giá: 8.500.000đ'), r.caption);
  });

  console.log('\n=== Content style V2: bài đủ sâu, có căn cứ, không bịa chất âm ===');
  // Fixture TEST (không phải dữ liệu thật của hãng): tai nghe DJ có đủ thiết kế / cấu tạo / thông số / công dụng.
  const HP = { status: 'verified', matchedSku: 'H9', schema: 2, contentLevel: 'page',
    product: { name: 'Acme H9', model: 'H9', description: 'The Acme H9 is a closed-back DJ headphone with a foldable design.' },
    specs: { 'Driver': '50 mm', 'Impedance': '32 ohms', 'Weight': '280 g', 'Cable': '1.2 m detachable' },
    features: ['Foldable design: the ear cups fold flat for transport.', 'Detachable cable: swap the cable if it gets damaged.', 'Swivel ear cups: one ear monitoring while mixing.', 'Memory foam ear pads with a padded headband.'],
    applications: ['Designed for DJing, practice and music production.'],
    sources: [{ title: 'Acme H9', url: 'https://www.acme-audio.com/h9', type: 'official', claims: [
      'The Acme H9 is a closed-back DJ headphone with a foldable design.', 'The ear cups fold flat for transport.', 'Swap the cable if it gets damaged.', 'Swivel ear cups for one ear monitoring while mixing.',
      'Memory foam ear pads with a padded headband.', 'Designed for DJing, practice and music production.'] }], warnings: [] };
  const hpDraft = (r) => ({ product: { name: 'Tai nghe DJ Acme H9', price: 4500000, condition: 'new', description: HP.product.description, features: HP.features, applications: HP.applications, specs: 'Driver: 50 mm · Impedance: 32 ohms' }, research: r || HP });
  const HP_LINES = {
    'tai nghe': 'The Acme H9 is a closed-back DJ headphone with a foldable design.', 'gập': 'The ear cups fold flat for transport.', 'cáp': 'Swap the cable if it gets damaged.',
    'xoay': 'Swivel ear cups for one ear monitoring while mixing.', 'mút': 'Memory foam ear pads with a padded headband.', 'dj': 'Designed for DJing, practice and music production.' };
  const hpVerifier = async (m, input) => ({ content: { results: input.sentences.map((t, i) => {
    const k = Object.keys(HP_LINES).find(x => t.toLowerCase().includes(x));
    return k ? { i, label: 'feature', evidence: HP_LINES[k], benefit_quote: '', unsupported_phrase: '' } : { i, label: 'unsupported', evidence: '', benefit_quote: '', unsupported_phrase: '' };
  }) } });
  const HP_WRITER = ['Anh em chơi DJ hoặc làm nhạc đang tìm một chiếc tai nghe đóng kín: Acme H9 là tai nghe DJ chụp kín với thiết kế gập được.',
    'Hai bên chụp tai gập phẳng khi cần mang đi.', 'Dây cáp tháo rời được nên có thể thay khi dây bị hỏng.', 'Chụp tai xoay được để nghe một bên tai khi đang mix.',
    'Đệm tai bằng mút nhớ cùng phần headband có đệm.', 'Tai nghe được thiết kế cho chơi DJ, luyện tập và sản xuất âm nhạc.'];
  await test('Research nhiều đặc điểm → Writer nhận ĐỦ (mọi tính năng/công dụng/thông số) và dataDepth = đủ; prompt có cấu trúc bài theo phần, không giới hạn 2-3 thông số', async () => {
    const brief = orch.buildProductBrief(hpDraft());
    assert(/đủ để viết bài/.test(brief.dataDepth), brief.dataDepth);
    const pr = Core.MODULES['facebook-post-generator'].buildPrompt({ productBrief: brief, singleVersion: true }, { product: {}, categories: [] });
    for (const k of ['Foldable design', 'Detachable cable', 'Swivel ear cups', 'Memory foam', 'DJing, practice', 'Driver: 50 mm', 'Mức dữ liệu: đủ']) assert(pr.includes(k), 'prompt thiếu: ' + k);
    assert(/\(a\) mở bài/.test(pr) && /\(f\) ai nên cân nhắc/.test(pr) && /BỎ HẲN phần đó/.test(pr) && !/2-3 thông số quan trọng nhất/.test(pr) && !/3-6 tính năng/.test(pr));
  });
  await test('Bài chi tiết: Writer viết 6 ý có nguồn ⇒ cả 6 giữ lại, bài > 350 ký tự và KHÔNG chỉ là bảng thông số', async () => {
    const r = await gen(hpDraft(), writerOf(HP_WRITER[0], HP_WRITER.slice(1).join('\n\n'), { verifierFn: hpVerifier }));
    const body = r.caption.split('Thông số kỹ thuật')[0];
    for (const k of ['gập phẳng', 'tháo rời', 'xoay được', 'mút nhớ', 'luyện tập']) assert(body.includes(k), 'mất ý có nguồn: ' + k + '\n' + body);
    assert(body.length > 350 && body.split('\n\n').length >= 5, 'phần mô tả quá ngắn/không chia đoạn: ' + body.length);
    assert(r.caption.includes('• ') && r.caption.includes('Giá: 4.500.000đ'), r.caption);
    eq(r.dropped, 0);
  });
  await test('Lặp ý để kéo dài: cùng một đặc điểm viết lại nhiều lần ⇒ chỉ còn một', async () => {
    const r = await gen(hpDraft(), writerOf(HP_WRITER[0], [HP_WRITER[1], 'Hai bên chụp tai có thể gập phẳng khi cần mang đi.', 'Chụp tai gập phẳng khi cần mang đi, rất tiện.', HP_WRITER[3]].join('\n\n'), { verifierFn: hpVerifier }));
    eq((r.caption.match(/gập phẳng/g) || []).length, 1, r.caption);
    assert(/xoay được/.test(r.caption));
  });
  await test('Tự thêm nhận xét chất âm (vocal ấm, bass sâu, độ chi tiết) bị loại cả khi verifier dễ dãi; nhận xét có trong dữ liệu Founder (tiếng Việt) thì được giữ', async () => {
    const lenient = async (m, input) => ({ content: { results: input.sentences.map((t, i) => ({ i, label: 'feature', evidence: HP_LINES['tai nghe'], benefit_quote: '', unsupported_phrase: '' })) } });
    const bad = await gen(hpDraft(), writerOf(HP_WRITER[0], 'Vocal ấm, bass sâu và độ chi tiết cao cho tai nghe này.\n\n' + HP_WRITER[1], { verifierFn: lenient }));
    assert(!/vocal|bass sâu|độ chi tiết/i.test(bad.caption), 'nhận xét chất âm tự thêm lọt qua: ' + bad.caption);
    const withSrc = hpDraft(); withSrc.product = Object.assign({}, withSrc.product, { description: 'Tai nghe DJ chụp kín. Vocal ấm, bass sâu theo mô tả của hãng.' });
    const ok = await gen(withSrc, writerOf(HP_WRITER[0], 'Mô tả của hãng nêu vocal ấm, bass sâu.', { verifierFn: lenient }));
    assert(/vocal ấm, bass sâu/.test(ok.caption), 'nhận xét có nguồn bị loại oan: ' + ok.caption);
  });
  await test('Thông số kỹ thuật sai (64 mm, 80 ohms) KHÔNG qua validation dù verifier dễ dãi; thông số đúng (50 mm, 32 ohms) qua', async () => {
    const lenient = async (m, input) => ({ content: { results: input.sentences.map((t, i) => ({ i, label: 'spec', evidence: 'Driver 50 mm Impedance 32 ohms Weight 280 g', benefit_quote: '', unsupported_phrase: '' })) } });
    const r = await gen(hpDraft(), writerOf(HP_WRITER[0], 'Driver 64 mm cho tai nghe này.\n\nTrở kháng 80 ohms.\n\nDriver 50 mm và trở kháng 32 ohms.', { verifierFn: lenient }));
    const body = r.caption.split('Thông số kỹ thuật')[0];
    assert(!/64 mm|80 ohms/.test(body) && /50 mm/.test(body), body);
  });
  await test('Research THIẾU dữ liệu (chỉ 1 dòng nguồn): dataDepth = mỏng, Writer được dặn viết ngắn, Preview ghi "Dữ liệu nguồn còn mỏng"; không có bảng thông số', async () => {
    const THIN = { status: 'partial', schema: 2, specs: {}, features: [], applications: [], sources: [{ title: 'Acme H9', url: 'https://example.com/h9', type: 'other', claims: ['The Acme H9 is a closed-back DJ headphone with a foldable design.'] }], warnings: [] };
    const d = hpDraft(THIN); d.product = { name: 'Tai nghe DJ Acme H9', price: 4500000 };
    const brief = orch.buildProductBrief(d);
    assert(/mỏng/.test(brief.dataDepth), brief.dataDepth);
    const pr = Core.MODULES['facebook-post-generator'].buildPrompt({ productBrief: brief, singleVersion: true }, { product: {}, categories: [] });
    assert(/Mức dữ liệu: mỏng/.test(pr) && /viết NGẮN đúng phần có căn cứ/.test(pr));
    const r = await gen(d, writerOf('Acme H9 là tai nghe DJ chụp kín với thiết kế gập được.', 'Đây là bản đánh giá chuyên sâu: chất âm vocal ấm, bass sâu, đeo êm cả ngày cho mọi DJ.', { verifierFn: hpVerifier }));
    assert(!/vocal|bass|đeo êm|mọi DJ|đánh giá chuyên sâu/.test(r.caption) && !/Thông số kỹ thuật/.test(r.caption), r.caption);
    const t = orch.buildPreviewText(Object.assign({}, d, { aiCaption: r.caption, pageId: '1' }));
    assert(/Dữ liệu nguồn còn mỏng/.test(t), t);
  });
  await test('Research không khớp model (rejected) nhưng mang thông số model khác ⇒ Writer không được gọi, không thông số lạ trong bài', async () => {
    let called = 0;
    const d = hpDraft({ status: 'rejected', reason: 'no_matching_source', sources: [], specs: HP.specs, features: HP.features });
    const out = await orch.generateCaption(d, { uid: 'u', email: 'e', generateForModule: async () => { called++; return { content: {} }; } });
    eq(called, 0); assert(!/50 mm|32 ohms|gập|xoay/.test(out.caption), out.caption);
  });

  console.log('\n=== Preview & Publisher giữ nguyên nội dung ===');
  await test('Preview chứa ĐỦ aiCaption (bài dài + bảng thông số) và splitForTelegram ghép lại không mất ký tự', async () => {
    const v = supportedBy({ 'EQ': ['feature', '25 EQ settings tune the monitor to your room.'] });
    const caption = (await gen(krkDraft(KRK), writerOf('KRK ROKIT 8 G4 là loa kiểm âm của KRK.', 'Bộ EQ điều khiển bằng DSP có 25 thiết lập giúp chỉnh loa theo phòng.', { verifierFn: v }))).caption;
    const long = caption + '\n\n' + Array.from({ length: 120 }, (_, i) => 'Đoạn bổ sung số ' + i + ' để kiểm tra chia tin dài.').join('\n\n');
    const t = orch.buildPreviewText({ product: { name: 'Loa KRK', price: 1 }, aiCaption: long, pageId: '1', research: KRK });
    assert(t.includes(long), 'preview mất nội dung');
    const parts = orch.splitForTelegram(t, 3800);
    assert(parts.length >= 2 && parts.every(p => p.length <= 3800), 'chia tin lỗi');
    const a = parts.join('\n\n').replace(/\s+/g, ' '), b = t.replace(/\s+/g, ' ');
    let k = 0; while (k < a.length && a[k] === b[k]) k++;
    assert(a === b, 'lệch tại ' + k + ' (a=' + a.length + ', b=' + b.length + '): ' + JSON.stringify(a.slice(Math.max(0, k - 30), k + 30)) + ' vs ' + JSON.stringify(b.slice(Math.max(0, k - 30), k + 30)));
  });

  console.log('\n=== Module verifier (prompt) ===');
  await test('Prompt verifier nêu nguyên tắc đối chiếu: nguồn là bằng chứng duy nhất, số không cứu câu khen, câu mô tả đúng không số vẫn hợp lệ', async () => {
    const pr = Core.MODULES['facebook-claim-verifier'].buildPrompt({ sentences: ['Câu A.'], evidenceText: 'EV' }, {});
    assert(/NGUYÊN TẮC ĐỐI CHIẾU/.test(pr) && /KHÔNG chứa số/.test(pr) && /không cứu được phần khen/.test(pr) && /đổi mới/.test(pr) && /phong phú/.test(pr));
  });

  console.log('\nPASSED: ' + passed + '  FAILED: ' + failed);
  if (failed) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
})();
