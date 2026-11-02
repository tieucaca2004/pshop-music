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
  const modelTokens = String(query.name || query.sku || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(t => t.length >= 3 && !/^(the|and|with|cho|loa|san|pham|product)$/.test(t));
  return !modelTokens.length || modelTokens.some(t => text.includes(t));
}
async function tavilyProvider(query, cfg, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  const q = [query.sku, query.name, 'official specifications'].filter(Boolean).join(' ').slice(0, 380);
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.key) headers.Authorization = 'Bearer ' + cfg.key;
  else headers['X-Tavily-Access-Mode'] = 'keyless';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const r = await doFetch('https://api.tavily.com/search', {
      method: 'POST', headers, signal: ctrl.signal,
      body: JSON.stringify({ query: q, max_results: 8, search_depth: 'advanced', include_answer: false, include_raw_content: false })
    });
    let data = null; try { data = await r.json(); } catch (e) { data = null; }
    if (!r.ok || !data || !Array.isArray(data.results)) {
      const e = new Error((data && data.detail) || ('tavily HTTP ' + r.status)); e.code = 'provider_error'; e.status = r.status; throw e;
    }
    const results = data.results.filter(x => x && x.url && relevantToQuery(x, query));
    if (!results.length) return { matchedSku: query.sku || query.name, product: {}, sources: [] };
    const ordered = results.slice().sort((a, b) => {
      const ao = isOfficialUrl(a.url, cfg.officialDomains) ? 0 : 1; const bo = isOfficialUrl(b.url, cfg.officialDomains) ? 0 : 1;
      return ao - bo;
    });
    const best = ordered[0];
    const sources = ordered.map(x => {
      const specs = extractSpecs(x.content || '');
      return {
        title: String(x.title || x.url).trim(),
        url: x.url,
        type: isOfficialUrl(x.url, cfg.officialDomains) ? 'official' : 'other',
        claims: String(x.content || '').split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 12),
        specs
      };
    });
    const title = String(best.title || '').replace(/\s*[–|]\s*.*$/, '').replace(/\s*-\s*(White|Black|Single|Pair)$/i, '').trim();
    return {
      matchedSku: query.sku || query.name,
      product: { name: title || query.name || null, model: query.name || query.sku || null, brand: null, category: query.category || null, description: null },
      sources
    };
  } finally { clearTimeout(timer); }
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
  const type = ['official', 'distributor', 'other'].indexOf(s.type) >= 0 ? s.type : 'other';
  const claims = Array.isArray(s.claims) ? s.claims.map(x => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
  const specs = s.specs && typeof s.specs === 'object' && !Array.isArray(s.specs) ? s.specs : {};
  const features = Array.isArray(s.features) ? s.features.map(x => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
  const applications = Array.isArray(s.applications) ? s.applications.map(x => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
  return { title: String(s.title || '').trim().slice(0, 300) || url, url, type, claims, specs, features, applications };
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
  const product = payload && payload.product && typeof payload.product === 'object' ? payload.product : {};
  const matchedSku = String(payload && payload.matchedSku || product.model || '').trim();
  const qGen = genTokens((query.sku || '') + ' ' + (query.name || ''));
  const pGen = genTokens((matchedSku || '') + ' ' + (product.model || '') + ' ' + (product.name || ''));
  if (qGen.length && pGen.length && !qGen.every(t => pGen.includes(t))) {
    return { status: 'rejected', reason: 'wrong_generation', query, sources: [], warnings: ['Nguồn trả về khác thế hệ/model: ' + pGen.join(', ') + ' ≠ ' + qGen.join(', ')] };
  }
  const q = normalize(query.sku || query.name);
  const m = normalize(matchedSku || product.model || product.name);
  if (!q || !m || !(m === q || m.includes(q) || q.includes(m))) {
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
    warnings,
    fetchedAt: Date.now()
  };
}

function cacheMatchesQuery(hit, query) {
  if (!hit || (hit.status !== 'verified' && hit.status !== 'partial')) return false;
  const q = normalize(query && (query.sku || query.name));
  const m = normalize(hit.matchedSku || (hit.product && (hit.product.model || hit.product.name)));
  if (!q || !m || !(m === q || m.includes(q) || q.includes(m))) return false;
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
  if (out.status === 'verified' || out.status === 'partial') await cacheSet(key, out, cache);
  return out;
}

module.exports = { researchProduct, configFromEnv, normalizeResearch, genTokens, normalize, tavilyProvider, isOfficialUrl };
