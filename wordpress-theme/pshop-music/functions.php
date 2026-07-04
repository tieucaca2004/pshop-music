<?php
/**
 * Pshop Music theme functions.
 * Registers the product post type + category taxonomy, product meta box,
 * one-time data import from assets/data/products.json, and asset loading.
 */

if (!defined('ABSPATH')) exit;

define('PSHOP_CATEGORIES', array(
    'dj'        => 'Máy DJ',
    'loa'       => 'Loa kiểm âm',
    'tainghe'   => 'Tai nghe',
    'soundcard' => 'Soundcard',
    'phukien'   => 'Phụ kiện',
));

define('PSHOP_CONTACT_PHONE', '0901952999');
define('PSHOP_CONTACT_PHONE_DISPLAY', '0901 952 999');
define('PSHOP_CONTACT_ZALO', 'https://zalo.me/0901952999');
define('PSHOP_CONTACT_FACEBOOK', 'https://www.facebook.com/ChoThueThietBiDJ');
define('PSHOP_CONTACT_MESSENGER', 'https://m.me/ChoThueThietBiDJ');
define('PSHOP_CONTACT_SHOPEE', 'https://shopee.vn/music_store_79');

/* ------------------------------------------------------------------ */
/* Theme setup                                                        */
/* ------------------------------------------------------------------ */
add_action('after_setup_theme', function () {
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('html5', array('search-form', 'gallery', 'caption'));
});

/* ------------------------------------------------------------------ */
/* Custom Post Type: pshop_product                                    */
/* No public single-product pages — products are shown in a modal on  */
/* the homepage, matching the original site's UX exactly.             */
/* ------------------------------------------------------------------ */
add_action('init', function () {
    register_post_type('pshop_product', array(
        'labels' => array(
            'name'               => 'Sản phẩm',
            'singular_name'      => 'Sản phẩm',
            'add_new_item'       => 'Thêm sản phẩm mới',
            'edit_item'          => 'Sửa sản phẩm',
            'all_items'          => 'Tất cả sản phẩm',
            'search_items'       => 'Tìm sản phẩm',
            'not_found'          => 'Không có sản phẩm nào',
            'featured_image'     => 'Ảnh sản phẩm',
            'set_featured_image' => 'Chọn ảnh sản phẩm',
        ),
        'public'             => false,
        'show_ui'            => true,
        'show_in_menu'       => true,
        'menu_icon'          => 'dashicons-controls-volumeon',
        'supports'           => array('title', 'editor', 'thumbnail'),
        'has_archive'        => false,
        'exclude_from_search'=> true,
        'menu_position'      => 5,
    ));

    register_taxonomy('pshop_category', 'pshop_product', array(
        'labels' => array(
            'name'          => 'Danh mục sản phẩm',
            'singular_name' => 'Danh mục',
        ),
        'hierarchical'      => true,
        'public'            => false,
        'show_ui'           => true,
        'show_admin_column' => true,
        'rewrite'           => false,
    ));
});

/* Create the 5 default category terms once, with slugs matching the original site's category codes. */
add_action('after_switch_theme', function () {
    foreach (PSHOP_CATEGORIES as $slug => $label) {
        if (!term_exists($slug, 'pshop_category')) {
            wp_insert_term($label, 'pshop_category', array('slug' => $slug));
        }
    }
    pshop_maybe_import_products();
});

/* ------------------------------------------------------------------ */
/* Product meta box: brand, specs line, price, status, badge text     */
/* ------------------------------------------------------------------ */
add_action('add_meta_boxes', function () {
    add_meta_box(
        'pshop_product_details',
        'Chi tiết sản phẩm',
        'pshop_render_product_meta_box',
        'pshop_product',
        'normal',
        'high'
    );
});

function pshop_render_product_meta_box($post) {
    wp_nonce_field('pshop_save_product_meta', 'pshop_product_meta_nonce');
    $brand  = get_post_meta($post->ID, '_pshop_brand', true);
    $specs  = get_post_meta($post->ID, '_pshop_specs', true);
    $price  = get_post_meta($post->ID, '_pshop_price', true);
    $status = get_post_meta($post->ID, '_pshop_status', true) ?: 'New';
    $badge  = get_post_meta($post->ID, '_pshop_badge', true);
    ?>
    <p>
        <label><strong>Thương hiệu</strong></label><br>
        <input type="text" name="pshop_brand" value="<?php echo esc_attr($brand); ?>" style="width:100%" placeholder="VD: Pioneer DJ">
    </p>
    <p>
        <label><strong>Thông số / dòng phụ</strong> (hiển thị dưới tên sản phẩm)</label><br>
        <input type="text" name="pshop_specs" value="<?php echo esc_attr($specs); ?>" style="width:100%" placeholder="VD: Pioneer DJ · AlphaTheta · 10.1&quot; Touch · Rekordbox / Serato">
    </p>
    <p>
        <label><strong>Giá</strong> (để trống nếu &quot;liên hệ báo giá&quot;)</label><br>
        <input type="text" name="pshop_price" value="<?php echo esc_attr($price); ?>" style="width:100%" placeholder="VD: 1.200.000 ₫">
    </p>
    <p>
        <label><strong>Tình trạng</strong></label><br>
        <select name="pshop_status">
            <option value="New" <?php selected($status, 'New'); ?>>Mới / Chính hãng</option>
            <option value="Used" <?php selected($status, 'Used'); ?>>Qua sử dụng</option>
        </select>
    </p>
    <p>
        <label><strong>Nhãn (badge)</strong></label><br>
        <input type="text" name="pshop_badge" value="<?php echo esc_attr($badge); ?>" style="width:100%" placeholder="VD: Chính hãng · BH 12th">
    </p>
    <p style="color:#666">Mô tả chi tiết sản phẩm: dùng ô nội dung chính phía trên (trình soạn thảo).</p>
    <?php
}

add_action('save_post_pshop_product', function ($post_id) {
    if (!isset($_POST['pshop_product_meta_nonce']) || !wp_verify_nonce($_POST['pshop_product_meta_nonce'], 'pshop_save_product_meta')) return;
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
    if (!current_user_can('edit_post', $post_id)) return;

    $fields = array(
        'pshop_brand'  => '_pshop_brand',
        'pshop_specs'  => '_pshop_specs',
        'pshop_price'  => '_pshop_price',
        'pshop_badge'  => '_pshop_badge',
    );
    foreach ($fields as $input => $meta_key) {
        if (isset($_POST[$input])) {
            update_post_meta($post_id, $meta_key, sanitize_text_field(wp_unslash($_POST[$input])));
        }
    }
    if (isset($_POST['pshop_status'])) {
        $status = $_POST['pshop_status'] === 'Used' ? 'Used' : 'New';
        update_post_meta($post_id, '_pshop_status', $status);
    }
});

/* Admin list table columns for quick scanning. */
add_filter('manage_pshop_product_posts_columns', function ($columns) {
    $columns['pshop_price']  = 'Giá';
    $columns['pshop_status'] = 'Tình trạng';
    return $columns;
});
add_action('manage_pshop_product_posts_custom_column', function ($column, $post_id) {
    if ($column === 'pshop_price') {
        $price = get_post_meta($post_id, '_pshop_price', true);
        echo $price ? esc_html($price) : '<span style="color:#999">Liên hệ</span>';
    }
    if ($column === 'pshop_status') {
        $status = get_post_meta($post_id, '_pshop_status', true);
        echo $status === 'Used' ? 'Qua sử dụng' : 'Mới';
    }
}, 10, 2);

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */
add_action('wp_enqueue_scripts', function () {
    wp_enqueue_style('pshop-google-fonts', 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Be+Vietnam+Pro:wght@300;400;500;600&display=swap', array(), null);
    wp_enqueue_style('pshop-style', get_stylesheet_uri(), array(), wp_get_theme()->get('Version'));
    wp_enqueue_script('pshop-main', get_template_directory_uri() . '/assets/js/main.js', array(), wp_get_theme()->get('Version'), true);
    wp_localize_script('pshop-main', 'PSHOP_DATA', array(
        'products' => pshop_get_products_for_frontend(),
        'contact'  => array(
            'phone'        => PSHOP_CONTACT_PHONE,
            'phoneDisplay' => PSHOP_CONTACT_PHONE_DISPLAY,
            'zalo'         => PSHOP_CONTACT_ZALO,
            'facebook'     => PSHOP_CONTACT_FACEBOOK,
            'shopee'       => PSHOP_CONTACT_SHOPEE,
        ),
    ));
});

/**
 * Builds the same product object shape the front-end JS already expects,
 * so assets/js/main.js needed almost no changes when moving off localStorage.
 */
function pshop_get_products_for_frontend() {
    $query = new WP_Query(array(
        'post_type'      => 'pshop_product',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'orderby'        => 'menu_order title',
        'order'          => 'ASC',
    ));

    $products = array();
    foreach ($query->posts as $post) {
        $terms = get_the_terms($post->ID, 'pshop_category');
        $cat_slug  = ($terms && !is_wp_error($terms)) ? $terms[0]->slug : '';
        $cat_label = ($terms && !is_wp_error($terms)) ? $terms[0]->name : '';
        $status    = get_post_meta($post->ID, '_pshop_status', true) ?: 'New';

        $products[] = array(
            'id'            => (string) $post->ID,
            'name'          => get_the_title($post),
            'category'      => $cat_slug,
            'categoryLabel' => $cat_label,
            'brand'         => get_post_meta($post->ID, '_pshop_brand', true),
            'specs'         => get_post_meta($post->ID, '_pshop_specs', true),
            'description'   => wp_strip_all_tags($post->post_content),
            'price'         => get_post_meta($post->ID, '_pshop_price', true),
            'image'         => get_the_post_thumbnail_url($post, 'large') ?: '',
            'status'        => $status,
            'badgeText'     => get_post_meta($post->ID, '_pshop_badge', true),
        );
    }
    wp_reset_postdata();
    return $products;
}

/* ------------------------------------------------------------------ */
/* One-time product import from assets/data/products.json             */
/* ------------------------------------------------------------------ */
function pshop_maybe_import_products() {
    if (get_option('pshop_products_imported')) return;

    $json_path = get_template_directory() . '/assets/data/products.json';
    if (!file_exists($json_path)) return;

    $data = json_decode(file_get_contents($json_path), true);
    if (empty($data['products'])) return;

    foreach ($data['products'] as $p) {
        $existing = get_posts(array(
            'post_type'      => 'pshop_product',
            'title'          => $p['name'],
            'posts_per_page' => 1,
            'fields'         => 'ids',
        ));
        if (!empty($existing)) continue;

        $post_id = wp_insert_post(array(
            'post_type'    => 'pshop_product',
            'post_status'  => 'publish',
            'post_title'   => $p['name'],
            'post_content' => $p['description'],
        ));
        if (is_wp_error($post_id) || !$post_id) continue;

        if (!empty($p['category'])) {
            wp_set_object_terms($post_id, $p['category'], 'pshop_category');
        }
        update_post_meta($post_id, '_pshop_brand', $p['brand'] ?? '');
        update_post_meta($post_id, '_pshop_specs', $p['specs'] ?? '');
        update_post_meta($post_id, '_pshop_price', $p['price'] ?? '');
        update_post_meta($post_id, '_pshop_status', ($p['status'] ?? 'New') === 'Used' ? 'Used' : 'New');
        update_post_meta($post_id, '_pshop_badge', $p['badgeText'] ?? '');

        if (!empty($p['image'])) {
            pshop_set_featured_image_from_url($post_id, $p['image'], $p['name']);
        }
    }

    update_option('pshop_products_imported', true);
}

/** Sideloads a remote image URL as the post's featured image. */
function pshop_set_featured_image_from_url($post_id, $url, $desc = '') {
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $attachment_id = media_sideload_image($url, $post_id, $desc, 'id');
    if (!is_wp_error($attachment_id)) {
        set_post_thumbnail($post_id, $attachment_id);
    }
}

/**
 * Manual re-import trigger: visit /wp-admin/?pshop_reimport=1 as an admin
 * if you ever need to re-run the import (e.g. after clearing all products).
 */
add_action('admin_init', function () {
    if (isset($_GET['pshop_reimport']) && current_user_can('manage_options')) {
        delete_option('pshop_products_imported');
        pshop_maybe_import_products();
        wp_redirect(admin_url('edit.php?post_type=pshop_product&imported=1'));
        exit;
    }
});
