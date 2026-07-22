/* =============================================================================
 * organizer.js — Builds the Excel-friendly organized CSV.
 *
 * Layout: every trial gets its own Time + channel column group (no resampling,
 * no interpolation, no precision loss) so an Excel XY-scatter of one experiment
 * plots every trial correctly on its own X values with no manual series editing.
 *
 * Options (per the requested tweaks):
 *   - layout: 'stacked'  -> experiment tables placed one above the next
 *             'sideBySide'-> experiment tables placed in adjacent column ranges
 *   - includeHeader: include the per-trial detail table (device, date, scan
 *     rate, duration, ...) above each experiment's data.
 * ============================================================================= */
(function (TS) {
  'use strict';

  function csvEscape(v) {
    if (v == null) return '';
    var s = String(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function fmt(v, dp) {
    if (v == null || isNaN(v)) return '';
    return v.toFixed(dp);
  }

  function trialDate(tr) {
    if (tr.startTimeRaw) {
      var m = /^(\d{1,2}\/\d{1,2}\/\d{4})/.exec(tr.startTimeRaw);
      if (m) return m[1];
    }
    return '';
  }
  function trialClock(tr) {
    if (tr.startTimeRaw) {
      var m = /\d{1,2}\/\d{1,2}\/\d{4}\s+(.*)$/.exec(tr.startTimeRaw);
      if (m) return m[1];
    }
    return '';
  }
  function duration(tr) {
    var t = tr.timeSeconds;
    return t && t.length ? t[t.length - 1] - t[0] : 0;
  }

  /* Build one experiment as a rectangular grid of raw cell values. */
  function buildBlock(exp, opts) {
    var timeDp = opts.timeDecimals, valDp = opts.valueDecimals;
    var rows = [];
    var trials = exp.trials;

    rows.push(['Experiment ' + exp.number]);

    if (opts.includeHeader) {
      rows.push(['Trial', 'Source File', 'Device', 'Date', 'Start Time',
        'Time Format', 'Scan Rate (Hz)', 'Channels', 'Samples', 'Duration (s)']);
      trials.forEach(function (tr) {
        rows.push([
          'Trial ' + tr.trial, tr.filename, tr.device || '', trialDate(tr), trialClock(tr),
          tr.timeMode === 'clock' ? 'Date/Time (clock)' : 'Time (s)',
          tr.scanRate != null ? tr.scanRate : '',
          tr.channels.map(function (c) { return c.name; }).join(', '),
          tr.sampleCount, fmt(duration(tr), timeDp),
        ]);
      });
      rows.push([]); // spacer
    }

    // Column-group header rows: group label then per-channel headers.
    var groupRow = [];
    var headerRow = [];
    trials.forEach(function (tr, ti) {
      if (ti > 0) { groupRow.push(''); headerRow.push(''); } // spacer column between trials
      groupRow.push('Trial ' + tr.trial);
      headerRow.push('Time (s)');
      tr.channels.forEach(function (ch, ci) {
        if (ci > 0) groupRow.push('');
        headerRow.push(opts.convert ? (ch.name + ' (' + opts.convert.unit + ')')
          : (ch.header || (ch.name + (ch.unit ? ' (' + ch.unit + ')' : ''))));
      });
    });
    rows.push(groupRow);
    rows.push(headerRow);

    // Data rows.
    var maxLen = 0;
    trials.forEach(function (tr) { maxLen = Math.max(maxLen, tr.timeSeconds.length); });
    for (var r = 0; r < maxLen; r++) {
      var row = [];
      trials.forEach(function (tr, ti) {
        if (ti > 0) row.push('');
        if (r < tr.timeSeconds.length) {
          row.push(fmt(tr.timeSeconds[r], timeDp));
          tr.channels.forEach(function (ch) { row.push(fmt(opts.convert ? opts.convert.fn(ch.values[r]) : ch.values[r], valDp)); });
        } else {
          row.push('');
          tr.channels.forEach(function () { row.push(''); });
        }
      });
      rows.push(row);
    }

    // Normalize width.
    var width = 0;
    rows.forEach(function (r) { width = Math.max(width, r.length); });
    rows.forEach(function (r) { while (r.length < width) r.push(''); });
    return { rows: rows, width: width };
  }

  function buildOrganizedCsv(experiments, options) {
    var opts = Object.assign({
      layout: 'stacked', includeHeader: true, timeDecimals: 3, valueDecimals: 4,
    }, options || {});

    var blocks = experiments.map(function (exp) { return buildBlock(exp, opts); });
    var grid = [];

    if (opts.layout === 'sideBySide') {
      var height = 0;
      blocks.forEach(function (b) { height = Math.max(height, b.rows.length); });
      for (var r = 0; r < height; r++) {
        var line = [];
        blocks.forEach(function (b, bi) {
          if (bi > 0) line.push('', ''); // two spacer columns between experiments
          var src = b.rows[r] || [];
          for (var c = 0; c < b.width; c++) line.push(src[c] != null ? src[c] : '');
        });
        grid.push(line);
      }
    } else { // stacked
      blocks.forEach(function (b, bi) {
        if (bi > 0) { grid.push([]); grid.push([]); } // two spacer rows between experiments
        b.rows.forEach(function (row) { grid.push(row); });
      });
    }

    return grid.map(function (row) {
      return row.map(csvEscape).join(',');
    }).join('\r\n') + '\r\n';
  }

  TS.Organizer = { buildOrganizedCsv: buildOrganizedCsv, csvEscape: csvEscape };
})(window.TS = window.TS || {});
