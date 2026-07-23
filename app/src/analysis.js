/* =============================================================================
 * analysis.js — Pure numeric routines for the analysis tools. No DOM, no chart
 * code: each function takes arrays and returns numbers/arrays, so they can be
 * reasoned about and tested in isolation.
 * ============================================================================= */
(function (TS) {
  'use strict';

  /* Largest index i with xs[i] <= x (binary search); -1 if x < xs[0]. */
  function floorIndex(xs, x) {
    var lo = 0, hi = xs.length - 1;
    if (hi < 0 || x < xs[0]) return -1;
    if (x >= xs[hi]) return hi;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (xs[mid] <= x) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function nearestIndex(xs, x) {
    var i = floorIndex(xs, x);
    if (i < 0) return 0;
    if (i >= xs.length - 1) return xs.length - 1;
    return (x - xs[i] <= xs[i + 1] - x) ? i : i + 1;
  }

  /* Piecewise-linear interpolation; NaN outside the data range. */
  function linearInterp(xs, ys, x) {
    var n = xs.length;
    if (n === 0) return NaN;
    if (x < xs[0] || x > xs[n - 1]) return NaN;
    var i = floorIndex(xs, x);
    if (i < 0) return ys[0];
    if (i >= n - 1) return ys[n - 1];
    var dx = xs[i + 1] - xs[i];
    if (dx === 0) return ys[i];               // duplicate timestamps
    var t = (x - xs[i]) / dx;
    return ys[i] + t * (ys[i + 1] - ys[i]);
  }

  /* ---- Monotone cubic (PCHIP) — overshoot-free interpolation for prediction ---
   * Filters to finite, strictly-increasing points first so gaps, duplicate
   * timestamps, and out-of-order rows can't produce Inf/NaN in the spline. */
  function buildPchip(rawXs, rawYs) {
    var xs = [], ys = [];
    for (var q = 0; q < rawXs.length; q++) {
      if (!isFinite(rawXs[q]) || !isFinite(rawYs[q])) continue;
      if (xs.length && rawXs[q] <= xs[xs.length - 1]) continue; // enforce increasing x
      xs.push(rawXs[q]); ys.push(rawYs[q]);
    }
    var n = xs.length;
    if (n === 0) return function () { return NaN; };
    if (n === 1) { var only = ys[0]; return function () { return only; }; }
    var h = new Float64Array(Math.max(n - 1, 0));
    var delta = new Float64Array(Math.max(n - 1, 0));
    var i;
    for (i = 0; i < n - 1; i++) {
      h[i] = xs[i + 1] - xs[i];
      delta[i] = (ys[i + 1] - ys[i]) / h[i];
    }
    var d = new Float64Array(n);
    if (n === 1) { d[0] = 0; }
    else {
      d[0] = delta[0];
      d[n - 1] = delta[n - 2];
      for (i = 1; i < n - 1; i++) {
        if (delta[i - 1] * delta[i] <= 0) d[i] = 0;
        else {
          var w1 = 2 * h[i] + h[i - 1];
          var w2 = h[i] + 2 * h[i - 1];
          d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]);
        }
      }
    }
    return function (x) {
      if (n === 0) return NaN;
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      var k = floorIndex(xs, x);
      var hk = h[k], t = (x - xs[k]) / hk;
      var t2 = t * t, t3 = t2 * t;
      var h00 = 2 * t3 - 3 * t2 + 1;
      var h10 = t3 - 2 * t2 + t;
      var h01 = -2 * t3 + 3 * t2;
      var h11 = t3 - t2;
      return h00 * ys[k] + h10 * hk * d[k] + h01 * ys[k + 1] + h11 * hk * d[k + 1];
    };
  }

  /* ---- Gaussian smoothing --------------------------------------------------
   * A Gaussian weighted moving average over sample index. Unlike a
   * Savitzky-Golay fit it introduces no ringing/overshoot, so it does not add
   * the "bumps" around sharp derivative changes that a polynomial smoother does.
   * `strength` is the Gaussian sigma in samples (bigger = smoother).
   *
   * Boundaries use REFLECTION (mirror) padding rather than window truncation.
   * Truncating and renormalising near an edge biases the estimate toward the
   * interior, which visibly drags the first/last points away from where they
   * started at high strength. Reflecting keeps the window symmetric, so an
   * endpoint settles at the local (robust) mean of the points around it and
   * stays put — a single outlier endpoint is averaged in rather than chased. */
  function gaussianSmooth(ys, strength) {
    var n = ys.length;
    var out = new Float64Array(n);
    if (n === 0) return out;
    var sigma = Math.max(0.5, strength);
    var radius = Math.max(1, Math.min(n - 1, Math.round(sigma * 3)));
    var kernel = new Float64Array(radius + 1);
    var k;
    for (k = 0; k <= radius; k++) kernel[k] = Math.exp(-(k * k) / (2 * sigma * sigma));
    for (var i = 0; i < n; i++) {
      var sum = 0, wsum = 0;
      for (var d = -radius; d <= radius; d++) {
        var j = reflectIndex(i + d, n);
        var y = ys[j];
        if (isNaN(y)) continue;
        var w = kernel[d < 0 ? -d : d];
        sum += w * y; wsum += w;
      }
      out[i] = wsum > 0 ? sum / wsum : ys[i];
    }
    return out;
  }
  /* Mirror an index back into [0, n-1] without duplicating the edge sample. */
  function reflectIndex(j, n) {
    if (n === 1) return 0;
    var period = 2 * (n - 1);
    j = ((j % period) + period) % period;
    return j < n ? j : period - j;
  }

  /* ---- Local-regression derivative (robust "Get Point" slope) --------------
   * Fits a least-squares line over a symmetric window and reports its slope —
   * far less noise-sensitive than a raw finite difference. */
  function localSlope(xs, ys, idx, windowPoints) {
    var n = xs.length;
    var half = Math.max(1, Math.floor((windowPoints || 9) / 2));
    var lo = Math.max(0, idx - half), hi = Math.min(n - 1, idx + half);
    var sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
    for (var i = lo; i <= hi; i++) {
      var x = xs[i], y = ys[i];
      if (isNaN(x) || isNaN(y)) continue;
      sx += x; sy += y; sxx += x * x; sxy += x * y; m++;
    }
    if (m < 2) return NaN;
    var denom = m * sxx - sx * sx;
    if (denom === 0) return NaN;
    return (m * sxy - sx * sy) / denom;
  }

  function linearRegression(xs, ys) {
    var n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (var i = 0; i < xs.length; i++) {
      var x = xs[i], y = ys[i];
      if (isNaN(x) || isNaN(y)) continue;
      n++; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
    }
    if (n < 2) return null;
    var denom = n * sxx - sx * sx;
    if (denom === 0) return null;
    var slope = (n * sxy - sx * sy) / denom;
    var intercept = (sy - slope * sx) / n;
    var r = (n * sxy - sx * sy) / Math.sqrt(denom * (n * syy - sy * sy));
    return { slope: slope, intercept: intercept, r2: r * r, n: n };
  }

  /* Trapezoidal area over [xMin,xMax], clipping partial end segments. */
  function trapezoidArea(xs, ys, xMin, xMax) {
    var n = xs.length;
    if (n < 2) return 0;
    if (xMin == null) xMin = xs[0];
    if (xMax == null) xMax = xs[n - 1];
    if (xMax < xMin) { var t = xMin; xMin = xMax; xMax = t; }
    var area = 0;
    for (var i = 0; i < n - 1; i++) {
      var x0 = xs[i], x1 = xs[i + 1];
      if (x1 <= x0) continue;                    // duplicate / backward timestamps
      if (x1 <= xMin || x0 >= xMax) continue;
      var y0 = ys[i], y1 = ys[i + 1];
      if (isNaN(y0) || isNaN(y1)) continue;
      var a = x0, b = x1, ya = y0, yb = y1;
      if (a < xMin) { ya = y0 + (y1 - y0) * (xMin - x0) / (x1 - x0); a = xMin; }
      if (b > xMax) { yb = y0 + (y1 - y0) * (xMax - x0) / (x1 - x0); b = xMax; }
      area += (b - a) * (ya + yb) / 2;
    }
    return area;
  }

  /* Sub-arrays of xs/ys with lo <= x <= hi (order preserved). */
  function sliceXY(xs, ys, lo, hi) {
    if (lo == null) lo = -Infinity;
    if (hi == null) hi = Infinity;
    if (hi < lo) { var t = lo; lo = hi; hi = t; }
    var rx = [], ry = [];
    for (var i = 0; i < xs.length; i++) {
      if (xs[i] >= lo && xs[i] <= hi) { rx.push(xs[i]); ry.push(ys[i]); }
    }
    return { xs: rx, ys: ry };
  }

  function seriesStats(xs, ys) {
    var min = Infinity, max = -Infinity, argMinX = NaN, argMaxX = NaN;
    var sum = 0, count = 0;
    for (var i = 0; i < xs.length; i++) {
      var y = ys[i];
      if (isNaN(y)) continue;
      if (y < min) { min = y; argMinX = xs[i]; }
      if (y > max) { max = y; argMaxX = xs[i]; }
      sum += y; count++;
    }
    if (count === 0) return null;
    return { min: min, max: max, mean: sum / count, argMinX: argMinX, argMaxX: argMaxX, count: count };
  }

  /* Times where a series crosses `level`, with the crossing direction. */
  function thresholdCrossings(xs, ys, level) {
    var out = [];
    for (var i = 0; i < xs.length - 1; i++) {
      var y0 = ys[i], y1 = ys[i + 1];
      if (isNaN(y0) || isNaN(y1)) continue;
      if ((y0 < level && y1 >= level) || (y0 > level && y1 <= level)) {
        var t = (level - y0) / (y1 - y0);
        out.push({ x: xs[i] + t * (xs[i + 1] - xs[i]), rising: y1 >= y0 });
      }
    }
    return out;
  }

  /* Average several series that may not share time samples: interpolate each
   * onto a common grid (only within its own recorded range) and average where
   * data exists. Returns { xs, ys, coverage }. */
  function averageSeries(series) {
    var valid = series.filter(function (s) { return s.xs && s.xs.length > 0; });
    if (valid.length === 0) return { xs: new Float64Array(0), ys: new Float64Array(0), coverage: new Float64Array(0) };
    var lo = Infinity, hi = -Infinity, minStep = Infinity;
    valid.forEach(function (s) {
      lo = Math.min(lo, s.xs[0]);
      hi = Math.max(hi, s.xs[s.xs.length - 1]);
      if (s.xs.length > 1) {
        var span = s.xs[s.xs.length - 1] - s.xs[0];
        minStep = Math.min(minStep, span / (s.xs.length - 1));
      }
    });
    if (!isFinite(minStep) || minStep <= 0) minStep = (hi - lo) / 200 || 1;
    var steps = Math.min(20000, Math.max(2, Math.round((hi - lo) / minStep) + 1));
    var xs = new Float64Array(steps);
    var ys = new Float64Array(steps);
    var coverage = new Float64Array(steps);
    for (var k = 0; k < steps; k++) {
      var x = lo + (hi - lo) * (k / (steps - 1));
      xs[k] = x;
      var sum = 0, cnt = 0;
      for (var s = 0; s < valid.length; s++) {
        var ser = valid[s];
        if (x < ser.xs[0] || x > ser.xs[ser.xs.length - 1]) continue;
        var v = linearInterp(ser.xs, ser.ys, x);
        if (!isNaN(v)) { sum += v; cnt++; }
      }
      coverage[k] = cnt;
      ys[k] = cnt > 0 ? sum / cnt : NaN;
    }
    return { xs: xs, ys: ys, coverage: coverage };
  }

  /* Aggregate several series onto a common grid with a chosen statistic:
   * 'mean' | 'median' | 'mode' | 'stddev' (sample). Interpolates each series
   * within its own range, then aggregates the contributing values per point. */
  function aggregate(vals, kind) {
    var n = vals.length;
    if (n === 0) return NaN;
    if (kind === 'median') {
      var s = vals.slice().sort(function (a, b) { return a - b; });
      var m = n >> 1;
      return n % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    if (kind === 'stddev') {
      if (n < 2) return 0;
      var mu = 0, i; for (i = 0; i < n; i++) mu += vals[i]; mu /= n;
      var ss = 0; for (i = 0; i < n; i++) ss += (vals[i] - mu) * (vals[i] - mu);
      return Math.sqrt(ss / (n - 1));
    }
    if (kind === 'mode') {
      // continuous data: bin to 0.1, take the most-populated bin, return the
      // mean of the values in it (falls back to the median for ties).
      var bins = {}, bestKey = null, bestCount = 0;
      for (var j = 0; j < n; j++) {
        var key = Math.round(vals[j] * 10);
        var b = bins[key] || (bins[key] = { sum: 0, c: 0 });
        b.sum += vals[j]; b.c++;
        if (b.c > bestCount) { bestCount = b.c; bestKey = key; }
      }
      return bestCount <= 1 ? aggregate(vals, 'median') : bins[bestKey].sum / bins[bestKey].c;
    }
    var sum = 0; for (var q = 0; q < n; q++) sum += vals[q]; return sum / n; // mean
  }
  function aggregateSeries(series, kind) {
    var valid = series.filter(function (s) { return s.xs && s.xs.length > 0; });
    if (valid.length === 0) return { xs: new Float64Array(0), ys: new Float64Array(0) };
    var lo = Infinity, hi = -Infinity, minStep = Infinity;
    valid.forEach(function (s) {
      lo = Math.min(lo, s.xs[0]); hi = Math.max(hi, s.xs[s.xs.length - 1]);
      if (s.xs.length > 1) minStep = Math.min(minStep, (s.xs[s.xs.length - 1] - s.xs[0]) / (s.xs.length - 1));
    });
    if (!isFinite(minStep) || minStep <= 0) minStep = (hi - lo) / 200 || 1;
    var steps = Math.min(20000, Math.max(2, Math.round((hi - lo) / minStep) + 1));
    var xs = new Float64Array(steps), ys = new Float64Array(steps);
    for (var k = 0; k < steps; k++) {
      var x = lo + (hi - lo) * (k / (steps - 1)); xs[k] = x;
      var vals = [];
      for (var s = 0; s < valid.length; s++) {
        var ser = valid[s];
        if (x < ser.xs[0] || x > ser.xs[ser.xs.length - 1]) continue;
        var v = linearInterp(ser.xs, ser.ys, x);
        if (!isNaN(v)) vals.push(v);
      }
      ys[k] = vals.length ? aggregate(vals, kind) : NaN;
    }
    return { xs: xs, ys: ys };
  }

  TS.Analysis = {
    aggregateSeries: aggregateSeries,
    floorIndex: floorIndex,
    nearestIndex: nearestIndex,
    linearInterp: linearInterp,
    buildPchip: buildPchip,
    gaussianSmooth: gaussianSmooth,
    sliceXY: sliceXY,
    localSlope: localSlope,
    linearRegression: linearRegression,
    trapezoidArea: trapezoidArea,
    seriesStats: seriesStats,
    thresholdCrossings: thresholdCrossings,
    averageSeries: averageSeries,
  };
})(window.TS = window.TS || {});
