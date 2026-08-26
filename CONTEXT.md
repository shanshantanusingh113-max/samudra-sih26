# Samudra 3D

A browser-based platform that renders INCOIS ocean-model fields as an interactive 3D volume
and overlays the in-situ instrument profiles that were measured in the same water, so a
forecaster can compare what the model says against what the ocean actually measured - in one view.

Built for Smart India Hackathon 2026, Problem Statement **26067** (MoES / INCOIS).

---

## Language

### Gridded model data

**Field**:
One named physical quantity available on the model grid - temperature, salinity, a current
component. A Field is the unit a user selects in the UI.
_Avoid_: parameter, measurement, channel

**Grid**:
The 4-dimensional array a Field lives in: `time × depth × latitude × longitude`, on INCOIS's
1° Indian Ocean mesh. Always the *source-shaped* data, exactly as the provider published it.
_Avoid_: dataset, cube, matrix

**Level**:
One of the 24 discrete depths INCOIS publishes (5 m, 10 m, 20 m … 2000 m). Levels are
**unevenly spaced** - they cluster near the surface where the interesting structure is.
_Avoid_: layer, slice, z-index

**Timestep**:
One 10-day analysis instant in the Grid's time axis. The unit the time animation advances by.
_Avoid_: frame, snapshot, epoch

**Volume**:
A single Field at a single Timestep, resampled onto an **evenly spaced** 3D lattice and
normalised to bytes so a GPU can sample it. A Volume is what gets ray-marched. It is a
*derived rendering artifact* - never the source of scientific truth.
_Avoid_: cube, texture, brick, block

**Depth Warp**:
The monotonic mapping between real depth in metres and the Volume's evenly spaced third axis.
It exists because Levels are uneven but GPU 3D textures are not. It deliberately gives the
upper ocean more of the axis than the abyss gets.
_Avoid_: depth scale, z-transform, stretch

**Mask**:
Cells with no ocean value - land, or sea floor above the Level. A Mask cell must render fully
transparent; it is *absence of ocean*, never a data value of zero.
_Avoid_: NaN, fill value, nodata, null

### In-situ observations

**Float**:
One autonomous instrument, identified for life by its WMO platform number. A Float drifts,
surfaces on a cycle, and reports as it goes. Gliders and moorings are also Floats to this
system where it does not matter that they move differently.
_Avoid_: buoy, device, sensor, instrument

**Profile**:
One vertical cast by one Float at one place and one instant: a series of (depth, value) pairs
plus a fix in space and time. The atom of observational data here.
_Avoid_: cast, dive, sounding, reading, sample

**Track**:
The ordered path of a Float's surface fixes over time. What is drawn on the globe as a line.
Drawn progressively: only the part already travelled by the Timestep on screen.
_Avoid_: trajectory, route, path

**Fix**:
One surfacing: a Float's position at one instant. A Float is drawn at the Fix nearest the
Timestep on screen, and is not drawn at all when its nearest Fix is more than about twelve days
away - showing it then would imply an observation that does not exist.
_Avoid_: position, ping, report, sighting

### The comparison

**Collocation**:
The pairing of one observed Profile with the model Volume interpolated to that Profile's exact
position and time. The core scientific act of the platform, and the gap the problem statement
names. A Collocation yields two curves on one axis, and the difference between them.
_Avoid_: matchup, comparison, overlay, validation

**Residual**:
Observed minus modelled, at a given depth within a Collocation. Where the model and the ocean
disagree. Signed - the sign carries meaning.
_Avoid_: error, delta, bias, difference

### Departures

**Anomaly**:
Departure of a cell from its own average across the baked Timesteps. Not a climatological
normal - the baseline is the twelve steps loaded and nothing more, and everything on screen
that mentions it says so.
_Avoid_: normal, climatology, deviation

**Anomaly Feature**:
One connected body of water that departed, found by labelling everything both statistically
unusual and physically noticeable. What the user clicks. Carries where it is, why the isotherm
put it there, what salinity and density did, and how many casts stand behind it.
_Avoid_: blob, hotspot, event, detection

### Presentation

**Transfer Function**:
The full rule turning a physical value into a screen colour and an opacity: a Palette, a
value range, and a linear-or-log scale. What the colourbar editor edits.
_Avoid_: colormap, LUT, color scale, styling

**Palette**:
An ordered list of colours only, with no notion of physical units. Defaults are `cmocean`
palettes, which are perceptually uniform and are the convention in oceanography.
_Avoid_: colormap, gradient, theme, ramp

**Globe View**:
The wide-context view: a 3D Earth carrying the Indian EEZ, Float Tracks, and a single
Level drawn as a flat surface layer. Where a session starts.
_Avoid_: map, 2D view, overview

**Volume View**:
The close-context view: one Volume ray-marched as a solid body of water that can be sliced,
cut and rotated, with Floats suspended inside it at their true positions.
_Avoid_: 3D view, cube view, render view

**Drill-down**:
The single continuous transition from Globe View into Volume View over a chosen region.
The demo's spine, and the reason the two views share one camera model.
_Avoid_: zoom, navigate, transition

**Isosurface**:
The surface joining every point in a Volume holding one chosen value - the 20 °C isotherm,
for instance. Rendered as a skin inside the water.
_Avoid_: contour, shell, threshold surface

**Vertical Exaggeration**:
The factor stretching the depth axis in the Volume View. The ocean is ~4000× wider than it is
deep, so at true scale it is an invisible film; exaggeration is what makes it legible.
_Avoid_: z-scale, depth scale, stretch factor

### Extensibility

**Source Adapter**:
A small unit of code that turns one external provider's format into Grids or Profiles. Adding
a provider means adding an Adapter and nothing else. The problem statement's
"ingest new data streams without re-engineering" requirement lives or dies here.
_Avoid_: parser, driver, connector, plugin, loader

---

## Scope - the cut line

Everything above the line is being built. Everything below it is deliberately, knowingly not.

### In

- Ray-marched **Volume View** of INCOIS temperature and salinity, with depth slicing,
  Timestep animation, and an Isosurface.
- **Globe View** over the Indian EEZ with Float Tracks and a single-Level surface layer.
- **Drill-down** between the two views as one continuous motion.
- **Collocation**: click a Float, see its Profile against the model's, with Residuals.
- **Transfer Function** editor: cmocean Palettes, adjustable range, linear/log, opacity.
- **Vertical Exaggeration** control.
- Two **Source Adapters** - INCOIS ERDDAP (Grids) and Argo GDAC ERDDAP (Profiles) - behind
  one interface, plus written proof a third can be added in one file.
- A REST API over the pipeline, and offline-safe pre-baked data so the demo cannot be
  killed by a network failure.

### Out

Named here so nobody wonders whether we forgot.

- **Live INCOIS internal archive.** We use INCOIS's *public* ERDDAP. The internal operational
  archive needs credentials we do not have; the Source Adapter is the seam where it would attach.
- **OGC WMS/WCS server.** We consume open standards and CF conventions; we do not re-serve them.
  A day of work for a checkbox no judge will click.
- **User accounts, saved sessions, sharing.** No auth of any kind.
- **Writing data back.** The platform is strictly read-only.
- **Currents, in any form.** Not implemented at all. INCOIS publish geostrophic currents
  (`GEO_U`/`GEO_V`), but that series ends 2019-03 and cannot share a timeline with the
  temperature field. Volumetric flow visualisation is a project in itself.
- **Real-time streaming ingest.** Data is fetched and baked ahead of time, not subscribed to.
- **Mobile layout.** Desktop browser only - the operational reality for a forecaster.
- **WebGPU.** WebGL2 is universal today; WebGPU is noted as a migration path, not taken.
- **Machine-learning derived products.** Named as an extension point, not implemented.
