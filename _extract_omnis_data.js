const fs = require('fs');
const lp = JSON.parse(fs.readFileSync('data/landing-pages/omnis-duo.json', 'utf8'));
const sections = {};
lp.sections.forEach(s => { sections[s.sectionId || s.sectionType] = s; });

// 1) Description HTML – stitch from rich blocks
const order = [
  'hero','quick_overview','feature_core','feature_battery','feature_bluetooth_audio',
  'feature_bluetooth_in','feature_fx','feature_design','feature_streaming',
  'pros_cons','specifications','whats_in_box','workflow','tutorial_videos',
  'customer-reviews','buying-advice','conclusion'
];
let descHTML = '';
order.forEach(id => {
  const sec = sections[id];
  if (!sec) return;
  const c = sec.content || {};
  if (c.body && typeof c.body === 'string') descHTML += c.body + '\n';
  if (c.specs && Array.isArray(c.specs)) {
    descHTML += '<table class="specs-table"><tbody>\n';
    c.specs.forEach(row => {
      if (typeof row === 'string') descHTML += `<tr><td colspan="2">${row}</td></tr>\n`;
      else if (Array.isArray(row)) descHTML += `<tr><td>${row[0]}</td><td>${row[1]||''}</td></tr>\n`;
    });
    descHTML += '</tbody></table>\n';
  }
});

// 2) Features (pros)
const prosCons = sections['pros_cons'];
const features = (prosCons?.content?.pros || []).filter(Boolean);

// 3) FAQ
const faqBlock = sections['faq'] || sections['tutorial_videos'];
let faq = [];
if (faqBlock?.questions) faq = faqBlock.questions;
else if (faqBlock?.faq) faq = faqBlock.faq;
faq = faq.map(item => ({
  question: item.q || item.question || '',
  answer: item.a || item.answer || ''
})).filter(item => item.question);

// 4) Specs HTML
const specsBlock = sections['specifications'];
let specsHTML = '';
if (specsBlock?.content?.specs) {
  specsHTML = '<ul>\n';
  specsBlock.content.specs.forEach(row => {
    if (typeof row === 'string') specsHTML += `<li>${row}</li>\n`;
    else if (Array.isArray(row)) specsHTML += `<li><strong>${row[0]}:</strong> ${row[1]||''}</li>\n`;
  });
  specsHTML += '</ul>\n';
}

// 5) Images
const imageSet = new Set();
(lp.images || []).forEach(img => {
  if (img.url && !img.url.includes('via.placeholder')) imageSet.add(img.url);
  if (img.temporaryPlaceholderUrl && !img.temporaryPlaceholderUrl.includes('via.placeholder')) imageSet.add(img.temporaryPlaceholderUrl);
});
// Also collect from sections
lp.sections.forEach(s => {
  (s.content?.imageSlots || []).forEach(slot => {
    const matched = (lp.images || []).find(i => i.imageId === slot.imageId);
    if (matched) {
      if (matched.url) imageSet.add(matched.url);
      if (matched.temporaryPlaceholderUrl) imageSet.add(matched.temporaryPlaceholderUrl);
    }
  });
});
const images = [...imageSet].slice(0, 10);

// 6) YouTube
let ytUrl = '';
lp.sections.forEach(s => {
  (s.videos || []).forEach(v => { if (v.embedId && !ytUrl) ytUrl = 'https://www.youtube.com/watch?v=' + v.embedId; });
  (s.content?.videos || []).forEach(v => { if (v.embedId && !ytUrl) ytUrl = 'https://www.youtube.com/watch?v=' + v.embedId; });
});

// 7) SEO
const seo = lp.seo || {};
const slug = lp.slug || 'omnis-duo';
const seoKeywords = [...new Set([
  ...(seo.keywords || []),
  'AlphaTheta OMNIS-DUO', 'OMNIS-DUO', 'DJ portable', 'all-in-one DJ',
  'AlphaTheta Việt Nam', 'Pshop Music'
])];

// 8) Short description
const heroBlock = sections['hero'];
const shortDesc = heroBlock?.content?.subtitle ||
  heroBlock?.content?.body?.replace(/<[^>]+>/g,'').substring(0, 160) ||
  'Hệ thống DJ all-in-one di động chạy pin 5 giờ từ AlphaTheta';

const result = {
  description: descHTML,
  shortDescription: shortDesc.substring(0, 200),
  specifications: specsHTML,
  features: features,
  faq: faq,
  image: images[0] || '',
  images: images,
  youtubeUrl: ytUrl,
  slug: slug,
  seoTitle: seo.title || 'ALPHATHETA OMNIS-DUO – Hệ Thống DJ Portable Chạy Pin',
  seoKeywords: seoKeywords,
  metaDescription: (seo.description || shortDesc).substring(0, 160),
  stockStatus: 'instock',
  pubStatus: 'published',
  tags: seoKeywords.join(', '),
  stats: {
    descLength: descHTML.length,
    featureCount: features.length,
    faqCount: faq.length,
    imageCount: images.length
  }
};

console.log(JSON.stringify(result, null, 2));
