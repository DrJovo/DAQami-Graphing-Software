/* =============================================================================
 * main.js — Boots ThermoScope and wires the UI to every module. This is the
 * only file that touches the DOM.
 * ============================================================================= */
(function (TS) {
  'use strict';
  var Parser = TS.Parser, DataModel = TS.DataModel, Analysis = TS.Analysis,
      Organizer = TS.Organizer, Renderer = TS.Renderer, Theme = TS.Theme, Icons = TS.Icons;

  var store = new TS.Store();
  var view = null;             // ChartView
  var els = {};
  var currentTab = 'chart';
  var rawPage = 0, rawTrialId = null;
  var selection = {};        // series id -> true (transient chart selection, not saved)
  var selectionKey = null;   // the graphKey the current selection belongs to
  function hasSelection() { for (var k in selection) if (selection[k]) return true; return false; }
  function selectedIds() { return Object.keys(selection).filter(function (k) { return selection[k]; }); }
  function clearSelection() { selection = {}; if (view) view.render(); updateStatusCounts(); }

  function onSeriesClick(id, mods) {
    if (mods && mods.ctrl) { if (id) { if (selection[id]) delete selection[id]; else selection[id] = true; } }
    else { selection = {}; if (id) selection[id] = true; }
    selectionKey = store.graphKey();
    if (view) view.render();
    updateStatusCounts();
  }
  function updateStatusCounts() {
    if (noData()) { els.sbCount.textContent = ''; return; }
    var n = selectedIds().length;
    els.sbCount.textContent = n ? (n + ' selected · right-click for actions') : (graphSeries().length + ' series');
  }
  var _floatMenu = null;
  function showFloatingMenu(x, y, items) {
    closeFloatingMenu();
    var menu = el('div', { class: 'menu-dropdown ctx-menu' });
    items.forEach(function (it) {
      if (it.sep) { menu.appendChild(el('div', { class: 'menu-sep' })); return; }
      var row = el('button', { class: 'menu-row' + (it.danger ? ' danger' : '') }, [
        el('span', { class: 'check', html: it.icon || '' }), el('span', { text: it.label }),
      ]);
      row.addEventListener('click', function (e) { e.stopPropagation(); closeFloatingMenu(); it.action(); });
      menu.appendChild(row);
    });
    document.body.appendChild(menu);
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.max(6, Math.min(x, window.innerWidth - mw - 8)) + 'px';
    menu.style.top = Math.max(6, Math.min(y, window.innerHeight - mh - 8)) + 'px';
    _floatMenu = menu;
    setTimeout(function () { document.addEventListener('mousedown', _floatOutside); document.addEventListener('keydown', _escFloat); }, 0);
  }
  function closeFloatingMenu() {
    if (!_floatMenu) return;
    _floatMenu.remove(); _floatMenu = null;
    document.removeEventListener('mousedown', _floatOutside); document.removeEventListener('keydown', _escFloat);
  }
  function _floatOutside(e) { if (_floatMenu && !_floatMenu.contains(e.target)) closeFloatingMenu(); }
  function _escFloat(e) { if (e.key === 'Escape') closeFloatingMenu(); }

  function onChartContextMenu(clientX, clientY, hitId) {
    // right-clicking a series with nothing selected selects it first
    if (!hasSelection() && hitId) { selection = {}; selection[hitId] = true; selectionKey = store.graphKey(); if (view) view.render(); updateStatusCounts(); }
    if (!hasSelection()) return;
    var ids = selectedIds();
    var isCustom = store.state.graphMode === 'COMPARE_EXP';
    var items = [
      { label: 'Average of selected', icon: Icons.avg, action: function () { addStat('mean', ids); openTool('aggregate'); } },
      { label: 'Median of selected', action: function () { addStat('median', ids); openTool('aggregate'); } },
      { label: 'Std dev of selected', action: function () { addStat('stddev', ids); openTool('aggregate'); } },
      { sep: 1 },
      { label: isCustom ? 'Remove selected from graph' : 'Hide selected', icon: Icons.eyeOff, action: function () { setSelectionVisibility('off'); } },
    ];
    if (!isCustom) {
      items.push({ label: 'Dim selected', icon: Icons.eyeDim, action: function () { setSelectionVisibility('dim'); } });
      items.push({ label: 'Show all series', icon: Icons.eye, action: function () { showAllSeries(); } });
    }
    items.push({ sep: 1 });
    items.push({ label: 'Clear selection', action: function () { clearSelection(); } });
    showFloatingMenu(clientX, clientY, items);
  }
  function setSelectionVisibility(vis) {
    var ids = selectedIds();
    if (store.state.graphMode === 'COMPARE_EXP') {
      if (vis === 'off') {
        var keys = ids.map(function (id) { return id.replace(/^CUST_/, ''); });
        customState().selected = customState().selected.filter(function (k) { return keys.indexOf(k) < 0; });
      }
    } else {
      ids.forEach(function (id) { store.style(id).visibility = vis; });
    }
    selection = {};
    store.commit('vis-selection');
  }
  function showAllSeries() { store.currentDatasetIds().forEach(function (id) { store.style(id).visibility = 'on'; }); store.commit('show-all'); }

  /* ---- app-level preferences (persisted on this computer, separate from the
   * workspace/undo/session) ---- */
  var PREF_DEFAULTS = { accent: 'blue', density: 'comfortable', tempUnit: 'source', exportUnit: 'source', decimals: 3, confirmClose: true };
  var Prefs = {
    data: Object.assign({}, PREF_DEFAULTS),
    load: function () { try { var s = localStorage.getItem('thermoscope.prefs'); if (s) Object.assign(this.data, JSON.parse(s)); } catch (e) {} },
    save: function () { try { localStorage.setItem('thermoscope.prefs', JSON.stringify(this.data)); } catch (e) {} },
    set: function (k, v) { this.data[k] = v; this.save(); },
    reset: function () { this.data = Object.assign({}, PREF_DEFAULTS); this.save(); },
  };
  var ACCENTS = {
    blue:   { name: 'Blue',   light: '#2f6feb', dark: '#4f8cff' },
    indigo: { name: 'Indigo', light: '#5145d6', dark: '#8b83f0' },
    teal:   { name: 'Teal',   light: '#0f9488', dark: '#2dd4bf' },
    amber:  { name: 'Amber',  light: '#c2760a', dark: '#eaa63c' },
    rose:   { name: 'Rose',   light: '#d6336c', dark: '#f2749f' },
  };
  function applyAppearance() {
    var theme = store.state.theme;
    var a = ACCENTS[Prefs.data.accent] || ACCENTS.blue;
    var base = a[theme], rgb = hexToRgb(base) || { r: 47, g: 111, b: 235 };
    var root = document.documentElement.style;
    root.setProperty('--accent', base);
    root.setProperty('--accent-weak', 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + (theme === 'dark' ? 0.20 : 0.12) + ')');
    root.setProperty('--accent-text', base);
    document.documentElement.setAttribute('data-density', Prefs.data.density);
  }

  /* ---- temperature unit conversion (display + analysis; raw viewer too) ---- */
  function detectSourceTempUnit() {
    var set = {};
    store.data.experiments.forEach(function (exp) { exp.trials.forEach(function (tr) { tr.channels.forEach(function (ch) {
      var u = (ch.unit || '').replace(/°/g, '').trim().toUpperCase();
      if (u) set[u] = 1;
    }); }); });
    var keys = Object.keys(set);
    return (keys.length === 1 && (keys[0] === 'C' || keys[0] === 'F')) ? keys[0] : null;
  }
  function effectiveUnit(pref, src) { if (!src) return null; return pref === 'source' ? src : pref; }
  function conversionFor(pref) {
    var src = detectSourceTempUnit();
    if (!src) return null;
    var target = pref === 'source' ? src : pref;
    if (target === src) return null;
    return { src: src, target: target };
  }
  function activeConversion() { return conversionFor(Prefs.data.tempUnit); }
  function convTemp(v, from, to) { if (isNaN(v) || from === to) return v; return from === 'C' ? v * 9 / 5 + 32 : (v - 32) * 5 / 9; }
  /* When the display unit changes, convert stored temperature annotations so they
   * keep pointing at the same physical temperature (points, horizontal lines,
   * thresholds — never times/vertical lines/cursors). */
  function convertAllAnnotations(from, to) {
    var graphs = store.state.graphs || {};
    Object.keys(graphs).forEach(function (k) {
      var g = graphs[k];
      (g.manualPoints || []).forEach(function (p) { p.y = convTemp(p.y, from, to); });
      (g.manualLines || []).forEach(function (l) { if (l.axis === 'y') l.value = convTemp(l.value, from, to); });
      if (g.threshold) g.threshold.level = convTemp(g.threshold.level, from, to);
    });
  }
  function convYs(ys) {
    var c = activeConversion(); if (!c) return ys;
    var out = new Float64Array(ys.length);
    for (var i = 0; i < ys.length; i++) out[i] = convTemp(ys[i], c.src, c.target);
    return out;
  }
  function displayUnit(rawUnit) { var c = activeConversion(); return c ? '°' + c.target : (rawUnit || ''); }
  function currentUnit() {
    var c = activeConversion(); if (c) return '°' + c.target;
    var s = seriesForCurrentGraph(); for (var i = 0; i < s.length; i++) if (s[i].unit) return s[i].unit;
    return '';
  }
  function fmtT(n) { return fmt(n, Prefs.data.decimals); }

  /* ------------------------------ helpers -------------------------------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'style') e.setAttribute('style', attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function fmt(n, dp) { if (n == null || isNaN(n)) return '–'; return Number(n).toFixed(dp == null ? 3 : dp); }
  function clearNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  var toastTimer;
  function toast(msg) {
    var host = els.toastHost; clearNode(host);
    var t = el('div', { class: 'toast', text: msg }); host.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); setTimeout(function () { clearNode(host); }, 250); }, 2600);
  }

  /* ------------------------------- modal --------------------------------- */
  function modal(opts) {
    var ov = els.overlay; clearNode(ov);
    var box = el('div', { class: 'modal' + (opts.wide ? ' wide' : '') });
    var head = el('div', { class: 'modal-head' }, [
      el('h3', { text: opts.title }),
      el('button', { class: 'btn ghost icon x', html: Icons.x, onclick: close }),
    ]);
    var body = el('div', { class: 'modal-body' });
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else body.appendChild(opts.body);
    var foot = el('div', { class: 'modal-foot' });
    (opts.actions || []).forEach(function (a) {
      foot.appendChild(el('button', {
        class: 'btn' + (a.primary ? ' primary' : ''), text: a.label,
        onclick: function () { if (!a.onClick || a.onClick() !== false) close(); },
      }));
    });
    box.appendChild(head); box.appendChild(body); if (foot.childNodes.length) box.appendChild(foot);
    ov.appendChild(box); ov.classList.add('on');
    function close() { ov.classList.remove('on'); clearNode(ov); }
    ov.onclick = function (e) { if (e.target === ov) close(); };
    return { close: close, body: body };
  }

  /* --------------------------- custom controls --------------------------- */
  function checkbox(label, checked, onchange) {
    var input = el('input', { type: 'checkbox' });
    input.checked = !!checked;
    input.addEventListener('change', function () { onchange(input.checked); });
    return el('label', { class: 'chk' }, [input, el('span', { class: 'box', html: Icons.check }), el('span', { text: label })]);
  }
  function segmented(options, value, onchange) {
    var wrap = el('div', { class: 'segmented' });
    var cur = value;
    options.forEach(function (o) {
      wrap.appendChild(el('button', {
        class: o.value === cur ? 'on' : '', text: o.label, title: o.title || '',
        onclick: function () {
          cur = o.value;
          Array.prototype.forEach.call(wrap.children, function (c, i) { c.classList.toggle('on', options[i].value === cur); });
          onchange(o.value);
        },
      }));
    });
    return wrap;
  }
  function selectBox(options, value, onchange) {
    var sel = el('select', { class: 'input' });
    options.forEach(function (o) {
      var opt = el('option', { value: o.value, text: o.label });
      if (String(o.value) === String(value)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () { onchange(sel.value); });
    return el('div', { class: 'select-wrap' }, sel);
  }
  /* ---- color math ---- */
  function hexToRgb(hex) {
    hex = String(hex || '').replace('#', '').trim();
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    var n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (x) { return ('0' + Math.max(0, Math.min(255, Math.round(x))).toString(16)).slice(-2); }).join('');
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h: h, s: mx ? d / mx : 0, v: mx };
  }
  function hsvToRgb(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r, g, b;
    if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  var PRESETS = Theme.SERIES.light.concat(['#000000', '#404040', '#808080', '#b0b0b0', '#ffffff',
    '#c0392b', '#16a085', '#2980b9', '#8e44ad', '#f39c12']);

  var openColorPop = null;
  function openColorPicker(anchor, current, cb) {
    closeColorPop();
    var rgb = hexToRgb(current) || { r: 57, g: 135, b: 229 };
    var hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    var startHex = rgbToHex(rgb.r, rgb.g, rgb.b);

    var pop = el('div', { class: 'color-pop' });
    var sv = el('div', { class: 'cp-sv' });
    var svThumb = el('div', { class: 'cp-sv-thumb' });
    sv.appendChild(svThumb);
    var hue = el('div', { class: 'cp-hue' });
    var hueThumb = el('div', { class: 'cp-hue-thumb' });
    hue.appendChild(hueThumb);
    var presets = el('div', { class: 'cp-presets' });
    var preview = el('div', { class: 'cp-preview' });
    var hexIn = el('input', { class: 'input mono cp-hex', value: startHex.toUpperCase() });
    var rIn = el('input', { class: 'input mono cp-rgb', type: 'number', min: '0', max: '255' });
    var gIn = el('input', { class: 'input mono cp-rgb', type: 'number', min: '0', max: '255' });
    var bIn = el('input', { class: 'input mono cp-rgb', type: 'number', min: '0', max: '255' });

    PRESETS.forEach(function (hex) {
      var b = el('button', { class: 'cp-preset', style: 'background:' + hex, title: hex });
      b.addEventListener('click', function () { var c = hexToRgb(hex); hsv = rgbToHsv(c.r, c.g, c.b); paint(true); });
      presets.appendChild(b);
    });

    pop.appendChild(sv); pop.appendChild(hue); pop.appendChild(presets);
    pop.appendChild(el('div', { class: 'cp-fields' }, [preview, hexIn]));
    pop.appendChild(el('div', { class: 'cp-fields' }, [
      el('div', { class: 'cp-cap', text: 'R' }), rIn, el('div', { class: 'cp-cap', text: 'G' }), gIn, el('div', { class: 'cp-cap', text: 'B' }), bIn,
    ]));
    document.body.appendChild(pop);

    // position near anchor, clamped to viewport
    var ar = anchor.getBoundingClientRect();
    var pw = 238, ph = pop.offsetHeight || 320;
    var left = Math.min(ar.left, window.innerWidth - pw - 8);
    var top = ar.bottom + 6; if (top + ph > window.innerHeight - 8) top = Math.max(8, ar.top - ph - 6);
    pop.style.left = Math.max(8, left) + 'px'; pop.style.top = top + 'px';

    function curHex() { var c = hsvToRgb(hsv.h, hsv.s, hsv.v); return rgbToHex(c.r, c.g, c.b); }
    function paint(emit) {
      var c = hsvToRgb(hsv.h, hsv.s, hsv.v), hex = rgbToHex(c.r, c.g, c.b);
      sv.style.background = 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(' + hsv.h + ',100%,50%)';
      svThumb.style.left = (hsv.s * 100) + '%'; svThumb.style.top = ((1 - hsv.v) * 100) + '%';
      hueThumb.style.left = (hsv.h / 360 * 100) + '%';
      preview.style.background = hex;
      if (document.activeElement !== hexIn) hexIn.value = hex.toUpperCase();
      if (document.activeElement !== rIn) rIn.value = Math.round(c.r);
      if (document.activeElement !== gIn) gIn.value = Math.round(c.g);
      if (document.activeElement !== bIn) bIn.value = Math.round(c.b);
      if (emit) cb(hex, false);
    }

    function dragSV(e) {
      var r = sv.getBoundingClientRect();
      hsv.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      hsv.v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      paint(true);
    }
    function dragHue(e) {
      var r = hue.getBoundingClientRect();
      hsv.h = Math.max(0, Math.min(360, (e.clientX - r.left) / r.width * 360));
      paint(true);
    }
    bindDrag(sv, dragSV); bindDrag(hue, dragHue);

    hexIn.addEventListener('input', function () {
      var c = hexToRgb(hexIn.value); if (c) { hsv = rgbToHsv(c.r, c.g, c.b); paint(false); cb(rgbToHex(c.r, c.g, c.b), false); }
    });
    function rgbEdit() {
      var c = { r: +rIn.value, g: +gIn.value, b: +bIn.value };
      if ([c.r, c.g, c.b].every(function (x) { return x >= 0 && x <= 255; })) { hsv = rgbToHsv(c.r, c.g, c.b); paint(false); cb(rgbToHex(c.r, c.g, c.b), false); }
    }
    [rIn, gIn, bIn].forEach(function (i) { i.addEventListener('input', rgbEdit); });

    paint(false);

    openColorPop = { el: pop, commit: function () { cb(curHex(), true); } };
    // close on outside click / Esc
    setTimeout(function () { document.addEventListener('mousedown', outside); document.addEventListener('keydown', onEsc); }, 0);
    function outside(e) { if (!pop.contains(e.target) && e.target !== anchor) closeColorPop(); }
    function onEsc(e) { if (e.key === 'Escape') closeColorPop(); }
    pop._cleanup = function () { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', onEsc); };
  }
  function closeColorPop() {
    if (!openColorPop) return;
    var o = openColorPop; openColorPop = null;
    o.commit();
    if (o.el._cleanup) o.el._cleanup();
    o.el.remove();
  }
  function bindDrag(elm, onMove) {
    elm.addEventListener('mousedown', function (e) {
      e.preventDefault(); onMove(e);
      function mv(ev) { onMove(ev); }
      function up() { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
  }

  /* ============================ MENU BAR ================================= */
  var menuOpen = null;
  function buildMenus() {
    var spec = [
      { name: 'File', items: [
        { label: 'Open Data Folder…', key: 'Ctrl+O', action: openFolder },
        { label: 'Organize & Export CSV…', action: organizeDialog, disabled: noData },
        { sep: 1 },
        { label: 'Save Session…', action: saveSessionDialog, disabled: noData },
        { label: 'Load Session…', action: loadSession },
        { sep: 1 },
        { label: 'Export Graph as PNG…', action: exportPngDialog, disabled: noData },
        { label: 'Export Graph as SVG', action: exportSvg, disabled: noData },
      ] },
      { name: 'Edit', items: [
        { label: 'Undo', key: 'Ctrl+Z', action: function () { store.undo(); }, disabled: function () { return !store.canUndo(); } },
        { label: 'Redo', key: 'Ctrl+Y', action: function () { store.redo(); }, disabled: function () { return !store.canRedo(); } },
        { sep: 1 },
        { label: 'Clear Analysis on This Graph', action: clearAnalysis, disabled: noData },
        { label: 'Reset Trial Window', action: resetTrialWindow, disabled: noData },
      ] },
      { name: 'View', items: [
        { label: 'Graph', action: function () { setTab('chart'); }, checked: function () { return currentTab === 'chart'; } },
        { label: 'Raw Data', action: function () { setTab('raw'); }, checked: function () { return currentTab === 'raw'; } },
        { label: 'Details', action: function () { setTab('details'); }, checked: function () { return currentTab === 'details'; } },
        { sep: 1 },
        { label: 'Data Panel', action: function () { togglePanel('left'); }, checked: function () { return !els.panelLeft.classList.contains('collapsed'); } },
        { label: 'Analysis Panel', action: function () { togglePanel('right'); }, checked: function () { return !els.panelRight.classList.contains('collapsed'); } },
        { sep: 1 },
        { label: 'Major Gridlines', action: function () { store.state.showGrid.major = !store.state.showGrid.major; store.commit('grid'); }, checked: function () { return store.state.showGrid.major; } },
        { label: 'Minor Gridlines', action: function () { store.state.showGrid.minor = !store.state.showGrid.minor; store.commit('grid'); }, checked: function () { return store.state.showGrid.minor; } },
        { label: 'Legend', action: function () { store.state.legend = !store.state.legend; store.commit('legend'); }, checked: function () { return store.state.legend; } },
        { sep: 1 },
        { label: 'Fit All Data', action: function () { view && view.fitAll(); }, disabled: noData },
        { label: 'Fit Trial Window', action: function () { view && view.fitTrial(); }, disabled: noData },
        { label: 'Set Axis Bounds…', action: setBoundsDialog, disabled: noData },
      ] },
      { name: 'Analysis', items: [
        { label: 'Add Average of Graphed Data', action: function () { addStat('mean', graphSeries().map(function (m) { return m.id; })); openTool('aggregate'); }, disabled: noData },
        { label: 'Manual Plotting…', action: function () { openTool('manual'); }, disabled: noData },
        { label: 'Dual-Cursor Measure', action: function () { openTool('cursor'); }, disabled: noData },
        { label: 'Threshold Crossing…', action: function () { openTool('threshold'); }, disabled: noData },
        { sep: 1 },
        { label: 'Clear All Analysis (This Graph)', action: clearAnalysis, disabled: noData },
      ] },
      { name: 'Settings', items: [
        { label: 'Preferences…', key: 'Ctrl+,', action: preferencesDialog },
        { label: 'File Name Pattern…', action: filenamePatternDialog },
        { sep: 1 },
        { label: 'Dark Theme', action: function () { setTheme('dark'); }, checked: function () { return store.state.theme === 'dark'; } },
        { label: 'Light Theme', action: function () { setTheme('light'); }, checked: function () { return store.state.theme === 'light'; } },
        { sep: 1 },
        { label: 'Line Plot', action: function () { setPlotType('line'); }, checked: function () { return store.state.plotType === 'line'; } },
        { label: 'Scatter Plot', action: function () { setPlotType('scatter'); }, checked: function () { return store.state.plotType === 'scatter'; } },
      ] },
      { name: 'Help', items: [
        { label: 'About ThermoScope', action: aboutDialog },
        { label: 'DAQami Format Notes', action: formatDialog },
        { label: 'Keyboard Shortcuts', action: shortcutsDialog },
      ] },
    ];
    var host = els.menus; clearNode(host);
    spec.forEach(function (m) {
      var item = el('div', { class: 'menu-item' });
      var btn = el('button', { class: 'menu-btn', text: m.name });
      var drop = el('div', { class: 'menu-dropdown' });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (menuOpen === item) { closeMenus(); return; }
        closeMenus(); openMenu(item, m, drop);
      });
      btn.addEventListener('mouseenter', function () { if (menuOpen && menuOpen !== item) { closeMenus(); openMenu(item, m, drop); } });
      item.appendChild(btn); item.appendChild(drop); host.appendChild(item);
      item._spec = m; item._drop = drop;
    });
    document.addEventListener('click', closeMenus);
  }
  function openMenu(item, m, drop) {
    clearNode(drop);
    m.items.forEach(function (it) {
      if (it.sep) { drop.appendChild(el('div', { class: 'menu-sep' })); return; }
      var disabled = it.disabled && it.disabled();
      var checked = it.checked && it.checked();
      var row = el('button', { class: 'menu-row' + (disabled ? ' disabled' : '') }, [
        el('span', { class: 'check', html: checked ? Icons.check : '' }),
        el('span', { text: it.label }),
        it.key ? el('span', { class: 'key', text: it.key }) : null,
      ]);
      row.addEventListener('click', function (e) { e.stopPropagation(); if (disabled) return; closeMenus(); it.action(); });
      drop.appendChild(row);
    });
    item.classList.add('open'); menuOpen = item;
  }
  function closeMenus() { if (menuOpen) { menuOpen.classList.remove('open'); menuOpen = null; } }
  function noData() { return store.data.experiments.length === 0; }

  /* ============================ SCENE BUILDING =========================== */
  function chartColors() { return Theme.chart(store.state.theme); }
  function accentHex() { return store.state.theme === 'dark' ? '#5f9bff' : '#2f6feb'; }
  function avgHex() { return store.state.theme === 'dark' ? '#f4f6fa' : '#0e1116'; }

  /* Meta for every plottable series in the current graph (raw values, no
   * smoothing). This is the single list every analysis tool and the chart draw
   * from, so Compare Experiments behaves exactly like the other modes. */
  function graphSeries() {
    var s = store.state;
    if (s.graphMode === 'COMPARE_EXP') return customSeries();
    return store.currentDatasetIds().map(function (id) {
      var d = DataModel.resolveDatasetData(store.data.experiments, id);
      if (!d) return null;
      var st = store.style(id);
      return { id: id, xs: d.xs, rawYs: convYs(d.ys), unit: displayUnit(d.unit), color: store.resolveColor(id),
        shape: st.shape, visibility: st.visibility,
        label: DataModel.datasetLabelForMode(store.data.experiments, id, s.graphMode) };
    }).filter(Boolean);
  }
  function graphMetaMap() { var m = {}; graphSeries().forEach(function (x) { m[x.id] = x; }); return m; }

  /* Smoothing is expensive and graphSeries() runs several times per render, so
   * cache the Savitzky/Gaussian result by (id, strength, unit, length). Cleared
   * whenever new data is loaded. */
  var _smoothCache = {};
  function clearCaches() { _smoothCache = {}; }
  function smoothedYs(id, rawYs, strength) {
    var key = id + '|' + strength + '|' + Prefs.data.tempUnit + '|' + rawYs.length;
    if (_smoothCache[key]) return _smoothCache[key];
    var out = Analysis.gaussianSmooth(rawYs, strength);
    _smoothCache[key] = out;
    return out;
  }

  /* What the chart draws: graphSeries + per-series smoothing + plot styling. */
  function seriesForCurrentGraph() {
    var s = store.state, g = store.graph();
    return graphSeries().map(function (m) {
      var ys = m.rawYs, sm = g.smooth[m.id];
      if (sm && sm.on) ys = smoothedYs(m.id, m.rawYs, sm.strength);
      return { id: m.id, xs: m.xs, ys: ys, rawYs: m.rawYs, unit: m.unit, color: m.color,
        shape: m.shape, visibility: m.visibility, plotType: s.plotType,
        lineWidth: s.lineWidth, markerSize: s.markerSize, label: m.label };
    });
  }

  /* ---- Custom overlay mode: the user hand-picks any datasets to graph.
   * An item key is either a raw dataset 'R|E{e}|T{t}|{sensor}' or a per-experiment
   * sensor average 'A|E{e}|{sensor}'. ---- */
  function allSensorNames() {
    var names = [];
    store.data.experiments.forEach(function (exp) {
      exp.channelNames.forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    });
    return names;
  }
  function customState() {
    var s = store.state;
    if (!s.custom) s.custom = { selected: null };
    if (s.custom.selected == null) { var first = allSensorNames()[0]; s.custom.selected = first ? rawKeysForSensor(first) : []; }
    return s.custom;
  }
  function allRawKeys() {
    var keys = [];
    store.data.experiments.forEach(function (exp) {
      exp.trials.forEach(function (tr) { tr.channels.forEach(function (ch) { keys.push('R|E' + exp.number + '|T' + tr.trial + '|' + ch.name); }); });
    });
    return keys;
  }
  function rawKeysForSensor(sensor) { return allRawKeys().filter(function (k) { return k.split('|')[3] === sensor; }); }
  function allAvgKeys() {
    var keys = [];
    store.data.experiments.forEach(function (exp) { exp.channelNames.forEach(function (n) { keys.push('A|E' + exp.number + '|' + n); }); });
    return keys;
  }
  function customResolve(key) {
    var p = key.split('|');
    if (p[0] === 'R') {
      var e = +p[1].slice(1), t = +p[2].slice(1), sensor = p[3];
      var d = DataModel.resolveDatasetData(store.data.experiments, DataModel.datasetId(e, t, sensor));
      return d ? { xs: d.xs, ys: d.ys, unit: d.unit, label: 'E' + e + 'T' + t + ' · ' + sensor } : null;
    }
    var ea = +p[1].slice(1), sen = p[2];
    var exp = DataModel.findExperiment(store.data.experiments, ea); if (!exp) return null;
    var arr = [], unit = '';
    exp.trials.forEach(function (tr) {
      var dd = DataModel.resolveDatasetData(store.data.experiments, DataModel.datasetId(ea, tr.trial, sen));
      if (dd) { arr.push({ xs: dd.xs, ys: dd.ys }); if (!unit) unit = dd.unit; }
    });
    if (!arr.length) return null;
    var avg = Analysis.averageSeries(arr);
    return { xs: avg.xs, ys: avg.ys, unit: unit, label: 'E' + ea + ' avg · ' + sen };
  }
  function customSeries() {
    var s = store.state, out = [], idx = 0;
    customState().selected.forEach(function (key) {
      var d = customResolve(key); if (!d) return;
      out.push({ id: 'CUST_' + key, xs: d.xs, rawYs: convYs(d.ys), unit: displayUnit(d.unit),
        color: Theme.seriesColor(s.theme, idx++), shape: 'circle', visibility: 'on', label: d.label });
    });
    return out;
  }
  function setCustomSelected(keys) { customState().selected = keys.slice(); store.commit('custom'); }
  function toggleCustom(key, on) {
    var sel = customState().selected.slice(), i = sel.indexOf(key);
    if (on && i < 0) sel.push(key); else if (!on && i >= 0) sel.splice(i, 1);
    customState().selected = sel; store.commit('custom');
  }
  /* Toggle a whole group: if every key is already selected, remove them all;
   * otherwise add the missing ones (so groups stack, e.g. AI0 + AI1). */
  function toggleGroup(keys) {
    var sel = customState().selected.slice(), set = {};
    sel.forEach(function (k) { set[k] = 1; });
    var allOn = keys.length > 0 && keys.every(function (k) { return set[k]; });
    if (allOn) sel = sel.filter(function (k) { return keys.indexOf(k) < 0; });
    else keys.forEach(function (k) { if (!set[k]) sel.push(k); });
    setCustomSelected(sel);
  }

  function trialTimingForCurrent() {
    if (store.state.graphMode === 'COMPARE_EXP' || store.state.currentExperiment == null) return null;
    return store.trialTiming(store.state.currentExperiment);
  }
  function trialWindow() {
    var t = trialTimingForCurrent();
    if (!t || !(t.duration > 0)) return null;
    return { x0: t.offset, x1: t.offset + t.duration };
  }
  function computeBoundaries() {
    var t = trialTimingForCurrent();
    if (!t || !(t.duration > 0)) return [];
    return [{ x: t.offset }, { x: t.offset + t.duration }];
  }

  function fullExtent(d) { return [d.xs[0], d.xs[d.xs.length - 1]]; }
  function resolveDomain(d, dom) {
    if (!dom || dom.kind === 'full') return fullExtent(d);
    if (dom.kind === 'trial') { var tw = trialWindow(); return tw ? [tw.x0, tw.x1] : fullExtent(d); }
    if (dom.kind === 'view' && view) { var v = view.getView(); return [v.xMin, v.xMax]; }
    if (dom.kind === 'manual' && dom.xMin != null && dom.xMax != null) return [Math.min(dom.xMin, dom.xMax), Math.max(dom.xMin, dom.xMax)];
    return fullExtent(d);
  }
  function domainLabel(dom) {
    return dom.kind === 'trial' ? 'trial window' : dom.kind === 'view' ? 'visible range'
      : dom.kind === 'manual' ? 'manual range' : 'full range';
  }

  function computeOverlays(series, g) {
    var T = chartColors();
    var ov = { averageLines: [], bestFit: [], minmax: [], areas: [], manualPoints: [], manualLines: [], cursors: [], thresholds: [] };
    var visible = series.filter(function (s) { return s.visibility !== 'off' && s.xs && s.xs.length; });

    (g.stats || []).forEach(function (stat) {
      var chosen = stat.datasetIds && stat.datasetIds.length
        ? series.filter(function (s) { return stat.datasetIds.indexOf(s.id) >= 0 && s.visibility !== 'off' && s.xs && s.xs.length; })
        : visible;
      if (!chosen.length) return;
      var agg = Analysis.aggregateSeries(chosen.map(function (s) { return { xs: s.xs, ys: s.ys }; }), stat.kind);
      ov.averageLines.push({ xs: agg.xs, ys: agg.ys, color: stat.color, label: statLabel(stat, chosen.length),
        id: stat.id, dash: stat.kind === 'stddev' ? [6, 4] : (stat.kind === 'mode' ? [2, 3] : []) });
    });
    var meta = graphMetaMap();
    g.bestFit.forEach(function (id) {
      var m = meta[id]; if (!m) return;
      var r = resolveDomain(m, g.bestFitDomain);
      var sl = Analysis.sliceXY(m.xs, m.rawYs, r[0], r[1]);
      var reg = Analysis.linearRegression(sl.xs, sl.ys); if (!reg) return;
      var ext = fullExtent(m);
      ov.bestFit.push({ slope: reg.slope, intercept: reg.intercept, r2: reg.r2,
        fitMin: r[0], fitMax: r[1], drawMin: ext[0], drawMax: ext[1], color: m.color, id: id });
    });
    g.minmax.forEach(function (id) {
      var m = meta[id]; if (!m) return;
      var r = resolveDomain(m, g.minmaxDomain);
      var sl = Analysis.sliceXY(m.xs, m.rawYs, r[0], r[1]);
      var st = Analysis.seriesStats(sl.xs, sl.ys); if (!st) return;
      ov.minmax.push({ x: st.argMinX, y: st.min, kind: 'min', color: m.color });
      ov.minmax.push({ x: st.argMaxX, y: st.max, kind: 'max', color: m.color });
    });
    g.areas.forEach(function (id) {
      var m = meta[id]; if (!m) return;
      var r = resolveDomain(m, g.areaDomain);
      ov.areas.push({ xs: m.xs, ys: m.rawYs, xMin: r[0], xMax: r[1], color: m.color });
    });
    ov.manualPoints = g.manualPoints.map(function (p) {
      return { id: p.id, x: p.x, y: p.y, color: p.color,
        label: p.showLabel === false ? null : (p.customLabel || ('(' + p.x.toFixed(2) + ', ' + p.y.toFixed(2) + ')')) };
    });
    ov.manualLines = g.manualLines.map(function (l) {
      return { id: l.id, axis: l.axis, value: l.value, color: l.color, style: l.style,
        label: l.showLabel === false ? null : (l.label || null) };
    });
    ov.cursors = g.cursors.map(function (x) { return { x: x, color: accentHex() }; });
    if (g.threshold) {
      var crossings = [];
      visible.forEach(function (s) { crossings = crossings.concat(Analysis.thresholdCrossings(s.xs, s.ys, g.threshold.level)); });
      ov.thresholds.push({ level: g.threshold.level, color: store.state.theme === 'dark' ? '#e0a94a' : '#c07f12', crossings: crossings });
    }
    return ov;
  }

  /* ---- statistics overlays (mean/median/mode/std-dev lines) ---- */
  var STAT_NAMES = { mean: 'Mean', median: 'Median', mode: 'Mode', stddev: 'Std Dev' };
  // Vivid mid-tones that stay legible on both light and dark surfaces, so a stat
  // line never disappears when the theme is switched after it was created.
  var STAT_COLORS = ['#7c3aed', '#0891b2', '#ca8a04', '#dc2626', '#16a34a', '#db2777'];
  function statLabel(stat, count) { return (STAT_NAMES[stat.kind] || stat.kind) + ' · ' + count; }
  function nextStatColor(g) { return STAT_COLORS[g.stats.length % STAT_COLORS.length]; }
  function addStat(kind, ids) {
    var g = store.graph();
    g.stats.push({ id: store.uid('st'), kind: kind, datasetIds: (ids || []).slice(), color: nextStatColor(g) });
    store.commit('stat-add');
  }

  function autoChartTitle() {
    var s = store.state;
    if (s.graphMode === 'COMPARE_EXP') { return 'Custom comparison · ' + customState().selected.length + ' series'; }
    var pre = 'Experiment ' + s.currentExperiment + ' · ';
    if (s.graphMode === 'BY_SENSOR') return pre + (s.modeSelector.BY_SENSOR || '') + ' across all trials';
    if (s.graphMode === 'BY_TRIAL') return pre + 'Trial ' + s.modeSelector.BY_TRIAL + ', all sensors';
    return pre + 'full overview';
  }
  function chartTitle() { var g = store.graph(); return (g && g.name) || autoChartTitle(); }
  function yAxisLabel() {
    var series = seriesForCurrentGraph();
    var unit = null;
    for (var i = 0; i < series.length; i++) { if (series[i].unit) { unit = series[i].unit; break; } }
    return 'Temperature' + (unit ? ' (' + unit + ')' : '');
  }

  function buildScene() {
    var g = store.graph();
    var series = seriesForCurrentGraph();
    return {
      theme: chartColors(), series: series, overlays: computeOverlays(series, g),
      boundaries: computeBoundaries(), trialWindow: trialWindow(),
      grid: store.state.showGrid, legend: store.state.legend,
      selection: selection, hasSelection: hasSelection(),
      title: chartTitle(), xLabel: 'Time (s)', yLabel: yAxisLabel(),
    };
  }

  /* ============================ LEFT PANEL ============================== */
  function renderLeft() {
    var host = els.leftScroll; clearNode(host);
    if (noData()) {
      host.appendChild(el('div', { class: 'section-body', html: '<p class="hint" style="padding:16px 2px">Open a data folder to see experiments and series here.</p>' }));
      return;
    }
    var s = store.state, exp = store.currentExperiment();

    // --- Experiment & mode ---
    host.appendChild(section('Experiment', function (body) {
      if (s.graphMode !== 'COMPARE_EXP') {
        body.appendChild(field('Experiment', selectBox(
          store.data.experiments.map(function (e) { return { value: e.number, label: 'Experiment ' + e.number + '  (' + e.trials.length + ' trials)' }; }),
          s.currentExperiment, function (v) { s.currentExperiment = +v; store._ensureSelectors(); store.commit('experiment'); })));
      }

      var modes = [
        { id: 'BY_SENSOR', title: 'One Sensor · All Trials', sub: 'Pick a sensor; each trial is its own line' },
        { id: 'BY_TRIAL', title: 'One Trial · All Sensors', sub: 'Pick a trial; each sensor is its own line' },
        { id: 'ALL', title: 'Full Overview', sub: 'Every sensor of every trial' },
        { id: 'COMPARE_EXP', title: 'Custom', sub: 'Hand-pick anything to overlay' },
      ];
      var list = el('div', { class: 'radio-list' });
      modes.forEach(function (m) {
        list.appendChild(el('div', {
          class: 'radio-row' + (s.graphMode === m.id ? ' on' : ''),
          onclick: function () { s.graphMode = m.id; store._ensureSelectors(); store.commit('mode'); },
        }, [el('span', { class: 'dot' }), el('div', {}, [el('div', { class: 'rl-title', text: m.title }), el('div', { class: 'rl-sub', text: m.sub })])]));
      });
      body.appendChild(field('Graph Mode', list));

      // selector
      if (s.graphMode === 'BY_SENSOR') {
        body.appendChild(field('Sensor', selectBox(exp.channelNames.map(function (n) { return { value: n, label: n }; }),
          s.modeSelector.BY_SENSOR, function (v) { s.modeSelector.BY_SENSOR = v; store.commit('sensor'); })));
      } else if (s.graphMode === 'BY_TRIAL') {
        body.appendChild(field('Trial', selectBox(DataModel.trialNumbers(exp).map(function (t) { return { value: t, label: 'Trial ' + t }; }),
          s.modeSelector.BY_TRIAL, function (v) { s.modeSelector.BY_TRIAL = +v; store.commit('trial'); })));
      }
    }));

    // --- Custom overlay builder ---
    if (s.graphMode === 'COMPARE_EXP') host.appendChild(section('Build Overlay', buildCustomOverlay, String(customState().selected.length)));

    // --- Trial window ---
    if (s.graphMode !== 'COMPARE_EXP') {
      var tt = store.trialTiming(s.currentExperiment);
      host.appendChild(section('Trial Window', function (body) {
        body.appendChild(el('p', { class: 'hint', text: 'Mark where a trial begins and ends. Data is never removed — subtle guide lines are drawn, and "Fit Trial Window" zooms x here.' }));
        var grid = el('div', { class: 'split', style: 'margin-top:10px' });
        grid.appendChild(numField('Start offset (s)', tt.offset, function (v) { tt.offset = v; view.render(); updatePanSliders(); }, function () { store.commit('offset'); }));
        grid.appendChild(numField('Duration (s)', tt.duration, function (v) { tt.duration = v; view.render(); updatePanSliders(); }, function () { store.commit('duration'); }));
        body.appendChild(grid);
        body.appendChild(el('button', { class: 'btn sm', style: 'margin-top:10px', html: Icons.clear + ' Clear window', onclick: resetTrialWindow }));
      }));
    }

    // --- Data series (per-dataset styling; not shown in Custom mode) ---
    if (s.graphMode === 'COMPARE_EXP') return;
    host.appendChild(section('Data Series', function (body) {
      var ids = store.currentDatasetIds();
      var list = el('div', { class: 'ds-list' });
      ids.forEach(function (id) {
        var st = store.style(id);
        var d = DataModel.resolveDatasetData(store.data.experiments, id);
        var label = DataModel.datasetLabelForMode(store.data.experiments, id, s.graphMode) + '  ·  ' + (d ? d.label : id);
        var row = el('div', { class: 'ds-row ' + st.visibility });
        var swatch = el('button', { class: 'swatch', style: 'background:' + store.resolveColor(id) });
        swatch.addEventListener('click', function () {
          openColorPicker(swatch, store.resolveColor(id), function (hex, done) {
            store.setDatasetStyle(id, { customColor: hex });
            swatch.style.background = hex; view.render();
            if (done) store.commit('color');
          });
        });
        var visBtn = el('button', { class: 'vis-btn', title: 'Visibility: ' + st.visibility,
          html: st.visibility === 'on' ? Icons.eye : st.visibility === 'dim' ? Icons.eyeDim : Icons.eyeOff,
          onclick: function () {
            st.visibility = st.visibility === 'on' ? 'dim' : st.visibility === 'dim' ? 'off' : 'on';
            store.commit('visibility');
          } });
        row.appendChild(swatch);
        row.appendChild(el('span', { class: 'ds-label', text: label, title: d ? d.label : id }));
        if (s.plotType === 'scatter') {
          var shapeSel = selectBox(DataModel.SHAPES.map(function (sh) { return { value: sh, label: sh }; }), st.shape, function (v) { st.shape = v; store.commit('shape'); });
          shapeSel.style.width = '86px'; row.appendChild(shapeSel);
        }
        row.appendChild(visBtn);
        list.appendChild(row);
      });
      body.appendChild(list);
    }, String(store.currentDatasetIds().length)));
  }

  /* Custom overlay builder: presets + per-experiment checkbox groups. */
  function buildCustomOverlay(body) {
    var sel = customState().selected, selSet = {};
    // The graph colours a custom series by its position in the selection, so mirror
    // that here (colorByKey) — the picker swatch then matches the plotted line.
    var colorByKey = {};
    sel.forEach(function (k, i) { selSet[k] = 1; colorByKey[k] = Theme.seriesColor(store.state.theme, i); });
    var sensors = allSensorNames();
    var single = sensors.length <= 1;

    body.appendChild(el('p', { class: 'hint', text: 'Check any trials, sensors, or per-experiment averages to overlay. The buttons below toggle a whole group on or off. Colors are assigned automatically.' }));

    // preset toggles: highlighted when that group is fully on; click adds it (or
    // removes it if already fully on). "Clear" is a one-shot reset.
    var presets = el('div', { class: 'row wrap', style: 'gap:6px;margin:10px 0 4px' });
    function toggleBtn(label, keys, title) {
      var on = keys.length > 0 && keys.every(function (k) { return selSet[k]; });
      return el('button', { class: 'btn sm' + (on ? ' active' : ''), text: label, title: title, onclick: function () { toggleGroup(keys); } });
    }
    presets.appendChild(toggleBtn('All trials', allRawKeys(), 'Toggle every trial of every sensor'));
    if (!single) sensors.forEach(function (sn) { presets.appendChild(toggleBtn(sn, rawKeysForSensor(sn), 'Toggle every trial of ' + sn)); });
    presets.appendChild(toggleBtn('Averages', allAvgKeys(), 'Toggle the per-experiment average of each sensor'));
    presets.appendChild(el('button', { class: 'btn sm', text: 'Clear', title: 'Remove everything', onclick: function () { setCustomSelected([]); } }));
    body.appendChild(presets);

    // per-experiment checkbox groups
    store.data.experiments.forEach(function (exp) {
      var expKeysRaw = [];
      exp.trials.forEach(function (tr) { tr.channels.forEach(function (ch) { expKeysRaw.push('R|E' + exp.number + '|T' + tr.trial + '|' + ch.name); }); });
      var allOn = expKeysRaw.length > 0 && expKeysRaw.every(function (k) { return selSet[k]; });

      var head = el('div', { class: 'cust-exp-head' }, [
        el('span', { text: 'Experiment ' + exp.number }),
        (function () {
          var cb = el('input', { type: 'checkbox', title: 'Toggle all trials in this experiment' }); cb.checked = allOn;
          cb.addEventListener('change', function () {
            var next = sel.filter(function (k) { return expKeysRaw.indexOf(k) < 0; });
            if (cb.checked) next = next.concat(expKeysRaw);
            setCustomSelected(next);
          });
          return el('label', { class: 'chk', style: 'margin-left:auto' }, [cb, el('span', { class: 'box', html: Icons.check })]);
        })(),
      ]);
      body.appendChild(head);

      var wrap = el('div', { class: 'cust-list' });
      exp.trials.forEach(function (tr) {
        tr.channels.forEach(function (ch) {
          var key = 'R|E' + exp.number + '|T' + tr.trial + '|' + ch.name;
          wrap.appendChild(customCheck(key, single ? 'Trial ' + tr.trial : 'Trial ' + tr.trial + ' · ' + ch.name, !!selSet[key], colorByKey[key] || null));
        });
      });
      // per-experiment averages
      exp.channelNames.forEach(function (n) {
        var key = 'A|E' + exp.number + '|' + n;
        wrap.appendChild(customCheck(key, single ? 'Average (all trials)' : 'Average · ' + n, !!selSet[key], colorByKey[key] || null, true));
      });
      body.appendChild(wrap);
    });
  }
  function customCheck(key, label, on, swatchColor, isAvg) {
    var cb = el('input', { type: 'checkbox' }); cb.checked = on;
    cb.addEventListener('change', function () { toggleCustom(key, cb.checked); });
    var sw = swatchColor ? el('span', { class: 'tt-swatch', style: 'background:' + swatchColor })
      : el('span', { class: 'tt-swatch hollow' });   // not graphed yet -> no colour
    return el('label', { class: 'chk cust-item', style: 'padding:5px 4px' },
      [cb, el('span', { class: 'box', html: Icons.check }), sw, el('span', { class: isAvg ? 'cust-avg' : '', text: label })]);
  }

  var sectionOpen = {}; // remembered across re-renders so panels don't re-expand
  function section(title, build, count) {
    if (sectionOpen[title] === undefined) sectionOpen[title] = true;
    var sec = el('div', { class: 'section' + (sectionOpen[title] ? '' : ' collapsed') });
    var head = el('div', { class: 'section-head' }, [el('span', { text: title })]);
    if (count != null) head.appendChild(el('span', { class: 'count', text: count }));
    head.appendChild(el('span', { class: 'chev', html: Icons.chev }));
    var body = el('div', { class: 'section-body' });
    head.addEventListener('click', function () { sectionOpen[title] = !sec.classList.toggle('collapsed'); });
    build(body);
    sec.appendChild(head); sec.appendChild(body);
    return sec;
  }
  function field(label, control) { return el('div', { class: 'field' }, [el('label', { text: label }), control]); }
  function numField(label, value, oninput, oncommit) {
    var input = el('input', { class: 'input mono', type: 'number', step: 'any', value: value });
    input.addEventListener('input', function () { var v = parseFloat(input.value); if (!isNaN(v)) oninput(v); });
    input.addEventListener('change', function () { if (oncommit) oncommit(); });
    return el('div', { class: 'field', style: 'margin:0' }, [el('label', { text: label }), input]);
  }

  /* ============================ RIGHT PANEL ============================= */
  var toolOpen = {};
  function renderRight() {
    var host = els.rightScroll; clearNode(host);
    if (noData()) { host.appendChild(el('div', { html: '<p class="hint" style="padding:16px 14px">Analysis tools appear here once data is loaded.</p>' })); return; }
    var g = store.graph();

    host.appendChild(el('div', { style: 'padding:12px 13px;display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border-2)' }, [
      el('span', { class: 'hint', style: 'flex:1', text: 'Tools apply to this graph only' }),
      el('button', { class: 'btn sm', html: Icons.clear + ' Clear all', onclick: clearAnalysis }),
    ]));

    tool(host, 'aggregate', Icons.avg, 'Statistics', g.stats.length > 0, function (body) {
      body.appendChild(statisticsEditor(g));
    });

    tool(host, 'stats', Icons.minmax, 'Min / Max / Mean', g.minmax.length > 0, function (body) {
      body.appendChild(statsEditor(g));
    });

    tool(host, 'area', Icons.area, 'Area Under Curve', g.areas.length > 0, function (body) {
      body.appendChild(areaEditor(g));
    });

    tool(host, 'fit', Icons.line, 'Line of Best Fit', g.bestFit.length > 0, function (body) {
      body.appendChild(fitEditor(g));
    });

    tool(host, 'smooth', Icons.smooth, 'Smoothing', anySmooth(g), function (body) {
      body.appendChild(smoothEditor(g));
    });

    tool(host, 'manual', Icons.dots, 'Manual Plotting', (g.manualPoints.length + g.manualLines.length) > 0, function (body) {
      body.appendChild(manualEditor(g));
    });

    tool(host, 'cursor', Icons.cursor, 'Dual-Cursor Measure', g.cursors.length > 0, function (body) {
      body.appendChild(cursorEditor(g));
    });

    tool(host, 'threshold', Icons.threshold, 'Threshold Crossing', !!g.threshold, function (body) {
      body.appendChild(thresholdEditor(g));
    });
  }

  function buildToggle(checked, onchange, label) {
    var input = el('input', { type: 'checkbox' }); input.checked = checked;
    input.addEventListener('change', function () { onchange(input.checked); });
    return [input, el('span', { class: 'box', html: Icons.check }), el('span', { text: label })];
  }
  function tool(host, id, icon, name, active, build) {
    if (toolOpen[id] === undefined) toolOpen[id] = false;
    var card = el('div', { class: 'tool' + (toolOpen[id] ? '' : ' collapsed') + (active ? ' active' : '') });
    var head = el('div', { class: 'tool-head' }, [
      el('span', { class: 't-ico', html: icon }), el('span', { class: 't-name', text: name }), el('span', { class: 'chev', html: Icons.chev }),
    ]);
    var body = el('div', { class: 'tool-body' });
    head.addEventListener('click', function () { toolOpen[id] = card.classList.toggle('collapsed') ? false : true; });
    build(body);
    card.appendChild(head); card.appendChild(body); host.appendChild(card);
  }
  function openTool(id) { toolOpen[id] = true; if (els.panelRight.classList.contains('collapsed')) togglePanel('right'); renderRight(); }

  function datasetPicker(label, selectedIds, onchange) {
    var wrap = el('div', {});
    wrap.appendChild(el('label', { style: 'display:block;font-size:11px;color:var(--text-3);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.4px', text: label }));
    var list = el('div', { class: 'radio-list' });
    graphSeries().forEach(function (m) {
      var on = selectedIds.indexOf(m.id) >= 0;
      var cb = el('input', { type: 'checkbox' }); cb.checked = on;
      cb.addEventListener('change', function () {
        var next = selectedIds.slice();
        if (cb.checked) { if (next.indexOf(m.id) < 0) next.push(m.id); } else next = next.filter(function (x) { return x !== m.id; });
        onchange(next);
      });
      list.appendChild(el('label', { class: 'chk', style: 'padding:6px 4px' }, [cb, el('span', { class: 'box', html: Icons.check }),
        el('span', { class: 'tt-swatch', style: 'background:' + m.color }), el('span', { text: m.label })]));
    });
    wrap.appendChild(list);
    return wrap;
  }

  function capLabel(text, mt) {
    return el('label', { style: 'display:block;font-size:11px;color:var(--text-3);margin:' + (mt || 12) + 'px 0 6px;font-weight:600;text-transform:uppercase;letter-spacing:.4px', text: text });
  }
  /* Full / Trial / Visible / Manual range selector shared by stats, area, fit. */
  function domainField(dom, onLive, onCommit) {
    var wrap = el('div', {});
    wrap.appendChild(capLabel('Data range'));
    wrap.appendChild(segmented(
      [{ value: 'full', label: 'Full' }, { value: 'trial', label: 'Trial' }, { value: 'view', label: 'Visible' }, { value: 'manual', label: 'Manual' }],
      dom.kind, function (v) {
        dom.kind = v;
        if (v === 'manual' && (dom.xMin == null || dom.xMax == null)) { var vv = view.getView(); dom.xMin = +vv.xMin.toFixed(2); dom.xMax = +vv.xMax.toFixed(2); }
        onCommit();
      }));
    if (dom.kind === 'manual') {
      var sp = el('div', { class: 'split', style: 'margin-top:8px' });
      sp.appendChild(numField('From (s)', dom.xMin != null ? dom.xMin : '', function (val) { dom.xMin = val; onLive(); }, onCommit));
      sp.appendChild(numField('To (s)', dom.xMax != null ? dom.xMax : '', function (val) { dom.xMax = val; onLive(); }, onCommit));
      wrap.appendChild(sp);
    }
    return wrap;
  }

  function statisticsEditor(g) {
    var wrap = el('div', {});
    wrap.appendChild(el('p', { class: 'hint', text: 'Plot the mean, median, mode, or standard deviation across chosen datasets. Add as many as you like; hover a line for its value.' }));
    var allIds = graphSeries().map(function (m) { return m.id; });
    if (g.statPick == null) g.statPick = allIds.slice();
    g.statPick = g.statPick.filter(function (id) { return allIds.indexOf(id) >= 0; });
    wrap.appendChild(datasetPicker('Compute across', g.statPick, function (ids) { g.statPick = ids; renderRight(); }));
    var addRow = el('div', { class: 'row wrap', style: 'gap:6px;margin-top:8px' });
    [['mean', 'Mean'], ['median', 'Median'], ['mode', 'Mode'], ['stddev', 'Std Dev']].forEach(function (k) {
      addRow.appendChild(el('button', { class: 'btn sm', html: Icons.plus + ' ' + k[1], title: 'Graph a ' + k[1] + ' line over the selected datasets',
        onclick: function () { if (!g.statPick.length) { toast('Select at least one dataset'); return; } addStat(k[0], g.statPick); } }));
    });
    wrap.appendChild(addRow);
    if (g.stats.length) {
      wrap.appendChild(capLabel('Graphed statistics', 14));
      var list = el('div', {});
      g.stats.forEach(function (stat) {
        var sw = el('button', { class: 'swatch', style: 'background:' + stat.color });
        sw.addEventListener('click', function () { openColorPicker(sw, stat.color, function (h, done) { stat.color = h; sw.style.background = h; view.render(); if (done) store.commit('stat-color'); }); });
        var del = el('button', { class: 'mini', title: 'Remove', html: Icons.trash, onclick: function () { g.stats = g.stats.filter(function (x) { return x !== stat; }); store.commit('stat-del'); } });
        var count = stat.datasetIds && stat.datasetIds.length ? stat.datasetIds.length + ' datasets' : 'all graphed';
        list.appendChild(el('div', { class: 'mp-entry' }, [sw, el('span', { class: 'mp-expr', text: (STAT_NAMES[stat.kind] || stat.kind) + ' of ' + count }), del]));
      });
      wrap.appendChild(list);
    }
    return wrap;
  }

  function statsEditor(g) {
    var wrap = el('div', {});
    wrap.appendChild(datasetPicker('Mark min & max for', g.minmax, function (ids) { g.minmax = ids; store.commit('minmax'); }));
    var out = el('div', { class: 'readout', style: 'margin-top:10px' });
    function refresh() { renderStatsReadout(out, g); }
    wrap.appendChild(domainField(g.minmaxDomain, function () { view.render(); refresh(); }, function () { store.commit('minmax-domain'); }));
    wrap.appendChild(out); refresh();
    return wrap;
  }
  function renderStatsReadout(out, g) {
    clearNode(out);
    if (!g.minmax.length) { out.appendChild(el('div', { class: 'hint', text: 'Select a series above.' })); return; }
    out.appendChild(el('div', { class: 'hint', style: 'margin-bottom:4px', text: 'over ' + domainLabel(g.minmaxDomain) }));
    var meta = graphMetaMap();
    g.minmax.forEach(function (id) {
      var m = meta[id]; if (!m) return;
      var r = resolveDomain(m, g.minmaxDomain);
      var sl = Analysis.sliceXY(m.xs, m.rawYs, r[0], r[1]);
      var st = Analysis.seriesStats(sl.xs, sl.ys);
      out.appendChild(el('div', { html: '<b>' + m.label + '</b>' }));
      if (!st) { out.appendChild(el('div', { html: '<span class="rk">no points in range</span>' })); return; }
      out.appendChild(el('div', { html: '<span class="rk">min</span><span class="rv">' + fmt(st.min, 3) + ' @ ' + fmt(st.argMinX, 2) + 's</span>' }));
      out.appendChild(el('div', { html: '<span class="rk">max</span><span class="rv">' + fmt(st.max, 3) + ' @ ' + fmt(st.argMaxX, 2) + 's</span>' }));
      out.appendChild(el('div', { html: '<span class="rk">mean</span><span class="rv">' + fmt(st.mean, 3) + '</span>' }));
    });
  }

  function fitEditor(g) {
    var wrap = el('div', {});
    wrap.appendChild(datasetPicker('Fit a line to', g.bestFit, function (ids) { g.bestFit = ids; store.commit('bestfit'); }));
    var out = el('div', { class: 'readout', style: 'margin-top:10px' });
    function refresh() { renderFitReadout(out, g); }
    wrap.appendChild(domainField(g.bestFitDomain, function () { view.render(); refresh(); }, function () { store.commit('bestfit-domain'); }));
    wrap.appendChild(el('p', { class: 'hint', style: 'margin-top:8px', text: 'The fit is solid over its range and dotted where extrapolated.' }));
    wrap.appendChild(out); refresh();
    return wrap;
  }
  function renderFitReadout(out, g) {
    clearNode(out);
    if (!g.bestFit.length) { out.appendChild(el('div', { class: 'hint', text: 'Select a series above.' })); return; }
    out.appendChild(el('div', { class: 'hint', style: 'margin-bottom:4px', text: 'fitted over ' + domainLabel(g.bestFitDomain) }));
    var meta = graphMetaMap();
    g.bestFit.forEach(function (id) {
      var m = meta[id]; if (!m) return;
      var r = resolveDomain(m, g.bestFitDomain);
      var sl = Analysis.sliceXY(m.xs, m.rawYs, r[0], r[1]);
      var reg = Analysis.linearRegression(sl.xs, sl.ys);
      out.appendChild(el('div', { html: '<b>' + m.label + '</b>' }));
      if (!reg) { out.appendChild(el('div', { html: '<span class="rk">not enough points</span>' })); return; }
      out.appendChild(el('div', { html: '<span class="rk">slope</span><span class="rv">' + fmt(reg.slope, 4) + ' /s</span>' }));
      out.appendChild(el('div', { html: '<span class="rk">intercept</span><span class="rv">' + fmt(reg.intercept, 3) + '</span>' }));
      out.appendChild(el('div', { html: '<span class="rk">R²</span><span class="rv">' + fmt(reg.r2, 4) + '</span>' }));
    });
  }

  function areaEditor(g) {
    var wrap = el('div', {});
    wrap.appendChild(datasetPicker('Shade area under', g.areas, function (ids) { g.areas = ids; store.commit('area'); }));
    var out = el('div', { class: 'readout', style: 'margin-top:10px' });
    function refresh() { renderAreaReadout(out, g); }
    wrap.appendChild(domainField(g.areaDomain, function () { view.render(); refresh(); }, function () { store.commit('area-domain'); }));
    wrap.appendChild(out); refresh();
    return wrap;
  }
  function renderAreaReadout(out, g) {
    clearNode(out);
    if (!g.areas.length) { out.appendChild(el('div', { class: 'hint', text: 'Select a series above.' })); return; }
    var meta = graphMetaMap();
    g.areas.forEach(function (id) {
      var m = meta[id]; if (!m) return;
      var r = resolveDomain(m, g.areaDomain);
      var area = Analysis.trapezoidArea(m.xs, m.rawYs, r[0], r[1]);
      out.appendChild(el('div', { html: '<b>' + m.label + '</b>' }));
      out.appendChild(el('div', { html: '<span class="rk">∫ over [' + fmt(r[0], 1) + ', ' + fmt(r[1], 1) + ']s</span><span class="rv">' + fmt(area, 2) + '</span>' }));
    });
  }

  function anySmooth(g) { for (var k in g.smooth) if (g.smooth[k] && g.smooth[k].on) return true; return false; }
  function smoothEditor(g) {
    var wrap = el('div', {});
    wrap.appendChild(el('p', { class: 'hint', text: 'Gaussian smoothing reduces noise without the overshoot ("bumps") a polynomial fit adds at sharp changes. Use prediction to read a value between samples.' }));
    graphSeries().forEach(function (m) {
      var id = m.id;
      if (!g.smooth[id]) g.smooth[id] = { on: false, strength: 6 };
      var sm = g.smooth[id];
      var rowc = el('div', { style: 'margin:12px 0 4px' });
      var cb = el('input', { type: 'checkbox' }); cb.checked = sm.on;
      cb.addEventListener('change', function () { sm.on = cb.checked; store.commit('smooth'); });
      rowc.appendChild(el('label', { class: 'chk' }, [cb, el('span', { class: 'box', html: Icons.check }),
        el('span', { class: 'tt-swatch', style: 'background:' + m.color }), el('span', { text: m.label })]));
      var slider = el('input', { type: 'range', class: 'slider', min: '1', max: '40', value: sm.strength, style: 'margin-top:6px' });
      var val = el('span', { class: 'hint', text: 'σ = ' + sm.strength });
      slider.addEventListener('input', function () { sm.strength = +slider.value; val.textContent = 'σ = ' + sm.strength; if (sm.on) view.render(); });
      slider.addEventListener('change', function () { store.commit('smooth-strength'); });
      rowc.appendChild(el('div', { class: 'row', style: 'margin-top:4px' }, [slider, val]));
      wrap.appendChild(rowc);
    });
    // prediction
    var pred = el('div', { style: 'margin-top:12px;border-top:1px solid var(--border-2);padding-top:12px' });
    pred.appendChild(el('label', { style: 'display:block;font-size:11px;color:var(--text-3);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.4px', text: 'Predict value at time' }));
    var pin = el('input', { class: 'input mono', type: 'number', step: 'any', placeholder: 'e.g. 2.2' });
    var pout = el('div', { class: 'readout', style: 'margin-top:8px', html: '<span class="hint">Enter a time to interpolate each series (overshoot-free).</span>' });
    pin.addEventListener('input', function () {
      var t = parseFloat(pin.value); clearNode(pout);
      if (isNaN(t)) { pout.appendChild(el('span', { class: 'hint', text: 'Enter a time.' })); return; }
      graphSeries().forEach(function (m) {
        var pchip = Analysis.buildPchip(m.xs, m.rawYs);
        pout.appendChild(el('div', { html: '<span class="rk">' + m.label + '</span><span class="rv">' + fmt(pchip(t), 3) + '</span>' }));
      });
    });
    pred.appendChild(pin); pred.appendChild(pout);
    wrap.appendChild(pred);
    return wrap;
  }

  function manualEditor(g) {
    var wrap = el('div', {});
    wrap.appendChild(el('p', { class: 'hint', text: 'Type like a graphing calculator: (2, 7) plots a point · x = 5 a vertical line · y = 30 a horizontal line. Double-click the chart to drop a point; drag points to move them.' }));
    var input = el('input', { class: 'input mono', placeholder: '(2, 7)   or   x = 5   or   y = 30', style: 'margin-top:10px' });
    var color = { hex: accentHex() };
    var swatch = el('button', { class: 'swatch', style: 'background:' + color.hex });
    swatch.addEventListener('click', function () { openColorPicker(swatch, color.hex, function (h) { color.hex = h; swatch.style.background = h; }); });
    var style = { v: 'solid' };
    var styleSel = selectBox([{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }], 'solid', function (v) { style.v = v; });
    styleSel.style.width = '96px';
    var add = el('button', { class: 'btn sm primary', html: Icons.plus + ' Add' });
    function doAdd() {
      var parsed = parseManual(input.value);
      if (!parsed) { toast('Could not parse — try (2, 7), x = 5, or y = 30'); return; }
      if (parsed.kind === 'point') g.manualPoints.push({ id: store.uid('pt'), x: parsed.x, y: parsed.y, color: color.hex, customLabel: null, showLabel: true });
      else g.manualLines.push({ id: store.uid('ln'), axis: parsed.axis, value: parsed.value, color: color.hex, style: style.v, label: input.value.trim(), showLabel: true });
      input.value = ''; store.commit('manual-add');
    }
    add.addEventListener('click', doAdd);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doAdd(); });
    wrap.appendChild(input);
    wrap.appendChild(el('div', { class: 'row', style: 'margin-top:8px' }, [swatch, styleSel, el('div', { style: 'flex:1' }), add]));

    var list = el('div', { style: 'margin-top:12px' });
    if (g.manualPoints.length) list.appendChild(capLabel('Points', 4));
    g.manualPoints.forEach(function (p) { list.appendChild(manualRow(g, p, 'point')); });
    if (g.manualLines.length) list.appendChild(capLabel('Lines', 10));
    g.manualLines.forEach(function (l) { list.appendChild(manualRow(g, l, 'line')); });
    if (!g.manualPoints.length && !g.manualLines.length) list.appendChild(el('div', { class: 'hint', text: 'No manual items yet.' }));
    wrap.appendChild(list);
    return wrap;
  }
  function manualRow(g, item, kind) {
    var swatch = el('button', { class: 'swatch', style: 'background:' + item.color });
    swatch.addEventListener('click', function () { openColorPicker(swatch, item.color, function (h, done) { item.color = h; swatch.style.background = h; view.render(); if (done) store.commit('manual-color'); }); });

    var mid;
    if (kind === 'point') {
      var inp = el('input', { class: 'mp-label', value: item.customLabel || '', placeholder: '(' + fmt(item.x, 2) + ', ' + fmt(item.y, 2) + ')', title: 'Custom label (blank = live position)' });
      inp.addEventListener('input', function () { item.customLabel = inp.value.trim() || null; view.render(); });
      inp.addEventListener('change', function () { store.commit('manual-label'); });
      mid = inp;
    } else {
      mid = el('span', { class: 'mp-expr', text: item.axis + ' = ' + fmt(item.value, 3) });
    }

    var showing = item.showLabel !== false;
    var eyeBtn = el('button', { class: 'mini' + (showing ? '' : ' off'), title: showing ? 'Label shown — click to hide' : 'Label hidden — click to show', html: showing ? Icons.eye : Icons.eyeOff });
    eyeBtn.addEventListener('click', function () {
      item.showLabel = !(item.showLabel !== false);
      var on = item.showLabel;
      eyeBtn.className = 'mini' + (on ? '' : ' off');
      eyeBtn.innerHTML = on ? Icons.eye : Icons.eyeOff;
      eyeBtn.title = on ? 'Label shown — click to hide' : 'Label hidden — click to show';
      view.render(); store.commit('manual-toggle');
    });

    var del = el('button', { class: 'mini', title: 'Delete', html: Icons.trash, onclick: function () {
      if (kind === 'point') g.manualPoints = g.manualPoints.filter(function (x) { return x !== item; });
      else g.manualLines = g.manualLines.filter(function (x) { return x !== item; });
      store.commit('manual-del');
    } });
    return el('div', { class: 'mp-entry' }, [swatch, mid, eyeBtn, del]);
  }
  function parseManual(str) {
    str = (str || '').trim();
    var num = '(-?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?)';
    var mx = new RegExp('^x\\s*=\\s*' + num + '$', 'i').exec(str);
    if (mx) return { kind: 'line', axis: 'x', value: parseFloat(mx[1]) };
    var my = new RegExp('^y\\s*=\\s*' + num + '$', 'i').exec(str);
    if (my) return { kind: 'line', axis: 'y', value: parseFloat(my[1]) };
    var mp = new RegExp('^\\(\\s*' + num + '\\s*,\\s*' + num + '\\s*\\)$').exec(str);
    if (mp) return { kind: 'point', x: parseFloat(mp[1]), y: parseFloat(mp[2]) };
    return null;
  }

  function cursorEditor(g) {
    var wrap = el('div', {});
    wrap.appendChild(el('p', { class: 'hint', text: 'Place two vertical cursors to measure Δtime, Δtemp and the average rate between them. Double-click the chart to drop the next cursor.' }));
    var quick = el('div', { class: 'row', style: 'margin-top:10px' }, [
      el('button', { class: 'btn sm', html: Icons.fit + ' All data', title: 'Span the range every graphed trial covers',
        onclick: function () { var r = commonDataRange(); g.cursors = [+r[0].toFixed(2), +r[1].toFixed(2)]; store.commit('cursor-span'); } }),
      el('button', { class: 'btn sm', text: 'Trial window', title: 'Span the trial start/end',
        onclick: function () { var tw = trialWindow(); if (!tw) { toast('Set a trial window first (left panel)'); return; } g.cursors = [+tw.x0.toFixed(2), +tw.x1.toFixed(2)]; store.commit('cursor-span'); } }),
    ]);
    wrap.appendChild(quick);
    var row = el('div', { class: 'split', style: 'margin-top:10px' });
    [0, 1].forEach(function (i) {
      row.appendChild(numField('Cursor ' + (i + 1) + ' (s)', g.cursors[i] != null ? g.cursors[i] : '',
        function (v) { g.cursors[i] = v; view.render(); }, function () { store.commit('cursor'); }));
    });
    wrap.appendChild(row);
    var out = el('div', { class: 'readout', style: 'margin-top:10px' });
    if (g.cursors.length >= 2 && g.cursors[0] != null && g.cursors[1] != null) {
      var series = seriesForCurrentGraph().filter(function (s) { return s.visibility !== 'off'; });
      var dt = g.cursors[1] - g.cursors[0];
      out.appendChild(el('div', { html: '<span class="rk">Δt</span><span class="rv">' + fmt(dt, 3) + ' s</span>' }));
      series.forEach(function (s) {
        var y0 = Analysis.linearInterp(s.xs, s.ys, g.cursors[0]);
        var y1 = Analysis.linearInterp(s.xs, s.ys, g.cursors[1]);
        var rate = dt !== 0 ? (y1 - y0) / dt : NaN;
        out.appendChild(el('div', { html: '<b>' + s.label + '</b>' }));
        out.appendChild(el('div', { html: '<span class="rk">ΔT</span><span class="rv">' + fmt(y1 - y0, 3) + '</span>' }));
        out.appendChild(el('div', { html: '<span class="rk">rate</span><span class="rv">' + fmt(rate, 4) + ' /s</span>' }));
      });
    } else out.appendChild(el('div', { class: 'hint', text: 'Set both cursors to see measurements.' }));
    wrap.appendChild(out);
    wrap.appendChild(el('button', { class: 'btn sm', style: 'margin-top:10px', html: Icons.clear + ' Clear cursors', onclick: function () { g.cursors = []; store.commit('cursor-clear'); } }));
    return wrap;
  }

  function thresholdEditor(g) {
    var wrap = el('div', {});
    wrap.appendChild(el('p', { class: 'hint', text: 'Draw a horizontal threshold and mark where each graphed series crosses it (e.g. time to reach a target temperature).' }));
    var input = el('input', { class: 'input mono', type: 'number', step: 'any', placeholder: 'Threshold temperature', value: g.threshold ? g.threshold.level : '', style: 'margin-top:10px' });
    input.addEventListener('input', function () { var v = parseFloat(input.value); g.threshold = isNaN(v) ? null : { level: v }; view.render(); renderThreshReadout(); });
    input.addEventListener('change', function () { store.commit('threshold'); });
    wrap.appendChild(input);
    var out = el('div', { class: 'readout', style: 'margin-top:10px' });
    wrap.appendChild(out);
    function renderThreshReadout() {
      clearNode(out);
      if (!g.threshold) { out.appendChild(el('div', { class: 'hint', text: 'Enter a threshold.' })); return; }
      seriesForCurrentGraph().filter(function (s) { return s.visibility !== 'off'; }).forEach(function (s) {
        var cr = Analysis.thresholdCrossings(s.xs, s.ys, g.threshold.level);
        out.appendChild(el('div', { html: '<b>' + s.label + '</b>' }));
        if (!cr.length) out.appendChild(el('div', { html: '<span class="rk">crossings</span><span class="rv">none</span>' }));
        else cr.slice(0, 6).forEach(function (c) { out.appendChild(el('div', { html: '<span class="rk">' + (c.rising ? '↑' : '↓') + '</span><span class="rv">' + fmt(c.x, 3) + ' s</span>' })); });
      });
    }
    renderThreshReadout();
    return wrap;
  }

  /* ============================ ACTIONS ================================= */
  function clearAnalysis() {
    var k = store.graphKey();
    store.state.graphs[k] = TS.freshGraph();
    store.commit('clear-analysis'); toast('Analysis cleared for this graph');
  }
  function resetTrialWindow() {
    var t = store.trialTiming(store.state.currentExperiment); t.offset = 0; t.duration = 0; store.commit('reset-window');
  }
  function setTheme(name) { store.state.theme = name; store.commit('theme'); }
  function setPlotType(t) { store.state.plotType = t; store.commit('plot-type'); }

  function filenamePatternDialog() {
    var fp = Object.assign({ mode: 'auto', template: 'E{e}T{t}' }, store.state.filenamePattern);
    var body = el('div', {});
    body.appendChild(el('p', { class: 'hint', text: 'ThermoScope reads the experiment and trial numbers from the start of each file name. Auto-detect handles the common styles; choose Custom to describe your own exactly.' }));
    var modeWrap = el('div', { class: 'radio-list', style: 'margin-top:12px' });
    var tmplField;
    function renderTmpl() { if (tmplField) tmplField.style.display = fp.mode === 'template' ? 'block' : 'none'; }
    [['auto', 'Auto-detect', 'E1T1 · E1-T1 · Experiment 1 - Trial 1 · Exp1 Tr1 · Ex1 * Tr1'],
     ['template', 'Custom template', 'Describe it with {e} and {t} for the numbers']].forEach(function (o) {
      var row = el('div', { class: 'radio-row' + (fp.mode === o[0] ? ' on' : ''),
        onclick: function () { fp.mode = o[0]; Array.prototype.forEach.call(modeWrap.children, function (c, i) { c.classList.toggle('on', ['auto', 'template'][i] === fp.mode); }); renderTmpl(); } },
        [el('span', { class: 'dot' }), el('div', {}, [el('div', { class: 'rl-title', text: o[1] }), el('div', { class: 'rl-sub', text: o[2] })])]);
      modeWrap.appendChild(row);
    });
    body.appendChild(modeWrap);
    tmplField = el('div', { style: 'margin-top:12px' });
    tmplField.appendChild(capLabel('Template', 0));
    var tin = el('input', { class: 'input mono', value: fp.template, placeholder: 'E{e}T{t}' });
    tin.addEventListener('input', function () { fp.template = tin.value; });
    tmplField.appendChild(tin);
    tmplField.appendChild(el('p', { class: 'hint', style: 'margin-top:6px', text: 'Example: "Experiment {e} - Trial {t}" matches "Experiment 3 - Trial 2 - …".' }));
    body.appendChild(tmplField); renderTmpl();
    body.appendChild(el('p', { class: 'hint', style: 'margin-top:14px' }, 'Applies the next time you open a data folder.'));
    modal({ title: 'File Name Pattern', body: body, actions: [
      { label: 'Cancel' },
      { label: store.data.experiments.length ? 'Save & Reopen Folder…' : 'Save', primary: true, onClick: function () {
        store.state.filenamePattern = { mode: fp.mode, template: fp.template };
        toast('File name pattern updated');
        if (store.data.experiments.length) openFolder();
      } },
    ] });
  }
  function setBoundsDialog() {
    var v = view.getView();
    var vals = { xMin: v.xMin, xMax: v.xMax, yMin: v.yMin, yMax: v.yMax };
    var body = el('div', {});
    body.appendChild(el('p', { class: 'hint', text: 'Set exact axis limits (fixed scale). Panning or zooming afterward returns to free navigation.' }));
    var grid = el('div', { class: 'split', style: 'margin-top:12px' });
    [['xMin', 'X min (s)'], ['xMax', 'X max (s)'], ['yMin', 'Y min'], ['yMax', 'Y max']].forEach(function (f) {
      var i = el('input', { class: 'input mono', type: 'number', step: 'any', value: (+vals[f[0]]).toFixed(3) });
      i.addEventListener('input', function () { var n = parseFloat(i.value); if (!isNaN(n)) vals[f[0]] = n; });
      grid.appendChild(el('div', { class: 'field', style: 'margin:0' }, [el('label', { text: f[1] }), i]));
    });
    body.appendChild(grid);
    modal({ title: 'Set Axis Bounds', body: body, actions: [
      { label: 'Cancel' },
      { label: 'Apply', primary: true, onClick: function () {
        if (vals.xMax <= vals.xMin || vals.yMax <= vals.yMin) { toast('Max must be greater than min'); return false; }
        view.setView(vals); renderChartToolbar(); updatePanSliders();
      } },
    ] });
  }

  /* ---- Preferences (sectioned, like a classic app preferences panel) ---- */
  function preferencesDialog() {
    var active = 'appearance';
    var cats = [
      { id: 'appearance', label: 'Appearance', icon: Icons.palette },
      { id: 'units', label: 'Units & Format', icon: Icons.ruler },
      { id: 'general', label: 'General', icon: Icons.tune },
    ];
    var rail = el('div', { class: 'prefs-rail' });
    var pane = el('div', { class: 'prefs-pane' });

    function refresh(refit) { if (refit && view) view.fitAll(); updateAll(); renderPane(); }
    function prefRow(label, desc, control) {
      return el('div', { class: 'pref-row' }, [
        el('div', {}, [el('div', { class: 'pref-label', text: label }), desc ? el('div', { class: 'pref-desc', text: desc }) : null]),
        el('div', { class: 'pref-control' }, control),
      ]);
    }
    function renderRail() {
      clearNode(rail);
      cats.forEach(function (c) {
        rail.appendChild(el('button', { class: active === c.id ? 'on' : '', html: c.icon + '<span>' + c.label + '</span>',
          onclick: function () { active = c.id; renderRail(); renderPane(); } }));
      });
    }
    function buildAppearance() {
      pane.appendChild(el('h4', { text: 'Theme' }));
      pane.appendChild(prefRow('Color theme', 'Light suits print and shared figures; dark reduces glare beside a running experiment.',
        segmented([{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], store.state.theme, function (v) { setTheme(v); renderPane(); })));
      var sw = el('div', { class: 'accent-swatches' });
      Object.keys(ACCENTS).forEach(function (k) {
        var col = ACCENTS[k][store.state.theme];
        sw.appendChild(el('button', { class: 'accent-sw' + (Prefs.data.accent === k ? ' on' : ''),
          style: 'background:' + col + ';color:' + col, title: ACCENTS[k].name,
          onclick: function () { Prefs.set('accent', k); refresh(false); } }));
      });
      pane.appendChild(prefRow('Accent color', 'Used for highlights, active controls, and selection.', sw));
      pane.appendChild(el('h4', { text: 'Layout' }));
      pane.appendChild(prefRow('Interface density', 'Compact tightens spacing to fit more on smaller screens.',
        segmented([{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }], Prefs.data.density, function (v) { Prefs.set('density', v); refresh(false); })));
    }
    function buildUnits() {
      var src = detectSourceTempUnit();
      var unitOpts = [{ value: 'source', label: 'As Recorded' }, { value: 'C', label: 'Celsius' }, { value: 'F', label: 'Fahrenheit' }];
      var note = noData() ? 'The recorded unit is detected when you load a data folder.'
        : src ? 'Recorded in °' + src + '. Selecting a unit converts loaded data immediately.'
        : 'The recorded unit couldn’t be detected (mixed or missing), so values stay as recorded.';

      pane.appendChild(el('h4', { text: 'Temperature' }));
      pane.appendChild(prefRow('Display unit',
        'Applies to the graph, tooltips, analysis, and the raw-data viewer. ' + note,
        segmented(unitOpts, Prefs.data.tempUnit, function (v) {
          var s = detectSourceTempUnit();
          var oldEff = effectiveUnit(Prefs.data.tempUnit, s), newEff = effectiveUnit(v, s);
          Prefs.set('tempUnit', v);
          if (oldEff && newEff && oldEff !== newEff) convertAllAnnotations(oldEff, newEff);
          refresh(true);
        })));
      pane.appendChild(prefRow('Exported CSV unit',
        'The unit written by Organize & Export CSV. Keep "As Recorded" to preserve the original data exactly.',
        segmented(unitOpts, Prefs.data.exportUnit, function (v) { Prefs.set('exportUnit', v); })));

      pane.appendChild(el('h4', { text: 'Formatting' }));
      pane.appendChild(prefRow('Decimal places', 'Precision for temperature values in tooltips and analysis readouts.',
        segmented([{ value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 4, label: '4' }], Prefs.data.decimals, function (v) { Prefs.set('decimals', +v); refresh(false); })));
    }
    function buildGeneral() {
      pane.appendChild(el('h4', { text: 'Behavior' }));
      var cb = el('input', { type: 'checkbox' }); cb.checked = Prefs.data.confirmClose;
      cb.addEventListener('change', function () { Prefs.set('confirmClose', cb.checked); });
      pane.appendChild(prefRow('Warn before closing', 'Prompt to confirm when the tab is closed with unsaved analysis work.',
        el('label', { class: 'chk' }, [cb, el('span', { class: 'box', html: Icons.check })])));
      pane.appendChild(el('h4', { text: 'Reset' }));
      pane.appendChild(prefRow('Restore defaults', 'Reset every preference on this computer to its original value.',
        el('button', { class: 'btn sm', text: 'Restore defaults', onclick: function () { Prefs.reset(); refresh(true); renderRail(); toast('Preferences restored'); } })));
    }
    function renderPane() {
      clearNode(pane);
      if (active === 'appearance') buildAppearance();
      else if (active === 'units') buildUnits();
      else buildGeneral();
    }

    var prefsBox = el('div', { class: 'prefs' }, [rail, pane]);
    var wrap = el('div', {}, [prefsBox, el('p', { class: 'hint', style: 'margin-top:12px', text: 'Preferences are saved on this computer and persist between sessions.' })]);
    renderRail(); renderPane();
    modal({ title: 'Preferences', wide: true, body: wrap, actions: [{ label: 'Done', primary: true }] });
  }

  /* ---- chart toolbar ---- */
  function renderChartToolbar() {
    var host = els.chartToolbar; clearNode(host);
    if (noData()) return;
    var s = store.state;
    var fitBtn = el('button', { class: 'btn sm', html: Icons.fit + (view && view.autoMode === 'trial' ? ' Fit: Trial' : ' Fit: All'),
      title: 'Toggle auto-scale between all data and the trial window', onclick: function () { view.toggleAuto(); } });
    host.appendChild(fitBtn);
    host.appendChild(el('div', { class: 'divider' }));
    host.appendChild(segmented([{ value: 'line', label: 'Line' }, { value: 'scatter', label: 'Scatter' }], s.plotType, setPlotType));
    host.appendChild(el('div', { class: 'divider' }));
    host.appendChild(el('button', { class: 'btn sm icon' + (s.showGrid.major ? ' active' : ''), title: 'Major gridlines', html: Icons.grid, onclick: function () { s.showGrid.major = !s.showGrid.major; store.commit('grid'); } }));
    host.appendChild(el('button', { class: 'btn sm' + (s.showGrid.minor ? ' active' : ''), title: 'Minor gridlines', text: 'Minor', onclick: function () { s.showGrid.minor = !s.showGrid.minor; store.commit('grid'); } }));
    host.appendChild(el('button', { class: 'btn sm' + (s.legend ? ' active' : ''), title: 'Legend', text: 'Legend', onclick: function () { s.legend = !s.legend; store.commit('legend'); } }));
    host.appendChild(el('div', { style: 'flex:1' }));
    var titleEl = el('span', { class: 'lbl chart-name', title: 'Click to rename this graph', text: chartTitle() });
    titleEl.addEventListener('click', function () { editGraphName(titleEl); });
    host.appendChild(titleEl);
  }
  function editGraphName(spanEl) {
    var g = store.graph();
    var input = el('input', { class: 'chart-name-input', value: chartTitle() });
    spanEl.replaceWith(input);
    input.focus(); input.select();
    var done = false;
    function commit() {
      if (done) return; done = true;
      var v = input.value.trim();
      g.name = (v === '' || v === autoChartTitle()) ? null : v;  // empty or unchanged-from-auto -> revert
      store.commit('rename');   // re-renders toolbar (span back) + chart title
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { commit(); }
      else if (e.key === 'Escape') { done = true; renderChartToolbar(); }
    });
    input.addEventListener('blur', commit);
  }

  /* ============================ TABS =================================== */
  function setTab(name) {
    currentTab = name;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.classList.toggle('on', t.dataset.tab === name); });
    Array.prototype.forEach.call(document.querySelectorAll('.tab-pane'), function (p) { p.classList.toggle('on', p.dataset.pane === name); });
    if (name === 'raw') renderRaw();
    if (name === 'details') renderDetails();
    if (name === 'chart' && view) { view._resize(); sizeYPan(); view.render(); updatePanSliders(); }
  }
  function togglePanel(side) {
    var p = side === 'left' ? els.panelLeft : els.panelRight;
    p.classList.toggle('collapsed');
    if (view) setTimeout(function () { view._resize(); view.render(); }, 0);
  }

  /* ============================ RAW DATA =============================== */
  function renderRaw() {
    var host = els.rawWrap; clearNode(host);
    if (noData()) { host.appendChild(el('div', { class: 'empty', style: 'position:static;padding:60px', html: '<h3>No data</h3><p>Open a folder to view raw samples.</p>' })); return; }
    // gather all trials
    var trials = [];
    store.data.experiments.forEach(function (exp) { exp.trials.forEach(function (tr) { trials.push({ id: 'E' + exp.number + 'T' + tr.trial, label: 'E' + exp.number + 'T' + tr.trial, tr: tr }); }); });
    if (!rawTrialId || !trials.some(function (t) { return t.id === rawTrialId; })) rawTrialId = trials[0].id;
    var cur = trials.filter(function (t) { return t.id === rawTrialId; })[0];

    var bar = el('div', { class: 'raw-toolbar' });
    bar.appendChild(selectBox(trials.map(function (t) { return { value: t.id, label: t.label + '  ·  ' + t.tr.filename }; }), rawTrialId, function (v) { rawTrialId = v; rawPage = 0; renderRaw(); }));
    var tr = cur.tr, pageSize = 500, total = tr.timeSeconds.length, pages = Math.max(1, Math.ceil(total / pageSize));
    bar.appendChild(el('span', { class: 'pill', text: total + ' samples · ' + tr.channels.length + ' channel' + (tr.channels.length > 1 ? 's' : '') }));
    var pager = el('div', { class: 'row', style: 'margin-left:auto' }, [
      el('button', { class: 'btn sm', text: '‹ Prev', onclick: function () { if (rawPage > 0) { rawPage--; renderRaw(); } } }),
      el('span', { class: 'hint', text: 'Page ' + (rawPage + 1) + ' / ' + pages }),
      el('button', { class: 'btn sm', text: 'Next ›', onclick: function () { if (rawPage < pages - 1) { rawPage++; renderRaw(); } } }),
    ]);
    bar.appendChild(pager);
    host.appendChild(bar);

    var scroll = el('div', { class: 'raw-scroll' });
    var table = el('table', { class: 'data-table' });
    var conv = activeConversion();
    var chHead = tr.channels.map(function (c) { return conv ? c.name + ' (°' + conv.target + ')' : c.header; });
    var thead = el('tr', {}, [el('th', { class: 'idx', text: '#' }), el('th', { class: 'time', text: 'Time (s)' })].concat(chHead.map(function (h) { return el('th', { text: h }); })));
    table.appendChild(el('thead', {}, thead));
    var tbody = el('tbody', {});
    var start = rawPage * pageSize, end = Math.min(total, start + pageSize);
    for (var i = start; i < end; i++) {
      var cells = [el('td', { class: 'idx', text: i }), el('td', { class: 'time', text: fmt(tr.timeSeconds[i], 3) })];
      for (var c = 0; c < tr.channels.length; c++) {
        var raw = tr.channels[c].values[i];
        cells.push(el('td', { text: fmt(conv ? convTemp(raw, conv.src, conv.target) : raw, 4) }));
      }
      tbody.appendChild(el('tr', {}, cells));
    }
    table.appendChild(tbody); scroll.appendChild(table); host.appendChild(scroll);
  }

  /* ============================ DETAILS =============================== */
  function renderDetails() {
    var host = els.detailsWrap; clearNode(host);
    if (noData()) { host.appendChild(el('div', { class: 'empty', style: 'position:static;padding:60px', html: '<h3>No data</h3><p>Open a folder to view experiment details.</p>' })); return; }
    host.appendChild(el('h2', { class: 'page-title', text: 'Experiment Details' }));
    host.appendChild(el('p', { class: 'page-sub', text: store.data.folderName + ' · ' + store.data.experiments.length + ' experiments · ' + store.data.parsedTrials.length + ' files parsed' }));

    var warnings = store.data.parsedTrials.filter(function (t) { return t.error || (t.warnings && t.warnings.length); });
    if (warnings.length) {
      var wc = el('div', { class: 'detail-card', style: 'margin-top:14px;border-color:var(--border)' });
      wc.appendChild(el('h4', { class: 'tag-warn', text: '⚠ ' + warnings.length + ' file note' + (warnings.length > 1 ? 's' : '') }));
      warnings.forEach(function (t) {
        wc.appendChild(el('div', { class: 'kv', html: '<span class="k">' + t.filename + '</span><span class="v">' + (t.error || t.warnings.join('; ')) + '</span>' }));
      });
      host.appendChild(wc);
    }

    store.data.experiments.forEach(function (exp) {
      host.appendChild(el('h3', { style: 'margin:22px 0 2px', text: 'Experiment ' + exp.number }));
      var grid = el('div', { class: 'detail-grid' });
      exp.trials.forEach(function (tr) {
        var card = el('div', { class: 'detail-card' });
        card.appendChild(el('h4', { text: 'Trial ' + tr.trial }));
        kv(card, 'Device', tr.device || '–');
        kv(card, 'Serial', tr.serialNumber || '–');
        kv(card, 'Channels', tr.channels.map(function (c) { return c.name; }).join(', '));
        kv(card, 'Units', (tr.channels[0] && tr.channels[0].unit) || '–');
        kv(card, 'Samples', tr.sampleCount);
        kv(card, 'Scan rate', tr.scanRate != null ? tr.scanRate.toFixed(2) + ' Hz' : '–');
        kv(card, 'Time format', tr.timeMode === 'clock' ? 'clock → seconds' : 'seconds');
        kv(card, 'Start time', tr.startTimeRaw || '–');
        kv(card, 'Duration', tr.timeSeconds.length ? (tr.timeSeconds[tr.timeSeconds.length - 1] - tr.timeSeconds[0]).toFixed(2) + ' s' : '–');
        grid.appendChild(card);
      });
      host.appendChild(grid);
    });
  }
  function kv(card, k, v) { card.appendChild(el('div', { class: 'kv', html: '<span class="k">' + k + '</span><span class="v">' + v + '</span>' })); }

  /* ============================ FOLDER / FILES ========================= */
  function openFolder() { els.folderInput.value = ''; els.folderInput.click(); }
  function onFolderPicked(e) {
    var files = Array.prototype.slice.call(e.target.files).filter(function (f) { return /\.csv$/i.test(f.name); });
    if (!files.length) { toast('No .csv files found in that folder'); return; }
    var folderName = files[0].webkitRelativePath ? files[0].webkitRelativePath.split('/')[0] : 'data';
    var fp = store.state.filenamePattern || { mode: 'auto' };
    var rx = fp.mode === 'template' ? Parser.buildFilenameRegex(fp.template) : null;
    Promise.all(files.map(function (f) { return f.text().then(function (txt) { return Parser.parseDaqamiCsv(txt, f.name, { filenameRegex: rx }); }); }))
      .then(function (parsed) {
        var ok = parsed.filter(function (p) { return !p.error && p.experiment != null; });
        var skipped = parsed.filter(function (p) { return p.error || p.experiment == null; }).map(function (p) {
          return { name: p.filename, reason: p.error ? 'Not a readable DAQami CSV' : 'Name doesn’t match the experiment/trial pattern' };
        });
        if (ok.length) {
          clearCaches();
          store.setData(parsed, folderName);
          els.chartEmpty.style.display = 'none';
          if (view) { view.setAutoDirty(); view.fitAll(); }
          var warned = ok.filter(function (p) { return p.warnings && p.warnings.length; }).length;
          if (!skipped.length) {
            toast('Loaded ' + ok.length + ' trials across ' + store.data.experiments.length + ' experiment' + (store.data.experiments.length > 1 ? 's' : '') +
              (warned ? ' · ' + warned + ' with data warnings (see Details)' : ''));
          }
        }
        if (skipped.length) unmatchedDialog(skipped, ok.length);
      });
  }

  function unmatchedDialog(skipped, loadedCount) {
    var body = el('div', {});
    var head = loadedCount
      ? 'Loaded ' + loadedCount + ' file' + (loadedCount > 1 ? 's' : '') + ', but ' + skipped.length + ' couldn’t be identified'
      : 'None of the files could be identified';
    body.appendChild(el('div', { class: 'warn-banner' }, [
      el('span', { class: 'warn-ico', html: Icons.warn || '⚠' }),
      el('div', {}, [
        el('div', { style: 'font-weight:600;margin-bottom:3px', text: head }),
        el('div', { class: 'hint', text: 'ThermoScope reads the experiment and trial numbers from the start of each file name. The files below don’t match the pattern currently in use.' }),
      ]),
    ]));
    body.appendChild(el('p', { class: 'hint', style: 'margin:14px 0 6px', html:
      'To fix this, open <b>Settings → File Name Pattern…</b> to choose auto-detect or describe your own naming (e.g. <code>Experiment {e} - Trial {t}</code>). Recognized styles are also listed under <b>Help → DAQami Format Notes</b>.' }));
    body.appendChild(capLabel('Skipped files (' + skipped.length + ')', 10));
    var list = el('div', { class: 'file-list' });
    skipped.forEach(function (s) {
      list.appendChild(el('div', { class: 'file-list-row' }, [
        el('span', { class: 'fl-name', text: s.name, title: s.name }),
        el('span', { class: 'fl-reason', text: s.reason }),
      ]));
    });
    body.appendChild(list);
    modal({ title: 'Some files were skipped', body: body, actions: [
      { label: 'Dismiss' },
      { label: 'Open File Name Pattern…', primary: true, onClick: function () { setTimeout(filenamePatternDialog, 0); } },
    ] });
  }

  /* ============================ ORGANIZE =============================== */
  function organizeDialog() {
    var opts = { layout: 'stacked', includeHeader: true };
    var body = el('div', {});
    body.appendChild(el('p', { class: 'hint', text: 'Builds one CSV grouped by experiment. Every trial keeps its own Time + channel columns — select an experiment block in Excel and insert an XY-scatter to chart all trials at once.' }));
    body.appendChild(el('label', { style: 'display:block;font-size:11px;color:var(--text-3);margin:16px 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:.4px', text: 'Arrange experiment tables' }));
    var seg = segmented([{ value: 'stacked', label: 'Stacked (top to bottom)' }, { value: 'sideBySide', label: 'Side by side' }], opts.layout, function (v) { opts.layout = v; });
    body.appendChild(seg);
    body.appendChild(el('div', { style: 'margin-top:16px' }, checkbox('Include per-trial detail header (device, date, scan rate, duration…)', true, function (v) { opts.includeHeader = v; })));
    var ec = conversionFor(Prefs.data.exportUnit);
    var src = detectSourceTempUnit();
    var unitText = ec ? '°' + ec.target : (src ? '°' + src + ' (as recorded)' : 'as recorded');
    body.appendChild(el('p', { class: 'hint', style: 'margin-top:14px', html: 'Temperature values exported in <b>' + unitText + '</b> — change in Settings → Preferences → Units & Format.' }));
    modal({
      title: 'Organize & Export CSV', body: body, actions: [
        { label: 'Cancel' },
        { label: 'Export CSV', primary: true, onClick: function () {
          if (ec) opts.convert = { fn: function (v) { return convTemp(v, ec.src, ec.target); }, unit: '°' + ec.target };
          var csv = Organizer.buildOrganizedCsv(store.data.experiments, opts);
          saveWithPicker((store.data.folderName || 'data') + '-organized.csv', fsTypes('text/csv', ['.csv']),
            function (cb) { cb(textBlob('﻿' + csv, 'text/csv')); });
        } },
      ],
    });
  }

  /* ============================ EXPORT IMG ============================= */
  function exportPngDialog() {
    var scale = 2, name = (store.data.folderName || 'thermoscope') + '-graph';
    var body = el('div', {});
    body.appendChild(field('File name', (function () { var i = el('input', { class: 'input', value: name }); i.addEventListener('input', function () { name = i.value; }); return i; })()));
    body.appendChild(el('label', { style: 'display:block;font-size:11px;color:var(--text-3);margin:8px 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:.4px', text: 'Resolution' }));
    body.appendChild(segmented([{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 3, label: '3×' }, { value: 4, label: '4×' }], scale, function (v) { scale = +v; }));
    modal({ title: 'Export PNG', body: body, actions: [
      { label: 'Cancel' },
      { label: 'Export', primary: true, onClick: function () {
        saveWithPicker(name + '.png', fsTypes('image/png', ['.png']), function (cb) { view.exportPNG(scale, cb); });
      } },
    ] });
  }
  function exportSvg() {
    var svg = view.exportSVG();
    saveWithPicker((store.data.folderName || 'thermoscope') + '-graph.svg', fsTypes('image/svg+xml', ['.svg']),
      function (cb) { cb(textBlob(svg, 'image/svg+xml')); });
  }

  /* ============================ SESSION =============================== */
  function saveSessionDialog() {
    var mode = 'all', name = (store.data.folderName || 'session') + '.thermo.json';
    var body = el('div', {});
    body.appendChild(field('File name', (function () { var i = el('input', { class: 'input', value: name }); i.addEventListener('input', function () { name = i.value; }); return i; })()));
    body.appendChild(el('label', { style: 'display:block;font-size:11px;color:var(--text-3);margin:8px 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:.4px', text: 'Include analysis work' }));
    var list = el('div', { class: 'radio-list' });
    [['all', 'All analysis work', 'Averages, areas, fits, smoothing, cursors, thresholds, manual items'],
     ['manual', 'Manual points & lines only', 'Keep annotations, drop computed overlays'],
     ['none', 'None', 'Styling & layout only']].forEach(function (o) {
      var row = el('div', { class: 'radio-row' + (mode === o[0] ? ' on' : ''), onclick: function () { mode = o[0]; Array.prototype.forEach.call(list.children, function (c, i) { c.classList.toggle('on', ['all', 'manual', 'none'][i] === mode); }); } },
        [el('span', { class: 'dot' }), el('div', {}, [el('div', { class: 'rl-title', text: o[1] }), el('div', { class: 'rl-sub', text: o[2] })])]);
      list.appendChild(row);
    });
    body.appendChild(list);
    modal({ title: 'Save Session', body: body, actions: [
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: function () {
        var ses = store.serializeSession();
        if (mode !== 'all') {
          for (var k in ses.workspace.graphs) {
            var g = ses.workspace.graphs[k];
            var keepManual = mode === 'manual';
            ses.workspace.graphs[k] = Object.assign(TS.freshGraph(), keepManual ? { manualPoints: g.manualPoints, manualLines: g.manualLines } : {});
          }
        }
        saveWithPicker(name, fsTypes('application/json', ['.json']),
          function (cb) { cb(textBlob(JSON.stringify(ses, null, 2), 'application/json')); });
        store.state.dirty = false;
      } },
    ] });
  }
  function loadSession() {
    var inp = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files[0]; if (!f) return;
      f.text().then(function (txt) {
        var obj; try { obj = JSON.parse(txt); } catch (e) { toast('Not a valid session file'); return; }
        if (!obj.workspace) { toast('Unrecognized session file'); return; }
        if (store.data.experiments.length) { store.loadSessionInto(obj); toast('Session loaded'); }
        else { store.prepareRestore(obj); toast('Open the matching data folder to finish loading'); openFolder(); }
        inp.remove();
      });
    });
    inp.click();
  }

  /* ============================ HELP DIALOGS =========================== */
  function aboutDialog() {
    modal({ title: 'About ThermoScope', body:
      '<p class="hint" style="line-height:1.6">ThermoScope organizes, graphs, and analyzes DAQami thermocouple exports. It runs entirely in your browser — no install, no server, works offline. Your files never leave your computer.</p>' +
      '<p class="hint" style="line-height:1.6;margin-top:10px">Built for the Center for Industrial &amp; Medical Ultrasound (CIMU).</p>',
      actions: [{ label: 'Close', primary: true }] });
  }
  function formatDialog() {
    modal({ title: 'DAQami Format Notes', wide: true, body:
      '<p class="hint" style="line-height:1.6">ThermoScope reads DAQami analog CSV exports. It detects:</p>' +
      '<ul class="hint" style="line-height:1.7;margin-top:8px"><li>The metadata block and the <code>Sample</code> header row (any metadata length).</li>' +
      '<li>Clock timestamps (<code>Date/Time</code>) <b>and</b> seconds (<code>Time (s)</code>). Clock times are converted to seconds since the file\'s Start Time automatically.</li>' +
      '<li>Any number of channels (AI0, AI1, …), read from the header.</li>' +
      '<li>Experiment/trial numbers from the file name. Auto-detect recognizes <code>E1T1</code>, <code>E1-T1</code>, <code>Experiment 1 - Trial 1</code>, <code>Exp1 Tr1</code>, and similar. Set your own under <b>Settings → File Name Pattern</b>.</li></ul>',
      actions: [{ label: 'Close', primary: true }] });
  }
  function shortcutsDialog() {
    modal({ title: 'Keyboard Shortcuts', body:
      '<div class="readout" style="font-size:12px"><div><span class="rk">Open folder</span><span class="rv">Ctrl + O</span></div>' +
      '<div><span class="rk">Undo / Redo</span><span class="rv">Ctrl+Z / Ctrl+Y</span></div>' +
      '<div><span class="rk">Zoom both axes</span><span class="rv">Scroll</span></div>' +
      '<div><span class="rk">Zoom X only</span><span class="rv">Ctrl + Scroll</span></div>' +
      '<div><span class="rk">Zoom Y only</span><span class="rv">Alt + Scroll</span></div>' +
      '<div><span class="rk">Pan</span><span class="rv">Drag chart</span></div>' +
      '<div><span class="rk">Drop point / cursor</span><span class="rv">Double-click chart</span></div></div>',
      actions: [{ label: 'Close', primary: true }] });
  }

  /* ============================ SAVE / DOWNLOAD ======================= */
  function downloadBlob(blob, filename) {
    var a = el('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function textBlob(text, mime) { return new Blob([text], { type: mime || 'text/plain' }); }
  function fsTypes(mime, exts) { var accept = {}; accept[mime] = exts; return [{ description: mime, accept: accept }]; }
  /* Ask the user where to save (File System Access API) with a download fallback.
   * produceBlob(cb) calls cb(blob) — deferred so PNG rendering can happen after
   * the save location is chosen. Must be invoked from within a user gesture. */
  function saveWithPicker(suggestedName, types, produceBlob) {
    if (window.showSaveFilePicker) {
      window.showSaveFilePicker({ suggestedName: suggestedName, types: types }).then(function (handle) {
        produceBlob(function (blob) {
          handle.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
            .then(function () { toast('Saved: ' + (handle.name || suggestedName)); })
            .catch(function () { toast('Could not write the file'); });
        });
      }).catch(function (e) {
        if (e && e.name === 'AbortError') return; // user cancelled the dialog
        produceBlob(function (blob) { downloadBlob(blob, suggestedName); toast('Saved to Downloads'); });
      });
    } else {
      produceBlob(function (blob) { downloadBlob(blob, suggestedName); toast('Saved to Downloads'); });
    }
  }

  /* ============================ TOOLTIP / STATUS ====================== */
  function onHover(h, pos) {
    var tt = els.tooltip;
    var col = h.primary.color;
    var u = currentUnit(), us = u ? ' ' + u : '';
    var html = '<div class="tt-title"><span class="tt-swatch" style="background:' + col + '"></span>' + h.primary.label + '</div>';
    html += '<div class="tt-row"><span>time</span><span class="v">' + fmt(h.time, 3) + ' s</span></div>';
    html += '<div class="tt-row"><span>value</span><span class="v">' + fmtT(h.primary.value) + us + '</span></div>';
    html += '<div class="tt-row"><span>d/dt</span><span class="v">' + fmt(h.primary.dydt, 4) + (u ? ' ' + u + '/s' : ' /s') + '</span></div>';
    h.others.forEach(function (o) { html += '<div class="tt-row"><span><span class="tt-swatch" style="display:inline-block;background:' + o.color + '"></span> ' + o.label + '</span><span class="v">' + fmtT(o.value) + '</span></div>'; });
    tt.innerHTML = html; tt.style.display = 'block';
    var tw = tt.offsetWidth, th = tt.offsetHeight;
    var x = pos.clientX + 16, y = pos.clientY + 16;
    if (x + tw > window.innerWidth - 8) x = pos.clientX - tw - 16;
    if (y + th > window.innerHeight - 8) y = pos.clientY - th - 16;
    tt.style.left = x + 'px'; tt.style.top = y + 'px';
    els.sbHover.innerHTML = '<b>t</b> ' + fmt(h.time, 3) + 's &nbsp; <b>T</b> ' + fmtT(h.primary.value) + us + ' &nbsp; <b>d/dt</b> ' + fmt(h.primary.dydt, 4);
  }
  function onHoverEnd() { els.tooltip.style.display = 'none'; els.sbHover.innerHTML = ''; }

  /* ============================ PAN SLIDERS =========================== */
  function dataExtent() {
    var series = seriesForCurrentGraph();
    var xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    series.forEach(function (s) {
      if (s.visibility === 'off' || !s.xs.length) return;
      if (s.xs[0] < xMin) xMin = s.xs[0]; if (s.xs[s.xs.length - 1] > xMax) xMax = s.xs[s.xs.length - 1];
      var st = Analysis.seriesStats(s.xs, s.ys); if (st) { if (st.min < yMin) yMin = st.min; if (st.max > yMax) yMax = st.max; }
    });
    if (!isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1; }
    return { xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax };
  }
  /* Time span that EVERY graphed trial covers: [latest start, earliest end].
   * Keeps the second cursor at the last point common to all trials rather than
   * at the single longest trial's end. */
  function commonDataRange() {
    var series = seriesForCurrentGraph().filter(function (s) { return s.visibility !== 'off' && s.xs && s.xs.length; });
    if (!series.length) { var e = dataExtent(); return [e.xMin, e.xMax]; }
    var start = -Infinity, end = Infinity;
    series.forEach(function (s) {
      if (s.xs[0] > start) start = s.xs[0];
      if (s.xs[s.xs.length - 1] < end) end = s.xs[s.xs.length - 1];
    });
    if (!(end > start)) { var e2 = dataExtent(); return [e2.xMin, e2.xMax]; } // no overlap
    return [start, end];
  }
  var settingSliders = false;
  function updatePanSliders() {
    if (noData() || !view) return;
    settingSliders = true;
    var v = view.getView(), ext = dataExtent();
    var xc = (v.xMin + v.xMax) / 2, yc = (v.yMin + v.yMax) / 2;
    var xf = (xc - ext.xMin) / (ext.xMax - ext.xMin || 1);
    var yf = (yc - ext.yMin) / (ext.yMax - ext.yMin || 1);
    els.xPan.value = Math.max(0, Math.min(1000, xf * 1000));
    els.yPan.value = Math.max(0, Math.min(1000, yf * 1000)); // rotated slider: 0=bottom
    els.xPan.disabled = els.yPan.disabled = false;
    settingSliders = false;
  }
  function sizeYPan() { // rotated horizontal slider: width == the chart height
    if (!els.yPan || !els.yPan.parentNode) return;
    var h = els.yPan.parentNode.clientHeight;
    if (h > 0) els.yPan.style.width = h + 'px';
  }

  /* ============================ UPDATE ALL ============================ */
  function updateAll() {
    Theme.apply(store.state.theme);
    applyAppearance();
    els.themeBtn.innerHTML = store.state.theme === 'dark' ? Icons.sun : Icons.moon;
    var nd = noData();
    var gk = nd ? null : store.graphKey();
    if (gk !== selectionKey) { selection = {}; selectionKey = gk; }   // reset selection when the graph changes
    els.folderChip.textContent = nd ? 'No data loaded' : (store.data.folderName + ' · ' + store.data.experiments.length + ' exp · ' + store.data.parsedTrials.length + ' files');
    ['organizeBtn', 'exportPngBtn', 'exportSvgBtn'].forEach(function (id) { els[id].disabled = nd; });
    els.undoBtn.disabled = !store.canUndo(); els.redoBtn.disabled = !store.canRedo();
    els.chartEmpty.style.display = nd ? 'flex' : 'none';
    if (!nd) els.sbMode.innerHTML = '<b>' + (store.state.graphMode === 'COMPARE_EXP' ? 'Custom' : DataModel.MODES[store.state.graphMode].label) + '</b>';
    else els.sbMode.innerHTML = '';
    renderLeft(); renderRight(); renderChartToolbar();
    updateStatusCounts();
    if (view) { view._resize(); view.setAutoDirty(); view.render(); sizeYPan(); updatePanSliders(); }
    if (currentTab === 'raw') renderRaw();
    if (currentTab === 'details') renderDetails();
  }

  /* ============================ BOOT ================================= */
  function boot() {
    ['menus', 'folderChip', 'themeBtn', 'toolbar', 'panelLeft', 'panelRight', 'leftScroll', 'rightScroll',
     'chartToolbar', 'chartWrap', 'chart', 'chartEmpty', 'rawWrap', 'detailsWrap', 'tooltip', 'overlay',
     'toastHost', 'folderInput', 'xPan', 'yPan', 'statusbar', 'sbMode', 'sbHover', 'sbCount',
     'organizeBtn', 'exportPngBtn', 'exportSvgBtn', 'undoBtn', 'redoBtn'].forEach(function (id) { els[id] = $(id); });

    Prefs.load();
    buildMenus();
    Theme.apply(store.state.theme);
    applyAppearance();

    view = new TS.ChartView(els.chart, {
      buildScene: buildScene, onHover: onHover, onHoverEnd: onHoverEnd,
      onViewChange: function () { updatePanSliders(); renderChartToolbar(); },
      onAutoModeChange: function () { renderChartToolbar(); },
      onManualPointMove: function (id, x, y) { var g = store.graph(); g.manualPoints.forEach(function (p) { if (p.id === id) { p.x = x; p.y = y; } }); },
      onManualPointDrop: function () { store.commit('manual-move'); },
      onPlotDblClick: onPlotDblClick,
      onSeriesClick: onSeriesClick,
      onContextMenu: onChartContextMenu,
    });

    // toolbar buttons
    $('openFolderBtn').addEventListener('click', openFolder);
    $('openFolderBtn2').addEventListener('click', openFolder);
    els.organizeBtn.addEventListener('click', organizeDialog);
    els.exportPngBtn.addEventListener('click', exportPngDialog);
    els.exportSvgBtn.addEventListener('click', exportSvg);
    els.undoBtn.addEventListener('click', function () { store.undo(); });
    els.redoBtn.addEventListener('click', function () { store.redo(); });
    els.themeBtn.addEventListener('click', function () { setTheme(store.state.theme === 'dark' ? 'light' : 'dark'); });
    $('toggleLeftBtn').innerHTML = Icons.panelLeft; $('toggleLeftBtn').addEventListener('click', function () { togglePanel('left'); });
    $('toggleRightBtn').innerHTML = Icons.panelRight; $('toggleRightBtn').addEventListener('click', function () { togglePanel('right'); });
    els.folderInput.addEventListener('change', onFolderPicked);

    // toolbar icons
    $('openFolderBtn').querySelector('.ic').innerHTML = Icons.folder;
    els.organizeBtn.querySelector('.ic').innerHTML = Icons.download;
    els.exportPngBtn.querySelector('.ic').innerHTML = Icons.image;
    els.exportSvgBtn.querySelector('.ic').innerHTML = Icons.image;
    els.undoBtn.innerHTML = Icons.undo; els.redoBtn.innerHTML = Icons.redo;

    // tabs
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.addEventListener('click', function () { setTab(t.dataset.tab); }); });

    // pan sliders
    els.xPan.addEventListener('input', function () { if (settingSliders) return; view.panAxisTo('x', els.xPan.value / 1000, { min: dataExtent().xMin, max: dataExtent().xMax }); });
    els.xPan.addEventListener('change', function () { store.notify(); });
    els.yPan.addEventListener('input', function () { if (settingSliders) return; view.panAxisTo('y', els.yPan.value / 1000, { min: dataExtent().yMin, max: dataExtent().yMax }); });
    els.yPan.addEventListener('change', function () { store.notify(); });
    if (window.ResizeObserver) new ResizeObserver(sizeYPan).observe(els.yPan.parentNode);
    window.addEventListener('resize', function () { sizeYPan(); updatePanSliders(); });
    sizeYPan();

    // keyboard
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); }
      else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFolder(); }
      else if (mod && e.key === ',') { e.preventDefault(); preferencesDialog(); }
    });

    window.addEventListener('beforeunload', function (e) {
      if (store.state.dirty && Prefs.data.confirmClose) { e.preventDefault(); e.returnValue = ''; return ''; }
    });

    store.subscribe(updateAll);
    updateAll();

    // Testing hook (harmless): drive a load without the native folder picker.
    TS.__test = {
      store: store, get view() { return view; },
      loadParsed: function (parsed, name) {
        clearCaches();
        store.setData(parsed, name || 'data');
        els.chartEmpty.style.display = 'none';
        view.setAutoDirty(); view.fitAll();
      },
      buildScene: buildScene, organize: organizeDialog, unmatched: unmatchedDialog,
      parseManual: parseManual, prefs: Prefs, detectUnit: detectSourceTempUnit,
    };
  }

  function onPlotDblClick(x, y) {
    var g = store.graph();
    // Prefer filling cursor slots if the cursor tool is active/open; else drop a point.
    if (toolOpen.cursor && g.cursors.length < 2) { g.cursors.push(x); store.commit('cursor-add'); return; }
    g.manualPoints.push({ id: store.uid('pt'), x: x, y: y, color: accentHex(), customLabel: null, showLabel: true });
    store.commit('manual-dblclick');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.TS = window.TS || {});
