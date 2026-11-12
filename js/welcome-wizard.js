/**
 * js/welcome-wizard.js — First-time User Welcome Wizard
 *
 * Detects first login, shows a 4-step Welcome Wizard overlay,
 * and injects a "Getting Started" checklist into the admin dashboard.
 *
 * Must be loaded AFTER firebase-config.js, db.js, cms-db.js.
 * Load on admin/home.html.
 */
(function() {
  'use strict';

  var BUSINESS_NODE = 'businesses';
  var WIZARD_KEY = 'psh_wizard_completed';

  // ─── First Login Detection ─────────────────────────────────────────
  function isFirstLogin(businessId) {
    // Check localStorage flag
    if (localStorage.getItem(WIZARD_KEY)) return false;

    // Check if business info has basic profile fields
    return firebase.database().ref(BUSINESS_NODE + '/' + businessId + '/info').once('value').then(function(snap) {
      var info = snap.val();
      if (!info) return true; // No business = first login

      // If business was just created via registration, it has minimal fields
      // Check if profile has been completed (phone + address + type)
      var hasPhone = info.phone && info.phone.length > 0;
      var hasAddress = info.address && info.address.length > 0;
      var hasType = info.type && info.type !== 'other';

      // If business already has profile data, skip wizard
      if (hasPhone && hasAddress && hasType) return false;

      return true; // First login — show wizard
    });
  }

  // ─── Wizard Modal HTML ─────────────────────────────────────────────
  function renderWizard() {
    var overlay = document.createElement('div');
    overlay.id = 'welcomeWizard';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:1rem;animation:fadeIn .3s ease';

    overlay.innerHTML =
      '<style>' +
      '@keyframes fadeIn{from{opacity:0}to{opacity:1}}' +
      '@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}' +
      '.ww-modal{background:#fff;border-radius:16px;max-width:520px;width:100%;padding:2rem;box-shadow:0 20px 60px rgba(0,0,0,.15);animation:slideUp .35s ease;font-family:Inter,system-ui,sans-serif;max-height:90vh;overflow-y:auto}' +
      '.ww-steps{display:flex;gap:.35rem;margin-bottom:1.5rem}' +
      '.ww-step{height:4px;flex:1;border-radius:2px;background:#e5e7eb;transition:background .3s}' +
      '.ww-step.active{background:#4F46E5}' +
      '.ww-step.done{background:#10b981}' +
      '.ww-icon{width:56px;height:56px;border-radius:14px;background:#eef2ff;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin:0 auto 1rem}' +
      '.ww-title{font-size:1.2rem;font-weight:700;text-align:center;margin-bottom:.25rem}' +
      '.ww-desc{font-size:.85rem;color:#6b7280;text-align:center;margin-bottom:1.5rem;line-height:1.5}' +
      '.ww-field{margin-bottom:1rem}' +
      '.ww-field label{display:block;font-size:.78rem;font-weight:600;color:#374151;margin-bottom:.3rem}' +
      '.ww-field input,.ww-field select{width:100%;padding:.6rem .75rem;border:1.5px solid #e5e7eb;border-radius:8px;font-size:.88rem;font-family:inherit;transition:border .2s}' +
      '.ww-field input:focus,.ww-field select:focus{outline:none;border-color:#4F46E5;box-shadow:0 0 0 3px #eef2ff}' +
      '.ww-field-row{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}' +
      '.ww-modules{display:grid;grid-template-columns:1fr 1fr;gap:.5rem}' +
      '.ww-module{display:flex;align-items:center;gap:.5rem;padding:.5rem .65rem;border:1.5px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:all .15s;font-size:.82rem}' +
      '.ww-module:hover{border-color:#4F46E5}' +
      '.ww-module.selected{background:#eef2ff;border-color:#4F46E5}' +
      '.ww-module input[type=checkbox]{width:16px;height:16px;accent-color:#4F46E5}' +
      '.ww-btn{width:100%;padding:.65rem;border:none;border-radius:8px;font-size:.88rem;font-weight:600;font-family:inherit;cursor:pointer;transition:all .15s;margin-top:.5rem}' +
      '.ww-btn.primary{background:#4F46E5;color:#fff}' +
      '.ww-btn.primary:hover{background:#4338CA}' +
      '.ww-btn.outline{background:transparent;color:#6b7280;border:1px solid #e5e7eb}' +
      '.ww-btn.outline:hover{background:#f9fafb}' +
      '.ww-success{text-align:center;padding:1.5rem}' +
      '.ww-success .check{width:64px;height:64px;border-radius:50%;background:#d1fae5;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin:0 auto 1rem}' +
      '.ww-checklist{display:flex;flex-direction:column;gap:.5rem;margin-top:1rem}' +
      '.ww-checklist-item{display:flex;align-items:center;gap:.65rem;padding:.5rem .65rem;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:all .15s;text-decoration:none;color:inherit}' +
      '.ww-checklist-item:hover{background:#f9fafb;border-color:#4F46E5}' +
      '.ww-checklist-item .ci-icon{width:32px;height:32px;border-radius:8px;background:#eef2ff;display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0}' +
      '.ww-checklist-item .ci-info{flex:1}' +
      '.ww-checklist-item .ci-name{font-size:.82rem;font-weight:600}' +
      '.ww-checklist-item .ci-desc{font-size:.72rem;color:#6b7280}' +
      '</style>' +
      '<div class="ww-modal" id="wwModal">' +
        '<div class="ww-steps" id="wwSteps">' +
          '<div class="ww-step active"></div>' +
          '<div class="ww-step"></div>' +
          '<div class="ww-step"></div>' +
          '<div class="ww-step"></div>' +
        '</div>' +
        '<div id="wwBody"></div>' +
      '</div>';

    document.body.appendChild(overlay);
  }

  // ─── Steps ─────────────────────────────────────────────────────────
  var currentStep = 1;
  var wizardData = {};
  var businessId = null;

  function showStep(step) {
    currentStep = step;

    // Update step indicators
    var steps = document.querySelectorAll('#wwSteps .ww-step');
    steps.forEach(function(s, i) {
      s.className = 'ww-step';
      if (i + 1 === step) s.classList.add('active');
      else if (i + 1 < step) s.classList.add('done');
    });

    var body = document.getElementById('wwBody');

    switch(step) {
      case 1: renderStep1(body); break;
      case 2: renderStep2(body); break;
      case 3: renderStep3(body); break;
      case 4: renderStep4(body); break;
    }
  }

  // ─── Step 1: Business Information ──────────────────────────────────
  function renderStep1(body) {
    body.innerHTML =
      '<div class="ww-icon">🏢</div>' +
      '<div class="ww-title">Business Information</div>' +
      '<div class="ww-desc">Tell us about your business. This information helps personalize your workspace.</div>' +
      '<div class="ww-field"><label>Business Name</label><input type="text" id="wBizName" placeholder="Your Business Name" value="' + escHtml(wizardData.bizName || '') + '"></div>' +
      '<div class="ww-field"><label>Logo URL (optional)</label><input type="text" id="wLogo" placeholder="https://example.com/logo.png" value="' + escHtml(wizardData.logo || '') + '"></div>' +
      '<div class="ww-field-row">' +
        '<div class="ww-field"><label>Phone</label><input type="tel" id="wPhone" placeholder="0901 952 999" value="' + escHtml(wizardData.phone || '') + '"></div>' +
        '<div class="ww-field"><label>Email</label><input type="email" id="wEmail" placeholder="contact@business.com" value="' + escHtml(wizardData.email || '') + '"></div>' +
      '</div>' +
      '<div class="ww-field"><label>Address</label><input type="text" id="wAddress" placeholder="123 Đường ABC, Thành phố" value="' + escHtml(wizardData.address || '') + '"></div>' +
      '<button class="ww-btn primary" onclick="WelcomeWizard.next()">Continue →</button>';
  }

  // ─── Step 2: Business Type ─────────────────────────────────────────
  function renderStep2(body) {
    var types = ['Shop', 'Restaurant', 'Coffee', 'Electronics', 'Fashion', 'Services', 'Other'];
    var current = wizardData.bizType || 'Shop';

    body.innerHTML =
      '<div class="ww-icon">🏷️</div>' +
      '<div class="ww-title">Choose Business Type</div>' +
      '<div class="ww-desc">Select the category that best describes your business. This helps us optimize your experience.</div>' +
      '<div class="ww-field"><label>Business Type</label><select id="wBizType">' +
        types.map(function(t) { return '<option value="' + t.toLowerCase() + '"' + (t.toLowerCase() === current.toLowerCase() ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
      '</select></div>' +
      '<button class="ww-btn primary" onclick="WelcomeWizard.next()">Continue →</button>';
  }

  // ─── Step 3: Quick Setup ───────────────────────────────────────────
  function renderStep3(body) {
    var modules = [
      {id:'products',icon:'📦',name:'Products'},
      {id:'blog',icon:'📝',name:'Blog'},
      {id:'banner',icon:'🖼️',name:'Banner'},
      {id:'slider',icon:'🔄',name:'Slider'},
      {id:'media',icon:'📁',name:'Media Library'},
      {id:'ai',icon:'🤖',name:'AI Tools'}
    ];
    var selected = wizardData.modules || modules.map(function(m) { return m.id; });

    body.innerHTML =
      '<div class="ww-icon">⚡</div>' +
      '<div class="ww-title">Quick Setup</div>' +
      '<div class="ww-desc">Choose which modules to enable. You can change this later in Settings.</div>' +
      '<div class="ww-modules" id="wwModules">' +
        modules.map(function(m) {
          var checked = selected.indexOf(m.id) >= 0;
          return '<label class="ww-module' + (checked ? ' selected' : '') + '">' +
            '<input type="checkbox" value="' + m.id + '"' + (checked ? ' checked' : '') + ' onchange="WelcomeWizard.toggleModule(this)">' +
            '<span>' + m.icon + '</span> <span>' + m.name + '</span>' +
          '</label>';
        }).join('') +
      '</div>' +
      '<button class="ww-btn primary" onclick="WelcomeWizard.next()">Continue →</button>';
  }

  // ─── Step 4: Finish ────────────────────────────────────────────────
  function renderStep4(body) {
    body.innerHTML =
      '<div class="ww-success">' +
        '<div class="check">✓</div>' +
        '<div class="ww-title" style="margin-bottom:.25rem">All Set!</div>' +
        '<div class="ww-desc" style="margin-bottom:0">Your workspace is ready. We\'ll save your preferences and take you to your dashboard.</div>' +
      '</div>' +
      '<button class="ww-btn primary" onclick="WelcomeWizard.finish()" id="wwFinishBtn">🚀 Go to Dashboard</button>';
  }

  // ─── Save & Finish ─────────────────────────────────────────────────
  function collectData() {
    if (currentStep === 1) {
      wizardData.bizName = document.getElementById('wBizName').value.trim();
      wizardData.logo = document.getElementById('wLogo').value.trim();
      wizardData.phone = document.getElementById('wPhone').value.trim();
      wizardData.email = document.getElementById('wEmail').value.trim();
      wizardData.address = document.getElementById('wAddress').value.trim();
    } else if (currentStep === 2) {
      wizardData.bizType = document.getElementById('wBizType').value;
    } else if (currentStep === 3) {
      var checked = document.querySelectorAll('#wwModules input:checked');
      wizardData.modules = Array.from(checked).map(function(c) { return c.value; });
    }
  }

  function saveAndFinish() {
    var btn = document.getElementById('wwFinishBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    // Update business info with wizard data
    var updates = {};
    updates[BUSINESS_NODE + '/' + businessId + '/info/displayName'] = wizardData.bizName || null;
    updates[BUSINESS_NODE + '/' + businessId + '/info/logo'] = wizardData.logo || null;
    updates[BUSINESS_NODE + '/' + businessId + '/info/phone'] = wizardData.phone || null;
    updates[BUSINESS_NODE + '/' + businessId + '/info/email'] = wizardData.email || null;
    updates[BUSINESS_NODE + '/' + businessId + '/info/address'] = wizardData.address || null;
    updates[BUSINESS_NODE + '/' + businessId + '/info/type'] = wizardData.bizType || 'other';

    // Set module preferences
    if (wizardData.modules && wizardData.modules.length > 0) {
      var modSettings = {};
      var allModules = ['products','blog','banner','slider','media','ai'];
      allModules.forEach(function(m) {
        modSettings[m] = wizardData.modules.indexOf(m) >= 0;
      });
      updates[BUSINESS_NODE + '/' + businessId + '/settings/modules'] = modSettings;
    }

    updates[BUSINESS_NODE + '/' + businessId + '/info/updatedAt'] = Date.now();

    // Also update businessMembers with contact info
    firebase.database().ref('businessMembers/' + businessId).once('value').then(function(snap) {
      var members = snap.val();
      if (members) {
        Object.keys(members).forEach(function(uid) {
          if (wizardData.email) {
            updates['businessMembers/' + businessId + '/' + uid + '/email'] = wizardData.email;
          }
        });
      }

      return firebase.database().ref().update(updates);
    }).then(function() {
      // Mark wizard as completed
      localStorage.setItem(WIZARD_KEY, 'true');

      // Remove wizard overlay
      var overlay = document.getElementById('welcomeWizard');
      if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(function() { overlay.remove(); }, 300);
      }

      // Show getting started checklist
      injectChecklist();
    }).catch(function(err) {
      console.warn('[WelcomeWizard] Save error:', err);
      localStorage.setItem(WIZARD_KEY, 'true');
      var overlay = document.getElementById('welcomeWizard');
      if (overlay) overlay.remove();
      injectChecklist();
    });
  }

  // ─── Getting Started Checklist ─────────────────────────────────────
  function injectChecklist() {
    var target = document.querySelector('.admin-wrap');
    if (!target) return;

    // Check if checklist already exists
    if (document.getElementById('gsChecklist')) return;

    var checklist = document.createElement('div');
    checklist.id = 'gsChecklist';
    checklist.style.cssText = 'margin-bottom:1.5rem';

    var items = [
      {icon:'🏢',name:'Complete Business Profile',desc:'Add your logo, phone, and address',link:'/admin/settings.html'},
      {icon:'📦',name:'Create Your First Product',desc:'Add a product with images and pricing',link:'/admin/products.html'},
      {icon:'🖼️',name:'Upload a Banner',desc:'Create a promotional banner',link:'/admin/banners.html'},
      {icon:'📝',name:'Write a Blog Post',desc:'Publish your first blog article',link:'/admin/blog.html'},
      {icon:'🤖',name:'Try AI Tools',desc:'Generate content with AI',link:'/admin/ai/index.html'}
    ];

    var completedStr = localStorage.getItem('psh_gs_completed') || '[]';
    var completed = [];
    try { completed = JSON.parse(completedStr); } catch(e) {}

    checklist.innerHTML =
      '<div style="background:#fff;border-radius:12px;padding:1.25rem;border:1px solid #e5e7eb">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">' +
          '<div><div style="font-weight:700;font-size:.95rem">🚀 Getting Started</div><div style="font-size:.78rem;color:#6b7280">Complete these steps to set up your business</div></div>' +
          '<div style="font-size:.78rem;color:#6b7280;font-weight:600">' + completed.length + '/' + items.length + '</div>' +
        '</div>' +
        '<div class="ww-checklist">' +
          items.map(function(item) {
            var done = completed.indexOf(item.name) >= 0;
            return '<a href="' + item.link + '" class="ww-checklist-item" onclick="WelcomeWizard.markComplete(\'' + escHtml(item.name) + '\')">' +
              '<div class="ci-icon" style="background:' + (done ? '#d1fae5' : '#eef2ff') + '">' + (done ? '✓' : item.icon) + '</div>' +
              '<div class="ci-info"><div class="ci-name" style="text-decoration:' + (done ? 'line-through' : 'none') + ';color:' + (done ? '#9ca3af' : 'inherit') + '">' + item.name + '</div><div class="ci-desc">' + item.desc + '</div></div>' +
            '</a>';
          }).join('') +
        '</div>' +
        (completed.length >= items.length ? '<div style="text-align:center;margin-top:.75rem;padding:.5rem;background:#d1fae5;border-radius:8px;color:#065f46;font-weight:600;font-size:.85rem">🎉 All steps completed! Welcome to PSH Console.</div>' : '') +
      '</div>';

    target.insertBefore(checklist, target.firstChild);
  }

  // ─── Public API ────────────────────────────────────────────────────
  window.WelcomeWizard = {
    next: function() {
      collectData();
      if (currentStep < 4) {
        showStep(currentStep + 1);
      }
    },
    toggleModule: function(el) {
      el.closest('.ww-module').classList.toggle('selected', el.checked);
    },
    finish: function() {
      collectData();
      saveAndFinish();
    },
    markComplete: function(name) {
      var completed = [];
      var stored = localStorage.getItem('psh_gs_completed');
      try { completed = stored ? JSON.parse(stored) : []; } catch(e) {}
      if (completed.indexOf(name) < 0) {
        completed.push(name);
        localStorage.setItem('psh_gs_completed', JSON.stringify(completed));
      }
    },
    init: function(bId) {
      businessId = bId || (window.__PSH_BUSINESS_ID__ || null);
      if (!businessId) {
        // Try to get from businessMembers
        var user = firebase.auth().currentUser;
        if (!user) return;
        firebase.database().ref('businessMembers').once('value').then(function(snap) {
          var data = snap.val();
          if (!data) return;
          var uid = user.uid;
          Object.keys(data).forEach(function(bizId) {
            if (data[bizId] && data[bizId][uid]) {
              businessId = bizId;
            }
          });
          if (businessId) checkAndShow();
        });
      } else {
        checkAndShow();
      }
    }
  };

  function checkAndShow() {
    if (!businessId) return;
    isFirstLogin(businessId).then(function(isFirst) {
      if (isFirst) {
        renderWizard();
        showStep(1);
      } else {
        // Show getting started checklist for context
        injectChecklist();
      }
    });
  }

  // ─── Helper ────────────────────────────────────────────────────────
  function escHtml(s) {
    if (typeof s !== 'string') return String(s || '');
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Auto-init when loaded ────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.WelcomeWizard.init();
    });
  } else {
    setTimeout(function() { window.WelcomeWizard.init(); }, 500);
  }
})();
