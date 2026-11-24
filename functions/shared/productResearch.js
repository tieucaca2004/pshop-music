/*
 * shared/productResearch.js — provider-neutral web research for product SKU.
 *
 * Runtime contract (external provider, HTTPS only):
 *   POST PSH_RESEARCH_URL
 *   Authorization: Bearer PSH_RESEARCH_API_KEY
 *   body: { sku, name, category, specs }
 *   200: {
 *     matchedSku, product: { name, brand, model, category, description, warranty, origin },
 *     sources: [{ title, url, type: "official"|"distributor"|"other",
 *                 claims: [string], specs: {key:value}, features:[string], applications:[string] }]
 *   }
 *
 * The provider is responsible for real web search/fetch. This module does not
 * treat model knowledge as web research. If URL/key are absent it returns
 * `unconfigured`; callers must not invent facts.
 *
 * No price field is read from research. User-submitted price is authoritative.
 */
'use strict';
const admin = require('firebase-admin');

const CACHE_NODE = 'productResearchCache';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15000;
// Phiên bản cấu trúc kết quả research. Cache cũ (không có schema này: chỉ snippet/xác minh theo query) bị bỏ qua.
const RESEARCH_SCHEMA = 4;

function normalize(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function safeUrl(u) {
  try {
    const p = new URL(String(u));
    if (p.protocol !== 'https:' || !p.hostname || p.username || p.password) return null;
    return p.toString();
  } catch (e) { return null; }
}
function normalizeHost(h) { return String(h || '').trim().toLowerCase().replace(/\.+$/, ''); }
function genTokens(s) {
  const out = [];
  const re = /\b(g(?:en(?:eration)?\s*)?\d{1,2}|mk\s*[ivx0-9]+|v\d{1,2})\b|([a-z]{2,}\d+)g(\d+)\b/gi;
  let m;
  while ((m = re.exec(String(s == null ? '' : s)))) {
    if (m[3]) { out.push('g' + m[3]); continue; }
    const raw = m[1].toLowerCase().replace(/\s+/g, '');
    const gm = raw.match(/^(?:g|gen|generation)(\d+)$/);
    out.push(gm ? 'g' + gm[1] : raw);
  }
  return Array.from(new Set(out));
}
// Product-generation axis only: keeps "g2"/"g4"-style tokens (from "G2", "Generation 4",
// "RP5G2", and the joined "5g4" size+generation form), excluding version/mark tokens
// ("v2", "mk2") that are not product generations.
function generationAxis(s) {
  const text = String(s == null ? '' : s);
  const out = [];
  // "G4", "Gen 4", "Generation 4"
  const spaced = /\b(?:g|gen(?:eration)?)[\s-]*(\d{1,2})\b/gi;
  // "RP5G2" and "5G4" (family/size prefix, size, then generation)
  const joined = /\b([a-z]{2,})?(\d{1,2})g(\d{1,2})\b/gi;
  let m;
  while ((m = spaced.exec(text))) out.push('g' + m[1]);
  while ((m = joined.exec(text))) out.push('g' + m[3]);
  return Array.from(new Set(out));
}
const SOURCE_TYPES = ['official', 'distributor', 'dealer', 'reference', 'other'];
function sourceRank(type) {
  return { official: 0, distributor: 1, dealer: 2, reference: 3, other: 4 }[type] ?? 4;
}

function configFromEnv() {
  const url = String(process.env.PSH_RESEARCH_URL || '').trim();
  const key = String(process.env.PSH_RESEARCH_API_KEY || '').trim();
  const provider = String(process.env.PSH_RESEARCH_PROVIDER || '').trim().toLowerCase();
  const officialDomains = String(process.env.PSH_RESEARCH_OFFICIAL_DOMAINS || '').split(',').map(normalizeHost).filter(Boolean);
  const timeoutMs = Number(process.env.PSH_RESEARCH_TIMEOUT_MS) > 0 ? Number(process.env.PSH_RESEARCH_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  const tavily = provider === 'tavily';
  return { url, key, provider, officialDomains, timeoutMs, configured: tavily || (!!url && !!key && !!safeUrl(url)) };
}

function domainOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ''; } }
function isOfficialUrl(url, domains) {
  const safe = safeUrl(url);
  if (!safe) return false;
  const host = normalizeHost(domainOf(safe));
  if (!host) return false;
  return (domains || []).some(d => {
    const base = normalizeHost(d);
    return !!base && (host === base || host.endsWith('.' + base));
  });
}
function extractSpecs(text) {
  const out = {};
  const keyRe = /(power|watt|frequency|response|driver|spl|impedance|height|width|depth|weight|dimension|input|output|max|hf|lf|công|tần|kích|trọng|điện|trở|đáp tuyến|kết nối)/i;
  const lines = String(text || '').split(/\r?\n/);
  for (const raw of lines) {
    let line = raw.replace(/^\s*(?:[+*•-]|\d+\.)\s*/, '').replace(/\*\*/g, '').trim();
    if (!line || line.length > 220 || /\$|price|giá|shipping|quantity|subtotal|cart|sku\b/i.test(line)) continue;
    const m = line.match(/^([A-Za-zÀ-ỹ][^:]{2,60}):\s*(.{1,120})$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = m[2].trim().split(/\[\.\.\.|###|\s{2,}/)[0].trim().slice(0, 120);
    if (!keyRe.test(key) || !/\d|hz|khz|db|ohm|kg|mm|inch|"|w\b/i.test(val)) continue;
    if (!out[key]) out[key] = val;
  }
  return out;
}
const VARIANT_WORDS = ['wireless', 'xe', 'move', 'hidden', 'edition', 'blood orange', 'yeti', 'jjjjound', 'oklou', 'always', 'brain dead'];
function variantWords(text) {
  const s = String(text || '').toLowerCase();
  const out = VARIANT_WORDS.filter(v => s.includes(v));
  // "Studio Monitor" của KRK không phải biến thể TMA-2 Studio.
  if (/\btma-?2\s+studio\b/.test(s)) out.push('studio');
  return out;
}
function relevantToQuery(result, query) {
  const title = String(result.title || '').toLowerCase();
  const text = String((result.title || '') + ' ' + (result.content || '') + ' ' + (result.raw_content || '')).toLowerCase();
  // Không trộn TMA-2 DJ với DJ Wireless/DJ XE/Studio..., trừ khi query nêu đúng biến thể.
  const qVars = variantWords((query.sku || '') + ' ' + (query.name || ''));
  const rVars = variantWords(title);
  if (rVars.some(v => qVars.indexOf(v) < 0)) return false;
  const qGen = genTokens((query.sku || '') + ' ' + (query.name || ''));
  const rGen = genTokens(text);
  if (qGen.length && !qGen.every(t => rGen.includes(t))) return false;
  // Trang so sánh/xếp hạng trộn nhiều model — không dùng làm nguồn của MỘT model.
  if (/\b(vs\.?|versus|compare|comparison|alternatives?|best \d*|top \d+)\b/i.test(title)) return false;
  return true;
}

// ── Xác minh đúng sản phẩm bằng BẰNG CHỨNG TRONG NGUỒN (không dùng chính query làm bằng chứng) ──
// Tên/mã query → bộ token nhận diện; nguồn chỉ được nhận khi tiêu đề hoặc URL của chính nó chứa
// đúng chuỗi token đó (liền nhau, ranh giới token chính xác: "ddj 400" ≠ "ddj 1000"/"ddj flx4").
const VI_TYPE_WORDS = new Set(['tai', 'nghe', 'loa', 'chan', 'gia', 'do', 'kiem', 'am', 'dau', 'dia', 'may', 'bo', 'cap', 'day', 'phu', 'kien', 'ban', 'cai', 'chiec', 'thung', 'hang', 'moi', 'cu',
  // Màu sắc do Founder mô tả không phải một phần của model ("Rokit Gen 2 màu xanh") — không dùng để so khớp nguồn.
  'mau', 'xanh', 'den', 'trang', 'vang', 'hong', 'tim', 'cam', 'bac', 'xam', 'nau']);
function foldText(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/\bgen(?:eration)?\s*(\d+)/g, 'g$1');
}
function tokensOf(s) { return foldText(s).split(/[^a-z0-9]+/).filter(Boolean); }
function identTokens(str) {
  const core = String(str == null ? '' : str).split(/\s+[–—-]\s+/)[0];
  return tokensOf(core).filter(t => !VI_TYPE_WORDS.has(t));
}
function isDistinctive(tokens) {
  if (tokens.join('').length < 4) return false;
  return tokens.some(t => /\d/.test(t)) || tokens.filter(t => t.length >= 3).length >= 2;
}
// Các bộ token có thể dùng để nhận diện (SKU, tên, tên bỏ từ đầu = bỏ thương hiệu). Bộ quá chung bị loại.
function candidateSets(query) {
  const sets = [];
  const seen = new Set();
  const add = (tokens) => {
    const key = tokens.join(' ');
    if (!tokens.length || seen.has(key) || !isDistinctive(tokens)) return;
    seen.add(key); sets.push(tokens);
  };
  const extra = [query.model, query.commercialName, query.alias]
    .concat(Array.isArray(query.aliases) ? query.aliases : []);
  const skuT = identTokens(query.sku); const nameT = identTokens(query.name);
  add(skuT); add(nameT);
  for (const value of extra) {
    if (value) add(identTokens(value));
  }
  // Bỏ dần token đầu (thương hiệu có thể 1-2 từ: "Pioneer", "Pioneer DJ") miễn phần còn lại vẫn đủ đặc trưng.
  for (const toks of [nameT, skuT]) for (let k = 1; toks.length - k >= 2; k++) add(toks.slice(k));
  return sets;
}

// Query expansion: first query preserves the historical shape; later queries only run when the
// first query has no usable exact/family result. No new facts are invented.
function buildQueries(query) {
  const q = query || {};
  const ids = [q.sku, q.name, q.model, q.commercialName, q.alias]
    .concat(Array.isArray(q.aliases) ? q.aliases : [])
    .filter(Boolean);
  const first = [q.sku, q.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ');
  const family = familyTokens(q).join(' ');
  const generation = genTokens((q.sku || '') + ' ' + (q.name || '') + ' ' + (q.generation || '')).join(' ');
  const candidates = [
    ((first || ids[0] || '') + ' official specifications features').slice(0, 380),
    q.name ? [q.name, q.brand, q.generation, Array.isArray(q.aliases) ? q.aliases.join(' ') : q.alias, 'specifications manual'].filter(Boolean).join(' ').slice(0, 380) : '',
    (q.sku || q.name) ? [q.sku || q.name, 'manual specification sheet PDF'].filter(Boolean).join(' ').slice(0, 380) : '',
    (q.brand && family) ? [q.brand, family, generation, 'datasheet specifications'].filter(Boolean).join(' ').slice(0, 380) : ''
  ];
  const out = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const text = String(candidate || '').replace(/\s+/g, ' ').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text); out.push(text);
  }
  return out.slice(0, 4);
}

function familyTokens(query) {
  const q = query || {};
  const brand = new Set(tokensOf(q.brand || ''));
  const generic = new Set([
    'headphone', 'headphones', 'earphone', 'earphones', 'monitor', 'monitors', 'speaker', 'speakers',
    'controller', 'controllers', 'mixer', 'mixers', 'studio', 'powered', 'active', 'wired', 'wireless',
    'series', 'generation', 'gen', 'professional', 'pro', 'audio', 'pair', 'single', 'inch', 'in',
    'loa', 'kiểm', 'âm', 'tai', 'nghe', 'dj', 'kiem', 'am', 'mau', 'xanh', 'den', 'trang',
    'vang', 'hong', 'tim', 'cam', 'bac', 'xam', 'nau'
  ]);
  return tokensOf([q.name, q.model, q.commercialName].filter(Boolean).join(' '))
    .filter(t => !brand.has(t) && !generic.has(t) && !/^\d+$/.test(t) && !/^g\d+$/.test(t))
    .filter((t, i, a) => a.indexOf(t) === i);
}

function sizesOf(text) {
  const out = [];
  const add = (n) => { if (n >= 1 && n <= 20 && out.indexOf(n) < 0) out.push(n); };
  const tokens = tokensOf(text || '');
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^\d{1,2}$/.test(token)) {
      // "Rokit Gen 2": 2 is the generation, not a driver size.
      if (tokens[i - 1] !== 'gen' && tokens[i - 1] !== 'generation' && tokens[i - 1] !== 'g') add(Number(token));
      continue;
    }
    const model = token.match(/^[a-z]{2,}(\d{1,2})g\d+$/);
    if (model) add(Number(model[1]));
  }
  return out;
}

function hasModelCode(text) {
  return tokensOf(text || '')
    .filter(t => !/^g\d+$/.test(t))
    .some(t => /\d/.test(t));
}

// Exact identity requires material discriminators. A family + size without generation, or
// family + generation without size, is not enough for KRK-style model families.
function identityComplete(query) {
  const q = query || {};
  const codeText = [q.sku, q.model].filter(Boolean).join(' ').trim();
  const compact = normalize(codeText);
  // A hyphenated or compact code carried in the SKU/model field is a complete identity.
  if (/\b[a-z]{2,}\s*-\s*\d+/i.test(codeText)) return true;
  if (compact && !/\s/.test(codeText) && /\d/.test(compact) && compact.length >= 4) return true;

  const name = String(q.name || '');
  const family = familyTokens(q);
  const sizes = sizesOf([q.sku, q.model, q.name].filter(Boolean).join(' '));
  const gens = genTokens([q.sku, q.model, q.name, q.generation].filter(Boolean).join(' '));

  // Size alone must not stand in for generation for generation-scoped families. A two-digit
  // size-only name ("KRK Rokit 10", "KRK Rokit 12") is incomplete until generation is known.
  if (family.length && sizes.length && !gens.length) return false;

  // Name-based compact codes that are not size-only (e.g. DDJ-400, FLX4).
  if (/\b[a-z]{2,}[\s-]*\d{2,}\b/i.test(name)) return true;
  if (tokensOf(name).some(t => /^[a-z]{2,}\d+$/.test(t) && t.length >= 4)) return true;

  // Generation-scoped families need both size and generation.
  if (family.length) return sizes.length > 0 && gens.length > 0;
  return false;
}

function isComparisonTitle(title) {
  return /\b(vs\.?|versus|compare|comparison|alternatives?|best \d*|top \d+)\b/i.test(String(title || ''));
}

function sourceTypeFor(url, official) {
  if (official) return 'official';
  const host = domainOf(url);
  if (/\bdistributor\b/i.test(host)) return 'distributor';
  if (/\bdealer\b/i.test(host)) return 'dealer';
  if (/\b(manual|support|docs?|download|datasheet|specification)\b/i.test(url)) return 'reference';
  return 'other';
}
// Tìm dãy token LIỀN NHAU của văn bản có nối lại bằng đúng chuỗi ứng viên ("ddj 400" hay "ddj400").
function findRun(pageTokens, cand) {
  const target = cand.join('');
  const maxRun = cand.length + 2;
  for (let i = 0; i < pageTokens.length; i++) {
    let acc = '';
    for (let j = i; j < pageTokens.length && j < i + maxRun; j++) {
      acc += pageTokens[j];
      if (acc === target) return { run: pageTokens.slice(i, j + 1), start: i };
      if (acc.length >= target.length) break;
    }
  }
  return null;
}
function urlWords(u) { try { const p = new URL(u); return p.hostname + ' ' + decodeURIComponent(p.pathname).replace(/[-_/.]+/g, ' '); } catch (e) { return String(u || ''); } }
// Token đơn chữ cái ngay sau model trong tiêu đề/URL ("DDJ-400-N") = biến thể/phiên bản khác, không phải đúng model.
const VARIANT_SUFFIX = /^[a-z]$/;
const ACCESSORY_LEAD = new Set(['for', 'fits', 'fit', 'compatible', 'case', 'bag', 'cover', 'stand', 'cable', 'adapter']);

function hasCompetingModel(result, cands) {
  const titleTokens = tokensOf(result.title || '');
  const flat = new Set(cands.flat());
  for (const token of titleTokens) {
    if (/^g\d+$/.test(token)) continue;
    if (/^\d+$/.test(token)) {
      // Small numbers are sizes (Rokit 5/8); larger numbers are model codes (DDJ-1000).
      if (Number(token) > 20) return true;
      continue;
    }
    if (/\d/.test(token) && !flat.has(token)) return true;
  }
  return false;
}

// Trả về { where, matched, model } nếu TIÊU ĐỀ, URL hoặc NỘI DUNG có đúng model.
// Content matching is deliberate: a generic manual/support title must not hide the model in the page.
function matchEvidence(result, cands, query) {
  const titleText = String(result.title || '');
  const titleTokens = tokensOf(titleText);
  const urlTokens = tokensOf(urlWords(result.url));
  const contentTokens = tokensOf(String(result.raw_content || '') + ' ' + String(result.content || ''));
  const headText = titleText + ' ' + urlWords(result.url);
  const contentText = String(result.raw_content || '') + ' ' + String(result.content || '');
  const qSizes = sizesOf((query.sku || '') + ' ' + (query.name || ''));
  const headSizes = sizesOf(headText);
  const qGen = generationAxis((query.sku || '') + ' ' + (query.name || '') + ' ' + (query.generation || ''));
  const headGen = generationAxis(headText);
  const contentGen = generationAxis(contentText);
  if (qSizes.length && headSizes.length && !qSizes.some(n => headSizes.indexOf(n) >= 0)) return null;
  // Generation exclusivity, not subset membership: any conflicting product generation in the
  // title/URL or body rejects this source as exact evidence for the requested generation.
  if (qGen.length && headGen.some(g => !qGen.includes(g))) return null;
  if (qGen.length && contentGen.some(g => !qGen.includes(g))) return null;
  if (isComparisonTitle(titleText)) return null;

  for (const cand of cands) {
    const inTitle = findRun(titleTokens, cand);
    // Trang phụ kiện/tương thích ("Case for DDJ-400", "Bag compatible with X") không phải trang của chính model.
    if (inTitle && ACCESSORY_LEAD.has(titleTokens[inTitle.start - 1] || '')) continue;
    if (inTitle && VARIANT_SUFFIX.test(titleTokens[inTitle.start + inTitle.run.length] || '')) continue;

    let hit = inTitle;
    if (!hit) {
      hit = findRun(urlTokens, cand);
      if (hit && VARIANT_SUFFIX.test(urlTokens[hit.start + hit.run.length] || '')) hit = null;
    }
    const where = inTitle ? 'title' : (hit ? 'url' : null);
    const run = hit && hit.run;
    const contentHit = !run && findRun(contentTokens, cand);
    const resolvedRun = run || (contentHit && contentHit.run);
    if (resolvedRun) {
      // If the title names a different model code, a body mention is comparison/compatibility,
      // not proof that this is the product page.
      if (!inTitle && hasCompetingModel(result, cands)) continue;
      if (query && query.brand) {
        const brand = foldText(query.brand).replace(/[^a-z0-9]/g, '');
        const hay = foldText(headText + ' ' + String(result.raw_content || '').slice(0, 12000) + ' ' + String(result.content || '').slice(0, 4000)).replace(/[^a-z0-9]/g, '');
        if (brand && hay.indexOf(brand) < 0) return null;
      }
      // model = bộ token NGẮN NHẤT còn khớp được trong cùng nguồn (bỏ tên thương hiệu), vd "DDJ 400" thay vì "PIONEER DJ DDJ 400".
      const tokensForModel = inTitle ? titleTokens : (where === 'url' ? urlTokens : contentTokens);
      const shortest = cands.filter(c2 => findRun(tokensForModel, c2)).sort((a, b) => a.join('').length - b.join('').length)[0] || cand;
      return {
        where: where || 'content',
        matched: resolvedRun.join(' ').toUpperCase(),
        model: shortest.join(' ').toUpperCase()
      };
    }
  }
  return null;
}

// Classify the relationship rather than collapsing everything into "matched/not matched".
// Only exact_model sources may contribute specifications to the product.
function classifyMatch(result, cands, query) {
  const ev = matchEvidence(result, cands, query);
  if (ev) {
    const qSizes = sizesOf((query && query.sku || '') + ' ' + (query && query.name || ''));
    // "ROKIT G2" is a family/generation label, not an exact RP5G2/RP6G2/RP8G2 model.
    if (!hasModelCode(ev.model) && !qSizes.length) {
      const family = familyTokens(query || {});
      return { level: 'product_family', reason: 'exact_model_unresolved', family: family.join(' '), where: ev.where, matched: ev.matched };
    }
    // A query that omitted a material discriminator cannot become exact merely because the
    // result supplied it. This is especially important for generation/size families.
    if (!identityComplete(query)) {
      const sourceSizes = sizesOf(ev.model + ' ' + String(result.title || '') + ' ' + urlWords(result.url));
      const level = !qSizes.length && sourceSizes.length ? 'uncertain' : 'product_family';
      return { level, reason: level === 'uncertain' ? 'ambiguous_size' : 'identity_incomplete', where: ev.where, matched: ev.matched };
    }
    return Object.assign({ level: 'exact_model', reason: null }, ev);
  }
  const title = String(result.title || '');
  if (isComparisonTitle(title)) return { level: 'mismatch', reason: 'comparison_page' };

  const brand = foldText(query && query.brand || '').replace(/[^a-z0-9]/g, '');
  const hay = foldText(title + ' ' + urlWords(result.url) + ' ' + String(result.raw_content || '') + ' ' + String(result.content || '')).replace(/[^a-z0-9]/g, '');
  if (brand && hay.indexOf(brand) < 0) return { level: 'mismatch', reason: 'brand_mismatch' };

  const qGen = genTokens((query && query.sku || '') + ' ' + (query && query.name || '') + ' ' + (query && query.generation || ''));
  const rGen = genTokens(title + ' ' + urlWords(result.url) + ' ' + String(result.raw_content || '') + ' ' + String(result.content || ''));
  if (qGen.length && rGen.length && !qGen.every(t => rGen.includes(t))) {
    return { level: 'related_model', reason: 'different_generation' };
  }

  const qSizes = sizesOf((query && query.sku || '') + ' ' + (query && query.name || ''));
  const headSizes = sizesOf(title + ' ' + urlWords(result.url));
  if (qSizes.length && headSizes.length && !qSizes.some(n => headSizes.indexOf(n) >= 0)) {
    return { level: 'related_model', reason: 'different_size' };
  }
  // An unsized query with several sized variants is ambiguous; do not choose a size.
  if (!qSizes.length && headSizes.length) return { level: 'uncertain', reason: 'ambiguous_size' };
  if (hasCompetingModel(result, cands)) return { level: 'related_model', reason: 'different_model' };

  const family = familyTokens(query || {});
  const familyHit = family.length && findRun(tokensOf(title + ' ' + urlWords(result.url) + ' ' + String(result.raw_content || '') + ' ' + String(result.content || '')), family);
  if (familyHit) return { level: 'product_family', reason: 'exact_model_unresolved', family: family.join(' ') };
  return { level: 'uncertain', reason: 'identity_uncertain' };
}

// ── Lấy nội dung hữu ích từ trang (nguyên văn nguồn, không suy diễn) ──
const NOISE_LINE = /[$€£₫]|price|giá|shipping|add to cart|subtotal|checkout|cookie|newsletter|subscribe|sign in|log in|©|copyright|privacy|terms|quantity|\bsku\b|in stock|out of stock|sold out|free delivery|return policy|follow us|skip to|read more|learn more|click here|wishlist|\breviews?\b/i;
// Dòng giao diện/điều hướng/tài liệu tải về — không phải tính năng sản phẩm.
const UI_JUNK = /brochure|manual|datasheet|data sheet|download|opens in a new|new window|page refresh|choosing a selection|click|learn more|view all|add to|log ?in|sign ?up|newsletter|cookie|warranty|shipping|©|\bmenu\b|compare|related|register|where to buy|find a dealer|dealer|support (?:center|team|page|site)/i;
const USE_CUE = /\b(designed for|ideal for|perfect for|built for|made for|suitable for|great for|geared (?:to|for)|intended for|used (?:for|by|in)|use (?:it )?(?:for|in|with)|for (?:djs?|dj(?:ing)?|studios?|mixing|recording|monitoring|production|producers?|live|performances?|streaming|podcast(?:ing)?|home|clubs?|travel))\b/i;
function pageLines(rawText) {
  let t = String(rawText == null ? '' : rawText).slice(0, 30000);
  const cut = t.search(/\b(related products|you may also like|customers also (?:viewed|bought)|similar products|compare products|more from|recently viewed)\b/i);
  if (cut > 400) t = t.slice(0, cut);
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/<[^>]+>/g, ' ');
  const out = [];
  for (const raw of t.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    if (line[0] === '|') {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (!cells.length || cells.every(c => /^[-: ]+$/.test(c))) continue;
      line = cells.length >= 2 ? cells[0] + ': ' + cells[1] : cells[0];
      out.push({ text: line.replace(/\*\*|__/g, '').trim(), bullet: false, heading: false });
      continue;
    }
    const bullet = /^[-*•+]\s+/.test(line);
    const heading = /^#{2,4}\s+/.test(line);
    line = line.replace(/^(?:[-*•+]\s+)+/, '').replace(/^#{1,6}\s*/, '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
    if (line) out.push({ text: line, bullet, heading });
  }
  return out;
}
function extractFromPage(rawText, snippet, opts) {
  const ctx = opts || {};
  const pageTitleTokens = tokensOf(ctx.title || '').join(' ');
  const isIdentityHeading = (h) => {
    const ht = tokensOf(h);
    if (!ht.length) return false;
    if ((ctx.cands || []).some(c => findRun(ht, c))) return true; // tiêu đề chứa tên/model sản phẩm
    return !!pageTitleTokens && pageTitleTokens.indexOf(ht.join(' ')) >= 0; // trùng một phần tiêu đề trang
  };
  const lines = pageLines(String(rawText || '') + '\n' + String(snippet || ''));
  const specs = extractSpecs(lines.map(l => l.text).join('\n'));
  const specLike = (s) => /^[^:]{2,60}:\s*\S/.test(s) && Object.keys(specs).some(k => s.indexOf(k) === 0);
  const seen = new Set();
  const uniq = (s) => { const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; };
  const clean = lines.filter(l => !NOISE_LINE.test(l.text));
  const claims = clean.map(l => l.text).filter(s => s.length >= 25 && s.length <= 400 && uniq(s)).slice(0, 30);
  const isSpecLine = (t) => /^[^:]{2,60}:\s*\S*\d/.test(t) || specLike(t);
  const features = clean.filter(l => l.bullet && !UI_JUNK.test(l.text) && !isSpecLine(l.text) && ((l.text.length >= 20 && l.text.length <= 200 && l.text.split(/\s+/).length >= 4) || /^[A-Z][\w\- ]{2,40}(?:jacks?|ports?|inputs?|outputs?|connectors?)$/i.test(l.text))).map(l => l.text).slice(0, 12);
  // Trang prose (không bullet): cặp "## Tiêu đề" + đoạn văn ngay sau → một tính năng, nguyên văn câu đầu đủ ý của đoạn.
  const GENERIC_HEAD = /^(key features|features?|specifications?|specs|overview|description|support|downloads?|resources?|tutorials?|related|where to buy|contact|faq)$/i;
  const completeSentences = (t) => t.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => /[.!?]["”')]?$/.test(x));
  for (let i = 0; i < clean.length - 1 && features.length < 12; i++) {
    const h = clean[i], p = clean[i + 1];
    if (UI_JUNK.test(h.text) || UI_JUNK.test(p.text)) continue;
    if (!h.heading || p.heading || p.bullet || GENERIC_HEAD.test(h.text) || isIdentityHeading(h.text) || h.text.split(/\s+/).length > 8) continue;
    const sent = completeSentences(p.text).find(x => x.length >= 30 && x.length <= 220);
    if (sent) features.push(h.text + ': ' + sent);
  }
  const applications = [];
  for (const l of clean) {
    for (const sent of l.text.split(/(?<=[.!?])\s+/)) {
      const s = sent.trim();
      if (s.length >= 30 && s.length <= 250 && USE_CUE.test(s) && applications.indexOf(s) < 0) applications.push(s);
      if (applications.length >= 8) break;
    }
    if (applications.length >= 8) break;
  }
  let description = '';
  for (const l of clean) {
    if (l.bullet || specLike(l.text) || l.text.length < 60 || l.text.split(/\s+/).length < 8) continue;
    const sents = completeSentences(l.text).slice(0, 2);
    if (!sents.length) continue; // đoạn bị cắt dở giữa câu: không dùng
    description = sents.join(' ').slice(0, 500);
    break;
  }
  return { claims, specs, features, applications, description };
}

async function tavilyRequest(q, cfg, doFetch, withRaw) {
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.key) headers.Authorization = 'Bearer ' + cfg.key;
  else headers['X-Tavily-Access-Mode'] = 'keyless';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const body = { query: q, max_results: 8, search_depth: 'advanced', include_answer: false, include_raw_content: !!withRaw };
    const r = await doFetch('https://api.tavily.com/search', { method: 'POST', headers, signal: ctrl.signal, body: JSON.stringify(body) });
    let data = null; try { data = await r.json(); } catch (e) { data = null; }
    return { r, data };
  } finally { clearTimeout(timer); }
}

function exactHasUsableContent(item, cands) {
  const ex = extractFromPage(item.x.raw_content, item.x.content, { title: item.x.title, cands });
  return hasUsableContent({
    specs: ex.specs,
    features: ex.features,
    applications: ex.applications,
    product: { description: ex.description },
    sources: [{ claims: ex.claims, description: ex.description }]
  });
}

async function tavilyProvider(query, cfg, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const cands = candidateSets(query);
  if (!cands.length) {
    return { matchedSku: '', rejectReason: 'unverifiable_query', failureStage: 'search', sources: [],
      warnings: ['Tên/mã quá chung để xác minh đúng sản phẩm (cần model có số hoặc ít nhất 2 từ nhận diện) — chưa tra cứu.'] };
  }

  const queries = buildQueries(query);
  const searchQueries = [];
  const seenUrls = new Set();
  const collected = [];
  let rejected = 0;
  let sawResults = false;
  const perRequestMs = Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + perRequestMs;
  let budgetExhausted = false;

  for (const q of queries) {
    let remaining = deadline - Date.now();
    if (remaining <= 0) { budgetExhausted = true; break; }
    const queryCfg = Object.assign({}, cfg, { timeoutMs: Math.max(1, Math.min(perRequestMs, remaining)) });
    // Full page content first; providers/keyless modes may reject include_raw_content.
    let res = await tavilyRequest(q, queryCfg, doFetch, true);
    if ((!res.r.ok || !res.data || !Array.isArray(res.data.results)) && (res.r.status === 400 || res.r.status === 422)) {
      remaining = deadline - Date.now();
      if (remaining <= 0) { budgetExhausted = true; break; }
      const retryCfg = Object.assign({}, queryCfg, { timeoutMs: Math.max(1, Math.min(queryCfg.timeoutMs, remaining)) });
      res = await tavilyRequest(q, retryCfg, doFetch, false);
    }
    const { r, data } = res;
    if (!r.ok || !data || !Array.isArray(data.results)) {
      const e = new Error((data && data.detail) || ('tavily HTTP ' + r.status)); e.code = 'provider_error'; e.status = r.status; throw e;
    }
    searchQueries.push(q);
    if (data.results.length) sawResults = true;
    for (const x of data.results) {
      if (!x || !x.url || !safeUrl(x.url)) { rejected++; continue; }
      if (seenUrls.has(x.url)) continue;
      seenUrls.add(x.url);
      if (!relevantToQuery(x, query)) { rejected++; continue; }
      const match = classifyMatch(x, cands, query);
      if (match.level === 'mismatch' || match.level === 'related_model') { rejected++; continue; }
      const official = isOfficialUrl(x.url, cfg.officialDomains);
      collected.push({ x, match, official, type: sourceTypeFor(x.url, official) });
    }
    // Do not stop on an exact identity with no usable content: a manual/spec query may still
    // provide the evidence. Family-only results never fill facts and do not stop the loop.
    if (collected.some(item => item.match.level === 'exact_model' && exactHasUsableContent(item, cands))) break;
  }

  if (budgetExhausted && !collected.length) {
    const e = new Error('research budget exhausted'); e.name = 'AbortError'; throw e;
  }
  if (!sawResults) {
    return { matchedSku: '', rejectReason: 'no_search_results', failureStage: 'search', matchLevel: 'mismatch',
      searchQueries, sources: [], warnings: ['Không có kết quả tìm kiếm cho sản phẩm "' + (query.sku || query.name) + '".'] };
  }

  const exact = collected.filter(item => item.match.level === 'exact_model');
  const family = collected.filter(item => item.match.level === 'product_family');
  const uncertain = collected.filter(item => item.match.level === 'uncertain');

  // Multiple exact variants are ambiguous; do not choose one by rank.
  const exactModels = Array.from(new Set(exact.map(item => item.match.model)));
  if (exactModels.length > 1) {
    return { matchedSku: '', rejectReason: 'identity_uncertain', failureStage: 'matching', matchLevel: 'uncertain',
      searchQueries, candidates: exactModels, sources: [],
      warnings: ['Nhiều biến thể model cùng khớp "' + (query.sku || query.name) + '"; chưa chọn model cụ thể.'] };
  }

  if (!exact.length) {
    if (family.length) {
      const sources = family.slice(0, 4).map(item => ({
        title: String(item.x.title || item.x.url).trim(),
        url: item.x.url,
        type: item.type,
        matchLevel: 'product_family',
        claims: [],
        specs: {},
        features: [],
        applications: [],
        description: ''
      }));
      return {
        matchedSku: '',
        matchLevel: 'product_family',
        identityStatus: 'product_family_exact_unresolved',
        searchQueries,
        verification: { verified: false, evidence: family.slice(0, 4).map(item => ({ url: item.x.url, where: item.match.where || 'content', matched: item.match.family || '' })) },
        contentLevel: 'snippet',
        product: { name: String(family[0].x.title || query.name || '').trim(), model: null, brand: query.brand || null, category: query.category || null, description: null },
        sources,
        warnings: ['Đã nhận diện dòng sản phẩm nhưng chưa xác minh được model chính xác; không dùng thông số của model/dòng khác.']
      };
    }
    const reason = uncertain.length ? 'identity_uncertain' : 'no_matching_source';
    const warnings = uncertain.length
      ? ['Có nội dung nguồn nhưng chưa xác định được đúng model/phiên bản "' + (query.sku || query.name) + '".']
      : ['Không nguồn nào có tiêu đề, URL hoặc nội dung khớp đúng model "' + (query.sku || query.name) + '" (đã loại ' + rejected + ' kết quả khác model/thế hệ/biến thể).'];
    return { matchedSku: '', rejectReason: reason, failureStage: 'matching', matchLevel: uncertain.length ? 'uncertain' : 'mismatch',
      searchQueries, sources: [], warnings };
  }

  exact.sort((a, b) => sourceRank(a.type) - sourceRank(b.type) || (a.match.where === 'title' ? 0 : 1) - (b.match.where === 'title' ? 0 : 1));
  // Chỉ exact-model pages contribute specs; family/related pages never fill this product's facts.
  const extracted = exact.slice(0, 6).map((item) => {
    const ex = extractFromPage(item.x.raw_content, item.x.content, { title: item.x.title, cands });
    const richness = Object.keys(ex.specs).length * 3 + ex.features.length * 2 + ex.applications.length * 2 + (ex.description ? 3 : 0) + Math.min(ex.claims.length, 10);
    return Object.assign({}, item, { ex, richness });
  });
  extracted.sort((a, b) => sourceRank(a.type) - sourceRank(b.type) || b.richness - a.richness);
  const top = extracted.slice(0, 4);
  const sources = top.map(({ x, type, ex }) => ({ title: String(x.title || x.url).trim(), url: x.url, type, matchLevel: 'exact_model',
    claims: ex.claims, specs: ex.specs, features: ex.features, applications: ex.applications, description: ex.description }));
  const best = top[0];
  const title = String(best.x.title || '').replace(/\s*[–|]\s*.*$/, '').replace(/\s*-\s*(White|Black|Single|Pair)$/i, '').trim();
  const productName = best.match.where === 'title' ? (title || query.name) : (query.name || title);
  const descSrc = sources.find(s => s.description);
  return {
    matchedSku: best.match.model,
    matchLevel: 'exact_model',
    identityStatus: 'exact_model_matched',
    searchQueries,
    verification: { verified: true, evidence: top.map(t => ({ url: t.x.url, where: t.match.where, matched: t.match.matched })) },
    contentLevel: top.some(t => typeof t.x.raw_content === 'string' && t.x.raw_content.length > 200) ? 'page' : 'snippet',
    product: { name: productName || null, model: best.match.model, brand: query.brand || null, category: query.category || null, description: descSrc ? descSrc.description : null },
    sources
  };
}

async function defaultProvider(query, cfg, fetchImpl) {
  if (cfg.provider === 'tavily') return tavilyProvider(query, cfg, fetchImpl);
  if (!cfg.configured) {
    const e = new Error('web research chưa được cấu hình');
    e.code = 'unconfigured';
    throw e;
  }
  const doFetch = fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const r = await doFetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify({ sku: query.sku || '', name: query.name || '', category: query.category || '', specs: query.specs || '' }),
      signal: ctrl.signal
    });
    let data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok || !data || data.ok === false) {
      const e = new Error((data && data.message) || ('research HTTP ' + r.status));
      e.code = 'provider_error';
      e.status = r.status;
      throw e;
    }
    return data;
  } finally { clearTimeout(timer); }
}

function validateSource(s) {
  if (!s || typeof s !== 'object') return null;
  const url = safeUrl(s.url);
  if (!url) return null;
  const type = SOURCE_TYPES.indexOf(s.type) >= 0 ? s.type : 'other';
  const allowedLevels = ['exact_model', 'product_family', 'related_model', 'uncertain', 'mismatch'];
  const matchLevel = allowedLevels.indexOf(s.matchLevel) >= 0 ? s.matchLevel : 'exact_model';
  const claims = Array.isArray(s.claims) ? s.claims.map(x => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
  const specs = s.specs && typeof s.specs === 'object' && !Array.isArray(s.specs) ? s.specs : {};
  const features = Array.isArray(s.features) ? s.features.map(x => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
  const applications = Array.isArray(s.applications) ? s.applications.map(x => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
  const description = String(s.description || '').trim().slice(0, 600);
  return { title: String(s.title || '').trim().slice(0, 300) || url, url, type, matchLevel, claims, specs, features, applications, description };
}

function mergeFacts(sources) {
  const exact = sources.filter(s => (s.matchLevel || 'exact_model') === 'exact_model');
  const official = exact.filter(s => s.type === 'official');
  // Khi có nguồn hãng, chỉ thông số từ nguồn hãng mới được coi là verified.
  const specSources = official.length ? official : exact;
  const specValues = {};
  for (const s of specSources) {
    for (const k of Object.keys(s.specs || {})) {
      const key = String(k || '').trim(); const val = String(s.specs[k] == null ? '' : s.specs[k]).trim();
      if (!key || !val) continue;
      (specValues[key] = specValues[key] || []).push({ val, source: s });
    }
  }
  const specs = {}; const conflicts = [];
  for (const key of Object.keys(specValues)) {
    const vals = Array.from(new Set(specValues[key].map(x => x.val)));
    if (vals.length === 1) specs[key] = vals[0];
    else conflicts.push({
      key,
      values: vals,
      sources: Array.from(new Set(specValues[key].map(x => x.source.url)))
    });
  }
  const pool = official.length ? official : exact;
  return {
    specs,
    conflicts,
    features: Array.from(new Set(pool.flatMap(s => s.features || []))).slice(0, 20),
    applications: Array.from(new Set(pool.flatMap(s => s.applications || []))).slice(0, 20)
  };
}

function normalizeResearch(query, payload) {
  const warnings = [];
  const failureStage = payload && payload.failureStage || null;
  const matchLevel = payload && payload.matchLevel || null;
  // Provider đã tự từ chối (không đủ dữ liệu định danh / không nguồn nào khớp model): ghi rõ lý do, không có dữ liệu cho writer.
  if (payload && payload.rejectReason) {
    return {
      status: 'rejected',
      reason: String(payload.rejectReason),
      failureStage: failureStage || 'matching',
      matchLevel: matchLevel || 'mismatch',
      query,
      sources: [],
      warnings: Array.isArray(payload.warnings) && payload.warnings.length ? payload.warnings.map(String) : ['Chưa xác minh được đúng sản phẩm.'],
      searchQueries: Array.isArray(payload.searchQueries) ? payload.searchQueries : undefined,
      schema: RESEARCH_SCHEMA
    };
  }

  const product = payload && payload.product && typeof payload.product === 'object' ? payload.product : {};
  const familyMatch = payload && payload.matchLevel === 'product_family';
  const evidenceVerified = !!(payload && payload.verification && payload.verification.verified === true);
  const matchedSku = familyMatch ? '' : String(payload && payload.matchedSku || product.model || '').trim();

  if (!familyMatch) {
    const qGen = genTokens((query.sku || '') + ' ' + (query.name || '') + ' ' + (query.generation || ''));
    const pGen = genTokens((matchedSku || '') + ' ' + (product.model || '') + ' ' + (product.name || ''));
    if (qGen.length && pGen.length && !qGen.every(t => pGen.includes(t))) {
      return { status: 'rejected', reason: 'wrong_generation', failureStage: 'matching', matchLevel: 'related_model', query, sources: [], warnings: ['Nguồn trả về khác thế hệ/model: ' + pGen.join(', ') + ' ≠ ' + qGen.join(', ')] };
    }
    const q = normalize(query.sku || query.name);
    const m = normalize(matchedSku || product.model || product.name);
    // Provider có bằng chứng trong nguồn (tiêu đề/URL/nội dung chứa đúng model) thì matchedSku là chuỗi lấy TỪ NGUỒN, không so với query.
    if (!evidenceVerified && (!q || !m || !(m === q || m.includes(q) || q.includes(m)))) {
      return { status: 'rejected', reason: 'model_mismatch', failureStage: 'matching', matchLevel: 'mismatch', query, sources: [], warnings: ['Không xác minh được đúng model/SKU: ' + (matchedSku || '(trống)')] };
    }
  }

  const sources = (Array.isArray(payload && payload.sources) ? payload.sources : [])
    .map(validateSource).filter(Boolean)
    .sort((a, b) => sourceRank(a.type) - sourceRank(b.type));
  if (!sources.length) return { status: 'rejected', reason: 'no_sources', failureStage: 'matching', matchLevel: matchLevel || 'mismatch', query, sources: [], warnings: ['Không có nguồn HTTPS hợp lệ.'] };
  const rawFacts = mergeFacts(sources);
  const conflicts = rawFacts.conflicts;
  stripConflictClaims(sources, conflicts);
  const facts = mergeFacts(sources);
  for (const c of conflicts) warnings.push('Thông số mâu thuẫn giữa các nguồn, đã bỏ: ' + c.key + ' (' + c.values.join(' / ') + ')');
  if (!sources.some(s => s.type === 'official')) warnings.push('Không có nguồn hãng chính thức; chỉ dùng nguồn phân phối/khác.');

  const hasOfficial = sources.some(s => s.type === 'official');
  const familyExplicitSku = familyMatch && !!String(query.sku || '').trim()
    && (hasModelCode(query.sku) || sizesOf(query.sku).length > 0);
  const resolvedLevel = familyMatch ? 'product_family' : 'exact_model';
  const status = familyExplicitSku ? 'rejected' : (familyMatch ? 'partial' : (hasOfficial ? 'verified' : 'partial'));
  const contentStatus = hasUsableContent({
    specs: familyMatch ? {} : facts.specs,
    features: familyMatch ? [] : facts.features,
    applications: familyMatch ? [] : facts.applications,
    product,
    sources
  }) ? 'sufficient' : 'insufficient';
  return {
    status,
    query,
    matchedSku: matchedSku || null,
    matchLevel: resolvedLevel,
    identityStatus: familyMatch ? 'product_family_exact_unresolved' : 'exact_model_matched',
    failureStage: familyExplicitSku ? 'matching' : null,
    ...(familyExplicitSku ? { reason: 'product_family_exact_unresolved' } : {}),
    product: {
      name: String(product.name || '').trim().slice(0, 200) || null,
      brand: String(product.brand || '').trim().slice(0, 120) || null,
      model: familyMatch ? null : String(product.model || '').trim().slice(0, 160) || null,
      category: String(product.category || '').trim().slice(0, 120) || null,
      description: String(product.description || '').trim().slice(0, 2000) || null,
      warranty: String(product.warranty || '').trim().slice(0, 200) || null,
      origin: String(product.origin || '').trim().slice(0, 200) || null
    },
    specs: familyMatch ? {} : facts.specs,
    features: familyMatch ? [] : facts.features,
    applications: familyMatch ? [] : facts.applications,
    sources,
    sourceTypes: sources.reduce((acc, s) => { acc[s.type] = (acc[s.type] || 0) + 1; return acc; }, {}),
    conflicts,
    warnings: warnings.concat(Array.isArray(payload && payload.warnings) ? payload.warnings.map(String) : []),
    verification: evidenceVerified ? { verified: true, evidence: (Array.isArray(payload.verification.evidence) ? payload.verification.evidence : []).slice(0, 6) } : null,
    contentLevel: payload && payload.contentLevel === 'page' ? 'page' : 'snippet',
    contentStatus,
    searchQueries: Array.isArray(payload && payload.searchQueries) ? payload.searchQueries : undefined,
    schema: RESEARCH_SCHEMA,
    fetchedAt: Date.now()
  };
}

function cacheMatchesQuery(hit, query) {
  if (!hit || (hit.status !== 'verified' && hit.status !== 'partial')) return false;
  if (hit.schema !== RESEARCH_SCHEMA) return false; // old/unsafe schema is invalid
  if (hit.matchLevel && hit.matchLevel !== 'exact_model') return false;
  if (!identityComplete(query)) return false; // no exact cache answer from an incomplete identity
  const p = hit.product || {};
  const synthetic = {
    title: [hit.matchedSku, p.model, p.name, p.brand].filter(Boolean).join(' '),
    url: '',
    content: '',
    raw_content: ''
  };
  const ev = matchEvidence(synthetic, candidateSets(query), query);
  return !!ev;
}

async function cacheGet(key, cache) {
  if (!cache) return null;
  try {
    const v = await cache.get(key);
    if (!v || !v.at || Date.now() - Number(v.at) > CACHE_TTL_MS || !v.data) return null;
    return Object.assign({}, v.data, { cache: 'hit' });
  } catch (e) { return null; }
}
async function cacheSet(key, data, cache) {
  if (!cache) return;
  try { await cache.set(key, { at: Date.now(), data }); } catch (e) { /* cache is optional */ }
}

// Kết quả xác minh nhưng RỖNG dữ kiện (không spec/tính năng/công dụng/mô tả/đoạn trích đủ dài) không đáng cache 7 ngày.
function isConflictingText(text, conflicts) {
  return conflicts.some(conflict => {
    const value = String(text || '');
    return value.toLowerCase().includes(String(conflict.key || '').toLowerCase())
      && conflict.values.some(v => value.includes(String(v)));
  });
}

function stripConflictClaims(sources, conflicts) {
  for (const source of sources) {
    source.claims = (source.claims || []).filter(claim => !isConflictingText(claim, conflicts));
    source.features = (source.features || []).filter(item => !isConflictingText(item, conflicts));
    source.applications = (source.applications || []).filter(item => !isConflictingText(item, conflicts));
    // Source-level specs are not part of the Writer contract, but remove disputed values there
    // too so no downstream consumer can accidentally treat them as facts.
    for (const key of Object.keys(source.specs || {})) {
      if (conflicts.some(c => c.key === key && c.values.includes(String(source.specs[key])))) {
        delete source.specs[key];
      }
    }
  }
}

function hasUsableContent(out) {
  if (!out) return false;
  if (out.specs && Object.keys(out.specs).length) return true;
  if ((out.features || []).length || (out.applications || []).length) return true;
  if (out.product && out.product.description) return true;
  return (out.sources || []).some(x => (x.claims || []).length >= 3 || x.description);
}

async function researchProduct(query, depsIn) {
  const deps = depsIn || {};
  const key = normalize(query && (query.sku || query.name));
  if (!key) return { status: 'rejected', reason: 'missing_query', failureStage: 'search', matchLevel: 'mismatch', sources: [], warnings: ['Thiếu SKU/tên để research.'] };
  const cache = deps.cache || {
    get: async (k) => { const s = await admin.database().ref(CACHE_NODE + '/' + k).once('value'); return s.val(); },
    set: async (k, v) => { await admin.database().ref(CACHE_NODE + '/' + k).set(v); }
  };
  const hit = await cacheGet(key, cache);
  if (hit && cacheMatchesQuery(hit, query)) return hit;
  const cfg = deps.config || configFromEnv();
  if (!cfg.configured) return { status: 'unconfigured', query, sources: [], warnings: ['Chưa cấu hình PSH_RESEARCH_URL + PSH_RESEARCH_API_KEY; không dùng AI knowledge thay web research.'] };
  let payload;
  try {
    payload = await (deps.provider || ((q) => defaultProvider(q, cfg, deps.fetchImpl)))(query);
  } catch (e) {
    const timeout = e && (e.name === 'AbortError' || /abort/i.test(String(e.message)));
    return { status: timeout ? 'timeout' : 'error', failureStage: 'retrieval', matchLevel: 'mismatch', query, sources: [],
      warnings: [timeout ? 'Web research quá thời gian chờ.' : 'Web research lỗi: ' + String(e && e.message || e).slice(0, 160)] };
  }
  const out = normalizeResearch(query, payload);
  if ((out.status === 'verified' || out.status === 'partial') && hasUsableContent(out)) await cacheSet(key, out, cache);
  return out;
}

module.exports = {
  RESEARCH_SCHEMA, candidateSets, matchEvidence, extractFromPage, hasUsableContent, researchProduct,
  configFromEnv, normalizeResearch, genTokens, normalize, tavilyProvider, isOfficialUrl,
  buildQueries, classifyMatch, familyTokens, sizesOf, sourceTypeFor
};
