(function () {
  'use strict';
  // Independent, device-local UI only. Does not read or mutate invoice state.
  if (window.BBInvoiceBrowserBubbleLoaded) return;
  window.BBInvoiceBrowserBubbleLoaded = true;

  var KEY = 'bb_invoice_browser_workspace_v1';
  var DEFAULT_URL = 'https://web.telegram.org/';
  var config = {};
  try { config = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) {}
  var state = {
    url: typeof config.url === 'string' ? config.url : DEFAULT_URL,
    bookmarks: Array.isArray(config.bookmarks) ? config.bookmarks.filter(function (x) { return typeof x === 'string'; }).slice(0, 12) : [],
    panel: config.panel && typeof config.panel === 'object' ? config.panel : null,
    bubble: config.bubble && typeof config.bubble === 'object' ? config.bubble : null
  };
  var $ = function (id) { return document.getElementById(id); };
  var panel, bubble, frame, address, bookmarks, note;
  var pageLoaded = false;

  function validUrl(raw) {
    var value = String(raw || '').trim();
    if (!value) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      if (!url.hostname || url.username || url.password) return null;
      return url.href;
    } catch (_) { return null; }
  }

  function safeRememberUrl(url) {
    try {
      var parsed = new URL(url);
      // Do not persist token-bearing query strings, fragments or credentials.
      return parsed.origin + parsed.pathname;
    } catch (_) { return DEFAULT_URL; }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        url: safeRememberUrl(state.url),
        bookmarks: state.bookmarks,
        panel: state.panel,
        bubble: state.bubble
      }));
    } catch (_) { /* Storage disabled: browser still works for this page. */ }
  }

  function clamp(number, low, high) { return Math.min(Math.max(number, low), Math.max(low, high)); }

  function svg(path) {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  var ICON = {
    globe: svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    external: svg('<path d="M15 3h6v6M10 14 21 3M21 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7"/>'),
    refresh: svg('<path d="M20 11a8 8 0 1 0-2.5 6M20 4v7h-7"/>'),
    star: svg('<path d="m12 2 3.1 6.3 7 1-5.1 5 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5.1-5 7-1z"/>')
  };

  function button(label, icon, id) {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'bbw-button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = icon;
    return b;
  }

  function fitPanel() {
    if (!panel || panel.hidden) return;
    var r = panel.getBoundingClientRect();
    var minW = Math.min(300, window.innerWidth - 16);
    var maxW = Math.max(minW, window.innerWidth - 16);
    var maxH = Math.max(230, window.innerHeight - 16);
    var w = clamp(r.width, minW, maxW);
    var h = clamp(r.height, Math.min(260, maxH), maxH);
    panel.style.width = w + 'px';
    panel.style.height = h + 'px';
    panel.style.left = clamp(r.left, 8, window.innerWidth - w - 8) + 'px';
    panel.style.top = clamp(r.top, 8, window.innerHeight - h - 8) + 'px';
  }

  function rememberPanel() {
    if (!panel || panel.hidden) return;
    var r = panel.getBoundingClientRect();
    state.panel = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    save();
  }

  function setOpen(open) {
    if (!panel || !bubble) return;
    panel.hidden = !open;
    bubble.hidden = open;
    bubble.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!pageLoaded) navigate(state.url);
      fitPanel();
      rememberPanel();
    }
  }

  function navigate(raw) {
    var url = validUrl(raw);
    if (!url) {
      note.textContent = 'Enter a valid http:// or https:// website address.';
      address.focus();
      return;
    }
    state.url = url;
    address.value = url;
    note.textContent = 'If this site blocks embedded browsing or login, choose Open tab.';
    // Do not recreate the iframe on minimize/restore.
    if (!pageLoaded || frame.getAttribute('src') !== url) frame.setAttribute('src', url);
    pageLoaded = true;
    save();
  }

  function renderBookmarks() {
    if (!bookmarks) return;
    bookmarks.replaceChildren();
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Saved websites';
    bookmarks.appendChild(empty);
    state.bookmarks.forEach(function (url) {
      var option = document.createElement('option');
      option.value = url;
      try { option.textContent = new URL(url).hostname; } catch (_) { option.textContent = url; }
      bookmarks.appendChild(option);
    });
    bookmarks.value = '';
  }

  function startBubbleDrag() {
    var start = null;
    bubble.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      var r = bubble.getBoundingClientRect();
      start = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: r.left, top: r.top, moved: false };
      try { bubble.setPointerCapture(event.pointerId); } catch (_) {}
    });
    bubble.addEventListener('pointermove', function (event) {
      if (!start || event.pointerId !== start.pointer) return;
      var dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 7) start.moved = true;
      if (!start.moved) return;
      bubble.style.left = clamp(start.left + dx, 5, window.innerWidth - bubble.offsetWidth - 5) + 'px';
      bubble.style.top = clamp(start.top + dy, 5, window.innerHeight - bubble.offsetHeight - 5) + 'px';
      bubble.style.right = 'auto';
      event.preventDefault();
    });
    bubble.addEventListener('pointerup', function (event) {
      if (!start || event.pointerId !== start.pointer) return;
      if (start.moved) {
        var r = bubble.getBoundingClientRect();
        state.bubble = { x: Math.round(r.left), y: Math.round(r.top) };
        save();
        bubble.dataset.justDragged = '1';
      }
      start = null;
    });
    bubble.addEventListener('pointercancel', function () { start = null; });
    bubble.addEventListener('click', function (event) {
      if (bubble.dataset.justDragged === '1') {
        event.preventDefault();
        delete bubble.dataset.justDragged;
        return;
      }
      setOpen(true);
    });
  }

  function startPanelDrag(handle) {
    var start = null;
    handle.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      var r = panel.getBoundingClientRect();
      start = { id: event.pointerId, x: event.clientX, y: event.clientY, left: r.left, top: r.top };
      try { handle.setPointerCapture(event.pointerId); } catch (_) {}
      event.preventDefault();
    });
    handle.addEventListener('pointermove', function (event) {
      if (!start || event.pointerId !== start.id) return;
      panel.style.left = clamp(start.left + event.clientX - start.x, 8, window.innerWidth - panel.offsetWidth - 8) + 'px';
      panel.style.top = clamp(start.top + event.clientY - start.y, 8, window.innerHeight - panel.offsetHeight - 8) + 'px';
      event.preventDefault();
    });
    function finish(event) {
      if (!start || event.pointerId !== start.id) return;
      start = null;
      rememberPanel();
    }
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  function startResize(grip) {
    var start = null;
    grip.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      var r = panel.getBoundingClientRect();
      start = { id: event.pointerId, x: event.clientX, y: event.clientY, w: r.width, h: r.height, left: r.left, top: r.top };
      try { grip.setPointerCapture(event.pointerId); } catch (_) {}
      event.preventDefault();
    });
    grip.addEventListener('pointermove', function (event) {
      if (!start || event.pointerId !== start.id) return;
      var maxW = window.innerWidth - start.left - 8;
      var maxH = window.innerHeight - start.top - 8;
      panel.style.width = clamp(start.w + event.clientX - start.x, Math.min(300, maxW), maxW) + 'px';
      panel.style.height = clamp(start.h + event.clientY - start.y, Math.min(260, maxH), maxH) + 'px';
      event.preventDefault();
    });
    function finish(event) {
      if (!start || event.pointerId !== start.id) return;
      start = null;
      rememberPanel();
    }
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
  }

  function init() {
    if ($('bbInvoiceBrowserBubble') || !document.body) return;
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'invoice-browser-bubble-v1.css?v=20261122-1';
    document.head.appendChild(css);

    bubble = button('Open floating browser', ICON.globe, 'bbInvoiceBrowserBubble');
    bubble.className = 'bbw-bubble no-print';
    bubble.setAttribute('aria-controls', 'bbInvoiceBrowserPanel');
    bubble.setAttribute('aria-expanded', 'false');
    if (state.bubble && Number.isFinite(Number(state.bubble.x)) && Number.isFinite(Number(state.bubble.y))) {
      bubble.style.left = clamp(Number(state.bubble.x), 5, window.innerWidth - 58) + 'px';
      bubble.style.top = clamp(Number(state.bubble.y), 5, window.innerHeight - 58) + 'px';
      bubble.style.right = 'auto';
    }

    panel = document.createElement('section');
    panel.id = 'bbInvoiceBrowserPanel';
    panel.className = 'bbw-panel no-print';
    panel.setAttribute('aria-label', 'Floating browser workspace');
    panel.setAttribute('role', 'region');
    panel.hidden = true;

    var head = document.createElement('div');
    head.className = 'bbw-header';
    var drag = document.createElement('div');
    drag.className = 'bbw-drag';
    drag.innerHTML = ICON.globe + '<span>Browser Workspace</span><small>Drag to move</small>';
    var minimize = button('Minimize browser to bubble', ICON.minus, 'bbInvoiceBrowserMinimize');
    head.append(drag, minimize);

    var nav = document.createElement('form');
    nav.className = 'bbw-nav';
    address = document.createElement('input');
    address.id = 'bbInvoiceBrowserAddress';
    address.type = 'text';
    address.value = validUrl(state.url) || DEFAULT_URL;
    address.autocomplete = 'off';
    address.spellcheck = false;
    address.placeholder = 'Enter website URL';
    address.setAttribute('aria-label', 'Website address');
    var go = document.createElement('button');
    go.type = 'submit';
    go.textContent = 'Go';
    go.className = 'bbw-go';
    var refresh = button('Reload website', ICON.refresh, 'bbInvoiceBrowserRefresh');
    var external = button('Open website in normal browser tab', ICON.external, 'bbInvoiceBrowserExternal');
    nav.append(address, go, refresh, external);

    var tools = document.createElement('div');
    tools.className = 'bbw-tools';
    var telegram = document.createElement('button');
    telegram.type = 'button';
    telegram.textContent = 'Telegram Web';
    telegram.className = 'bbw-telegram';
    var bookmark = button('Save current website', ICON.star, 'bbInvoiceBrowserBookmark');
    bookmarks = document.createElement('select');
    bookmarks.id = 'bbInvoiceBrowserBookmarks';
    bookmarks.setAttribute('aria-label', 'Saved websites');
    tools.append(telegram, bookmark, bookmarks);

    frame = document.createElement('iframe');
    frame.id = 'bbInvoiceBrowserFrame';
    frame.title = 'External website';
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads');
    frame.setAttribute('loading', 'eager');

    note = document.createElement('div');
    note.className = 'bbw-note';
    note.textContent = 'Some websites block embedded browsing. If blank, use Open tab.';

    var grip = document.createElement('div');
    grip.className = 'bbw-grip';
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-label', 'Drag to resize browser');

    panel.append(head, nav, tools, frame, note, grip);
    document.body.append(bubble, panel);

    var minW = Math.min(360, window.innerWidth - 16);
    var panelW = clamp(Number(state.panel && state.panel.w) || 680, minW, window.innerWidth - 16);
    var panelH = clamp(Number(state.panel && state.panel.h) || 520, 260, window.innerHeight - 16);
    var left = Number.isFinite(Number(state.panel && state.panel.x)) && state.panel ? Number(state.panel.x) : window.innerWidth - panelW - 18;
    var top = Number.isFinite(Number(state.panel && state.panel.y)) && state.panel ? Number(state.panel.y) : 75;
    panel.style.width = panelW + 'px';
    panel.style.height = panelH + 'px';
    panel.style.left = clamp(left, 8, window.innerWidth - panelW - 8) + 'px';
    panel.style.top = clamp(top, 8, window.innerHeight - panelH - 8) + 'px';

    nav.addEventListener('submit', function (event) { event.preventDefault(); navigate(address.value); });
    refresh.addEventListener('click', function () {
      if (!pageLoaded) navigate(address.value);
      else { var url = frame.getAttribute('src'); frame.setAttribute('src', url); }
    });
    external.addEventListener('click', function () {
      var url = validUrl(address.value);
      if (!url) { note.textContent = 'Enter a valid website first.'; return; }
      // The normal browser profile manages logins; no passwords stored by BIG BROTHER.
      window.open(url, '_blank', 'noopener,noreferrer');
    });
    telegram.addEventListener('click', function () { navigate(DEFAULT_URL); });
    bookmark.addEventListener('click', function () {
      var url = safeRememberUrl(validUrl(address.value) || state.url);
      if (state.bookmarks.indexOf(url) !== -1) {
        state.bookmarks = state.bookmarks.filter(function (x) { return x !== url; });
        note.textContent = 'Website removed from saved websites.';
      } else {
        state.bookmarks.unshift(url);
        state.bookmarks = state.bookmarks.slice(0, 12);
        note.textContent = 'Website saved on this device.';
      }
      renderBookmarks();
      save();
    });
    bookmarks.addEventListener('change', function () { if (bookmarks.value) navigate(bookmarks.value); });
    minimize.addEventListener('click', function () { setOpen(false); });
    startBubbleDrag();
    startPanelDrag(drag);
    startResize(grip);
    renderBookmarks();

    window.addEventListener('resize', function () {
      if (!panel.hidden) { fitPanel(); rememberPanel(); }
      var r = bubble.getBoundingClientRect();
      if (r.right > innerWidth || r.bottom > innerHeight) {
        bubble.style.left = clamp(r.left, 5, innerWidth - bubble.offsetWidth - 5) + 'px';
        bubble.style.top = clamp(r.top, 5, innerHeight - bubble.offsetHeight - 5) + 'px';
        bubble.style.right = 'auto';
      }
    });
    window.BBInvoiceBrowserBubble = { show: function () { setOpen(true); }, hide: function () { setOpen(false); } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();