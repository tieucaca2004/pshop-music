<!DOCTYPE html>
<html lang="vi" <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<nav>
  <div class="container nav-inner">
    <div class="logo">P<span>&#183;</span>SHOP MUSIC</div>
    <div class="nav-links">
      <a href="#products">SẢN PHẨM</a>
      <a href="#services">DỊCH VỤ</a>
      <a href="#contact">LIÊN HỆ</a>
      <a href="<?php echo esc_url(PSHOP_CONTACT_SHOPEE); ?>" target="_blank">Shopee</a>
    </div>
    <button class="nav-cta" onclick="document.getElementById('contact').scrollIntoView({behavior:'smooth'})">TƯ VẤN NGAY</button>
    <button class="nav-toggle" onclick="document.getElementById('mobileNav').classList.toggle('open')" aria-label="Menu">&#9776;</button>
  </div>
</nav>

<div class="mobile-nav" id="mobileNav">
  <a href="#products" onclick="this.closest('.mobile-nav').classList.remove('open')">SẢN PHẨM</a>
  <a href="#services" onclick="this.closest('.mobile-nav').classList.remove('open')">DỊCH VỤ</a>
  <a href="#contact" onclick="this.closest('.mobile-nav').classList.remove('open')">LIÊN HỆ</a>
  <a href="<?php echo esc_url(PSHOP_CONTACT_SHOPEE); ?>" target="_blank">SHOPEE SHOP</a>
  <a href="<?php echo esc_url(PSHOP_CONTACT_FACEBOOK); ?>" target="_blank">Facebook</a>
  <a href="tel:<?php echo esc_attr(PSHOP_CONTACT_PHONE); ?>" style="color:var(--gold);font-size:1.1rem"><?php echo esc_html(PSHOP_CONTACT_PHONE_DISPLAY); ?></a>
</div>
