"""Rewrite slides 2-6 of the SIH deck spec into the layout pattern the winning decks use."""

from pathlib import Path

SLIDES = """# SLIDE 2 — IDEA / PROPOSED SOLUTION

**Template title:** `IDEA TITLE` (centred serif caps — keep the template's styling)
**Our idea title, set just beneath it:** Samudra 3D — one browser tab, the whole water column

**Layout:** 2×2. Top-left box `IDEA / SOLUTION :`. Top-right box `PROBLEM RESOLUTION :`.
Bottom-left box `INNOVATION & UNIQUENESS :`. Bottom-right: the image, bordered, with caption.

**Image (bottom-right):** `images/06-gap-2d-vs-3d.png`
Caption beneath: *Today: two windows, flat maps. Samudra 3D: one continuous volume.*

---

### Box 1 — `IDEA / SOLUTION :`

- **Browser-native 3-D ocean**: Renders INCOIS model output as a solid, see-through block of water from 5 m to 2000 m — no install, no plugin, no account.
- **Instruments inside the water**: Argo floats sit at their true positions and depths within that block, with their drift tracks.
- **One-click comparison**: Clicking a float draws what it measured against what the model said at the same place and time, with the gap shaded and quantified in °C.
- **Live controls**: Depth slice, time-step animation, colourbar range, palette, opacity and vertical exaggeration all adjust while you look.
- **Real INCOIS data**: Their own 10-day gridded Argo analysis, 24 depth levels, current to 30 July 2026.

### Box 2 — `PROBLEM RESOLUTION :`

- **Ends the two-window problem**: Model field and in-situ observations are drawn in the same scene, so agreement is *seen* rather than reconstructed in a forecaster's head.
- **Ends the flat-map limitation**: The full water column renders at once, so vertical structure — the thermocline — is visible instead of inferred from stacked slices.
- **Makes disagreement measurable**: Every comparison reports levels matched, mean residual and RMS, so "the model looks off" becomes a number.
- **Removes the re-engineering cost**: A new instrument is one adapter class; the renderer, API and UI never learn what an ERDDAP is.

### Box 3 — `INNOVATION & UNIQUENESS :`

- **Continuous globe-to-volume dive**: The globe genuinely unrolls into the map — every coastline vertex slides from sphere to plane in one deformation. Not a cut or cross-fade between two screens.
- **Change-based transparency**: Opacity is weighted by how fast the field is *changing*, so still water turns invisible and the thermocline becomes the solid thing you see. A plain render is an opaque warm lid over a black void.
- **Co-visualisation the PS calls missing**: Model volume and instrument profile in one view is the specific gap Problem Statement 26067 identifies.
- **Honest by construction**: Land can never fabricate a temperature, and the stretched depth axis is labelled on screen rather than assumed proportional.

---

# SLIDE 3 — TECHNICAL APPROACH

**Template title:** `TECHNICAL APPROACH`

**Layout:** the winners' split — narrow left column `Technologies to be Used:`, wide right column
`Methodology and process for implementation:` holding the two diagrams stacked. A status strip
across the bottom.

**Image A (right, top):** `images/07-architecture.png`
**Image B (right, below it):** `images/08-methodology.png`

---

### Left column — `Technologies to be Used:`

**Data ingestion & science**
- **Python 3.10**: Pipeline and science logic
- **xarray + netCDF4**: Reads CF-1.6 compliant NetCDF over ERDDAP
- **NumPy / SciPy**: Depth resampling, gradients, land back-fill
- **cmocean**: Perceptually-uniform oceanographic colour scales

**Backend**
- **FastAPI + Uvicorn**: REST API for live collocation queries
- **ERDDAP / OPeNDAP**: Open-standard subsetting at the source

**Frontend & rendering**
- **TypeScript + React 19 + Vite**: Application shell
- **Three.js / WebGL2**: One scene for both globe and volume
- **GLSL ES 3.00**: Custom ray-marching fragment shader

**Quality**
- **pytest**: 54 automated tests on the scientific logic

### Bottom status strip — this is the slide's strongest line

> **Product Status: working prototype, running on live INCOIS data.**
> End-to-end pipeline complete — ingestion, 3-D rendering, instrument overlay and
> model-vs-observation comparison all functional and tested. **54 tests passing.**
> Remaining work is deployment and additional variables, not core capability.

*(Set the words "working prototype" in the positive colour `#1E7F4F`. This is the sentence a
judge remembers — most submissions at this stage are concepts.)*

---

# SLIDE 4 — FEASIBILITY AND VIABILITY

**Template title:** `FEASIBILITY AND VIABILITY`

**Layout:** the risk board fills the upper two-thirds; three small labelled boxes beneath.

**Image (top):** `images/09-feasibility-risk.png`
Caption: *Every risk below was encountered during the build and resolved — not a projected list.*

---

### Box 1 — `Feasibility:`

- **Already built**: A working prototype exists and runs on live INCOIS data, so feasibility is demonstrated rather than argued.
- **Zero infrastructure cost**: Public open-standard endpoints, no licences, no GPU cluster, no per-seat software.
- **Runs on modest hardware**: Developed and tested against integrated graphics with 2 GB shared VRAM.
- **Deployable as-is**: A static site plus a lightweight API — deployable on INCOIS infrastructure with no client-side dependency.

### Box 2 — `Potential challenges and risks:`

- **Upstream availability**: Two of the obvious data hosts (HYCOM, NOAA CoastWatch) proved unreachable from our network.
- **Weak GPUs in the field**: Volume rendering is fragment-heavy and forecasting desks are not gaming machines.
- **Imperfect real data**: Live Argo floats fail — one in this region reports an impossible 20 PSU.
- **Misleading visuals**: Naively interpolating "no data" paints fake upwelling along every coastline.
- **Internal archive access**: INCOIS's operational archive needs credentials we do not have.

### Box 3 — `Strategies for overcoming them:`

- **Verified sources, baked offline**: We use INCOIS's own public ERDDAP, and all demo data ships with the build — zero network calls at demo time.
- **Adaptive rendering**: Ray-step count, byte-quantised volumes and texture lifetime tuned for integrated graphics.
- **Per-channel quality control**: A failed salinity sensor loses only its salinity; the good temperature survives.
- **A separate coverage channel**: Land can never contribute a fabricated value, at any zoom.
- **The adapter seam**: The internal archive attaches at exactly the point where two public providers already plug in.

---

# SLIDE 5 — IMPACT AND BENEFITS

**Template title:** `IMPACT AND BENEFITS`

**Layout:** impact board across the top; two labelled boxes beneath; the evidence crop bottom-right.

**Image A (top):** `images/10-impact.png`
**Image B (bottom-right, small, bordered):** `images/04-collocation-panel.png`

---

### Box 1 — `Potential impact on the target audience:`

- **Operational forecasters**: Thermocline depth — the ocean heat that fuels cyclone intensification — becomes one click instead of a cross-program comparison.
- **Search and rescue**: Water structure and currents inside the actual search box, in seconds.
- **Fisheries advisories**: Thermal fronts and mixed-layer depth drive where fish aggregate.
- **Students and the public**: Opens in any browser, so a school class can fly into the Bay of Bengal.
- **INCOIS itself**: A new sensor costs one adapter class, not a re-engineered tool.

### Box 2 — `Benefits of the solution:`

- **Social**: Faster, better-founded cyclone and search-and-rescue advisories protect coastal lives.
- **Economic**: Fisheries and shipping act on ocean structure; better advisories reduce wasted fuel and effort.
- **Environmental**: Makes ocean heat content and stratification legible for climate monitoring and outreach.
- **Institutional**: Turns existing INCOIS data — already produced and already paid for — into an operational tool with no new data collection.
- **Educational**: Complex model output becomes something a non-specialist can explore unaided.

### Evidence caption under Image B

> **Real output, not a mock-up.** Argo float **2902306**, Arabian Sea off Oman, July 2026:
> **119** levels matched, model running **−2.16 °C** against the instrument, RMS **2.34 °C** —
> genuine monsoon upwelling that a 1° analysis smooths away.

---

# SLIDE 6 — RESEARCH AND REFERENCES

**Template title:** `RESEARCH AND REFERENCES`

**Layout:** two labelled boxes side by side. Dense but small type; this slide is a reference, not
a read.

---

### Box 1 — `Data sources (all verified reachable):`

- **`incois_argo_10d_VAM`** — INCOIS 10-day gridded Argo analysis (VAM), temperature and salinity on 24 levels, 5–2000 m. *The model field.*
  `erddap.incois.gov.in/erddap/griddap/incois_argo_10d_VAM.html`
- **`incois_argo_mnt_McCreary`** — INCOIS monthly analysis with RMSE and observation counts.
  `erddap.incois.gov.in/erddap/griddap/incois_argo_mnt_McCreary.html`
- **`incois_valueadded_products_datasets`** — MLD, D20/D26, heat content, geostrophic currents.
  `erddap.incois.gov.in/erddap/griddap/incois_valueadded_products_datasets.html`
- **`Indian_ARGO_Floats`** — INCOIS Argo profiles; read by a second adapter to demonstrate extensibility.
  `erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats.html`
- **`ArgoFloats`** — Coriolis GDAC / Ifremer; the current in-situ observations the demo uses.
  `erddap.ifremer.fr/erddap/tabledap/ArgoFloats.html`
- **Natural Earth 1:50m coastlines** — public domain coastline geometry.
  `github.com/nvkelso/natural-earth-vector`

### Box 2 — `Standards, research and prior art:`

**Standards followed**
- **CF-1.6 / ACDD-1.3 / COARDS**: Metadata conventions read directly from source NetCDF
- **ERDDAP griddap & tabledap**: RESTful open-standard subsetting
- **WebGL2 / GLSL ES 3.00**: Browser-native rendering, no plugins

**Scientific references**
- **Thyng et al. (2016)**, *True colors of oceanography*, Oceanography 29(3) — the cmocean palettes
- **Argo Data Management**, *Argo Quality Control Manual for CTD and Trajectory Data* — our QC ranges
- **Saunders & Fofonoff (1976) / UNESCO** — pressure-to-depth conversion
- **Wong et al. (2020)**, *Argo data 1999–2019*, Frontiers in Marine Science

**Prior art reviewed**
- **Qin et al. (2019)** — web 3-D visualisation of ocean forecast data (Cesium.js + Plotly)
- **V-MANIP** — Argo + model overlay via OGC services; validates the co-visualisation approach
- **Will Usher**, *WebGL volume rendering* — ray-marching reference

**Our own engineering record**
- **9 architecture decision records** covering renderer choice, data sourcing, the depth warp, volume encoding and the transparency defect that cost three hours — `docs/adr/`

---

"""

path = Path(__file__).resolve().parent.parent / "ppt" / "SLIDES.md"
text = path.read_text(encoding="utf-8")
start = text.index("# SLIDE 2 — IDEA")
end = text.index("# BUILD NOTES")
path.write_text(text[:start] + SLIDES + text[end:], encoding="utf-8")
print(f"rewrote slides 2-6 ({len(SLIDES.splitlines())} lines)")
