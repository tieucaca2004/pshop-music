/*
 * Settings (admin/settings.html) — site identity/contact info
 * (siteContent.settings, rendered by js/home.js renderSettings + js/site-
 * chrome.js mobile-nav) and the "Dịch vụ" section content (servicesIntro/
 * serviceItems/infoBoxRows on the homepage). Admin-only page.
 */
document.addEventListener('DOMContentLoaded', () => {
  AdminAuth.init({ page: 'settings', title: 'CÀI ĐẶT CHUNG', requiredRole: 'admin' }).then(load);

  let siteContent = null;

  // ---- KHUNG ẢNH SẢN PHẨM (Category Card Image Container) ----
  const PCI_DEFAULT = { ratio: '4 / 5', top: 0, left: 0, right: null, bottom: null, scale: 100, zoom: 100, fit: 'contain', position: '50% 50%', padding: 1.4, radius: 0 };
  let pci = Object.assign({}, PCI_DEFAULT);

  function parseRatio(ratioStr) {
    const parts = String(ratioStr || '4 / 5').split('/').map(s => parseFloat(s.trim()));
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { w: 4, h: 5 };
    return { w: parts[0], h: parts[1] };
  }

  function applyPciPreview() {
    const frame = document.getElementById('pciFrame');
    if (!frame) return;
    frame.style.setProperty('--pci-ratio', pci.ratio || '4 / 5');
    frame.style.setProperty('--pci-top', (pci.top || 0) + 'px');
    frame.style.setProperty('--pci-left', (pci.left || 0) + 'px');
    frame.style.setProperty('--pci-right', typeof pci.right === 'number' ? pci.right + 'px' : 'auto');
    frame.style.setProperty('--pci-bottom', typeof pci.bottom === 'number' ? pci.bottom + 'px' : 'auto');
    frame.style.setProperty('--pci-scale', (typeof pci.scale === 'number' ? pci.scale : 100) / 100);
    frame.style.setProperty('--pci-zoom', (typeof pci.zoom === 'number' ? pci.zoom : 100) / 100);
    frame.style.setProperty('--pci-fit', pci.fit || 'contain');
    frame.style.setProperty('--pci-pos', pci.position || '50% 50%');
    frame.style.setProperty('--pci-padding', (typeof pci.padding === 'number' ? pci.padding : 1.4) + 'rem');
    frame.style.setProperty('--pci-radius', (typeof pci.radius === 'number' ? pci.radius : 0) + 'px');
  }

  function fillPciFields() {
    document.getElementById('pciRight').value = typeof pci.right === 'number' ? pci.right : '';
    document.getElementById('pciBottom').value = typeof pci.bottom === 'number' ? pci.bottom : '';
    document.getElementById('pciScale').value = typeof pci.scale === 'number' ? pci.scale : 100;
    document.getElementById('pciFit').value = pci.fit || 'contain';
    document.getElementById('pciPadding').value = typeof pci.padding === 'number' ? pci.padding : 1.4;
    document.getElementById('pciRadius').value = typeof pci.radius === 'number' ? pci.radius : 0;
    const posParts = (pci.position || '50% 50%').split(' ').map(v => parseFloat(v));
    document.getElementById('pciPosX').value = isNaN(posParts[0]) ? 50 : posParts[0];
    document.getElementById('pciPosY').value = isNaN(posParts[1]) ? 50 : posParts[1];
  }

  function bindPciFields() {
    document.getElementById('pciRight').addEventListener('input', e => {
      pci.right = e.target.value === '' ? null : parseFloat(e.target.value);
      applyPciPreview();
    });
    document.getElementById('pciBottom').addEventListener('input', e => {
      pci.bottom = e.target.value === '' ? null : parseFloat(e.target.value);
      applyPciPreview();
    });
    document.getElementById('pciScale').addEventListener('input', e => {
      pci.scale = e.target.value === '' ? 100 : parseFloat(e.target.value);
      applyPciPreview();
    });
    document.getElementById('pciFit').addEventListener('change', e => {
      pci.fit = e.target.value;
      applyPciPreview();
    });
    document.getElementById('pciPadding').addEventListener('input', e => {
      pci.padding = e.target.value === '' ? 0 : parseFloat(e.target.value);
      applyPciPreview();
    });
    document.getElementById('pciRadius').addEventListener('input', e => {
      pci.radius = e.target.value === '' ? 0 : parseFloat(e.target.value);
      applyPciPreview();
    });
    document.getElementById('pciPosX').addEventListener('input', updatePciPosition);
    document.getElementById('pciPosY').addEventListener('input', updatePciPosition);

    document.getElementById('pciFrame').addEventListener('pointerdown', startPciMove);
    document.getElementById('pciResizeHandle').addEventListener('pointerdown', startPciResize);
    document.getElementById('pciZoomHandle').addEventListener('pointerdown', startPciZoom);
  }

  function updatePciPosition() {
    const x = document.getElementById('pciPosX').value;
    const y = document.getElementById('pciPosY').value;
    pci.position = x + '% ' + y + '%';
    applyPciPreview();
  }

  function startPciMove(e) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startLeft = pci.left || 0, startTop = pci.top || 0;
    function onMove(ev) {
      pci.left = Math.max(-60, Math.min(60, startLeft + (ev.clientX - startX)));
      pci.top = Math.max(-60, Math.min(60, startTop + (ev.clientY - startY)));
      applyPciPreview();
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function startPciResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const r = parseRatio(pci.ratio);
    const startH = 280 * (r.h / r.w);
    function onMove(ev) {
      const dy = ev.clientY - startY;
      const newH = Math.max(140, Math.min(560, startH + dy));
      pci.ratio = '280 / ' + Math.round(newH);
      applyPciPreview();
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function startPciZoom(e) {
    e.preventDefault();
    e.stopPropagation();
    const frame = document.getElementById('pciFrame');
    const rect = frame.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const startDist = Math.max(1, Math.hypot(e.clientX - cx, e.clientY - cy));
    const startZoom = pci.zoom || 100;
    function onMove(ev) {
      const dist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      pci.zoom = Math.max(100, Math.min(300, Math.round(startZoom * (dist / startDist))));
      applyPciPreview();
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function savePci() {
    const content = Object.assign({}, siteContent, { productCardImage: Object.assign({}, pci) });
    SiteContentDB.save(content).then(() => {
      siteContent = content;
      showStatus('pciStatus', 'Đã lưu Khung ảnh sản phẩm.');
    });
  }

  function resetPci() {
    pci = Object.assign({}, PCI_DEFAULT);
    fillPciFields();
    applyPciPreview();
  }

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

      document.getElementById('heroTagInput').value = content.heroTag || '';
      document.getElementById('heroCtaInput').value = content.heroCtaLabel || '';
      document.getElementById('heroCta2Input').value = content.heroCta2Label || '';

      document.getElementById('catIntroEnabled').checked = !!content.categoriesIntroEnabled;
      document.getElementById('catIntroEyebrow').value = content.categoriesEyebrow || '';
      document.getElementById('catIntroTitle').value = content.categoriesTitle || '';
      document.getElementById('catIntroDesc').value = content.categoriesDesc || '';

      document.getElementById('svcIntro').value = content.servicesIntro || '';
      document.getElementById('svcItems').value = (content.serviceItems || []).map(i => `${i.title} | ${i.desc}`).join('\n');
      document.getElementById('svcInfoRows').value = (content.infoBoxRows || []).map(r => `${r.label} | ${r.value}`).join('\n');

      pci = Object.assign({}, PCI_DEFAULT, content.productCardImage || {});
      fillPciFields();
      applyPciPreview();
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

  function saveHeroText() {
    const content = Object.assign({}, siteContent, {
      heroTag: document.getElementById('heroTagInput').value.trim(),
      heroCtaLabel: document.getElementById('heroCtaInput').value.trim(),
      heroCta2Label: document.getElementById('heroCta2Input').value.trim()
    });
    SiteContentDB.save(content).then(() => {
      siteContent = content;
      showStatus('heroTextStatus', 'Đã lưu chữ Hero trang chủ.');
    });
  }

  function saveCatIntro() {
    const content = Object.assign({}, siteContent, {
      categoriesIntroEnabled: document.getElementById('catIntroEnabled').checked,
      categoriesEyebrow: document.getElementById('catIntroEyebrow').value.trim(),
      categoriesTitle: document.getElementById('catIntroTitle').value.trim(),
      categoriesDesc: document.getElementById('catIntroDesc').value.trim()
    });
    SiteContentDB.save(content).then(() => {
      siteContent = content;
      showStatus('catIntroStatus', 'Đã lưu tiêu đề khu Danh mục.');
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
  document.getElementById('saveHeroTextBtn').addEventListener('click', saveHeroText);
  document.getElementById('saveCatIntroBtn').addEventListener('click', saveCatIntro);
  document.getElementById('saveServicesBtn').addEventListener('click', saveServices);
  document.getElementById('savePciBtn').addEventListener('click', savePci);
  document.getElementById('resetPciBtn').addEventListener('click', resetPci);
  bindPciFields();
});
