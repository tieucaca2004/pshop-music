/*
 * Video Generator — Video Generation Module
 * ===========================================
 * Registers with AIModuleRegistry to provide video generation capabilities
 * through the unified pipeline. Routes through WorkflowEngine → 
 * GenerationService → ProviderRouter → AIJobQueue → Seedance/Runway/etc.
 *
 * Provides input fields for:
 *   - Script/Storyboard generation
 *   - Duration control (5-60s)
 *   - Resolution selection (720p/1080p/4K)
 *   - Visual style selection
 *   - Background music
 *   - Scene descriptions
 *
 * Uses DataProvider for product/restaurant context (if a productId or
 * restaurant context is provided, loads real data for the AI).
 *
 * Dependencies:
 *   js/ai/module-registry.js        → AIModuleRegistry
 *   js/ai/data-provider.js          → DataProvider
 */
AIModuleRegistry.register({
  id: 'video-generator',
  label: 'Video AI',
  description: 'Tạo video quảng cáo từ kịch bản, sản phẩm, hoặc mô tả tự do — hỗ trợ nhiều độ phân giải, phong cách, và thời lượng — luôn dừng ở Asset Library để Founder chọn nơi đăng.',

  targetCollection: null, // Video không publish trực tiếp — lưu Asset Library → Founder chọn nơi đăng

  inputFields: [
    { key: 'scriptType', label: 'Loại kịch bản', type: 'select', options: [
      'Quảng cáo sản phẩm',
      'Quảng cáo nhà hàng',
      'Giới thiệu thương hiệu',
      'Kịch bản tự do'
    ]},
    { key: 'productId', label: 'Sản phẩm (nếu quảng cáo sản phẩm)', type: 'productSelect', optional: true },
    { key: 'customScript', label: 'Mô tả video tự do (nếu không chọn sản phẩm)', type: 'textarea',
      placeholder: 'VD: Video 15s giới thiệu món Hủ Tiếu Xào A Tiểu — quay cận cảnh sợi hủ tiếu vàng óng, tôm, thịt heo quay giòn, rau sống tươi...',
      optional: true },
    { key: 'duration', label: 'Thời lượng', type: 'select', options: [
      '15 giây', '30 giây', '45 giây', '60 giây'
    ]},
    { key: 'resolution', label: 'Độ phân giải', type: 'select', options: [
      '720p', '1080p', '4K'
    ]},
    { key: 'style', label: 'Phong cách hình ảnh', type: 'select', options: [
      'Chân thực (Realistic)', 'Điện ảnh (Cinematic)', 'Hoạt hình (Animated)',
      'Ấm cúng (Warm)', 'Sang trọng (Luxury)', 'Năng động (Dynamic)'
    ]},
    { key: 'backgroundMusic', label: 'Nhạc nền', type: 'select', options: [
      'Không nhạc', 'Nhạc sôi động', 'Nhạc nhẹ nhàng', 'Nhạc điện ảnh', 'Nhạc quảng cáo'
    ], optional: true },
    { key: 'scenes', label: 'Số cảnh quay', type: 'select', options: [
      '1 cảnh', '2 cảnh', '3 cảnh', '4 cảnh', '5 cảnh'
    ]},
    { key: 'voiceOver', label: 'Giọng đọc', type: 'select', options: [
      'Không giọng đọc', 'Giọng nam', 'Giọng nữ', 'Tự động'
    ], optional: true }
  ],

  /**
   * loadContext(inputParams) — Load real data based on input type.
   * Nếu có productId, load sản phẩm thật từ Firebase.
   * Nếu không, không load context đặc biệt (custom script mode).
   */
  loadContext(inputParams) {
    if (inputParams.productId) {
      return DataProvider.getProduct(inputParams.productId).then(function (product) {
        return { product: product };
      });
    }
    return Promise.resolve({});
  },

  /**
   * buildPrompt(inputParams, context) — Build a structured prompt for the
   * video generation provider. Includes all scene descriptions, style, and
   * duration settings.
   */
  buildPrompt(inputParams, context) {
    var scriptType = inputParams.scriptType || 'Kịch bản tự do';
    var customScript = inputParams.customScript || '';
    var duration = inputParams.duration || '15 giây';
    var resolution = inputParams.resolution || '1080p';
    var style = inputParams.style || 'Chân thực (Realistic)';
    var bgMusic = inputParams.backgroundMusic || 'Không nhạc';
    var sceneCount = inputParams.scenes || '2 cảnh';
    var voiceOver = inputParams.voiceOver || 'Không giọng đọc';
    var product = context.product || null;

    var lines = [];

    // Header
    lines.push('Tạo video quảng cáo với thông số sau:');
    lines.push('');

    // Script/Source
    if (product) {
      lines.push('--- THÔNG TIN SẢN PHẨM ---');
      lines.push('Tên sản phẩm: ' + (product.name || 'Không có tên'));
      lines.push('Thương hiệu: ' + (product.brand || 'Pshop Music'));
      lines.push('Danh mục: ' + (product.category || 'Không có danh mục'));
      if (product.description) {
        lines.push('Mô tả: ' + (product.description.length > 300 ? product.description.substring(0, 300) + '...' : product.description));
      }
      if (product.price) {
        lines.push('Giá: ' + product.price.toLocaleString('vi-VN') + '₫');
      }
      lines.push('');
    }

    // User script/description
    if (customScript) {
      lines.push('--- MÔ TẢ VIDEO ---');
      lines.push(customScript);
      lines.push('');
    }

    // Technical specs
    lines.push('--- THÔNG SỐ KỸ THUẬT ---');
    lines.push('Thời lượng: ' + duration);
    lines.push('Độ phân giải: ' + resolution);
    lines.push('Phong cách: ' + style);
    lines.push('Số cảnh: ' + sceneCount);
    lines.push('Nhạc nền: ' + bgMusic);
    lines.push('Giọng đọc: ' + voiceOver);
    lines.push('');

    // Scene breakdown (generate scene descriptions)
    lines.push('--- PHÂN CẢNH ---');
    var numScenes = parseInt(sceneCount) || 2;
    for (var i = 1; i <= numScenes; i++) {
      lines.push('Cảnh ' + i + ':');
      lines.push('  Mô tả: [Mô tả chi tiết nội dung cảnh ' + i + ']');
      lines.push('  Duration: ' + Math.floor(parseInt(duration) / numScenes) + 's' + (i === 1 ? ' (mở đầu)' : i === numScenes ? ' (kết thúc)' : ''));
      lines.push('');
    }

    // Output format
    lines.push('--- ĐỊNH DẠNG ĐẦU RA ---');
    lines.push('Format: mp4');
    lines.push('Codec: H.264');
    lines.push('Audio: AAC, 128kbps');
    lines.push('Aspect ratio: 16:9');
    lines.push('');

    // Instructions
    lines.push('--- HƯỚNG DẪN ---');
    lines.push('1. Sinh kịch bản chi tiết từng cảnh dựa trên mô tả');
    lines.push('2. Tạo storyboard cho mỗi cảnh (mô tả hình ảnh)');
    lines.push('3. Render video với thông số kỹ thuật ở trên');
    lines.push('4. Thêm nhạc nền nếu được yêu cầu');
    lines.push('5. Xuất ra định dạng mp4 H.264');

    return lines.join('\n');
  },

  /**
   * mapToDraftContent(providerOutput, inputParams, context) — Map provider
   * output to asset-ready content. Even though video doesn't publish to a
   * CMS collection, we store structured metadata for Asset Library.
   */
  mapToDraftContent(providerOutput, inputParams, context) {
    // providerOutput after going through Seedance provider will have:
    // { text: (script/storyboard), videoUrl: (actual video URL), thumbnailUrl, metadata }
    // But standard provider.generate() returns { text, raw }.
    // The actual video URL is stored in the asset metadata by AssetManager.

    return {
      title: inputParams.customScript
        ? 'Video: ' + (inputParams.customScript.length > 50 ? inputParams.customScript.substring(0, 50) + '...' : inputParams.customScript)
        : 'Video ' + (inputParams.scriptType || 'quảng cáo'),
      name: (context.product ? context.product.name : 'Video') + ' - ' + (inputParams.duration || '15 giây'),
      script: inputParams.customScript || (context.product ? 'Quảng cáo ' + context.product.name : ''),
      storyboard: providerOutput.text || '',
      duration: inputParams.duration || '15 giây',
      resolution: inputParams.resolution || '1080p',
      style: inputParams.style || 'Chân thực (Realistic)',
      scenes: inputParams.scenes || '2 cảnh',
      backgroundMusic: inputParams.backgroundMusic || 'Không nhạc',
      voiceOver: inputParams.voiceOver || 'Không giọng đọc',
      productId: inputParams.productId || null,
      providerOutput: providerOutput,
      generatedAt: Date.now()
    };
  }
});
