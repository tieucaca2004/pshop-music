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
 *
 * Built-in providers (PSH_RESEARCH_PROVIDER):
 *   - "tavily": see tavilyProvider.
 *   - "google": see googleProvider. Uses "Grounding with Google Search" (the
 *     Gemini Developer API, generativelanguage.googleapis.com) to DISCOVER
 *     candidate source URLs only — Gemini's own generated text is never used
 *     as a fact source (same policy as model knowledge, see above). Each
 *     discovered URL is then fetched directly and run through the SAME
 *     extractFromPage/matchEvidence/caching/claim-grounding pipeline used by
 *     every other provider, so verified facts always come from the fetched
 *     page, never from the model. Needs PSH_RESEARCH_API_KEY (a Gemini API
 *     key). Google's older Custom Search JSON API is closed to new customers
 *     (per developers.google.com/custom-search/v1/overview as of 2026) and is
 *     not used here.
 */
'use strict';
const admin = require('firebase-admin');

const CACHE_NODE = 'productResearchCache';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15000;
// Phiên bản cấu trúc kết quả research. Cache cũ (không có schema này: chỉ snippet/xác minh theo query) bị bỏ qua.
const RESEARCH_SCHEMA = 2;

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
  const re = /\b(g(?:en(?:eration)?\s*)?\d{1,2}|mk\s*[ivx0-9]+|v\d{1,2})\b/gi;
  let m;
  while ((m = re.exec(String(s == null ? '' : s)))) {
    const raw = m[1].toLowerCase().replace(/\s+/g, '');
    const gm = raw.match(/^(?:g|gen|generation)(\d+)$/);
    out.push(gm ? 'g' + gm[1] : raw);
  }
  return Array.from(new Set(out));
}
function sourceRank(type) { return type === 'official' ? 0 : type === 'distributor' ? 1 : 2; }

function configFromEnv() {
  const url = String(process.env.PSH_RESEARCH_URL || '').trim();
  const key = String(process.env.PSH_RESEARCH_API_KEY || '').trim();
  const provider = String(process.env.PSH_RESEARCH_PROVIDER || '').trim().toLowerCase();
  const officialDomains = String(process.env.PSH_RESEARCH_OFFICIAL_DOMAINS || '').split(',').map(normalizeHost).filter(Boolean);
  const timeoutMs = Number(process.env.PSH_RESEARCH_TIMEOUT_MS) > 0 ? Number(process.env.PSH_RESEARCH_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS;
  // Tên model Gemini dùng cho Grounding with Google Search — override qua env để
  // không phải sửa code khi Google đổi/khai tử phiên bản model.
  const googleModel = String(process.env.PSH_RESEARCH_GOOGLE_MODEL || '').trim() || 'gemini-2.0-flash';
  const tavily = provider === 'tavily';
  const google = provider === 'google';
  return { url, key, provider, officialDomains, timeoutMs, googleModel, configured: tavily || (google && !!key) || (!!url && !!key && !!safeUrl(url)) };
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
  const skuT = identTokens(query.sku); const nameT = identTokens(query.name);
  add(skuT); add(nameT);
  // Bỏ dần token đầu (thương hiệu có thể 1-2 từ: "Pioneer", "Pioneer DJ") miễn phần còn lại vẫn đủ đặc trưng.
  for (const toks of [nameT, skuT]) for (let k = 1; toks.length - k >= 2; k++) add(toks.slice(k));
  return sets;
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
// Trả về { where, matched } nếu TIÊU ĐỀ hoặc URL của kết quả chứa đúng model; null nếu không.
function matchEvidence(result, cands, query) {
  const headTokens = tokensOf((result.title || '') + ' ' + urlWords(result.url));
  const headOnlyTitle = tokensOf(result.title || '');
  for (const cand of cands) {
    const inTitle = findRun(headOnlyTitle, cand);
    // Trang phụ kiện/tương thích ("Case for DDJ-400", "Bag compatible with X") không phải trang của chính model.
    if (inTitle && ACCESSORY_LEAD.has(headOnlyTitle[inTitle.start - 1] || '')) continue;
    if (inTitle && VARIANT_SUFFIX.test(headOnlyTitle[inTitle.start + inTitle.run.length] || '')) continue;
    let hit = inTitle;
    if (!hit) {
      const urlTokens = tokensOf(urlWords(result.url));
      hit = findRun(urlTokens, cand);
      if (hit && VARIANT_SUFFIX.test(urlTokens[hit.start + hit.run.length] || '')) hit = null;
    }
    const run = hit && hit.run;
    if (run) {
      if (query && query.brand) {
        const brand = foldText(query.brand).replace(/[^a-z0-9]/g, '');
        const hay = foldText((result.title || '') + ' ' + urlWords(result.url) + ' ' + String(result.content || '').slice(0, 3000)).replace(/[^a-z0-9]/g, '');
        if (brand && hay.indexOf(brand) < 0) return null;
      }
      // model = bộ token NGẮN NHẤT còn khớp được trong cùng nguồn (bỏ tên thương hiệu), vd "DDJ 400" thay vì "PIONEER DJ DDJ 400".
      const shortest = cands.filter(c2 => findRun(inTitle ? headOnlyTitle : headTokens, c2)).sort((a, b) => a.join('').length - b.join('').length)[0] || cand;
      return { where: inTitle ? 'title' : 'url', matched: run.join(' ').toUpperCase(), model: shortest.join(' ').toUpperCase() };
    }
  }
  return null;
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

async function tavilyProvider(query, cfg, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const cands = candidateSets(query);
  if (!cands.length) {
    return { matchedSku: '', rejectReason: 'unverifiable_query', sources: [],
      warnings: ['Tên/mã quá chung để xác minh đúng sản phẩm (cần model có số hoặc ít nhất 2 từ nhận diện) — chưa tra cứu.'] };
  }
  const idPart = [query.sku, query.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ');
  const q = (idPart + ' official specifications features').slice(0, 380);
  // Ưu tiên nội dung trang đầy đủ; nếu provider/chế độ keyless từ chối tham số này thì quay về snippet.
  let res = await tavilyRequest(q, cfg, doFetch, true);
  if ((!res.r.ok || !res.data || !Array.isArray(res.data.results)) && (res.r.status === 400 || res.r.status === 422)) {
    res = await tavilyRequest(q, cfg, doFetch, false);
  }
  const { r, data } = res;
  if (!r.ok || !data || !Array.isArray(data.results)) {
    const e = new Error((data && data.detail) || ('tavily HTTP ' + r.status)); e.code = 'provider_error'; e.status = r.status; throw e;
  }
  const accepted = [];
  let rejected = 0;
  for (const x of data.results) {
    if (!x || !x.url || !safeUrl(x.url) || !relevantToQuery(x, query)) { rejected++; continue; }
    const ev = matchEvidence(x, cands, query);
    if (!ev) { rejected++; continue; }
    accepted.push({ x, ev, official: isOfficialUrl(x.url, cfg.officialDomains) });
  }
  if (!accepted.length) {
    return { matchedSku: '', rejectReason: 'no_matching_source', sources: [],
      warnings: ['Không nguồn nào có tiêu đề/URL khớp đúng model "' + (query.sku || query.name) + '" (đã loại ' + rejected + ' kết quả khác model/thế hệ/biến thể).'] };
  }
  accepted.sort((a, b) => (a.official ? 0 : 1) - (b.official ? 0 : 1) || (a.ev.where === 'title' ? 0 : 1) - (b.ev.where === 'title' ? 0 : 1));
  // Trích tối đa 6 nguồn khớp, rồi giữ 4 nguồn giàu nội dung nhất (nguồn hãng luôn đứng trước).
  const extracted = accepted.slice(0, 6).map((a) => {
    const ex = extractFromPage(a.x.raw_content, a.x.content, { title: a.x.title, cands });
    const richness = Object.keys(ex.specs).length * 3 + ex.features.length * 2 + ex.applications.length * 2 + (ex.description ? 3 : 0) + Math.min(ex.claims.length, 10);
    return Object.assign({}, a, { ex, richness });
  });
  extracted.sort((a, b) => (a.official ? 0 : 1) - (b.official ? 0 : 1) || b.richness - a.richness);
  const top = extracted.slice(0, 4);
  const sources = top.map(({ x, official, ex }) => ({ title: String(x.title || x.url).trim(), url: x.url, type: official ? 'official' : 'other',
    claims: ex.claims, specs: ex.specs, features: ex.features, applications: ex.applications, description: ex.description }));
  const best = top[0];
  const title = String(best.x.title || '').replace(/\s*[–|]\s*.*$/, '').replace(/\s*-\s*(White|Black|Single|Pair)$/i, '').trim();
  const descSrc = sources.find(s => s.description);
  return {
    matchedSku: best.ev.model,
    verification: { verified: true, evidence: top.map(t => ({ url: t.x.url, where: t.ev.where, matched: t.ev.matched })) },
    contentLevel: top.some(t => typeof t.x.raw_content === 'string' && t.x.raw_content.length > 200) ? 'page' : 'snippet',
    product: { name: title || query.name || null, model: best.ev.model, brand: query.brand || null, category: query.category || null, description: descSrc ? descSrc.description : null },
    sources
  };
}

// ── Google provider: Grounding with Google Search (Gemini Developer API) ──
// Dùng để TÌM url, không dùng câu trả lời của Gemini làm dữ kiện (xem đầu file).
// Mỗi url tìm được sẽ bị tải lại và chạy qua extractFromPage/matchEvidence như
// mọi provider khác — dữ kiện verified luôn lấy từ trang thật, không từ model.
const GOOGLE_GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
const GOOGLE_PAGE_FETCH_TIMEOUT_MS = 8000;

async function googleGroundedSearch(q, cfg, doFetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const url = GOOGLE_GENERATE_URL + encodeURIComponent(cfg.googleModel) + ':generateContent?key=' + encodeURIComponent(cfg.key);
    const body = { contents: [{ parts: [{ text: q }] }], tools: [{ google_search: {} }] };
    const r = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify(body) });
    let data = null; try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok || !data) {
      const e = new Error((data && data.error && data.error.message) || ('google HTTP ' + r.status)); e.code = 'provider_error'; e.status = r.status; throw e;
    }
    return extractGroundedUrls(data);
  } finally { clearTimeout(timer); }
}

// Chịu được 2 dạng phản hồi đã thấy trong tài liệu Google (groundingChunks kiểu
// Vertex/Gemini generateContent cũ, và url_citation annotations kiểu Interactions
// API mới hơn) — CHƯA XÁC MINH bằng API key thật, xem ghi chú trong báo cáo.
function extractGroundedUrls(data) {
  const out = [];
  const seen = new Set();
  const add = (uri, title) => {
    const safe = safeUrl(uri);
    if (!safe || seen.has(safe)) return;
    seen.add(safe);
    out.push({ title: String(title || '').trim(), url: safe });
  };
  const candidates = Array.isArray(data && data.candidates) ? data.candidates : [];
  for (const c of candidates) {
    const chunks = c && c.groundingMetadata && Array.isArray(c.groundingMetadata.groundingChunks) ? c.groundingMetadata.groundingChunks : [];
    for (const ch of chunks) {
      const web = ch && ch.web;
      if (web && web.uri) add(web.uri, web.title);
    }
    const parts = c && c.content && Array.isArray(c.content.parts) ? c.content.parts : [];
    for (const p of parts) {
      const anns = Array.isArray(p && p.annotations) ? p.annotations : [];
      for (const a of anns) {
        const cite = a && a.url_citation;
        if (cite && cite.url) add(cite.url, cite.title);
      }
    }
  }
  // Dạng Interactions API thay thế (steps-based) — kiểm thêm phòng khi response ở dạng này.
  const steps = Array.isArray(data && data.output) ? data.output : [];
  for (const s of steps) {
    const anns = Array.isArray(s && s.content) ? s.content : [];
    for (const block of anns) {
      const cites = Array.isArray(block && block.annotations) ? block.annotations : [];
      for (const a of cites) {
        const cite = a && a.url_citation;
        if (cite && cite.url) add(cite.url, cite.title);
      }
    }
  }
  return out;
}

async function fetchPageForExtraction(url, doFetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GOOGLE_PAGE_FETCH_TIMEOUT_MS);
  try {
    const r = await doFetch(url, { method: 'GET', signal: ctrl.signal });
    if (!r || !r.ok) return '';
    const text = await r.text();
    return htmlToText(text);
  } catch (e) {
    return ''; // Một nguồn tải lỗi không chặn các nguồn khác — extractFromPage vẫn nhận chuỗi rỗng an toàn.
  } finally { clearTimeout(timer); }
}

// Cắt bớt <script>/<style>/comment trước khi đưa vào pageLines (đã tự strip tag
// còn lại) — tránh JS/CSS lẫn vào claims/specs khi tải HTML thô (khác Tavily, vốn
// tự trả content đã làm sạch).
function htmlToText(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n')
    .slice(0, 60000);
}

async function googleProvider(query, cfg, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const cands = candidateSets(query);
  if (!cands.length) {
    return { matchedSku: '', rejectReason: 'unverifiable_query', sources: [],
      warnings: ['Tên/mã quá chung để xác minh đúng sản phẩm (cần model có số hoặc ít nhất 2 từ nhận diện) — chưa tra cứu.'] };
  }
  const idPart = [query.sku, query.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ');
  const q = (idPart + ' official specifications features').slice(0, 380);
  const found = await googleGroundedSearch(q, cfg, doFetch);
  if (!found.length) {
    return { matchedSku: '', rejectReason: 'no_matching_source', sources: [],
      warnings: ['Google Search không trả về nguồn nào cho "' + (query.sku || query.name) + '".'] };
  }
  // Tải tối đa 6 url đầu (cùng giới hạn với Tavily) rồi chạy qua đúng pipeline chấp nhận/loại chung.
  const candidates = found.slice(0, 6);
  const pages = await Promise.all(candidates.map((c) => fetchPageForExtraction(c.url, doFetch)));
  const results = candidates.map((c, i) => ({ title: c.title, url: c.url, content: pages[i], raw_content: pages[i] }));

  const accepted = [];
  let rejected = 0;
  for (const x of results) {
    if (!x.url || !relevantToQuery(x, query)) { rejected++; continue; }
    const ev = matchEvidence(x, cands, query);
    if (!ev) { rejected++; continue; }
    accepted.push({ x, ev, official: isOfficialUrl(x.url, cfg.officialDomains) });
  }
  if (!accepted.length) {
    return { matchedSku: '', rejectReason: 'no_matching_source', sources: [],
      warnings: ['Không nguồn nào có tiêu đề/URL khớp đúng model "' + (query.sku || query.name) + '" (đã loại ' + rejected + ' kết quả khác model/thế hệ/biến thể).'] };
  }
  accepted.sort((a, b) => (a.official ? 0 : 1) - (b.official ? 0 : 1) || (a.ev.where === 'title' ? 0 : 1) - (b.ev.where === 'title' ? 0 : 1));
  const extracted = accepted.map((a) => {
    const ex = extractFromPage(a.x.raw_content, a.x.content, { title: a.x.title, cands });
    const richness = Object.keys(ex.specs).length * 3 + ex.features.length * 2 + ex.applications.length * 2 + (ex.description ? 3 : 0) + Math.min(ex.claims.length, 10);
    return Object.assign({}, a, { ex, richness });
  });
  extracted.sort((a, b) => (a.official ? 0 : 1) - (b.official ? 0 : 1) || b.richness - a.richness);
  const top = extracted.slice(0, 4);
  const sources = top.map(({ x, official, ex }) => ({ title: String(x.title || x.url).trim(), url: x.url, type: official ? 'official' : 'other',
    claims: ex.claims, specs: ex.specs, features: ex.features, applications: ex.applications, description: ex.description }));
  const best = top[0];
  const title = String(best.x.title || '').replace(/\s*[–|]\s*.*$/, '').replace(/\s*-\s*(White|Black|Single|Pair)$/i, '').trim();
  const descSrc = sources.find(s => s.description);
  return {
    matchedSku: best.ev.model,
    verification: { verified: true, evidence: top.map(t => ({ url: t.x.url, where: t.ev.where, matched: t.ev.matched })) },
    contentLevel: top.some(t => typeof t.x.raw_content === 'string' && t.x.raw_content.length > 200) ? 'page' : 'snippet',
    product: { name: title || query.name || null, model: best.ev.model, brand: query.brand || null, category: query.category || null, description: descSrc ? descSrc.description : null },
    sources
  };
}

async function defaultProvider(query, cfg, fetchImpl) {
  if (cfg.provider === 'tavily') return tavilyProvider(query, cfg, fetchImpl);
  if (cfg.provider === 'google') return googleProvider(query, cfg, fetchImpl);
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
  const type = ['official', 'distributor', 'other'].indexOf(s.type) >= 0 ? s.type : 'other';
  const claims = Array.isArray(s.claims) ? s.claims.map(x => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
  const specs = s.specs && typeof s.specs === 'object' && !Array.isArray(s.specs) ? s.specs : {};
  const features = Array.isArray(s.features) ? s.features.map(x => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
  const applications = Array.isArray(s.applications) ? s.applications.map(x => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
  const description = String(s.description || '').trim().slice(0, 600);
  return { title: String(s.title || '').trim().slice(0, 300) || url, url, type, claims, specs, features, applications, description };
}

function mergeFacts(sources) {
  const official = sources.filter(s => s.type === 'official');
  // Khi có nguồn hãng, chỉ thông số từ nguồn hãng mới được coi là verified.
  const specSources = official.length ? official : sources;
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
    else conflicts.push({ key, values: vals });
  }
  const pool = official.length ? official : sources;
  return {
    specs,
    conflicts,
    features: Array.from(new Set(pool.flatMap(s => s.features || []))).slice(0, 20),
    applications: Array.from(new Set(pool.flatMap(s => s.applications || []))).slice(0, 20)
  };
}

function normalizeResearch(query, payload) {
  const warnings = [];
  // Provider đã tự từ chối (không đủ dữ liệu định danh / không nguồn nào khớp model): ghi rõ lý do, không có dữ liệu cho writer.
  if (payload && payload.rejectReason) {
    return { status: 'rejected', reason: String(payload.rejectReason), query, sources: [], warnings: Array.isArray(payload.warnings) && payload.warnings.length ? payload.warnings.map(String) : ['Chưa xác minh được đúng sản phẩm.'], schema: RESEARCH_SCHEMA };
  }
  const evidenceVerified = !!(payload && payload.verification && payload.verification.verified === true);
  const product = payload && payload.product && typeof payload.product === 'object' ? payload.product : {};
  const matchedSku = String(payload && payload.matchedSku || product.model || '').trim();
  const qGen = genTokens((query.sku || '') + ' ' + (query.name || ''));
  const pGen = genTokens((matchedSku || '') + ' ' + (product.model || '') + ' ' + (product.name || ''));
  if (qGen.length && pGen.length && !qGen.every(t => pGen.includes(t))) {
    return { status: 'rejected', reason: 'wrong_generation', query, sources: [], warnings: ['Nguồn trả về khác thế hệ/model: ' + pGen.join(', ') + ' ≠ ' + qGen.join(', ')] };
  }
  const q = normalize(query.sku || query.name);
  const m = normalize(matchedSku || product.model || product.name);
  // Provider có bằng chứng trong nguồn (tiêu đề/URL chứa đúng model) thì matchedSku là chuỗi lấy TỪ NGUỒN, không so với query.
  if (!evidenceVerified && (!q || !m || !(m === q || m.includes(q) || q.includes(m)))) {
    return { status: 'rejected', reason: 'model_mismatch', query, sources: [], warnings: ['Không xác minh được đúng model/SKU: ' + (matchedSku || '(trống)')] };
  }
  const sources = (Array.isArray(payload && payload.sources) ? payload.sources : []).map(validateSource).filter(Boolean).sort((a, b) => sourceRank(a.type) - sourceRank(b.type));
  if (!sources.length) return { status: 'rejected', reason: 'no_sources', query, sources: [], warnings: ['Không có nguồn HTTPS hợp lệ.'] };
  const facts = mergeFacts(sources);
  for (const c of facts.conflicts) warnings.push('Thông số mâu thuẫn giữa các nguồn, đã bỏ: ' + c.key + ' (' + c.values.join(' / ') + ')');
  if (!sources.some(s => s.type === 'official')) warnings.push('Không có nguồn hãng chính thức; chỉ dùng nguồn phân phối/khác.');
  const hasOfficial = sources.some(s => s.type === 'official');
  return {
    status: hasOfficial ? 'verified' : 'partial',
    query,
    matchedSku: matchedSku || null,
    product: {
      name: String(product.name || '').trim().slice(0, 200) || null,
      brand: String(product.brand || '').trim().slice(0, 120) || null,
      model: String(product.model || '').trim().slice(0, 160) || null,
      category: String(product.category || '').trim().slice(0, 120) || null,
      description: String(product.description || '').trim().slice(0, 2000) || null,
      warranty: String(product.warranty || '').trim().slice(0, 200) || null,
      origin: String(product.origin || '').trim().slice(0, 200) || null
    },
    specs: facts.specs,
    features: facts.features,
    applications: facts.applications,
    sources,
    warnings: warnings.concat(Array.isArray(payload && payload.warnings) ? payload.warnings.map(String) : []),
    verification: evidenceVerified ? { verified: true, evidence: (Array.isArray(payload.verification.evidence) ? payload.verification.evidence : []).slice(0, 6) } : null,
    contentLevel: payload && payload.contentLevel === 'page' ? 'page' : 'snippet',
    schema: RESEARCH_SCHEMA,
    fetchedAt: Date.now()
  };
}

function cacheMatchesQuery(hit, query) {
  if (!hit || (hit.status !== 'verified' && hit.status !== 'partial')) return false;
  if (hit.schema !== RESEARCH_SCHEMA) return false; // cache cũ (snippet-only / xác minh theo query) không được dùng lại
  const q = normalize(query && (query.sku || query.name));
  const m = normalize(hit.matchedSku || (hit.product && (hit.product.model || hit.product.name)));
  const byEvidence = !!(hit.verification && hit.verification.verified);
  if (!byEvidence && (!q || !m || !(m === q || m.includes(q) || q.includes(m)))) return false;
  const qGen = genTokens((query && query.sku || '') + ' ' + (query && query.name || ''));
  const hGen = genTokens((hit.matchedSku || '') + ' ' + (hit.product && hit.product.model || '') + ' ' + (hit.product && hit.product.name || ''));
  return !qGen.length || !hGen.length || qGen.every(t => hGen.includes(t));
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
  if (!key) return { status: 'rejected', reason: 'missing_query', sources: [], warnings: ['Thiếu SKU/tên để research.'] };
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
    return { status: timeout ? 'timeout' : 'error', query, sources: [], warnings: [timeout ? 'Web research quá thời gian chờ.' : 'Web research lỗi: ' + String(e && e.message || e).slice(0, 160)] };
  }
  const out = normalizeResearch(query, payload);
  if ((out.status === 'verified' || out.status === 'partial') && hasUsableContent(out)) await cacheSet(key, out, cache);
  return out;
}

module.exports = { RESEARCH_SCHEMA, candidateSets, matchEvidence, extractFromPage, hasUsableContent, researchProduct, configFromEnv, normalizeResearch, genTokens, normalize, tavilyProvider, googleProvider, extractGroundedUrls, isOfficialUrl };
