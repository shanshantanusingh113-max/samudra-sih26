# SIH 2026 - Idea Submission Deck

**Problem Statement 26067 · Samudra 3D**

Six slides. Every claim here is checked against the running build.

**The rule for this rewrite: short sentences, one idea each, and a small concrete example
wherever a judge might not follow.** The old deck was correct and unreadable. This one says less
and lands more.

Images live in `ppt/images/`.

---

# ART DIRECTION

**Dark slides. All text is native slide text, never text inside a picture.** The only pasted
images are screenshots of the running software.

Keep the template's mandated headings exactly: IDEA TITLE, TECHNICAL APPROACH, FEASIBILITY AND
VIABILITY, IMPACT AND BENEFITS, RESEARCH AND REFERENCES.

## Palette

| Role | Hex | Use |
| --- | --- | --- |
| Slide ground | `#071420` | Every slide |
| Box fill | `#0C1F2E` | Content boxes |
| Box border | `#4A6B80` | 1 pt, all boxes |
| Heading text | `#E4EEF6` | Titles |
| Body text | `#B9CDDC` | Bullets |
| Muted | `#6D8598` | Captions |
| **Cyan** | `#3FB8C4` | Labels, arrows, rules |
| **Amber** | `#F5B841` | The one number that matters. Max 2 per slide |
| Coral | `#F2765F` | Problems only |
| Green | `#5FD68A` | Solved things only |

## Type

| Role | Font | Setting |
| --- | --- | --- |
| Slide title | Arial Black | 34-40 pt, ALL CAPS |
| Box label | Consolas Bold | 11 pt, ALL CAPS, cyan |
| Box heading | Arial Bold | 16-18 pt |
| Bullets | Calibri | 14-15 pt, line spacing 1.4 |
| Figures, IDs | Consolas | 11-12 pt |

## Layout rules

- **6 slides maximum.** Hard limit.
- **Maximum 4 bullets per box.** This is the change from the last version. If you need a fifth,
  the box is doing two jobs.
- **Every bullet is one short sentence, then one example.** The example is what makes it land.
- Everything sits in a bordered box with a small cyan ALL-CAPS label above it.
- Screenshots get a 1 pt `#4A6B80` border and a one-line muted caption.
- No clip art, no stock photos, no gradient text, no emoji.

---

# SLIDE 1 - TITLE

**Image:** `images/02-volume-clean.png`, bordered, right half.

> **SAMUDRA 3D**
>
> Fly into the Indian Ocean. See the model and the measurements in one picture.

| | |
| --- | --- |
| Problem Statement ID | 26067 |
| Problem Statement Title | Develop a web-based interactive 3D visualization platform that integrates numerical ocean model outputs and in-situ observations |
| Theme | Smart Automation |
| PS Category | Software |
| Team ID | `<fill in>` |
| Team Name | `<fill in>` |
| **Live prototype** | **https://rak2315.github.io/samudra-sih26/** |

> ⚠️ Team ID and Team Name are the only blanks in this deck.

---

# SLIDE 2 - IDEA TITLE

**Idea title, beneath the template heading:** One browser tab. The whole water column.

**Layout:** three boxes across the top, one image across the bottom.

**Image:** `images/03-globe-full.png`
Caption: *India's EEZ with INCOIS temperature and 221 Argo floats. Click any float to compare.*

---

### Box 1 - `THE PROBLEM :`

- **The ocean is deep, but the tools are flat.** Most software draws one depth at a time. *You
  see the surface, then you see 100 m, and you join them up in your head.*
- **Model and measurement live in different windows.** *A forecaster opens one program for the
  model, another for the float data, and compares them by eye.*
- **The interesting part is vertical.** *Cyclones feed on warm water down to 100 m or more, not
  on the surface alone.*

### Box 2 - `WHAT WE BUILT :`

- **A block of water you can fly into.** INCOIS's own model, 5 m down to 2000 m, all at once.
  *Like an MRI of the sea instead of a photograph of it.*
- **The instruments sit inside the water.** Argo floats appear where they really were, with the
  path they drifted. *The dots move as you play the timeline, because the floats really moved.*
- **Click a float and get an answer.** It draws what the float measured against what the model
  predicted, at the same place and time. *Then it tells you the size of the gap in °C.*
- **It runs in a browser.** No install, no plugin, no account.

### Box 3 - `WHAT IS NEW :`


- **Still water becomes invisible.** We fade out water that is not changing, so the layers show
  through. *Without this you see a warm lid and a black void underneath.*
- **It shows where the evidence is, not just the model.** A third view counts how many Argo casts
  were actually taken near each point. *Six per cent of the block has none, so the analysis there
  is interpolation - and the tool says so instead of hiding it.*
- **The comparison is the product.** Model volume and instrument profile in one view is the exact
  gap PS 26067 names.
- **It refuses to invent data.** Land can never leak a temperature into the sea. *A naive render
  paints a fake cold strip along every coast, which looks exactly like real upwelling.*

---

# SLIDE 3 - TECHNICAL APPROACH

**Layout:** narrow left column for the stack. Wide right column for **one vertical flow
diagram**, top to bottom. Status strip across the bottom.

## The architecture diagram is VERTICAL

Draw it top to bottom, as a tree that splits once and rejoins. Not left to right. This is the
change from the previous version, and it fits the slide far better.

```
        ┌──────────────────┐        ┌──────────────────┐
        │  INCOIS ERDDAP   │        │    ARGO GDAC     │
        │  model field     │        │  float profiles  │
        └────────┬─────────┘        └─────────┬────────┘
                 │                            │
                 └────────────┬───────────────┘
                              ▼
                   ┌─────────────────────┐
                   │   SOURCE ADAPTER    │   ← the seam
                   │  one class per      │
                   │  provider           │
                   └──────────┬──────────┘
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
        ┌─────────────────┐       ┌─────────────────┐
        │      GRID       │       │     VOLUME      │
        │ real numbers    │       │ picture for the │
        │ every answer    │       │ graphics card   │
        │ comes from here │       │ 4 bytes a voxel │
        └────────┬────────┘       └────────┬────────┘
                 │                         │
                 ▼                         ▼
        ┌─────────────────┐       ┌─────────────────┐
        │    REST API     │       │     BROWSER     │
        │  collocation    │       │  3D water you   │
        │  queries        │       │  fly into       │
        └─────────────────┘       └─────────────────┘
```

**Caption under the diagram, one line:**
> Two paths on purpose. The **Grid** is the truth. The **Volume** is the picture. A number a user
> reads never comes from the picture.

**Callout beside the adapter box, in cyan:**
> **The seam.** A mooring, an ADCP or HF radar is one new class here. The renderer, the API and
> the screen never change.

---

### Left column - `TECHNOLOGIES TO BE USED :`

**Data and science**
- **Python 3.10** - pipeline and science
- **xarray + netCDF4** - reads INCOIS's NetCDF
- **NumPy / SciPy** - resampling, gradients, land fill
- **cmocean** - standard ocean colour scales

**Backend**
- **FastAPI** - REST API for comparisons
- **ERDDAP** - open subsetting at the source

**Frontend**
- **TypeScript + React + Vite** - the app
- **Three.js / WebGL2** - one scene, globe and volume
- **GLSL** - the ray-marching shader

**Quality**
- **pytest** - 67 automated tests

### Bottom strip - `METHODOLOGY :`

Five stages, left to right, small boxes with connectors:

**1 Fetch** → **2 Resample and check** → **3 Encode** → **4 Render** → **5 Compare**

One muted line beneath:
> Fetch a subset from INCOIS. Put 24 uneven depths onto an even axis and drop impossible values.
> Pack it for the graphics card. Ray-march it in the browser. Compare a float against the model.

### Product status strip

> **Working prototype, running on real INCOIS data.**
> Ingestion, 3D rendering, instrument overlay and model-versus-observation comparison are all
> built and tested. **230 tests passing.** What is left is deployment and more variables, not core
> capability.

*(Set "Working prototype" in green `#5FD68A`. This is the line a judge remembers.)*

---

# SLIDE 4 - FEASIBILITY AND VIABILITY

**Layout:** three boxes across, equal width. Clean. No image needed. If you want one, put
`images/11-isosurface.png` small in the corner.

**The point of this slide: everything on it already happened. Nothing is projected.**

---

### Box 1 - `FEASIBILITY :`

- **It is already built and online.** *You can open it on your phone right now:
  rak2315.github.io/samudra-sih26*
- **It costs nothing to run.** Public endpoints, no licences, no GPU cluster. *The whole demo is
  12 MB of files on a static web host.*
- **It runs on ordinary office hardware.** *Developed and tested on integrated graphics with 2 GB
  of shared memory, not a gaming machine.*
- **It deploys as-is.** A static site plus a small API. *INCOIS can host both behind their own
  firewall with no client-side install.*

### Box 2 - `CHALLENGES WE HIT :`

- **Some data hosts were unreachable.** *HYCOM and NOAA CoastWatch both timed out from our
  network, so the obvious plan died on day one.*
- **Real instruments fail.** *Argo's own quality flags are read per channel, and a float in this region whose salinity sensor failed keeps its good temperature. Beyond that, a regional floor catches what the global one lets through - 20 PSU, fresher than the Baltic
  and impossible here.*
- **Weak graphics chips.** *Ray-marching every pixel is heavy, and a forecasting desk is not a
  gaming PC.*
- **Missing data can lie.** *Blending "no data" with the sea paints a fake cold strip along every
  coast, and it looks exactly like real upwelling.*

### Box 3 - `HOW WE SOLVED THEM :`

- **We found a better source than the one we lost.** *INCOIS's own public ERDDAP, which makes the
  demo end-to-end INCOIS instead of a substitute.*
- **Quality checks run per channel.** *A float with a broken salinity sensor still contributes
  its perfectly good temperature.*
- **Rendering is tuned, not lucky.** *A ray-step slider, byte-sized volumes, and textures freed
  as the animation plays.*
- **Land is tracked separately.** *A second channel records where the ocean actually is, so land
  can never contribute a value at any zoom.*
- **We show our own uncertainty.** *The Observation Coverage view marks where there is no float
  data behind the model, rather than presenting every cell with equal confidence.*

**Muted line under the three boxes:**
> Every risk above was met during the build and resolved. This is a record, not a forecast.

---

# SLIDE 5 - IMPACT AND BENEFITS

**Layout:** two boxes across the top, evidence screenshot across the bottom.

**Image:** `images/04-collocation-panel.png`

---

### Box 1 - `WHO IT HELPS :`

- **Cyclone forecasters.** Warm water below the surface is what lets a storm explode overnight.
  *Ockhi in 2017 went from a depression to a cyclone in about nine hours over exactly that kind
  of water.*
- **Search and rescue.** *See the water structure inside the actual search box in seconds instead
  of opening three programs.*
- **Fisheries advisories.** *INCOIS already sends fishing-zone advisories to lakhs of fishermen;
  those depend on fronts and mixed-layer depth, which this makes visible.*
- **Students and the public.** *A school class can fly into the Bay of Bengal from a browser, with
  no software and no login.*

### Box 2 - `WHAT IT CHANGES :`

- **Disagreement becomes a number.** *"The model looks off" becomes "the model is 2.16 °C warm
  across 119 depths."*
- **Vertical structure becomes visible.** *The thermocline is a band you can point at, not
  something inferred from stacked flat maps.*
- **New sensors stop being projects.** *Adding a mooring or an ADCP is one class, not a rebuilt
  tool.*
- **Existing data does more work.** *This adds no new data collection. It uses what INCOIS
  already produces and already pays for.*

### Evidence caption under the image

> **Real output, not a mock-up.** Argo float **2902306**, an INCOIS-owned float, Arabian Sea off
> Oman at 21.1°N 60.1°E. Cast of 22 July 2026 against the 20 July analysis: **119** depths
> compared, model running **2.16 °C warm**, typical gap **2.34 °C**.
>
> That is not a bug. It is the summer monsoon upwelling off Oman, where wind drags cold water
> toward the surface. A 1° analysis smooths it away, and a forecaster would want to know.

---

# SLIDE 6 - RESEARCH AND REFERENCES

**Layout:** two boxes side by side. Small type. This slide is a reference, not a read.

---

### Box 1 - `DATA SOURCES (all tested reachable) :`

- **`incois_argo_10d_VAM`** - INCOIS 10-day gridded Argo analysis. Temperature and salinity, 24
  levels, 5-2000 m. *The model field.*
  `erddap.incois.gov.in/erddap/griddap/incois_argo_10d_VAM.html`
- **`ArgoFloats`** - Coriolis / Ifremer GDAC. *The observations the demo uses.*
  `erddap.ifremer.fr/erddap/tabledap/ArgoFloats.html`
- **`Indian_ARGO_Floats`** - INCOIS Argo profiles. *Read by a second adapter, to prove
  extensibility.*
  `erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats.html`
- **Natural Earth 1:50m coastlines** - public domain coastline geometry.
  `github.com/nvkelso/natural-earth-vector`

**Live provenance page** - every figure read from the build's own manifest, plus the exact
request you can run yourself:
`rak2315.github.io/samudra-sih26/provenance.html`

### Box 2 - `STANDARDS AND REFERENCES :`

**Standards we read**
- **CF-1.6 / ACDD-1.3** - INCOIS publish their NetCDF to these conventions and we read them.
  *This is their compliance, not ours: our own output is a packed binary volume plus JSON, not
  re-served NetCDF.*
- **ERDDAP griddap and tabledap** - open RESTful subsetting.
- **WebGL2 / GLSL ES 3.00** - browser-native rendering, no plugins.

**Scientific references**
- **Thyng et al. (2016)**, *True colors of oceanography*, Oceanography 29(3) - the cmocean
  palettes. `doi.org/10.5670/oceanog.2016.66`
- **Argo Data Management**, *Argo Quality Control Manual for CTD and Trajectory Data* - the
  ranges our checks are based on. `doi.org/10.13155/33951`
- **Wong et al. (2020)**, *Argo data 1999-2019*, Frontiers in Marine Science.
  `doi.org/10.3389/fmars.2020.00700`
- **Saunders & Fofonoff (1976) / UNESCO** - the pressure-to-depth conversion we use.

**Our own engineering record**
- **Nine architecture decision records** covering renderer choice, data sourcing, the depth warp,
  volume encoding and the transparency defect that cost hours - `docs/adr/`

> ⚠️ **Before export, click every DOI above and confirm it resolves.** Three citations from the
> earlier draft were removed because we could not verify them: Qin et al. (2019), V-MANIP, and a
> blog post on WebGL volume rendering. The V-MANIP entry additionally described a tool that
> overlays Argo data on model fields, which would have contradicted our own novelty claim on the
> same slide. **Do not restore any of them without a working link.**

> ⚠️ **On the novelty claim.** Say "co-visualisation in a browser, in 3D, with the comparison
> quantified" rather than "no tool does this". We have not finished checking Argovis, Copernicus
> MyOcean and the EU Digital Twin Ocean. The narrow claim is defensible; the absolute one is not
> yet.

---

# BUILD NOTES

## Export
Save as **PDF**. Check the mono type has not fallen back: the ERDDAP dataset IDs are the giveaway.

## If you are short on space
Slide 3 is densest. Drop the technology list before you drop the diagram. The vertical flow
diagram is the slide's argument.

## The two images that matter
`02-volume-clean.png` (the water column) and `04-collocation-panel.png` (the comparison chart).
Those two are the whole idea. Give them room.

## Image inventory

**Paste these** - screenshots of the running software.

| File | Shows | Use on |
| --- | --- | --- |
| `02-volume-clean.png` | The water column, no panels | Slide 1 |
| `03-globe-full.png` | Globe, EEZ field, 92 floats | Slide 2 |
| `04-collocation-panel.png` | The comparison chart | Slide 5 |
| `11-isosurface.png` | The 20 °C isotherm | Slide 4, optional |
| `01-volume-full.png` | Full app with controls | Spare |
| `coverage.jpg` | Observation Coverage, four bands | **Slide 2 or 4** - the newest and least expected view |
| `12-watermass.png` | Colourbar narrowed to one water mass | Spare |
| `13-salinity.png` | Salinity field | Spare |

**Rebuild as native slide shapes**, do not paste:

| File | Rebuild as |
| --- | --- |
| `07-architecture.png` | The **vertical** flow above, drawn with shapes and connectors |
| `08-methodology.png` | Five connected stage boxes |
| `06-gap-2d-vs-3d.png` | Two boxes, "Today" vs "Samudra 3D" |
