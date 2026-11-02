/*
 * tests/facebookCopyQuality.test.js — chất lượng NỘI DUNG BÀI ĐĂNG FACEBOOK do AI tạo.
 *
 * Chạy: node tests/facebookCopyQuality.test.js   (từ thư mục functions/)
 *
 * Không gọi OpenAI/Firebase: test prompt + sanitizer + mapToDraftContent của
 * shared/aiModulesCore.js bằng dữ liệu mẫu. Prompt thật được kiểm bằng chuỗi bắt buộc;
 * đầu ra mẫu được kiểm bằng văn bản giả lập có Markdown/câu sáo rỗng.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0; const failures = [];
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); passed++; }
  catch (e) { console.log('  ✗ ' + name + '\n    -> ' + e.message); failures.push(name); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

const Core = require('../shared/aiModulesCore');
const mod = Core.MODULES['facebook-post-generator'];

const SAMPLE = { name: 'Chân loa Aura 1 2 3 4' };
const SAMPLE_PRICE = '1.800.000đ';
const SAMPLE_CONDITION = 'Mới 100%';

console.log('\n=== Prompt Facebook Post ===');
test('prompt dùng đúng tên sản phẩm mẫu và có đủ ràng buộc chống bịa/Markdown', () => {
  const prompt = mod.buildPrompt({ productBrief: SAMPLE }, { product: {}, categories: [] });
  assert(prompt.includes(SAMPLE.name), 'thiếu tên sản phẩm');
  assert(/Pshop Music/.test(prompt), 'thiếu ngữ cảnh Pshop Music');
  assert(/KHÔNG bịa/.test(prompt), 'thiếu cấm bịa');
  assert(/không Markdown/i.test(prompt), 'thiếu cấm Markdown');
  assert(/Bạn đang tìm kiếm|Hãy để|Đỉnh cao/.test(prompt), 'thiếu ví dụ câu sáo rỗng bị cấm');
  assert(/Giá và tình trạng sẽ do hệ thống chèn/.test(prompt), 'thiếu quy tắc giá/tình trạng do hệ thống chèn');
  assert(/3-5 tag/.test(prompt), 'thiếu quy tắc hashtag');
  assert(/Chỉ dùng MỘT lời mời liên hệ/.test(prompt), 'thiếu quy tắc một CTA');
  assert(!/nhấn mạnh cảm xúc/.test(prompt), 'prompt cũ khuyến khích văn cảm xúc sáo rỗng');
  assert(!/tạo cảm giác khan hiếm\/khuyến mãi/.test(prompt), 'prompt cũ khuyến khích khan hiếm giả');
  assert(/KHÔNG tạo khan hiếm giả/.test(prompt), 'thiếu cấm khan hiếm giả');
});

test('prompt yêu cầu giọng tư vấn tự nhiên, giải thích thông số, CTA đa dạng, 3 góc khác thật', () => {
  const prompt = mod.buildPrompt({}, { product: { name: 'KRK ROKIT 8 G4', specs: '203W, 8 inch', description: 'Monitor nearfield cho phòng thu.' }, categories: [] });
  assert(/3 PHIÊN BẢN KHÁC NHAU THỰC SỰ/.test(prompt), 'thiếu yêu cầu 3 góc khác thật');
  assert(/giải thích ngắn thông số/.test(prompt), 'thiếu yêu cầu giải thích thông số');
  assert(/tối đa 2-3 thông số/.test(prompt), 'thiếu giới hạn thông số');
  assert(/không lặp tên sản phẩm quá một lần/.test(prompt), 'thiếu quy tắc không lặp tên');
  assert(/CTA ngắn, tự nhiên/.test(prompt), 'thiếu quy tắc CTA tự nhiên');
  assert(/KHÔNG nhắc lại giá/.test(prompt), 'thiếu quy tắc không nhắc lại giá');
  assert(/KHÔNG lặp nguyên câu\/đoạn/.test(prompt), 'thiếu quy tắc chống lặp giữa các bản');
  assert(/KHÔNG thêm tính từ chất âm/.test(prompt), 'thiếu quy tắc cấm tính từ chất âm không nguồn');
  assert(/9b\./.test(prompt) && /PHẢI nêu ít nhất một thông số/.test(prompt), 'thiếu quy tắc bắt buộc dùng specs verified');
  assert(/Câu đầu PHẢI chứa tên đầy đủ/.test(prompt), 'thiếu quy tắc câu đầu có tên sản phẩm');
  assert(/KHÔNG viết lời mời liên hệ\/trải nghiệm\/ghé shop/.test(prompt), 'thiếu cấm CTA trong hook/caption');
  assert(/lợi ích gắn với thông số/.test(prompt), 'thiếu yêu cầu lợi ích gắn với spec');
  assert(/9c\./.test(prompt) && /nghe nhạc với âm lượng tối đa/.test(prompt), 'thiếu cấm biến Max SPL thành lời khuyên âm lượng');
});
test('singleVersion: prompt Telegram chỉ yêu cầu đúng 1 phiên bản, không bắt model chia 3 góc', () => {
  const prompt = mod.buildPrompt({ productBrief: SAMPLE, singleVersion: true }, { product: {}, categories: [] });
  assert(/Viết ĐÚNG 1 PHIÊN BẢN/.test(prompt), 'thiếu yêu cầu 1 phiên bản');
  assert(!/ĐÚNG 3 PHIÊN BẢN/.test(prompt), 'vẫn còn yêu cầu 3 phiên bản');
  assert(/1 phiên bản duy nhất/i.test(prompt), prompt.slice(0, 300));
});
test('tên chỉ có thương hiệu/model → prompt cấm suy đoán công dụng/tính năng', () => {
  eq(Core.hasProductTypeHint('Chân loa Aura 1 2 3 4'), true);
  eq(Core.hasProductTypeHint('Pioneer DDJ-400'), false);
  const prompt = mod.buildPrompt({ productBrief: { name: 'Pioneer DDJ-400' }, singleVersion: true }, { product: {}, categories: [] });
  assert(/LƯU Ý ĐẶC BIỆT: Tên sản phẩm KHÔNG nêu rõ loại thiết bị/.test(prompt), 'thiếu cảnh báo tên không rõ loại');
  assert(/CHỈ được gồm: \(1\) một dòng tên sản phẩm/.test(prompt), 'thiếu ràng buộc chỉ tên + CTA');
  assert(/KHÔNG mô tả công dụng, tính năng, thiết kế/.test(prompt), 'thiếu cấm mô tả');
});
test('prompt nêu đúng giá/tình trạng khi có dữ liệu sản phẩm (luồng CMS/product)', () => {
  const prompt = mod.buildPrompt({}, { product: { name: 'Loa KRK Rokit 8', price: 8500000, condition: 'Like new 95%' }, categories: [] });
  assert(prompt.includes('Loa KRK Rokit 8') && prompt.includes('8500000') && prompt.includes('Like new 95%'), prompt.slice(0, 400));
});
test('catalog product tên chỉ có brand/model nhưng có category/description/specs → KHÔNG bị ép name-only, prompt dùng đủ dữ liệu', () => {
  const p = {
    name: 'NATIVE INSTRUMENTS KOMPLETE AUDIO 6 MK2', brand: 'NI', category: 'soundcard', categoryLabel: 'Soundcard',
    specs: 'NI · 6in/6out · 24bit/192kHz · 2 Headphone Out · MIDI I/O',
    description: 'Audio interface USB-C 6 vào 6 ra cho phòng thu home studio, hỗ trợ MIDI và hai cổng tai nghe.',
    status: 'New', badgeText: 'Chính hãng · BH 12th', price: 4590000
  };
  const prompt = mod.buildPrompt({}, { product: p, categories: [] });
  assert(!/LƯU Ý ĐẶC BIỆT: Tên sản phẩm KHÔNG nêu rõ loại/.test(prompt), 'bị ép name-only dù có catalog data');
  assert(prompt.includes('Audio interface USB-C 6 vào 6 ra'), 'thiếu description');
  assert(prompt.includes('24bit/192kHz'), 'thiếu specs');
  assert(prompt.includes('Chính hãng · BH 12th'), 'thiếu badge/warranty');
  assert(prompt.includes('Tình trạng: New'), 'thiếu status làm tình trạng');
  assert(prompt.includes('4590000'), 'thiếu price');
});
test('hasProductTypeHint nhận đúng các loại phổ biến, không phụ thuộc brand/model', () => {
  eq(Core.hasProductTypeHint('BỘ THU PHÁT BLUETOOTH 5.0 TX/RX 2-IN-1'), true);
  eq(Core.hasProductTypeHint('ĐỆM THAY THẾ SENNHEISER HD25'), true);
  eq(Core.hasProductTypeHint('MÚT CÁCH ÂM 3D'), true);
  eq(Core.hasProductTypeHint('LEXAR JUMPDRIVE P30 128GB – USB 3.2'), true);
  eq(Core.hasProductTypeHint('Pioneer DDJ-400'), false);
});

console.log('\n=== Sanitizer văn bản Facebook ===');
test('bỏ heading/bold/bullet/code/URL, giữ nội dung cụ thể và bỏ câu sáo rỗng', () => {
  const dirty = '# Tiêu đề\n\n**Chân loa Aura**\n\nBạn đang tìm kiếm giải pháp hoàn hảo?\n- Ý một\n- Ý hai\nXem thêm tại https://fake.example\nĐỉnh cao trải nghiệm cùng Aura.\n`code`';
  const clean = Core.sanitizeFacebookText(dirty);
  assert(!/^\s*#{1,6}\s+/m.test(clean), 'còn heading: ' + clean);
  assert(!/\*\*|`/.test(clean), 'còn bold/code: ' + clean);
  assert(!/^\s*[-*+•]\s+/m.test(clean), 'còn bullet: ' + clean);
  assert(!/Bạn đang tìm kiếm|Đỉnh cao/.test(clean), 'còn câu sáo rỗng: ' + clean);
  assert(!/https?:\/\//.test(clean), 'còn URL: ' + clean);
  assert(/Chân loa Aura/.test(clean) && /Ý một/.test(clean) && /Ý hai/.test(clean), 'mất nội dung cụ thể: ' + clean);
});

test('bỏ claim thiết kế/ổn định không có trong dữ kiện; giữ câu công dụng cụ thể; giữ claim nếu dữ liệu có', () => {
  const clean = Core.sanitizeFacebookText(
    'Chân loa Aura giúp đặt loa đúng vị trí.\n\nThiết kế chắc chắn mang lại sự ổn định cho loa.',
    'Chân loa Aura Mới 100%'
  );
  assert(/đặt loa đúng vị trí/.test(clean), clean);
  assert(!/Thiết kế chắc chắn|sự ổn định/.test(clean), clean);
  const keep = Core.sanitizeFacebookText('Sản phẩm có chống rung.', 'Sản phẩm chống rung');
  assert(/chống rung/.test(keep), 'claim có trong dữ liệu bị bỏ nhầm: ' + keep);
});
test('câu có thông tin cụ thể mở bằng "Khám phá/Mang đến/Với thiết kế" KHÔNG bị xoá nhầm', () => {
  const src = 'KRK 25 preset EQ vỏ kim loại chắc chắn thiết kế';
  const a = Core.sanitizeFacebookText('Khám phá 25 preset EQ của KRK để chỉnh âm theo phòng.', src);
  assert(/Khám phá 25 preset EQ/.test(a), a);
  const b = Core.sanitizeFacebookText('Mang đến 25 preset EQ và vỏ kim loại chắc chắn.', src);
  assert(/Mang đến 25 preset EQ/.test(b), b);
  const c = Core.sanitizeFacebookText('Với thiết kế vỏ kim loại, sản phẩm phù hợp phòng thu.', src);
  assert(/Với thiết kế vỏ kim loại/.test(c), c);
});
test('câu khen chung "cần thiết/chắc chắn/lựa chọn thiết thực" bị bỏ khi không có trong dữ kiện; giữ nếu nguồn có', () => {
  const clean = Core.sanitizeFacebookText('Giá đỡ micro Pro là sản phẩm cần thiết. Giúp cố định microphone chắc chắn. Đây là lựa chọn thiết thực.', 'Giá đỡ micro Pro Mới 100%');
  assert(!/cần thiết|chắc chắn|lựa chọn thiết thực/i.test(clean), clean);
  const keep = Core.sanitizeFacebookText('Vỏ kim loại chắc chắn.', 'Vỏ kim loại chắc chắn');
  assert(/chắc chắn/.test(keep), 'claim có trong nguồn bị bỏ nhầm: ' + keep);
  const adj = Core.sanitizeFacebookText('Bạn có thể điều chỉnh vị trí loa.', 'Chân loa Aura Mới 100%');
  assert(!/điều chỉnh/.test(adj), 'claim điều chỉnh không có nguồn chưa bị bỏ: ' + adj);
});
test('câu trộn claim + dữ kiện: bỏ modifier, GIỮ dữ kiện nguồn; không để câu cụt', () => {
  const a = Core.sanitizeFacebookText('Thiết kế vỏ kim loại giúp bảo vệ máy.', 'Vỏ kim loại giúp bảo vệ máy');
  assert(/vỏ kim loại giúp bảo vệ máy/i.test(a) && !/thiết kế/i.test(a), a);
  const b = Core.sanitizeFacebookText('Vỏ kim loại chắc chắn.', 'Vỏ kim loại');
  assert(/^Vỏ kim loại\.$/i.test(b), b);
  const b2 = Core.sanitizeFacebookText('Chân loa Aura 1 2 3 4 được thiết kế để đặt loa đúng vị trí.', 'Chân loa Aura 1 2 3 4');
  assert(/giúp đặt loa/.test(b2) && !/được để|thiết kế/.test(b2), 'câu sai ngữ pháp: ' + b2);
  eq(Core.sanitizeFacebookText('Chân loa Aura 1 2 3 4 là giải pháp tuyệt vời để đặt loa đúng vị trí.', 'Chân loa Aura 1 2 3 4'), '');
  const g = Core.sanitizeFacebookText('Tương thích hoàn toàn với CDJ/XDJ, sản phẩm này lý tưởng cho DJ.', 'Tương thích hoàn toàn với CDJ/XDJ');
  assert(/Tương thích hoàn toàn/.test(g), 'mất dữ kiện tương thích: ' + g);
  assert(!/lý tưởng/.test(g), 'còn claim: ' + g);
  const e = Core.sanitizeFacebookText('Sản phẩm giúp cố định micro một cách chắc chắn, mang lại sự thuận tiện.', 'Giá đỡ micro Pro');
  assert(!/một cách|chắc chắn/.test(e), 'còn cụm cụt: ' + e);
  assert(/cố định micro/.test(e), 'mất dữ kiện hợp lệ: ' + e);
  // Catalogue description vẫn vào postText cuối.
  const out = mod.mapToDraftContent({ text: JSON.stringify({ versions: [{
    hook: '', caption: 'Thiết kế vỏ kim loại giúp bảo vệ máy.', cta: 'Liên hệ Pshop Music.', hashtags: ['#X']
  }] }) }, {}, { product: { name: 'Sản phẩm A', description: 'Vỏ kim loại giúp bảo vệ máy.' }, categories: [] });
  assert(/vỏ kim loại giúp bảo vệ máy/i.test(out.versions[0].postText), out.versions[0].postText);
});
test('C: "tùy chỉnh" được thay bằng "tinh chỉnh" trong nguồn, GIỮ DSP/EQ', () => {
  const c = Core.sanitizeFacebookText(
    'DSP tích hợp 25 preset EQ và màn hình LCD giúp bạn tùy chỉnh theo không gian phòng.',
    'DSP tích hợp 25 preset EQ và màn hình LCD giúp tinh chỉnh âm thanh theo phòng'
  );
  assert(/DSP/.test(c) && /25 preset EQ/.test(c) && /màn hình LCD/.test(c), c);
  assert(!/tùy chỉnh/.test(c), c);
  const bass = Core.sanitizeFacebookText('Cổng bass phía trước giúp bass chặt, chính xác hơn.', 'Cổng bass phía trước giúp bass chặt và chính xác');
  assert(/chính xác/.test(bass), bass);
  assert(!/chính xác hơn|chặt, hơn/.test(bass), 'câu cụt: ' + bass);
});
test('D: giá không làm mất thông số kỹ thuật trong cùng câu', () => {
  const d = Core.stripFactClaims('Giá 1.200.000đ, tốc độ đọc 450MB/s.');
  assert(/450MB\/s/.test(d), d);
  assert(!/Giá 1.200.000/.test(d), d);
  const compat = Core.sanitizeFacebookText(
    'Tương thích với Pioneer CDJ/XDJ, Rekordbox, Serato và Engine OS.',
    'tương thích hoàn toàn với Pioneer CDJ/XDJ, Rekordbox, Serato và Engine OS'
  );
  assert(/Pioneer CDJ\/XDJ/.test(compat) && /Serato/.test(compat) && /Engine OS/.test(compat), compat);
});
test('E: "giữ micro" hữu ích được giữ, chỉ bỏ "ổn định"', () => {
  const e = Core.sanitizeFacebookText('Sản phẩm này dùng để giữ micro một cách ổn định, giúp người dùng tập trung.', 'Giá đỡ micro Pro');
  assert(/giữ micro/.test(e), e);
  assert(!/ổn định|một cách/.test(e), e);
  assert(!/là cho|và\s*[.!?]?$/.test(e), 'câu cụt: ' + e);
  const e2 = Core.sanitizeFacebookText('Sản phẩm này hỗ trợ việc giữ micro vững chắc, phù hợp cho các nhạc công và DJ. Giá đỡ micro Pro là sự hỗ trợ thiết yếu.', 'Giá đỡ micro Pro');
  assert(/giữ micro\.\s+Giá đỡ micro Pro/.test(e2), 'thiếu ranh giới câu: ' + e2);
  assert(!/vững chắc|phù hợp cho các/.test(e2), e2);
  const e3 = Core.sanitizeFacebookText('Giá đỡ micro Pro mang lại sự chắc chắn và tiện lợi cho các buổi biểu diễn.', 'Giá đỡ micro Pro');
  eq(e3, '', 'không được để lại "sự và": ' + e3);
  const e4 = Core.sanitizeFacebookText('Sản phẩm này giúp giữ micro ở vị trí cần thiết, hỗ trợ bạn trong các buổi biểu diễn.', 'Giá đỡ micro Pro');
  assert(/giữ micro/.test(e4), e4);
  assert(!/cần thiết/.test(e4), e4);
  const e5 = Core.sanitizeFacebookText('Sản phẩm này là giải pháp hoàn hảo để giữ micro trong các buổi biểu diễn.', 'Giá đỡ micro Pro');
  assert(/giúp giữ micro/.test(e5), e5);
  assert(!/giải pháp|hoàn hảo/.test(e5), e5);
});
test('câu cụt bắt đầu bằng động từ không chủ ngữ bị bỏ', () => {
  eq(Core.sanitizeFacebookText('Giúp micro luôn ở vị trí mong muốn.', 'Giá đỡ micro Pro'), '');
  eq(Core.sanitizeFacebookText('Hỗ trợ micro ở vị trí mong muốn.', 'Giá đỡ micro Pro'), '');
  eq(Core.sanitizeFacebookText('Thiết kế chắc chắn giúp cố định micro ở vị trí mong muốn.', 'Giá đỡ micro Pro'), '');
  eq(Core.sanitizeFacebookText('Trong một buổi thu âm.', 'Loa 203W'), '');
  assert(/Mang đến 25 preset EQ/.test(Core.sanitizeFacebookText('Mang đến 25 preset EQ và vỏ kim loại.', '25 preset EQ vỏ kim loại')), 'câu cụ thể mở bằng Mang đến không được xoá');
});
test('claim "kiểm soát âm thanh" không có nguồn bị bỏ/không lọt vào caption', () => {
  const out = Core.sanitizeFacebookText('Mẫu tai nghe có driver 40mm giúp kiểm soát âm thanh trong set dài.', 'Tai nghe TMA-2 DJ có driver 40mm');
  assert(!/kiểm soát âm thanh/i.test(out), out);
});
test('Max SPL không bị biến thành lời khuyên nghe âm lượng tối đa', () => {
  const out = Core.sanitizeFacebookText('Mẫu tai nghe có driver 40mm, nghe nhạc với âm lượng tối đa 120dB.', 'Tai nghe TMA-2 DJ có driver 40mm, Max SPL 120dB @ 1kHz');
  assert(!/âm lượng tối đa|nghe nhạc với âm lượng/i.test(out), out);
});
test('claim thăng bằng/mất thăng bằng không có nguồn bị bỏ', () => {
  eq(Core.sanitizeFacebookText('Giữ loa không lo mất thăng bằng.', 'Chân loa Aura'), '');
});
test('claim hiệu suất/tận dụng tối đa không có nguồn bị bỏ', () => {
  eq(Core.sanitizeFacebookText('Sử dụng đúng cách sẽ giúp tận dụng tối đa hiệu suất.', 'Chân loa Aura'), '');
});
test('claim "mọi thể loại/mọi phong cách/nổi bật" không có nguồn bị bỏ', () => {
  eq(Core.sanitizeFacebookText('Hỗ trợ cho mọi thể loại nhạc và mọi phong cách biểu diễn.', 'Giá đỡ micro Pro'), '');
  eq(Core.sanitizeFacebookText('Tốc độ đọc nổi bật.', 'USB 450MB/s'), '');
});
test('claim hài lòng/đắc lực/tiện lợi không có nguồn bị bỏ', () => {
  eq(Core.sanitizeFacebookText('Sản phẩm sẽ làm bạn hài lòng.', 'Sản phẩm'), '');
  eq(Core.sanitizeFacebookText('Đây là công cụ đắc lực.', 'USB 128GB'), '');
  eq(Core.sanitizeFacebookText('Sản phẩm rất tiện lợi.', 'Sản phẩm'), '');
  eq(Core.sanitizeFacebookText('Sản phẩm là lựa chọn hữu ích.', 'Sản phẩm'), '');
});
test('polish sửa "và hơn" thành "hơn"', () => {
  eq(Core.polishFacebookText('Bố trí loa gọn gàng và hơn trong không gian.'), 'Bố trí loa gọn gàng hơn trong không gian.');
});
test('polish bỏ đuôi "cho DJ." rỗng nghĩa', () => {
  eq(Core.polishFacebookText('Dung lượng 128GB cho phép chứa hàng nghìn bài nhạc, cho DJ.'), 'Dung lượng 128GB cho phép chứa hàng nghìn bài nhạc.');
});
test('claim rõ nét/hiệu quả không có nguồn bị bỏ', () => {
  eq(Core.sanitizeFacebookText('Âm thanh rõ nét.', 'Loa 203W'), '');
  eq(Core.sanitizeFacebookText('Làm việc hiệu quả hơn.', 'USB 128GB'), '');
});
test('sửa "tối ưu không gian"/"âm thanh chính xác và chặt chẽ" theo nguồn, không để claim', () => {
  const a = Core.sanitizeFacebookText('Tối ưu không gian phòng thu với KRK ROKIT 8 G4.', 'KRK ROKIT 8 G4 phòng thu');
  assert(!/tối ưu/i.test(a), a);
  const b = Core.sanitizeFacebookText('Cổng bass phía trước cho âm thanh chính xác và chặt chẽ.', 'Cổng bass phía trước cho bass chặt, chính xác');
  assert(/âm bass chặt và chính xác/.test(b), b);
  assert(!/âm thanh và chặt chẽ/.test(b), b);
});
test('claim chất lượng/hàng đầu/trải nghiệm âm thanh không có nguồn bị bỏ', () => {
  eq(Core.sanitizeFacebookText('Sự lựa chọn hàng đầu.', 'Loa 203W'), '');
  eq(Core.sanitizeFacebookText('Mang đến trải nghiệm âm thanh.', 'Loa 203W'), '');
  eq(Core.sanitizeFacebookText('Phù hợp cho mọi không gian.', 'Loa 203W'), '');
});
test('claim chiều cao/cân bằng âm thanh không có nguồn bị bỏ', () => {
  eq(Core.sanitizeFacebookText('Đặt loa đúng chiều cao, tạo sự cân bằng trong âm thanh.', 'Chân loa Aura'), '');
});
test('claim "đang có/còn hàng" khi không có nguồn bị bỏ', () => {
  eq(Core.sanitizeFacebookText('Pioneer DDJ-400 đang có tại Pshop Music.', 'Pioneer DDJ-400'), '');
  eq(Core.sanitizeFacebookText('Sản phẩm còn hàng.', 'Pioneer DDJ-400'), '');
});
test('claim "chất lượng cao/tối ưu hóa/mạnh mẽ" không có nguồn bị bỏ', () => {
  eq(Core.sanitizeFacebookText('Sản phẩm chất lượng cao.', 'Sản phẩm'), '');
  eq(Core.sanitizeFacebookText('Sản phẩm tối ưu hóa âm thanh.', 'Sản phẩm'), '');
  eq(Core.sanitizeFacebookText('Công suất mạnh mẽ.', 'Công suất 203W'), '');
  eq(Core.sanitizeFacebookText('Loa giúp bạn nghe rõ từng chi tiết.', 'Loa 203W'), '');
  eq(Core.sanitizeFacebookText('Âm thanh sống động.', 'Loa 203W'), '');
  eq(Core.sanitizeFacebookText('Loa mang lại hiệu suất cao.', 'Loa 203W'), '');
});
test('CTA hợp lệ có chữ "tính năng"/"tình trạng" không bị claim guard xoá nhầm', () => {
  const a = Core.sanitizeFacebookText('Liên hệ Pshop Music để được tư vấn về tính năng sản phẩm.', 'Chân loa Aura');
  assert(/Liên hệ Pshop Music/.test(a) && /tính năng/.test(a), a);
  const b = Core.stripFactClaims('Liên hệ Pshop Music để được tư vấn về tình trạng sản phẩm.');
  assert(/Liên hệ Pshop Music/.test(b) && /tình trạng/.test(b), b);
});
test('ensureProductName chèn đúng tên khi model gọi "sản phẩm này/giá đỡ này"', () => {
  eq(Core.ensureProductName('Giá đỡ này là lựa chọn thích hợp.', 'Giá đỡ micro Pro'), 'Giá đỡ micro Pro\n\nGiá đỡ này là lựa chọn thích hợp.');
  eq(Core.ensureProductName('Giá đỡ micro Pro giúp đặt micro.', 'Giá đỡ micro Pro'), 'Giá đỡ micro Pro giúp đặt micro.');
  const body = 'KRK ROKIT 8 G4 – loa kiểm âm 8 inch với công suất 203W.';
  eq(Core.ensureProductName(body, 'KRK ROKIT 8 G4 – LOA KIỂM ÂM 1 CÁI'), body);
});
test('polishFacebookText dọn "Với, …"/"cùng …", viết hoa và sửa câu cụt D/C', () => {
  eq(Core.polishFacebookText('Sản phẩm tốt. cùng thiết kế vỏ kim loại.'), 'Sản phẩm tốt. Cùng thiết kế vỏ kim loại.');
  eq(Core.polishFacebookText('Sản phẩm tốt. Với, giá đỡ micro Pro đảm bảo.'), 'Sản phẩm tốt. Giá đỡ micro Pro đảm bảo.');
  eq(Core.polishFacebookText('Mẫu loa này mang đến âm bass.'), 'Mẫu loa này mang đến âm bass chặt và chính xác.');
  eq(Core.polishFacebookText('Kim loại và nắp trượt bảo vệ đầu kết nối.'), 'Vỏ kim loại và nắp trượt bảo vệ đầu kết nối.');
  eq(Core.polishFacebookText('Dung lượng 128GB, không lo hết chỗ.'), 'Dung lượng 128GB, đủ chỗ cho nhu cầu lưu trữ.');
  eq(Core.polishFacebookText('Khi bạn cần chuyển nhạc cho buổi biểu diễn. Tốc độ 450MB/s giúp tiết kiệm thời gian.'), 'Khi bạn cần chuyển nhạc cho buổi biểu diễn, tốc độ 450MB/s giúp tiết kiệm thời gian.');
  eq(Core.polishFacebookText('LEXAR P30 – USB 3.2 cực kỳ tiện lợi'), 'LEXAR P30 – USB 3.2');
  eq(Core.polishFacebookText('LEXAR P30 – USB 3.2 an toàn và hiệu quả'), 'LEXAR P30 – USB 3.2 bảo mật');
  eq(Core.polishFacebookText('Nắp trượt bảo vệ đầu kết nối giúp sản phẩm luôn.'), 'Nắp trượt bảo vệ đầu kết nối.');
  eq(Core.polishFacebookText('Mẫu loa này giúp tái tạo âm thanh.'), 'Mẫu loa này cho âm thanh trung thực.');
});
test('câu mô tả lặp giữa các phiên bản bị loại khỏi bản sau', () => {
  const out = mod.mapToDraftContent({ text: JSON.stringify({ versions: [
    { hook: 'A', caption: 'Câu một. Câu chung.', cta: 'Liên hệ Pshop Music.', hashtags: ['#A'] },
    { hook: 'B', caption: 'Câu chung. Câu riêng B.', cta: 'Ghé Pshop Music.', hashtags: ['#B'] },
    { hook: 'C', caption: 'Câu chung. Câu riêng C.', cta: 'Pshop Music tư vấn.', hashtags: ['#C'] }
  ] }) }, { productBrief: { name: 'Sản phẩm A' } }, { product: {} });
  const joined = out.versions.map(v => v.caption || '').join(' ');
  const count = (joined.match(/Câu chung\./g) || []).length;
  eq(count, 1, 'câu chung còn lặp: ' + joined);
});
test('các phiên bản trùng caption bị gộp, không giữ 3 bản chỉ khác hook/CTA', () => {
  const out = mod.mapToDraftContent({ text: JSON.stringify({ versions: [
    { hook: 'Hook A', caption: 'Cùng một nội dung mô tả.', cta: 'Liên hệ Pshop Music.', hashtags: ['#A'] },
    { hook: 'Hook B', caption: 'Cùng một nội dung mô tả.', cta: 'Ghé Pshop Music.', hashtags: ['#B'] },
    { hook: 'Hook C', caption: 'Cùng một nội dung mô tả.', cta: 'Pshop Music tư vấn.', hashtags: ['#C'] }
  ] }) }, { productBrief: { name: 'Sản phẩm A' } }, { product: {} });
  assert(out.versions.length <= 1, 'phải gộp bản trùng caption, còn ' + out.versions.length);
});
test('dedupeProductMentions giữ tên lần đầu, lần sau đổi thành "mẫu này"', () => {
  const name = 'Chân loa Aura 1 2 3 4';
  const out = Core.dedupeProductMentions(name + ' giúp đặt loa. ' + name + ' giúp bố trí gọn gàng.', name);
  assert((out.match(/Chân loa Aura 1 2 3 4/g) || []).length === 1, out);
  assert(/mẫu này giúp bố trí/.test(out), out);
});
test('stripCtaSentences bỏ CTA nằm trong caption để chỉ còn trường cta', () => {
  eq(Core.stripCtaSentences('Sản phẩm tốt.\n\nĐến Pshop Music để được tư vấn!'), 'Sản phẩm tốt.');
});
test('claim độ cao/góc nghiêng không có nguồn bị bỏ toàn câu (không để lại câu cụt)', () => {
  const c = Core.sanitizeFacebookText('Giá đỡ micro Pro cho phép độ cao và góc nghiêng theo ý muốn, giúp bạn thoải mái.', 'Giá đỡ micro Pro');
  assert(!/độ cao|góc nghiêng|thoải mái/.test(c), c);
  eq(c, '', 'câu claim phải bị bỏ: ' + c);
});
test('mapToDraftContent chỉ giữ một CTA khi caption và trường cta cùng có CTA', () => {
  const out = mod.mapToDraftContent({ text: JSON.stringify({ versions: [{
    hook: 'Sản phẩm tốt', caption: 'Đến Pshop Music để được tư vấn!', cta: 'Liên hệ Pshop Music để được tư vấn.', hashtags: ['#X']
  }] }) }, { productBrief: { name: 'Sản phẩm' } }, { product: {} });
  const text = out.versions[0].postText;
  eq((text.match(/(?:Đến|Liên hệ)\s+Pshop Music/gi) || []).length, 1, text);
});
test('dedupeProductNameStarts đổi tên lặp ở đoạn sau thành "Sản phẩm …"', () => {
  const name = 'Chân loa Aura 1 2 3 4';
  const out = Core.dedupeProductNameStarts(name + ' là thiết bị.\n\n' + name + ' hỗ trợ bố trí.', name);
  eq(out, name + ' là thiết bị.\n\nSản phẩm hỗ trợ bố trí.');
});
test('productFactsBlock dùng đúng giá/tình trạng/bảo hành từ catalog; New → Mới', () => {
  eq(Core.productFactsBlock({ price: '1.200.000 ₫', status: 'New', badgeText: 'Chính hãng · BH 12th' }),
    'Giá: 1.200.000 ₫\nTình trạng: Mới\nChính hãng · Bảo hành 12 tháng');
  eq(Core.productFactsBlock({ status: 'Used', badgeText: 'Used chính hãng' }), 'Tình trạng: Đã qua sử dụng\nChính hãng');
  eq(Core.productFactsBlock({}), '');
});
test('stripFactClaims bỏ giá/tình trạng/bảo hành AI tự nói; giữ "Giá đỡ micro"', () => {
  const cleaned = Core.stripFactClaims('Giá chỉ 1.000đ. Sản phẩm mới 100%. Bảo hành 12 tháng. Giá đỡ micro giúp đặt micro đúng vị trí.');
  assert(!/1\.000đ|mới 100%|Bảo hành 12 tháng/.test(cleaned), cleaned);
  assert(/Giá đỡ micro giúp đặt micro đúng vị trí/.test(cleaned), cleaned);
  eq(Core.stripFactClaims('Sản phẩm New. Sản phẩm Used.').trim(), '');
});
test('không phá tên sản phẩm có số/underscore; không biến hashtag thành heading', () => {
  const clean = Core.sanitizeFacebookText('Chân loa Aura 1 2 3 4\n#PshopMusic #ChanLoa');
  assert(/Chân loa Aura 1 2 3 4/.test(clean), clean);
  assert(/#PshopMusic/.test(clean) && /#ChanLoa/.test(clean), clean);
});

console.log('\n=== mapToDraftContent ===');
test('hook/caption/cta/postText đều là văn bản thuần; hashtag được chuẩn hoá, không trùng', () => {
  const providerOutput = { text: JSON.stringify({ versions: [{
    hook: 'Hãy để Pshop Music tư vấn!',
    caption: '**Chân loa Aura 1 2 3 4** dùng để đặt loa đúng vị trí.\n- Gọn gàng\n- Dễ bố trí\n\nhttps://fake.example',
    cta: 'Liên hệ Pshop Music để xem hàng.',
    hashtags: ['#ChanLoa', 'ThietBiAmThanh', '#ChanLoa', '**']
  }] }) };
  const out = mod.mapToDraftContent(providerOutput, { productBrief: SAMPLE }, { product: {}, categories: [] });
  const v = out.versions[0];
  assert(!/\*\*|`/.test(v.hook + v.caption + v.cta + v.postText), JSON.stringify(v));
  assert(!/^\s*[-*+•]\s+/m.test(v.caption), v.caption);
  assert(!/https?:\/\//.test(v.postText), v.postText);
  assert(!/Hãy để/.test(v.hook), 'hook sáo rỗng chưa bị bỏ: ' + v.hook);
  assert(/Chân loa Aura 1 2 3 4/.test(v.caption), v.caption);
  assert(v.hashtags.includes('#ChanLoa') && v.hashtags.includes('#ThietBiAmThanh'), JSON.stringify(v.hashtags));
  assert(v.hashtags.filter(t => t === '#ChanLoa').length === 1, 'hashtag bị trùng: ' + JSON.stringify(v.hashtags));
  assert(v.hashtags.length === 2, 'hashtag rác chưa bị lọc: ' + JSON.stringify(v.hashtags));
  assert(/Liên hệ Pshop Music/.test(v.postText), v.postText);
});

test('link hệ thống category.html?product=... không bị sanitizer tách thành "category. html?..."', () => {
  const out = mod.mapToDraftContent({ text: JSON.stringify({ versions: [{
    hook: 'Loa kiểm âm KRK', caption: 'Dùng cho phòng thu.', cta: 'Liên hệ Pshop Music.', hashtags: ['#KRK']
  }] }) }, { productId: 'p-krk' }, { product: { name: 'KRK ROKIT 8', specs: 'KRK · 203W' }, categories: [] });
  const text = out.versions[0].postText;
  assert(/Xem chi tiết: category\.html\?product=p-krk\n\n#KRK$/.test(text), text);
  assert(!/category\. html/.test(text), text);
});
test('CMS postText ghép đúng giá/tình trạng/bảo hành từ catalog và bỏ câu AI tự nói trùng', () => {
  const out = mod.mapToDraftContent({ text: JSON.stringify({ versions: [{
    hook: 'Lexar JumpDrive P30 128GB', caption: 'Giá chỉ 999.000đ, bảo hành 24 tháng. Tốc độ đọc 450MB/s.', cta: 'Liên hệ Pshop Music.', hashtags: ['#Lexar']
  }] }) }, { productId: 'p-lexar' }, { product: {
    name: 'LEXAR JUMPDRIVE P30 128GB – USB 3.2', specs: 'Lexar · USB 3.2 · 450MB/s',
    price: '1.200.000 ₫', status: 'New', badgeText: 'Chính hãng · BH 12th'
  }, categories: [] });
  const text = out.versions[0].postText;
  assert(/Giá: 1\.200\.000 ₫/.test(text), text);
  assert(/Tình trạng: Mới/.test(text), text);
  assert(/Chính hãng · Bảo hành 12 tháng/.test(text), text);
  assert(!/999\.000đ|bảo hành 24 tháng/.test(text), text);
});
test('AI bị lọc rỗng → dùng 2 câu đầu description catalogue làm fallback', () => {
  const out = mod.mapToDraftContent({ text: JSON.stringify({ versions: [{ hook: '', caption: '', cta: 'Liên hệ Pshop Music.', hashtags: ['#Loa'] }] }) },
    { productId: 'p1' }, { product: { name: 'Loa A', description: 'Loa A là loa kiểm âm. Dùng cho phòng thu nhỏ.' }, categories: [] });
  const text = out.versions[0].postText;
  assert(/Loa A là loa kiểm âm/.test(text) && /Dùng cho phòng thu nhỏ/.test(text), text);
});
test('claim có trong tên sản phẩm (vd "chuyên nghiệp") không bị sanitizer xoá nhầm ở mapToDraftContent', () => {
  const out = mod.mapToDraftContent({ text: JSON.stringify({ versions: [{
    hook: 'Tai nghe DJ chuyên nghiệp',
    caption: 'Sản phẩm dành cho DJ chuyên nghiệp.',
    cta: 'Liên hệ Pshop Music.',
    hashtags: ['#TaiNghe']
  }] }) }, { productBrief: { name: 'Tai nghe DJ chuyên nghiệp' } }, { product: {}, categories: [] });
  assert(/chuyên nghiệp/.test(out.versions[0].hook), out.versions[0].hook);
  assert(/chuyên nghiệp/.test(out.versions[0].caption), out.versions[0].caption);
});
test('mẫu đầu vào/đầu ra mong muốn: giá và tình trạng không bị AI bịa, câu văn có thông tin cụ thể', () => {
  const expected = 'Chân loa Aura 1 2 3 4 – ' + SAMPLE_PRICE + '\n\n' +
    'Chân loa dành cho người chơi âm thanh muốn bố trí hệ thống gọn gàng và đặt loa đúng vị trí trong không gian nghe nhạc.\n\n' +
    'Sản phẩm ' + SAMPLE_CONDITION + '. Liên hệ Pshop Music để được tư vấn thêm.\n\n' +
    '#PshopMusic #ChanLoa #ThietBiAmThanh';
  const clean = Core.sanitizeFacebookText(expected);
  assert(clean.includes(SAMPLE.name) && clean.includes(SAMPLE_PRICE) && clean.includes(SAMPLE_CONDITION), clean);
  assert(!/\*\*|^\s*#{1,6}\s+/m.test(clean), clean);
  assert(!/Bạn đang tìm kiếm|Hãy để|Đỉnh cao/.test(clean), clean);
});

test('plain text: xoá heading/bold/separator/code fence/link Markdown nhưng giữ hashtag', () => {
  const dirty = '## Tiêu đề\n\n**Đậm** và __đậm hai__\n\n---\n\n___\n\n```json\n{"a":1}\n```\n\n[Pshop Music](https://pshopmusic.com)\n\n#PshopMusic #TaiNgheDJ #AIAIAI #TMA_2_DJ';
  const clean = Core.sanitizeFacebookText(dirty);
  assert(!/^\s*#{2,6}\s+/m.test(clean), 'còn heading: ' + clean);
  assert(!/\*\*|__|```|^\s*(?:-{3,}|_{3,})\s*$/m.test(clean), 'còn Markdown: ' + clean);
  assert(/#PshopMusic/.test(clean) && /#TaiNgheDJ/.test(clean) && /#AIAIAI/.test(clean), clean);
  assert(/#TMA_2_DJ/.test(clean), 'hashtag có underscore bị phá: ' + clean);
  assert(/Pshop Music/.test(clean) && !/https?:\/\//.test(clean), clean);
  assert(/\n/.test(clean), 'mất xuống dòng: ' + clean);
});
test('đầu ra cuối cùng sau facts/CTA/tags vẫn là plain text, giá/tình trạng/bảo hành/spec nguyên vẹn', () => {
  const product = { name: 'Tai nghe AIAIAI TMA-2 DJ', specs: 'Driver 40mm · Max SPL 120dB @ 1kHz', price: 5000000, condition: 'Hàng mới', badgeText: 'Bảo hành 1 năm' };
  const out = mod.mapToDraftContent({ text: JSON.stringify({ versions: [{
    hook: '## Tai nghe AIAIAI TMA-2 DJ',
    caption: '**Driver 40mm** và __Max SPL 120dB__\n\n---\n\n```text\nThông số: 40mm · 120dB\n```\n\n[Pshop Music](https://pshopmusic.com)',
    cta: 'Liên hệ Pshop Music để được tư vấn.',
    hashtags: ['#PshopMusic', '#TaiNgheDJ', '#AIAIAI']
  }] }) }, {}, { product, categories: [] });
  const post = out.versions[0].postText;
  assert(!/\*\*|__|```|^\s*#{2,6}\s+/m.test(post), 'còn Markdown: ' + post);
  assert(!/^\s*(?:-{3,}|_{3,})\s*$/m.test(post), 'còn separator: ' + post);
  assert(/#PshopMusic/.test(post) && /#TaiNgheDJ/.test(post) && /#AIAIAI/.test(post), post);
  assert(/5000000|5\.000\.000/.test(post), 'giá bị đổi: ' + post);
  assert(/Hàng mới/.test(post), 'tình trạng bị đổi: ' + post);
  assert(/Bảo hành 1 năm/.test(post), 'bảo hành bị đổi: ' + post);
  assert(/40mm/.test(post) && /120dB/.test(post), 'spec bị đổi: ' + post);
});

console.log('\n=== Đồng bộ client/server ===');
test('js/ai/modules-core.js BYTE-IDENTICAL với functions/shared/aiModulesCore.js', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'shared', 'aiModulesCore.js'), 'utf8');
  const client = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'ai', 'modules-core.js'), 'utf8');
  eq(server, client, 'client/server modules-core lệch nhau — sửa prompt phải sửa cả 2');
});

console.log('\n─────────────────────────────────────────────');
console.log('PASSED: ' + passed + '  FAILED: ' + failed);
if (failed) { console.log('FAILURES: ' + failures.join(' | ')); process.exit(1); }
console.log('RESULT: PASS');
process.exit(0);
