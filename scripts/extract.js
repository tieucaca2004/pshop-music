const fs = require('fs');
const path = require('path');

const html = fs.readFileSync('D:/pshopmusic.html', 'utf8');

const gridMatch = html.match(/<div class="products-grid" id="productGrid">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="shopee-link">/);
if (!gridMatch) { console.error('grid not found'); process.exit(1); }
const gridHtml = gridMatch[1];

// Split into product-card blocks
const cardRegex = /<div class="product-card" data-cat="([^"]+)"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="product-card"|$)/g;

const catLabels = {
  dj: 'Máy DJ',
  loa: 'Loa kiểm âm',
  tainghe: 'Tai nghe',
  soundcard: 'Soundcard',
  phukien: 'Phụ kiện'
};

let products = [];
let m;
let id = 1;
while ((m = cardRegex.exec(gridHtml)) !== null) {
  const cat = m[1];
  const block = m[2];

  const imgMatch = block.match(/<img src="([^"]+)"/);
  const image = imgMatch ? imgMatch[1] : '';

  const nameMatch = block.match(/<div class="prod-name">([\s\S]*?)<\/div>/);
  const name = nameMatch ? nameMatch[1].trim() : '';

  const brandMatch = block.match(/<div class="prod-brand">([\s\S]*?)<\/div>/);
  const brandFull = brandMatch ? brandMatch[1].trim() : '';
  const brand = brandFull.split('·')[0].trim();

  const descMatch = block.match(/<div class="prod-desc">([\s\S]*?)<\/div>/);
  const description = descMatch ? descMatch[1].trim() : '';

  const badgeMatch = block.match(/<span class="prod-badge (badge-new|badge-used)">([\s\S]*?)<\/span>/);
  const status = badgeMatch ? (badgeMatch[1] === 'badge-new' ? 'New' : 'Used') : 'New';
  const badgeText = badgeMatch ? badgeMatch[2].trim() : '';

  const priceMatch = block.match(/<div class="prod-price"[^>]*>([\s\S]*?)<\/div>/);
  const price = priceMatch ? priceMatch[1].trim() : '';

  products.push({
    id: String(id++),
    name,
    category: cat,
    categoryLabel: catLabels[cat] || cat,
    brand,
    specs: brandFull,
    description,
    price,
    image,
    status,
    badgeText,
    createdAt: Date.now()
  });
}

console.log('Extracted', products.length, 'products');
fs.writeFileSync('D:/PshopMusicSite/data/products.json', JSON.stringify({ products }, null, 2), 'utf8');
console.log('Saved to D:/PshopMusicSite/data/products.json');

const seedJs = '// Auto-generated from pshopmusic.html — seed data used to populate localStorage on first run.\n' +
  'const SEED_PRODUCTS = ' + JSON.stringify(products, null, 2) + ';\n';
fs.writeFileSync('D:/PshopMusicSite/js/products-seed.js', seedJs, 'utf8');
console.log('Saved to D:/PshopMusicSite/js/products-seed.js');
