/* =============================================================================
 * chartview.js — Owns a live <canvas>, the current pan/zoom view, and all
 * pointer interaction. Draws by calling the shared renderChart, then paints the
 * hover crosshair on top so the export path (SVG) and the live view share the
 * same base drawing.
 * ============================================================================= */
(function (TS) {
  'use strict';
  var R = TS.Renderer, A = TS.Analysis;

  function ChartView(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.view = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    this.autoMode = 'all';          // 'all' | 'trial' | null(manual)
    this._autoDirty = true;
    this._scene = null;
    this._layout = null;
    this._hover = null;
    this._drag = null;
    this._dpr = window.devicePixelRatio || 1;
    this._bind();
    var self = this;
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self._resize(); self.render(); });
      this._ro.observe(canvas.parentNode);
    }
    this._resize();
  }

  ChartView.prototype = {
    /* ---- sizing ---- */
    _resize: function () {
      var p = this.canvas.parentNode;
      var w = Math.max(50, p.clientWidth), h = Math.max(50, p.clientHeight);
      this._dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(w * this._dpr);
      this.canvas.height = Math.round(h * this._dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.cssW = w; this.cssH = h;
    },

    setAutoDirty: function () { this._autoDirty = true; },

    /* ---- auto bounds ---- */
    _computeAutoBounds: function (scene) {
      var xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      var useTrialX = this.autoMode === 'trial' && scene.trialWindow;
      (scene.series || []).forEach(function (s) {
        if (s.visibility === 'off' || !s.xs || !s.xs.length) return;
        var lo = 0, hi = s.xs.length - 1;
        if (useTrialX) {
          lo = Math.max(0, A.floorIndex(s.xs, scene.trialWindow.x0));
          hi = A.floorIndex(s.xs, scene.trialWindow.x1); if (hi < 0) hi = s.xs.length - 1; else hi = Math.min(s.xs.length - 1, hi + 1);
        }
        for (var i = lo; i <= hi; i++) {
          var x = s.xs[i], y = s.ys[i];
          if (isNaN(x) || isNaN(y)) continue;
          if (x < xMin) xMin = x; if (x > xMax) xMax = x;
          if (y < yMin) yMin = y; if (y > yMax) yMax = y;
        }
      });
      (scene.overlays && scene.overlays.manualPoints || []).forEach(function (p) {
        if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
      });
      if (!isFinite(xMin)) { xMin = 0; xMax = 1; yMin = 0; yMax = 1; }
      if (useTrialX) { xMin = scene.trialWindow.x0; xMax = scene.trialWindow.x1; }
      var xpad = (xMax - xMin) * 0.03 || 0.5;
      var ypad = (yMax - yMin) * 0.08 || 0.5;
      this.view = { xMin: xMin - xpad, xMax: xMax + xpad, yMin: yMin - ypad, yMax: yMax + ypad };
    },

    /* ---- render ---- */
    render: function () {
      if (!this.opts.buildScene) return;
      var scene = this.opts.buildScene();
      this._scene = scene;
      if (this.autoMode && this._autoDirty) { this._computeAutoBounds(scene); this._autoDirty = false; }
      scene.view = this.view;

      var c = this.ctx;
      c.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
      c.clearRect(0, 0, this.cssW, this.cssH);
      var rd = new R.CanvasRenderer(c);
      this._layout = R.renderChart(rd, this.cssW, this.cssH, scene);
      if (this._hover && this._hover.found) this._drawHover();
    },

    _drawHover: function () {
      var L = this._layout; if (!L || !L.sx) return;
      var h = this._hover, rd = new R.CanvasRenderer(this.ctx), T = this._scene.theme;
      var px = L.sx.toPixel(h.time);
      rd.save(); rd.clipRect(L.plot.x, L.plot.y, L.plot.w, L.plot.h);
      rd.beginPath(); rd.moveTo(px, L.plot.y); rd.lineTo(px, L.plot.y + L.plot.h);
      rd.strokePath({ color: T.crosshair, width: 1, dash: [3, 3], alpha: 0.8 });
      h.points.forEach(function (pt) {
        var cy = L.sy.toPixel(pt.value); if (isNaN(cy)) return;
        R.drawMarker(rd, 'circle', px, cy, 4.5, { color: pt.color, alpha: 1 });
        rd.beginPath();
        (function () { // ring
          for (var i = 0; i <= 24; i++) { var a = i / 24 * Math.PI * 2, xx = px + Math.cos(a) * 4.5, yy = cy + Math.sin(a) * 4.5; if (i === 0) rd.moveTo(xx, yy); else rd.lineTo(xx, yy); }
        })();
        rd.strokePath({ color: T.surface, width: 1.5 });
      });
      rd.restore();
    },

    /* ---- interaction ---- */
    _bind: function () {
      var self = this, cv = this.canvas;
      cv.addEventListener('wheel', function (e) { self._onWheel(e); }, { passive: false });
      cv.addEventListener('mousedown', function (e) { self._onDown(e); });
      window.addEventListener('mousemove', function (e) { self._onMove(e); });
      window.addEventListener('mouseup', function (e) { self._onUp(e); });
      cv.addEventListener('mouseleave', function () { if (!self._drag) { self._hover = null; self.render(); if (self.opts.onHoverEnd) self.opts.onHoverEnd(); } });
      cv.addEventListener('dblclick', function (e) { self._onDblClick(e); });
    },

    _rel: function (e) {
      var r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    },
    _inPlot: function (p) {
      var pl = this._layout && this._layout.plot; if (!pl) return false;
      return p.x >= pl.x && p.x <= pl.x + pl.w && p.y >= pl.y && p.y <= pl.y + pl.h;
    },

    _onWheel: function (e) {
      if (!this._layout || !this._layout.sx) return;
      e.preventDefault();
      var p = this._rel(e);
      var factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      var zoomX = !e.altKey;          // alt = y only
      var zoomY = !e.ctrlKey && !e.metaKey; // ctrl/cmd = x only
      if (e.altKey) { zoomX = false; zoomY = true; }
      if (e.ctrlKey || e.metaKey) { zoomX = true; zoomY = false; }
      var L = this._layout;
      if (zoomX) {
        var fx = (p.x - L.plot.x) / L.plot.w;
        this._zoom('x', factor, Math.min(1, Math.max(0, fx)));
      }
      if (zoomY) {
        var fy = 1 - (p.y - L.plot.y) / L.plot.h;
        this._zoom('y', factor, Math.min(1, Math.max(0, fy)));
      }
      this._exitAuto();
      this.render();
      this._emitView();
    },
    _zoom: function (axis, factor, pivotFrac) {
      var lo = axis === 'x' ? this.view.xMin : this.view.yMin;
      var hi = axis === 'x' ? this.view.xMax : this.view.yMax;
      var pivot = lo + (hi - lo) * pivotFrac;
      var nLo = pivot - (pivot - lo) * factor;
      var nHi = pivot + (hi - pivot) * factor;
      if (axis === 'x') { this.view.xMin = nLo; this.view.xMax = nHi; }
      else { this.view.yMin = nLo; this.view.yMax = nHi; }
    },

    _onDown: function (e) {
      var p = this._rel(e);
      if (!this._inPlot(p) || !this._layout.sx) return;
      // hit-test manual points for dragging
      var hit = this._hitManualPoint(p);
      if (hit) { this._drag = { type: 'point', id: hit.id }; this.canvas.style.cursor = 'grabbing'; return; }
      this._drag = { type: 'pan', startX: p.x, startY: p.y, view: Object.assign({}, this.view) };
      this.canvas.style.cursor = 'grabbing';
    },
    _hitManualPoint: function (p) {
      var L = this._layout, pts = this._scene && this._scene.overlays && this._scene.overlays.manualPoints;
      if (!pts) return null;
      for (var i = 0; i < pts.length; i++) {
        var px = L.sx.toPixel(pts[i].x), py = L.sy.toPixel(pts[i].y);
        if (Math.abs(px - p.x) <= 8 && Math.abs(py - p.y) <= 8) return pts[i];
      }
      return null;
    },
    _onMove: function (e) {
      var p = this._rel(e);
      if (this._drag) {
        if (this._drag.type === 'pan') {
          var L = this._layout;
          var dxData = ((p.x - this._drag.startX) / L.plot.w) * (this._drag.view.xMax - this._drag.view.xMin);
          var dyData = ((p.y - this._drag.startY) / L.plot.h) * (this._drag.view.yMax - this._drag.view.yMin);
          this.view.xMin = this._drag.view.xMin - dxData;
          this.view.xMax = this._drag.view.xMax - dxData;
          this.view.yMin = this._drag.view.yMin + dyData;
          this.view.yMax = this._drag.view.yMax + dyData;
          this._exitAuto();
          this.render();
        } else if (this._drag.type === 'point') {
          var L2 = this._layout;
          var x = L2.sx.toData(p.x), y = L2.sy.toData(p.y);
          if (this.opts.onManualPointMove) this.opts.onManualPointMove(this._drag.id, x, y);
          this.render();
        }
        return;
      }
      // hover — only when the pointer is directly over the canvas, so an open
      // modal / color popover sitting above the chart doesn't drive the crosshair.
      if (!this._layout || !this._layout.sx) return;
      if (e.target === this.canvas && this._inPlot(p)) {
        this.canvas.style.cursor = this._hitManualPoint(p) ? 'grab' : 'crosshair';
        this._updateHover(p);
      } else {
        if (this._hover) { this._hover = null; this.render(); if (this.opts.onHoverEnd) this.opts.onHoverEnd(); }
        if (e.target === this.canvas) this.canvas.style.cursor = 'default';
      }
    },
    _onUp: function () {
      if (this._drag) {
        var wasPoint = this._drag.type === 'point';
        this._drag = null;
        this.canvas.style.cursor = 'crosshair';
        if (wasPoint && this.opts.onManualPointDrop) this.opts.onManualPointDrop();
        else if (this.opts.onViewChange) this.opts.onViewChange();
      }
    },
    _onDblClick: function (e) {
      var p = this._rel(e);
      if (this._inPlot(p) && this.opts.onPlotDblClick && this._layout.sx) {
        this.opts.onPlotDblClick(this._layout.sx.toData(p.x), this._layout.sy.toData(p.y), e);
      }
    },

    _updateHover: function (p) {
      var L = this._layout, scene = this._scene;
      var time = L.sx.toData(p.x);
      var candidates = [];
      (scene.series || []).forEach(function (s) {
        if (s.visibility === 'off' || !s.xs || !s.xs.length) return;
        candidates.push({ xs: s.xs, ys: s.ys, color: s.color, label: s.label, isSeries: true });
      });
      (scene.overlays && scene.overlays.averageLines || []).forEach(function (a) {
        candidates.push({ xs: a.xs, ys: a.ys, color: a.color, label: a.label || 'Average', isAvg: true });
      });
      if (!candidates.length) { this._hover = null; this.render(); if (this.opts.onHoverEnd) this.opts.onHoverEnd(); return; }

      var best = null, bestDist = Infinity, bestVal = NaN;
      candidates.forEach(function (c) {
        var idx = A.nearestIndex(c.xs, time);
        var val = c.ys[idx];
        if (isNaN(val)) return;
        var dpx = L.sx.toPixel(c.xs[idx]) - p.x, dpy = L.sy.toPixel(val) - p.y;
        var d = Math.sqrt(dpx * dpx + dpy * dpy);
        if (d < bestDist) { bestDist = d; best = c; bestVal = val; best._idx = idx; }
      });
      if (!best || bestDist > 60) { this._hover = null; this.render(); if (this.opts.onHoverEnd) this.opts.onHoverEnd(); return; }

      var atTime = best.xs[best._idx];
      var dydt = A.localSlope(best.xs, best.ys, best._idx, 9);
      var points = [{ color: best.color, value: bestVal }];
      var others = [];
      candidates.forEach(function (c) {
        if (c === best) return;
        var val = A.linearInterp(c.xs, c.ys, atTime);
        if (!isNaN(val)) { others.push({ label: c.label, value: val, color: c.color }); points.push({ color: c.color, value: val }); }
      });
      this._hover = {
        found: true, time: atTime, primary: { label: best.label, value: bestVal, dydt: dydt, color: best.color },
        others: others, points: points, px: L.sx.toPixel(atTime), py: L.sy.toPixel(bestVal),
      };
      this.render();
      if (this.opts.onHover) this.opts.onHover(this._hover, this._pagePos(p));
    },
    _pagePos: function (p) {
      var r = this.canvas.getBoundingClientRect();
      return { clientX: r.left + p.x, clientY: r.top + p.y, localX: p.x, localY: p.y };
    },

    /* ---- view control API ---- */
    _exitAuto: function () { this.autoMode = null; if (this.opts.onAutoModeChange) this.opts.onAutoModeChange(null); },
    _emitView: function () { if (this.opts.onViewChange) this.opts.onViewChange(); },

    setView: function (view) { this.view = Object.assign({}, view); this._exitAuto(); this.render(); },
    getView: function () { return Object.assign({}, this.view); },

    fitAll: function () { this.autoMode = 'all'; this._autoDirty = true; this.render(); if (this.opts.onAutoModeChange) this.opts.onAutoModeChange('all'); this._emitView(); },
    fitTrial: function () { this.autoMode = 'trial'; this._autoDirty = true; this.render(); if (this.opts.onAutoModeChange) this.opts.onAutoModeChange('trial'); this._emitView(); },
    toggleAuto: function () {
      if (this.autoMode === 'all') this.fitTrial();
      else this.fitAll();
    },

    /* pan by fraction of current range: frac in [0,1] maps slider to position */
    panAxisTo: function (axis, frac, fullRange) {
      // fullRange: {min,max} of data extent; keep current width, position center by frac
      var width = axis === 'x' ? (this.view.xMax - this.view.xMin) : (this.view.yMax - this.view.yMin);
      var span = fullRange.max - fullRange.min;
      var center = fullRange.min + span * frac;
      if (axis === 'x') { this.view.xMin = center - width / 2; this.view.xMax = center + width / 2; }
      else { this.view.yMin = center - width / 2; this.view.yMax = center + width / 2; }
      this._exitAuto();
      this.render();
    },

    /* ---- export ---- */
    exportSVG: function () {
      var scene = this.opts.buildScene();
      scene.view = this.view;
      var rd = new R.SVGRenderer(this.cssW, this.cssH, scene.theme.surface);
      R.renderChart(rd, this.cssW, this.cssH, scene);
      return rd.toString();
    },
    exportPNG: function (scale, cb) {
      scale = scale || 2;
      var scene = this.opts.buildScene();
      scene.view = this.view;
      var off = document.createElement('canvas');
      off.width = Math.round(this.cssW * scale);
      off.height = Math.round(this.cssH * scale);
      var octx = off.getContext('2d');
      octx.setTransform(scale, 0, 0, scale, 0, 0);
      var rd = new R.CanvasRenderer(octx);
      R.renderChart(rd, this.cssW, this.cssH, scene);
      off.toBlob(cb, 'image/png');
    },
    destroy: function () { if (this._ro) this._ro.disconnect(); },
  };

  TS.ChartView = ChartView;
})(window.TS = window.TS || {});
