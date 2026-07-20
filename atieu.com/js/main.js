/**
 * Hủ Tiếu Xào A Tiểu - Main JavaScript
 * atieu.com
 */

// Smooth scroll for anchor links
document.addEventListener('DOMContentLoaded', function() {
  // Header scrolled state
  const header = document.querySelector('.site-header');
  let lastScroll = 0;

  window.addEventListener('scroll', function() {
    const currentScroll = window.pageYOffset;
    if (currentScroll > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    lastScroll = currentScroll;
  }, { passive: true });

  // Close mobile nav on resize to desktop
  window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
      const mobileNav = document.getElementById('mobileNav');
      const navToggle = document.getElementById('navToggle');
      if (mobileNav && navToggle) {
        mobileNav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.textContent = '☰';
      }
    }
  });

  // Keyboard navigation: Escape closes mobile nav
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const mobileNav = document.getElementById('mobileNav');
      const navToggle = document.getElementById('navToggle');
      if (mobileNav && mobileNav.classList.contains('open')) {
        mobileNav.classList.remove('open');
        if (navToggle) {
          navToggle.setAttribute('aria-expanded', 'false');
          navToggle.textContent = '☰';
        }
      }
    }
  });
});
