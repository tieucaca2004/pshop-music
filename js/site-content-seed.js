// Default site content — used to seed Firebase once, and as the fallback
// shown before Firebase data arrives (progressive enhancement, no blank flash).
const SEED_SITE_CONTENT = {
  heroSlides: [
    {
      image: 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg',
      title: 'THIẾT BỊ DJ & ÂM THANH CHUYÊN NGHIỆP',
      subtitle: 'Mua bán, cho thuê thiết bị DJ, loa kiểm âm, soundcard, tai nghe chính hãng. Tư vấn setup âm thanh bar, café, lounge toàn quốc.',
      link: ''
    },
    {
      image: 'https://www.krkmusic.com/cdn/shop/files/1-KRK-ROKIT-8-G4-Front.jpg?v=1705698903',
      title: 'LOA KIỂM ÂM CHÍNH HÃNG',
      subtitle: 'KRK, ADAM Audio, JBL, Monkey Banana — đầy đủ mọi phân khúc, giá tốt.',
      link: 'category.html?cat=loa'
    },
    {
      image: 'https://www.adam-audio.com/content/uploads/2023/04/adam-audio-t7v-studio-monitor-featured-image.png',
      title: 'SETUP PHÒNG THU CHUYÊN NGHIỆP',
      subtitle: 'Tư vấn setup âm thanh bar, café, lounge toàn quốc.',
      link: '#services'
    },
    {
      image: 'https://www.jbl.com/dw/image/v2/BFND_PRD/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw0c9e15e4/JBL_306P_MkII_Hero_1605x1605px_v002_0025-1605x1605px.jpg',
      title: 'THIẾT BỊ CHO THUÊ SỰ KIỆN',
      subtitle: 'Cho thuê loa, máy DJ theo ngày / tuần / tháng.',
      link: '#services'
    },
    {
      image: 'https://www.krkmusic.com/cdn/shop/files/1-KRK-Rokit-5-F.jpg?v=1705698811',
      title: 'CHÍNH HÃNG · BẢO HÀNH RÕ RÀNG',
      subtitle: 'Giao hàng toàn quốc, hỗ trợ kỹ thuật tận tâm.',
      link: '#categories'
    }
  ],
  categoryTiles: [
    { category: 'dj', label: 'Máy DJ', size: 'wide', skin: 'light', image: 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg' },
    { category: 'dj', label: 'Controller', size: 'wide', skin: 'dark', image: 'https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg' },
    { category: 'loa', label: 'Loa kiểm âm', size: 'normal', skin: 'dark', image: 'https://www.krkmusic.com/cdn/shop/files/1-KRK-ROKIT-8-G4-Front.jpg?v=1705698903' },
    { category: 'soundcard', label: 'Soundcard', size: 'normal', skin: 'dark', image: 'https://audient.com/wp-content/uploads/2021/01/iD14-MKII-Front_New.jpg' },
    { category: 'tainghe', label: 'Tai nghe', size: 'normal', skin: 'dark', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Sennheiser_hd-25_headphones.jpg/800px-Sennheiser_hd-25_headphones.jpg' },
    { category: 'phukien', label: 'Phụ kiện', size: 'normal', skin: 'dark', image: '' }
  ],
  servicesIntro: 'Không chỉ mua bán — Pshop Music đồng hành từ setup đến vận hành cho bar, café, lounge, club.',
  serviceItems: [
    { title: 'CHO THUÊ LOA KIỂM ÂM', desc: 'Loa active theo ngày / tuần / tháng. Phù hợp sự kiện, phòng thu tạm thời, triển lãm, thu âm dự án.' },
    { title: 'CHO THUÊ MÁY DJ', desc: 'CDJ, DDJ, XDJ theo set đầy đủ. Phục vụ khu vực Nha Trang - Khánh Hòa, hỗ trợ setup kỹ thuật tại chỗ. Liên hệ trực tiếp qua Facebook để đặt lịch nhanh nhất.' },
    { title: 'TƯ VẤN SETUP ÂM THANH BAR, CAFÉ, LOUNGE', desc: 'Khảo sát không gian thực tế, thiết kế hệ thống phù hợp ngân sách, thi công và tinh chỉnh EQ sau lắp đặt.' },
    { title: 'BẢO TRÌ & KIỂM TRA THIẾT BỊ', desc: 'Bảo dưỡng định kỳ, kiểm tra driver loa, thay linh kiện chính hãng. Hỗ trợ cả thiết bị mua nơi khác.' },
    { title: 'BẢO HÀNH & SỬA CHỮA ÂM THANH, ÁNH SÁNG CLUB / BAR / CAFÉ', desc: 'Sửa chữa, bảo hành hệ thống âm thanh và ánh sáng cho club, bar, café. Xử lý sự cố tại chỗ, thay linh kiện chính hãng, hỗ trợ nhanh trong khu vực Nha Trang - Khánh Hòa.' }
  ],
  infoBoxRows: [
    { label: 'Loa kiểm âm active (cặp)', value: 'Liên hệ báo giá' },
    { label: 'Setup âm thanh Bar / Café', value: 'Theo dự án' },
    { label: 'Khu vực phục vụ', value: 'Nha Trang - Khánh Hòa' },
    { label: 'Bảo hành SP mua tại shop', value: '6 - 24 tháng' }
  ],
  menu: {
    items: [
      { label: 'SẢN PHẨM', link: 'index.html#categories', order: 1, target: '_self' },
      { label: 'BLOG', link: 'blog.html', order: 2, target: '_self' },
      { label: 'VIDEO', link: 'videos.html', order: 3, target: '_self' },
      { label: 'DỊCH VỤ', link: 'index.html#services', order: 4, target: '_self' },
      { label: 'LIÊN HỆ', link: 'index.html#contact', order: 5, target: '_self' },
      { label: 'Shopee', link: 'https://shopee.vn/music_store_79', order: 6, target: '_blank' }
    ]
  },
  footer: {
    columns: [
      {
        title: 'Hỗ Trợ',
        links: [
          { label: 'Liên hệ tư vấn', link: 'index.html#contact' },
          { label: 'Hướng dẫn mua hàng', link: 'index.html#contact' },
          { label: 'Chính sách bảo hành', link: 'index.html#services' }
        ]
      },
      {
        title: 'Sản Phẩm',
        links: [
          { label: 'Máy DJ & Controller', link: 'category.html?cat=dj' },
          { label: 'Loa kiểm âm', link: 'category.html?cat=loa' },
          { label: 'Tai nghe', link: 'category.html?cat=tainghe' },
          { label: 'Phụ kiện', link: 'category.html?cat=phukien' }
        ]
      },
      {
        title: 'Về Chúng Tôi',
        links: [
          { label: 'Giới thiệu Pshop Music', link: 'index.html#heroSection' },
          { label: 'Dịch vụ cho thuê', link: 'index.html#services' },
          { label: 'Tìm cửa hàng', link: 'index.html#contact' }
        ]
      },
      {
        title: 'Kết Nối',
        links: [
          { label: 'Điều khoản sử dụng', link: 'index.html#contact' },
          { label: 'Chính sách bảo mật', link: 'index.html#contact' },
          { label: 'Quản trị', link: 'admin.html' }
        ]
      }
    ],
    social: [
      { platform: 'facebook', url: 'https://www.facebook.com/ChoThueThietBiDJ' },
      { platform: 'messenger', url: 'https://m.me/ChoThueThietBiDJ' },
      { platform: 'zalo', url: 'https://zalo.me/0901952999' },
      { platform: 'shopee', url: 'https://shopee.vn/music_store_79' }
    ],
    copyText: '© 2026 Pshop Music · 86 Lạc Long Quân, Nha Trang, Khánh Hòa · pshopmusic.com'
  },
  settings: {
    siteName: 'Pshop Music',
    logoText: 'P·SHOP MUSIC',
    phone: '0901952999',
    phoneDisplay: '0901 952 999',
    zalo: '0901952999',
    address: '86 Lạc Long Quân, Nha Trang, Khánh Hòa',
    mapLink: 'https://maps.app.goo.gl/ihv9EZhZCNfwP9um6',
    openingHours: '8:00 – 21:00 · Cả tuần',
    socials: {
      facebook: 'https://www.facebook.com/ChoThueThietBiDJ',
      messenger: 'https://m.me/ChoThueThietBiDJ',
      zalo: 'https://zalo.me/0901952999',
      shopee: 'https://shopee.vn/music_store_79'
    }
  }
};

// Danh mục sản phẩm chuẩn — nguồn dữ liệu duy nhất cho dropdown danh mục
// trong Product Manager và tab lọc trong category.js (Category Manager).
const SEED_CATEGORIES = [
  { code: 'dj', label: 'Máy DJ', order: 1, active: true },
  { code: 'loa', label: 'Loa kiểm âm', order: 2, active: true },
  { code: 'tainghe', label: 'Tai nghe', order: 3, active: true },
  { code: 'soundcard', label: 'Soundcard', order: 4, active: true },
  { code: 'phukien', label: 'Phụ kiện', order: 5, active: true }
];
