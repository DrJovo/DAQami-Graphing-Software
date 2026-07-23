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
      stats: [],              // [{ id, kind:'mean'|'median'|'mode'|'stddev', datasetIds:[...], color }]
      statPick: null,         // remembered dataset selection for the Statistics tool
      bestFit: [], bestFitDomain: freshDomain(),   // [datasetId,...]
      minmax: [], minmaxDomain: freshDomain(),     // [datasetId,...]
      areas: [], areaDomain: freshDomain(),        // [datasetId,...]
      smooth: {},             // datasetId -> { on:bool, strength:number }
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
        markerSize: s.markerSize, lineWidth: s.lineWidth, datasetStyles: s.datasetStyles,
        trialOffsets: s.trialOffsets, graphs: s.graphs, custom: s.custom,
      });
    },
    _apply: function (snap) {
      var s = this.state;
      var d = clone(snap);
      s.theme = d.theme; s.currentExperiment = d.currentExperiment; s.graphMode = d.graphMode;
      s.modeSelector = d.modeSelector; s.plotType = d.plotType; s.showGrid = d.showGrid; s.legend = d.legend;
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
      this.state.dirty = false;
      this.notify();
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
      if (!st) { st = { colorIndex: 0, customColor: null, shape: 'circle', visibility: 'on' }; this.state.datasetStyles[id] = st; }
      return st;
    },
    resolveColor: function (id) {
      var st = this.style(id);
      return st.customColor || TS.Theme.seriesColor(this.state.theme, st.colorIndex);
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
        app: 'ThermoScope', formatVersion: 1, savedAt: new Date().toISOString(),
        folderName: this.data.folderName, workspace: this._snapshot(),
      };
    },
    prepareRestore: function (obj) { this._pendingRestore = obj.workspace; },
    loadSessionInto: function (obj) {
      // used when data already loaded and ids still valid
      this._apply(obj.workspace);
      if (!this.currentExperiment() && this.data.experiments.length)
        this.state.currentExperiment = this.data.experiments[0].number;
      this._ensureSelectors();
      this.resetHistory('session');
      this.state.dirty = false;
      this.notify();
    },
  };

  TS.Store = Store;
  TS.freshGraph = freshGraph;
  TS.freshDomain = freshDomain;
})(window.TS = window.TS || {});
