/* =============================================================================
 * theme.js — Color tokens for the two themes.
 *
 * Two parallel things per theme:
 *   - CSS custom properties applied to <html data-theme> (drive all UI chrome).
 *   - A plain object handed to the canvas/SVG renderer (which cannot read CSS
 *     variables), kept in sync from the same source so the chart never drifts
 *     from the UI.
 *
 * The categorical series palette is the validated, colorblind-safe set from the
 * data-viz reference (worst adjacent CVD ΔE well clear of target), stepped
 * separately for the light and dark chart surfaces.
 * ============================================================================= */
(function (TS) {
  'use strict';

  // Categorical series palette — a wide, professional set of well-separated hues.
  // Ordering interleaves the colour wheel so that the first few entries (the common
  // small-N case) are maximally distinct from one another. Colourblind-friendly
  // pairs (blue/orange, blue/red) lead the sequence.
  var SERIES = {
    light: [
      '#2f6feb', // blue
      '#e8710a', // orange
      '#17a34a', // green
      '#c026d3', // magenta
      '#0e9aad', // cyan
      '#e02424', // red
      '#7c3aed', // violet
      '#6aa30d', // lime
      '#4f46e5', // indigo
      '#c99700', // amber
      '#0d9488', // teal
      '#db2777', // pink
      '#475569', // slate
      '#92400e', // brown
    ],
    dark: [
      '#5b8dff', // blue
      '#fb8b3d', // orange
      '#2fbd66', // green
      '#e05ce8', // magenta
      '#2fc4d6', // cyan
      '#f2555a', // red
      '#a78bfa', // violet
      '#9bd23a', // lime
      '#818cf8', // indigo
      '#e6b52e', // amber
      '#2fd4bf', // teal
      '#f472b6', // pink
      '#94a3b8', // slate
      '#c88a4a', // brown
    ],
  };

  var THEMES = {
    light: {
      // UI chrome
      '--bg':            '#f2f3f4',
      '--surface':       '#ffffff',
      '--surface-2':     '#f7f8f9',
      '--surface-3':     '#eceef0',
      '--sunken':        '#e9ebed',
      '--text':          '#16191d',
      '--text-2':        '#4a5158',
      '--text-3':        '#7b828a',
      '--border':        '#d8dce0',
      '--border-2':      '#e6e9ec',
      '--accent':        '#2f6feb',
      '--accent-weak':   '#e5edfd',
      '--accent-text':   '#1b56c9',
      '--danger':        '#d03b3b',
      '--good':          '#0c8f3f',
      '--warn-ink':      '#9a6a00',
      '--warn-weak':     '#fdf3dd',
      '--warn-border':   '#efd9a3',
      '--shadow':        '0 1px 2px rgba(16,19,26,0.06), 0 4px 16px rgba(16,19,26,0.08)',
      '--shadow-sm':     '0 1px 2px rgba(16,19,26,0.08)',
      '--menu-shadow':   '0 6px 24px rgba(16,19,26,0.16)',
    },
    dark: {
      '--bg':            '#0e1116',
      '--surface':       '#171b21',
      '--surface-2':     '#1c2129',
      '--surface-3':     '#232935',
      '--sunken':        '#10141a',
      '--text':          '#e8ebef',
      '--text-2':        '#a7b0bb',
      '--text-3':        '#6f7883',
      '--border':        '#2a313b',
      '--border-2':      '#222833',
      '--accent':        '#4f8cff',
      '--accent-weak':   '#182338',
      '--accent-text':   '#7aa8ff',
      '--danger':        '#e66767',
      '--good':          '#3fce7a',
      '--warn-ink':      '#e0b24d',
      '--warn-weak':     '#2a2413',
      '--warn-border':   '#4a3f1e',
      '--shadow':        '0 1px 2px rgba(0,0,0,0.4), 0 8px 28px rgba(0,0,0,0.5)',
      '--shadow-sm':     '0 1px 2px rgba(0,0,0,0.4)',
      '--menu-shadow':   '0 10px 34px rgba(0,0,0,0.6)',
    },
  };

  // Colors the renderer needs (chart surface, grid, axis, ink, boundary).
  var CHART = {
    light: {
      surface:    '#ffffff',
      plotBg:     '#ffffff',
      gridMajor:  '#e3e6ea',
      gridMinor:  '#eef1f3',
      axis:       '#9aa1a9',
      axisStrong: '#5b636c',
      zeroLine:   '#c7ccd2',
      text:       '#3a424b',
      mutedText:  '#7b828a',
      boundary:   '#8a919a',
      labelBg:    '#ffffff',
      crosshair:  '#2f6feb',
    },
    dark: {
      surface:    '#141922',
      plotBg:     '#141922',
      gridMajor:  '#262d38',
      gridMinor:  '#1d222b',
      axis:       '#5b636e',
      axisStrong: '#9aa3ae',
      zeroLine:   '#333b47',
      text:       '#b7bec8',
      mutedText:  '#7f8896',
      boundary:   '#727b87',
      labelBg:    '#141922',
      crosshair:  '#5f9bff',
    },
  };

  function seriesColor(theme, index) {
    var arr = SERIES[theme] || SERIES.light;
    return arr[((index % arr.length) + arr.length) % arr.length];
  }

  /* ---- HSL -> hex, for generating extra distinct hues beyond the curated set ---- */
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    function hx(v) { return ('0' + Math.round((v + m) * 255).toString(16)).slice(-2); }
    return '#' + hx(r) + hx(g) + hx(b);
  }

  /* -----------------------------------------------------------------------------
   * scale(theme, n) — return n maximally distinct, professional colours.
   *   • n within the curated palette  -> the curated colours (already ordered for
   *     maximum separation), so small graphs get the hand-tuned hues.
   *   • n beyond the palette           -> a fully generated even-hue ramp so that
   *     large graphs still get n *distinct* colours instead of cycling/repeating.
   * This is what makes "20 datasets" show 20 different colours rather than three
   * of them landing on the same hue.
   * --------------------------------------------------------------------------- */
  function scale(theme, n) {
    var arr = SERIES[theme] || SERIES.light;
    n = Math.max(1, n | 0);
    if (n <= arr.length) return arr.slice(0, n);
    // Generate n evenly-spaced hues; alternate lightness in two bands to boost
    // separation between neighbours once the wheel gets crowded.
    var dark = theme === 'dark';
    var out = [];
    for (var i = 0; i < n; i++) {
      var hue = (i * 360 / n + 205) % 360;           // start near blue, sweep the wheel
      var band = i % 2;
      var light = dark ? (band ? 68 : 55) : (band ? 42 : 55);
      var sat = dark ? 62 : 64;
      out.push(hslToHex(hue, sat, light));
    }
    return out;
  }

  function applyTheme(name) {
    var vars = THEMES[name] || THEMES.light;
    var root = document.documentElement;
    for (var k in vars) if (vars.hasOwnProperty(k)) root.style.setProperty(k, vars[k]);
    root.setAttribute('data-theme', name);
  }

  TS.Theme = {
    THEMES: THEMES,
    SERIES: SERIES,
    seriesColor: seriesColor,
    scale: scale,
    hslToHex: hslToHex,
    chart: function (name) { return CHART[name] || CHART.light; },
    apply: applyTheme,
  };
})(window.TS = window.TS || {});
