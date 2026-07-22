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

  // Categorical series palette (8 hues), per surface.
  var SERIES = {
    light: ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'],
    dark:  ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181', '#d95926'],
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
    chart: function (name) { return CHART[name] || CHART.light; },
    apply: applyTheme,
  };
})(window.TS = window.TS || {});
