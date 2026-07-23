const fs = require('fs');
const raw = fs.readFileSync('D:\\PshopMusicSite\\lh-postfix.json', 'utf8');
let start = -1;
for (let i = 0; i < raw.length - 1; i++) {
  if (raw[i] === '{' && (i === 0 || raw[i-1] === '\n')) { start = i; break; }
}
const json = raw.substring(start, raw.lastIndexOf('}') + 1);
const r = JSON.parse(json);

const cats = r.categories;
console.log('=== LIGHTHOUSE SCORES ===');
console.log('Performance:', cats.performance.score * 100);
console.log('Accessibility:', cats.accessibility.score * 100);
console.log('Best Practices:', cats['best-practices'].score * 100);
console.log('SEO:', cats.seo.score * 100);
console.log('');

console.log('=== PERFORMANCE METRICS ===');
['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index','interactive','max-potential-fid'].forEach(m => {
  const v = r.audits[m];
  if (v) console.log(v.title + ':', v.displayValue, '(score:', v.score + ')');
});
console.log('');

console.log('=== OPPORTUNITIES ===');
const opps = [
  ['render-blocking-resources','render-blocking-resources'],
  ['uses-responsive-images','uses-responsive-images'],
  ['offscreen-images','offscreen-images'],
  ['unused-css-rules','unused-css-rules'],
  ['unused-javascript','unused-javascript'],
  ['uses-optimized-images','uses-optimized-images'],
  ['modern-image-formats','modern-image-formats'],
  ['uses-text-compression','uses-text-compression'],
  ['total-byte-weight','total-byte-weight'],
  ['dom-size','dom-size'],
  ['bootup-time','bootup-time'],
  ['mainthread-work-breakdown','mainthread-work-breakdown'],
  ['preload-lcp-image','preload-lcp-image'],
  ['prioritize-lcp-image','prioritize-lcp-image']
];
opps.forEach(([id]) => {
  const v = r.audits[id];
  if (v && v.score !== null && v.score !== undefined && v.score < 1) {
    console.log('WARN', v.title + ':', v.displayValue || '', '(score:', v.score + ')');
  }
});

console.log('');
console.log('=== ACCESSIBILITY ISSUES ===');
if (cats.accessibility.score < 1) {
  cats.accessibility.auditRefs.forEach(ref => {
    const a = r.audits[ref.id];
    if (a.score === 0) {
      console.log('FAIL', a.title + ':', a.displayValue || '');
    }
  });
}

console.log('');
console.log('=== DIAGNOSTICS ===');
['network-requests','network-rtt','network-server-latency','main-thread-tasks','critical-request-chains','user-timings','script-treemap-data'].forEach(id => {
  const v = r.audits[id];
  if (v && v.numericValue) {
    const unit = v.numericUnit || '';
    console.log(v.title + ':', v.displayValue || v.numericValue + ' ' + unit);
  }
});
