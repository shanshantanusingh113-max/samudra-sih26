# Samudra 3D - SIH 2026 idea deck: the content, slide by slide

**This file holds the exact words for every slide, where every picture goes, and the exact prompt
to regenerate any picture with an image model.**

Read [`DESIGN-SPEC.md`](DESIGN-SPEC.md) first for how it all looks - the palette, the type, the
grid, and the full visual description of each of the nine rendered boards.

- **Team:** Sigmoid &middot; Team ID `<FILL IN>`
- **Problem Statement:** 26067 &middot; **Theme:** Disaster Management &middot; **Category:** Software
- **Organisation:** Ministry of Earth Sciences &middot; **Department:** INCOIS, Ocean Valley
- **Live prototype:** https://rak2315.github.io/samudra-sih26/

**Every number below was measured against the running build on 27 August 2026.** Do not round
them, do not soften them, and do not add one that is not here.

---

# SLIDE 1 - TITLE

**Orientation:** the template's own field table on the left, one image on the right.
**Image:** `images/S1-globe.jpg` &middot; 16:9 &middot; place about 4.2 in wide, right-aligned, vertically centred.

### The field table - fill it exactly like this

| Field | Value |
| --- | --- |
| Problem Statement ID | **26067** |
| Problem Statement Title | Develop a web-based interactive 3D visualization platform that integrates numerical ocean model outputs and in-situ observations. |
| Theme | **Disaster Management** |
| PS Category | **Software** |
| Team ID | `<FILL IN>` |
| Team Name | **Sigmoid** |

### If the template leaves room for a strapline, use this and nothing longer

> **SAMUDRA 3D** - fly into the Indian Ocean. See the model and the measurements in one picture.
>
> Live prototype: **rak2315.github.io/samudra-sih26**

### Caption under the image

> India's exclusive economic zone with INCOIS's temperature analysis draped on it, and the Argo
> floats that measured the same water, with their drift tracks.

> **Team ID is the only blank in this entire deck.** Leave it visible as `<FILL IN>` until you
> have it. Do not invent one.

---

# SLIDE 2 - PROPOSED SOLUTION

*Template heading: **Proposed Solution (Describe your Idea/Solution/Prototype)***

**Orientation:** two columns. Left 4.85 in, right 7.30 in, 0.16 in gutter.

```
+-------------------+  +--------------------------------------------+
|                   |  |  images/S2-app.jpg      7.30 x 3.55 in     |
|  images/          |  |  (crop 16:9 from the TOP only)             |
|  S2-gapmap.png    |  |  + one-line caption                        |
|  4.85 x 5.35 in   |  +--------------------------------------------+
|                   |  |  NATIVE TEXT BOX                           |
|  (portrait)       |  |  INNOVATION AND UNIQUENESS - 4 bullets     |
|                   |  |  7.30 x 1.65 in                            |
+-------------------+  +--------------------------------------------+
```

### Strapline, directly under the slide title - this is the "detailed explanation"

> **One browser tab, and the whole water column.** INCOIS's own ocean analysis rendered as a 3D
> block of water you fly into, with the Argo floats and moored buoys that measured the same water
> drawn inside it - and the gap between the model and the measurement given as a number.

### Left column - `images/S2-gapmap.png`

This picture is the "how it addresses the problem" requirement. It quotes each of the five gaps
PS 26067 names and answers it with what is built. No extra text beside it.

### Right column, top - `images/S2-app.jpg`

**Caption, one line, 9 pt, `#6E8898`:**

> The running platform. INCOIS's 30 July 2026 analysis as a block of water 5 m to 2000 m deep,
> 184 Argo floats and 5 moored buoys drawn where they actually were, and float 1902681's own cast
> scored against the model at 522 depths.

### Right column, bottom - native text box

Section label above the box, mono caps, teal: `INNOVATION AND UNIQUENESS`

- **The disagreement is a number.** On this float the model reads **0.72 °C** warm across **522**
  depths, RMS **1.72 °C**. Every instrument carries its own verdict.
- **It shows where there is no evidence.** Observation Coverage is a variable of its own:
  **6.0%** of the block has no Argo cast behind it, and the picture says exactly where.
- **It finds the odd water for you.** **111** unusual bodies across 12 analyses, each with a
  z-score, a depth band and a footprint in km&sup2;. Isolate one and the rest of the block clips away.
- **The picture and the truth are kept apart.** The GPU gets a quantised byte texture; every
  number a person reads, and every byte served over OPeNDAP, WMS or NetCDF, comes from the native
  grid.

> **Alternative layout.** If you would rather have the four differentiators as a graphic, drop the
> text box and put `images/S2-uniqueness.png` across the full 12.4 in width along the bottom of
> the slide, with the gapmap and the screenshot side by side above it.

---

# SLIDE 3 - TECHNICAL APPROACH

*Template heading: **TECHNICAL APPROACH***

**Orientation:** narrow left column, wide right column split into two rows.
No native body text at all on this slide beyond the title. The boards carry their own.

```
+---------+  +--------------------------------------------------+
|         |  |  images/S3-architecture.png    9.20 x 3.38 in    |
| images/ |  |                                                  |
| S3-     |  +--------------------------------------------------+
| stack   |  |  images/S3-methodology.png     9.20 x 1.70 in    |
| .png    |  |  (five chevrons + the green status strip)        |
| 2.95 x  |  +--------------------------------------------------+
| 4.35 in |
+---------+
```

### What each board covers, against the template's two sub-headings

| Template asks for | Board |
| --- | --- |
| Technologies to be used | `S3-stack.png` - five grouped panels, marking which standards are read and which are served |
| Methodology and process for implementation | `S3-methodology.png` - Fetch, Check, Derive, Bake, Render and compare |
| Working prototype | The green status cell inside `S3-methodology.png` |

### The one thing that must not shrink

The **green "Working prototype, on live INCOIS data" cell** at the bottom left of
`S3-methodology.png`. Beside it the strip carries `rak2315.github.io/samudra-sih26`, **230** tests
passing, and **0** network calls at demo time. That row is the reason a judge takes the rest of
the deck at face value.

---

# SLIDE 4 - FEASIBILITY AND VIABILITY

*Template heading: **FEASIBILITY AND VIABILITY***

**Orientation:** one third, two thirds.

```
+-------------+  +------------------------------------------------+
| images/     |  |  images/S4-risks.png          8.30 x 5.19 in   |
| S4-         |  |                                                |
| feasibility |  |  Five rows. Red risk, green arrow, green fix.  |
| .png        |  |  Every fix carries the measurement that        |
| 3.85 x      |  |  settled it.                                   |
| 5.15 in     |  |                                                |
+-------------+  +------------------------------------------------+
```

### What each board covers

| Template asks for | Board |
| --- | --- |
| Analysis of the feasibility of the idea | `S4-feasibility.png`, boxes 1 and 2 |
| Potential challenges and risks | `S4-risks.png`, the left half of every row |
| Strategies for overcoming these challenges | `S4-risks.png`, the right half of every row |

### The argument of this slide, in case you are asked it out loud

Every risk on it was hit during the build and resolved, and each resolution carries the number
that settled it. It is written in the past tense on purpose. Say: *"This slide is a record, not a
forecast."*

### Optional inset

If the slide feels bare, drop `images/S4-coverage.jpg` in small (about 2.6 in wide) at the bottom
of the left column with the caption:

> Observation Coverage. The tool's own account of where there is no float data behind the
> analysis - 6.0% of the block, shown rather than filled in.

---

# SLIDE 5 - IMPACT AND BENEFITS

*Template heading: **IMPACT AND BENEFITS***

**Orientation:** two equal halves.

```
+--------------------------+  +--------------------------+
| images/S5-audience.png   |  | images/S5-benefits.png   |
| 6.10 x 5.20 in           |  | 6.10 x 4.74 in           |
|                          |  |                          |
| Hub + five numbered      |  | Social / Economic /      |
| audiences                |  | Environmental + the      |
|                          |  | headline result box      |
+--------------------------+  +--------------------------+
```

### What each board covers

| Template asks for | Board |
| --- | --- |
| Potential impact on the target audience | `S5-audience.png` - five existing INCOIS mandates |
| Benefits: social, economic, environmental | `S5-benefits.png` - one card each |

### The line to say out loud when this slide is up

> Every one of those five is something INCOIS already does. We are not proposing a new mandate.
> We are proposing that the data they already produce, and already pay for, does more work.

### Optional inset

`images/S5-anomaly.jpg` at about 2.8 in wide, if there is room under the audience board:

> Unusual water, found automatically. Each ring marks one body that departed from its own
> four-month average, with its depth band, its footprint and the number of casts behind it.

---

# SLIDE 6 - RESEARCH AND REFERENCES

*Template heading: **RESEARCH AND REFERENCES***

**Orientation:** two equal columns of native text. Small type, 10-11 pt. This slide is a
reference, not a read. No image needed.

## Left column - `DATA SOURCES, EVERY ONE TESTED REACHABLE`

**1. INCOIS ERDDAP** - `incois_argo_10d_VAM`, the 10-day gridded Argo analysis (Variational
Analysis Methodology). Temperature and salinity, 24 levels, 5-2000 m. *This is the model field.*
`erddap.incois.gov.in/erddap/griddap/incois_argo_10d_VAM.html`

**2. Argo GDAC, Coriolis / Ifremer** - `ArgoFloats`. 221 floats, with per-value quality flags.
*These are the observations.*
`erddap.ifremer.fr/erddap/tabledap/ArgoFloats.html`

**3. Argo synthetic BGC, Ifremer** - `ArgoFloats-synthetic-BGC`. Chlorophyll from 49 floats.
`erddap.ifremer.fr/erddap/tabledap/ArgoFloats-synthetic-BGC.html`

**4. NOAA OSMC real-time (GTS)** - `OSMC_RealTime`. 9 moored buoys, including India's own OMNI
network run by NIOT with INCOIS as data centre, and the MoES-NOAA RAMA array. Public domain.
`erddap.aoml.noaa.gov/gdp/erddap/tabledap/OSMC_RealTime.html`

**5. Copernicus Marine** - `GLOBAL_ANALYSISFORECAST_PHY_001_024`, surface currents over WMTS,
carried as a labelled image layer and never as a number.
`data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024/description`

**6. Natural Earth 1:50m coastlines** - public domain coastline geometry.
`github.com/nvkelso/natural-earth-vector`

**Live provenance page** - every figure in this deck read from the build's own manifest, beside
the exact request you can run yourself:
`rak2315.github.io/samudra-sih26/provenance.html`

## Right column - `STANDARDS AND SCIENTIFIC REFERENCES`

### Standards

- **CF Conventions 1.8** - INCOIS publish to CF-1.6 and we read it; our own NetCDF endpoint
  writes CF-1.8 with real standard names. `cfconventions.org`
- **OPeNDAP DAP2** - consumed through ERDDAP griddap, and served from our own native grids with
  constraint expressions. `opendap.org`
- **OGC WMS 1.3.0** - served for the fields that exist nowhere else: density, the temperature
  anomaly, and observation coverage. `ogc.org/standard/wms`
- **WebGL2 / GLSL ES 3.00** - browser-native rendering. No plugin, no install.

### Scientific references

- **Thyng, K.M., Greene, C.A., Hetland, R.D., Zimmerle, H.M. & DiMarco, S.F. (2016).** True
  colors of oceanography: guidelines for effective and accurate colormap selection.
  *Oceanography* **29**(3), 9-13. The cmocean palettes this platform uses.
  `doi.org/10.5670/oceanog.2016.66`
- **Wong, A.P.S. et al. (2020).** Argo data 1999-2019: two million temperature-salinity profiles
  and subsurface velocity observations from a global array of profiling floats.
  *Frontiers in Marine Science* **7**, 700. `doi.org/10.3389/fmars.2020.00700`
- **Wong, A., Keeley, R. & Carval, T., for the Argo Data Management Team (2025).** Argo quality
  control manual for CTD and trajectory data, v3.9. The two-level quality control our own checks
  are built on. `doi.org/10.13155/33951`
- **IOC, SCOR & IAPSO (2010).** The international thermodynamic equation of seawater - 2010
  (TEOS-10). Used for potential density. `teos-10.org`

### Our own engineering record

- **Twelve architecture decision records** covering the renderer choice, the data sourcing, the
  depth warp, the volume encoding, the derived fields we built and deleted, and the open
  standards. `github.com/RAK2315/samudra-sih26` &rarr; `docs/adr/`
- **Every unmet clause of PS 26067**, researched with dates and row counts, with the decision
  taken on each and the measurement behind it. `docs/plan/03-requirement-gaps.md`
- **230 automated tests**, run in CI on every push.

> **Before you export, click every link on this slide.** All four DOIs above were checked on
> 1 September 2026 and resolve. Three references from an earlier draft were removed because they
> could not be verified. Do not restore any citation without a working link.

---

# PART TWO - IMAGE GENERATION PROMPTS

Every picture in this deck already exists in `images/`, rendered from
`scripts/ppt_diagrams.html`. These prompts are here so you can generate an alternative and
compare, as you asked.

## Read this before using any of them

**The rendered version will almost certainly be better, and here is the honest reason.** Every
board in this deck contains a fact - a dataset ID, a byte count, a temperature. An image model
will render `incois_argo_10d_VAM` as `incios_argo_1Od_VAN`, put "0.72 °C" in the box about
storage, and draw an arrow from the wrong node. None of that is a rendering flaw you can see at a
glance; it is a wrong statement in a picture, and it is the single fastest way to lose a judge
who knows the domain.

So use these prompts in one of two ways:

### Way A, recommended - **layout only, no text**

Add this line to the end of any prompt below:

> Render the layout, the boxes, the coloured edges and the arrows only. Put **no text of any
> kind** anywhere in the image - no labels, no headings, no numbers, no captions, no watermark.
> Leave every text area as clean empty space.

Then lay PowerPoint text boxes on top, taking the words from the board descriptions in
`DESIGN-SPEC.md` section 9. You get the model's composition and our correct words.

### Way B - **full diagram, then verify every string**

Let it write the text, then check every single string against `DESIGN-SPEC.md` section 9 and this
file. If one is wrong, do not fix it by hand in an image editor - regenerate or fall back to
`Way A`. A half-corrected image looks worse than either.

### Tool notes

- **Gemini / Nano Banana** - the prompts below are written for it: long, natural-language, with
  the aspect ratio stated and an explicit list of what must not appear. Give it the existing PNG
  as a reference image and ask for "the same information, laid out better" - that works far
  better than describing it cold.
- **NotebookLM** - it does not generate images. Give it `DESIGN-SPEC.md`, this file and the
  `images/` folder and use the prompt block in `DESIGN-SPEC.md` section 13 instead.
- **ChatGPT / GPT image** - same prompts, but cut them to about half the length; it responds
  worse to long prompts than Gemini does.
- **Midjourney** - do not use it for any of these. It cannot make a labelled diagram. Append
  `--ar 16:9 --style raw` and use it only for the optional title-slide texture at the end.

---

## Prompt 1 - `S2-gapmap.png`

**Aspect ratio 0.82 (portrait, roughly 4:5). Target 1240 x 1514 px.**

```
A clean vertical infographic on a pure white background, in a precise flat editorial
style - no shadows, no gradients, no 3D, no glow.

Five identical cards stacked in a single column with even 11 px gaps. Each card is a
rounded rectangle, corner radius 7 px, filled a very pale blue-grey (#F3F8FB), with a
1 px border (#CBDCE6) and a bold 3 px solid red-orange stripe (#BE3B26) running down
its entire left edge.

Inside each card, three elements stacked top to bottom with tight spacing:
  1. A small monospace all-caps red-orange label at the top left.
  2. Two lines of dark blue-grey (#33505F) sentence text set in quotation marks.
  3. Below that, indented, a line of near-black text preceded by a bold green
     right-pointing arrow (#12704A) sitting in the left indent.

Above the column of cards: a heavy black all-caps sans-serif headline, and beneath it
a smaller teal monospace all-caps sub-line.

The visual rhythm to achieve: a reader scanning the column sees five red left edges,
each one answered by a green arrow, and understands "five problems, five answers"
before reading a single word.

Generous white space. Nothing decorative. No icons, no illustrations, no photographs,
no logos, no people.
```

## Prompt 2 - `S2-uniqueness.png`

**Aspect ratio 3.12 (a wide ribbon). Target 2440 x 782 px.**

```
A wide horizontal infographic ribbon on a pure white background, flat editorial style,
no shadows, no gradients, no 3D.

Four equal-width cards in a single row with 14 px gaps. Each card is a rounded
rectangle, radius 8 px, pale blue-grey fill (#F3F8FB), 1 px border (#CBDCE6), and a
solid 3 px deep-teal stripe (#0B6E7F) across its entire TOP edge only.

Inside each card, three text blocks stacked: a small teal monospace all-caps kicker, a
bold 15 px near-black headline of three or four words on two lines, and four lines of
dark blue-grey body text with a few words set in bold.

Below the four cards, spanning the full width: a single strip filled pale warm cream
(#FDF6EA) with a 3 px amber (#B26A0C) stripe on its left edge only, holding two lines
of body text.

Above everything: a heavy black all-caps headline and a teal monospace all-caps
sub-line.

No icons, no illustrations, no photographs, no logos, no people, no arrows.
```

## Prompt 3 - `S3-architecture.png`

**Aspect ratio 2.72 (wide). Target 3400 x 1250 px. This is the hardest one for a model to get
right - use Way A.**

```
A wide technical architecture diagram on a pure white background, flat editorial style,
no shadows, no gradients, no 3D, no isometric perspective.

Four vertical zones arranged left to right, separated by three large right-pointing
arrows in pale steel blue (#8FBACD) sitting on the vertical centre line between zones.

Each zone has a thin horizontal rule across its top with a small monospace all-caps
label above it, then a vertical stack of cards beneath filling the zone's height.

Zone 1, five cards: rounded rectangles, pale blue-grey fill (#F3F8FB), 1 px border,
  and a 3 px AMBER (#B26A0C) stripe down the left edge of each.
Zone 2, four cards: slightly deeper blue-grey fill (#E8F1F6) with a full 1.5 px steel
  blue border (#8FBACD) all round - no left stripe. These read as the core.
Zone 3, exactly two cards, and they must look different from each other and from
  everything else:
    the upper card has a pale GREEN tinted fill (#EEF7F2) and a 3 px green (#12704A)
      left stripe,
    the lower card has the standard pale fill and a 3 px CYAN (#1291A6) left stripe.
Zone 4, four cards: standard pale fill with a 3 px deep-teal (#0B6E7F) left stripe.

Every card holds three lines: a bold near-black name, a smaller grey monospace
identifier, and one or two lines of dark blue-grey sentence text.

Beneath the whole four-zone diagram, spanning its full width: a single rounded strip
with a pale green fill (#F1F8F4), a 1 px border and a 3 px green left stripe, holding
two lines of text.

The visual argument that must survive: zone 3 is the only place in the picture where
one card is green and one card is cyan, because those two are opposites.

No icons, no illustrations, no photographs, no logos, no people, no cloud shapes, no
server or database symbols.
```

## Prompt 4 - `S3-stack.png`

**Aspect ratio 0.68 (portrait). Target 920 x 1358 px.**

```
A narrow vertical infographic on a pure white background, flat editorial style, no
shadows, no gradients.

Five stacked panels with 10 px gaps. Each panel is a rounded rectangle, radius 7 px,
pale blue-grey fill (#F3F8FB), 1 px border (#CBDCE6), no stripe.

Each panel holds two lines: a small deep-teal monospace all-caps group label, and
beneath it one or two lines of near-black text made of short names separated by small
middot characters.

Beneath the five panels: a strip with a pale warm cream fill (#FDF6EA) and a 3 px amber
left stripe, holding one line of text.

Above everything: a heavy black all-caps headline and a teal monospace all-caps
sub-line.

No brand logos of any kind - no Python, React, or framework marks. No icons, no
illustrations, no photographs, no people.
```

## Prompt 5 - `S3-methodology.png`

**Aspect ratio 5.40 (very wide). Target 3400 x 630 px.**

```
A very wide horizontal process ribbon on a pure white background, flat editorial style,
no shadows, no gradients, no 3D.

Five equal panels butted directly together with no gap, forming one continuous bar.
Each panel is filled pale blue-grey (#F3F8FB) with a 1 px border (#CBDCE6). Where two
panels meet, the boundary is a chevron: the right edge of each panel pushes into the
next as a small pointed notch, so the whole bar reads as five arrows pointing right.
The last panel has a flat right edge.

Inside each panel, stacked: a large pale steel-blue monospace two-digit number, a bold
near-black all-caps stage name, and three lines of small dark blue-grey body text.

Below the ribbon, spanning the full width: a single rounded bar with a 1.5 px GREEN
(#12704A) border, divided into four cells by thin vertical rules. The FIRST cell only
is filled pale green (#EAF6F0) and its text is green and bold; the other three are
white with a small grey monospace all-caps caption above a line of dark text.

Above everything: a heavy black all-caps headline and a teal monospace all-caps
sub-line.

No icons, no illustrations, no photographs, no logos, no people, no gears, no
lightbulbs.
```

## Prompt 6 - `S4-feasibility.png`

**Aspect ratio 0.75 (portrait). Target 1080 x 1448 px.**

```
A narrow vertical infographic on a pure white background, flat editorial style, no
shadows, no gradients.

Three stacked boxes with 11 px gaps. Each is a rounded rectangle, radius 8 px, pale
blue-grey fill (#F3F8FB), 1 px border (#CBDCE6), and a solid 3 px deep-teal (#0B6E7F)
stripe across its entire TOP edge only.

Each box holds, stacked: a bold near-black heading of three or four words, a small
deep-teal monospace all-caps sub-label directly beneath it, then exactly three
bulleted lines in dark blue-grey with the first few words of each bullet set in bold
near-black. Bullets are small round dots, not arrows or ticks.

Above everything: a heavy black all-caps headline and a teal monospace all-caps
sub-line.

No icons, no illustrations, no photographs, no logos, no people, no checkmarks.
```

## Prompt 7 - `S4-risks.png`

**Aspect ratio 1.60 (landscape). Target 2240 x 1404 px.**

```
A horizontal comparison infographic on a pure white background, flat editorial style,
no shadows, no gradients, no 3D.

Five identical rows stacked with 9 px gaps. Each row is built from four elements
across, all the same height:

  1. A narrow solid DEEP TEAL (#0B6E7F) square at the far left holding a single white
     monospace digit, centred. Its left corners are rounded, its right corners square,
     so it reads as a tab attached to the panel beside it.
  2. A wide panel filled very pale PINK (#FDF2F0) with a 1 px border, holding a small
     red-orange (#BE3B26) monospace all-caps kicker over three lines of dark blue-grey
     text whose opening words are bold.
  3. A narrow white gap containing one green (#12704A) right-pointing arrow, vertically
     centred.
  4. A wide panel filled very pale GREEN (#F1F8F4) with a 1 px border and rounded right
     corners, holding a small green monospace all-caps kicker over three or four lines
     of dark blue-grey text whose opening words are bold.

Panels 2 and 4 are the same width as each other.

Below the five rows, spanning the full width: a strip with a pale warm cream fill
(#FDF6EA) and a 3 px amber left stripe, holding one line of text.

Above everything: a heavy black all-caps headline and a teal monospace all-caps
sub-line.

The effect to achieve: a column of five pale red blocks each answered by a pale green
block, legible as "problem, solved" from across a room before any word is read.

No icons, no illustrations, no photographs, no logos, no people, no warning triangles.
```

## Prompt 8 - `S5-audience.png`

**Aspect ratio 1.04 (near square). Target 1320 x 1272 px.**

```
A vertical hub-and-spoke infographic on a pure white background, flat editorial style,
no shadows, no gradients, no 3D.

At the top, spanning the full width: one wide hub box, rounded, radius 8 px, filled a
soft blue (#E8F1F6) with a 1.5 px deep-teal (#0B6E7F) border. Its text is centred: a
bold deep-teal line above a smaller dark blue-grey line.

Beneath it, five rows stacked with 9 px gaps. Each row is a rounded rectangle split
into two unequal parts by a hard vertical edge:
  - a narrow SOLID DEEP TEAL (#0B6E7F) tile on the left holding a white monospace
    two-digit number, centred,
  - a wide pale blue-grey (#F3F8FB) panel on the right holding a bold near-black title
    line above two or three lines of dark blue-grey body text.

Above everything: a heavy black all-caps headline and a teal monospace all-caps
sub-line.

No icons, no illustrations, no photographs, no logos, no people, no radiating lines,
no circular arrangement - the "hub and spoke" is expressed by the box on top and the
numbered rows beneath, not by a wheel.
```

## Prompt 9 - `S5-benefits.png`

**Aspect ratio 1.29 (landscape). Target 1520 x 1180 px.**

```
A vertical stack infographic on a pure white background, flat editorial style, no
shadows, no gradients.

Three cards stacked with 11 px gaps. Each is a rounded rectangle, radius 7 px, pale
blue-grey fill (#F3F8FB), 1 px border (#CBDCE6), and a thick 4 px stripe down its
entire LEFT edge. The three stripe colours differ and are the only thing that
distinguishes the cards:
  card 1 - deep teal (#0B6E7F)
  card 2 - amber (#B26A0C)
  card 3 - green (#12704A)

Each card holds a small monospace all-caps kicker in that same card's stripe colour,
then four or five lines of dark blue-grey body text with several short phrases set in
bold near-black.

Beneath the three cards: a rounded box with a 1.5 px amber (#B26A0C) border and a pale
warm cream fill (#FDF6EA), holding two lines of text with a figure set in bold amber
monospace.

Above everything: a heavy black all-caps headline and a teal monospace all-caps
sub-line.

No icons, no illustrations, no photographs, no logos, no people, no leaf, coin or
handshake symbols.
```

## Prompt 10 - optional title-slide texture

**Only if the title slide feels empty and you have already placed `S1-globe.jpg`. Use at 6 to 8%
opacity, behind everything, and clip it to the body area so it never touches the template's
bands.** Aspect ratio 16:9.

```
An extremely subtle abstract background texture for a white presentation slide.
Very faint horizontal contour bands in a single desaturated teal, like the isolines
of an ocean temperature section, fading to pure white across the right two thirds
of the frame. Barely visible - it must read as paper texture, not as an image.

Flat vector style, no photograph, no gradient mesh, no glow, no water, no waves,
no fish, no boat, no globe, no map, no coastline, no country border, no text,
no logo, no people.
```

---

# WHAT NOT TO PUT ON ANY SLIDE

A short list, because each of these was considered and rejected for a reason.

| Do not | Why |
| --- | --- |
| Say "no other tool does this" | We have not finished checking Argovis, Copernicus MyOcean and the EU Digital Twin Ocean. Say "co-visualisation in a browser, in 3D, with the comparison quantified" - the narrow claim is defensible, the absolute one is not. |
| Claim gliders, CTD sections, HF-radar or ADCP | None are in the build, and each was refused with a measurement. The last glider left this basin on 14 Oct 2022. Saying so is a stronger answer than a vague promise. |
| Claim machine learning anywhere | There is none, deliberately. Twelve timesteps is not a training set, and a neural gap-filler would paint over the 6% that is the most honest thing in the tool. |
| Say "230 Argo floats" | It is 221 Argo floats **and** 9 moored buoys, and the number drawn on screen at any one timestep is between 184 and 210 floats and 5 to 9 buoys. Say "instruments" unless you mean floats. |
| Put a speed number on the currents layer | It is Copernicus's own rendered image, carried under their attribution. It has no tooltip and no value under the cursor, and that is on purpose. |
| Add a stock photo of the ocean | Every picture in this deck is either the real architecture or the real software. That is itself the argument. |
| Add a seventh slide | The portal caps it at six. |
