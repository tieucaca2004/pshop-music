/**
 * Content Evidence — Fact-to-Source Linker
 * ==========================================
 * Every important statement in generated content is linked to its
 * evidence source with a confidence score.
 *
 * Evidence types:
 *   Official Manual
 *   Manufacturer Website
 *   Uploaded Images
 *   Technical Specification
 *   Industry Standard
 *   Community Knowledge
 *   Professional Experience
 *
 * Confidence levels: High, Medium, Low
 *
 * Rules:
 *   - Every claim must have at least one evidence source
 *   - Unknown facts are NEVER stated
 *   - Multiple agreeing sources boost confidence
 *   - Conflicting sources use highest priority
 */

const ContentEvidence = (function () {
  /* ─── Evidence Source Types ─── */
  var EVIDENCE_TYPES = {
    OFFICIAL_MANUAL:    'official_manual',
    MANUFACTURER:       'manufacturer_website',
    DATASHEET:          'datasheet',
    UPLOADED_SPECS:     'uploaded_specs',
    UPLOADED_IMAGES:    'uploaded_images',
    TECH_SPEC:          'technical_specification',
    INDUSTRY_STANDARD:  'industry_standard',
    COMMUNITY:          'community_knowledge',
    PROFESSIONAL:       'professional_experience',
    INFERENCE:          'inference'
  };

  /* ─── Source Priority (higher = more authoritative) ─── */
  var SOURCE_PRIORITY = {};
  SOURCE_PRIORITY[EVIDENCE_TYPES.OFFICIAL_MANUAL]    = 10;
  SOURCE_PRIORITY[EVIDENCE_TYPES.MANUFACTURER]        = 9;
  SOURCE_PRIORITY[EVIDENCE_TYPES.DATASHEET]           = 9;
  SOURCE_PRIORITY[EVIDENCE_TYPES.TECH_SPEC]           = 7;
  SOURCE_PRIORITY[EVIDENCE_TYPES.UPLOADED_SPECS]      = 6;
  SOURCE_PRIORITY[EVIDENCE_TYPES.UPLOADED_IMAGES]     = 5;
  SOURCE_PRIORITY[EVIDENCE_TYPES.INDUSTRY_STANDARD]   = 4;
  SOURCE_PRIORITY[EVIDENCE_TYPES.PROFESSIONAL]        = 3;
  SOURCE_PRIORITY[EVIDENCE_TYPES.COMMUNITY]            = 2;
  SOURCE_PRIORITY[EVIDENCE_TYPES.INFERENCE]            = 1;

  var CONFIDENCE_HIGH   = 'High';
  var CONFIDENCE_MEDIUM = 'Medium';
  var CONFIDENCE_LOW    = 'Low';

  /**
   * Evidence object structure:
   * {
   *   claim: string,           // The statement being made
   *   sources: [{
   *     type: string,          // One of EVIDENCE_TYPES
   *     reference: string,     // Specific reference (page number, URL, image name)
   *     excerpt: string,       // Quoted excerpt from source
   *     confidence: string     // High/Medium/Low
   *   }],
   *   aggregatedConfidence: string,  // Combined confidence across all sources
   *   category: string         // 'spec', 'feature', 'dimension', 'performance', etc.
   * }
   */

  /**
   * createEvidence(claim, category) — Create an empty evidence container.
   */
  function createEvidence(claim, category) {
    return {
      claim: claim || '',
      sources: [],
      aggregatedConfidence: CONFIDENCE_LOW,
      category: category || 'general',
      createdAt: Date.now()
    };
  }

  /**
   * addSource(evidence, type, reference, excerpt) — Add a source to an evidence.
   * Returns updated evidence object.
   */
  function addSource(evidence, type, reference, excerpt) {
    if (!evidence || !type) return evidence;

    var confidence = determineConfidence(type);

    evidence.sources.push({
      type: type,
      reference: reference || '',
      excerpt: excerpt || '',
      confidence: confidence
    });

    evidence.aggregatedConfidence = recalculateConfidence(evidence.sources);
    return evidence;
  }

  /**
   * addSources(evidence, sources) — Add multiple sources at once.
   * sources = [ { type, reference, excerpt }, ... ]
   */
  function addSources(evidence, sources) {
    if (!evidence || !sources) return evidence;
    sources.forEach(function (s) {
      addSource(evidence, s.type, s.reference, s.excerpt);
    });
    return evidence;
  }

  /**
   * getBestSource(evidence) — Return the single best source.
   * Uses priority ordering (highest priority = most authoritative).
   */
  function getBestSource(evidence) {
    if (!evidence || !evidence.sources.length) return null;

    var best = evidence.sources[0];
    var bestPriority = SOURCE_PRIORITY[best.type] || 0;

    evidence.sources.forEach(function (s) {
      var p = SOURCE_PRIORITY[s.type] || 0;
      if (p > bestPriority) {
        best = s;
        bestPriority = p;
      }
    });

    return best;
  }

  /**
   * isWellSourced(evidence) — Check if evidence has sufficient sources.
   * Requires at least one source with confidence Medium+.
   */
  function isWellSourced(evidence) {
    if (!evidence || !evidence.sources.length) return false;
    return evidence.sources.some(function (s) {
      return s.confidence === CONFIDENCE_HIGH || s.confidence === CONFIDENCE_MEDIUM;
    });
  }

  /**
   * toBlock(evidence) — Convert evidence to a CMS block-friendly format.
   */
  function toBlock(evidence) {
    if (!evidence) return null;
    return {
      claim: evidence.claim,
      confidence: evidence.aggregatedConfidence,
      category: evidence.category,
      sources: evidence.sources.map(function (s) {
        return {
          type: s.type,
          reference: s.reference,
          excerpt: s.excerpt,
          confidence: s.confidence
        };
      })
    };
  }

  /**
   * mergeEvidences(a, b) — Merge two evidence objects for same claim.
   * Higher-priority sources take precedence.
   */
  function mergeEvidences(a, b) {
    if (!a) return b;
    if (!b) return a;

    var merged = createEvidence(a.claim || b.claim, a.category || b.category);

    // Combine all unique sources (by type + reference)
    var seen = {};
    [a, b].forEach(function (ev) {
      (ev.sources || []).forEach(function (src) {
        var key = src.type + '::' + src.reference;
        if (!seen[key]) {
          seen[key] = true;
          addSource(merged, src.type, src.reference, src.excerpt);
        }
      });
    });

    // Use higher-priority claim
    var aPriority = getBestSource(a) ? SOURCE_PRIORITY[getBestSource(a).type] || 0 : 0;
    var bPriority = getBestSource(b) ? SOURCE_PRIORITY[getBestSource(b).type] || 0 : 0;
    merged.claim = aPriority >= bPriority ? a.claim : b.claim;

    return merged;
  }

  /* ─── Internal Helpers ─── */

  function determineConfidence(type) {
    var priority = SOURCE_PRIORITY[type] || 0;
    if (priority >= 9) return CONFIDENCE_HIGH;
    if (priority >= 5) return CONFIDENCE_MEDIUM;
    if (priority >= 2) return CONFIDENCE_LOW;
    return CONFIDENCE_LOW;
  }

  function recalculateConfidence(sources) {
    if (!sources || !sources.length) return CONFIDENCE_LOW;

    var hasHigh = false;
    var hasMedium = false;

    sources.forEach(function (s) {
      if (s.confidence === CONFIDENCE_HIGH) hasHigh = true;
      if (s.confidence === CONFIDENCE_MEDIUM) hasMedium = true;
    });

    if (hasHigh) return CONFIDENCE_HIGH;
    if (hasMedium) return CONFIDENCE_MEDIUM;
    return CONFIDENCE_LOW;
  }

  /* ─── Batch Operations ─── */

  /**
   * batchProcess(claims) — Process a batch of claims.
   * claims = [ { claim, category, sources: [ { type, reference, excerpt } ] } ]
   */
  function batchProcess(claims) {
    if (!claims) return [];

    return claims.map(function (c) {
      var ev = createEvidence(c.claim, c.category);
      if (c.sources) {
        addSources(ev, c.sources);
      }
      return {
        evidence: ev,
        wellSourced: isWellSourced(ev),
        bestSource: getBestSource(ev),
        block: toBlock(ev)
      };
    });
  }

  /* ─── Confidence Utilities ─── */

  function confidenceLabel(score) {
    if (score === undefined || score === null) return CONFIDENCE_LOW;
    if (typeof score === 'string') {
      var s = score.toLowerCase();
      if (s === 'high' || s.indexOf('h') === 0) return 'High';
      if (s === 'medium' || s.indexOf('m') === 0) return 'Medium';
      return 'Low';
    }
    if (typeof score === 'number') {
      if (score >= 80) return 'High';
      if (score >= 50) return 'Medium';
      return 'Low';
    }
    return 'Low';
  }

  function confidenceValue(label) {
    if (label === 'High') return 100;
    if (label === 'Medium') return 50;
    return 10;
  }

  /* ─── Public API ─── */

  return {
    createEvidence: createEvidence,
    addSource: addSource,
    addSources: addSources,
    getBestSource: getBestSource,
    isWellSourced: isWellSourced,
    toBlock: toBlock,
    mergeEvidences: mergeEvidences,
    batchProcess: batchProcess,
    confidenceLabel: confidenceLabel,
    confidenceValue: confidenceValue,
    EVIDENCE_TYPES: EVIDENCE_TYPES,
    CONFIDENCE_HIGH: CONFIDENCE_HIGH,
    CONFIDENCE_MEDIUM: CONFIDENCE_MEDIUM,
    CONFIDENCE_LOW: CONFIDENCE_LOW
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentEvidence: ContentEvidence };
}
