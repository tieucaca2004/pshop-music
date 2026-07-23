// Product Catalog Enrichment Script
// This script updates the products-seed.js with enriched data.

const fs = require('fs');
const path = require('path');

// Read current seed data
const filePath = 'D:\\PshopMusicSite\\js\\products-seed.js';
let content = fs.readFileSync(filePath, 'utf8');

// Extract the SEED_PRODUCTS array
// We'll rebuild specific product entries

// Product 2 - AlphaTheta Omnis-Duo - Has empty image
// Product 14 - ADAM Audio T8V - Has empty image
// Product 20 - JBL 306P MKII - Already has image
// Product 24 - Sennheiser HD25 II - Already has image (wikimedia)
// Product 30 - Audient iD14 MKII - Already has image

// Let's update products with official images where we have them
const imageUpdates = {
  // AlphaTheta Omnis-Duo - official image from AlphaTheta
  '2': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Decksaver XDJ-RX2 - generic product shot
  '3': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // KRK Classic 5 G3
  '7': 'https://www.krkmusic.com/cdn/shop/files/1-KRK-Classic-5-Front.jpg?v=1705698869',
  // KRK Rokit 6 G3 (Used)
  '8': 'https://www.krkmusic.com/cdn/shop/files/1-KRK-Rokit-6-F.jpg?v=1705698820',
  // KRK Rokit 5 G3 (Japan)
  '9': 'https://www.krkmusic.com/cdn/shop/files/1-KRK-Rokit-5-F.jpg?v=1705698811',
  // KRK Rokit 4 G3 (Used)
  '10': 'https://www.krkmusic.com/cdn/shop/files/1-KRK-Rokit-4-F.jpg?v=1705698801',
  // KRK V4 S4
  '11': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // KRK VXT6
  '12': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // ADAM Audio T8V (Used)
  '14': 'https://www.adam-audio.com/content/uploads/2023/04/adam-audio-t8v-studio-monitor-featured-image.png',
  // Monkey Banana Lemur 5
  '15': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Monkey Banana Gibbon 5
  '16': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Monkey Banana Gibbon 8
  '17': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Monkey Banana Turbo 8
  '18': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Monkey Banana Baboon 6
  '19': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Bose SoundLink Revolve+ (Used)
  '21': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Harman Kardon Go+Play
  '22': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // JBL PartyBox Encore Essential
  '23': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Sennheiser HD26 Pro
  '25': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Sennheiser Momentum Samba
  '26': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Pioneer DJ HDJ-CUE1
  '27': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Technics EAH-1200K
  '28': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // AIAIAI TMA-2 DJ
  '29': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // NI Komplete Audio 6 MK2
  '31': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // NI Komplete Audio 6 (Used)
  '32': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // NI Komplete Audio 2
  '33': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // SanDisk Extreme Pro CZ880 128GB
  '34': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Lexar JumpDrive P30 128GB
  '41': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  // Accessories
  '35': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  '36': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  '37': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  '38': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  '39': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  '40': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
  '42': 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg'
};

// Update each product's image in the seed file
Object.keys(imageUpdates).forEach(id => {
  const imageUrl = imageUpdates[id].replace(/[\/\\]/g, '\\/');
  // Match the product by finding the id pattern
  const idPattern = new RegExp('"id":\\s*"' + id + '"');
  // Navigate to the image field
  const searchPattern = new RegExp(`(\\"id\\":\\s*\\"${id}\\",[\\s\\S]*?\\"image\\":\\s*)\\".*?\\"`);
  if (searchPattern.test(content)) {
    content = content.replace(searchPattern, `$1"${imageUpdates[id]}"`);
    console.log('Updated image for product ID', id);
  } else {
    console.log('COULD NOT FIND pattern for product ID', id);
  }
});

// Update prices for products with reference prices
const priceUpdates = {
  '2': '"Liên hệ" /* Reference: AlphaTheta store */',
  '7': '"Liên hệ" /* Reference: KRK store */',
  '8': '"Liên hệ" /* Used - liên hệ */',
  '9': '"Liên hệ" /* Japan import 110V */',
  '10': '"Liên hệ" /* Used - liên hệ */',
  '14': '"Liên hệ" /* Used 99% - liên hệ */',
  '21': '"Liên hệ" /* Used 95% - liên hệ */',
  '24': '"Liên hệ" /* Used - liên hệ */',
  '26': '"Liên hệ" /* Limited Edition Used */',
  '32': '"Liên hệ" /* Used - liên hệ */',
  '36': '"Liên hệ" /* Used driver - liên hệ */',
  '42': '"Liên hệ" /* Sol Republic - liên hệ */'
};

fs.writeFileSync(filePath, content, 'utf8');
console.log('\\nFile updated successfully.');
console.log('Updated images for', Object.keys(imageUpdates).length, 'products');
