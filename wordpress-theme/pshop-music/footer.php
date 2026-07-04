<footer>
  <div class="container">
    <div class="footer-grid">
      <div class="footer-col">
        <h5>Hỗ Trợ</h5>
        <a href="#contact">Liên hệ tư vấn</a>
        <a href="#contact">Hướng dẫn mua hàng</a>
        <a href="#services">Chính sách bảo hành</a>
      </div>
      <div class="footer-col">
        <h5>Sản Phẩm</h5>
        <a href="#products" onclick="jumpToCategory('dj')">Máy DJ &amp; Controller</a>
        <a href="#products" onclick="jumpToCategory('loa')">Loa kiểm âm</a>
        <a href="#products" onclick="jumpToCategory('tainghe')">Tai nghe</a>
        <a href="#products" onclick="jumpToCategory('phukien')">Phụ kiện</a>
      </div>
      <div class="footer-col">
        <h5>Về Chúng Tôi</h5>
        <a href="#heroSection">Giới thiệu Pshop Music</a>
        <a href="#services">Dịch vụ cho thuê</a>
        <a href="#contact">Tìm cửa hàng</a>
      </div>
      <div class="footer-col footer-col-news">
        <h5>Kết Nối</h5>
        <div class="footer-social">
          <a href="<?php echo esc_url(PSHOP_CONTACT_FACEBOOK); ?>" target="_blank" aria-label="Facebook" class="social-btn social-fb">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 9.9V8.6c0-.6.4-.8.9-.8H16V4.9h-2.3c-2.5 0-3.7 1.5-3.7 3.7v1.3H8.3V13H10v8h3.5v-8h2.4l.4-3.1h-2.8z"/></svg>
          </a>
          <a href="<?php echo esc_url(PSHOP_CONTACT_MESSENGER); ?>" target="_blank" aria-label="Nhắn tin Messenger" class="social-btn social-messenger">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.1 2 11.2c0 2.9 1.5 5.5 3.9 7.2V22l3.5-1.9c.9.3 1.9.4 2.9.4 5.5 0 10-4.1 10-9.3S17.5 2 12 2zm1 12.4l-2.5-2.7-5 2.7 5.5-5.8 2.6 2.7 4.9-2.7-5.5 5.8z"/></svg>
          </a>
          <a href="<?php echo esc_url(PSHOP_CONTACT_ZALO); ?>" target="_blank" aria-label="Kết bạn Zalo" class="social-btn social-zalo">Z</a>
          <a href="<?php echo esc_url(PSHOP_CONTACT_SHOPEE); ?>" target="_blank" aria-label="Shopee" class="social-btn social-shopee">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.5 8h-2.3a4.2 4.2 0 00-8.4 0H5.5c-.6 0-1 .4-1.1 1L3 20c-.1.6.4 1.1 1 1.1h16c.6 0 1.1-.5 1-1.1l-1.4-11c-.1-.6-.5-1-1.1-1zM12 5.5c1.2 0 2.2.9 2.3 2.1H9.7c.1-1.2 1.1-2.1 2.3-2.1zM9.5 11a2.5 2.5 0 005 0v-1.4h1.4v1.4a3.9 3.9 0 01-7.8 0v-1.4h1.4V11z"/></svg>
          </a>
        </div>
        <a href="#contact">Điều khoản sử dụng</a>
        <a href="#contact">Chính sách bảo mật</a>
        <?php if (current_user_can('edit_posts')): ?>
        <a href="<?php echo esc_url(admin_url('edit.php?post_type=pshop_product')); ?>">Quản trị</a>
        <?php endif; ?>
      </div>
    </div>
    <p class="footer-copy">&#169; <?php echo esc_html(date('Y')); ?> Pshop Music &middot; 86 Lạc Long Quân, Nha Trang, Khánh Hòa &middot; <?php echo esc_html(preg_replace('#^https?://#', '', home_url())); ?></p>
  </div>
</footer>

<!-- MODAL -->
<div class="modal-overlay" id="modal" onclick="if(event.target===this)closeModal()">
  <div class="modal-box">
    <button class="modal-close" onclick="closeModal()">&#10005;</button>
    <div class="modal-img-side" id="modalImgSide">
      <div class="no-img" id="modalNoImg">PSHOP MUSIC</div>
    </div>
    <div class="modal-info-side">
      <div class="modal-cat" id="modalCat"></div>
      <div class="modal-name" id="modalName"></div>
      <div class="modal-brand" id="modalBrand"></div>
      <div class="modal-price" id="modalPrice" style="display:none"></div>
      <span class="modal-badge" id="modalBadge"></span>
      <div class="modal-desc" id="modalDesc"></div>
      <div class="modal-actions">
        <a href="tel:<?php echo esc_attr(PSHOP_CONTACT_PHONE); ?>" class="modal-phone">&#128222; GỌI TƯ VẤN NGAY: <?php echo esc_html(PSHOP_CONTACT_PHONE_DISPLAY); ?></a>
        <a href="<?php echo esc_url(PSHOP_CONTACT_ZALO); ?>" target="_blank" class="modal-zalo" id="modalZalo">&#128172; NHẮN ZALO</a>
        <a href="#" target="_blank" class="modal-shopee" id="modalSecondBtn">XEM TRÊN SHOPEE &#8594;</a>
      </div>
    </div>
  </div>
</div>

<?php wp_footer(); ?>
</body>
</html>
