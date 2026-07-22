/* =============================================================================
 * parser.js — Reads a raw DAQami CSV export into a structured trial object.
 *
 * DAQami exports look like:
 *
 *   "Device: USB-2408-2AO"
 *   "Serial Number: 2060DB1"
 *   "Channel Count: 2"
 *   "Sample Count: 601"
 *   "Start Time: 7/8/2026 2:26:29.4 PM"
 *   "Scan Rate: 10"
 *   "Sample","Date/Time","AI0 (°C)","AI1 (°C)"
 *   "0","7/8/2026 2:26:29.4 PM","27.116","27.514"
 *   ...
 *
 * Notes that shape this parser:
 *   - UTF-8 with a leading BOM, CRLF line endings, every field quoted.
 *   - The metadata block can be any number of lines; the real landmark is the
 *     header row whose first field is literally "Sample".
 *   - Two time formats exist: "Date/Time" (absolute clock) and "Time (s)"
 *     (seconds since start). Clock times are converted to seconds using the
 *     file's own "Start Time".
 *   - Channel count varies; every column after the time column is a channel.
 *   - The experiment/trial numbers come from the filename prefix, which is
 *     auto-detected (or matched against a user-supplied template).
 * ============================================================================= */
(function (TS) {
  'use strict';

  // Auto-detects an "experiment then trial" prefix: E1T1, E1 T1, E1-T1,
  // Experiment 1 - Trial 1, Exp1 Tr1, Ex1 * Tr1, etc. (anchored to the start).
  var AUTO_RE = /^\s*e(?:xp(?:eriment)?)?[^0-9]*?(\d+)[^0-9]*?t(?:r(?:ial)?)?[^0-9]*?(\d+)/i;
  var CLOCK_RE =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(AM|PM)?$/i;

  /* Split one physical CSV line into fields, honoring quotes and "" escapes. */
  function parseCsvLine(line) {
    var out = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { out.push(field); field = ''; }
        else field += c;
      }
    }
    out.push(field);
    return out;
  }

  /* "AI0 (°C)" -> { name: "AI0", unit: "°C" }.  Gracefully handles no unit. */
  function splitChannelHeader(text) {
    var m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(text.trim());
    if (m) return { name: m[1].trim(), unit: m[2].trim() };
    return { name: text.trim(), unit: '' };
  }

  /* Parse a DAQami clock timestamp to epoch ms (UTC, so it is timezone-proof —
   * these values are only ever subtracted from one another). */
  function parseClock(text) {
    if (text == null) return NaN;
    var m = CLOCK_RE.exec(String(text).trim());
    if (!m) return NaN;
    var month = +m[1], day = +m[2], year = +m[3];
    var hour = +m[4], min = +m[5], sec = +m[6];
    var frac = m[7] ? parseFloat('0.' + m[7]) : 0;
    var mer = m[8] ? m[8].toUpperCase() : null;
    if (mer === 'PM' && hour !== 12) hour += 12;
    else if (mer === 'AM' && hour === 12) hour = 0;
    var ms = Math.round(frac * 1000);
    return Date.UTC(year, month - 1, day, hour, min, sec, ms);
  }

  /* Parse an elapsed-time value to seconds. DAQami's "Time (s)" column can be
   * plain seconds ("35.949") OR a colon-separated elapsed clock — "SS.mmm",
   * "M:SS.mmm", or "H:MM:SS.mmm" (e.g. "1:07.542" -> 67.542). A naive parseFloat
   * silently returns 0 for the colon forms, which is exactly the "all times 0"
   * bug, so every colon-part is folded in base-60. */
  function parseElapsed(text) {
    if (text == null) return NaN;
    var str = String(text).trim();
    if (str === '') return NaN;
    if (str.indexOf(':') < 0) return parseFloat(str);
    var parts = str.split(':'), total = 0;
    for (var i = 0; i < parts.length; i++) {
      var v = parseFloat(parts[i]);
      if (isNaN(v)) return NaN;
      total = total * 60 + v;
    }
    return total;
  }

  /* Turn a user template like "E{e}T{t}" or "Experiment {e} - Trial {t}" into a
   * matching regex. {e}/{t} become number captures; everything else is literal. */
  function buildFilenameRegex(template) {
    if (!template) return AUTO_RE;
    var esc = String(template).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    esc = esc.replace(/\\\{e\\\}/gi, '(\\d+)').replace(/\\\{t\\\}/gi, '(\\d+)');
    try { return new RegExp('^\\s*' + esc, 'i'); } catch (e) { return AUTO_RE; }
  }

  /* Parse "E3T4 - Analog - ... .csv" -> { experiment: 3, trial: 4 }. */
  function parseFilename(filename, regex) {
    var base = String(filename).replace(/\.[^.]*$/, '');
    var m = (regex || AUTO_RE).exec(base.trim());
    if (m) return { experiment: +m[1], trial: +m[2] };
    return { experiment: null, trial: null };
  }

  function metaValue(meta, key) {
    var k = key.toLowerCase();
    for (var i = 0; i < meta.length; i++) {
      if (meta[i].key.toLowerCase() === k) return meta[i].value;
    }
    return null;
  }

  function parseDaqamiCsv(text, filename, opts) {
    opts = opts || {};
    var warnings = [];
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
    var rawLines = text.split(/\r\n|\n|\r/);

    // Locate the header row (first field === "Sample"); everything above is metadata.
    var headerIdx = -1;
    for (var i = 0; i < rawLines.length; i++) {
      if (rawLines[i] === '') continue;
      var first = parseCsvLine(rawLines[i])[0];
      if (first != null && first.trim().toLowerCase() === 'sample') { headerIdx = i; break; }
    }
    if (headerIdx === -1) {
      return {
        filename: filename, error: 'No "Sample" header row found — not a DAQami export.',
        experiment: null, trial: null, warnings: warnings,
      };
    }

    // Metadata: each line is a single quoted "Key: Value" field.
    var meta = [];
    for (var j = 0; j < headerIdx; j++) {
      if (rawLines[j].trim() === '') continue;
      var cell = parseCsvLine(rawLines[j])[0];
      var ci = cell.indexOf(':');
      if (ci >= 0) meta.push({ key: cell.slice(0, ci).trim(), value: cell.slice(ci + 1).trim() });
    }

    var header = parseCsvLine(rawLines[headerIdx]).map(function (h) { return h.trim(); });
    var timeHeader = header[1] || '';
    var channelHeaders = header.slice(2);

    function isBlank(s) { return s == null || String(s).trim() === ''; }
    function rowBlank(f) { for (var k = 0; k < f.length; k++) if (!isBlank(f[k])) return false; return true; }

    // Decide the time mode from the ACTUAL data, using the header only as a hint.
    // DAQami is normally consistent, but a "Date/Time" header can contain plain
    // seconds (or the reverse); trusting the header alone yields all-NaN times.
    var headerMode = /date\s*\/?\s*time/i.test(timeHeader) ? 'clock'
      : (/time\s*\(s\)|seconds|\(s\)/i.test(timeHeader) ? 'seconds' : null);
    var sniff = null;
    for (var sr = headerIdx + 1; sr < rawLines.length; sr++) {
      if (rawLines[sr].trim() === '') continue;
      var sf = parseCsvLine(rawLines[sr]);
      if (rowBlank(sf) || isBlank(sf[1])) continue;
      sniff = String(sf[1]).trim(); break;
    }
    var timeMode = sniff == null ? (headerMode || 'seconds')
      : CLOCK_RE.test(sniff) ? 'clock'
      : isFinite(parseElapsed(sniff)) ? 'seconds'   // plain seconds OR M:SS.mmm elapsed
      : (headerMode || 'seconds');
    if (headerMode && headerMode !== timeMode) {
      warnings.push('The time column is labelled "' + timeHeader + '" but its values look like ' +
        (timeMode === 'seconds' ? 'plain seconds' : 'clock timestamps') + '; read as ' + timeMode + '.');
    }

    var fn = parseFilename(filename, opts.filenameRegex);
    var startTimeRaw = metaValue(meta, 'Start Time');
    var startMs = startTimeRaw != null ? parseClock(startTimeRaw) : NaN;
    if (timeMode === 'clock' && isNaN(startMs) && sniff != null && CLOCK_RE.test(sniff)) startMs = parseClock(sniff);

    // Collect data rows, defensively.
    var nCh = channelHeaders.length;
    var timeSeconds = [];
    var channelValues = [];
    for (var c = 0; c < nCh; c++) channelValues.push([]);

    var skippedRows = 0, missingVals = 0;
    for (var r = headerIdx + 1; r < rawLines.length; r++) {
      if (rawLines[r] === '' || rawLines[r].trim() === '') continue;
      var fields = parseCsvLine(rawLines[r]);
      if (rowBlank(fields)) continue;                    // ",,," padding lines
      var tcell = fields[1];
      var tSec;
      if (timeMode === 'clock') { tSec = (parseClock(tcell) - startMs) / 1000; }
      else { tSec = isBlank(tcell) ? NaN : parseElapsed(tcell); }
      if (!isFinite(tSec)) { skippedRows++; continue; }  // unusable time -> drop row
      timeSeconds.push(tSec);
      for (var cc = 0; cc < nCh; cc++) {
        var rawv = fields[cc + 2];
        var v = isBlank(rawv) ? NaN : parseFloat(rawv);
        if (isNaN(v)) missingVals++;
        channelValues[cc].push(v);
      }
    }

    // Data-quality warnings.
    var declaredSamples = metaValue(meta, 'Sample Count');
    if (nCh === 0) warnings.push('No measurement channels were found in this file.');
    if (timeSeconds.length === 0) warnings.push('No usable data rows were found in this file.');
    if (skippedRows > 0) warnings.push(skippedRows + ' row' + (skippedRows > 1 ? 's were' : ' was') + ' skipped (no readable time value).');
    if (missingVals > 0) warnings.push(missingVals + ' missing measurement' + (missingVals > 1 ? 's' : '') + ' (blank cells) kept as gaps.');
    if (startTimeRaw == null && timeMode === 'clock') warnings.push('Start Time was missing; time was zeroed against the first sample.');
    if (declaredSamples != null && isFinite(+declaredSamples) && +declaredSamples !== timeSeconds.length)
      warnings.push('Header lists ' + declaredSamples + ' samples but ' + timeSeconds.length + ' were read.');
    if (fn.experiment === null) warnings.push('Filename does not match the experiment/trial pattern; experiment/trial unknown.');

    // Monotonicity / duplicate checks (interpolation assumes increasing time).
    var nonMono = false, dup = false;
    for (var mi = 1; mi < timeSeconds.length; mi++) {
      if (timeSeconds[mi] < timeSeconds[mi - 1]) nonMono = true;
      else if (timeSeconds[mi] === timeSeconds[mi - 1]) dup = true;
    }
    if (nonMono) warnings.push('Time values are not strictly increasing — some analysis may be approximate.');
    else if (dup) warnings.push('Some time values are duplicated.');

    var channels = channelHeaders.map(function (h, idx) {
      var sc = splitChannelHeader(h);
      return {
        name: sc.name, unit: sc.unit, header: h,
        values: Float64Array.from(channelValues[idx]),
      };
    });

    return {
      filename: filename,
      experiment: fn.experiment,
      trial: fn.trial,
      device: metaValue(meta, 'Device'),
      serialNumber: metaValue(meta, 'Serial Number'),
      channelCount: channels.length,
      sampleCount: timeSeconds.length,
      declaredSampleCount: declaredSamples != null && isFinite(+declaredSamples) ? +declaredSamples : null,
      startTimeRaw: startTimeRaw,
      startMs: isNaN(startMs) ? null : startMs,
      scanRate: metaValue(meta, 'Scan Rate') != null ? parseFloat(metaValue(meta, 'Scan Rate')) : null,
      timeMode: timeMode,
      timeSeconds: Float64Array.from(timeSeconds),
      channels: channels,
      rowCount: timeSeconds.length,
      meta: meta,
      warnings: warnings,
      error: null,
    };
  }

  TS.Parser = {
    parseDaqamiCsv: parseDaqamiCsv,
    parseCsvLine: parseCsvLine,
    parseClock: parseClock,
    parseElapsed: parseElapsed,
    parseFilename: parseFilename,
    buildFilenameRegex: buildFilenameRegex,
    splitChannelHeader: splitChannelHeader,
    AUTO_RE: AUTO_RE,
  };
})(window.TS = window.TS || {});
