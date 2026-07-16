/*
 * shared/agentTools.js — Sprint 14 Phase 4 (FINAL mục 18.1). Hằng số port
 * NGUYÊN VẸN từ js/admin-agent.js — KHÔNG đổi tên tool/field/URL, chỉ chép
 * sang server để executeStep()/buildPlan() phía Backend dùng đúng cùng dữ
 * liệu với client (2 bên độc lập, KHÔNG cùng require 1 file — client là
 * trình duyệt, server là Cloud Function, không chia sẻ module JS được).
 */
const PRODUCT_TOKEN = '$product';
const RESEARCH_TOKENS = ['$research.name', '$research.brand', '$research.model'];
const CATEGORY_CONFIDENCE_AUTO = 90;

// 5 nhóm hành vi (audit Phần 3.8 / FINAL mục 18.1).
const GROUP_WRITE_DIRECT = 'write-direct';       // create-product, detect-category
const GROUP_IMAGE_SYNC = 'image-sync';           // smart-background, product-banner
const GROUP_READONLY = 'readonly';               // research-product, check-duplicate, related-products, quality-score, missing-info-report
const GROUP_NAVIGATE = 'navigate';               // open-product, update-product-field, open-draft, navigate
const GROUP_GENERIC_PLUGIN = 'generic-plugin';   // 8 module AI content-generation + seo marker

const TOOL_GROUPS = {
  'research-product': GROUP_READONLY,
  'check-duplicate': GROUP_READONLY,
  'create-product': GROUP_WRITE_DIRECT,
  'smart-background': GROUP_IMAGE_SYNC,
  'detect-category': GROUP_WRITE_DIRECT,
  'product-description-writer': GROUP_GENERIC_PLUGIN,
  'seo': GROUP_GENERIC_PLUGIN,
  'blog-writer': GROUP_GENERIC_PLUGIN,
  'facebook-post-generator': GROUP_GENERIC_PLUGIN,
  'banner-generator': GROUP_GENERIC_PLUGIN,
  'image-generator': GROUP_GENERIC_PLUGIN,
  'product-banner': GROUP_IMAGE_SYNC,
  'related-products': GROUP_READONLY,
  'quality-score': GROUP_READONLY,
  'missing-info-report': GROUP_READONLY,
  'open-product': GROUP_NAVIGATE,
  'update-product-field': GROUP_NAVIGATE,
  'open-draft': GROUP_NAVIGATE,
  'navigate': GROUP_NAVIGATE
};

const TOOL_MAP = {
  'create-product': { label: 'Tạo Sản phẩm mới' },
  'product-description-writer': { label: 'Mô tả Sản phẩm (AI)' },
  seo: { label: 'SEO (gộp chung Product AI)' },
  'blog-writer': { label: 'Viết Blog (AI)' },
  'facebook-post-generator': { label: 'Bài Facebook (AI)' },
  'banner-generator': { label: 'Banner quảng cáo (AI)' },
  'image-generator': { label: 'Ảnh marketing (AI)' },
  'open-product': { label: 'Mở Sản phẩm' },
  'update-product-field': { label: 'Sửa 1 trường Sản phẩm' },
  'open-draft': { label: 'Mở Nháp' },
  navigate: { label: 'Mở trang CMS' },
  'research-product': { label: 'Tra cứu Sản phẩm (AI)' },
  'check-duplicate': { label: 'Kiểm tra trùng lặp' },
  'smart-background': { label: 'Xóa phông tự động' },
  'detect-category': { label: 'Tự động gán Danh mục' },
  'product-banner': { label: 'Banner sản phẩm (AI)' },
  'related-products': { label: 'Sản phẩm liên quan' },
  'quality-score': { label: 'Điểm chất lượng Sản phẩm' },
  'missing-info-report': { label: 'Báo cáo thiếu thông tin' }
};

// NAV_PAGES — đúng js/admin-agent.js:119-127.
const NAV_PAGES = {
  products: '/admin/products.html',
  categories: '/admin/categories.html',
  blog: '/admin/blog.html',
  banners: '/admin/banners.html',
  drafts: '/admin/ai/drafts.html',
  'social-media': '/admin/social-media-center.html',
  images: '/admin/ai/images.html'
};

// AGENT_FIELD_LABELS — đúng js/admin-agent.js:132 (khớp AGENT_FIELD_MAP ở
// js/admin-products.js — 2 danh sách phải cùng bộ khóa).
const AGENT_FIELD_LABELS = { price: 'Giá', oldprice: 'Giá cũ', name: 'Tên', warranty: 'Bảo hành', stockstatus: 'Trạng thái kho', status: 'Tình trạng', sku: 'SKU' };

const UNDOABLE_DRAFT_TOOLS = ['product-description-writer', 'seo', 'blog-writer', 'facebook-post-generator', 'banner-generator', 'image-generator'];

module.exports = {
  PRODUCT_TOKEN, RESEARCH_TOKENS, CATEGORY_CONFIDENCE_AUTO,
  GROUP_WRITE_DIRECT, GROUP_IMAGE_SYNC, GROUP_READONLY, GROUP_NAVIGATE, GROUP_GENERIC_PLUGIN,
  TOOL_GROUPS, TOOL_MAP, NAV_PAGES, AGENT_FIELD_LABELS, UNDOABLE_DRAFT_TOOLS
};
