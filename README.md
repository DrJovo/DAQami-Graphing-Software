# ThermoScope

**Version 1.0.1.**

A polished, self-contained app for **organizing, graphing, and analyzing DAQami
thermocouple data**, built for the Center for Industrial & Medical Ultrasound (CIMU).

It reads the `.csv` files DAQami exports (grouped automatically by their `E#T#`
names), turns them into an Excel-ready organized workbook, and gives you an
interactive graphing and analysis workspace with publication-quality export — all
in a single HTML file that runs offline in your browser.

> ThermoScope was designed and built with **Claude Opus 4.8** (Anthropic), working
> from the requirements of a CIMU thermocouple-data workflow. The whole program is
> hand-buildable, dependency-free source — see *Part 2* if you want to change it.

---

# Part 1 — For everyone

## What it does

DAQami (the MCC data-acquisition app) exports one `.csv` per recording. A day of
experiments becomes a pile of files with names like `E1T1 - Analog - ....csv`.
ThermoScope turns that pile into something you can actually work with:

- **Organizes** every file by experiment and trial, straight from the `E#T#` in the
  filename — no manual sorting.
- **Cleans up the time axis** — files recorded in clock time are converted to
  *seconds since the experiment started*; files already in seconds are used as-is.
- **Exports an Excel-ready CSV** where every trial keeps its own Time + channel
  columns, so an XY-scatter of one experiment "just works" with no series editing.
- **Graphs and analyzes** interactively: multiple graph modes, statistics, curve
  fitting, smoothing, feature detection, annotations, and more.
- **Exports figures** as high-resolution PNG or vector SVG that match the screen
  exactly.

## Running it

**`ThermoScope.html` is the whole program in one file. There is nothing to install.**

- **Double-click `ThermoScope.html`** — it opens in your browser and runs entirely
  on your computer, offline. Your data never leaves the machine.
- Works in **Chrome, Edge, or Firefox**. Chrome or Edge are recommended (they enable
  silent folder refresh and native Save dialogs).

### Make it feel like a desktop app (optional)

In Chrome or Edge, open `ThermoScope.html`, then **⋮ menu → Save and share → Create
shortcut… → tick "Open as window."** You now get a standalone ThermoScope window with
its own taskbar icon and no browser chrome — no install, no `.exe`, same feel.

## Quick start

1. **Open Data Folder** (toolbar or File menu, or just **drag a folder onto the
   window**). Pick the folder of DAQami `.csv` files. Everything is grouped by
   experiment and trial automatically; any number of thermocouples (AI0, AI1, …) is
   detected from each file.

2. **Organize & Export** builds one clean CSV grouped by experiment. In Excel you can
   select an experiment's block and **Insert → Chart → Scatter (XY)** — every trial
   plots on its own X values. You choose stacked vs. side-by-side tables and whether
   to include the per-trial detail header.

3. **Graph & analyze** in the main workspace:
   - **Graph modes** — *One Sensor · All Trials*, *One Trial · All Sensors*, *Full
     Overview*, and *Custom* (hand-pick any trials, sensors, or per-experiment
     averages to overlay, even across experiments).
   - **Data series** — show / dim / hide each trace, set scatter shapes and per-series
     line styles, and use the **Color Manager** to group colors by trial or by sensor,
     recolor only the visible traces, or switch between a muted and vibrant palette.
     Colors are stable per dataset and carry across every mode; click any swatch to
     set your own.
   - **Analysis tools** (right panel, *per-graph* — they never bleed between graphs):
     Statistics (mean / median / mode / std-dev / mean ± SD), Features & Settling
     (with CSV export), Curve Fit (linear / polynomial / logarithmic / exponential
     with τ and asymptote), Area Under Curve, Smoothing, Rescale (smush or stretch a
     trace between draggable low/high handles), Manual Plotting, Annotations,
     Dual-Cursor Measure, and Threshold Crossing.
   - **Navigate** — scroll to zoom, **Ctrl+scroll** for X only, **Alt+scroll** for Y
     only, drag to pan, or use the pan sliders (which snap to the data edges). Each
     graph remembers its own zoom/pan.

4. **Export & save.** Export the graph as **PNG** (1×–4×) or **SVG** (vector). **Save
   Session** (Ctrl+S) writes your styling and analysis to a `.thermo.json` file;
   unsaved work is also autosaved and offered back the next time you open the same
   folder.

**Preferences** (Settings → Preferences, or Ctrl+`,`) cover the temperature unit for
display and export (Celsius / Fahrenheit / As Recorded), decimal precision, accent
color, interface density, legend sort order (by trial, sensor, or value — ascending or
descending), and a data time cap. Dark/light theme, undo/redo, and an unsaved-changes
warning are all built in.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | Open data folder |
| `Ctrl+S` | Save session (quick save) |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+,` | Preferences |
| `F` | Fit all data in view |
| `Esc` | Clear selection / close popovers |
| `Delete` / `Backspace` | Delete the selected note or manual point |
| Arrow keys | Nudge the selected note / point (`Shift` = larger step) |
| Scroll / `Ctrl`+scroll / `Alt`+scroll | Zoom both / X only / Y only |
| Ctrl-click a line | Add it to the selection (others dim) |

## Where to learn more / get help

- **In-app tooltips** — almost every button and control has a hover tooltip
  explaining what it does. The analysis tools each carry a one-line description.
- **About / Help** — Settings → About for version and a short overview.
- **This README** — *Part 2* below is the full technical reference.
- **Changing the program** — ThermoScope is open, readable source. If you need a new
  feature or a fix, the codebase is small and well-commented; a developer (or an AI
  coding assistant like Claude) can extend it using *Part 2* as the map.

---

# Part 2 — For developers and AI agents

This half documents *what ThermoScope is, how it is built, and how it works*, so a
human or an AI agent can confidently modify it. It assumes you can read modern
browser JavaScript; it does **not** assume any framework knowledge, because there is
no framework.

## Design philosophy

Five constraints shaped every decision:

1. **One file, no install.** The deliverable is a single `ThermoScope.html` that runs
   by double-click, offline, on any machine with a browser, for years, with nothing
   to update. No server, no bundler runtime, no `node_modules`.
2. **No dependencies.** Everything — CSV parsing, numerics, charting, SVG export — is
   written from scratch in plain ES5-style JavaScript. There is nothing to audit,
   nothing to go stale, and no supply chain.
3. **Readable, modular source.** The single file is *built* from small, focused
   modules so humans and AI can work on one concern at a time.
4. **The data is sacred.** Raw measurements are never mutated. Smoothing, unit
   conversion, and time-capping produce *derived* values; the originals stay intact
   and re-derivable.
5. **What you see is what you export.** Screen and export share one drawing routine,
   so a PNG/SVG is pixel-identical to the on-screen chart.

## Repository layout

```
D:\Graphing\
  ThermoScope.html        ← the built, shippable single file (generated)
  README.md               ← this file
  app\
    index.html            ← dev shell: loads src/* individually (has the favicon + DOM)
    build.py              ← inlines src/* + styles.css → ../ThermoScope.html
    src\
      theme.js            ← color tokens (light/dark) + series palettes + hue math
      parser.js           ← DAQami CSV → structured trial object
      datamodel.js        ← trials → experiments/datasets, graph modes, default styles
      analysis.js         ← pure numerics: interp, PCHIP, smoothing, regression, fits…
      organizer.js        ← Excel-friendly organized CSV (stacked / side-by-side)
      renderer.js         ← Canvas + SVG chart engine (one draw path → screen & export)
      chartview.js        ← live canvas: pan/zoom/hover, drag, hit-testing, export
      store.js            ← workspace state, per-graph analysis, undo/redo, sessions
      icons.js            ← inline SVG stroke icons
      main.js             ← the UI: menus, panels, tools, wiring (the only DOM file)
      styles.css          ← the design system
  data\, csv test data\   ← sample DAQami exports for manual testing
```

## Build and run

There is **no Node and no package manager.** The build is a single Python script that
does string inlining.

```bash
cd app
python build.py        # reads index.html, inlines src/* + styles.css, writes ../ThermoScope.html
```

`build.py` replaces each `<link rel="stylesheet" href="…">` with an inline `<style>`
and each `<script src="…"></script>` with an inline `<script>`, stripping `?v=` cache
querystrings. Anything else in `index.html` (the favicon data-URI, the DOM skeleton)
passes through untouched.

**Versioning.** The public release number lives in one place — `APP_VERSION` in
`main.js` (currently `'1.0.1'`). The build date is stamped in automatically: `main.js`
carries a `@@BUILD_DATE@@` token that `build.py` replaces with today's date, and both
appear in the **About** dialog (the un-inlined dev shell leaves the token in place and
shows "development build"). This app version is separate from the session
`FORMAT_VERSION` in `store.js`, which only changes when the saved-file schema changes.
To cut a release: bump `APP_VERSION`, run `python build.py`, ship `ThermoScope.html`.

**Developing against the un-inlined sources** is faster — edit `app/src/*.js` and
reload `app/index.html` directly. Because `index.html` uses File System Access APIs,
serve it over `http://` rather than `file://`:

```bash
cd D:\Graphing
python -m http.server 8123 --bind 127.0.0.1
# then open http://127.0.0.1:8123/app/index.html
```

Rebuild the single file (`python build.py`) before shipping.

## Architecture

### The `window.TS` namespace and load order

Every module is an IIFE that attaches its exports to the global `window.TS`
namespace:

```js
(function (TS) {
  'use strict';
  // …
  TS.Parser = { parseDaqamiCsv: parseDaqamiCsv, /* … */ };
})(window.TS = window.TS || {});
```

There is no module loader; **load order is the dependency graph.** `index.html` and
`build.py` load them in this order:

```
theme → parser → datamodel → analysis → organizer → renderer
      → chartview → store → icons → main
```

`main.js` is always last because it wires everything together and is the only module
that touches the DOM.

### The one-way data pipeline

```
folder of CSVs
   │  Parser.parseDaqamiCsv(text, filename)        one file → one parsed trial
   ▼
parsed trials  ──DataModel.buildExperiments──▶  experiments → trials → channels
   │                                            + DataModel.defaultStyles (colors/shapes)
   ▼
Store.setData(...)         workspace state: styles, per-graph analysis, undo history
   │
   │  main.buildScene()    current state → a plain "scene" object
   ▼
Renderer.renderChart(rd, W, H, scene)            scene → pixels
   │
   ├─ CanvasRenderer → live chart (chartview.js)
   └─ SVGRenderer    → vector export (identical code path)
```

Data flows one way. The chart is a pure function of the scene, and the scene is a
pure function of store state — so undo/redo, theme switches, and exports all reduce to
"rebuild the scene and redraw."

### Coding conventions

- **ES5-flavored JS.** `var`, function declarations, no arrow functions in the source,
  no `class`. Prototype objects for the few "classes" (`Store`, `ChartView`,
  `CanvasRenderer`, `SVGRenderer`). This keeps the file trivially parseable and avoids
  transpilation.
- **Typed arrays** (`Float64Array`) for measurement series.
- **Descriptors, not results.** Analysis overlays are stored as small descriptors and
  *recomputed at render time*. This is why a theme change recolors overlays for free
  and why sessions stay tiny.
- **Comment the "why".** Comments explain rationale and gotchas, not syntax.
- **No global leakage.** Everything lives under `window.TS`; `main.js` keeps its UI
  state in module-scoped closures.

## Core data model (`datamodel.js`, `parser.js`)

### Parsed trial (output of `Parser.parseDaqamiCsv`)

```js
{
  filename, experiment, trial,          // experiment/trial parsed from the filename
  device, serialNumber, scanRate,       // metadata block
  startTimeRaw, startMs, timeMode,      // timeMode: 'clock' | 'seconds'
  timeSeconds: Float64Array,            // ALWAYS seconds-from-start
  channels: [ { name, unit, header, values: Float64Array } ],
  sampleCount, declaredSampleCount,
  warnings: [ … ], error: null,         // graceful, per-file diagnostics
}
```

Parser notes worth knowing before you touch it:
- The landmark for the data block is the header row whose first cell is literally
  `"Sample"`; everything above is metadata.
- Time mode is decided from the **actual data**, not just the header label (a
  mislabeled column would otherwise yield all-NaN times).
- `"Time (s)"` accepts plain seconds **and** colon-elapsed forms (`M:SS.mmm`), folded
  in base-60 — a naive `parseFloat` silently returns 0 for those (the "all times 0"
  bug this guards against).
- Clock timestamps are parsed as UTC and subtracted, so results are timezone-proof.

### Experiments and datasets

`DataModel.buildExperiments(parsedTrials)` groups trials by experiment number,
disambiguates duplicate trial numbers, and unions channel names. The smallest
addressable unit is a **dataset** = one channel of one trial, identified by a stable
string:

```
datasetId(exp, trial, channelName)  ->  "E1T2::AI0"
```

Every style, overlay, undo entry, and session references datasets by this id, so
nothing depends on file load order.

### Graph modes

`DataModel.MODES` + the store's `graphMode`:

| mode (`state.graphMode`) | label | what it plots |
| --- | --- | --- |
| `BY_SENSOR` | One Sensor · All Trials | one channel across every trial |
| `BY_TRIAL` | One Trial · All Sensors | every channel of one trial |
| `ALL` | Full Overview | every channel of every trial |
| `COMPARE_EXP` | Custom | a hand-picked overlay set (see `state.custom`) |

## State: the Store (`store.js`)

`TS.Store` is the single source of truth. Two ideas dominate its design:

**1. Per-graph analysis.** Analysis work is stored per graph, keyed by
`graphKey()` = `"E{exp}|{mode}|{selector}"` (or `"CUSTOM"` for the custom overlay).
`store.graph()` lazily returns the `freshGraph()` descriptor for the current key, so
switching graphs never merges one graph's tools into another. A graph descriptor holds
`manualPoints`, `manualLines`, `annotations`, `stats`, `curveFit`, `features`,
`areas`, `smooth`, `cursors`, and `threshold`.

**2. Undo/redo as snapshots.** `commit(label)` pushes a JSON-cloneable snapshot of the
workspace (styles + graphs + view settings — never the raw measurement arrays) onto a
history array; `undo`/`redo` move an index and re-apply. History is capped at 100
entries.

Other responsibilities: default + resolved dataset styles, trial-timing offsets,
session serialize/restore, and `updateData()` (re-read a folder while *keeping* every
style and analysis — new datasets get defaults, removed ones simply stop rendering).

### Session format & migration

`serializeSession()` writes `{ app: 'ThermoScope', formatVersion: 2, savedAt,
folderName, workspace }`. On load, `migrateWorkspace` / `migrateGraph` upgrade older
files to the current shape (e.g. legacy `bestFit`→`curveFit`, `minmax`→`features`) and
**ignore unknown fields from newer files**, so loading never hard-fails.

## Color system (`theme.js` + `store.resolveColor`)

Per-dataset color has a strict precedence, resolved in `store.resolveColor(id)`:

1. **`customColor`** — a hex the user set by hand (swatch). Fixed; the muted/vibrant
   switch never touches it.
2. **`arrange`** — a *recomputable spec* the Color Manager wrote: `{type:'hue', hue,
   frac}` (group by trial/sensor — one hue per group, shaded per member) or
   `{type:'slot', slot, total}` (recolor visible). Because it's a spec, not a hex, it
   tracks the active palette and the light/dark theme.
3. **auto** — the stable distinct default from `Theme.scale(theme, N)`, where `N` is
   the whole-dataset count, so a dataset keeps its color in every mode.

`theme.js` provides the curated, colorblind-safe categorical palette (muted + a
vibrant variant), `scale(theme, n)` (curated colors for small `n`, golden-angle
generation beyond it so crowded graphs stay distinct), `shade(theme, hue, frac)`, and
`spreadHues` / `randomHues` for "organized randomness." The chosen arrangement is
remembered in `state.colorMode` and re-applied when data is added/removed.

## The scene object and rendering (`renderer.js`)

`main.buildScene()` produces a plain object the renderer understands:

```js
{
  theme,                              // resolved chart colors (Theme.chart)
  view: { xMin, xMax, yMin, yMax },   // supplied by the ChartView
  series: [ { id, xs, ys, color, shape, lineStyle, visibility, plotType, label } ],
  overlays: { averageLines, curveFit, areas, thresholds, cursors,
              manualLines, manualPoints, minmax, annotations },
  boundaries, trialWindow, grid, legend, legendCorner,
  selection, hasSelection, selectedOverlay,
  title, xLabel, yLabel,
}
```

`Renderer.renderChart(rd, W, H, scene)` draws it through a tiny abstract interface
(`beginPath/lineTo/strokePath/text/…`). Two backends implement that interface:
`CanvasRenderer` (screen) and `SVGRenderer` (export). Because both go through the same
`renderChart`, **exports match the screen exactly.** Notable details: axis margins are
computed from tick-label widths; visible points are decimated to ~2 per pixel column;
markers/circles are drawn as polygons since the interface only exposes line/close.

> **SVG text and fonts.** The SVG export writes text as `<text>` elements that
> reference a font-family *name* (the same UI/mono stack used on screen), not embedded
> outlines — so files stay small and stay editable. The trade-off: opening an exported
> SVG on a machine that lacks those fonts substitutes a different one and can shift
> label spacing slightly. PNG export is unaffected (it rasterizes the actual fonts).
> The exported file carries a short XML comment noting this. If you need pixel-locked
> text in a vector for a specific machine, export PNG at 3–4× instead, or add a font-
> to-outline pass to `SVGRenderer`.

## Interaction (`chartview.js`)

`TS.ChartView` owns one `<canvas>`, the live pan/zoom `view`, and all pointer
handling. It draws by calling `renderChart`, then paints the hover crosshair on top.
Key pieces:

- **Auto-bounds** (`fitAll` / `fitTrial`) frame the data (including statistics lines,
  so hiding a source trace doesn't collapse the axes). Any manual zoom/pan exits auto
  mode; `main.js` remembers the resulting view per graph in `viewByGraph`.
- **Zoom** on wheel about the cursor; `Ctrl` = X only, `Alt` = Y only.
- **Hit-testing** for series, manual points, annotation boxes/anchors, and legend
  items drives dragging (points, annotation boxes, the legend with corner-snap) and
  selection (plain vs. Ctrl-click, legend isolate vs. Ctrl multi-select).
- **Export** via `exportSVG()` and `exportPNG(scale, cb)`, both by rebuilding the
  scene and running the shared draw path at the requested size.

`main.js` supplies all behavior through the `opts` callbacks (`buildScene`, `onHover`,
`onSeriesClick`, `onLegendItemClick`, `onManualPointMove`, …); the ChartView itself
holds no app state.

## Session persistence & folder access (`main.js`)

- **Folder open/refresh** uses the File System Access API (`showDirectoryPicker`,
  `getAsFileSystemHandle` for dropped folders) when available — which also lets the
  refresh button silently re-read a folder via a retained directory handle. A
  `<input webkitdirectory>` and the legacy drag `webkitGetAsEntry` reader are
  fallbacks for other browsers.
- **Save** uses `showSaveFilePicker` where available, else a download.
- **Autosave** writes the session to `localStorage` (`thermoscope.autosave`) about
  once a second; it's offered back when you reopen the same folder and cleared on an
  explicit save.
- **Preferences** are a separate, persisted-per-machine object in `localStorage`
  (`thermoscope.prefs`) — accent, density, units, decimals, time cap, palette,
  snap-to-data — kept out of the workspace/undo/session entirely.

## Module reference

| Module | Exports (`TS.*`) | Responsibility |
| --- | --- | --- |
| `theme.js` | `Theme` | Light/dark CSS tokens, chart colors, series palettes, hue math |
| `parser.js` | `Parser` | DAQami CSV → parsed trial; time-mode sniffing, warnings |
| `datamodel.js` | `DataModel` | Experiments/datasets, dataset ids, graph-mode selection, default styles |
| `analysis.js` | `Analysis` | Pure numerics: interp, PCHIP, Gaussian smoothing, regression, poly/log/exp fits, area, features |
| `organizer.js` | `Organizer` | Excel-friendly organized CSV builder |
| `renderer.js` | `Renderer` | Canvas + SVG backends, `renderChart`, scales, ticks, markers, legend |
| `chartview.js` | `ChartView` | Live canvas, pan/zoom/hover, hit-testing, drag, export |
| `store.js` | `Store`, `freshGraph`, `freshDomain` | Workspace state, per-graph analysis, undo/redo, sessions |
| `icons.js` | `Icons` | Inline SVG stroke icons |
| `main.js` | `__test` (dev hook) | All UI, wiring, dialogs, keyboard, files, the render loop |

## Recipes — common changes

**Add an analysis tool.** Add its descriptor fields to `freshGraph()` in `store.js`;
add the pure math to `analysis.js`; add a `tool(host, id, icon, name, active, build,
tip)` entry in `_renderRightInner` (`main.js`) whose `build(body)` renders the editor;
emit its overlay in `buildScene()` so `renderChart` draws it. Commit changes with
`store.commit('label')`.

**Add a preference.** Add a default to `PREF_DEFAULTS`, a control in
`preferencesDialog()`, and read `Prefs.data.<key>` where it applies. Call `Prefs.set`
on change.

**Add a graph mode.** Extend `DataModel.MODES` and `datasetIdsForMode`, teach
`store.graphKey()`/`currentDatasetIds()` about it, and add its picker UI in the left
panel.

**Change a color rule.** Almost always `store.resolveColor` or the `assign*` helpers
in `main.js`; respect the customColor → arrange → auto precedence.

## Testing & local dev

- **`TS.__test`** (exposed at the bottom of `main.js`) is the automation hook:
  `{ store, get view, loadParsed(parsed, name), buildScene, organize, unmatched,
  parseManual, prefs, detectUnit }`. `loadParsed` injects already-parsed trials so a
  test can skip file I/O.
- **Manual testing:** serve the repo with `python -m http.server` and drive
  `app/index.html` (un-inlined) or the built `ThermoScope.html`. Sample DAQami exports
  live in `data\` and `csv test data\`.
- There is **no unit-test runner** (no Node); verification is done in-browser against
  `TS.__test` and the sample data.

## Invariants & gotchas

- **Never mutate raw series.** Derive (smoothing/units/cap) into new arrays.
- **`build.py` only rewrites `<link rel="stylesheet">` and `<script src>`** — keep the
  favicon and any other head content in plain HTML so it survives the build.
- **Load order is the dependency graph** — a module may only use `TS.*` set by an
  earlier one.
- **Overlays are descriptors** recomputed in `buildScene`; don't cache resolved pixels
  in the store.
- **Selection is transient** (`selection`, `overlaySel` in `main.js`) and deliberately
  excluded from snapshots/sessions.
- **Rebuild before shipping:** the source of truth is `app/src/*`; `ThermoScope.html`
  is generated by `build.py`.
