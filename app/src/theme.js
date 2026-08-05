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

  // Categorical series palette — a refined, muted, publication-quality set. The
  // colors sit in a mid saturation/lightness band so nothing reads as neon or as
  // near-black; each surface has its own tuning so lines stay legible on white and
  // on the dark plot. Ordering interleaves the wheel so the first few (the common
  // small-N case) are maximally distinct, leading with the colorblind-safe
  // blue/orange/green trio.
  var MUTED = {
    light: ['#3b6ea5', '#cf8a3c', '#4e9e6b', '#8465ad', '#c25863', '#3a9aa4', '#b9993f', '#bd6fa0', '#7f9350', '#5566a8', '#a0714f', '#6d7885'],
    dark:  ['#6d9fd6', '#e0a765', '#6cbf8c', '#a98fd0', '#db8189', '#5fbcc6', '#d2bd6a', '#d29ac0', '#a7b877', '#8593d6', '#c2926f', '#949eab'],
  };
  // "Vibrant" is the same hues pushed to a higher saturation — noticeably more
  // colorful, but capped so it never blows out or hurts legibility. Derived from
  // MUTED so the two sets share identity and switching only changes intensity.
  function vivify(hex, theme) {
    var c = hexToHsl(hex);
    var s = Math.min(theme === 'dark' ? 70 : 74, c.s * 1.42);
    return hslToHex(c.h, s, c.l);
  }
  var VIVID = {
    light: MUTED.light.map(function (h) { return vivify(h, 'light'); }),
    dark:  MUTED.dark.map(function (h) { return vivify(h, 'dark'); }),
  };
  var PALETTES = { muted: MUTED, vibrant: VIVID };
  var variant = 'muted';                 // active palette variant
  function paletteFor(theme) { return (PALETTES[variant] || MUTED)[theme] || MUTED.light; }
  // Kept for back-compat: a live view of the active variant's palette.
  var SERIES = { get light() { return paletteFor('light'); }, get dark() { return paletteFor('dark'); } };

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
    var arr = paletteFor(theme);
    return arr[((index % arr.length) + arr.length) % arr.length];
  }

  /* ---- HSL <-> hex, for generating/adjusting hues beyond the curated set ---- */
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
  function hexToHsl(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0, l = (mx + mn) / 2;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h: h, s: s * 100, l: l * 100 };
  }
  var isVibrant = function () { return variant === 'vibrant'; };

  /* -----------------------------------------------------------------------------
   * scale(theme, n) — return n maximally distinct, professional colors.
   *   • n within the curated palette  -> the curated colors (already ordered for
   *     maximum separation), so small graphs get the hand-tuned hues.
   *   • n beyond the palette           -> a fully generated even-hue ramp so that
   *     large graphs still get n *distinct* colors instead of cycling/repeating.
   * This is what makes "20 datasets" show 20 different colors rather than three
   * of them landing on the same hue.
   * --------------------------------------------------------------------------- */
  function scale(theme, n) {
    var arr = paletteFor(theme);
    n = Math.max(1, n | 0);
    if (n <= arr.length) return arr.slice(0, n);
    // Beyond the curated set, generate hues with the golden angle so that
    // CONSECUTIVE indices land far apart on the wheel (not a slow sequential
    // sweep) — crowded graphs stay distinguishable. Saturation tracks the active
    // variant so generated colors match the curated ones.
    var dark = theme === 'dark', vib = isVibrant();
    var baseSat = vib ? (dark ? 62 : 62) : (dark ? 46 : 45);
    var out = [];
    for (var i = 0; i < n; i++) {
      var hue = (i * 137.508 + 205) % 360;           // golden-angle spacing
      var band = i % 3;
      var light = dark ? (54 + band * 6) : (50 - band * 5);
      out.push(hslToHex(hue, baseSat, light));
    }
    return out;
  }

  /* shade(theme, hue, frac) — a color on a single hue, from bright (frac 0) to
   * deep (frac 1), kept professional (never neon, never near-black). Used by the
   * "group by trial / by sensor" arrangements to tie related series to one hue. */
  function shade(theme, hue, frac) {
    frac = Math.max(0, Math.min(1, frac));
    var dark = theme === 'dark', vib = isVibrant();
    var light = dark ? (66 - 30 * frac) : (58 - 28 * frac);   // dark: 66->36, light: 58->30
    var base = vib ? (dark ? 72 : 76) : (dark ? 58 : 62);
    var sat = base - 10 * frac;                               // ease saturation as it deepens
    return hslToHex(hue, sat, light);
  }

  // Hue identities of the curated palette (variant-independent), ordered for
  // maximum adjacent distinctness — the professional, readable sequence used for
  // grouping colors by trial / by sensor.
  var BASE_HUES = MUTED.light.map(function (h) { return Math.round(hexToHsl(h).h); });
  /* spreadHues(n): n distinct, professional, well-separated hues. Uses the curated
   * order first (so small groups get the hand-tuned distinct hues, never a muddy
   * red/yellow/green run), then the golden angle for larger groups. */
  function spreadHues(n) {
    n = Math.max(1, n | 0);
    if (n <= BASE_HUES.length) return BASE_HUES.slice(0, n);
    var out = BASE_HUES.slice();
    for (var i = BASE_HUES.length; i < n; i++) out.push(Math.round((210 + i * 137.508) % 360));
    return out;
  }
  /* randomHues(n): "organized randomness" — a random starting hue swept by the
   * golden angle (so the set stays maximally spread and readable), then shuffled
   * so which item gets which hue varies. Saturation/lightness come from shade(),
   * so results are always professional, never neon or clashing. */
  function randomHues(n) {
    n = Math.max(1, n | 0);
    var start = Math.random() * 360, hues = [];
    for (var i = 0; i < n; i++) hues.push((start + i * 137.508) % 360);
    for (var j = hues.length - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)); var t = hues[j]; hues[j] = hues[k]; hues[k] = t; }
    return hues;
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
    shade: shade,
    spreadHues: spreadHues,
    randomHues: randomHues,
    hslToHex: hslToHex,
    hexToHsl: hexToHsl,
    setVariant: function (v) { variant = (v === 'vibrant') ? 'vibrant' : 'muted'; },
    getVariant: function () { return variant; },
    chart: function (name) { return CHART[name] || CHART.light; },
    apply: applyTheme,
  };
})(window.TS = window.TS || {});
