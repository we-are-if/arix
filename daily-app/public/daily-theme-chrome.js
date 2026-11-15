(() => {
  const root = document.documentElement;
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (standalone && ios) root.dataset.iosStandalone = 'true';
  let saved;
  try { saved = localStorage.getItem('arix-daily-theme'); } catch {}
  if (!root.dataset.theme) root.dataset.theme = saved === 'dark' || saved === 'light'
    ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  function meta(name, content) {
    let element = document.querySelector(`meta[name="${name}"]`);
    if (!element) { element = document.createElement('meta'); element.name = name; document.head.appendChild(element); }
    if (element.content !== content) element.content = content;
  }
  function sync() {
    const dark = root.dataset.theme === 'dark';
    root.style.colorScheme = dark ? 'dark' : 'light';
    const pageColor = dark ? '#0f172a' : '#f5f7fb';
    root.style.backgroundColor = pageColor;
    meta('color-scheme', dark ? 'dark' : 'light');
    meta('theme-color', pageColor);
    meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  }
  sync();
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('pageshow', sync);
})();
