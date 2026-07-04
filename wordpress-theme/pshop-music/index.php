<?php
/**
 * Fallback template. The real homepage is front-page.php — this file only
 * renders if WordPress is ever asked for a URL outside the front page
 * (e.g. search results). Required for WordPress to recognize this as a
 * valid theme.
 */
get_header();
?>
<section class="section">
  <div class="container">
    <p class="sec-eyebrow">PSHOP MUSIC</p>
    <h2 class="sec-title"><?php is_search() ? print('KẾT QUẢ TÌM KIẾM') : print('TRANG KHÔNG TỒN TẠI'); ?></h2>
    <?php if (have_posts()): ?>
      <div class="svc-list">
        <?php while (have_posts()): the_post(); ?>
          <div class="svc-item">
            <div class="svc-body">
              <h4><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h4>
            </div>
          </div>
        <?php endwhile; ?>
      </div>
    <?php else: ?>
      <p class="sec-desc">Không tìm thấy nội dung. <a href="<?php echo esc_url(home_url('/')); ?>" style="color:var(--gold-ink);font-weight:600">Về trang chủ</a>.</p>
    <?php endif; ?>
  </div>
</section>
<?php get_footer(); ?>
