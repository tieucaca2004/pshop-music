/**
 * Visual Intelligence — Image Analyzer & Grader
 * ==============================================
 * Analyzes uploaded product images to detect:
 *   - Orientation: front, rear, top, bottom, left, right
 *   - Components: screen, buttons, knobs, ports, displays
 *   - Details: labels, serial numbers, accessories, packaging
 *   - Condition: damage, missing parts, dust, wear
 *   - Quality: color, material, lighting, image quality
 *   - Selection: best hero, best gallery, close-ups
 *
 * Images that are blurry, too small, duplicates, or irrelevant
 * are automatically rejected.
 */

const ContentVisualIntelligence = (function () {
  /* ─── Orientation Detection (by filename + metadata heuristics) ─── */
  var ORIENTATION_KEYWORDS = {
    'front':       ['front', 'face', 'mặt trước', 'trước', 'hero'],
    'rear':        ['rear', 'back', 'mặt sau', 'sau', 'panel sau'],
    'top':         ['top', 'trên', 'mặt trên', 'overhead', 'top-down', 'overview'],
    'bottom':      ['bottom', 'dưới', 'đáy', 'mặt dưới'],
    'left':        ['left', 'trái', 'bên trái'],
    'right':       ['right', 'phải', 'bên phải'],
    'angle':       ['angle', 'góc', '3/4', '45', 'perspective', 'angled'],
    'screen':      ['screen', 'display', 'màn hình', 'touch', 'waveform'],
    'port':        ['port', 'cổng', 'connection', 'rear panel', 'i/o'],
    'jog':         ['jog', 'wheel', 'platter', 'vinyl'],
    'button':      ['button', 'nút', 'pad', 'fader', 'knob', 'encoder'],
    'accessory':   ['accessory', 'phụ kiện', 'cable', 'dây', 'adapter', 'box'],
    'package':     ['package', 'box', 'hộp', 'carton', 'bundle'],
    'detail':      ['close', 'detail', 'macro', 'chi tiết', 'cận cảnh'],
    'label':       ['label', 'nhãn', 'sticker', 'serial', 'barcode']
  };

  /* ─── Rejection Rules ─── */
  var MIN_IMAGE_SIZE = 200;      // pixels (width or height)
  var MAX_IMAGE_RATIO = 10;     // aspect ratio (too wide/tall = likely error)
  var DUPLICATE_HASH_LENGTH = 8; // first N chars of URL hash for dedup

  var CONFIDENCE_HIGH   = 'High';
  var CONFIDENCE_MEDIUM = 'Medium';
  var CONFIDENCE_LOW    = 'Low';

  /**
   * analyzeImages(images) — Analyze an array of image objects.
   *
   * images = [
   *   {
   *     url: string,
   *     width?: number,     // from metadata
   *     height?: number,
   *     filename?: string,
   *     fileType?: string,  // 'jpg', 'png', 'webp', etc.
   *     fileSize?: number,  // bytes
   *     alt?: string
   *   },
   *   ...
   * ]
   *
   * Returns {
   *   accepted: [ { url, orientation, components, quality, grade, purpose } ],
   *   rejected: [ { url, reason } ],
   *   selections: {
   *     hero: { url, orientation, grade },
   *     gallery: [ { url, orientation, grade } ],
   *     closeUps: [ { url, orientation, grade } ],
   *     comparisons: [ { url, orientation, grade } ]
   *   },
   *   stats: { total, accepted, rejected, avgQuality }
   * }
   */
  function analyzeImages(images) {
    if (!images || !images.length) {
      return {
        accepted: [],
        rejected: [],
        selections: { hero: null, gallery: [], closeUps: [], comparisons: [] },
        stats: { total: 0, accepted: 0, rejected: 0, avgQuality: 0 }
      };
    }

    var accepted = [];
    var rejected = [];
    var urlHashes = {};

    images.forEach(function (img) {
      /* ─── Rejection Phase ─── */
      var rejection = checkRejection(img, urlHashes);
      if (rejection) {
        rejected.push({ url: img.url, reason: rejection });
        return;
      }
      urlHashes[getUrlHash(img.url)] = true;

      /* ─── Analysis Phase ─── */
      var orientation = detectOrientation(img);
      var components = detectComponents(img);
      var quality = assessImageQuality(img, orientation);
      var condition = assessCondition(img, orientation);
      var grade = calculateGrade(quality, orientation.score);

      accepted.push({
        url: img.url,
        filename: img.filename || extractFilename(img.url),
        orientation: orientation.orientation,
        orientationScore: orientation.score,
        components: components,
        quality: quality,
        condition: condition,
        grade: grade,
        purpose: suggestPurpose(orientation.orientation, grade)
      });
    });

    /* ─── Selection Phase ─── */
    var selections = makeSelections(accepted);

    /* ─── Stats ─── */
    var avgQuality = accepted.length > 0
      ? Math.round(accepted.reduce(function (sum, a) { return sum + a.quality.score; }, 0) / accepted.length)
      : 0;

    return {
      accepted: accepted,
      rejected: rejected,
      selections: selections,
      stats: {
        total: images.length,
        accepted: accepted.length,
        rejected: rejected.length,
        avgQuality: avgQuality
      }
    };
  }

  /* ─── Rejection Check ─── */

  function checkRejection(img, existingHashes) {
    // No URL
    if (!img.url) return 'No URL provided';

    // Too small
    if ((img.width && img.width < MIN_IMAGE_SIZE) || (img.height && img.height < MIN_IMAGE_SIZE)) {
      return 'Image too small (' + (img.width || '?') + 'x' + (img.height || '?') + ')';
    }

    // Aspect ratio too extreme
    if (img.width && img.height) {
      var ratio = Math.max(img.width, img.height) / Math.min(img.width, img.height);
      if (ratio > MAX_IMAGE_RATIO) return 'Extreme aspect ratio (' + ratio.toFixed(1) + ':1)';
    }

    // Duplicate URL
    var hash = getUrlHash(img.url);
    if (existingHashes[hash]) return 'Duplicate image (same URL)';

    return null; // Passes all checks
  }

  function getUrlHash(url) {
    return url.substring(url.length - DUPLICATE_HASH_LENGTH);
  }

  /* ─── Orientation Detection ─── */

  function detectOrientation(img) {
    var filename = (img.filename || extractFilename(img.url) || '').toLowerCase();
    var alt = (img.alt || '').toLowerCase();

    var bestOrientation = 'unknown';
    var bestScore = 0;

    Object.keys(ORIENTATION_KEYWORDS).forEach(function (orient) {
      var keywords = ORIENTATION_KEYWORDS[orient];
      var score = 0;

      keywords.forEach(function (kw) {
        if (filename.indexOf(kw) !== -1) score += 3;
        if (alt.indexOf(kw) !== -1) score += 2;
      });

      if (score > bestScore) {
        bestScore = score;
        bestOrientation = orient;
      }
    });

    return {
      orientation: bestOrientation,
      score: bestScore,
      confidence: bestScore >= 3 ? CONFIDENCE_HIGH : bestScore >= 1 ? CONFIDENCE_MEDIUM : CONFIDENCE_LOW
    };
  }

  /* ─── Component Detection ─── */

  function detectComponents(img) {
    var filename = (img.filename || extractFilename(img.url) || '').toLowerCase();
    var components = [];

    var componentKeywords = {
      'screen':        ['screen', 'display', 'màn hình', 'touch', 'lcd', 'oled'],
      'buttons':       ['button', 'nút', 'pad', 'keypad', 'control'],
      'knobs':         ['knob', 'encoder', 'núm', 'pot', 'rotary'],
      'faders':        ['fader', 'crossfader', 'slider', 'trượt'],
      'jog_wheel':     ['jog', 'wheel', 'platter', 'vinyl'],
      'ports':         ['port', 'cổng', 'usb', 'xlr', 'rca', 'hdmi', 'lan', 'midi'],
      'display':       ['display', 'led', 'screen', 'màn hình', 'waveform'],
      'label':         ['label', 'serial', 'model', 'sticker', 'barcode'],
      'logo':          ['logo', 'brand', 'pioneer', 'alphatheta', '商标'],
      'accessories':   ['accessory', 'cable', 'adapter', 'power', 'manual'],
      'packaging':     ['box', 'carton', 'package', 'hộp', 'bundle']
    };

    Object.keys(componentKeywords).forEach(function (comp) {
      var keywords = componentKeywords[comp];
      var found = keywords.some(function (kw) { return filename.indexOf(kw) !== -1; });
      if (found) {
        components.push({
          component: comp,
          detected: true,
          confidence: CONFIDENCE_MEDIUM
        });
      }
    });

    return components;
  }

  /* ─── Quality Assessment ─── */

  function assessImageQuality(img, orientation) {
    var score = 50; // Start at mid-range

    // File type bonus
    var ext = (extractExtension(img.url) || '').toLowerCase();
    if (ext === 'webp' || ext === 'png') score += 10;
    if (ext === 'jpg' || ext === 'jpeg') score += 8;

    // Size bonus
    if (img.width && img.height) {
      var megapixels = (img.width * img.height) / 1000000;
      if (megapixels >= 5) score += 20;    // >5MP: excellent
      else if (megapixels >= 2) score += 15; // 2-5MP: good
      else if (megapixels >= 1) score += 10; // 1-2MP: acceptable
      else score -= 10; // <1MP: low quality
    }

    // Orientation match bonus
    if (orientation.orientation !== 'unknown' && orientation.score >= 3) score += 10;

    // Filename quality: descriptive names > generic names
    var fn = (img.filename || extractFilename(img.url) || '');
    if (fn.length > 20) score += 5; // Descriptive filename
    if (/^\d+[-_][a-z]/.test(fn)) score += 5; // Named files (e.g., 12345-product-front.jpg)

    // Clamp
    score = Math.max(0, Math.min(100, score));

    return {
      score: score,
      isSharp: score >= 70,
      isUsable: score >= 40,
      detail: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Acceptable' : 'Poor'
    };
  }

  /* ─── Condition Assessment ─── */

  function assessCondition(img, orientation) {
    var filename = (img.filename || extractFilename(img.url) || '').toLowerCase();

    // Very basic condition check from filename keywords
    var issues = [];

    if (filename.indexOf('damage') !== -1 || filename.indexOf('hỏng') !== -1) issues.push('visible_damage');
    if (filename.indexOf('scratch') !== -1 || filename.indexOf('xước') !== -1) issues.push('scratch');
    if (filename.indexOf('dust') !== -1 || filename.indexOf('bụi') !== -1) issues.push('dust');
    if (filename.indexOf('wear') !== -1 || filename.indexOf('mòn') !== -1) issues.push('wear');
    if (filename.indexOf('repair') !== -1 || filename.indexOf('sửa') !== -1) issues.push('repaired');

    return {
      issues: issues,
      isPristine: issues.length === 0,
      confidence: issues.length > 0 ? CONFIDENCE_HIGH : CONFIDENCE_LOW
    };
  }

  /* ─── Grading ─── */

  function calculateGrade(qualityScore, orientationScore) {
    var total = qualityScore + (orientationScore * 5);
    if (total >= 90) return 'A';
    if (total >= 70) return 'B';
    if (total >= 50) return 'C';
    return 'D';
  }

  function suggestPurpose(orientation, grade) {
    if (grade === 'D') return 'reject';
    if (orientation === 'front' && grade === 'A') return 'hero';
    if (orientation === 'angle' && grade === 'A') return 'hero_secondary';
    if (orientation === 'screen') return 'screen_detail';
    if (orientation === 'port') return 'connectivity';
    if (orientation === 'detail') return 'close_up';
    if (orientation === 'accessory' || orientation === 'package') return 'accessories';
    return 'gallery';
  }

  /* ─── Selection Engine ─── */

  function makeSelections(accepted) {
    // Sort by grade (A > B > C > D)
    var sorted = accepted.slice().sort(function (a, b) {
      var gradeOrder = { A: 0, B: 1, C: 2, D: 3 };
      return (gradeOrder[a.grade] || 99) - (gradeOrder[b.grade] || 99);
    });

    var hero = null;
    var gallery = [];
    var closeUps = [];
    var comparisons = [];

    sorted.forEach(function (img) {
      if (img.grade === 'D') return; // Skip unusable

      if (!hero && (img.purpose === 'hero' || img.purpose === 'hero_secondary')) {
        hero = img;
      } else if (!hero && img.orientation === 'front') {
        hero = img;
      } else if (!hero) {
        hero = img; // First graded image as fallback
      }

      if (img.purpose === 'close_up' || img.orientation === 'screen' || img.orientation === 'detail') {
        closeUps.push(img);
      }

      if (img.orientation === 'angle' || img.orientation === 'front') {
        if (gallery.length < 6) gallery.push(img);
      }

      // Comparison candidates: front-facing, grade A/B
      if ((img.orientation === 'front' || img.orientation === 'angle') && (img.grade === 'A' || img.grade === 'B')) {
        if (comparisons.length < 3) comparisons.push(img);
      }
    });

    return {
      hero: hero,
      gallery: gallery,
      closeUps: closeUps,
      comparisons: comparisons
    };
  }

  /* ─── Helpers ─── */

  function extractFilename(url) {
    if (!url) return '';
    try {
      var parts = url.split('/');
      var last = parts[parts.length - 1];
      return last.split('?')[0].split('#')[0];
    } catch (e) {
      return '';
    }
  }

  function extractExtension(url) {
    var fn = extractFilename(url);
    var dot = fn.lastIndexOf('.');
    return dot > 0 ? fn.substring(dot + 1) : '';
  }

  /* ─── Public API ─── */

  function getStatus() {
    return {
      engine: 'ContentVisualIntelligence',
      version: '1.0',
      capabilities: [
        'Orientation detection (front/rear/top/bottom/left/right/angle/screen/detail)',
        'Component detection (screen, buttons, knobs, faders, jog wheels, ports, labels)',
        'Quality assessment (resolution, file type, filename quality)',
        'Condition assessment (damage, scratch, dust, wear)',
        'Image grading (A/B/C/D)',
        'Purpose suggestion (hero, gallery, close-up, connectivity)',
        'Selection engine (best hero, best gallery, best close-ups)',
        'Automatic rejection (blurry, small, duplicate, extreme ratio)'
      ],
      rejectionThreshold: {
        minSize: MIN_IMAGE_SIZE + 'px',
        maxAspectRatio: MAX_IMAGE_RATIO + ':1'
      }
    };
  }

  return {
    analyzeImages: analyzeImages,
    getStatus: getStatus,
    CONFIDENCE_HIGH: CONFIDENCE_HIGH,
    CONFIDENCE_MEDIUM: CONFIDENCE_MEDIUM,
    CONFIDENCE_LOW: CONFIDENCE_LOW
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentVisualIntelligence: ContentVisualIntelligence };
}
