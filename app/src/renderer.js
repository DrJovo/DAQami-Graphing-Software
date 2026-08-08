/* =============================================================================
 * renderer.js — The drawing engine.
 *
 * One drawing routine, renderChart(renderer, w, h, scene), talks to a small
 * abstract interface. Two backends implement it:
 *   - CanvasRenderer  -> live, interactive on-screen chart
 *   - SVGRenderer     -> vector export (identical code path => export matches
 *                        the screen exactly)
 * ============================================================================= */
(function (TS) {
  'use strict';

  var UI_FONT = '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var NUM_FONT = 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace';

  /* --------------------------- Canvas backend ----------------------------- */
  function CanvasRenderer(ctx) { this.ctx = ctx; }
  CanvasRenderer.prototype = {
    save: function () { this.ctx.save(); },
    restore: function () { this.ctx.restore(); },
    clipRect: function (x, y, w, h) {
      var c = this.ctx; c.beginPath(); c.rect(x, y, w, h); c.clip();
    },
    beginPath: function () { this.ctx.beginPath(); },
    moveTo: function (x, y) { this.ctx.moveTo(x, y); },
    lineTo: function (x, y) { this.ctx.lineTo(x, y); },
    closePath: function () { this.ctx.closePath(); },
    strokePath: function (s) {
      var c = this.ctx;
      c.globalAlpha = s.alpha == null ? 1 : s.alpha;
      c.strokeStyle = s.color; c.lineWidth = s.width == null ? 1 : s.width;
      c.lineJoin = 'round'; c.lineCap = 'butt';
      c.setLineDash(s.dash || []);
      c.stroke();
      c.setLineDash([]); c.globalAlpha = 1;
    },
    fillPath: function (s) {
      var c = this.ctx;
      c.globalAlpha = s.alpha == null ? 1 : s.alpha;
      c.fillStyle = s.color; c.fill(); c.globalAlpha = 1;
    },
    fillRect: function (x, y, w, h, s) {
      var c = this.ctx;
      c.globalAlpha = s.alpha == null ? 1 : s.alpha;
      c.fillStyle = s.color; c.fillRect(x, y, w, h); c.globalAlpha = 1;
    },
    strokeRect: function (x, y, w, h, s) {
      var c = this.ctx;
      c.globalAlpha = s.alpha == null ? 1 : s.alpha;
      c.strokeStyle = s.color; c.lineWidth = s.width == null ? 1 : s.width;
      c.setLineDash(s.dash || []);
      c.strokeRect(x, y, w, h); c.setLineDash([]); c.globalAlpha = 1;
    },
    roundRect: function (x, y, w, h, r, s) {
      var c = this.ctx; c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
      if (s.fill) { c.globalAlpha = s.fillAlpha == null ? 1 : s.fillAlpha; c.fillStyle = s.fill; c.fill(); c.globalAlpha = 1; }
      if (s.stroke) { c.globalAlpha = s.strokeAlpha == null ? 1 : s.strokeAlpha; c.strokeStyle = s.stroke; c.lineWidth = s.width || 1; if (s.dash) c.setLineDash(s.dash); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
    },
    text: function (str, x, y, s) {
      var c = this.ctx;
      c.globalAlpha = s.alpha == null ? 1 : s.alpha;
      c.fillStyle = s.color;
      c.font = (s.weight ? s.weight + ' ' : '') + (s.size || 11) + 'px ' + (s.font || UI_FONT);
      c.textAlign = s.align || 'left';
      c.textBaseline = s.baseline || 'alphabetic';
      if (s.rotate) {
        c.save(); c.translate(x, y); c.rotate(s.rotate); c.fillText(str, 0, 0); c.restore();
      } else {
        c.fillText(str, x, y);
      }
      c.globalAlpha = 1;
    },
    measureText: function (str, size, font) {
      this.ctx.font = (size || 11) + 'px ' + (font || UI_FONT);
      return this.ctx.measureText(str).width;
    },
  };

  /* ----------------------------- SVG backend ------------------------------
   * Emits a standalone SVG. Text is written as <text> elements referencing a
   * font-family NAME (the same UI/mono stack the screen uses) rather than as
   * outlined paths — so exports stay small and remain editable. The trade-off:
   * a viewer that lacks those fonts substitutes its own, which can shift label
   * spacing slightly. measureText here is a deliberate approximation used only
   * for layout math; on screen the browser uses real font metrics. */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function SVGRenderer(w, h, bg) {
    this.w = w; this.h = h; this.bg = bg;
    this.parts = [];
    this.defs = [];
    this._path = '';
    this._clipStack = [];
    this._clipId = 0;
  }
  SVGRenderer.prototype = {
    _open: function () { return this._clipStack.length ? ' clip-path="url(#' + this._clipStack[this._clipStack.length - 1] + ')"' : ''; },
    save: function () { this._savedClip = this._savedClip || []; this._savedClip.push(this._clipStack.length); },
    restore: function () {
      if (this._savedClip && this._savedClip.length) {
        var target = this._savedClip.pop();
        while (this._clipStack.length > target) this._clipStack.pop();
      }
    },
    clipRect: function (x, y, w, h) {
      var id = 'clip' + (++this._clipId);
      this.defs.push('<clipPath id="' + id + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/></clipPath>');
      this._clipStack.push(id);
    },
    beginPath: function () { this._path = ''; this._first = true; },
    moveTo: function (x, y) { this._path += 'M' + r2(x) + ' ' + r2(y) + ' '; },
    lineTo: function (x, y) { this._path += 'L' + r2(x) + ' ' + r2(y) + ' '; },
    closePath: function () { this._path += 'Z '; },
    strokePath: function (s) {
      var dash = s.dash && s.dash.length ? ' stroke-dasharray="' + s.dash.join(',') + '"' : '';
      this.parts.push('<path d="' + this._path + '" fill="none" stroke="' + s.color +
        '" stroke-width="' + (s.width == null ? 1 : s.width) + '" stroke-linejoin="round"' +
        ' stroke-opacity="' + (s.alpha == null ? 1 : s.alpha) + '"' + dash + this._open() + '/>');
    },
    fillPath: function (s) {
      this.parts.push('<path d="' + this._path + '" fill="' + s.color + '" fill-opacity="' +
        (s.alpha == null ? 1 : s.alpha) + '" stroke="none"' + this._open() + '/>');
    },
    fillRect: function (x, y, w, h, s) {
      this.parts.push('<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) +
        '" fill="' + s.color + '" fill-opacity="' + (s.alpha == null ? 1 : s.alpha) + '"' + this._open() + '/>');
    },
    strokeRect: function (x, y, w, h, s) {
      var dash = s.dash && s.dash.length ? ' stroke-dasharray="' + s.dash.join(',') + '"' : '';
      this.parts.push('<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) +
        '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.width == null ? 1 : s.width) + '"' +
        ' stroke-opacity="' + (s.alpha == null ? 1 : s.alpha) + '"' + dash + this._open() + '/>');
    },
    roundRect: function (x, y, w, h, rr, s) {
      var f = s.fill ? ' fill="' + s.fill + '" fill-opacity="' + (s.fillAlpha == null ? 1 : s.fillAlpha) + '"' : ' fill="none"';
      var st = s.stroke ? ' stroke="' + s.stroke + '" stroke-width="' + (s.width || 1) + '"' : '';
      this.parts.push('<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + r2(h) +
        '" rx="' + rr + '" ry="' + rr + '"' + f + st + this._open() + '/>');
    },
    text: function (str, x, y, s) {
      var anchor = s.align === 'center' ? 'middle' : s.align === 'right' ? 'end' : 'start';
      var baseline = s.baseline === 'middle' ? ' dominant-baseline="central"' :
        s.baseline === 'top' ? ' dominant-baseline="hanging"' : '';
      var transform = s.rotate ? ' transform="rotate(' + (s.rotate * 180 / Math.PI) + ' ' + r2(x) + ' ' + r2(y) + ')"' : '';
      this.parts.push('<text x="' + r2(x) + '" y="' + r2(y) + '" fill="' + s.color +
        '" font-family="' + (s.font || UI_FONT).replace(/"/g, "'") + '" font-size="' + (s.size || 11) +
        '"' + (s.weight ? ' font-weight="' + s.weight + '"' : '') + ' text-anchor="' + anchor + '"' +
        ' fill-opacity="' + (s.alpha == null ? 1 : s.alpha) + '"' + baseline + transform + this._open() + '>' +
        esc(str) + '</text>');
    },
    measureText: function (str, size, font) {
      // Approximate: monospace ~0.6em, UI font ~0.53em average.
      var factor = (font === NUM_FONT) ? 0.60 : 0.53;
      return String(str).length * (size || 11) * factor;
    },
    toString: function () {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + this.w + '" height="' + this.h +
        '" viewBox="0 0 ' + this.w + ' ' + this.h + '">' +
        '<!-- ThermoScope SVG export. Text uses the system UI font stack (not embedded ' +
        'outlines); a viewer without these fonts substitutes another and label spacing ' +
        'may shift slightly. -->' +
        '<defs>' + this.defs.join('') + '</defs>' +
        '<rect width="' + this.w + '" height="' + this.h + '" fill="' + this.bg + '"/>' +
        this.parts.join('') + '</svg>';
    },
  };
  function r2(n) { return Math.round(n * 100) / 100; }

  /* --------------------------- Scales & ticks ----------------------------- */
  function makeScale(dMin, dMax, pMin, pMax) {
    if (dMin === dMax) { dMin -= 1; dMax += 1; }
    var m = (pMax - pMin) / (dMax - dMin);
    return {
      dataMin: dMin, dataMax: dMax, pixMin: pMin, pixMax: pMax,
      toPixel: function (v) { return pMin + (v - dMin) * m; },
      toData: function (p) { return dMin + (p - pMin) / m; },
    };
  }

  function niceTicks(min, max, target) {
    if (min === max) { min -= 1; max += 1; }
    var range = max - min;
    var rawStep = range / Math.max(1, target);
    var mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    var norm = rawStep / mag;
    var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    var start = Math.ceil(min / step) * step;
    var ticks = [];
    for (var v = start; v <= max + step * 1e-6; v += step) {
      ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    }
    return { ticks: ticks, step: step };
  }

  function fmtTick(v, step) {
    var dp = step < 0.001 ? 4 : step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
    if (Math.abs(v) >= 100000) return v.toExponential(1);
    return v.toFixed(dp);
  }

  /* ------------------------------ Markers --------------------------------- */
  function drawMarker(rd, shape, cx, cy, size, style) {
    var r = size;
    function poly(pts) {
      rd.beginPath();
      for (var i = 0; i < pts.length; i++) { if (i === 0) rd.moveTo(pts[i][0], pts[i][1]); else rd.lineTo(pts[i][0], pts[i][1]); }
      rd.closePath(); rd.fillPath(style);
    }
    switch (shape) {
      case 'square': poly([[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r]]); break;
      case 'triangle': poly([[cx, cy - r * 1.15], [cx + r, cy + r * 0.85], [cx - r, cy + r * 0.85]]); break;
      case 'triangleDown': poly([[cx, cy + r * 1.15], [cx + r, cy - r * 0.85], [cx - r, cy - r * 0.85]]); break;
      case 'diamond': poly([[cx, cy - r * 1.25], [cx + r * 1.15, cy], [cx, cy + r * 1.25], [cx - r * 1.15, cy]]); break;
      case 'cross':
        rd.beginPath(); rd.moveTo(cx - r, cy - r); rd.lineTo(cx + r, cy + r);
        rd.moveTo(cx + r, cy - r); rd.lineTo(cx - r, cy + r);
        rd.strokePath({ color: style.color, width: Math.max(1.4, r * 0.7), alpha: style.alpha }); break;
      case 'plus':
        rd.beginPath(); rd.moveTo(cx - r, cy); rd.lineTo(cx + r, cy);
        rd.moveTo(cx, cy - r); rd.lineTo(cx, cy + r);
        rd.strokePath({ color: style.color, width: Math.max(1.4, r * 0.7), alpha: style.alpha }); break;
      case 'star': {
        var pts = [];
        for (var i = 0; i < 10; i++) {
          var ang = -Math.PI / 2 + i * Math.PI / 5;
          var rad = (i % 2 === 0) ? r * 1.25 : r * 0.5;
          pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
        }
        poly(pts); break;
      }
      default: // circle
        rd.beginPath();
        approxCircle(rd, cx, cy, r);
        rd.fillPath(style);
    }
  }
  function approxCircle(rd, cx, cy, r) {
    // Both backends expose only line/close, so approximate the circle as a 24-gon.
    rd.beginPath();
    for (var i = 0; i <= 24; i++) {
      var a = (i / 24) * Math.PI * 2;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) rd.moveTo(x, y); else rd.lineTo(x, y);
    }
    rd.closePath();
  }

  /* -------------------------- Label with backing -------------------------- */
  function labelChip(rd, str, x, y, opts) {
    var size = opts.size || 11;
    var padX = 4, padY = 2;
    var w = rd.measureText(str, size, opts.font) + padX * 2;
    var h = size + padY * 2;
    var bx = x, by = y - h / 2;
    if (opts.align === 'center') bx = x - w / 2;
    else if (opts.align === 'right') bx = x - w;
    if (opts.anchorTop) by = y;
    rd.roundRect(bx, by, w, h, 3, { fill: opts.bg, fillAlpha: opts.bgAlpha == null ? 0.9 : opts.bgAlpha, stroke: opts.border, width: 1 });
    rd.text(str, bx + w / 2, by + h / 2, {
      color: opts.color, size: size, font: opts.font, align: 'center', baseline: 'middle', weight: opts.weight,
    });
    return { x: bx, y: by, w: w, h: h };
  }

  /* ------------------------------ renderChart ----------------------------- */
  function renderChart(rd, W, H, scene) {
    var T = scene.theme;
    var v = scene.view;
    var series = scene.series || [];
    var ov = scene.overlays || {};

    // Plot background.
    rd.fillRect(0, 0, W, H, { color: T.surface });

    // ---- margins (left computed from y tick label widths) ----
    var yt = niceTicks(v.yMin, v.yMax, Math.max(3, Math.round(H / 60)));
    var maxYLabel = 0;
    yt.ticks.forEach(function (t) { maxYLabel = Math.max(maxYLabel, rd.measureText(fmtTick(t, yt.step), 11, NUM_FONT)); });
    var mLeft = Math.ceil(maxYLabel) + 34;
    var mRight = 18;
    var mTop = scene.title ? 34 : 16;
    var mBottom = 52;
    var plot = { x: mLeft, y: mTop, w: W - mLeft - mRight, h: H - mTop - mBottom };
    if (plot.w < 20 || plot.h < 20) return { plot: plot };

    var sx = makeScale(v.xMin, v.xMax, plot.x, plot.x + plot.w);
    var sy = makeScale(v.yMin, v.yMax, plot.y + plot.h, plot.y);
    var xt = niceTicks(v.xMin, v.xMax, Math.max(3, Math.round(plot.w / 90)));

    var annotationBoxes = [];   // pixel rects of annotation labels, for hit-testing

    // ---- grid + data (clipped) ----
    rd.save();
    rd.clipRect(plot.x, plot.y, plot.w, plot.h);

    // minor grid
    if (scene.grid && scene.grid.minor) {
      drawMinor(rd, xt, 'x', sx, sy, plot, T);
      drawMinor(rd, yt, 'y', sx, sy, plot, T);
    }
    // major grid
    if (scene.grid && scene.grid.major) {
      xt.ticks.forEach(function (t) {
        var px = sx.toPixel(t);
        rd.beginPath(); rd.moveTo(px, plot.y); rd.lineTo(px, plot.y + plot.h);
        rd.strokePath({ color: T.gridMajor, width: 1 });
      });
      yt.ticks.forEach(function (t) {
        var py = sy.toPixel(t);
        rd.beginPath(); rd.moveTo(plot.x, py); rd.lineTo(plot.x + plot.w, py);
        rd.strokePath({ color: T.gridMajor, width: 1 });
      });
    }

    // shaded areas (under data)
    (ov.areas || []).forEach(function (a) {
      var xs = a.xs, ys = a.ys;
      var lo = a.xMin == null ? v.xMin : a.xMin, hi = a.xMax == null ? v.xMax : a.xMax;
      rd.beginPath();
      var started = false, lastX = null;
      for (var i = 0; i < xs.length; i++) {
        if (xs[i] < lo || xs[i] > hi || isNaN(xs[i]) || isNaN(ys[i])) continue;
        var px = sx.toPixel(xs[i]), py = sy.toPixel(ys[i]);
        if (!started) { rd.moveTo(px, sy.toPixel(0)); rd.lineTo(px, py); started = true; }
        else rd.lineTo(px, py);
        lastX = px;
      }
      if (started) { rd.lineTo(lastX, sy.toPixel(0)); rd.closePath(); rd.fillPath({ color: a.color, alpha: 0.16 }); }
    });

    // data series (with ctrl-click selection emphasis / dimming)
    series.forEach(function (s) {
      if (s.visibility === 'off') return;
      var alpha = s.visibility === 'dim' ? 0.32 : 1, emphasize = false;
      if (scene.hasSelection) {
        if (scene.selection && scene.selection[s.id]) { alpha = 1; emphasize = true; }
        else { alpha = 0.14; }
      }
      drawSeries(rd, s, sx, sy, plot, v, alpha, emphasize, T);
    });

    // average / statistics lines (incl. the dotted ±σ band around a mean)
    (ov.averageLines || []).forEach(function (a) {
      drawPolyline(rd, a.xs, a.ys, sx, sy, v, { color: a.color, width: a.width || 2.4, dash: a.dash || [], alpha: a.alpha });
    });
    // curve fits (linear / poly / log / exp): sampled from the model's eval(x).
    // In-range styled per the toggle (dotted by default); outside range always
    // dotted; optionally extended across the whole visible range.
    (ov.curveFit || []).forEach(function (c) {
      var fmn = c.fitMin, fmx = c.fitMax;
      var start = c.extend ? Math.min(v.xMin, c.drawMin) : c.drawMin;
      var end = c.extend ? Math.max(v.xMax, c.drawMax) : c.drawMax;
      function seg(x0, x1, dash, w) {
        if (!(x1 > x0)) return;
        var N = 96, pen = false, drawn = 0; rd.beginPath();
        for (var i = 0; i <= N; i++) {
          var x = x0 + (x1 - x0) * (i / N), y = c.eval(x);
          if (!isFinite(y)) { pen = false; continue; }
          var px = sx.toPixel(x), py = sy.toPixel(y);
          // stop runaway growth (exp extrapolation) from producing huge coordinates
          if (py < -8000 || py > 8000) { pen = false; continue; }
          if (!pen) { rd.moveTo(px, py); pen = true; } else rd.lineTo(px, py);
          drawn++;
        }
        if (drawn) rd.strokePath({ color: c.color, width: w, dash: dash || [] });
      }
      var inDash = c.style === 'solid' ? null : [2, 4];
      if (start < fmn) seg(start, fmn, [2, 4], 2);
      if (end > fmx) seg(fmx, end, [2, 4], 2);
      seg(fmn, fmx, inDash, c.style === 'solid' ? 2.4 : 2);
    });
    // threshold lines
    (ov.thresholds || []).forEach(function (th) {
      var py = sy.toPixel(th.level);
      rd.beginPath(); rd.moveTo(plot.x, py); rd.lineTo(plot.x + plot.w, py);
      rd.strokePath({ color: th.color, width: 1.5, dash: [4, 4] });
      (th.crossings || []).forEach(function (c) {
        var px = sx.toPixel(c.x);
        drawMarker(rd, 'circle', px, py, 3.5, { color: th.color, alpha: 1 });
      });
    });
    // trial boundary markers (subtle verticals)
    (scene.boundaries || []).forEach(function (b) {
      var px = sx.toPixel(b.x);
      rd.beginPath(); rd.moveTo(px, plot.y); rd.lineTo(px, plot.y + plot.h);
      rd.strokePath({ color: T.boundary, width: 1, dash: [5, 5], alpha: 0.75 });
    });
    // dual cursors
    (ov.cursors || []).forEach(function (c) {
      var px = sx.toPixel(c.x);
      rd.beginPath(); rd.moveTo(px, plot.y); rd.lineTo(px, plot.y + plot.h);
      rd.strokePath({ color: c.color, width: 1.4, dash: [2, 3] });
    });
    // manual lines
    (ov.manualLines || []).forEach(function (ln) {
      var dash = ln.style === 'dashed' ? [8, 5] : ln.style === 'dotted' ? [2, 4] : [];
      rd.beginPath();
      if (ln.axis === 'x') {
        var px = sx.toPixel(ln.value); rd.moveTo(px, plot.y); rd.lineTo(px, plot.y + plot.h);
        rd.strokePath({ color: ln.color, width: 1.8, dash: dash });
        if (ln.label) labelChip(rd, ln.label, px, plot.y + 12, { color: ln.color, bg: T.labelBg, border: T.gridMajor, align: 'center' });
      } else {
        var py = sy.toPixel(ln.value); rd.moveTo(plot.x, py); rd.lineTo(plot.x + plot.w, py);
        rd.strokePath({ color: ln.color, width: 1.8, dash: dash });
        if (ln.label) labelChip(rd, ln.label, plot.x + plot.w - 6, py, { color: ln.color, bg: T.labelBg, border: T.gridMajor, align: 'right' });
      }
    });
    // min/max markers
    (ov.minmax || []).forEach(function (m) {
      var px = sx.toPixel(m.x), py = sy.toPixel(m.y);
      drawMarker(rd, 'circle', px, py, 5, { color: T.surface, alpha: 1 });
      rd.beginPath(); approxCircle(rd, px, py, 5); rd.strokePath({ color: m.color, width: 2 });
    });
    // manual points
    (ov.manualPoints || []).forEach(function (p) {
      var px = sx.toPixel(p.x), py = sy.toPixel(p.y);
      if (scene.selectedOverlay && scene.selectedOverlay.kind === 'point' && scene.selectedOverlay.id === p.id) {
        rd.beginPath(); approxCircle(rd, px, py, 8); rd.strokePath({ color: T.crosshair, width: 1.6 });
      }
      drawMarker(rd, 'circle', px, py, 4.5, { color: p.color, alpha: 1 });
      rd.beginPath(); approxCircle(rd, px, py, 4.5); rd.strokePath({ color: T.surface, width: 1.4 });
      if (p.label) labelChip(rd, p.label, px + 10 + rd.measureText(p.label, 11) / 2, py - 12, { color: p.color, bg: T.labelBg, border: T.gridMajor, align: 'center' });
    });
    // anchored annotations: leader line + draggable multi-line label box (auto-wrapped
    // near the graph edge; boxes + anchors returned for hit-testing / dragging)
    (ov.annotations || []).forEach(function (a) {
      var ax = sx.toPixel(a.x), ay = sy.toPixel(a.y);
      var size = 11, lineH = 15, padX = 8, padY = 5;
      var maxTextW = Math.max(40, plot.w - 40);   // wrap only when it would reach the graph edge
      var lines = wrapText(rd, a.text || '', maxTextW, size, UI_FONT);
      var tw = 0; lines.forEach(function (L) { tw = Math.max(tw, rd.measureText(L || ' ', size, UI_FONT)); });
      var bw = Math.max(20, tw) + padX * 2, bh = lines.length * lineH + padY * 2;
      var lx = ax + a.dx, ly = ay + a.dy, bx = lx - bw / 2, by = ly - bh / 2;
      bx = Math.max(plot.x + 2, Math.min(plot.x + plot.w - bw - 2, bx));   // keep on-plot
      by = Math.max(plot.y + 2, Math.min(plot.y + plot.h - bh - 2, by));
      var bcx = bx + bw / 2, bcy = by + bh / 2;
      var annSel = scene.selectedOverlay && scene.selectedOverlay.kind === 'annot' && scene.selectedOverlay.id === a.id;
      rd.beginPath(); rd.moveTo(ax, ay); rd.lineTo(bcx, bcy); rd.strokePath({ color: T.mutedText, width: 1, dash: [3, 3] });
      drawMarker(rd, 'circle', ax, ay, annSel ? 3.6 : 3, { color: T.crosshair, alpha: 1 });
      rd.beginPath(); approxCircle(rd, ax, ay, annSel ? 3.6 : 3); rd.strokePath({ color: T.surface, width: 1 });
      rd.roundRect(bx, by, bw, bh, 5, { fill: T.labelBg, fillAlpha: 0.97, stroke: annSel ? T.crosshair : T.gridMajor, width: annSel ? 1.6 : 1 });
      lines.forEach(function (L, i) { rd.text(L, bcx, by + padY + i * lineH + lineH / 2, { color: T.text, size: size, align: 'center', baseline: 'middle' }); });
      annotationBoxes.push({ id: a.id, x: bx, y: by, w: bw, h: bh, ax: ax, ay: ay });
    });

    rd.restore(); // end clip

    // ---- axis frame (y prominent) ----
    // light full frame
    rd.strokeRect(plot.x, plot.y, plot.w, plot.h, { color: T.gridMajor, width: 1 });
    // zero line if within view
    if (v.yMin < 0 && v.yMax > 0) {
      var pz = sy.toPixel(0);
      rd.beginPath(); rd.moveTo(plot.x, pz); rd.lineTo(plot.x + plot.w, pz);
      rd.strokePath({ color: T.zeroLine, width: 1.4 });
    }
    // emphasized x and y axes
    rd.beginPath(); rd.moveTo(plot.x, plot.y + plot.h); rd.lineTo(plot.x + plot.w, plot.y + plot.h);
    rd.strokePath({ color: T.axisStrong, width: 1.6 });
    rd.beginPath(); rd.moveTo(plot.x, plot.y); rd.lineTo(plot.x, plot.y + plot.h);
    rd.strokePath({ color: T.axisStrong, width: 1.6 });

    // ticks + labels
    xt.ticks.forEach(function (t) {
      var px = sx.toPixel(t);
      rd.beginPath(); rd.moveTo(px, plot.y + plot.h); rd.lineTo(px, plot.y + plot.h + 5);
      rd.strokePath({ color: T.axisStrong, width: 1.2 });
      rd.text(fmtTick(t, xt.step), px, plot.y + plot.h + 8, { color: T.text, size: 11, font: NUM_FONT, align: 'center', baseline: 'top' });
    });
    yt.ticks.forEach(function (t) {
      var py = sy.toPixel(t);
      rd.beginPath(); rd.moveTo(plot.x - 5, py); rd.lineTo(plot.x, py);
      rd.strokePath({ color: T.axisStrong, width: 1.2 });
      rd.text(fmtTick(t, yt.step), plot.x - 9, py, { color: T.text, size: 11, font: NUM_FONT, align: 'right', baseline: 'middle' });
    });

    // axis titles
    if (scene.xLabel) rd.text(scene.xLabel, plot.x + plot.w / 2, H - 12, { color: T.text, size: 12, weight: '600', align: 'center', baseline: 'alphabetic' });
    if (scene.yLabel) rd.text(scene.yLabel, 16, plot.y + plot.h / 2, { color: T.text, size: 12, weight: '600', align: 'center', baseline: 'middle', rotate: -Math.PI / 2 });
    var titleBox = null;
    if (scene.title) {
      rd.text(scene.title, plot.x + plot.w / 2, 20, { color: T.text, size: 14, weight: '700', align: 'center', baseline: 'middle' });
      var tw = rd.measureText(scene.title, 14, UI_FONT);
      var cx = plot.x + plot.w / 2;
      // 16px left padding; extra room on the right so the hover pencil sits clear
      // of the title text with breathing space at the edge.
      titleBox = { x: cx - tw / 2 - 16, y: 6, w: tw + 16 + 32, h: 26 };  // clickable rename region (CSS px)
    }

    // ---- rescale tool per-dataset edge handles ----
    if (scene.scaleHandles) drawScaleHandles(rd, scene.scaleHandles, sy, plot, T);

    // ---- legend (draggable, snaps to a corner) ----
    var legendBox = null, legendItemBoxes = [];
    if (scene.legend !== false) { legendBox = drawLegend(rd, scene.legendSeries || series, ov, plot, T, scene.legendCorner || 'tr', scene._legendDrag, scene); if (legendBox) legendItemBoxes = legendBox.items; }

    return { plot: plot, sx: sx, sy: sy, xTicks: xt, yTicks: yt, titleBox: titleBox, legendBox: legendBox, legendItemBoxes: legendItemBoxes, annotationBoxes: annotationBoxes };
  }

  function drawMinor(rd, tk, axis, sx, sy, plot, T) {
    var step = tk.step / 5;
    tk.ticks.forEach(function (t) {
      for (var m = 1; m < 5; m++) {
        var val = t - step * m;
        if (axis === 'x') {
          if (val < sx.dataMin || val > sx.dataMax) continue;
          var px = sx.toPixel(val);
          rd.beginPath(); rd.moveTo(px, plot.y); rd.lineTo(px, plot.y + plot.h);
          rd.strokePath({ color: T.gridMinor, width: 1 });
        } else {
          if (val < Math.min(sy.dataMin, sy.dataMax) || val > Math.max(sy.dataMin, sy.dataMax)) continue;
          var py = sy.toPixel(val);
          rd.beginPath(); rd.moveTo(plot.x, py); rd.lineTo(plot.x + plot.w, py);
          rd.strokePath({ color: T.gridMinor, width: 1 });
        }
      }
    });
  }

  /* Decimate visible points to ~2 per pixel column; always keep first & last. */
  function renderIndices(xs, xMin, xMax, plotW) {
    var A = TS.Analysis;
    var i0 = A.floorIndex(xs, xMin); if (i0 < 0) i0 = 0;
    var i1 = A.floorIndex(xs, xMax); if (i1 < 0) i1 = xs.length - 1; else i1 = Math.min(xs.length - 1, i1 + 1);
    var count = i1 - i0 + 1;
    var maxPts = Math.max(50, plotW * 2);
    if (count <= maxPts) { var out = []; for (var i = i0; i <= i1; i++) out.push(i); return out; }
    var stride = count / maxPts;
    var res = [];
    for (var k = 0; k < maxPts; k++) res.push(i0 + Math.floor(k * stride));
    if (res[res.length - 1] !== i1) res.push(i1);
    return res;
  }

  function drawSeries(rd, s, sx, sy, plot, v, alpha, emphasize, T) {
    var xs = s.xs, ys = s.ys;
    if (!xs || xs.length === 0) return;
    var idx = renderIndices(xs, v.xMin, v.xMax, plot.w);
    var baseW = s.lineWidth || 1.8;
    if (s.plotType === 'scatter') {
      var size = (s.markerSize || 3) * (emphasize ? 1.5 : 1);
      for (var i = 0; i < idx.length; i++) {
        var j = idx[i];
        if (isNaN(ys[j]) || isNaN(xs[j])) continue;
        var px = sx.toPixel(xs[j]), py = sy.toPixel(ys[j]);
        if (emphasize && T) drawMarker(rd, s.shape || 'circle', px, py, size + 1.8, { color: T.surface, alpha: 1 });
        drawMarker(rd, s.shape || 'circle', px, py, size, { color: s.color, alpha: alpha });
      }
    } else {
      rd.beginPath();
      var pen = false;
      for (var k = 0; k < idx.length; k++) {
        var m = idx[k];
        if (isNaN(ys[m]) || isNaN(xs[m])) { pen = false; continue; }
        var x = sx.toPixel(xs[m]), y = sy.toPixel(ys[m]);
        if (!pen) { rd.moveTo(x, y); pen = true; } else rd.lineTo(x, y);
      }
      if (emphasize && T) rd.strokePath({ color: T.surface, width: baseW * 2.6 + 2, alpha: 0.85 }); // casing halo
      rd.strokePath({ color: s.color, width: emphasize ? baseW * 1.9 : baseW, alpha: alpha, dash: lineDash(s.lineStyle) });
    }
  }

  function drawPolyline(rd, xs, ys, sx, sy, v, style) {
    rd.beginPath();
    var pen = false;
    for (var i = 0; i < xs.length; i++) {
      if (isNaN(ys[i]) || isNaN(xs[i])) { pen = false; continue; }
      var x = sx.toPixel(xs[i]), y = sy.toPixel(ys[i]);
      if (!pen) { rd.moveTo(x, y); pen = true; } else rd.lineTo(x, y);
    }
    rd.strokePath(style);
  }

  /* Word-wrap text to a max pixel width, honoring explicit newlines. */
  function wrapText(rd, text, maxW, size, font) {
    var lines = [];
    String(text).split('\n').forEach(function (para) {
      if (para === '') { lines.push(''); return; }
      var words = para.split(/\s+/), cur = '';
      for (var i = 0; i < words.length; i++) {
        var test = cur ? cur + ' ' + words[i] : words[i];
        if (cur && rd.measureText(test, size, font) > maxW) { lines.push(cur); cur = words[i]; }
        else cur = test;
      }
      if (cur) lines.push(cur);
    });
    return lines.length ? lines : [''];
  }

  function drawLegend(rd, series, ov, plot, T, corner, dragPos, scene) {
    var sel = scene && scene.selection, hasSel = scene && scene.hasSelection;
    var items = [];
    series.forEach(function (s) { if (s.visibility !== 'off') items.push({ id: s.id, label: s.label, color: s.color, shape: s.plotType === 'scatter' ? s.shape : 'line', dash: lineDash(s.lineStyle), dim: hasSel && !(sel && sel[s.id]) }); });
    (ov.averageLines || []).forEach(function (a) { if (a.label) items.push({ id: null, label: a.label, color: a.color, shape: 'line', dash: [] }); });
    if (items.length === 0) return null;
    var size = 11, rowH = 17, padX = 10, padY = 8, swatch = 14;
    var maxLabel = 0;
    items.forEach(function (it) { maxLabel = Math.max(maxLabel, rd.measureText(it.label, size, UI_FONT)); });
    var boxW = swatch + 7 + maxLabel + padX * 2;
    var boxH = items.length * rowH + padY * 2;
    function cornerXY(cn) {
      var right = (cn || 'tr').indexOf('r') >= 0, bottom = (cn || 'tr').indexOf('b') >= 0;
      return { x: right ? plot.x + plot.w - boxW - 10 : plot.x + 10, y: bottom ? plot.y + plot.h - boxH - 10 : plot.y + 10 };
    }
    var bx, by, boxAlpha = 0.92;
    if (dragPos) {   // following the cursor mid-drag
      bx = Math.max(plot.x + 2, Math.min(plot.x + plot.w - boxW - 2, dragPos.x));
      by = Math.max(plot.y + 2, Math.min(plot.y + plot.h - boxH - 2, dragPos.y));
      boxAlpha = 0.55;   // slightly transparent while held
      var gp = cornerXY(dragPos.snapCorner);   // dotted outline showing where it will snap
      rd.roundRect(gp.x, gp.y, boxW, boxH, 6, { stroke: T.crosshair, width: 1.5, dash: [5, 4], strokeAlpha: 0.9 });
    } else {
      var xy = cornerXY(corner); bx = xy.x; by = xy.y;
    }
    rd.roundRect(bx, by, boxW, boxH, 6, { fill: T.surface, fillAlpha: boxAlpha, stroke: T.gridMajor, width: 1 });
    var itemBoxes = [];
    items.forEach(function (it, i) {
      var rowTop = by + padY + i * rowH, cy = rowTop + rowH / 2, swx = bx + padX;
      var a = it.dim ? 0.32 : 1;
      if (it.shape === 'line') {
        rd.beginPath(); rd.moveTo(swx, cy); rd.lineTo(swx + swatch, cy);
        rd.strokePath({ color: it.color, width: 2.6, dash: it.dash || [], alpha: a });
      } else {
        drawMarker(rd, it.shape, swx + swatch / 2, cy, 4, { color: it.color, alpha: a });
      }
      rd.text(it.label, swx + swatch + 7, cy, { color: T.text, size: size, align: 'left', baseline: 'middle', alpha: a });
      if (it.id != null) itemBoxes.push({ id: it.id, x: bx, y: rowTop, w: boxW, h: rowH });
    });
    return { x: bx, y: by, w: boxW, h: boxH, items: itemBoxes };
  }
  function lineDash(style) { return style === 'dashed' ? [8, 5] : style === 'dotted' ? [2, 4] : []; }

  /* Rescale tool: for each rescaled dataset, a draggable arrow at the left edge
   * (its low target, where its smallest value sits) and one at the right edge (its
   * high target), drawn in the dataset's own color. `handles` is an array of
   * { low, high, color }. Positions are clamped so a handle stays grabbable when
   * zoomed. */
  function drawScaleHandles(rd, handles, sy, plot, T) {
    function clampY(y) { return Math.max(plot.y + 1, Math.min(plot.y + plot.h - 1, y)); }
    function arrow(xEdge, y, dir, color) {          // dir +1 = points right (left edge), -1 = points left
      var len = 11, hh = 6, tip = xEdge + dir * len;
      rd.beginPath(); rd.moveTo(xEdge, y); rd.lineTo(xEdge + dir * (len + 9), y);
      rd.strokePath({ color: color, width: 1.4, alpha: 0.5 });      // short guide stub into the plot
      rd.beginPath(); rd.moveTo(tip, y); rd.lineTo(xEdge, y - hh); rd.lineTo(xEdge, y + hh); rd.closePath();
      rd.fillPath({ color: color, alpha: 1 });                       // solid arrow head
      rd.beginPath(); rd.moveTo(tip, y); rd.lineTo(xEdge, y - hh); rd.lineTo(xEdge, y + hh); rd.closePath();
      rd.strokePath({ color: T.surface, width: 1 });                 // light outline for contrast
    }
    (handles || []).forEach(function (sh) {
      arrow(plot.x, clampY(sy.toPixel(sh.low)), 1, sh.color);
      arrow(plot.x + plot.w, clampY(sy.toPixel(sh.high)), -1, sh.color);
    });
  }

  TS.Renderer = {
    CanvasRenderer: CanvasRenderer,
    SVGRenderer: SVGRenderer,
    renderChart: renderChart,
    makeScale: makeScale,
    niceTicks: niceTicks,
    drawMarker: drawMarker,
    labelChip: labelChip,
    fmtTick: fmtTick,
    UI_FONT: UI_FONT,
    NUM_FONT: NUM_FONT,
  };
})(window.TS = window.TS || {});
