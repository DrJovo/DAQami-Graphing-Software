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
   - **Graph modes** — *One Sensor · All Trials*, *One Trial · All Sensors*,
     *Full Overview*, and *Custom*, where you hand-pick any trials, sensors, or
     per-experiment averages — even across experiments — to overlay. Sensor and
     trial buttons toggle series on and off quickly.
   - **Data series** — show, dim, or hide each trace (or all at once), and set
     scatter shapes. The **Color manager** keeps a crowded graph readable: switch
     between a muted and a vibrant palette, group colors *by trial* or *by sensor*
     (one hue per group, shaded per member), or *recolor visible* to give the
     traces currently on screen the most distinct colors. Every color is stable
     per dataset and carries across all modes; click any swatch to set your own.
   - **Selection** — Ctrl-click a line to select it (Ctrl-click more to add); the
     rest dim so the selection stands out. Right-click for quick actions such as
     averaging or hiding the selection.
   - **Trial window** — enter a start offset and duration to mark where a trial
     begins/ends (subtle guide lines; data is never deleted) and to power the
     *Fit Trial Window* auto-scale.
   - **Navigation** — scroll to zoom both axes into the cursor, **Ctrl+scroll** for
     X only, **Alt+scroll** for Y only, the zoom buttons above the chart, or drag
     to pan. The X/Y pan sliders snap to the data edges (hold **Ctrl** to pan
     freely) and take arrow keys for fine control. Each graph remembers its own
     zoom/pan, so switching between graphs and back returns you where you left off.
   - **Naming & legend** — click the title on the chart to rename the graph (clear
     it to return to the automatic name); drag the legend to any of the four
     corners and it snaps into place.
   - **Analysis tools** (right panel, per-graph — they never bleed between graphs):
     - *Statistics* — mean, median, mode, standard deviation, or a mean with a ±SD
       band; each is frozen when added and named automatically, so hiding a source
       trace never shifts it.
     - *Features & Settling* — per-dataset peak, range, mean, net change,
       time-to-peak, max rate, time-to-threshold and settling time over a range,
       with a one-click **CSV export** of the table.
     - *Curve Fit* — fit a **linear, polynomial (deg 2–4), logarithmic, or
       exponential** model over a range. Polynomial captures a spike-and-settle
       shape; the exponential reads the thermal time constant τ and asymptote
       (with a direction hint and an optional fixed asymptote for exothermic runs
       that never fully settle). The fitted curve can be solid or dotted and can
       extend across the whole view.
     - *Area under curve* and *Gaussian smoothing* over an optional region
       (blended back into the raw data at its edges) with between-sample prediction.
     - *Manual plotting* (`(2, 7)`, `x = 5`, `y = 30` — draggable points and
       labeled reference lines), *Annotations* (a multi-line note pinned to a
       point — drag the note or its anchor dot independently), a *dual-cursor Δ
       measure*, and *threshold-crossing* times (every crossing listed with its
       direction).
     Each tool's picker has All / None and per-group quick-select buttons.
   - **Hover** anywhere on a trace (or a statistics line) to read time,
     temperature, and the local rate (d/dt).

4. **Export & save.** Export the graph as **PNG** (1×–4×) or **SVG** (vector).
   **Save Session** (Ctrl+S) writes your styling and analysis back to a file, and
   **Save Session As…** picks a new one; unsaved work is also autosaved in the
   background and offered back the next time you open the same data folder.

**Preferences** (Settings → Preferences) cover the temperature unit for both the
display and the exported CSV (Celsius, Fahrenheit, or As Recorded), decimal
precision, accent color, interface density, and a data time cap that limits how
far each trial is plotted while leaving the Raw Data viewer untouched. Dark/light
theme, undo/redo (Ctrl+Z / Ctrl+Y), and an unsaved-changes warning are all built in.

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
    theme.js          color tokens (light/dark) + muted/vibrant series palettes
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
