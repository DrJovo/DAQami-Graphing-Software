# ThermoScope

A polished, self-contained app for **organizing, graphing, and analyzing DAQami
thermocouple data** — built for the Center for Industrial & Medical Ultrasound (CIMU).

It reads the `.csv` files DAQami exports (grouped automatically by their `E#T#`
names), turns them into an Excel-ready organized workbook, and gives you an
interactive graphing/analysis workspace with publication-quality export.

---

## Running it

**`ThermoScope.html`** is the whole program in one file. There is nothing to install.

- **Double-click `ThermoScope.html`** — it opens in your browser and runs entirely
  on your computer, offline. Your data never leaves the machine.
- Works in Chrome, Edge, or Firefox. Chrome/Edge are recommended.

### Make it feel like a desktop app (optional)
In Chrome or Edge, open `ThermoScope.html`, then **⋮ menu → Save and share →
Create shortcut… → tick "Open as window."** You now get a standalone
ThermoScope window with its own taskbar icon and no browser chrome — no install,
no exe, but the same feel. (See "About a `.exe`" below for the trade-offs.)

---

## Using it

1. **Open Data Folder** (toolbar or File menu). Pick the folder containing your
   DAQami `.csv` files. Everything is grouped by experiment and trial from the
   `E#T#` filenames. Files recorded in clock time are converted to *seconds since
   the experiment start* automatically; files already in seconds are used as-is.
   Any number of thermocouples (AI0, AI1, …) is detected from the file.

2. **Organize & Export** builds one clean CSV grouped by experiment. Every trial
   keeps its own Time + channel columns, so in Excel you can select an
   experiment's block, **Insert → Chart → Scatter (XY)**, and every trial plots on
   its own X values with no manual series editing. You can choose to place
   experiment tables **stacked** or **side by side**, and whether to include the
   per-trial detail header.

3. **Graph & analyze** in the main workspace:
   - **Graph modes** — *Compare Trials* (one sensor across trials), *Compare
     Sensors* (all sensors of one trial), *Full Overview*, and *Compare
     Experiments*.
   - **Trial window** — enter a start offset and duration to mark where a trial
     begins/ends (subtle guide lines; data is never deleted) and to power the
     *Fit Trial Window* auto-scale.
   - **Navigation** — scroll to zoom both axes into the cursor, **Ctrl+scroll** for
     X only, **Alt+scroll** for Y only, drag to pan, or use the X/Y pan sliders.
     *Fit* toggles auto-scale between all data and the trial window.
   - **Analysis tools** (right panel, per-graph — they never bleed between graphs):
     Average, Min/Max/Mean, Area under curve (with a choice of integration
     domain), Line of best fit, Gaussian smoothing + between-sample prediction,
     Desmos-style manual plotting (`(2, 7)`, `x = 5`, `y = 30` — draggable
     points, labeled), a dual-cursor Δ measure, and threshold-crossing times.
   - **Hover** anywhere on a trace (or the average line) to read time, temperature,
     and the local rate (d/dt).

4. **Export** the graph as **PNG** (1×–4×) or **SVG** (vector), and **Save/Load
   Session** to keep your styling and analysis (choose to include all analysis,
   just manual annotations, or none).

Dark/light theme, undo/redo (Ctrl+Z / Ctrl+Y), and an unsaved-changes warning are
all built in.

---

## About a `.exe`

ThermoScope is delivered as a single HTML file rather than an `.exe` on purpose:
it is the *easiest possible thing to run and share* — one file, no installer, no
antivirus/SmartScreen warnings, works on any computer with a browser, and it will
keep working years from now with nothing to update. The "Open as window" trick
above gives it a native, chrome-less desktop feel with zero install.

If you specifically need a true double-click `.exe` (e.g. to hand to someone who
shouldn't see a browser at all), it can be wrapped with a small Python +
`pywebview` + PyInstaller launcher. Ask and it can be added — it's a one-time
build step on your machine, and the HTML file remains the source of truth.

---

## For developers

The single file is built from readable sources in `app/`:

```
app/
  index.html          dev shell (loads src/* individually)
  build.py            inlines everything -> ../ThermoScope.html
  src/
    theme.js          color tokens (light/dark) + validated series palette
    parser.js         DAQami CSV -> structured trial (clock/seconds, channels, BOM)
    datamodel.js      experiments/trials/datasets, graph modes, default styles
    analysis.js       interpolation, PCHIP, Gaussian smoothing, regression, area, …
    organizer.js      Excel-friendly organized CSV (stacked / side-by-side)
    renderer.js       Canvas + SVG chart engine (identical draw path -> export)
    chartview.js      interactive view: zoom/pan/hover, manual-point drag, export
    store.js          state, undo/redo, per-graph analysis, session save/load
    icons.js          inline SVG icons
    main.js           UI: menu bar, panels, tools, wiring
    styles.css        design system
```

Rebuild the single file after editing sources:

```
cd app
python build.py        # writes ../ThermoScope.html
```
