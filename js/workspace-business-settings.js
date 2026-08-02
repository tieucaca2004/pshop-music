/**
 * js/workspace-business-settings.js — Customer Workspace Business Settings (Task 2.10).
 *
 * Reuses:
 *   - WorkspaceAuth.apiFetch() for all API calls (no direct RTDB)
 *   - WorkspaceAuth.init() for auth + sidebar (no custom auth gate)
 *   - MediaLibraryPicker.mount() for logo/cover selection (reuses existing modal + preview)
 *   - MediaLibrary.upload() for file upload
 *   - StorageUpload for upload implementation (through MediaLibrary)
 *   - Existing admin.css for layout (form-row, panel, admin-actions)
 *   - Existing validation patterns (required, email, phone, URL)
 *
 * Backend: PATCH /v1/businesses/{id}/profile, GET /v1/businesses/{id}/profile
 *   (functions/routes/businesses.js, requires business_admin role)
 *
 * Security: Tenant isolation via requireBusiness() in backend.
 *   Cross-tenant access returns 403. Unauthenticated returns 401.
 *   Business_admin role required for the endpoint.
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var businessId = null;
  var dirty = false;
  var logoPicker = null;
  var coverPicker = null;

  // ─── Common timezones ────────────────────────────────────────────
  var TIMEZONES = [
    'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Singapore', 'Asia/Jakarta',
    'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Tokyo', 'Asia/Seoul',
    'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Kolkata',
    'Australia/Sydney', 'Pacific/Auckland', 'Asia/Dubai', 'Asia/Riyadh',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Sao_Paulo', 'America/Mexico_City', 'Africa/Cairo', 'Africa/Lagos',
    'UTC'
  ];

  // ─── Validators ───────────────────────────────────────────────────
  function validateEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function validatePhone(v) { return !v || /^[\d\s\-\+\(\)]{6,30}$/.test(v); }
  function validateUrl(v)   { return !v || /^https?:\/\/.+/.test(v); }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ─── Form helpers ─────────────────────────────────────────────────
  function setStatus(msg, isError) {
    var el = document.getElementById('bsStatus');
    if (el) el.innerHTML = isError
      ? '<span style="color:#c0392b">&#10060; ' + escapeHtml(msg) + '</span>'
      : '<span style="color:#27ae60">&#10004; ' + escapeHtml(msg) + '</span>';
  }

  function setFormLoading(loading) {
    document.getElementById('bsSaveBtn').disabled = loading;
    document.getElementById('bsSaveBtn').textContent = loading ? 'Saving...' : 'Save Changes';
  }

  function initTimezoneSelect(selected) {
    var sel = document.getElementById('bsTimezone');
    sel.innerHTML = TIMEZONES.map(function (tz) {
      return '<option value="' + tz + '"' + (tz === selected ? ' selected' : '') + '>' + tz + '</option>';
    }).join('');
  }

  function getPickerSlotId(inputId, previewId) {
    // mount() creates a slot with id = previewId + '-slot'
    return previewId + '-slot';
  }

  // ─── Upload helper — upload file then refresh the MediaLibraryPicker slot ──
  function handleUpload(inputId, previewId, pickerRef) {
    var input = document.getElementById(inputId);
    input.click();
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      setStatus('Uploading...');
      MediaLibrary.upload(file).then(function (result) {
        var url = result.url || result;
        document.getElementById(inputId.replace('FileInput', '')).value = url;
        if (pickerRef && pickerRef.refresh) pickerRef.refresh();
        dirty = true;
        setStatus('Upload complete. Save changes to apply.');
      }).catch(function (e) {
        setStatus('Upload failed: ' + e.message, true);
      });
    };
  }

  // ─── Load profile data ───────────────────────────────────────────
  function loadProfile() {
    var panel = document.getElementById('bsFormPanel');
    panel.style.display = 'none';
    setStatus('Loading business profile...');

    return WorkspaceAuth.apiFetch('/v1/businesses/' + businessId + '/profile')
      .then(function (data) {
        if (!data) {
          setStatus('Business not found.', true);
          return;
        }

        // Populate form fields
        document.getElementById('bsName').value = data.displayName || '';
        document.getElementById('bsCode').value = data.slug || businessId;
        document.getElementById('bsEmail').value = data.email || '';
        document.getElementById('bsPhone').value = data.phone || '';
        document.getElementById('bsWebsite').value = data.website || '';

        // Address — try to split city from address if comma-separated
        var addr = data.address || '';
        var addrParts = addr.split(',').map(function (s) { return s.trim(); });
        if (addrParts.length > 1) {
          document.getElementById('bsAddress').value = addrParts.slice(0, -1).join(', ');
          document.getElementById('bsCity').value = addrParts[addrParts.length - 1];
        } else {
          document.getElementById('bsAddress').value = addr;
          document.getElementById('bsCity').value = data.city || '';
        }

        initTimezoneSelect(data.timezone || 'Asia/Ho_Chi_Minh');
        document.getElementById('bsCountry').value = data.country || 'VN';
        document.getElementById('bsCurrency').value = data.currency || 'VND';
        document.getElementById('bsLanguage').value = data.language || 'vi';
        document.getElementById('bsDescription').value = data.description || '';

        // Set hidden input values for MediaLibraryPicker
        document.getElementById('bsLogo').value = data.logo || '';
        document.getElementById('bsCoverImage').value = data.coverImage || '';

        // Mount MediaLibraryPicker on logo & cover
        logoPicker = MediaLibraryPicker.mount('bsLogo', 'bsLogoPreview');
        coverPicker = MediaLibraryPicker.mount('bsCoverImage', 'bsCoverPreview');

        panel.style.display = 'block';
        setStatus('Profile loaded. Edit fields and save.');
        dirty = false;
      })
      .catch(function (e) {
        setStatus('Failed to load profile: ' + e.message, true);
      });
  }

  // ─── Save profile data ───────────────────────────────────────────
  function saveProfile(evt) {
    evt.preventDefault();

    // ── Validate ────────────────────────────────────────────────────
    var name = document.getElementById('bsName').value.trim();
    var email = document.getElementById('bsEmail').value.trim();
    var phone = document.getElementById('bsPhone').value.trim();
    var website = document.getElementById('bsWebsite').value.trim();

    if (!name) { setStatus('Business Name is required.', true); return; }
    if (name.length > 120) { setStatus('Business Name must be under 120 characters.', true); return; }
    if (!email) { setStatus('Email is required.', true); return; }
    if (!validateEmail(email)) { setStatus('Invalid email format.', true); return; }
    if (phone && !validatePhone(phone)) { setStatus('Invalid phone format.', true); return; }
    if (website && !validateUrl(website)) { setStatus('Invalid website URL. Must start with http:// or https://', true); return; }
    if (email.length > 200) { setStatus('Email must be under 200 characters.', true); return; }

    // ── Build payload ───────────────────────────────────────────────
    var address = document.getElementById('bsAddress').value.trim();
    var city = document.getElementById('bsCity').value.trim();
    var fullAddress = city ? address + ', ' + city : address;

    var payload = {
      displayName: name,
      email: email,
      phone: phone,
      website: website,
      address: fullAddress,
      timezone: document.getElementById('bsTimezone').value,
      description: document.getElementById('bsDescription').value.trim(),
      logo: document.getElementById('bsLogo').value || '',
      coverImage: document.getElementById('bsCoverImage').value || ''
    };

    // Remove empty strings so the PATCH only sends defined fields
    Object.keys(payload).forEach(function (k) {
      if (payload[k] === '') payload[k] = undefined;
    });

    setFormLoading(true);
    setStatus('Saving...');

    return WorkspaceAuth.apiFetch('/v1/businesses/' + businessId + '/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function () {
      setFormLoading(false);
      dirty = false;
      setStatus('Business profile saved successfully!');
    }).catch(function (e) {
      setFormLoading(false);
      setStatus('Save failed: ' + e.message, true);
    });
  }

  // ─── Confirm discard if dirty ─────────────────────────────────────
  function confirmDiscard() {
    if (dirty) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    dirty = false;
    loadProfile();
  }

  // ─── Init ─────────────────────────────────────────────────────────
  WorkspaceAuth.init('business-settings', 'Business Settings').then(function (ctx) {
    if (!ctx) return;
    businessId = ctx.businessId;

    // Wire form
    document.getElementById('bsForm').addEventListener('submit', saveProfile);
    document.getElementById('bsCancelBtn').addEventListener('click', confirmDiscard);

    // Wire upload buttons
    document.getElementById('bsLogoUpload').addEventListener('click', function () {
      handleUpload('bsLogoFileInput', 'bsLogoPreview', logoPicker);
    });
    document.getElementById('bsCoverUpload').addEventListener('click', function () {
      handleUpload('bsCoverFileInput', 'bsCoverPreview', coverPicker);
    });

    // Mark form as dirty on any change
    document.querySelectorAll('#bsForm input, #bsForm textarea, #bsForm select').forEach(function (el) {
      el.addEventListener('change', function () { dirty = true; });
      el.addEventListener('input', function () { dirty = true; });
    });

    // Load data
    loadProfile();
  });
});
