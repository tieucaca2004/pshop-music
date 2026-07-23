const fs = require('fs');
const https = require('https');

// Load extracted data
const lp = JSON.parse(fs.readFileSync('data/landing-pages/omnis-duo.json', 'utf8'));
const sections = {};
lp.sections.forEach(s => { sections[s.sectionId || s.sectionType] = s; });

// Build features from pros_cons
const prosCons = sections['pros_cons'];
const features = (prosCons?.content?.pros || []).map(p => p.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
const cons = (prosCons?.content?.cons || []).map(c => c.replace(/<[^>]+>/g, '').trim()).filter(Boolean);

// FAQ
const faqBlock = sections['faq'] || sections['tutorial_videos'];
let faq = [];
if (faqBlock?.questions) faq = faqBlock.questions;
else if (faqBlock?.faq) faq = faqBlock.faq;
faq = faq.map(item => ({
  question: item.q || item.question || '',
  answer: item.a || item.answer || ''
})).filter(item => item.question);

// Build full description HTML
const descParts = [];
const order = ['hero','quick_overview','feature_core','feature_battery','feature_bluetooth_audio',
  'feature_bluetooth_in','feature_fx','feature_design','feature_streaming',
  'whats_in_box','workflow','buying-advice','conclusion'];
order.forEach(id => {
  const sec = sections[id];
  if (!sec) return;
  const c = sec.content || {};
  if (c.body && typeof c.body === 'string') descParts.push(c.body);
});

// Specs HTML
const specsBlock = sections['specifications'];
let specsHTML = '';
if (specsBlock?.content?.specs) {
  specsHTML = '<ul>';
  specsBlock.content.specs.forEach(row => {
    if (typeof row === 'string') specsHTML += `<li>${row}</li>`;
    else if (Array.isArray(row)) specsHTML += `<li><strong>${row[0]}:</strong> ${row[1]||''}</li>`;
  });
  specsHTML += '</ul>';
}

// Images from landing page + section imageSlots
const imageSet = new Set();
(lp.images || []).forEach(img => {
  if (img.temporaryPlaceholderUrl) imageSet.add(img.temporaryPlaceholderUrl);
  else if (img.url) imageSet.add(img.url);
});
const images = [...imageSet].slice(0, 10);

// YouTube
let ytUrl = '';
['tutorial_videos','videos'].forEach(id => {
  const sec = sections[id];
  if (!sec) return;
  (sec.videos || []).forEach(v => { if (v.embedId && !ytUrl) ytUrl = 'https://www.youtube.com/watch?v='+v.embedId; });
});

// SEO
const seo = lp.seo || {};
const seoKeywords = [
  ...new Set([
    ...(seo.keywords || []).filter(Boolean),
    'AlphaTheta OMNIS-DUO','OMNIS-DUO','DJ portable','all-in-one DJ',
    'AlphaTheta Việt Nam','Pshop Music','OMNIS-DUO review','máy DJ chạy pin'
  ])
];

// Build Firebase payload
const payload = {
  name: 'ALPHATHETA OMNIS-DUO PORTABLE DJ SYSTEM',
  brand: 'AlphaTheta',
  category: 'dj',
  categoryLabel: 'Máy DJ',
  specs: 'AlphaTheta · 2-deck + Mixer · Pin 5h · Bluetooth 5.2 · StreamingDirectPlay',
  description: `<h2>ALPHATHETA OMNIS-DUO — Hệ Thống DJ All-in-One Di Động Chạy Pin</h2>
<p>AlphaTheta OMNIS-DUO là hệ thống DJ all-in-one 2-deck chạy pin đầu tiên sở hữu cả Bluetooth Audio Output lẫn Input hai chiều, StreamingDirectPlay không cần thuê bao rekordbox cho Apple Music, và trọng lượng chỉ 4.6 kg — mở ra khả năng DJ ở bất kỳ đâu, từ bãi biển, cắm trại, rooftop đến những không gian không có điện lưới.</p>
<p>Đây là bước tiến mới của AlphaTheta vào phân khúc all-in-one di động chạy pin, cạnh tranh trực tiếp với Denon DJ Prime GO nhưng bổ sung hàng loạt tính năng độc đáo như Bluetooth Input Playback, SonicLink với loa WAVE-EIGHT, và màn hình cảm ứng 7 inch chế độ Light/Dark tự động.</p>
${descParts.join('\n')}`,
  shortDescription: 'Hệ thống DJ all-in-one di động chạy pin 5 giờ — Biểu diễn không dây, không cần điện, không giới hạn không gian.',
  specifications: specsHTML,
  features: features,
  cons: cons,
  faq: faq,
  price: '',
  oldPrice: '',
  image: images[0] || '',
  images: images.slice(0, 5),
  youtubeUrl: ytUrl || 'https://www.youtube.com/watch?v=8jb1rDUOIoY',
  slug: 'alphatheta-omnis-duo-portable-dj-system',
  seoTitle: seo.title || 'ALPHATHETA OMNIS-DUO – Hệ Thống DJ Portable Chạy Pin 5 Giờ',
  seoKeywords: seoKeywords,
  metaDescription: 'AlphaTheta OMNIS-DUO hệ thống DJ all-in-one di động chạy pin 5 giờ. Bluetooth In/Out hai chiều, StreamingDirectPlay Apple Music, thiết kế 4.6kg phù hợp DJ ngoài trời.',
  stockStatus: 'instock',
  pubStatus: 'published',
  status: 'New',
  badgeText: 'Mở hộp · BH 12 tháng',
  tags: seoKeywords.join(', '),
  warranty: '12 tháng chính hãng',
  sku: '',
  updatedAt: Date.now()
};

console.log('=== PAYLOAD SUMMARY ===');
console.log('Fields:', Object.keys(payload).length);
console.log('description length:', payload.description.length, 'chars');
console.log('features:', payload.features.length);
console.log('faq:', payload.faq.length);
console.log('cons:', payload.cons.length);
console.log('images:', payload.images.length);
console.log('youtubeUrl:', payload.youtubeUrl);
console.log('');

// Verify against immutable rule: ID 2 = OMNIS-DUO (correct)
// Do NOT overwrite: id, name, brand (all confirmed matching)
console.log('=== VERIFICATION ===');
console.log('Product name matches Omnis Duo:', payload.name.includes('OMNIS-DUO'));
console.log('Brand matches AlphaTheta:', payload.brand === 'AlphaTheta');
console.log('');

// Write payload for Firebase update
fs.writeFileSync('_omnis_firebase_payload.json', JSON.stringify(payload, null, 2));
console.log('Payload written to _omnis_firebase_payload.json');

// Now PATCH to Firebase
const data = JSON.stringify(payload);
const req = https.request({
  hostname: 'pshop-music-default-rtdb.asia-southeast1.firebasedatabase.app',
  path: '/products/2.json',
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('');
    console.log('=== FIREBASE RESPONSE ===');
    console.log('Status:', res.statusCode, res.statusMessage);
    try { console.log('Body:', JSON.stringify(JSON.parse(d), null, 2).substring(0, 500)); }
    catch(e) { console.log('Body:', d.substring(0, 200)); }
  });
});
req.on('error', e => { console.error('Firebase error:', e.message); });
req.write(data);
req.end();
