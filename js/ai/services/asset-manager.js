/*
 * AssetManager — Asset Storage and Retrieval Service
 * ===================================================
 * Manages assets in the Media AI Center. Every generated image, video,
 * voice recording, or document is tracked as an asset with metadata.
 *
 * Uses Firebase Realtime Database under the 'assetLibrary' node.
 * Integrates with existing media-library.js for file upload/storage.
 *
 * Dependencies:
 *   Firebase (existing) — for asset metadata storage
 *   js/media-library.js (existing) — for file upload/download
 */

const AssetManager = (function () {
  var ASSETS_REF = null;

  function getRef() {
    if (ASSETS_REF) return ASSETS_REF;
    if (typeof firebase !== 'undefined' && firebase.database) {
      ASSETS_REF = firebase.database().ref('assetLibrary');
    }
    return ASSETS_REF;
  }

  /**
   * save(asset) — Save an asset to the library.
   *
   * asset = {
   *   type: 'image' | 'video' | 'audio' | 'document',
   *   name: string,
   *   url?: string,           // CDN/storage URL
   *   draftId?: string,        // Source draft ID
   *   moduleId?: string,       // Generating module
   *   tags?: string[],
   *   metadata?: object,       // Provider-specific metadata
   *   createdBy?: string,
   *   projectId?: string
   * }
   *
   * Returns Promise<{ id: string, asset: object }>
   */
  function save(asset) {
    var ref = getRef();
    if (!ref) {
      return Promise.reject(new Error('AssetManager: Firebase not available'));
    }
    var entry = {
      type: asset.type || 'document',
      name: asset.name || 'Untitled',
      url: asset.url || null,
      draftId: asset.draftId || null,
      moduleId: asset.moduleId || null,
      tags: asset.tags || [],
      metadata: asset.metadata || {},
      createdBy: asset.createdBy || 'system',
      projectId: asset.projectId || null,
      createdAt: Date.now(),
      size: asset.size || 0,
      status: 'active'
    };
    var newRef = ref.push();
    return newRef.set(entry).then(function () {
      return { id: newRef.key, asset: entry };
    });
  }

  /**
   * get(id) — Retrieve an asset by ID.
   */
  function get(id) {
    var ref = getRef();
    if (!ref) return Promise.reject(new Error('AssetManager: Firebase not available'));
    return ref.child(id).once('value').then(function (snap) {
      return snap.val();
    });
  }

  /**
   * list(filters) — List assets with optional filters.
   *
   * filters = {
   *   type?: string,        // Filter by asset type
   *   moduleId?: string,     // Filter by generating module
   *   projectId?: string,    // Filter by project
   *   createdBy?: string,    // Filter by creator
   *   tags?: string[],       // Must have ALL these tags
   *   limit?: number,        // Max results (default: 50)
   *   offset?: number        // Skip first N
   * }
   */
  function list(filters) {
    var ref = getRef();
    if (!ref) return Promise.reject(new Error('AssetManager: Firebase not available'));

    filters = filters || {};
    var limit = filters.limit || 50;

    return ref.orderByChild('createdAt').limitToLast(limit).once('value').then(function (snap) {
      var data = snap.val();
      if (!data) return [];
      var items = Object.keys(data).map(function (key) {
        var item = data[key];
        item._id = key;
        return item;
      }).reverse();

      // Apply filters
      if (filters.type) items = items.filter(function (i) { return i.type === filters.type; });
      if (filters.moduleId) items = items.filter(function (i) { return i.moduleId === filters.moduleId; });
      if (filters.projectId) items = items.filter(function (i) { return i.projectId === filters.projectId; });
      if (filters.createdBy) items = items.filter(function (i) { return i.createdBy === filters.createdBy; });
      if (filters.tags && filters.tags.length) {
        items = items.filter(function (i) {
          return filters.tags.every(function (t) { return (i.tags || []).indexOf(t) !== -1; });
        });
      }

      return items;
    });
  }

  /**
   * update(id, changes) — Update asset metadata.
   */
  function update(id, changes) {
    var ref = getRef();
    if (!ref) return Promise.reject(new Error('AssetManager: Firebase not available'));
    changes.updatedAt = Date.now();
    return ref.child(id).update(changes);
  }

  /**
   * remove(id) — Soft-delete an asset (mark as archived).
   */
  function remove(id) {
    return update(id, { status: 'archived' });
  }

  /**
   * delete(id) — Permanently delete an asset.
   */
  function deleteAsset(id) {
    var ref = getRef();
    if (!ref) return Promise.reject(new Error('AssetManager: Firebase not available'));
    return ref.child(id).remove();
  }

  /**
   * countByType() — Returns asset counts grouped by type.
   */
  function countByType() {
    var ref = getRef();
    if (!ref) return Promise.resolve({});
    return ref.once('value').then(function (snap) {
      var data = snap.val();
      if (!data) return {};
      var counts = {};
      Object.keys(data).forEach(function (key) {
        var type = data[key].type || 'other';
        counts[type] = (counts[type] || 0) + 1;
      });
      return counts;
    });
  }

  return {
    save: save,
    get: get,
    list: list,
    update: update,
    remove: remove,
    delete: deleteAsset,
    countByType: countByType
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AssetManager: AssetManager };
}
