/* Presentation behavior only. Operations and permissions remain in App. */
(() => {
  const toggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('main-navigation');
  const close = () => {
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir navegación');
  };
  toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar navegación' : 'Abrir navegación');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('nav-open')) {
      close();
      toggle.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!sidebar.contains(event.target) && !toggle.contains(event.target)) close();
  });
  window.addEventListener('aurea:view', event => {
    const button = Array.from(sidebar.querySelectorAll('[data-view]')).find(el => el.dataset.view === event.detail);
    if (button) document.getElementById('workspace-view').textContent = button.textContent.trim();
    sidebar.querySelectorAll('[data-view]').forEach(el => {
      if (el === button) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    close();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  sidebar.querySelector('[data-view="dashboard"]').setAttribute('aria-current', 'page');
  // Legacy API badges and categories can include emoji. Clean their displayed
  // text only: stored records, input values, option values and API data stay intact.
  const decorations = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[\uFE0F\uFE0E\u200D\u20E3\u{1F3FB}-\u{1F3FF}]/gu;
  function cleanText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement?.closest('script,style,textarea,[contenteditable]')) return;
      const clean = node.nodeValue.replace(decorations, '');
      if (clean !== node.nodeValue) node.nodeValue = clean;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches('script,style,textarea,[contenteditable]')) return;
    node.childNodes.forEach(cleanText);
  }
  cleanText(document.body);
  new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === 'characterData') cleanText(record.target);
      else record.addedNodes.forEach(cleanText);
    });
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
})();
