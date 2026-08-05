/* icons.js — inline stroke icons (no external assets). */
(function (TS) {
  'use strict';
  function svg(paths, opts) {
    opts = opts || {};
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (opts.w || 1.7) + '" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  TS.Icons = {
    folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    download: svg('<path d="M12 3v12"/><path d="M7 11l5 4 5-4"/><path d="M4 20h16"/>'),
    image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M4 17l5-5 4 4 3-3 4 4"/>'),
    undo: svg('<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-1"/>'),
    redo: svg('<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h1"/>'),
    sun: svg('<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>'),
    moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.3 6.3 0 0 0 10.5 10.5z"/>'),
    eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
    eyeDim: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" stroke-dasharray="2.6 2.6"/><circle cx="12" cy="12" r="2.4"/>'),
    eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 6.1A9.7 9.7 0 0 1 12 6c6.4 0 10 6 10 6a15.9 15.9 0 0 1-3.4 4M6.6 6.6A15.7 15.7 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4-.9"/>'),
    chev: svg('<path d="M6 9l6 6 6-6"/>', { w: 2 }),
    check: svg('<path d="M4 12l5 5L20 6"/>', { w: 2.2 }),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>', { w: 2 }),
    plus: svg('<path d="M12 5v14M5 12h14"/>', { w: 2 }),
    trash: svg('<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>'),
    pencil: svg('<path d="M14.5 5.5l4 4M4 20l1-4L16 5a1.5 1.5 0 0 1 2 0l1 1a1.5 1.5 0 0 1 0 2L8 19z"/>'),
    zoomBoth: svg('<circle cx="10" cy="10" r="6.4"/><path d="M20.5 20.5l-5.6-5.6"/><path d="M10 7.2v5.6M7.2 10h5.6"/>'),
    expfit: svg('<path d="M4 4v16h16" /><path d="M4 18C10 18 8 6 20 6" />'),
    note: svg('<path d="M5 4h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M20 15h-4a1 1 0 0 0-1 1v4"/><path d="M8 9h8M8 13h4"/>'),
    refresh: svg('<path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 4v6h-6"/>'),
    shuffle: svg('<path d="M3 6h4l10 12h4M3 18h4l3.5-4.2M14.5 8.2 17 6h4"/><path d="M18 3l3 3-3 3M18 15l3 3-3 3"/>'),
    zoomX: svg('<circle cx="10" cy="10" r="6.4"/><path d="M20.5 20.5l-5.6-5.6"/><path d="M7.3 10h5.4M8.9 8.4 7.3 10l1.6 1.6M11.1 8.4 12.7 10l-1.6 1.6"/>'),
    zoomY: svg('<circle cx="10" cy="10" r="6.4"/><path d="M20.5 20.5l-5.6-5.6"/><path d="M10 7.3v5.4M8.4 8.9 10 7.3l1.6 1.6M8.4 11.1 10 12.7l1.6-1.6"/>'),
    panelLeft: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
    panelRight: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
    avg: svg('<path d="M3 16c4 0 4-8 8-8s4 8 8 8"/><path d="M3 12h18" stroke-dasharray="3 3"/>'),
    minmax: svg('<path d="M4 18l5-9 4 5 3-6 4 8"/><circle cx="9" cy="9" r="1.6"/><circle cx="16" cy="8" r="1.6"/>'),
    area: svg('<path d="M3 18l5-6 4 3 5-8v11z" fill="currentColor" fill-opacity=".18"/><path d="M3 18l5-6 4 3 5-8"/>'),
    fit: svg('<path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/>'),
    line: svg('<path d="M4 17L10 9l4 4 6-9"/>'),
    smooth: svg('<path d="M3 15c3 0 3-6 6-6s3 6 6 6 3-6 6-6"/>'),
    cursor: svg('<path d="M8 3v18M16 3v18" stroke-dasharray="2 3"/><path d="M8 12h8"/>'),
    threshold: svg('<path d="M3 14h18" stroke-dasharray="3 3"/><path d="M3 18l4-7 4 3 3-6 3 5"/>'),
    dots: svg('<circle cx="6" cy="12" r="4"/><circle cx="16" cy="7" r="1.7"/><circle cx="18" cy="16" r="1.7"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6 2 2 0 0 1 14 3.6a1.6 1.6 0 0 0 2.7-1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
    clear: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/><path d="M10 11l4 4M14 11l-4 4"/>'),
    grid: svg('<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
    warn: svg('<path d="M12 3.5L22 20H2z"/><path d="M12 10v4"/><circle cx="12" cy="17.2" r="0.4" fill="currentColor"/>'),
    palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1.5-1-1.5-1-3 0-1 .8-2 2-2h1a4 4 0 0 0 4-4c0-3.9-3.6-7-8-7z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>'),
    ruler: svg('<rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>'),
    tune: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  };
})(window.TS = window.TS || {});
