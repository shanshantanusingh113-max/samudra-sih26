# Samudra 3D

A browser-based platform that renders INCOIS ocean-model fields as an interactive 3D volume
and overlays the in-situ instrument profiles that were measured in the same water, so a
forecaster can compare what the model says against what the ocean actually measured - in one view.

Built for Smart India Hackathon 2026, Problem Statement **26067** (MoES / INCOIS), theme
**Disaster Management**. The theme changed in the September 2026 revision, and the platform
answered it by computing the five hazard quantities INCOIS themselves published until
2019-03-30 and then stopped - see [`docs/adr/0014`](docs/adr/0014-hazard-fields-and-three-render-types.md).

---

## Language

### Gridded model data

**Field**:
One named physical quantity a user can select - temperature, salinity, cyclone heat potential,
current speed. A Field is the unit the Variable selector offers, and it is **not** always a value
at every point in the water: a Field's `render` says which of four kinds it is, because three of
them are not a Volume and drawing them as one would be a picture of the wrong thing.
_Avoid_: parameter, measurement, channel

**Render kind**:
Which of four shapes a Field takes, carried in its `FieldSpec` so no renderer has a per-Field
special case. `volume` is a value at every depth, ray-marched. `depth` is a Field whose value
*is* a depth, drawn as a Sheet. `column` is one number for the whole water column, drawn as a
Drape. `vector` is a direction and a speed, drawn as arrows. ADR 0014.
_Avoid_: type, mode, style

**Sheet**:
A Field whose value is a depth, drawn as a surface inside the Volume View sitting at that depth,
with the Floats around it. The 26 degC isotherm doming up and collapsing across four months is a
Sheet. Built from float32 on the Grid's own axes and never from a Volume, because a reader reads
metres off it.
_Avoid_: isosurface, layer, plane

**Drape**:
A Field that is one number for the whole water column, painted on the sea surface - which is
honestly where a column total lives. Cyclone heat potential and barrier layer thickness are
Drapes.
_Avoid_: overlay, map layer, heatmap

**Field Group**:
One heading in the Variable selector: Ocean state, Hazard, Circulation, Evidence, Change.
Fifteen Fields cannot be a flat list of buttons, and they are grouped the way a forecaster
thinks rather than the way the data arrived.
_Avoid_: category, section, tab

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
One instrument, identified for life by its WMO platform number. An Argo Float drifts, surfaces
on a cycle, and reports as it goes. Moorings are also Floats to this system, and carry a `kind`
because there are exactly two places where the difference matters: an anchored buoy has no
Track, and because it never moves it gets a Collocation at *every* Timestep rather than only the
one nearest its cast.
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

**Drift**:
Where a thing in the water would go, according to the analysed current field and nothing else.
Integrated forward from a dropped pin, at the depth the Depth slice is set to. It is **not** a
search-and-rescue forecast: a real one adds surface wind, Stokes drift and object-specific
leeway, and this carries none of them. What makes it worth shipping is that it is **scored** -
an Argo Track is measured Drift at the parking depth, so the same integrator run from every
Float's own position has an answer beside it. ADR 0015.
_Avoid_: forecast, SAR prediction, trajectory model, simulation

**Bias Map**:
Every collocated instrument drawn at the position of the cast that was compared, coloured by
its signed Residual, with a ranked list beside it. The Anomaly Feature answers "where did the
field depart from its own average"; this answers "where does the *model* depart from the
*instruments*", which is the question the platform exists for. Ranked on the RMS Residual as a
fraction of the Field's own range, so a temperature row and a salinity row can share one list.
Not a model, not a prediction, and never captioned as AI.
_Avoid_: error map, validation, skill score, AI

**Anomaly**:
Departure of a cell from its own average across the baked Timesteps. Not a climatological
normal - the baseline is the twelve steps loaded and nothing more, and everything on screen
that mentions it says so. The Field beside it, **Temperature vs Normal**, is the climatological
one and is what a forecaster means by "warmer than usual".
_Avoid_: normal, climatology, deviation

**Normal**:
The World Ocean Atlas 2023 mean for one calendar month over 1991-2020. One degree, monthly, to
1500 m, on exactly the node centres INCOIS use. It is a **baseline and never a value**: it is
what the 2026 analysis is differenced against, it is not in the Variable selector, and nothing
on screen ever draws it on its own. ADR 0016.
_Avoid_: climatology as a value, average, reference field

**Section**:
A cut through the Grid along a line drawn on the water: depth down, distance along the line
across, the Field's value as colour, with every cast within a corridor of the line drawn on the
same axes. The standard figure of physical oceanography, and a **measurement** - it comes from
the Grid on the model's own Levels, never from a Volume and never on the Depth Warp.
_Avoid_: transect, profile, slice, cross-section chart

**Anomaly Feature**:
One connected body of water that departed, found by labelling everything both statistically
unusual and physically noticeable. What the user clicks. Carries where it is, why the isotherm
put it there, what salinity and density did, and how many casts stand behind it.
_Avoid_: blob, hotspot, event, detection

### Presentation

**Transfer Function**:
The full rule turning a physical value into a screen colour and an opacity: a Palette, a value
range and a Scale. The range and the Scale are the user's; the Palette is the Field's.
_Avoid_: colormap, LUT, color scale, styling

**Scale**:
Linear or logarithmic, applied to the position along the Palette. **One curve, in one file**, used
by the ray marcher and by the colourbar swatch alike - `web/src/transfer.ts` exports it as a
function and as the GLSL the shader inlines. It was cut once for warping the water while the
colourbar stayed linear, which was a bug and not a reason; the single source is the fix. Offered
only where the Field's range never goes below zero, because a logarithm has nothing to say about a
diverging scale. ADR 0010, amended.
_Avoid_: log toggle, curve, gamma

**Palette**:
An ordered list of colours only, with no notion of physical units. `cmocean` palettes, which
are perceptually uniform and are the convention in oceanography. A Palette belongs to a Field
and is named in its `FieldSpec`; it is never chosen separately, because a chooser let a user put
an oxygen scale on temperature. Nine now, five of them added with the hazard Fields, and every
one arrived attached to a `FieldSpec` and to nothing else. ADR 0010.
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

Nine of them now, and the count was written as eight here for a round because the World Ocean
Atlas adapter was left out of it: eight read a provider at bake time, and the ninth reads a file
a visitor supplies. The September 2026 round added four - INCOIS's second analysis, Copernicus
Marine's current vectors, the EGO glider archive and the World Ocean Atlas normal - and touched
no renderer, no API endpoint and no UI file, which is the claim demonstrated rather than
asserted.

The ninth is the one a judge can check: `sources/netcdf.py` reads a **file a visitor drops on
the page**, through the same protocol, and its variables become Fields in the same selector. It
refuses rather than guesses - an axis it cannot identify is named in the message and nothing is
drawn - because a file rendered on a guessed axis looks entirely normal and is wrong.
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
- **Bias Map**: every collocated instrument coloured by how far the model sat from it, ranked
  worst first, and binned onto 5 degree boxes so a regional bias is distinguishable from
  scatter. Three Fields have one, because three are what an instrument measures.
- **Section**: draw a line on the water and cut the Grid along it, with the casts near the line
  on the same axes. Reads the native float32 Grid shipped in the build, so it works offline.
- **Temperature vs Normal**: the 2026 analysis against the World Ocean Atlas 2023 1991-2020
  mean for the same calendar month, which is the climatological baseline the anomaly is not.
  ADR 0016.
- **Drift**: a pin dropped in the water, integrated forward through the analysed currents, with
  the honest limit stated first and a score attached - 195 Argo floats, median 38 km out over
  one cycle. ADR 0015.
- **Anomaly Feature isolation**: clear the rest of the Volume away and leave only the body of
  water one Feature describes, which is the box every number on its panel is measured over.
- **Five hazard Fields**, computed here: depth of the 26 degC isotherm, cyclone heat potential,
  mixed layer depth, isothermal layer depth and barrier layer thickness. The quantities INCOIS
  published until 2019-03-30 and stopped. Three are Sheets and two are Drapes. ADR 0014.
- **Current vectors as numbers**: Copernicus Marine's own analysis at 1/12 degree, arrows on the
  chosen depth, coloured by speed, with a real value under the cursor. ADR 0013.
- **INCOIS's own evidence channels**, from their second analysis of the same Argo floats: their
  observation count and their error estimate beside ours, and the spread between the two
  analyses as an uncertainty signal that needs no new data.
- **Transfer Function** editor: the Field's cmocean Palette, an adjustable value range, opacity,
  and a **log or linear Scale** applied to the shader and the colourbar together.
- **Vertical Exaggeration** control.
- **Drop your own NetCDF file on the page** and see its variables in the same selector, through
  the same adapter interface. An API feature like OPeNDAP and WMS; the demo runs without it.
- Nine **Source Adapters** behind one interface: INCOIS ERDDAP (the VAM analysis), INCOIS
  ERDDAP again (the Kessler-McCreary analysis and its evidence channels), Copernicus Marine
  (current vectors), Argo GDAC (Profiles), Argo BGC (chlorophyll), NOAA's OSMC GTS feed (moored
  buoys), the EGO glider GDAC, the World Ocean Atlas 2023 climatological normal, and a NetCDF
  file a visitor drops on the page. The GTS feed is a genuinely different format - depth rather
  than pressure, one row per level, the surface reading in a different column, no quality flags
  at all - which is what makes the seam a demonstration rather than an assertion.
- A **glider adapter** reading the FTP archive PS 26067 names, and the finding it produces: one
  glider, two deployments, 2,876 casts in this box, newest 2022-10-14, nothing since. The gap is
  India's glider programme, not the adapter.
- A REST API over the pipeline, plus **OPeNDAP, CF-1.8 NetCDF and OGC WMS** served from the
  native Grids and never the Volume. ADR 0012.
- A **guided tour** of 21 steps in 6 chapters, covering every one of the 43 explained
  controls, because the guide panel explains what you touched and a
  first-time visitor does not know what to touch, plus a one-click **Hazard preset** that sets
  the whole scene up for a cyclone question.
- A **requirements page** listing every clause of PS 26067 word for word, with the measured
  figure read live from the manifest and a link that opens the platform with the control that
  answers it already set.
- Offline-safe pre-baked data so the demo cannot be killed by a network failure.

### Out

Named here so nobody wonders whether we forgot.

- **Live INCOIS internal archive.** We use INCOIS's *public* ERDDAP. The internal operational
  archive needs credentials we do not have; the Source Adapter is the seam where it would attach.
- **OGC WCS.** WMS *is* served now, along with OPeNDAP and CF-1.8 NetCDF - ADR 0012. The three
  share one wrapper and cost an afternoon between them rather than a day each, which is what
  changed the calculus. WCS stays out: no maintained pure-Python server, and the numbers are
  already on OPeNDAP, which is what this community actually uses.
- **User accounts, saved sessions, sharing.** No auth of any kind. Nothing a visitor does needs
  an account; rebuilding the data needs one free Copernicus Marine account, and the credential
  lives on the bake machine and never in the browser. ADR 0013.
- **Writing data back.** The platform is strictly read-only.
- **Volumetric flow visualisation.** Half of this is built now and half is refused, and the line
  between them is the vertical. Currents are drawn as **moving dots with fading trails** on the
  chosen Level, or as arrows - two styles of one layer, both running the drift model's own step
  rule. What stays refused is advection through the *block*: that needs a vertical velocity `w`,
  Copernicus publish `uo` and `vo` and no `w`, and INCOIS publish neither, so a 3-D particle would
  be claiming a motion nobody measured in the one dimension this project exists to take
  seriously. ADR 0017.
- **Glider casts on the map.** The adapter is built and the archive is read. The newest cast in
  this box is **2022-10-14**, so drawing one at a 2026 Timestep would claim an observation that
  does not exist - the same rule ADR 0009 already applies to INCOIS's own Argo archive. The
  finding ships instead, on the requirements page and in the manifest.
- **Real-time streaming ingest.** Data is fetched and baked ahead of time, not subscribed to.
- **Mobile layout.** Desktop browser only - the operational reality for a forecaster.
- **WebGPU.** WebGL2 is universal today; WebGPU is noted as a migration path, not taken.
- **Machine-learning derived products.** Named as an extension point, not implemented.
