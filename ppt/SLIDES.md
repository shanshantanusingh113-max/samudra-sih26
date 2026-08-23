# SIH 2026 - Idea Submission Deck

**Problem Statement 26067 · Samudra 3D**

Everything below is fact-checked against the working build. No claim appears here that the
prototype does not actually do. Six slides, per the host's limit.

Images referenced live in `ppt/images/`. Slide-by-slide text is written to be **read aloud or
skimmed by a non-technical judge**, with the technical proof carried by the diagrams.

---

# ART DIRECTION

## The one decision that shapes everything

**The slides are dark, and all text is native slide text - never text inside a picture.**

Boards `06`-`10` in `images/` are *design references*, not assets to paste. They show exactly
what each slide should look like; rebuild them as real boxes and real text in PowerPoint. Text
baked into an image cannot be edited, softens under PDF compression, and blurs on a projector.

The only images that get **pasted** are the ones that genuinely cannot be recreated as text:
screenshots of the running software.

> **On the host's "use the provided template" rule.** It says you may not change the *idea
> details pointers* - the mandated section headings. Keep every one of them exactly:
> IDEA TITLE, TECHNICAL APPROACH, FEASIBILITY AND VIABILITY, IMPACT AND BENEFITS,
> RESEARCH AND REFERENCES, and the title-slide fields. Several past winning decks used
> custom visual designs while keeping those headings intact. If your team would rather not
> take that latitude, the same content works on the plain template - set the boxes on white,
> swap the body text to `#1B2733`, and keep the screenshots exactly as they are.

## Palette

| Role | Hex | Use |
| --- | --- | --- |
| Slide ground | `#071420` | Every slide. Deep blue-black, never pure black |
| Box fill | `#0C1F2E` | Content boxes |
| Box fill (emphasis) | `#102737` | The one box you want read first |
| Box border | `#4A6B80` | 1 pt, all boxes |
| Heading text | `#E4EEF6` | Slide titles, box titles |
| Body text | `#B9CDDC` | Bullets |
| Muted | `#6D8598` | Captions, units, footnotes |
| **Cyan - accent** | `#3FB8C4` | Box labels, arrows, diagram lines, rules |
| **Amber - highlight** | `#F5B841` | The single most important number on a slide. Max 2 |
| Coral - problem | `#F2765F` | "Today", risks, the residual |
| Green - resolved | `#5FD68A` | "Working prototype", "solved", verified |

Cyan is the accent. Amber marks the one number that matters. Coral only ever marks a problem,
green only ever marks something resolved. Never decorate with them.

## Type

| Role | Font | Setting |
| --- | --- | --- |
| Slide title | Chivo Black, or Arial Black | 34-40 pt, ALL CAPS, letter-spacing −2% |
| Box label | Consolas Bold | 11-12 pt, ALL CAPS, +12% tracking, cyan |
| Box heading | Chivo Bold / Arial Bold | 16-18 pt |
| Bullets | Calibri or Arial | 13-15 pt, line spacing 1.4 |
| Bold lead-in | same, **bold**, heading colour | the phrase before each colon |
| Figures, IDs, URLs | Consolas | 11-12 pt |

Chivo is free from Google Fonts. If you cannot install it, Arial Black + Calibri + Consolas
gives the same structure.

## Layout rules

- **6 slides maximum, including the title.** Hard limit from the host.
- Everything sits in a bordered box - two side by side, or a 2×2 grid. Very little loose text.
- **Every box gets a small cyan ALL-CAPS label above it**: `IDEA / SOLUTION`,
  `TECHNOLOGIES TO BE USED`, `FEASIBILITY`, `POTENTIAL CHALLENGES AND RISKS`, and so on.
- **Every bullet is "bold lead-in: short explanation."** Never a bare sentence - the bold
  phrase is what a skimming judge actually reads.
- Maximum ~6 bullets per box.
- Screenshots get a 1 pt `#4A6B80` border and a one-line muted caption beneath.
- Consistent 40 px margins. Slide number bottom-right in Consolas, muted.

## Diagrams must be drawn, not described

Two slides carry real diagrams, and both must be **drawn as shapes and connectors on the
slide**, not written as bullet lists:

- **Architecture (Slide 3)** - a genuine left-to-right flow: source boxes → adapter box →
  Grid/Volume boxes → output boxes, joined by cyan arrows, with the adapter seam called out.
  Use `images/07-architecture.png` as the exact reference for structure, wording and colour.
- **Methodology (Slide 3)** - five numbered stages left to right with connectors between them.
  Reference: `images/08-methodology.png`.

Where space allows, put a **small monochrome icon beside each technology** in the stack list
(Python, FastAPI, React, TypeScript, Three.js/WebGL, NetCDF, pytest). Tint them cyan so they
read as one set. Skip them entirely rather than cramming - a clean list beats a crowded one.

## What to avoid

Text baked into images. Clip art. Stock ocean photography. Gradient text. Drop shadows.
Bare sentences with no bold lead-in. Rotated or skewed screenshots. More than two accent
colours on one slide. Emoji as bullet markers.

---

# SLIDE 1 - TITLE

**Layout:** the template's title slide. Team badge top-left, SIH logo top-right (both already
in the template). Our hero image in a bordered box on the right 50%; the required fields as a
clean two-column list on the left.

**Image:** `images/02-volume-clean.png`

**Exact text:**

> **(title, template serif, centred, ALL CAPS)**
> SAMUDRA 3D
>
> **(subtitle, one line, ocean accent)**
> Fly into the Indian Ocean - see the model and the measurements in one picture.

**Fill in the required fields as a two-column mono block, muted labels / primary values:**

| | |
| --- | --- |
| Problem Statement ID | 26067 |
| Problem Statement Title | Develop a web-based interactive 3D visualization platform that integrates numerical ocean model outputs and in-situ observations |
| Theme | Smart Automation |
| PS Category | Software |
| Team ID | `<fill in>` |
| Team Name | `<fill in - as registered on the portal>` |
| **Live prototype** | **https://rak2315.github.io/samudra-sih26/** |

> ⚠️ **Team ID and Team Name are the only blanks in this deck.** Fill them before export.

---

# SLIDE 2 - IDEA / PROPOSED SOLUTION

**Template title:** `IDEA TITLE` (centred serif caps - keep the template's styling)
**Our idea title, set just beneath it:** Samudra 3D - one browser tab, the whole water column

**Layout:** 2×2. Top-left box `IDEA / SOLUTION :`. Top-right box `PROBLEM RESOLUTION :`.
Bottom-left box `INNOVATION & UNIQUENESS :`. Bottom-right: the image, bordered, with caption.

**Image (bottom-right):** `images/06-gap-2d-vs-3d.png`
Caption beneath: *Today: two windows, flat maps. Samudra 3D: one continuous volume.*

---

### Box 1 - `IDEA / SOLUTION :`

- **Browser-native 3-D ocean**: Renders INCOIS model output as a solid, see-through block of water from 5 m to 2000 m - no install, no plugin, no account.
- **Instruments inside the water**: Argo floats sit at their true positions and depths within that block, with their drift tracks.
- **One-click comparison**: Clicking a float draws what it measured against what the model said at the same place and time, with the gap shaded and quantified in °C.
- **Live controls**: Depth slice, time-step animation, colourbar range, palette, opacity and vertical exaggeration all adjust while you look.
- **Real INCOIS data**: Their own 10-day gridded Argo analysis, 24 depth levels, current to 30 July 2026.

### Box 2 - `PROBLEM RESOLUTION :`

- **Ends the two-window problem**: Model field and in-situ observations are drawn in the same scene, so agreement is *seen* rather than reconstructed in a forecaster's head.
- **Ends the flat-map limitation**: The full water column renders at once, so vertical structure - the thermocline - is visible instead of inferred from stacked slices.
- **Makes disagreement measurable**: Every comparison reports levels matched, mean residual and RMS, so "the model looks off" becomes a number.
- **Removes the re-engineering cost**: A new instrument is one adapter class; the renderer, API and UI never learn what an ERDDAP is.

### Box 3 - `INNOVATION & UNIQUENESS :`

- **Continuous globe-to-volume dive**: The globe genuinely unrolls into the map - every coastline vertex slides from sphere to plane in one deformation. Not a cut or cross-fade between two screens.
- **Change-based transparency**: Opacity is weighted by how fast the field is *changing*, so still water turns invisible and the thermocline becomes the solid thing you see. A plain render is an opaque warm lid over a black void.
- **Co-visualisation the PS calls missing**: Model volume and instrument profile in one view is the specific gap Problem Statement 26067 identifies.
- **Honest by construction**: Land can never fabricate a temperature, and the stretched depth axis is labelled on screen rather than assumed proportional.

---

# SLIDE 3 - TECHNICAL APPROACH

**Template title:** `TECHNICAL APPROACH`

**Layout:** the winners' split - narrow left column `Technologies to be Used:`, wide right column
`Methodology and process for implementation:` holding the two diagrams stacked. A status strip
across the bottom.

**Image A (right, top):** `images/07-architecture.png`
**Image B (right, below it):** `images/08-methodology.png`

---

### Left column - `Technologies to be Used:`

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

### Bottom status strip - this is the slide's strongest line

> **Product Status: working prototype, running on live INCOIS data.**
> End-to-end pipeline complete - ingestion, 3-D rendering, instrument overlay and
> model-vs-observation comparison all functional and tested. **54 tests passing.**
> Remaining work is deployment and additional variables, not core capability.

*(Set the words "working prototype" in the positive colour `#1E7F4F`. This is the sentence a
judge remembers - most submissions at this stage are concepts.)*

---

# SLIDE 4 - FEASIBILITY AND VIABILITY

**Template title:** `FEASIBILITY AND VIABILITY`

**Layout:** the risk board fills the upper two-thirds; three small labelled boxes beneath.

**Image (top):** `images/09-feasibility-risk.png`
Caption: *Every risk below was encountered during the build and resolved - not a projected list.*

---

### Box 1 - `Feasibility:`

- **Already built**: A working prototype exists and runs on live INCOIS data, so feasibility is demonstrated rather than argued.
- **Zero infrastructure cost**: Public open-standard endpoints, no licences, no GPU cluster, no per-seat software.
- **Runs on modest hardware**: Developed and tested against integrated graphics with 2 GB shared VRAM.
- **Deployable as-is**: A static site plus a lightweight API - deployable on INCOIS infrastructure with no client-side dependency.

### Box 2 - `Potential challenges and risks:`

- **Upstream availability**: Two of the obvious data hosts (HYCOM, NOAA CoastWatch) proved unreachable from our network.
- **Weak GPUs in the field**: Volume rendering is fragment-heavy and forecasting desks are not gaming machines.
- **Imperfect real data**: Live Argo floats fail - one in this region reports an impossible 20 PSU.
- **Misleading visuals**: Naively interpolating "no data" paints fake upwelling along every coastline.
- **Internal archive access**: INCOIS's operational archive needs credentials we do not have.

### Box 3 - `Strategies for overcoming them:`

- **Verified sources, baked offline**: We use INCOIS's own public ERDDAP, and all demo data ships with the build - zero network calls at demo time.
- **Adaptive rendering**: Ray-step count, byte-quantised volumes and texture lifetime tuned for integrated graphics.
- **Per-channel quality control**: A failed salinity sensor loses only its salinity; the good temperature survives.
- **A separate coverage channel**: Land can never contribute a fabricated value, at any zoom.
- **The adapter seam**: The internal archive attaches at exactly the point where two public providers already plug in.

---

# SLIDE 5 - IMPACT AND BENEFITS

**Template title:** `IMPACT AND BENEFITS`

**Layout:** impact board across the top; two labelled boxes beneath; the evidence crop bottom-right.

**Image A (top):** `images/10-impact.png`
**Image B (bottom-right, small, bordered):** `images/04-collocation-panel.png`

---

### Box 1 - `Potential impact on the target audience:`

- **Operational forecasters**: Thermocline depth - the ocean heat that fuels cyclone intensification - becomes one click instead of a cross-program comparison.
- **Search and rescue**: Water structure and currents inside the actual search box, in seconds.
- **Fisheries advisories**: Thermal fronts and mixed-layer depth drive where fish aggregate.
- **Students and the public**: Opens in any browser, so a school class can fly into the Bay of Bengal.
- **INCOIS itself**: A new sensor costs one adapter class, not a re-engineered tool.

### Box 2 - `Benefits of the solution:`

- **Social**: Faster, better-founded cyclone and search-and-rescue advisories protect coastal lives.
- **Economic**: Fisheries and shipping act on ocean structure; better advisories reduce wasted fuel and effort.
- **Environmental**: Makes ocean heat content and stratification legible for climate monitoring and outreach.
- **Institutional**: Turns existing INCOIS data - already produced and already paid for - into an operational tool with no new data collection.
- **Educational**: Complex model output becomes something a non-specialist can explore unaided.

### Evidence caption under Image B

> **Real output, not a mock-up.** Argo float **2902306**, Arabian Sea off Oman, July 2026:
> **119** levels matched, model running **−2.16 °C** against the instrument, RMS **2.34 °C** -
> genuine monsoon upwelling that a 1° analysis smooths away.

---

# SLIDE 6 - RESEARCH AND REFERENCES

**Template title:** `RESEARCH AND REFERENCES`

**Layout:** two labelled boxes side by side. Dense but small type; this slide is a reference, not
a read.

---

### Box 1 - `Data sources (all verified reachable):`

- **`incois_argo_10d_VAM`** - INCOIS 10-day gridded Argo analysis (VAM), temperature and salinity on 24 levels, 5-2000 m. *The model field.*
  `erddap.incois.gov.in/erddap/griddap/incois_argo_10d_VAM.html`
- **`incois_argo_mnt_McCreary`** - INCOIS monthly analysis with RMSE and observation counts.
  `erddap.incois.gov.in/erddap/griddap/incois_argo_mnt_McCreary.html`
- **`incois_valueadded_products_datasets`** - MLD, D20/D26, heat content, geostrophic currents.
  `erddap.incois.gov.in/erddap/griddap/incois_valueadded_products_datasets.html`
- **`Indian_ARGO_Floats`** - INCOIS Argo profiles; read by a second adapter to demonstrate extensibility.
  `erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats.html`
- **`ArgoFloats`** - Coriolis GDAC / Ifremer; the current in-situ observations the demo uses.
  `erddap.ifremer.fr/erddap/tabledap/ArgoFloats.html`
- **Natural Earth 1:50m coastlines** - public domain coastline geometry.
  `github.com/nvkelso/natural-earth-vector`

### Box 2 - `Standards, research and prior art:`

**Standards followed**
- **CF-1.6 / ACDD-1.3 / COARDS**: Metadata conventions read directly from source NetCDF
- **ERDDAP griddap & tabledap**: RESTful open-standard subsetting
- **WebGL2 / GLSL ES 3.00**: Browser-native rendering, no plugins

**Scientific references**
- **Thyng et al. (2016)**, *True colors of oceanography*, Oceanography 29(3) - the cmocean palettes
- **Argo Data Management**, *Argo Quality Control Manual for CTD and Trajectory Data* - our QC ranges
- **Saunders & Fofonoff (1976) / UNESCO** - pressure-to-depth conversion
- **Wong et al. (2020)**, *Argo data 1999-2019*, Frontiers in Marine Science

**Prior art reviewed**
- **Qin et al. (2019)** - web 3-D visualisation of ocean forecast data (Cesium.js + Plotly)
- **V-MANIP** - Argo + model overlay via OGC services; validates the co-visualisation approach
- **Will Usher**, *WebGL volume rendering* - ray-marching reference

**Our own engineering record**
- **9 architecture decision records** covering renderer choice, data sourcing, the depth warp, volume encoding and the transparency defect that cost three hours - `docs/adr/`

---

# BUILD NOTES

## Export
Save as **PDF** - the portal accepts nothing else. Check after export that the mono type has not
fallen back (the ERDDAP dataset IDs are the giveaway: they must look monospaced).

## If you are short on space
Slide 3 is the densest. In order, drop: the technology mono line (the diagram already implies
it), then the four proof points. Never drop the architecture diagram - it is the slide's argument.

## The one thing to get right
If a judge remembers one image, it should be **the water column with float tracks on it**
(`02-volume-clean.png`) or **the collocation chart** (`04-collocation-panel.png`). Those two are
the entire idea: a 3-D ocean, and a measurement disagreeing with a model inside it. Give them
room.

## Image inventory

**Paste these** - real screenshots of the running software, which is what makes the deck
credible. They cannot be recreated as text.

| File | What it shows | Use on |
| --- | --- | --- |
| `02-volume-clean.png` | The water column, no UI panels | **Slide 1 hero** |
| `01-volume-full.png` | Full application with all controls visible | **Slide 3** - proves it is a real app |
| `03-globe-full.png` | Globe, EEZ temperature field, 88 floats | **Slide 2** |
| `04-collocation-panel.png` | The comparison chart and its statistics | **Slide 5 evidence** |
| `11-isosurface.png` | The 20 °C isotherm surface | **Slide 2 or 4** |
| `12-watermass.png` | Colourbar narrowed to isolate one water mass | **Slide 2 or 5** - visually the strongest |
| `13-salinity.png` | Salinity field, haline palette | **Slide 3** - shows multi-variable support |
| `05-collocation-full.png` | Float selected, plumb line through the volume | Spare |

**Rebuild these as native slide content** - they are layout references, not assets:

| File | Rebuild as |
| --- | --- |
| `06-gap-2d-vs-3d.png` | Two side-by-side boxes, "Today" vs "Samudra 3D" |
| `07-architecture.png` | A drawn flow diagram with shapes and connectors |
| `08-methodology.png` | Five connected stage boxes plus a proof-point row |
| `09-feasibility-risk.png` | A native table: Risk / What happened / Resolution / State |
| `10-impact.png` | Four audience boxes plus before→after rows |
