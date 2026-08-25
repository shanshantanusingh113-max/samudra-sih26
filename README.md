# Samudra 3D

**A website that lets you fly into the Indian Ocean and look at it in 3D - and see, in the same
picture, what the computer model predicted and what real instruments in the water actually
measured.**

**Live: https://rak2315.github.io/samudra-sih26/**
(landing page; the platform itself is at [`/app.html`](https://rak2315.github.io/samudra-sih26/app.html))

Built for **Smart India Hackathon 2026**, Problem Statement **26067**
(Ministry of Earth Sciences → INCOIS). Category: Software. Theme: Smart Automation.

---

## 1. What problem are we solving?

India's ocean territory is enormous. INCOIS (the Indian National Centre for Ocean Information
Services, in Hyderabad) runs computer models of that ocean and also collects real measurements
from robot instruments floating in it. Both are valuable. Both already exist.

The problem is that **nobody can look at them together.**

Today an ocean forecaster has to:

- open one desktop program to see the model's temperature map,
- open a *different* program to see what a floating robot measured,
- flip between them, and work out in their head whether the two agree.

And almost every tool only draws **flat maps** - one depth at a time. The ocean is not flat. It
is 4 kilometres deep, and the interesting things happen *in the vertical*.

The problem statement lists the gaps directly:

| Gap INCOIS identified | What that means in plain words |
| --- | --- |
| No web-based 3D view of ocean model data | You need to install software, and you still only get flat maps |
| No way to show float data next to model data | Model and reality live in separate windows |
| No interactive controls | You cannot change depth, time, or colours while looking |
| Cannot add new data without re-engineering | Every new instrument means rewriting the tool |
| Hard to understand 3D ocean phenomena quickly | Slows down cyclone warnings, search-and-rescue, fishing advisories |

## 2. What we built

A website. You open a link - nothing to install.

1. **You start on a globe.** India's ocean territory is coloured with INCOIS's real temperature
   data. Little markers are the robot floats currently reporting.
2. **You press "Dive into the water".** The globe unrolls into a flat map and the ocean opens
   into a solid, see-through 3D block of water. You are looking at temperature at every depth
   from 5 m down to 2000 m, all at once.
3. **You click a float.** A chart appears showing what that float actually measured going down,
   drawn on top of what the model said at the same place and time. The gap between the two lines
   is shaded, and we show you the average disagreement as a number.

That third step is the thing that does not exist today.

4. **You switch to Observation Coverage.** The model disappears and the evidence takes its
   place: how many Argo casts were actually taken near each point. About a fifth of the block
   turns out to have none at all, which means the analysis there is interpolation rather than
   observation. A model has a value everywhere whether or not anyone measured; this separates
   the two.

### It runs on INCOIS's real data

This is not a mock-up with invented numbers. It reads:

- **INCOIS's own public data server** for the model field - their 10-day gridded Argo analysis,
  temperature and salinity on 24 depth levels, updated continuously. Our demo data goes up to
  **30 July 2026**.
- **The global Argo float network** for the real measurements - 93 floats and 1,154 casts
  across the Arabian Sea, Bay of Bengal and equatorial Indian Ocean, of which 88 floats carry a
  full model-versus-instrument comparison.

## 3. Requirement coverage, clause by clause

Every line of Problem Statement 26067 below, marked honestly. **17 met, 6 partly met, 5 not
met.** The gaps are listed as plainly as the wins, because a reviewer will find them anyway and
it is better they hear it from us.

### The five gaps INCOIS identified

| Gap in the problem statement | Status | What we built, or what is missing | Where |
| --- | --- | --- | --- |
| Web-based, platform-independent 3D rendering with depth-resolved volumetric views | **Met** | GPU ray-marched water column, 5 m to 2000 m, in any WebGL2 browser. No install, no plugin | `web/src/scene/volumeShader.ts` |
| Unified display of Argo **and Glider** profiles (lat, lon, depth, time, temperature, salinity, chlorophyll) alongside model fields | **Partly** | Argo floats fully: position, depth, time, temperature, salinity. **No gliders and no chlorophyll** - we found no reachable public glider feed for this region | `pipeline/samudra/sources/argo.py` |
| Interactive controls: variable selection, depth-slice navigation, time-step animation, customisable colourbars | **Met** | All four, live | `web/src/ui/Controls.tsx`, `Timeline.tsx` |
| Ingest new data streams or model variables without significant re-engineering | **Met** | One adapter class per provider. Proven, not asserted: two Argo providers that disagree about every column name share one parser | `pipeline/samudra/sources/base.py` |
| Tools for intuitive, rapid understanding of 3D phenomena | **Met** | Every control explains itself in plain language, and says whether it changed the science or only the picture | `web/src/guide.ts` |

### The six core functional requirements

| Requirement | Status | Detail | Where |
| --- | --- | --- | --- |
| **3D volumetric rendering** across the full water column | **Met** | Temperature and salinity, ray-marched | `volumeShader.ts` |
| ...with depth-slice views | **Met** | Two sliders cut the block to any depth range | `Controls.tsx` |
| ...with isosurface extraction | **Met** | Draws the surface at one chosen value, e.g. the 20 °C isotherm | `volumeShader.ts` |
| ...with time-step animation | **Met** | Play button, 12 analyses over 4 months | `Timeline.tsx` |
| ...using WebGL / Three.js or Cesium.js | **Met** | Three.js and WebGL2. Why not Cesium: `docs/adr/0001` | `OceanScene.ts` |
| ...of **current vectors** | **Not met** | Not implemented. INCOIS publish geostrophic currents, but that series ends 2019-03 and cannot share a timeline with the temperature field | - |
| **Instrument overlay** with geospatially accurate markers | **Met** | Floats drawn at the position they held at the moment on screen, with drift tracks | `OceanScene.ts` |
| ...click a float to inspect a depth-vs-variable profile chart with timestamps | **Met** | Observed against modelled on one axis, gap shaded, cast and analysis dates named | `ProfilePanel.tsx` |
| ...of **Glider, CTD and BGC** data | **Not met** | The `Float` abstraction and the adapter seam would carry them unchanged, but none is demonstrated | - |
| **Multi-format ingestion**: NetCDF via xarray backend | **Met** | `xarray` + `netCDF4`. PyNIO is deprecated upstream; xarray is its sanctioned replacement | `sources/incois.py` |
| ...and delimited text formats | **Met** | The Argo CSV parser, with the column layout stored as data rather than code | `sources/argo.py` |
| ...modular, new sources with minimal code change | **Met** | See the gap table above | `sources/base.py` |
| **Colourbar editor**: palette, min/max range, log/linear | **Met** | cmocean palettes, both range handles, a log toggle | `Controls.tsx` |
| **Variable selector** | **Met** | Temperature and salinity | `Controls.tsx` |
| **Layer opacity control** | **Met** | Water opacity, plus a feature-emphasis slider | `Controls.tsx` |
| **Vertical exaggeration slider** | **Met** | 200x to 3500x, with the real depths labelled on the flank | `Controls.tsx`, `DepthRuler.tsx` |
| **Modern JS frontend** | **Met** | TypeScript, React 19, Vite | `web/` |
| **Lightweight REST API backend** | **Met** | FastAPI, 11 endpoints including live collocation for any float | `api/main.py` |
| ...**OPeNDAP** API backend | **Not met** | We *consume* ERDDAP subsetting. We do not re-serve OPeNDAP | - |
| **Deployable on INCOIS infrastructure with no client-side dependencies** | **Met** | Static site plus one Python service. No tokens, no accounts, no plugins | `web/`, `api/` |
| **Extensible design** for CTDs, moorings, HF-radar, ADCP | **Partly** | The seam is real and tested, but no such sensor is wired up | `sources/base.py` |
| ...and **machine-learning derived products** | **Not met** | Named as an extension point. Inventing one would be inventing a requirement | - |

### Standards and outreach

| Clause | Status | Detail |
| --- | --- | --- |
| **CF Conventions for NetCDF** | **Partly** | INCOIS publish CF-1.6 and we read those conventions directly. This is their compliance, not ours: our own baked output is a packed binary volume plus JSON, not re-served NetCDF |
| **OGC WMS / WCS** | **Not met** | Deliberate. We consume open standards rather than re-publishing them. `CONTEXT.md` records the reasoning |
| **Interoperability with data portals** | **Partly** | We read two national portals through their open APIs. We do not expose one |
| **Public outreach and science communication** | **Met** | Opens in any browser with no install, no login and no cost. A school class can fly into the Bay of Bengal |

### The honest summary

Everything about **rendering, overlaying, controlling and comparing** is built and working.

What is missing is **breadth of variables and instruments**: currents, chlorophyll, gliders, CTD
and BGC. Each of those is a data-source problem rather than a platform problem, which is exactly
what the adapter seam exists to solve, and each would cost one class plus a reachable feed.

The two clauses we chose not to do at all are **OGC WMS/WCS** and **ML-derived products**, both
recorded with reasons in [`CONTEXT.md`](CONTEXT.md).

### Two things we are proud of that were not asked for

- **The dive is one continuous motion.** The globe genuinely unrolls into the map - every
  coastline point slides from its position on a sphere to its position on a flat map. It is not
  a cut or a fade between two different screens.
- **Featureless water is transparent; interesting water is solid.** We precompute how fast
  temperature is *changing* at each point, and make the still water see-through. So the
  thermocline - the sharp boundary that matters most for cyclones - is the thing you actually
  see, instead of a wall of warm surface water hiding everything.

## 4. How to run it

You need Python 3.10+ and Node 20+.

```bash
# 1. install
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # Linux/macOS: .venv/bin/pip
cd web && npm install && cd ..

# 2. get the data (takes about a minute; downloads from INCOIS and Argo)
cd pipeline && ../.venv/Scripts/python -m samudra.bake && cd ..

# 3. run the website
cd web && npm run dev            # then open http://localhost:5173

# 4. (optional) run the API too
.venv/Scripts/python -m uvicorn api.main:app --port 8000
```

If you skip step 2, the data is already committed, so the website still works.

**Tests:** `cd pipeline && ../.venv/Scripts/python -m pytest` - 67 tests covering the depth
warp, volume encoding, grid interpolation, collocation maths, the Argo parser, observation
coverage, and the adapter seam that lets two providers with incompatible column layouts share
one parser.

## 5. How it is put together

```
INCOIS ERDDAP ─┐
               ├─► Source Adapters ─► Grid ─┬─► bake ─► static files ─► browser (Three.js)
Argo GDAC ─────┘      (Python)              │
                                            └─► FastAPI ─► /api/collocation, /api/column
```

- **`pipeline/`** - reads the data, does the science. All the tested logic lives here.
- **`api/`** - a REST API for questions the static files cannot answer.
- **`web/`** - React + TypeScript + Three.js. One WebGL scene for both the globe and the volume.

The design decisions, including the ones that were hard-won, are written up in
[`docs/adr/`](docs/adr/). The shared vocabulary and the deliberate scope limits are in
[`CONTEXT.md`](CONTEXT.md).

**Other documents**

| File | What it is |
| --- | --- |
| [`docs/Samudra3D-Dossier.pdf`](docs/Samudra3D-Dossier.pdf) | The full project dossier - problem, solution, every feature, feasibility, impact, and an anticipated-questions section written for non-specialist judges |
| [`docs/demo/script.md`](docs/demo/script.md) | The demo script: 4 minutes of deck, 4 minutes of live demo |
| [`docs/demo/technical-approach.md`](docs/demo/technical-approach.md) | The spoken version of the Technical Approach slide, about 70 seconds |
| [`docs/research/operational-stakes.md`](docs/research/operational-stakes.md) | Sourced figures for the pitch: cyclones, upwelling, the Argo programme |
| [`docs/BUGS.md`](docs/BUGS.md) | Known defects, ranked, with file and line |
| [`ppt/SLIDES.md`](ppt/SLIDES.md) | Slide-by-slide content and art direction for the SIH submission deck |
| [`ppt/PROMPT.md`](ppt/PROMPT.md) | A ready-to-paste prompt for generating that deck with an AI |
| [`design/STITCH.md`](design/STITCH.md) | Per-screen prompts for Google Stitch |
| [`docs/plan/01-cut-features.md`](docs/plan/01-cut-features.md) | What was deliberately not built, and what is worth adding back |
| [`CLAUDE.md`](CLAUDE.md) | Orientation for anyone picking this up: a map of every file, the commands, and the rules that matter |
| [`docs/REVIEW-PROMPT.md`](docs/REVIEW-PROMPT.md) | A brief for reviewing the whole project against the problem statement |

## 6. What we deliberately did **not** build

Being explicit so nobody assumes we forgot. The full list with reasons is in `CONTEXT.md`.

- Connecting to INCOIS's **internal** archive - that needs credentials we do not have. Our
  Source Adapter is the exact place it would plug in.
- Re-serving the data as an OGC WMS/WCS server. We *consume* open standards; re-publishing them
  is a checkbox no judge will click.
- User accounts, saved sessions, mobile layout, WebGPU, machine-learning products.
- Currents, in any form. INCOIS publish geostrophic currents, but that series ends 2019-03 and
  cannot share a timeline with the temperature field without a caveat on screen.

---

## Table 1 - Acronyms

| Acronym | Full form |
| --- | --- |
| ADCP | Acoustic Doppler Current Profiler |
| Argo | Global array of profiling floats (not an acronym; a programme name) |
| BGC | Bio-Geo-Chemical |
| CF | Climate and Forecast (metadata conventions) |
| CTD | Conductivity, Temperature, Depth (instrument) |
| EEZ | Exclusive Economic Zone |
| ERDDAP | Environmental Research Division Data Access Program |
| GDAC | Global Data Assembly Centre |
| GLSL | OpenGL Shading Language |
| HF-radar | High Frequency radar |
| INCOIS | Indian National Centre for Ocean Information Services |
| MoES | Ministry of Earth Sciences |
| NetCDF | Network Common Data Form |
| OGC | Open Geospatial Consortium |
| OPeNDAP | Open-source Project for a Network Data Access Protocol |
| PSU | Practical Salinity Unit |
| REST | Representational State Transfer |
| RMS | Root Mean Square |
| SIH | Smart India Hackathon |
| SST | Sea Surface Temperature |
| VAM | Variational Analysis Methodology |
| WCS | Web Coverage Service |
| WebGL | Web Graphics Library |
| WMO | World Meteorological Organization |
| WMS | Web Map Service |

## Table 2 - Datasets used

The problem statement's "Dataset Link" field was left blank, so we located the sources
ourselves. Every link below was verified working from the build machine.

| # | Dataset | Provider | What we use it for | Link |
| --- | --- | --- | --- | --- |
| 1 | `incois_argo_10d_VAM` - 10-day gridded Argo analysis, Variational Analysis Methodology | **INCOIS**, MoES | The 3D model field: temperature and salinity, 24 levels (5-2000 m), 1°, 30-120°E / 30°S-30°N, current to 2026-07-30 | https://erddap.incois.gov.in/erddap/griddap/incois_argo_10d_VAM.html |
| 2 | `incois_argo_mnt_McCreary` / `incois_argo_mnt_VAM` - monthly gridded analysis with uncertainty | **INCOIS**, MoES | Analysis error and observation-count fields (RMSE, obs per cell) | https://erddap.incois.gov.in/erddap/griddap/incois_argo_mnt_McCreary.html |
| 3 | `incois_valueadded_products_datasets` - value-added products | **INCOIS**, MoES | Mixed-layer depth, D20/D26 isotherm depth, heat content, geostrophic currents (GEO_U/GEO_V). *Note: this series ends 2019-03.* | https://erddap.incois.gov.in/erddap/griddap/incois_valueadded_products_datasets.html |
| 4 | `ArgoFloats` - Argo float profiles | Coriolis GDAC / Ifremer | The in-situ observations: pressure, temperature, salinity per cast | https://erddap.ifremer.fr/erddap/tabledap/ArgoFloats.html |
| 5 | Natural Earth 1:50m coastlines | Natural Earth (public domain) | Coastline geometry for the globe and map | https://github.com/nvkelso/natural-earth-vector |
| 6 | cmocean colour palettes | Thyng et al. (2016) | Perceptually-uniform oceanographic colour scales | https://matplotlib.org/cmocean/ |

### Data credits

Argo data are collected and made freely available by the International Argo Program and the
national programmes that contribute to it (https://argo.ucsd.edu). The Argo Program is part of
the Global Ocean Observing System.

Gridded analysis products are produced and published by the Indian National Centre for Ocean
Information Services (INCOIS), Ministry of Earth Sciences, Government of India.
