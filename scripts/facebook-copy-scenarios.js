#!/usr/bin/env node
/*
 * scripts/facebook-copy-scenarios.js — KIỂM CHỨNG CHẤT LƯỢNG FACEBOOK COPY bằng MODEL THẬT.
 *
 * Chạy (cần OPENAI_API_KEY trong env; KHÔNG in key):
 *   $env:OPENAI_API_KEY = "<key>"
 *   node scripts/facebook-copy-scenarios.js
 *
 * Script gọi gpt-4o-mini cho 5 tình huống A–E, lưu:
 *   input · prompt · raw model output · parsed · sanitized · final · checks
 * vào functions/tests/out/facebook-copy-scenarios.json (+ .md).
 *
 * KHÔNG deploy/commit. Không dùng mock để tuyên bố model thật.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../functions/shared/aiModulesCore');
const { callOpenAiText } = require('../functions/shared/aiGenerate');

const MOD = core.MODULES['facebook-post-generator'];
const OUT_DIR = path.join(__dirname, '..', 'functions', 'tests', 'out');
const MD = /(^|\n)\s*#{1,6}\s|\*\*|`|(^|\n)\s*[-*+•]\s/m;
const CLICHE = /(Bạn đang tìm kiếm|Hãy để|Đỉnh cao|lựa chọn hoàn hảo|giải pháp lý tưởng|nâng tầm|đẳng cấp|tối ưu nhất|hoàn hảo|số 1|tuyệt vời)/i;
const URL_RE = /https?:\/\/[^\s)]+/gi;

function has(text, s) { return String(text || '').toLowerCase().includes(String(s).toLowerCase()); }
function textWithoutTags(text) { return String(text || '').split(/\n+/).filter(line => !/^\s*#/.test(line)).join('\n'); }
function findUrls(text) { return Array.from(new Set(String(text || '').match(URL_RE) || [])); }

function tagsOf(v) {
  return Array.isArray(v && v.hashtags)
    ? Array.from(new Set(v.hashtags.map(t => String(t || '').replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '').trim()).filter(Boolean))).slice(0, 6).map(t => '#' + t).join(' ')
    : '';
}

function telegramFinal(rawText, inputParams, facts) {
  const parsed = core.parseJsonResponse(rawText);
  const v = parsed && Array.isArray(parsed.versions) ? parsed.versions[0] : null;
  const allowed = [inputParams.productBrief && inputParams.productBrief.name, inputParams.productBrief && inputParams.productBrief.condition,
    inputParams.productBrief && inputParams.productBrief.price].filter(Boolean).join(' ');
  const name = inputParams.productBrief && inputParams.productBrief.name;
  const cta = v && v.cta ? core.sanitizeFacebookText(v.cta, allowed) : '';
  const rawBody = v ? core.stripFactClaims(core.sanitizeFacebookText([v.hook, v.caption].filter(Boolean).join('\n\n'), allowed)) : '';
  const stripped = cta ? core.stripCtaSentences(rawBody) : rawBody;
  const named = core.ensureProductName([stripped, cta].filter(Boolean).join('\n\n'), name);
  const body = core.polishFacebookText(core.dedupeProductMentions(core.dedupeProductNameStarts(named, name), name));
  const tags = tagsOf(v);
  const final = body + (facts ? '\n\n' + facts : '') + (tags ? '\n\n' + tags : '');
  return { parsed, sanitized: { body, tags }, final };
}

function cmsFinal(rawText, inputParams, context) {
  const content = MOD.mapToDraftContent({ text: rawText }, inputParams, context);
  const v = content.versions[0] || {};
  return { parsed: core.parseJsonResponse(rawText), sanitized: { hook: v.hook, caption: v.caption, cta: v.cta, hashtags: v.hashtags, postText: v.postText }, final: v.postText || '', versionCount: content.versions.length };
}

const CASES = [
  {
    id: 'A',
    label: 'Chỉ có thương hiệu + model, chưa có thông số',
    mode: 'telegram',
    inputParams: { productBrief: { name: 'Pioneer DDJ-400' }, singleVersion: true },
    context: { product: {}, categories: [] },
    facts: '',
    mustInclude: ['Pioneer DDJ-400'],
    forbidden: [/mix/i, /điều khiển/i, /tính năng/i, /thiết kế/i, /chuyên nghiệp/i, /bảo hành/i, /giá\s*:/i]
  },
  {
    id: 'B',
    label: 'Có tên + loại sản phẩm rõ, chưa có thông số',
    mode: 'telegram',
    inputParams: { productBrief: { name: 'Chân loa Aura 1 2 3 4' }, singleVersion: true },
    context: { product: {}, categories: [] },
    facts: 'Giá: 1.800.000đ\nTình trạng: Mới 100%',
    mustInclude: ['Chân loa Aura 1 2 3 4', '1.800.000đ', 'Mới 100%', 'đặt loa'],
    forbidden: [/thiết kế/i, /chống rung/i, /chất liệu/i, /kích thước/i, /tương thích/i, /bảo hành/i, /công suất/i, /tần số/i, /trọng lượng/i, /độ chính xác/i, /ổn định/i]
  },
  {
    id: 'C',
    label: 'Catalog đầy đủ: mô tả + thông số + ứng dụng',
    mode: 'cms',
    inputParams: { productId: 'p-krk-rokit-8' },
    context: { categories: [], product: {
      name: 'KRK ROKIT 8 G4 – LOA KIỂM ÂM 1 CÁI', brand: 'KRK', category: 'loa', categoryLabel: 'Loa kiểm âm',
      specs: 'KRK · 203W · 8" Kevlar · 36Hz–40kHz · LCD EQ · DSP',
      description: 'Loa kiểm âm nearfield 8 inch thế hệ 4, công suất 203W Class D, driver Kevlar cho âm thanh trung thực mọi dải tần. DSP tích hợp 25 preset EQ và màn hình LCD tinh chỉnh theo phòng. Cổng bass phía trước cho bass chặt, chính xác. Ứng dụng KRK Audio Tools hỗ trợ căn chỉnh tự động. Lựa chọn số 1 cho phòng thu và DJ booth chuyên nghiệp.',
      status: 'New', badgeText: 'Chính hãng · BH 12th', price: '8.500.000 ₫'
    } },
    mustInclude: ['203W', '8', '36Hz', 'DSP', 'EQ', 'KRK'],
    forbidden: [/chống nước/i, /bluetooth/i, /không dây/i, /chống rung/i, /cách âm/i, /bảo hành 24/i, /trọng lượng/i]
  },
  {
    id: 'D',
    label: 'Giá + tình trạng + bảo hành từ catalog',
    mode: 'cms',
    inputParams: { productId: 'p-lexar-p30' },
    context: { categories: [], product: {
      name: 'LEXAR JUMPDRIVE P30 128GB – USB 3.2', brand: 'Lexar', category: 'phukien', categoryLabel: 'Phụ kiện',
      specs: 'Lexar · USB 3.2 Gen 1 · 450MB/s · Chuyên dụng CDJ/XDJ · Mã hóa file',
      description: 'USB drive cao cấp Lexar JumpDrive P30 128GB tốc độ đọc lên đến 450MB/s — nhanh vượt trội so với USB thông thường. Chuẩn USB 3.2 Gen 1, tương thích hoàn toàn Pioneer CDJ/XDJ, Rekordbox, Serato, Engine OS. Thiết kế vỏ kim loại chắc chắn, nắp trượt bảo vệ đầu kết nối. Hỗ trợ mã hóa file bảo mật. Dung lượng 128GB chứa hàng nghìn bài nhạc lossless FLAC/WAV. Chính hãng, bảo hành 12 tháng.',
      status: 'New', badgeText: 'Chính hãng · BH 12th', price: '1.200.000 ₫'
    } },
    mustInclude: ['1.200.000', 'Bảo hành 12 tháng', '450MB/s', '128GB'],
    forbidden: [/giảm giá/i, /khuyến mãi/i, /miễn phí/i, /bảo hành 24/i, /chống nước/i]
  },
  {
    id: 'E',
    label: 'Tên chứa "giá đỡ" / "chân loa" — kiểm tra sanitizer không hiểu nhầm',
    mode: 'telegram',
    inputParams: { productBrief: { name: 'Giá đỡ micro Pro' }, singleVersion: true },
    context: { product: {}, categories: [] },
    facts: 'Giá: 250.000đ\nTình trạng: Mới 100%',
    mustInclude: ['Giá đỡ micro Pro', '250.000đ', 'Mới 100%', 'giá đỡ'],
    forbidden: [/độ chính xác/i, /chống rung/i, /chất liệu/i, /kích thước/i]
  }
];

(async () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Thiếu OPENAI_API_KEY — script này CHỈ chạy model thật, không mock.');
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const CALL_TIMEOUT_MS = 45000; // mỗi case tối đa 45s; tránh treo vô hạn
  const results = [];
  for (const c of CASES) {
    const prompt = MOD.buildPrompt(c.inputParams, c.context);
    let raw = '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
    try { raw = (await callOpenAiText(prompt, { signal: ctrl.signal })).text; }
    catch (e) {
      const timedOut = e && (e.name === 'AbortError' || /abort/i.test(String(e.message)));
      results.push({ id: c.id, label: c.label, error: timedOut ? 'TIMEOUT sau ' + CALL_TIMEOUT_MS + 'ms' : String(e && e.message || e).slice(0, 200) });
      continue;
    } finally { clearTimeout(timer); }
    const out = c.mode === 'cms' ? cmsFinal(raw, c.inputParams, c.context) : telegramFinal(raw, c.inputParams, c.facts);
    const final = out.final;
    const bodyOnly = textWithoutTags(final);
    const checks = {
      markdown: MD.test(final),
      cliche: CLICHE.test(final),
      urls: findUrls(final),
      versions: c.mode === 'cms' ? (out.versionCount || 0) : ((out.parsed && out.parsed.versions && out.parsed.versions.length) || 0),
      mustInclude: Object.fromEntries(c.mustInclude.map(x => [x, has(final, x)])),
      forbidden: c.forbidden.filter(r => r.test(bodyOnly)).map(r => String(r)),
      bodyOnly
    };
    results.push({ id: c.id, label: c.label, mode: c.mode, inputParams: c.inputParams, sourceProduct: c.context.product || null, prompt, raw, parsed: out.parsed, sanitized: out.sanitized, final, checks });
    console.log('\n=== ' + c.id + ' — ' + c.label + ' ===');
    console.log('versions=' + checks.versions + ' markdown=' + checks.markdown + ' cliche=' + checks.cliche + ' urls=' + JSON.stringify(checks.urls));
    console.log('mustInclude=' + JSON.stringify(checks.mustInclude) + ' forbidden=' + JSON.stringify(checks.forbidden));
    console.log(final);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(OUT_DIR, 'facebook-copy-scenarios.json');
  const mdPath = path.join(OUT_DIR, 'facebook-copy-scenarios.md');
  fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), 'utf8');
  const md = results.map(r => `## ${r.id} — ${r.label}\n\n- mode: ${r.mode}\n- versions: ${r.checks && r.checks.versions}\n- markdown: ${r.checks && r.checks.markdown}\n- cliche: ${r.checks && r.checks.cliche}\n- urls: ${JSON.stringify(r.checks && r.checks.urls)}\n- mustInclude: ${JSON.stringify(r.checks && r.checks.mustInclude)}\n- forbidden: ${JSON.stringify(r.checks && r.checks.forbidden)}\n\n### FINAL\n\n\`\`\`\n${r.final || '(error)'}\n\`\`\`\n`).join('\n');
  fs.writeFileSync(mdPath, `# Facebook copy scenarios (real model)\nGenerated: ${new Date().toISOString()}\n\n${md}`, 'utf8');
  console.log('\nSaved: ' + jsonPath);
  console.log('Saved: ' + mdPath);
})().catch(e => { console.error('FAILED: ' + (e && e.stack || e)); process.exit(1); });
