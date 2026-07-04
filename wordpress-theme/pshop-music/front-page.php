<?php
/**
 * Front page: hero slideshow, category banners, product grid (search/filter,
 * rendered client-side from PSHOP_DATA), services, contact form, footer.
 */
get_header();
?>

<section class="hero" id="heroSection">
  <div class="hero-slides" id="heroSlides">
    <div class="hero-slide active" style="background-image:url('https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg')"></div>
    <div class="hero-slide" style="background-image:url('https://www.krkmusic.com/cdn/shop/files/1-KRK-ROKIT-8-G4-Front.jpg?v=1705698903')"></div>
    <div class="hero-slide" style="background-image:url('https://www.adam-audio.com/content/uploads/2023/04/adam-audio-t7v-studio-monitor-featured-image.png')"></div>
    <div class="hero-slide" style="background-image:url('https://www.jbl.com/dw/image/v2/BFND_PRD/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw0c9e15e4/JBL_306P_MkII_Hero_1605x1605px_v002_0025-1605x1605px.jpg')"></div>
    <div class="hero-slide" style="background-image:url('https://www.krkmusic.com/cdn/shop/files/1-KRK-Rokit-5-F.jpg?v=1705698811')"></div>
  </div>
  <div class="hero-dots" id="heroDots"></div>
  <div class="container">
    <p class="hero-tag">Nha Trang · Khánh Hòa</p>
    <h1>THIẾT BỊ DJ<br><em>&amp; ÂM THANH</em><br>CHUYÊN NGHIỆP</h1>
    <p class="hero-sub">Mua bán, cho thuê thiết bị DJ, loa kiểm âm, soundcard, tai nghe chính hãng. Tư vấn setup âm thanh bar, café, lounge toàn quốc.</p>
    <div class="hero-btns">
      <button class="btn-gold" onclick="document.getElementById('products').scrollIntoView({behavior:'smooth'})">XEM SẢN PHẨM</button>
      <button class="btn-ghost" onclick="document.getElementById('services').scrollIntoView({behavior:'smooth'})">DỊCH VỤ CHO THUÊ</button>
    </div>
  </div>
</section>

<section class="cat-banners">
  <div class="container">
    <div class="cat-banner-list">
      <button class="cat-banner skin-dark" onclick="jumpToCategory('dj')">
        <span class="cat-banner-label">MÁY DJ</span>
        <img class="cat-banner-img" src="https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg" alt="Máy DJ" loading="lazy" onerror="this.remove()">
      </button>
      <button class="cat-banner skin-gold" onclick="jumpToCategory('dj')">
        <span class="cat-banner-label">CONTROLLER</span>
        <img class="cat-banner-img" src="https://images.microcms-assets.io/assets/3b9e29ce734e49babfedb3f8d1e728e3/394307ff13c244f5acabbf85447c342d/59928375-9E8A-4F46-925D-2549A16AC37D.jpeg" alt="Controller" loading="lazy" onerror="this.remove()">
      </button>
      <button class="cat-banner skin-light" onclick="jumpToCategory('loa')">
        <span class="cat-banner-label">LOA KIỂM ÂM</span>
        <img class="cat-banner-img" src="https://www.krkmusic.com/cdn/shop/files/1-KRK-ROKIT-8-G4-Front.jpg?v=1705698903" alt="Loa kiểm âm" loading="lazy" onerror="this.remove()">
      </button>
      <button class="cat-banner skin-cream" onclick="jumpToCategory('soundcard')">
        <span class="cat-banner-label">SOUNDCARD</span>
        <img class="cat-banner-img" src="https://audient.com/wp-content/uploads/2021/01/iD14-MKII-Front_New.jpg" alt="Soundcard" loading="lazy" onerror="this.remove()">
      </button>
      <button class="cat-banner skin-dark" onclick="jumpToCategory('tainghe')">
        <span class="cat-banner-label">TAI NGHE</span>
        <img class="cat-banner-img" src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Sennheiser_hd-25_headphones.jpg/800px-Sennheiser_hd-25_headphones.jpg" alt="Tai nghe" loading="lazy" onerror="this.remove()">
      </button>
      <button class="cat-banner skin-gold" onclick="jumpToCategory('phukien')">
        <span class="cat-banner-label">PHỤ KIỆN</span>
      </button>
    </div>
  </div>
</section>

<section class="section" id="products">
  <div class="container">
    <p class="sec-eyebrow">DANH MỤC SẢN PHẨM</p>
    <h2 class="sec-title">ĐẦY ĐỦ THIẾT BỊ<br>DJ &amp; ÂM THANH</h2>
    <p class="sec-desc">Hàng chính hãng, mới và qua sử dụng, bảo hành rõ ràng. Giao hàng toàn quốc.</p>

    <div class="toolbar">
      <div class="search-box">
        <span class="icon">&#128269;</span>
        <input type="text" id="searchInput" placeholder="Tìm sản phẩm, thương hiệu...">
      </div>
      <div class="filter-bar">
        <button class="filter-btn active" onclick="filterP('all',this)">Tất cả</button>
        <button class="filter-btn" onclick="filterP('dj',this)">Máy DJ</button>
        <button class="filter-btn" onclick="filterP('loa',this)">Loa kiểm âm</button>
        <button class="filter-btn" onclick="filterP('tainghe',this)">Tai nghe</button>
        <button class="filter-btn" onclick="filterP('soundcard',this)">Soundcard</button>
        <button class="filter-btn" onclick="filterP('phukien',this)">Phụ kiện</button>
      </div>
    </div>
    <div class="result-count" id="resultCount"></div>

    <div class="products-grid" id="productGrid"></div>

    <div class="load-more-wrap" id="loadMoreWrap" style="display:none">
      <button class="btn-ghost" id="loadMoreBtn">XEM THÊM SẢN PHẨM</button>
    </div>

    <div class="shopee-link">
      <p style="font-size:0.8rem;color:var(--ink-mute);margin-bottom:1rem">XEM TOÀN BỘ SẢN PHẨM TRÊN SHOPEE SHOP</p>
      <a href="<?php echo esc_url(PSHOP_CONTACT_SHOPEE); ?>" target="_blank" class="btn-ghost">XEM TRÊN SHOPEE &#8594;</a>
    </div>
  </div>
</section>

<section class="section services-section" id="services">
  <div class="container">
    <p class="sec-eyebrow">DỊCH VỤ</p>
    <h2 class="sec-title">CHO THUÊ &amp; TƯ VẤN<br>SETUP CHUYÊN NGHIỆP</h2>
    <div class="services-grid">
      <div>
        <p class="sec-desc">Không chỉ mua bán — Pshop Music đồng hành từ setup đến vận hành cho bar, café, lounge, club.</p>
        <div class="svc-list">
          <div class="svc-item"><span class="svc-num">01</span><div class="svc-body"><h4>CHO THUÊ LOA KIỂM ÂM</h4><p>Loa active theo ngày / tuần / tháng. Phù hợp sự kiện, phòng thu tạm thời, triển lãm, thu âm dự án.</p></div></div>
          <div class="svc-item"><span class="svc-num">02</span><div class="svc-body"><h4>CHO THUÊ MÁY DJ</h4><p>CDJ, DDJ, XDJ theo set đầy đủ. Phục vụ khu vực Nha Trang - Khánh Hòa, hỗ trợ setup kỹ thuật tại chỗ. Liên hệ trực tiếp qua <a href="<?php echo esc_url(PSHOP_CONTACT_FACEBOOK); ?>" target="_blank" style="color:var(--gold-ink);font-weight:600">Facebook</a> để đặt lịch nhanh nhất.</p></div></div>
          <div class="svc-item"><span class="svc-num">03</span><div class="svc-body"><h4>TƯ VẤN SETUP ÂM THANH BAR, CAFÉ, LOUNGE</h4><p>Khảo sát không gian thực tế, thiết kế hệ thống phù hợp ngân sách, thi công và tinh chỉnh EQ sau lắp đặt.</p></div></div>
          <div class="svc-item"><span class="svc-num">04</span><div class="svc-body"><h4>BẢO TRÌ &amp; KIỂM TRA THIẾT BỊ</h4><p>Bảo dưỡng định kỳ, kiểm tra driver loa, thay linh kiện chính hãng. Hỗ trợ cả thiết bị mua nơi khác.</p></div></div>
          <div class="svc-item"><span class="svc-num">05</span><div class="svc-body"><h4>BẢO HÀNH &amp; SỬA CHỮA ÂM THANH, ÁNH SÁNG CLUB / BAR / CAFÉ</h4><p>Sửa chữa, bảo hành hệ thống âm thanh và ánh sáng cho club, bar, café. Xử lý sự cố tại chỗ, thay linh kiện chính hãng, hỗ trợ nhanh trong khu vực Nha Trang - Khánh Hòa.</p></div></div>
        </div>
      </div>
      <div>
        <div class="info-box">
          <h4>THÔNG TIN DỊCH VỤ CHO THUÊ</h4>
          <div class="info-row"><span>Loa kiểm âm active (cặp)</span><span>Liên hệ báo giá</span></div>
          <div class="info-row"><span>Setup âm thanh Bar / Café</span><span>Theo dự án</span></div>
          <div class="info-row"><span>Khu vực phục vụ</span><span>Nha Trang - Khánh Hòa</span></div>
          <div class="info-row"><span>Bảo hành SP mua tại shop</span><span>6 - 24 tháng</span></div>
        </div>
        <p class="info-note">Giá thuê phụ thuộc vào thời gian và địa điểm. Nhắn Zalo <a href="tel:<?php echo esc_attr(PSHOP_CONTACT_PHONE); ?>" style="color:var(--gold)"><?php echo esc_html(PSHOP_CONTACT_PHONE_DISPLAY); ?></a> hoặc nhắn <a href="<?php echo esc_url(PSHOP_CONTACT_FACEBOOK); ?>" target="_blank" style="color:var(--gold)">Facebook</a> để được báo giá nhanh nhất.</p>
      </div>
    </div>
  </div>
</section>

<section class="section contact-section" id="contact">
  <div class="container">
    <p class="sec-eyebrow">LIÊN HỆ</p>
    <h2 class="sec-title">TƯ VẤN MIỄN PHÍ</h2>
    <div class="contact-grid">
      <div>
        <p class="sec-desc">Có thắc mắc về thiết bị? Cần báo giá? Muốn tư vấn setup? Pshop Music luôn sẵn sàng hỗ trợ.</p>
        <div class="contact-items">
          <div class="contact-item">
            <div class="c-icon">&#128222;</div>
            <div><div class="c-label">ĐIỆN THOẠI / ZALO</div><div class="c-val"><a href="tel:<?php echo esc_attr(PSHOP_CONTACT_PHONE); ?>"><?php echo esc_html(PSHOP_CONTACT_PHONE_DISPLAY); ?></a></div></div>
          </div>
          <div class="contact-item">
            <div class="c-icon">&#128205;</div>
            <div><div class="c-label">ĐỊA CHỈ</div><div class="c-val"><a href="https://maps.app.goo.gl/ihv9EZhZCNfwP9um6" target="_blank">86 Lạc Long Quân, Nha Trang, Khánh Hòa</a></div></div>
          </div>
          <div class="contact-item">
            <div class="c-icon">&#128722;</div>
            <div><div class="c-label">SHOPEE</div><div class="c-val"><a href="<?php echo esc_url(PSHOP_CONTACT_SHOPEE); ?>" target="_blank">shopee.vn/music_store_79</a></div></div>
          </div>
          <div class="contact-item">
            <div class="c-icon">&#128077;</div>
            <div><div class="c-label">FACEBOOK</div><div class="c-val"><a href="<?php echo esc_url(PSHOP_CONTACT_FACEBOOK); ?>" target="_blank">Cho Thuê Thiết Bị DJ</a></div></div>
          </div>
          <div class="contact-item">
            <div class="c-icon">&#128336;</div>
            <div><div class="c-label">GIỜ HOẠT ĐỘNG</div><div class="c-val">8:00 – 21:00 · Cả tuần</div></div>
          </div>
        </div>
        <div class="map-box">
          <iframe src="https://maps.google.com/maps?q=86+Lac+Long+Quan+Nha+Trang+Khanh+Hoa&output=embed" allowfullscreen="" loading="lazy"></iframe>
        </div>
      </div>
      <div>
        <div class="contact-form" id="contactForm">
          <div class="form-row">
            <div class="form-group"><label>HỌ TÊN</label><input type="text" id="fname" placeholder="Tên của bạn"></div>
            <div class="form-group"><label>SỐ ĐIỆN THOẠI</label><input type="tel" id="fphone" placeholder="0912 345 678"></div>
          </div>
          <div class="form-group">
            <label>BẠN CẦN TƯ VẤN VỀ</label>
            <select id="ftype">
              <option value="">Chọn danh mục</option>
              <option>Mua máy DJ / bàn DJ</option>
              <option>Mua loa kiểm âm</option>
              <option>Mua tai nghe DJ</option>
              <option>Mua soundcard / giao diện âm thanh</option>
              <option>Mua phụ kiện DJ</option>
              <option>Cho thuê loa kiểm âm</option>
              <option>Cho thuê máy DJ / DJ booth</option>
              <option>Tư vấn setup âm thanh bar / café / lounge</option>
              <option>Bảo trì &amp; sửa chữa thiết bị</option>
              <option>Khác</option>
            </select>
          </div>
          <div class="form-group"><label>NỘI DUNG</label><textarea id="fmsg" rows="4" placeholder="Mô tả yêu cầu — thiết bị cần mua, địa điểm setup, thời gian thuê..."></textarea></div>
          <button class="submit-btn" onclick="submitForm()">GỬI YÊU CẦU TƯ VẤN</button>
          <div class="form-success" id="formSuccess">&#10003; Đã nhận yêu cầu! Chúng tôi sẽ liên hệ lại sớm nhất có thể.</div>
          <p class="form-note">Hoặc nhắn thẳng qua <strong style="color:var(--gold);font-weight:400">Zalo <?php echo esc_html(PSHOP_CONTACT_PHONE_DISPLAY); ?></strong> để được phản hồi nhanh hơn.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<?php get_footer(); ?>
