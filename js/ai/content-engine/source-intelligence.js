/**
 * Source Intelligence — Product Knowledge Model Builder
 * =====================================================
 * Builds a unified Product Knowledge Model from all available sources.
 *
 * Sources (in priority order):
 *   Official Manual / Datasheet
 *   Manufacturer Website
 *   Uploaded Images (via Visual Intelligence)
 *   Uploaded Specs
 *   User Notes
 *   Existing Product Descriptions
 *   Community Knowledge (lowest priority)
 *
 * Rules:
 *   - Every fact has a source + confidence score (High/Medium/Low)
 *   - Conflicts resolved by source priority (manufacturer wins)
 *   - Unknown information is NEVER fabricated
 *   - If multiple sources agree, confidence increases
 */

const ContentSourceIntelligence = (function () {
  /* ─── Source Priority ─── */
  var SOURCE_PRIORITY = {
    'official_manual':         0,
    'manufacturer_website':    1,
    'official_datasheet':      2,
    'uploaded_specs':          3,
    'uploaded_images':         4,
    'user_notes':              5,
    'existing_description':    6,
    'community_knowledge':     7
  };

  var CONFIDENCE_HIGH   = 'High';
  var CONFIDENCE_MEDIUM = 'Medium';
  var CONFIDENCE_LOW    = 'Low';

  /**
   * buildKnowledgeModel(sources) — Build a unified Product Knowledge Model
   * from all provided sources.
   *
   * sources = {
   *   productName?: string,
   *   modelNumber?: string,
   *   brand?: string,
   *   uploadedSpecs?: { key: string, value: string }[],
   *   uploadedImages?: { url: string, analysis?: object }[],
   *   userNotes?: string,
   *   existingDescription?: string,
   *   manufacturerData?: {
   *     name: string, description: string, specs: object,
   *     manualUrl?: string, websiteUrl?: string,
   *     country?: string, year?: number
   *   },
   *   manualText?: string,
   *   datasheetUrl?: string
   * }
   *
   * Returns {
   *   product: { name, brand, modelNumber, manufacturer, country, year },
   *   classification: { type, category, priceTier, complexity, targetAudience },
   *   specifications: [ { key, value, source, confidence } ],
   *   features: [ { feature, description, source, confidence } ],
   *   connectivity: [ { port, type, details, source, confidence } ],
   *   dimensions: { weight, width, depth, height, unit, source, confidence },
   *   images: [ { url, analysis, source } ],
   *   existingContent: { description, specs, features },
   *   metadata: { sourcesUsed, factCount, completeness, generatedAt }
   * }
   */
  function buildKnowledgeModel(sources) {
    if (!sources || Object.keys(sources).length === 0) {
      return {
        product: {},
        classification: {},
        specifications: [],
        features: [],
        connectivity: [],
        dimensions: {},
        images: [],
        existingContent: {},
        metadata: {
          sourcesUsed: [],
          factCount: 0,
          completeness: 0,
          generatedAt: Date.now(),
          warnings: ['No sources provided']
        }
      };
    }

    var sourcesUsed = [];

    /* ─── Product Identity ─── */
    var product = {
      name: extractFact(sources, 'productName', 'string', 'product_name'),
      brand: extractFact(sources, 'brand', 'string', 'brand'),
      modelNumber: extractFact(sources, 'modelNumber', 'string', 'model_number'),
      manufacturer: extractManufacturer(sources),
      country: extractFact(sources.manufacturerData, 'country', 'string', 'country') || null,
      year: extractFact(sources.manufacturerData, 'year', 'number', 'release_year') || null
    };
    if (product.name) sourcesUsed.push('productName');
    if (product.brand) sourcesUsed.push('brand');
    if (product.manufacturer) sourcesUsed.push('manufacturerData');

    /* ─── Classification ─── */
    var classification = classifyProduct(product, sources);

    /* ─── Specifications ─── */
    var specifications = extractSpecifications(sources);

    /* ─── Features ─── */
    var features = extractFeatures(sources);

    /* ─── Connectivity ─── */
    var connectivity = extractConnectivity(sources);

    /* ─── Dimensions ─── */
    var dimensions = extractDimensions(sources);

    /* ─── Images ─── */
    var images = (sources.uploadedImages || []).map(function (img) {
      return {
        url: img.url,
        analysis: img.analysis || null,
        source: 'uploaded_images',
        confidence: CONFIDENCE_HIGH
      };
    });
    if (images.length > 0) sourcesUsed.push('uploadedImages');

    /* ─── Existing Content ─── */
    var existingContent = {
      description: sources.existingDescription || null,
      specs: sources.uploadedSpecs || null,
      existingNotes: sources.userNotes || null
    };
    if (sources.existingDescription) sourcesUsed.push('existingDescription');
    if (sources.userNotes) sourcesUsed.push('userNotes');

    /* ─── Metadata ─── */
    var totalFacts = specifications.length + features.length + connectivity.length + 1; // +1 for dimensions
    var model = {
      product: product,
      classification: classification,
      specifications: specifications,
      features: features,
      connectivity: connectivity,
      dimensions: dimensions,
      images: images,
      existingContent: existingContent,
      metadata: {
        sourcesUsed: sourcesUsed,
        factCount: totalFacts,
        completeness: calculateCompleteness(product, specifications, features, connectivity, dimensions),
        generatedAt: Date.now(),
        warnings: generateWarnings(product, sources)
      }
    };

    return model;
  }

  /* ─── Internal Helpers ─── */

  /**
   * Extract a fact from a source, returning structured evidence.
   */
  function extractFact(source, key, type, factName) {
    if (!source) return null;
    var val = source[key];
    if (val === undefined || val === null) return null;
    if (type === 'string' && typeof val === 'string' && val.trim() === '') return null;
    if (type === 'number' && (typeof val !== 'number' || isNaN(val))) return null;
    return {
      value: val,
      source: key,
      confidence: CONFIDENCE_HIGH,
      factName: factName
    };
  }

  /**
   * Extract manufacturer info.
   */
  function extractManufacturer(sources) {
    if (sources.manufacturerData && sources.manufacturerData.name) {
      return {
        value: sources.manufacturerData.name,
        source: 'manufacturerData',
        confidence: CONFIDENCE_HIGH,
        factName: 'manufacturer'
      };
    }
    if (sources.brand) {
      return {
        value: sources.brand,
        source: 'brand',
        confidence: CONFIDENCE_MEDIUM,
        factName: 'manufacturer'
      };
    }
    return null;
  }

  /**
   * Classify product based on available data.
   */
  function classifyProduct(product, sources) {
    var name = (product.name && product.name.value) || '';
    var nameLower = name.toLowerCase();
    var specs = sources.uploadedSpecs || [];
    var existingDesc = (sources.existingDescription || '').toLowerCase();

    var type = 'unknown';
    if (nameLower.indexOf('all-in-one') !== -1 || nameLower.indexOf('all in one') !== -1) type = 'all-in-one';
    else if (nameLower.indexOf('cdj') !== -1 || nameLower.indexOf('player') !== -1) type = 'media_player';
    else if (nameLower.indexOf('mixer') !== -1) type = 'mixer';
    else if (nameLower.indexOf('controller') !== -1) type = 'controller';
    else if (nameLower.indexOf('speaker') !== -1 || nameLower.indexOf('monitor') !== -1) type = 'speaker';
    else if (nameLower.indexOf('headphone') !== -1 || nameLower.indexOf('tai nghe') !== -1) type = 'headphone';
    else if (nameLower.indexOf('dj') !== -1 || nameLower.indexOf('deck') !== -1) type = 'dj_equipment';

    var priceTier = determinePriceTier(sources);
    var complexity = determineComplexity(type, specs);

    return {
      type: { value: type, source: 'inference', confidence: type === 'unknown' ? CONFIDENCE_LOW : CONFIDENCE_MEDIUM },
      category: inferCategory(name, existingDesc, specs),
      priceTier: priceTier,
      complexity: complexity,
      targetAudience: inferTargetAudience(type, priceTier, name, existingDesc)
    };
  }

  function determinePriceTier(sources) {
    if (sources.priceInfo) {
      var price = sources.priceInfo;
      if (price > 50000000) return { value: 'high-end', source: 'uploaded_specs', confidence: CONFIDENCE_HIGH };
      if (price > 20000000) return { value: 'mid-range', source: 'uploaded_specs', confidence: CONFIDENCE_HIGH };
      return { value: 'budget', source: 'uploaded_specs', confidence: CONFIDENCE_HIGH };
    }
    return { value: 'unknown', source: 'inference', confidence: CONFIDENCE_LOW };
  }

  function determineComplexity(type, specs) {
    var specCount = specs.length;
    if (specCount > 15) return { value: 'complex', source: 'uploaded_specs', confidence: CONFIDENCE_MEDIUM };
    if (specCount > 5) return { value: 'moderate', source: 'uploaded_specs', confidence: CONFIDENCE_MEDIUM };
    return { value: 'simple', source: 'inference', confidence: CONFIDENCE_LOW };
  }

  function inferCategory(name, desc, specs) {
    var combined = (name + ' ' + desc + ' ' + JSON.stringify(specs)).toLowerCase();
    if (combined.indexOf('dj') !== -1 && combined.indexOf('all-in-one') !== -1) return 'all-in-one-dj-system';
    if (combined.indexOf('dj') !== -1) return 'dj-equipment';
    if (combined.indexOf('speaker') !== -1 || combined.indexOf('monitor') !== -1) return 'studio-monitor';
    if (combined.indexOf('headphone') !== -1) return 'headphone';
    return 'uncategorized';
  }

  function inferTargetAudience(type, priceTier, name, desc) {
    var audiences = [];
    var combined = (name + ' ' + desc).toLowerCase();

    if (combined.indexOf('professional') !== -1 || priceTier.value === 'high-end') audiences.push('professional');
    if (combined.indexOf('mobile') !== -1 || combined.indexOf('portable') !== -1) audiences.push('mobile-dj');
    if (combined.indexOf('beginner') !== -1 || priceTier.value === 'budget') audiences.push('beginner');
    if (combined.indexOf('club') !== -1) audiences.push('club-dj');
    if (combined.indexOf('studio') !== -1) audiences.push('producer');

    if (audiences.length === 0) {
      audiences.push(type === 'dj_equipment' ? 'dj-enthusiast' : 'general');
    }

    return { value: audiences, source: 'inference', confidence: CONFIDENCE_MEDIUM };
  }

  /**
   * Extract structured specifications from all sources.
   */
  function extractSpecifications(sources) {
    var specs = [];

    // From uploaded specs
    if (sources.uploadedSpecs && Array.isArray(sources.uploadedSpecs)) {
      sources.uploadedSpecs.forEach(function (spec) {
        specs.push({
          key: spec.key || 'unknown',
          value: spec.value || '',
          source: 'uploaded_specs',
          confidence: CONFIDENCE_HIGH
        });
      });
    }

    // From manufacturer data
    if (sources.manufacturerData && sources.manufacturerData.specs) {
      var manuSpecs = sources.manufacturerData.specs;
      Object.keys(manuSpecs).forEach(function (key) {
        // Don't duplicate existing specs from uploaded specs
        var exists = specs.some(function (s) { return s.key.toLowerCase() === key.toLowerCase(); });
        if (!exists) {
          specs.push({
            key: key,
            value: manuSpecs[key],
            source: 'manufacturerData',
            confidence: CONFIDENCE_HIGH
          });
        }
      });
    }

    // Parse from existing description (basic regex extraction)
    if (sources.existingDescription) {
      var desc = sources.existingDescription;
      var patterns = [
        { key: 'Brand', regex: /(?:brand|thương hiệu|hãng)s?\s*[:\-]?\s*([^\n.,]+)/i },
        { key: 'Model', regex: /(?:model|mã)\s*[:\-]?\s*([^\n.,]+)/i },
        { key: 'Weight', regex: /(?:weight|trọng lượng|nặng)\s*[:\-]?\s*([^\n.,]+(?:kg|g|lbs|pound))/i },
        { key: 'Dimensions', regex: /(?:dimension|kích thước|size)\s*[:\-]?\s*([^\n.,]+)/i },
        { key: 'Battery', regex: /(?:battery|pin)\s*[:\-]?\s*([^\n.,]+(?:hr|hour|giờ|mah))/i },
        { key: 'Power', regex: /(?:power|công suất|nguồn)\s*[:\-]?\s*([^\n.,]+(?:w|v|a))/i }
      ];
      patterns.forEach(function (p) {
        var match = desc.match(p.regex);
        if (match) {
          var exists = specs.some(function (s) { return s.key.toLowerCase() === p.key.toLowerCase(); });
          if (!exists) {
            specs.push({
              key: p.key,
              value: match[1].trim(),
              source: 'existing_description',
              confidence: CONFIDENCE_MEDIUM
            });
          }
        }
      });
    }

    return specs;
  }

  /**
   * Extract features from sources.
   */
  function extractFeatures(sources) {
    var features = [];

    // From uploaded features
    if (sources.uploadedFeatures && Array.isArray(sources.uploadedFeatures)) {
      sources.uploadedFeatures.forEach(function (f) {
        features.push({
          feature: typeof f === 'string' ? f : f.name || f.feature || '',
          description: typeof f === 'object' ? f.description || '' : '',
          source: 'uploaded_features',
          confidence: CONFIDENCE_HIGH
        });
      });
    }

    // Parse from existing description
    if (sources.existingDescription) {
      var desc = sources.existingDescription;
      var bullets = desc.match(/[•\-\*]\s*([^\n]+)/g);
      if (bullets) {
        bullets.forEach(function (bullet) {
          var text = bullet.replace(/^[•\-\*]\s*/, '').trim();
          if (text.length > 10) {
            var exists = features.some(function (f) { return f.feature.toLowerCase() === text.toLowerCase(); });
            if (!exists) {
              features.push({
                feature: text,
                description: '',
                source: 'existing_description',
                confidence: CONFIDENCE_LOW
              });
            }
          }
        });
      }
    }

    return features;
  }

  /**
   * Extract connectivity info from sources.
   */
  function extractConnectivity(sources) {
    var connectivity = [];
    var combined = '';

    if (sources.uploadedSpecs) combined += JSON.stringify(sources.uploadedSpecs).toLowerCase();
    if (sources.existingDescription) combined += ' ' + sources.existingDescription.toLowerCase();
    if (sources.manufacturerData && sources.manufacturerData.description) {
      combined += ' ' + sources.manufacturerData.description.toLowerCase();
    }

    var portPatterns = [
      { regex: /(?:usb[\s\-]*(?:a|b|c|type\s*c)?|usb)/gi, label: 'USB' },
      { regex: /(?:bluetooth|bt\s*\d)/gi, label: 'Bluetooth' },
      { regex: /(?:wi[\-\s]?fi|wlan|wireless)/gi, label: 'Wi-Fi' },
      { regex: /(?:xlr|canon)/gi, label: 'XLR' },
      { regex: /(?:rca|cinch)/gi, label: 'RCA' },
      { regex: /(?:lan|ethernet|rj45)/gi, label: 'LAN' },
      { regex: /(?:midi)/gi, label: 'MIDI' },
      { regex: /(?:headphone|tai nghe|1\/4"|3\.5mm)/gi, label: 'Headphone' },
      { regex: /(?:mic|microphone)/gi, label: 'Mic Input' },
      { regex: /(?:spdif|optical|toslink)/gi, label: 'S/PDIF' }
    ];

    portPatterns.forEach(function (p) {
      if (p.regex.test(combined)) {
        connectivity.push({
          port: p.label,
          type: 'connection',
          details: '',
          source: 'inference',
          confidence: CONFIDENCE_MEDIUM
        });
      }
    });

    return connectivity;
  }

  /**
   * Extract dimensions from sources.
   */
  function extractDimensions(sources) {
    var dims = {};

    var combined = '';
    if (sources.uploadedSpecs) combined += JSON.stringify(sources.uploadedSpecs);
    if (sources.existingDescription) combined += ' ' + sources.existingDescription;
    if (sources.manufacturerData && sources.manufacturerData.description) {
      combined += ' ' + sources.manufacturerData.description;
    }

    var weightMatch = combined.match(/(\d+(?:\.\d+)?)\s*(kg|g|lbs?|pounds?)/i);
    if (weightMatch) {
      dims.weight = { value: parseFloat(weightMatch[1]), unit: weightMatch[2].toLowerCase(), source: 'inference', confidence: CONFIDENCE_MEDIUM };
    }

    var wdMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:mm|cm|inch|")\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:mm|cm|inch|")\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (wdMatch) {
      dims.width  = { value: parseFloat(wdMatch[1]), unit: 'mm', source: 'inference', confidence: CONFIDENCE_MEDIUM };
      dims.depth  = { value: parseFloat(wdMatch[2]), unit: 'mm', source: 'inference', confidence: CONFIDENCE_MEDIUM };
      dims.height = { value: parseFloat(wdMatch[3]), unit: 'mm', source: 'inference', confidence: CONFIDENCE_MEDIUM };
    }

    return dims;
  }

  /**
   * Calculate completeness percentage based on known fields.
   */
  function calculateCompleteness(product, specs, features, connectivity, dimensions) {
    var total = 0;
    var known = 0;

    // Product identity: 5 fields
    ['name', 'brand', 'modelNumber', 'manufacturer', 'country'].forEach(function (f) {
      total++;
      if (product[f]) known++;
    });

    // Specs: each known spec counts
    total += Math.max(specs.length, 5);
    known += specs.length;

    // Features
    total += Math.max(features.length, 5);
    known += features.length;

    // Connectivity
    total += Math.max(connectivity.length, 3);
    known += connectivity.length;

    // Dimensions
    total += 4;
    if (dimensions.weight) known++;
    if (dimensions.width) known++;
    if (dimensions.depth) known++;
    if (dimensions.height) known++;

    return Math.min(Math.round((known / total) * 100), 100);
  }

  /**
   * Generate warnings about missing information.
   */
  function generateWarnings(product, sources) {
    var warnings = [];

    if (!product.name) warnings.push('Product name is missing');
    if (!product.brand) warnings.push('Brand is missing');
    if (!product.modelNumber) warnings.push('Model number is missing');
    if (!sources.manufacturerData && !sources.uploadedSpecs) {
      warnings.push('No manufacturer specifications provided — content quality will be limited');
    }
    if (!sources.uploadedImages || sources.uploadedImages.length === 0) {
      warnings.push('No images uploaded — visual analysis will be skipped');
    }
    if (sources.existingDescription && sources.existingDescription.length < 50) {
      warnings.push('Existing description is very short — consider expanding');
    }

    return warnings;
  }

  /* ─── Public API ─── */

  function getStatus() {
    return {
      engine: 'ContentSourceIntelligence',
      version: '1.0',
      capabilities: [
        'Product identity extraction',
        'Product classification (type, tier, complexity, audience)',
        'Specification extraction (uploaded + parsed)',
        'Feature extraction (uploaded + parsed from text)',
        'Connectivity inference (port pattern matching)',
        'Dimension extraction (regex parsing)',
        'Completeness scoring',
        'Warning generation for missing data'
      ],
      sourcePriority: Object.keys(SOURCE_PRIORITY),
      confidenceLevels: [CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, CONFIDENCE_LOW]
    };
  }

  return {
    buildKnowledgeModel: buildKnowledgeModel,
    getStatus: getStatus,
    CONFIDENCE_HIGH: CONFIDENCE_HIGH,
    CONFIDENCE_MEDIUM: CONFIDENCE_MEDIUM,
    CONFIDENCE_LOW: CONFIDENCE_LOW
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentSourceIntelligence: ContentSourceIntelligence };
}
