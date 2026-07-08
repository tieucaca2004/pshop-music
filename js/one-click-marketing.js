/*
 * OneClickMarketing — Sprint 10 Requirement #3 (One Click Marketing
 * Foundation). Service THUẦN (không DOM, không Firebase, không gọi AI
 * Provider) — chỉ ghép 1 bộ input đã thu thập (Business/Product/Marketing
 * Goal) thành 1 "Marketing Package" gồm 6 mục output DẠNG MẪU (template),
 * KHÔNG PHẢI nội dung do AI sinh ra. Đúng Objective: "Chưa triển khai AI
 * Generation thật. Chỉ xây dựng Workflow và Experience Layer."
 *
 * Không import/gọi AIModuleRegistry/PluginManager/AIProviderRegistry/
 * AIJobQueue/AITaskRouter/DataProvider — đây là 1 module ĐỘC LẬP, không
 * chạm vào AI Framework (đúng Architectural Constraint).
 */
const OneClickMarketing = (function () {
  // Schema Wizard — mỗi bước chỉ giữ đúng field cần thiết cho bước đó
  // (Functional Requirement: "Không Form dài", "Mỗi bước chỉ hiển thị
  // thông tin cần thiết").
  const WIZARD_STEPS = [
    { key: 'business', label: 'Doanh nghiệp', fields: ['businessName', 'address'] },
    { key: 'product', label: 'Sản phẩm', fields: ['productName', 'price', 'category', 'image'] },
    { key: 'goal', label: 'Mục tiêu Marketing', fields: ['promotion'] },
    { key: 'review', label: 'Xem lại', fields: [] },
    { key: 'generate', label: 'Sinh Gói Marketing', fields: [] }
  ];

  function escapeText(v) {
    return (v || '').toString().trim();
  }

  // buildMarketingPackage(input) — hàm THUẦN, đồng bộ, không side-effect,
  // không gọi mạng/AI Provider nào. Chỉ ghép lại đúng dữ liệu input đã có —
  // không suy diễn/bịa thêm dữ kiện nào không được cung cấp (cùng tinh thần
  // AI_RULES.md mục 2, dù đây không phải AI Plugin).
  function buildMarketingPackage(input) {
    const businessName = escapeText(input.businessName);
    const address = escapeText(input.address);
    const productName = escapeText(input.productName);
    const price = escapeText(input.price);
    const category = escapeText(input.category);
    const promotion = escapeText(input.promotion);
    const image = escapeText(input.image);

    const bodyParts = [];
    if (productName) bodyParts.push(`${productName} hiện có tại ${businessName || 'cửa hàng'}.`);
    if (price) bodyParts.push(`Giá: ${price}.`);
    if (promotion) bodyParts.push(promotion + '.');
    if (category) bodyParts.push(`Thuộc danh mục: ${category}.`);
    if (address) bodyParts.push(`Địa chỉ: ${address}.`);

    const fbLines = [];
    if (productName) fbLines.push(productName);
    if (promotion) fbLines.push(promotion);
    if (price) fbLines.push('Giá: ' + price);
    if (address) fbLines.push('📍 ' + address);

    return {
      websiteArticle: {
        title: [productName, promotion].filter(Boolean).join(' - '),
        body: bodyParts.join(' ')
      },
      facebookPost: {
        text: fbLines.join('\n')
      },
      seoMetadata: {
        title: [productName, businessName].filter(Boolean).join(' - '),
        description: [productName, promotion].filter(Boolean).join(' - ')
      },
      bannerRequest: {
        theme: promotion || productName,
        link: category ? ('category.html?cat=' + encodeURIComponent(category)) : ''
      },
      aiImageRequest: {
        note: image
          ? 'Dùng ảnh sản phẩm đã chọn làm tham khảo — CHƯA gọi AI tạo ảnh thật (Foundation only).'
          : 'Chưa chọn ảnh sản phẩm — chưa có gì để tham khảo.',
        referenceImage: image
      },
      aiVideoRequest: {
        note: 'AI Video Generation chưa được tích hợp trong hệ thống — đây chỉ là mục placeholder, chờ Requirement riêng trong tương lai (xem ROADMAP.md).'
      }
    };
  }

  return { WIZARD_STEPS, buildMarketingPackage };
})();
