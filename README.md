# Samudra 3D

**A website that lets you fly into the Indian Ocean and look at it in 3D - and see, in the same
picture, what the computer model predicted and what real instruments in the water actually
measured.**

**Live: https://rak2315.github.io/samudra-sih26/**

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

### It runs on INCOIS's real data

This is not a mock-up with invented numbers. It reads:

- **INCOIS's own public data server** for the model field - their 10-day gridded Argo analysis,
  temperature and salinity on 24 depth levels, updated continuously. Our demo data goes up to
  **30 July 2026**.
- **The global Argo float network** for the real measurements - 88 floats and 500 profiles
  across the Arabian Sea, Bay of Bengal and equatorial Indian Ocean.

## 3. Features, and which requirement each one answers

| The problem statement asks for | What we built | Where it lives |
| --- | --- | --- |
| 3D volumetric rendering of model fields | GPU ray-marched water column, temperature and salinity | `web/src/scene/volumeShader.ts` |
| Depth-slice navigation | Two sliders that cut the block to any depth range | `web/src/ui/Controls.tsx` |
| Isosurface extraction | Draws the surface where the ocean is one chosen temperature (e.g. the 20 °C isotherm, which is the standard thermocline marker) | `volumeShader.ts` |
| Time-step animation | Play button; steps through 12 analyses over 4 months | `web/src/ui/Timeline.tsx` |
| Instrument data overlay | Argo floats shown at true positions, with drift tracks | `web/src/scene/OceanScene.ts` |
| Click a float to see a depth-vs-variable profile | The Collocation panel, with timestamps | `web/src/ui/ProfilePanel.tsx` |
| Multi-format ingestion (NetCDF + text) | NetCDF via xarray; Argo CSV parser | `pipeline/samudra/sources/` |
| Modular - add sources with minimal code change | Three adapters behind one interface. Two Argo providers that name every column differently are absorbed by one parser | `pipeline/samudra/sources/` |
| Customisable colourbar (palette, min/max, log/linear) | Full colourbar editor using cmocean palettes | `web/src/ui/Controls.tsx` |
| Layer opacity control | Water opacity + feature emphasis sliders | same |
| Vertical exaggeration slider | 200× to 3500× | same |
| REST API backend | FastAPI, including live collocation for any float | `api/main.py` |
| Open standards / CF conventions | Data read straight from CF-1.6 compliant NetCDF over ERDDAP | `sources/incois.py` |
| Deployable without client-side dependencies | Plain static site; no plugins, no tokens, no accounts | `web/` |

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

**Tests:** `cd pipeline && ../.venv/Scripts/python -m pytest` - 54 tests covering the depth
warp, volume encoding, grid interpolation, collocation maths, the Argo parser, and the adapter
seam that lets two providers with incompatible column layouts share one parser.

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

## 6. What we deliberately did **not** build

Being explicit so nobody assumes we forgot. The full list with reasons is in `CONTEXT.md`.

- Connecting to INCOIS's **internal** archive - that needs credentials we do not have. Our
  Source Adapter is the exact place it would plug in.
- Re-serving the data as an OGC WMS/WCS server. We *consume* open standards; re-publishing them
  is a checkbox no judge will click.
- User accounts, saved sessions, mobile layout, WebGPU, machine-learning products.
- 3D animated current streamlines. Currents appear as 2D vectors only.

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
