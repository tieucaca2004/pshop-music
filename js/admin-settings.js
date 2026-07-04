/*
 * Settings (admin/settings.html) — site identity/contact info
 * (siteContent.settings, rendered by js/home.js renderSettings + js/site-
 * chrome.js mobile-nav) and the "Dịch vụ" section content (servicesIntro/
 * serviceItems/infoBoxRows on the homepage). Admin-only page.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'settings', title: 'CÀI ĐẶT CHUNG', requiredRole: 'admin' }).then(load);

  let siteContent = null;

  function parseLines(text) {
    return text.split('\n').map(l => l.trim()).filter(Boolean);
  }

  function parsePipePairs(text, keyA, keyB) {
    return parseLines(text).map(line => {
      const sepIndex = line.indexOf('|');
      const obj = {};
      obj[keyA] = (sepIndex === -1 ? line : line.slice(0, sepIndex)).trim();
      obj[keyB] = (sepIndex === -1 ? '' : line.slice(sepIndex + 1)).trim();
      return obj;
    });
  }

  function load() {
    SiteContentDB.get().then(content => {
      siteContent = content;
      const s = content.settings || {};
      document.getElementById('setSiteName').value = s.siteName || '';
      document.getElementById('setLogoText').value = s.logoText || '';
      document.getElementById('setPhone').value = s.phone || '';
      document.getElementById('setPhoneDisplay').value = s.phoneDisplay || '';
      document.getElementById('setAddress').value = s.address || '';
      document.getElementById('setMapLink').value = s.mapLink || '';
      document.getElementById('setOpeningHours').value = s.openingHours || '';
      document.getElementById('setFacebook').value = (s.socials && s.socials.facebook) || '';
      document.getElementById('setZalo').value = (s.socials && s.socials.zalo) || '';
      document.getElementById('setShopee').value = (s.socials && s.socials.shopee) || '';

      document.getElementById('svcIntro').value = content.servicesIntro || '';
      document.getElementById('svcItems').value = (content.serviceItems || []).map(i => `${i.title} | ${i.desc}`).join('\n');
      document.getElementById('svcInfoRows').value = (content.infoBoxRows || []).map(r => `${r.label} | ${r.value}`).join('\n');
    });
  }

  function saveSettings() {
    const settings = {
      siteName: document.getElementById('setSiteName').value.trim(),
      logoText: document.getElementById('setLogoText').value.trim(),
      phone: document.getElementById('setPhone').value.trim(),
      phoneDisplay: document.getElementById('setPhoneDisplay').value.trim(),
      zalo: document.getElementById('setPhone').value.trim(),
      address: document.getElementById('setAddress').value.trim(),
      mapLink: document.getElementById('setMapLink').value.trim(),
      openingHours: document.getElementById('setOpeningHours').value.trim(),
      socials: {
        facebook: document.getElementById('setFacebook').value.trim(),
        messenger: (siteContent.settings && siteContent.settings.socials && siteContent.settings.socials.messenger) || '',
        zalo: document.getElementById('setZalo').value.trim(),
        shopee: document.getElementById('setShopee').value.trim()
      }
    };
    const content = Object.assign({}, siteContent, { settings });
    SiteContentDB.save(content).then(() => {
      siteContent = content;
      showStatus('settingsStatus', 'Đã lưu thông tin chung.');
    });
  }

  function saveServices() {
    const content = Object.assign({}, siteContent, {
      servicesIntro: document.getElementById('svcIntro').value.trim(),
      serviceItems: parsePipePairs(document.getElementById('svcItems').value, 'title', 'desc'),
      infoBoxRows: parsePipePairs(document.getElementById('svcInfoRows').value, 'label', 'value')
    });
    SiteContentDB.save(content).then(() => {
      siteContent = content;
      showStatus('servicesStatus', 'Đã lưu nội dung Dịch vụ.');
    });
  }

  function showStatus(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }

  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('saveServicesBtn').addEventListener('click', saveServices);
});
