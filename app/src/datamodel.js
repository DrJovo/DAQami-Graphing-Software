/* =============================================================================
 * datamodel.js — Turns flat parsed trials into experiments, assigns stable ids
 * and default styles, and answers "which datasets belong on the chart right now"
 * for the active graph mode.
 *
 * A "dataset" is the smallest addressable unit: one channel of one trial
 * (e.g. E1T2's AI0). Its id is a stable string used everywhere (styles, undo,
 * session files), so nothing depends on load order.
 * ============================================================================= */
(function (TS) {
  'use strict';

  var SHAPES = ['circle', 'square', 'triangle', 'diamond', 'cross', 'star', 'triangleDown', 'plus'];

  var MODES = {
    BY_SENSOR: { id: 'BY_SENSOR', label: 'One Sensor · All Trials',  hint: 'Pick a sensor; every trial is drawn as its own line' },
    BY_TRIAL:  { id: 'BY_TRIAL',  label: 'One Trial · All Sensors', hint: 'Pick a trial; every sensor is drawn as its own line' },
    ALL:       { id: 'ALL',       label: 'Full Overview',   hint: 'Every sensor of every trial at once' },
  };

  var SEP = '::';

  function datasetId(exp, trial, channelName) {
    return 'E' + exp + 'T' + trial + SEP + channelName;
  }
  function parseDatasetId(id) {
    var si = id.indexOf(SEP);
    var head = id.slice(0, si);
    var channelName = id.slice(si + SEP.length);
    var m = /^E(\d+)T(\d+)$/.exec(head);
    if (!m) return null;
    return { experiment: +m[1], trial: +m[2], channelName: channelName };
  }

  function buildExperiments(parsedTrials) {
    var byExp = {};
    parsedTrials.forEach(function (t) {
      if (t.error || t.experiment == null) return;
      var k = t.experiment;
      (byExp[k] = byExp[k] || []).push(t);
    });
    var experiments = Object.keys(byExp).map(function (k) {
      var trials = byExp[k].slice().sort(function (a, b) { return a.trial - b.trial; });
      // Disambiguate duplicate trial numbers (two files claiming the same E#T#)
      // by reassigning collisions to the next free number so no data is silently
      // merged/hidden; the file keeps a warning noting the change.
      var seen = {}, maxT = 0;
      trials.forEach(function (tr) { if (tr.trial > maxT) maxT = tr.trial; });
      trials.forEach(function (tr) {
        if (seen[tr.trial]) {
          var orig = tr.trial; maxT += 1;
          tr.warnings = (tr.warnings || []).concat(['Another file already used trial ' + orig +
            ' in experiment ' + k + '; shown here as trial ' + maxT + '. Rename the file to fix this.']);
          tr.trial = maxT;
        }
        seen[tr.trial] = true;
      });
      trials.sort(function (a, b) { return a.trial - b.trial; });
      // union of channel names, in first-seen order
      var names = [];
      trials.forEach(function (tr) {
        tr.channels.forEach(function (ch) { if (names.indexOf(ch.name) < 0) names.push(ch.name); });
      });
      return { number: +k, trials: trials, channelNames: names };
    });
    experiments.sort(function (a, b) { return a.number - b.number; });
    return experiments;
  }

  /* Assign default color slot + shape to every dataset, deterministically, so
   * reloading the same folder yields the same defaults. */
  function defaultStyles(experiments) {
    var styles = {};
    var i = 0;
    experiments.forEach(function (exp) {
      exp.trials.forEach(function (tr) {
        tr.channels.forEach(function (ch) {
          var id = datasetId(exp.number, tr.trial, ch.name);
          styles[id] = {
            colorIndex: i % 8,
            customColor: null,
            shape: SHAPES[i % SHAPES.length],
            visibility: 'on', // 'on' | 'dim' | 'off'
            unit: ch.unit,
          };
          i++;
        });
      });
    });
    return styles;
  }

  function findExperiment(experiments, number) {
    for (var i = 0; i < experiments.length; i++) if (experiments[i].number === number) return experiments[i];
    return null;
  }

  function trialNumbers(exp) { return exp ? exp.trials.map(function (t) { return t.trial; }) : []; }

  /* Ordered dataset ids for the active mode.
   *   BY_SENSOR: selector = channel name  -> that channel across all trials
   *   BY_TRIAL:  selector = trial number  -> all channels of that trial
   *   ALL:       every channel of every trial
   */
  function datasetIdsForMode(exp, mode, selector) {
    if (!exp) return [];
    var ids = [];
    if (mode === 'BY_SENSOR') {
      exp.trials.forEach(function (tr) {
        tr.channels.forEach(function (ch) {
          if (ch.name === selector) ids.push(datasetId(exp.number, tr.trial, ch.name));
        });
      });
    } else if (mode === 'BY_TRIAL') {
      exp.trials.forEach(function (tr) {
        if (tr.trial === selector) {
          tr.channels.forEach(function (ch) { ids.push(datasetId(exp.number, tr.trial, ch.name)); });
        }
      });
    } else { // ALL
      exp.trials.forEach(function (tr) {
        tr.channels.forEach(function (ch) { ids.push(datasetId(exp.number, tr.trial, ch.name)); });
      });
    }
    return ids;
  }

  function resolveDatasetData(experiments, id) {
    var p = parseDatasetId(id);
    if (!p) return null;
    var exp = findExperiment(experiments, p.experiment);
    if (!exp) return null;
    var trial = null;
    for (var i = 0; i < exp.trials.length; i++) if (exp.trials[i].trial === p.trial) { trial = exp.trials[i]; break; }
    if (!trial) return null;
    var channel = null;
    for (var j = 0; j < trial.channels.length; j++) if (trial.channels[j].name === p.channelName) { channel = trial.channels[j]; break; }
    if (!channel) return null;
    return {
      xs: trial.timeSeconds,
      ys: channel.values,
      unit: channel.unit,
      trial: trial,
      channel: channel,
      experiment: exp.number,
      trialNumber: trial.trial,
      channelName: channel.name,
      label: 'E' + exp.number + 'T' + trial.trial + ' · ' + channel.name,
      shortLabel: 'T' + trial.trial + ' · ' + channel.name,
    };
  }

  /* A label describing a dataset in the context of the current mode (keeps the
   * legend uncluttered — trials in Compare Trials, sensors in Compare Sensors). */
  function datasetLabelForMode(experiments, id, mode) {
    var d = resolveDatasetData(experiments, id);
    if (!d) return id;
    if (mode === 'BY_SENSOR') return 'Trial ' + d.trialNumber;
    if (mode === 'BY_TRIAL') return d.channelName;
    return d.label;
  }

  TS.DataModel = {
    SHAPES: SHAPES,
    MODES: MODES,
    datasetId: datasetId,
    parseDatasetId: parseDatasetId,
    buildExperiments: buildExperiments,
    defaultStyles: defaultStyles,
    findExperiment: findExperiment,
    trialNumbers: trialNumbers,
    datasetIdsForMode: datasetIdsForMode,
    resolveDatasetData: resolveDatasetData,
    datasetLabelForMode: datasetLabelForMode,
  };
})(window.TS = window.TS || {});
