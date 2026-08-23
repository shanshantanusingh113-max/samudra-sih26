# SIH 2026 — Idea Submission Deck

**Problem Statement 26067 · Samudra 3D**

Everything below is fact-checked against the working build. No claim appears here that the
prototype does not actually do. Six slides, per the host's limit.

Images referenced live in `ppt/images/`. Slide-by-slide text is written to be **read aloud or
skimmed by a non-technical judge**, with the technical proof carried by the diagrams.

---

# ART DIRECTION — apply this to every slide

Read this section once before building any slide. Consistency is what makes a deck look
designed rather than assembled.

## Palette (dark deck — deliberate, not a default)

The app is a dark instrument console and every screenshot is dark. A white deck would fight
every image on it and make the screenshots look like holes punched in the page.

| Role | Hex | Use for |
| --- | --- | --- |
| Ground | `#071420` | Every slide background. Deep blue-black, never pure black |
| Panel | `#0C1F2E` | Cards, table rows, image frames |
| Panel light | `#102737` | Emphasised cards |
| Hairline | `rgba(120,170,195,0.22)` | 1 px borders, dividers |
| Primary text | `#E4EEF6` | Headings, key figures |
| Body text | `#B9CDDC` | Sentences |
| Muted | `#6D8598` | Labels, captions, units |
| **Cyan (accent)** | `#3FB8C4` | Eyebrows, arrows, section marks, links |
| **Amber (highlight)** | `#F5B841` | Key numbers only. Never more than 2 per slide |
| Coral (problem) | `#F2765F` | "Today"/risk framing, residual |
| Green (resolved) | `#5FD68A` | "Solved" pills, observed-data line |

**Rule:** cyan is the accent, amber is for the single most important number on the slide,
coral only ever marks a problem, green only ever marks something resolved. Never decorate with
them.

## Typography

| Role | Font | Setting |
| --- | --- | --- |
| Slide titles | **Chivo Black (900)** | 40–46 pt, letter-spacing −2%, sentence case |
| Section eyebrow | **IBM Plex Mono 500** | 12 pt, ALL CAPS, letter-spacing +12%, cyan |
| Body / bullets | **Chivo Regular** | 16–18 pt, line-height 1.5 |
| Big figures | **Chivo Bold** | 40–64 pt, tabular figures |
| Captions, data, units | **IBM Plex Mono** | 11–12 pt, muted |

Free from Google Fonts. Fallbacks: Chivo → Archivo → Arial; IBM Plex Mono → Consolas.
**Do not use Calibri, Times, or PowerPoint defaults anywhere.**

## Layout rules

- 16:9. Consistent 56 px margin on all four sides.
- Every slide: eyebrow (mono, cyan) → title (Chivo Black) → content. Nothing else above the title.
- **Images bleed or sit in a 1 px hairline frame with 10 px corner radius.** Never drop-shadow,
  never rotate, never add a border glow.
- Maximum 6 bullets per slide. Bullets are fragments, not sentences with full stops.
- Numbers get their own visual weight — set key figures large, in amber, with a mono caption
  underneath in muted. Never bury a number inside a sentence.
- Whitespace is not wasted space. If a slide feels crowded, cut a bullet; do not shrink type.
- Slide number bottom-right, IBM Plex Mono 10 pt, muted.

## What to avoid

Clip art. Stock photos of oceans. Gradient text. Drop shadows. 3-D bevels. Emoji as bullet
markers (the impact icons in image 10 are the one deliberate exception, and they are inside a
rendered diagram, not typed onto a slide). Centre-aligned body text. More than two accent
colours on one slide.

---

# SLIDE 1 — TITLE

**Layout:** full-bleed image on the right 55%, text block on the left 45% over the ground colour.
A soft vertical gradient (`#071420` → transparent) over the image's left edge so the text stays
legible.

**Image:** `images/02-volume-clean.png`

**Exact text:**

> **(eyebrow, mono cyan)** SMART INDIA HACKATHON 2026
>
> **(title, Chivo Black, 54 pt)**
> Samudra 3D
>
> **(subtitle, Chivo Regular 20 pt, body colour)**
> Fly into the Indian Ocean. See the model and the measurements in one picture.

**Fill in the required fields as a two-column mono block, muted labels / primary values:**

| | |
| --- | --- |
| Problem Statement ID | 26067 |
| Problem Statement Title | Develop a web-based interactive 3D visualization platform that integrates numerical ocean model outputs and in-situ observations |
| Theme | Smart Automation |
| PS Category | Software |
| Team ID | `<fill in>` |
| Team Name | `<fill in — as registered on the portal>` |

> ⚠️ **Team ID and Team Name are the only blanks in this deck.** Fill them before export.

---

# SLIDE 2 — IDEA / PROPOSED SOLUTION

**Eyebrow:** PROPOSED SOLUTION
**Title:** One browser tab. The whole water column.

**Layout:** full-width diagram across the top 62%, three short columns beneath.

**Image:** `images/06-gap-2d-vs-3d.png` (the before/after board)

**Text beneath — three columns, each a heading + one fragment:**

| **What it is** | **How it addresses the problem** | **Why it is new** |
| --- | --- | --- |
| A website that renders INCOIS ocean model output as a solid, see-through 3-D block of water, 5 m to 2000 m | Model field and float measurements are drawn in the **same scene**, so agreement is *seen*, not reconstructed in the forecaster's head | No existing tool co-visualises a 3-D model field with in-situ profiles in a browser — the PS says so, and our search agrees |
| Argo floats sit at their true positions inside that water | Click any float: measured vs modelled on one chart, disagreement shaded and **quantified** | The globe **unrolls** into the map in one continuous motion — not a cut between two screens |
| Nothing to install. No plugin, no account, no token | Depth, time, colour and opacity are all live controls | Still water is transparent; **only water that is changing is solid**, so the thermocline is what you see |

**Callout strip along the bottom (amber left rule, panel background):**

> Running on INCOIS's own public data server — their 10-day gridded Argo analysis, **current to
> 30 July 2026**. Not a mock-up, not sample data.

---

# SLIDE 3 — TECHNICAL APPROACH

**Eyebrow:** TECHNICAL APPROACH
**Title:** Open standards in, WebGL out

**Layout:** architecture diagram top half, methodology strip bottom half. No body paragraphs.

**Image A (top):** `images/07-architecture.png`
**Image B (bottom):** `images/08-methodology.png`

**Technology list — set as a single mono line under the eyebrow, cyan separators:**

> Python 3.10 · xarray · NetCDF4 · SciPy · NumPy — FastAPI · Uvicorn — TypeScript · React 19 ·
> Vite · **Three.js / WebGL2 · GLSL ES 3.00** — cmocean palettes — pytest

**Four proof points, right-aligned mono, muted labels with amber figures:**

- **48** automated tests on the scientific logic
- **4 bytes** per voxel — value, coverage, gradient, spare
- **159 KB** per timestep volume
- **0** network calls at demo time

---

# SLIDE 4 — FEASIBILITY AND VIABILITY

**Eyebrow:** FEASIBILITY & VIABILITY
**Title:** Every risk here was hit during the build — and resolved

**Layout:** the risk board fills the slide. One short line above it, one below.

**Image:** `images/09-feasibility-risk.png`

**Line above (body text):**

> This is not a projected risk list. A working prototype exists, so each row below is something
> that actually happened and what we did about it.

**Line below (mono, muted, small):**

> Remaining known limits are documented, not hidden: the vertical axis is deliberately stretched
> (and labelled as such on screen), currents are 2-D only, and the INCOIS *internal* archive
> needs credentials we do not have — our adapter layer is exactly where it attaches.

That last sentence is deliberate. Naming a limitation you have thought about reads as
competence; a judge who finds it themselves reads it as a gap.

---

# SLIDE 5 — IMPACT AND BENEFITS

**Eyebrow:** IMPACT & BENEFITS
**Title:** Faster answers where the ocean costs lives and money

**Layout:** impact board across the top, evidence strip beneath.

**Image A:** `images/10-impact.png`
**Image B (small, right, framed):** `images/04-collocation-panel.png`

**Evidence caption beneath image B (mono, muted, with amber figures):**

> Real output, not a mock-up. Argo float **2902306**, Arabian Sea off Oman, July 2026:
> **119** depth levels matched, model running **−2.16 °C** against the instrument, RMS **2.34 °C**.
> That is genuine monsoon upwelling a 1° analysis smooths away — the kind of thing a forecaster
> needs to know *before* issuing an advisory.

**Benefit bullets (max 5, one line each):**

- **Operational** — thermocline depth is what fuels cyclone intensification; it is now one click away
- **Safety** — search-and-rescue teams see water structure in the actual search box, in seconds
- **Economic** — fisheries advisories depend on thermal fronts and mixed-layer depth
- **Educational** — opens in any browser, so a school class can fly into the Bay of Bengal
- **Institutional** — a new instrument costs one adapter class, not a re-engineered tool

---

# SLIDE 6 — RESEARCH AND REFERENCES

**Eyebrow:** RESEARCH & REFERENCES
**Title:** Sources, standards and prior art

**Layout:** two columns. Left: data sources table. Right: standards + prior art. Mono
throughout, small type, generous line height. No images needed — but if a visual is wanted,
put `images/03-globe-full.png` at 25% opacity as a full-bleed background behind the columns.

**Left column — Data sources (all verified reachable):**

| Dataset | Provider | Link |
| --- | --- | --- |
| `incois_argo_10d_VAM` — 10-day gridded Argo analysis (VAM), 24 levels 5–2000 m | INCOIS, MoES | erddap.incois.gov.in/erddap/griddap/incois_argo_10d_VAM.html |
| `incois_argo_mnt_McCreary` — monthly analysis with RMSE and obs counts | INCOIS, MoES | erddap.incois.gov.in/erddap/griddap/incois_argo_mnt_McCreary.html |
| `incois_valueadded_products_datasets` — MLD, D20/D26, heat content, geostrophic currents | INCOIS, MoES | erddap.incois.gov.in/erddap/griddap/incois_valueadded_products_datasets.html |
| `Indian_ARGO_Floats` — Indian Argo profiles (PRES/TEMP/PSAL + QC) | INCOIS, MoES | erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats.html |
| `ArgoFloats` — global Argo profiles | Coriolis GDAC / Ifremer | erddap.ifremer.fr/erddap/tabledap/ArgoFloats.html |
| Natural Earth 1:50m coastlines | Natural Earth (public domain) | github.com/nvkelso/natural-earth-vector |

**Right column — Standards and prior art:**

> **Standards followed**
> CF-1.6 metadata conventions · ACDD-1.3 · COARDS · ERDDAP RESTful access (griddap / tabledap) ·
> OPeNDAP subsetting · WebGL2 / GLSL ES 3.00
>
> **Scientific references**
> Thyng et al. (2016), *True colors of oceanography: guidelines for effective and accurate
> colormap selection*, Oceanography 29(3) — the cmocean palettes we use
> Argo Data Management, *Argo Quality Control Manual for CTD and Trajectory Data* — our QC ranges
> Saunders & Fofonoff (1976) / UNESCO — pressure-to-depth conversion
> Wong et al. (2020), *Argo data 1999–2019: two million temperature-salinity profiles*, Front. Mar. Sci.
>
> **Prior art reviewed**
> Qin et al. (2019), web-based 3-D visualisation of oceanic forecasting data (Cesium.js + Plotly)
> V-MANIP — Argo + model overlay via OGC services; validates the co-visualisation approach
> Will Usher, *WebGL volume rendering* — ray-marching reference
>
> **Our own decision records**
> 8 ADRs covering renderer choice, data sourcing, the depth warp, volume encoding, and the
> transparency bug that cost us three hours — `docs/adr/`

---

# BUILD NOTES

## Export
Save as **PDF** — the portal accepts nothing else. Check after export that the mono type has not
fallen back (the ERDDAP dataset IDs are the giveaway: they must look monospaced).

## If you are short on space
Slide 3 is the densest. In order, drop: the technology mono line (the diagram already implies
it), then the four proof points. Never drop the architecture diagram — it is the slide's argument.

## The one thing to get right
If a judge remembers one image, it should be **the water column with float tracks on it**
(`02-volume-clean.png`) or **the collocation chart** (`04-collocation-panel.png`). Those two are
the entire idea: a 3-D ocean, and a measurement disagreeing with a model inside it. Give them
room.

## Image inventory

| File | What it shows | Best used on |
| --- | --- | --- |
| `01-volume-full.png` | Volume view with full UI and controls | Backup / appendix |
| `02-volume-clean.png` | The water column, no left panel | **Slide 1 hero** |
| `03-globe-full.png` | Globe with EEZ field and floats | Slide 6 background |
| `04-collocation-panel.png` | The comparison chart + statistics | **Slide 5 evidence** |
| `05-collocation-full.png` | Float selected, plumb line, panel | Backup / demo still |
| `06-gap-2d-vs-3d.png` | Today vs Samudra 3D | **Slide 2** |
| `07-architecture.png` | Data flow and the adapter seam | **Slide 3 top** |
| `08-methodology.png` | Five implementation stages + proof | **Slide 3 bottom** |
| `09-feasibility-risk.png` | Risk / what happened / resolution | **Slide 4** |
| `10-impact.png` | Who benefits + before/after bars | **Slide 5 top** |
| `11-isosurface.png` | 20 °C isotherm surface | Spare — strong with an oceanographer |
| `12-watermass.png` | Colourbar narrowed to isolate a water mass | Spare — visually the most striking |
| `13-salinity.png` | Salinity field, haline palette | Spare — shows multi-variable support |
