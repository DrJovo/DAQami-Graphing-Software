/* =============================================================================
 * store.js — Single source of truth for workspace state.
 *
 * Key design points:
 *   - Analysis work (manual points/lines, averages, areas, best-fit, smoothing,
 *     cursors, thresholds) is stored PER GRAPH, keyed by experiment+mode+selector,
 *     so switching graphs never merges one graph's tools into another. Overlays
 *     are stored as *descriptors* and recomputed at render time, which also makes
 *     theme changes recolor overlays automatically.
 *   - Undo/redo is a history-array + index model over a JSON-cloneable snapshot
 *     of the workspace (never the raw measurement data).
 * ============================================================================= */
(function (TS) {
  'use strict';
  var DM = TS.DataModel;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function freshDomain() { return { kind: 'full', xMin: null, xMax: null }; } // 'full'|'trial'|'view'|'manual'

  function freshGraph() {
    return {
      name: null,             // custom graph name (null = auto-generated)
      manualPoints: [], manualLines: [],
      annotations: [],        // [{ id, x, y, text, dx, dy }] — anchored labels with a leader line
      stats: [],              // [{ id, kind:'mean'|'median'|'mode'|'stddev'|'meanstd', datasetIds:[...], color, name }]
      statPick: null,         // remembered dataset selection for the Statistics tool
      // Unified curve fit: model + per-model options, one line style, optional extend.
      curveFit: { ids: [], domain: freshDomain(), model: 'exp', polyDegree: 3, direction: 'auto', baseline: null, style: 'dotted', extend: true },
      features: [], featureDomain: freshDomain(), featureOpts: { threshold: null, settleBand: 1 }, // features & settling
      areas: [], areaDomain: freshDomain(),        // [datasetId,...]
      smooth: {},             // datasetId -> { on:bool, strength:number }
      smoothDomain: freshDomain(),   // x-range the smoothing is applied over (blended at its edges)
      cursors: [],            // up to 2 x-values
      threshold: null,        // null | { level:number }
    };
  }

  function Store() {
    this.subs = [];
    this.data = { experiments: [], parsedTrials: [], folderName: null, warnings: [] };
    this.state = this._defaultState();
    this._nextId = 1;
    this.history = [{ label: 'baseline', snapshot: this._snapshot() }];
    this.historyIndex = 0;
    this._pendingRestore = null;
  }

  Store.prototype = {
    _defaultState: function () {
      return {
        theme: 'light',
        currentExperiment: null,
        graphMode: 'BY_SENSOR',
        modeSelector: { BY_SENSOR: null, BY_TRIAL: null },
        plotType: 'line',
        showGrid: { major: true, minor: false },
        legend: true,
        legendCorner: 'tr',      // 'tl' | 'tr' | 'bl' | 'br'
        colorMode: 'auto',       // last color arrangement: auto|byTrial|bySensor|visible|random
        markerSize: 3,
        lineWidth: 1.8,
        datasetStyles: {},
        trialOffsets: {},        // 'E{n}' -> { offset, duration }
        graphs: {},              // graphKey -> descriptor
        custom: { selected: null }, // Custom mode: list of item keys (null = not yet initialised)
        filenamePattern: { mode: 'auto', template: 'E{e}T{t}' }, // load-time setting (not undone)
      };
    },

    subscribe: function (fn) { this.subs.push(fn); return fn; },
    notify: function () { for (var i = 0; i < this.subs.length; i++) this.subs[i](); },
    uid: function (prefix) { return (prefix || 'id') + '_' + (this._nextId++); },

    /* ---- snapshot / history ---- */
    _snapshot: function () {
      var s = this.state;
      return clone({
        theme: s.theme, currentExperiment: s.currentExperiment, graphMode: s.graphMode,
        modeSelector: s.modeSelector, plotType: s.plotType, showGrid: s.showGrid, legend: s.legend,
        legendCorner: s.legendCorner, colorMode: s.colorMode,
        markerSize: s.markerSize, lineWidth: s.lineWidth, datasetStyles: s.datasetStyles,
        trialOffsets: s.trialOffsets, graphs: s.graphs, custom: s.custom,
      });
    },
    _apply: function (snap) {
      var s = this.state;
      var d = clone(snap);
      s.theme = d.theme; s.currentExperiment = d.currentExperiment; s.graphMode = d.graphMode;
      s.modeSelector = d.modeSelector; s.plotType = d.plotType; s.showGrid = d.showGrid; s.legend = d.legend;
      if (d.legendCorner) s.legendCorner = d.legendCorner;
      if (d.colorMode) s.colorMode = d.colorMode;
      s.markerSize = d.markerSize; s.lineWidth = d.lineWidth; s.datasetStyles = d.datasetStyles;
      s.trialOffsets = d.trialOffsets; s.graphs = d.graphs;
      if (d.custom) s.custom = d.custom;
      this._syncLiveStyles();
    },
    resetHistory: function (label) {
      this.history = [{ label: label || 'baseline', snapshot: this._snapshot() }];
      this.historyIndex = 0;
    },
    commit: function (label) {
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push({ label: label || 'change', snapshot: this._snapshot() });
      if (this.history.length > 100) { this.history.shift(); }
      this.historyIndex = this.history.length - 1;
      this.state.dirty = true;
      this.notify();
    },
    canUndo: function () { return this.historyIndex > 0; },
    canRedo: function () { return this.historyIndex < this.history.length - 1; },
    undo: function () { if (this.canUndo()) { this.historyIndex--; this._apply(this.history[this.historyIndex].snapshot); this.state.dirty = true; this.notify(); } },
    redo: function () { if (this.canRedo()) { this.historyIndex++; this._apply(this.history[this.historyIndex].snapshot); this.state.dirty = true; this.notify(); } },

    /* ---- data loading ---- */
    setData: function (parsedTrials, folderName) {
      var experiments = DM.buildExperiments(parsedTrials);
      this.data = {
        experiments: experiments, parsedTrials: parsedTrials, folderName: folderName,
        warnings: [],
      };
      var restore = this._pendingRestore; this._pendingRestore = null;
      if (restore) {
        this._apply(restore);
        // ensure current experiment still valid
        if (!DM.findExperiment(experiments, this.state.currentExperiment) && experiments.length)
          this.state.currentExperiment = experiments[0].number;
        this._ensureSelectors();
        this.resetHistory('session');
      } else {
        this.state.datasetStyles = DM.defaultStyles(experiments);
        this.state.graphs = {};
        this.state.custom = { selected: null };   // re-default the custom overlay for new data
        this.state.currentExperiment = experiments.length ? experiments[0].number : null;
        this._ensureSelectors();
        this.resetHistory('load');
      }
      this._defaultStylesCache = DM.defaultStyles(experiments);
      this._colorN = Object.keys(this._defaultStylesCache).length;   // palette size for stable default colors
      this.state.dirty = false;
      this.notify();
    },

    /* Re-read a folder without starting over: rebuild the experiments but KEEP the
     * workspace — existing datasets keep their styles/colors and every graph keeps
     * its analysis. New datasets get default styles; removed ones simply stop
     * rendering. Returns { added, removed } id counts. */
    updateData: function (parsedTrials, folderName) {
      var oldIds = {}; Object.keys(this._defaultStylesCache || {}).forEach(function (id) { oldIds[id] = 1; });
      var experiments = DM.buildExperiments(parsedTrials);
      this.data = { experiments: experiments, parsedTrials: parsedTrials, folderName: folderName, warnings: [] };
      var fresh = DM.defaultStyles(experiments);
      var added = 0, removed = 0, id;
      for (id in fresh) { if (!this.state.datasetStyles[id]) { this.state.datasetStyles[id] = fresh[id]; added++; } }
      for (id in oldIds) { if (!fresh[id]) removed++; }
      this._defaultStylesCache = fresh;
      this._colorN = Object.keys(fresh).length;
      if (!DM.findExperiment(experiments, this.state.currentExperiment) && experiments.length)
        this.state.currentExperiment = experiments[0].number;
      this._ensureSelectors();
      // Caller commits (so a color re-apply can be folded into the same undo step).
      return { added: added, removed: removed };
    },

    _ensureSelectors: function () {
      var exp = this.currentExperiment();
      if (!exp) return;
      var sel = this.state.modeSelector;
      if (sel.BY_SENSOR == null || exp.channelNames.indexOf(sel.BY_SENSOR) < 0)
        sel.BY_SENSOR = exp.channelNames[0] || null;
      var trials = DM.trialNumbers(exp);
      if (sel.BY_TRIAL == null || trials.indexOf(sel.BY_TRIAL) < 0)
        sel.BY_TRIAL = trials[0] != null ? trials[0] : null;
    },

    /* ---- accessors ---- */
    currentExperiment: function () { return DM.findExperiment(this.data.experiments, this.state.currentExperiment); },
    graphKey: function () {
      var s = this.state;
      if (s.graphMode === 'COMPARE_EXP') return 'CUSTOM'; // one persistent workspace for the custom overlay
      var sel = s.graphMode === 'BY_SENSOR' ? s.modeSelector.BY_SENSOR
        : s.graphMode === 'BY_TRIAL' ? s.modeSelector.BY_TRIAL : '';
      return 'E' + s.currentExperiment + '|' + s.graphMode + '|' + sel;
    },
    graph: function () {
      var k = this.graphKey();
      if (!this.state.graphs[k]) this.state.graphs[k] = freshGraph();
      return this.state.graphs[k];
    },
    currentDatasetIds: function () {
      var s = this.state, exp = this.currentExperiment();
      var sel = s.graphMode === 'BY_SENSOR' ? s.modeSelector.BY_SENSOR
        : s.graphMode === 'BY_TRIAL' ? s.modeSelector.BY_TRIAL : null;
      return DM.datasetIdsForMode(exp, s.graphMode, sel);
    },

    /* ---- styles ---- */
    style: function (id) {
      var st = this.state.datasetStyles[id];
      if (!st) { st = { colorIndex: 0, customColor: null, arrange: null, shape: 'circle', lineStyle: 'solid', visibility: 'on' }; this.state.datasetStyles[id] = st; }
      return st;
    },
    /* Colour precedence:
     *   1. customColor  — a color the user set by hand (swatch). Fixed; the
     *      muted/vibrant palette switch never touches it.
     *   2. arrange      — a color chosen by the Color Manager (by trial / by
     *      sensor / recolor visible). Stored as a recomputable spec so it tracks
     *      the active palette variant.
     *   3. auto         — the stable distinct default from the palette. */
    resolveColor: function (id) {
      var st = this.style(id);
      if (st.customColor) return st.customColor;
      var a = st.arrange;
      if (a) {
        if (a.type === 'hue') return TS.Theme.shade(this.state.theme, a.hue, a.frac);
        if (a.type === 'slot') { var ps = TS.Theme.scale(this.state.theme, Math.max(1, a.total)); return ps[((a.slot % ps.length) + ps.length) % ps.length]; }
      }
      var n = this._colorN || 8;
      var pal = TS.Theme.scale(this.state.theme, n);
      return pal[((st.colorIndex % n) + n) % n];
    },
    setDatasetStyle: function (id, patch) {
      Object.assign(this.style(id), patch);
    },
    _syncLiveStyles: function () { /* styles read live; nothing extra to sync */ },

    /* ---- trial timing ---- */
    trialTiming: function (expNum) {
      var k = 'E' + expNum;
      if (!this.state.trialOffsets[k]) this.state.trialOffsets[k] = { offset: 0, duration: 0 };
      return this.state.trialOffsets[k];
    },

    /* ---- session ---- */
    serializeSession: function () {
      return {
        app: 'ThermoScope', formatVersion: FORMAT_VERSION, savedAt: new Date().toISOString(),
        folderName: this.data.folderName, workspace: this._snapshot(),
      };
    },
    /* Upgrade a loaded session's workspace to the current shape: fill in fields
     * added since it was saved, migrate legacy descriptors, and drop retired ones.
     * Unknown fields from a NEWER file are simply ignored, so it never hard-fails. */
    migrateWorkspace: function (ws) {
      if (!ws || typeof ws !== 'object') return ws;
      if (ws.legendCorner == null) ws.legendCorner = 'tr';
      if (ws.colorMode == null) ws.colorMode = 'auto';
      var graphs = ws.graphs || {};
      for (var k in graphs) if (graphs.hasOwnProperty(k)) graphs[k] = migrateGraph(graphs[k]);
      return ws;
    },
    prepareRestore: function (obj) { this._pendingRestore = this.migrateWorkspace(obj && obj.workspace); },
    loadSessionInto: function (obj) {
      // used when data already loaded and ids still valid
      this._apply(this.migrateWorkspace(obj && obj.workspace));
      if (!this.currentExperiment() && this.data.experiments.length)
        this.state.currentExperiment = this.data.experiments[0].number;
      this._ensureSelectors();
      this.resetHistory('session');
      this.state.dirty = false;
      this.notify();
    },
  };

  var FORMAT_VERSION = 2;
  /* Bring one saved graph up to the current freshGraph() shape. */
  function migrateGraph(g) {
    var out = Object.assign(freshGraph(), g || {});
    // legacy Line-of-Best-Fit -> unified Curve Fit
    if (g && g.bestFit && g.bestFit.length && (!out.curveFit || !out.curveFit.ids || !out.curveFit.ids.length)) {
      out.curveFit = Object.assign(freshGraph().curveFit, { ids: g.bestFit.slice(), model: 'linear', domain: g.bestFitDomain || freshDomain() });
    }
    // legacy Min/Max/Mean -> Features & Settling
    if (g && g.minmax && g.minmax.length && (!out.features || !out.features.length)) {
      out.features = g.minmax.slice(); out.featureDomain = g.minmaxDomain || freshDomain();
    }
    // legacy standalone Exponential Fit -> Curve Fit (exp model)
    if (g && g.expFit && g.expFit.length && (!out.curveFit || !out.curveFit.ids || !out.curveFit.ids.length)) {
      out.curveFit = Object.assign(freshGraph().curveFit, { ids: g.expFit.slice(), model: 'exp', domain: g.expFitDomain || freshDomain() },
        g.expFitOpts || {});
    }
    ['bestFit', 'bestFitDomain', 'minmax', 'minmaxDomain', 'expFit', 'expFitDomain', 'expFitOpts'].forEach(function (f) { delete out[f]; });
    return out;
  }

  TS.Store = Store;
  TS.freshGraph = freshGraph;
  TS.freshDomain = freshDomain;
})(window.TS = window.TS || {});
