/*
 * ProjectManager — Content Project Management Service
 * =====================================================
 * Manages content creation projects in the Media AI Center. A project
 * groups multiple generation requests, templates, and assets together
 * for coordinated content campaigns.
 *
 * Each project can contain:
 *   - Multiple generation jobs (images, blog posts, social media)
 *   - Templates used for the project
 *   - Assets produced by the project
 *   - Status tracking and progress monitoring
 *
 * Dependencies:
 *   Firebase Realtime Database (projects/) → project storage
 *   js/ai/services/batch-engine.js        → BatchEngine (batch execution)
 *   js/ai/services/asset-manager.js       → AssetManager (asset tracking)
 */

const ProjectManager = (function () {
  var PROJECTS_REF = null;

  function getRef() {
    if (PROJECTS_REF) return PROJECTS_REF;
    if (typeof firebase !== 'undefined' && firebase.database) {
      PROJECTS_REF = firebase.database().ref('projects');
    }
    return PROJECTS_REF;
  }

  /**
   * create(project) — Create a new project.
   *
   * project = {
   *   name: string,
   *   description?: string,
   *   type: 'campaign' | 'content' | 'social' | 'seo' | 'custom',
   *   dueDate?: number,             // Unix timestamp
   *   tags?: string[],
   *   templateIds?: string[],       // Templates used
   *   createdBy: string
   * }
   */
  function create(project) {
    if (!project || !project.name || !project.type) {
      return Promise.reject(new Error('ProjectManager.create() requires name and type'));
    }
    var ref = getRef();
    if (!ref) {
      return Promise.reject(new Error('ProjectManager: Firebase not available'));
    }
    var entry = {
      name: project.name,
      description: project.description || '',
      type: project.type,
      status: 'draft',
      dueDate: project.dueDate || null,
      tags: project.tags || [],
      templateIds: project.templateIds || [],
      createdBy: project.createdBy || 'system',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      progress: {
        total: 0,
        completed: 0,
        percent: 0
      },
      assets: {},
      jobs: {}
    };
    var newRef = ref.push();
    return newRef.set(entry).then(function () {
      return { id: newRef.key, project: entry };
    });
  }

  /**
   * get(id) — Get a project by ID.
   */
  function get(id) {
    var ref = getRef();
    if (!ref) return Promise.resolve(null);
    return ref.child(id).once('value').then(function (snap) { return snap.val(); });
  }

  /**
   * list(filters) — List projects with optional filters.
   */
  function list(filters) {
    var ref = getRef();
    if (!ref) return Promise.resolve([]);
    filters = filters || {};

    return ref.orderByChild('updatedAt').limitToLast(50).once('value').then(function (snap) {
      var data = snap.val();
      if (!data) return [];
      var items = Object.keys(data).map(function (key) {
        var item = data[key];
        item._id = key;
        return item;
      }).reverse();

      if (filters.status) items = items.filter(function (i) { return i.status === filters.status; });
      if (filters.type) items = items.filter(function (i) { return i.type === filters.type; });
      if (filters.createdBy) items = items.filter(function (i) { return i.createdBy === filters.createdBy; });
      if (filters.limit) items = items.slice(0, filters.limit);

      return items;
    });
  }

  /**
   * update(id, changes) — Update project metadata.
   */
  function update(id, changes) {
    var ref = getRef();
    if (!ref) return Promise.resolve();
    changes.updatedAt = Date.now();
    return ref.child(id).update(changes);
  }

  /**
   * addJob(projectId, jobInfo) — Link a job to a project.
   */
  function addJob(projectId, jobInfo) {
    var ref = getRef();
    if (!ref) return Promise.resolve();
    var jobsRef = ref.child(projectId + '/jobs/' + (jobInfo.id || Date.now()));
    return jobsRef.set({
      id: jobInfo.id,
      type: jobInfo.type || 'generation',
      moduleId: jobInfo.moduleId || null,
      status: jobInfo.status || 'pending',
      createdAt: Date.now()
    }).then(function () {
      // Recalculate progress
      return recalculateProgress(projectId);
    });
  }

  /**
   * addAsset(projectId, assetId) — Link an asset to a project.
   */
  function addAsset(projectId, assetId) {
    var ref = getRef();
    if (!ref) return Promise.resolve();
    return ref.child(projectId + '/assets/' + assetId).set({
      assetId: assetId,
      addedAt: Date.now()
    });
  }

  /**
   * recalculateProgress(projectId) — Recalculate project completion percentage.
   */
  function recalculateProgress(projectId) {
    var ref = getRef();
    if (!ref) return Promise.resolve();
    return ref.child(projectId).once('value').then(function (snap) {
      var project = snap.val();
      if (!project || !project.jobs) return;
      var jobs = project.jobs;
      var jobIds = Object.keys(jobs);
      var total = jobIds.length;
      var completed = jobIds.filter(function (jid) {
        return jobs[jid].status === 'completed';
      }).length;
      var percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      return ref.child(projectId + '/progress').set({
        total: total,
        completed: completed,
        percent: percent
      });
    });
  }

  /**
   * updateJobStatus(projectId, jobId, status) — Update a job's status within a project.
   */
  function updateJobStatus(projectId, jobId, status) {
    var ref = getRef();
    if (!ref) return Promise.resolve();
    return ref.child(projectId + '/jobs/' + jobId + '/status').set(status).then(function () {
      return recalculateProgress(projectId);
    });
  }

  /**
   * launch(projectId, userId, userEmail) — Launch all pending items in a project
   * as a batch through BatchEngine.
   */
  function launch(projectId, userId, userEmail) {
    return get(projectId).then(function (project) {
      if (!project) return Promise.reject(new Error('Project not found: ' + projectId));
      if (project.status === 'completed') {
        return { success: false, error: 'Project already completed' };
      }

      // Gather pending jobs
      var jobs = project.jobs || {};
      var pending = [];
      Object.keys(jobs).forEach(function (key) {
        if (jobs[key].status === 'pending' || jobs[key].status === 'failed') {
          pending.push(jobs[key]);
        }
      });

      if (pending.length === 0) {
        return { success: true, note: 'No pending jobs to launch', projectId: projectId };
      }

      var requests = pending.filter(function (j) { return j.moduleId; }).map(function (j) {
        return {
          moduleId: j.moduleId,
          inputParams: j.inputParams || {},
          userId: userId,
          userEmail: userEmail
        };
      });

      if (requests.length === 0) {
        return { success: false, error: 'No jobs with valid moduleId', projectId: projectId };
      }

      return update(projectId, { status: 'running' }).then(function () {
        return BatchEngine.run({
          name: 'Project: ' + project.name,
          requests: requests,
          userId: userId,
          userEmail: userEmail,
          concurrency: 2
        });
      }).then(function (batchResult) {
        var allDone = batchResult.failed === 0;
        return update(projectId, { status: allDone ? 'completed' : 'partial' }).then(function () {
          batchResult.projectId = projectId;
          return batchResult;
        });
      });
    });
  }

  /**
   * archive(id) — Archive a completed project.
   */
  function archive(id) {
    return update(id, { status: 'archived' });
  }

  /**
   * remove(id) — Delete a project permanently.
   */
  function remove(id) {
    var ref = getRef();
    if (!ref) return Promise.resolve();
    return ref.child(id).remove();
  }

  return {
    create: create,
    get: get,
    list: list,
    update: update,
    addJob: addJob,
    addAsset: addAsset,
    updateJobStatus: updateJobStatus,
    launch: launch,
    archive: archive,
    remove: remove
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ProjectManager: ProjectManager };
}
