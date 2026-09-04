# PS 26067 coverage, audited clause by clause, and what to build next

Written 2026-09-02 against the bake of that morning, and revised the same evening after the
round that built A1, A2, A3, C1 and the bias map. Current figures: **15 Fields, 8 Source
Adapters** plus a ninth for a file a visitor supplies, 237 instruments, 12 Timesteps, **71.1 MB**
baked - up from 58.8 MB, which is the vertical section's native float32 Grids (7.0 MB), the
climatological anomaly's twelve Volumes, the drift check (0.58 MB) and the bias map (0.15 MB).

Three parts. **Part 1** is an audit: every clause of the problem statement against the thing that
answers it, and what happens if nothing does. **Part 2** is ideas, ordered by how much of the
problem statement each one closes per hour of work. **Part 3**, added 2026-09-04, is the research
behind the outreach round: what INCOIS already runs for the audiences the PS names, which NCERT
chapters this draws, what the reference viewer actually is and where it beats us, and the measured
reason the timeline is short.

Nothing here duplicates [`03-requirement-gaps.md`](03-requirement-gaps.md) or
[`04-ps-update-2026-09.md`](04-ps-update-2026-09.md), which record the sources that were measured
and the decisions already taken. This asks a different question: **where is the problem statement
still asking for something, and what would other teams leave on the table?**

---

## Part 1: the audit

### 1.1 The five gaps the PS names in its Background

| Gap the PS names | Answered by | Verdict |
| --- | --- | --- |
| No web-based, platform-independent **3D rendering with depth-resolved volumetric views** | Ray-marched Volume, 56 x 36 x 48, WebGL2 | **Closed** |
| No unified display of **Argo and Glider profiles alongside model fields** | Argo, BGC, moorings drawn in the water; Glider adapter built | **Argo half closed. Glider half is an adapter with no data to draw** - newest cast in the box is 2022-10-14 |
| Absence of **variable selection, depth-slice, time animation, colorbars** | All four, plus vertical exaggeration and a log scale | **Closed** |
| Inability to **ingest new streams without re-engineering** | 8 adapters behind 2 protocols; 3 added in September touching no renderer, and the eighth reads a file a visitor supplies | **Closed, and demonstrated rather than asserted** - a judge can falsify it in fifteen seconds with a file off their own laptop |
| Lack of tools for **intuitive, rapid understanding** | Guide panel, tour, hazard preset, map key, the bias map, and a **vertical section cut live from a line you draw** | **Stronger, and still the weakest of the five for the audiences in section 1.4.** The section is the figure an oceanographer recognises before reading a label; the outreach gap is a different audience |

### 1.2 The six core functional requirements

| Requirement | Status | Note |
| --- | --- | --- |
| **3D volumetric rendering**, depth slice, isosurface, time animation, WebGL/Three.js | Done | Plus three render kinds the PS did not ask for: Sheet, Drape, arrows. ADR 0014 |
| **Instrument overlay**: Argo, Glider, **CTD**, BGC; click for a depth-vs-variable chart | Mostly | Argo, BGC and moorings done. Glider is a finding, not a layer. **CTD is not built and is not refused in writing anywhere a judge will look** |
| **Multi-format ingestion**: NetCDF via xarray, delimited text, modular | **Done** | `samudra/sources/netcdf.py` is a Source Adapter over an uploaded file, behind the same protocol as INCOIS, Argo and Copernicus, and `POST /api/netcdf` is the endpoint. Drag a CF NetCDF onto the panel and its variables appear in the selector under a tab of their own, going through the same colourbar, depth slice, isosurface and ray marcher as a baked Field. **The refusals are the feature**: a file with no longitude, a sigma coordinate, an ensemble dimension or a region elsewhere in the world is refused by name, with the axis in the message and nothing drawn |
| **Customizable colorbar**: palette, min/max, log/linear; variable selector; opacity; exaggeration | Done, with one deliberate deviation | The PS says "color palette" as a user choice. ADR 0010 deleted the chooser on purpose and binds a palette to each Field. **This is right and it is also the one place the build says no to a clause in the PS's own words.** It needs to be visible on the requirements page as a decision, not absent as a gap |
| **Web architecture**: JS frontend, REST/OPeNDAP backend, no client-side dependencies | Done | FastAPI + OPeNDAP + CF-1.8 + WMS |
| **Extensible design**: plugin module for CTD, moorings, HF-radar, ADCP, new variables, **ML products** | Partly | Moorings done. The others are data-policy facts. ML is refused for good reasons and the refusal is not on screen |
| **Open standards**: OGC WMS/**WCS**, CF conventions | WMS, OPeNDAP, CF done. **WCS not** | The recorded reason is "no maintained pure-Python WCS server". **That reason does not survive contact with this project's own precedent** - `api/dap.py` and `api/wms.py` are both hand-written. See idea A4 |

### 1.3 The four operational mandates the PS names, and this is the finding that matters most

The PS says the absence of such a system "impedes timely **hazard assessment**, **search-and-rescue
support**, **fishery advisories**, **climate monitoring**".

| Mandate | What the platform does today |
| --- | --- |
| Hazard assessment | **Five Fields built for it.** The strongest part of the build |
| **Search and rescue** | **Built, and scored.** Drop a pin, integrate the analysed current forward, draw the trajectory. What makes it worth having is the second half: an Argo track *is* measured drift at the parking depth, so the same integrator was run from 195 drifting floats' own positions, over the days the current field actually covers, and the answer published - median **38 km** out over one Argo cycle, 87 km at the ninetieth percentile, across 1,908 cycles. The caveat ships in the first sentence on the panel |
| **Fishery advisories** | Chlorophyll on 52 float profiles. No product shaped like an advisory |
| Climate monitoring | **Answered.** A second Field, Temperature vs Normal, differences the 2026 analysis against NOAA's World Ocean Atlas 2023 **1991-2020** mean for each Timestep's own calendar month. Measured across 349,692 cells: mean departure -0.014 degC, 95th percentile of the magnitude 2.104 degC. The Temperature Anomaly stays beside it and still says it is a seasonal swing, which is now a pointer rather than an apology. ADR 0016 |

**One of the four named mandates is still unanswered**, and it is fishery advisories. Hazard
assessment has five Fields, climate monitoring has a thirty-year baseline, and search and rescue
- the one with zero coverage of any kind - now has a drift model with a measured score attached,
which is a different class of answer from a feature: no other build of this shape can check its
own drift model, because none of them has the observations sitting in the same file.

Fishery advisories is also the cheapest of the four - see idea A6, the thermal front, which is
already computed as the gradient channel in every Volume and simply has no button.

### 1.4 Outreach: half the problem statement, one tour

The PS gives Public Outreach & Science Communication its **own titled section**, and names five
audiences and three settings by hand:

> school and college students &middot; the general public during awareness campaigns &middot;
> policymakers &middot; outreach events &middot; exhibitions &middot; e-learning initiatives

When this section was written the build had a five-step guided tour, a landing page and a guide
panel written in plain English - **one artefact against five named audiences and three named
settings**.

**Re-scored 2026-09-04.** It is now:

| Named by the PS | What answers it |
| --- | --- |
| school and college students | **Explore**, eight questions each of which sets the whole scene up, and *what does one robot float actually do* as a narrated journey through a real track. The tour went from 5 steps to **21 in 6 chapters** and now visits all **43** explained controls, which is what a teacher or a presenting teammate needs |
| the general public | The same eight questions, plus **true scale** - the block collapsing from 1800x to 1x in nine seconds, which is the one fact about the ocean nobody feels from a sentence - and depth landmarks on the ruler |
| policymakers | Every question carries the caveat its simplification costs, on the card, beside the answer. A one-page printable brief is still not built; see D3 |
| outreach events, **exhibitions** | **`?kiosk=1`**: panels hidden, type scaled, the questions on a loop, and a reset 60 seconds after the last visitor walks away. Escape leaves. Measured by `probe-outreach.mjs`, which stands there for 22 seconds doing nothing and checks the screen moved on by itself |
| **e-learning** | **Copy this view** - the inverse of `applyDeepLink`, which had read eleven parameters since the requirements page was built and had nothing to write one. A worksheet is six links |

**Still open on this row:** the printable one-page brief (D3), Hindi on the tour and the landing
page (B6), and phones. The app has **one media query, at 1180 px** - laptops are fine and a phone
is not, and that is stated rather than papered over.

This is where competing teams will be weakest, because outreach is not the interesting
engineering. Half the ideas in Part 2 are here for that reason.

### 1.5 Things that are wrong or weak today, found while auditing

| Finding | Evidence |
| --- | --- |
| **The landing page's `collocation.jpg` shows a UI that has not existed for two rounds.** It has a palette dropdown ADR 0010 deleted, two Fields where there are now fourteen, and the pre-September Collocation panel | `web/public/images/collocation.jpg`, dated 2026-08-25 |
| Nothing on any public page states the **palette-chooser decision**, so the one clause the build deliberately declines reads as an omission | `web/requirements.html` |
| The **ML refusal** is recorded in three internal documents and on no public page | `docs/plan/02,03,04` |
| **CTD** is named in the PS's own requirement text and appears in no public artefact at all | - |
| `collocations.json` is **10.5 MB**, the largest single *file*. The largest thing on disk is `volumes/` at **46.5 MB**, then `grids/` at **7.0 MB** | Measured 2026-09-03 |

---

## Part 2: ideas

Each carries what it is, which clause it answers, what already exists, an effort **estimate**
(not a measurement), and the honesty caveat that has to ship with it.

Ordered within each group by value per hour.

### Group A: close a clause the PS names and the build does not answer

---

#### A4. A minimal OGC WCS, because the recorded reason for not having one does not hold

**The clause.** *"open standards (OGC WMS/WCS, CF Conventions for NetCDF)"*. It is the only
standard in that list not served.

**Why it should be reopened.** The recorded reason is "no maintained pure-Python WCS server". But
`api/dap.py` is a hand-written DAP2 server and `api/wms.py` is a hand-written WMS 1.3.0 - this
project's precedent is to write the protocol rather than take the dependency. And a WCS 2.0
`GetCoverage` response over a gridded subset **is a CF NetCDF file**, which `api/cf.py` already
produces. So the work is three XML documents and one route that reuses code that exists.

**Effort estimate.** 4 to 7 hours including a test that opens it with somebody else's client, the
way `test_dap.py` does with `pydap`.

**Caveat.** Ship the three operations the standard requires and say plainly that it is a minimal
profile. A partial WCS that says so is worth more than a blank row.

---

#### A5. A CTD adapter, and whatever the archive says

**The clause.** *"Co-display of Argo float, Glider profile, **CTD** and BGC data"* - CTD is in the
requirement text, and it is the only named instrument type with no artefact at all.

**What it is.** The glider move, repeated. Build the adapter against the GO-SHIP / NCEI archive,
run it against the region, and publish whatever comes back - even if what comes back is
"newest section in this box is April 2025, which is outside this bake's window".

**Why it is worth doing even if it draws nothing.** "Not built" is a bad answer to a clause named
in the requirement text. "Built, run, and here is the archive's own answer with a date on it" is
a good one. It worked for gliders and it is the cheapest credibility left.

**Effort estimate.** 4 to 6 hours.

---

#### A6. Fronts, which is the input INCOIS's own fishery advisory is built from

**The clause.** *"fishery advisories"*. INCOIS issue Potential Fishing Zone advisories three times
a week, built from **sea surface temperature and chlorophyll**.

**What it is.** A thermal-front Field: the horizontal gradient of temperature at the chosen Level.
**Every Volume already carries a gradient channel** - it is what Feature emphasis weights - so the
quantity is computed and shipped and simply has no button.

**Effort estimate.** 3 to 5 hours, most of it in the guide entry and the honesty.

**Caveat that must ship.** This is not a PFZ advisory and must never be captioned as one. It is
one of the two inputs, at 1 degree, from an analysis rather than from satellite. The sentence to
say is: *these are the fronts a PFZ advisory is built from; the advisory itself needs satellite
ocean colour this build does not carry.* Naming the gap correctly is the point - see ADR 0010 on
shipping something plausible and wrong.

---

### Group B: the outreach half, which is where the competition will be thinnest

---

#### B1. Exhibition mode

**The clause.** *"INCOIS can use the platform for outreach events, **exhibitions**, and
e-learning initiatives."* A named setting with zero coverage.

**What it is.** A URL flag that: hides the control panels, plays a story on a loop, and resets to
the start after 60 seconds of no input. Full screen, no chrome, nothing to break.

**Why it is worth an hour.** Somebody has to be able to leave this running on a screen at a stall
all day. Right now the first visitor drags a slider and every visitor after that sees a broken
view. The machinery is all store state and `Tour.tsx` already proves the pattern.

**Effort estimate.** 3 to 5 hours.

---

#### B2. True scale: the one button that teaches the ocean in ten seconds

**What it is.** A button that animates Vertical exaggeration from 1800x down to 1x, and back.

**Why.** The single hardest thing to convey about the ocean is that it is a film: this region is
about 4,000 times wider than it is deep. Every reader is told that in words and nobody feels it.
Watching the block they have been flying through collapse into a sheet is the whole lesson, and
**the control already exists** - this is a tween and a label.

**Effort estimate.** 1 to 2 hours. Probably the best ratio in this document.

---

#### B3. Depth landmarks on the ruler

**What it is.** Five labels on the existing `DepthRuler`: 5 m snorkel, 40 m the recreational dive
limit, 200 m the shelf edge, 1000 m where a sperm whale hunts, 2000 m the Argo parking depth.

**Why.** "1000 m" means nothing to a school student or a policymaker. "As deep as a sperm whale
hunts" means something to both, and it is the same number. The ruler exists; this is a table.

**Effort estimate.** 2 to 3 hours.

---

#### B4. Copy this view as a link

**The clause.** *"e-learning initiatives"*, and it also makes every other idea shareable.

**What it is.** The inverse of `applyDeepLink()`, which already exists and is already validated
against the manifest: write the current Field, Timestep, depth slice, scale and camera into the
query string, and a button that copies it.

**Why.** A teacher puts a link on a slide. A forecaster pastes one into a message. A judge sends
one to a colleague. Half of it is written; the reader half has been shipped since the
requirements page was built, and it is tested by `probe-requirements.mjs` across 14 links.

**Effort estimate.** 3 to 4 hours.

---

#### B5. Save this view as a figure

**What it is.** A PNG of the scene with the colourbar, the date, the region and the provenance
line burned into a caption strip.

**Why.** Exhibitions, reports and policy briefs all need a picture with a citation on it. Right
now a screenshot loses everything that makes the picture honest.

**Effort estimate.** 4 to 6 hours.

---

#### B6. Hindi, on the tour and the landing page only

**The clause.** *"engaging the general public"*, *"the common person"*. And INCOIS's own
precedent: SARAT ships its requests and responses **in the local language of every coastal
state**, explicitly so that fishermen can use it. Multi-language is not a nice-to-have at this
organisation; it is how they already work.

**What it is.** The tour's 21 steps and the landing page in Hindi, behind a switch. Three times
the words it was when this idea was written, which changes the estimate: the review is the cost.

**Why only those.** The guide panel carries physical claims with units, and a bad translation of
a scientific sentence is worse than an English one. The tour and the landing page are narrative,
short, and checkable by a human.

**Effort estimate.** 4 to 6 hours plus review time, and **the review is the cost, not the code**.
Do not machine-translate this and ship it unread.

---

#### B7. Three questions instead of fifteen variables

**The clause.** Gap 5, *"intuitive, rapid understanding ... for operational decision-making"*.

**What it is.** The app's first screen offers three buttons rather than a toolkit:

> Where could a cyclone strengthen? &middot; Where is the model guessing? &middot; Where did the
> ocean change?

Each is one click into a fully configured scene. `hazardPreset()` already proves the pattern for
the first one; the other two are Observation Coverage and the Anomaly Features, both built.

**Why.** Fifteen Fields is the right toolkit for a forecaster and the wrong first minute for
everybody else - which is the exact sentence already in `hazardPreset`'s docstring. This applies
it twice more.

**Effort estimate.** 3 to 4 hours.

---

### Group C: interaction ideas an oceanographer would ask for and no web tool offers

Grounding, so the claim is fair: **web 3D ocean rendering is not itself novel.** Argovis delivers
and plots Argo; EddyViz renders 3D eddies in a browser; virtual-globe volume engines exist in the
literature; ODV and JOA do all of this on the desktop. What is genuinely thin on the web is the
**join** - model and instrument in one view with the difference quantified - which is what this
project already is, and the two standard figures of the field. The first of those, the vertical
section, **is built**: draw a line and it is cut live from the native Grid, with every cast
within the corridor on the same axes. The second, C2 below, is not.

---

#### C2. Depth against time at one point

**What it is.** Click a column. Get depth on one axis, the twelve Timesteps on the other, and the
Field's value as colour: the thermocline breathing across four months at one place.

**Why.** The second standard figure, and it is the clearest possible picture of what the animation
shows you one frame at a time. Cheap from the Grid, and the API can already answer it.

**Effort estimate.** 6 to 9 hours.

---

#### C3. Three numbers under the cursor instead of one

**What it is.** Everywhere the cursor sits: the value, **INCOIS's own error estimate there**, and
**how many casts we counted there**.

**Why.** That is the project's whole thesis compressed into a tooltip - here is the number, and
here is how much to trust it, from two independent directions. All three Fields are baked and on
disk today; nothing needs computing.

**Effort estimate.** 4 to 6 hours.

---

#### C4. Close the loop from an Anomaly Feature to the cast that checked it

**What it is.** The Anomaly Feature panel reports how many Argo casts stand behind a feature.
Clicking that number should open the nearest one's Collocation. Where the count is zero - **ten of
the 121 features in this bake** - it should say plainly that nothing checked this water.

**Why.** Both ends are built and the wire between them is missing. It is the shortest path from
"the model departed" to "and here is whether anyone was there to see it".

**Effort estimate.** 3 to 4 hours.

---

#### C5. Fly a float

**What it is.** Pick a float; the camera follows its track through the season while the water
changes around it.

**Why.** It turns a dataset into a journey, which is the outreach register, while remaining
literally true - the path is measured fixes and the water is the analysis at each step.
`trackUpTo()` and `focusOn()` already exist.

**Effort estimate.** 5 to 8 hours.

---

#### C6. Measure between two points

**What it is.** Click twice: distance in km, and the difference in the Field between the two
points.

**Why.** It is the smallest possible change that turns a picture into an instrument, and it
answers "how big is that thing" - which is the first question anyone asks about a blob.

**Effort estimate.** 3 to 4 hours.

---

#### C7. Sonify a profile

**What it is.** Play the depth profile as a falling tone.

**Why.** It is memorable at an exhibition and it is genuinely the only way a blind visitor gets
the shape of a thermocline. WebAudio, no dependency.

**Effort estimate.** 3 to 5 hours. Lowest confidence in this document; include it only if the
outreach items above are already done.

---

### Group D: make the claims checkable rather than asserted

---

#### D1. Show the diff that added a Source Adapter

**The clause.** *"minimal code change"*, which is the hardest claim in the PS to prove and the
easiest to assert.

**What it is.** The requirements page carries the actual diff that added the glider adapter -
one file, one registry line, no renderer touched - as a fold-out. A judge reads forty lines and
the claim is settled.

**Effort estimate.** 2 to 3 hours.

---

#### D2. A bake health panel

**What it is.** The provenance page shows, per adapter, whether it answered at the last bake and
what it returned: 7 adapters, 7 rows, 7 dates.

**Why.** Two of the seven are non-fatal by design and one of them (NOAA OSMC) timed out on two of
three bakes last round. A build that says which of its sources answered, and when, is making a
claim about robustness that can be checked rather than believed.

**Effort estimate.** 3 to 4 hours.

---

#### D3. Put the three deliberate refusals on the requirements page

**What it is.** Three rows that currently read as gaps and should read as decisions, each with the
measurement behind it:

- **No palette chooser** - ADR 0010, and it is a clause of the PS declined on purpose.
- **No machine-learning products** - twelve analyses is not a training set, and a gap-filler
  would paint over the 9.9% of the block that is the most honest thing in the tool.
- **No geostrophic current derivation** - measured at 0.16 m/s against a real 1.5 to 2.5 m/s.

**Why.** A refusal with a number behind it reads as judgement. The same refusal left blank reads
as an oversight. All three measurements exist; none of them is on a public page.

**Effort estimate.** 2 hours. The best value in Group D.

---

## Where to start

If only three things get built: **A6 (thermal fronts)**, **B2 + D3** together as one
afternoon, and **C4 (close the loop from an Anomaly Feature to the cast that checked it)**.

A6 is the last cheap answer to a named operational mandate, and the quantity is already computed
and shipped as the gradient channel in every Volume. B2 and D3 are four hours between them and
both punch far above that. C4 is a wire between two things that are both already built.

**Built since this document was written:** A1 (drop your own NetCDF in), A2 (drift, scored
against the float tracks - ADR 0015), A3 (a real 1991-2020 climatological baseline - ADR 0016),
C1 (the vertical section, cut live from the Grid), and the basin-wide bias map from
[`02-next-features.md`](02-next-features.md).

---

# Part 3: the outreach research, and what the reference viewer actually is

Written 2026-09-04. Everything below was looked up or measured on that date. It exists because the
outreach half of PS 26067 was being answered by assertion - *"this could be used for education"* -
and an assertion is exactly what a judge pulls on.

## 3.1 INCOIS already runs the institution this is for, and it has a name

**ITCOocean** - the International Training Centre for Operational Oceanography, at INCOIS,
Hyderabad. A **UNESCO Category 2 centre**, agreed with the IOC of UNESCO at the 27th IOC Assembly
on 4 July 2013. It runs short certificate courses and international training, and its own stated
audience is:

> *"university students wishing to pursue a career in operational oceanography, the staff of
> oceanographic centres and governmental oceanographic services, coastal planners and decision
> makers who need to familiarise themselves with oceanographic data."*

That is **the PS's three audiences, in INCOIS's own words, in an institution that already
exists**. So the claim to make is not "this platform could be used for outreach". It is: *INCOIS
already runs a UNESCO training centre for exactly these people, and this runs in a browser tab in
their classroom with no install and no account.* Their focus areas are tsunami warning and
mitigation, ocean monitoring and data exchange, for the Indian Ocean rim and Africa - the same
region this platform's box covers.

**Source:** `incois.gov.in/site/itcoocean/ITCOocean.jsp`, UNESCO's own announcement, and the PIB
release for the inauguration.

## 3.2 The school hook is a named chapter, not a hope

- **NCERT Class 11 Geography, Fundamentals of Physical Geography, "Movements of Ocean Water"**
  teaches waves, tides and **ocean currents** - warm against cold, wind-driven surface flow
  against deep circulation, and the Coriolis force. That is the Currents Field and the moving
  flow, drawn.
- **NCERT Class 9 Disaster Management** and **Class 11 Indian Geography, "Natural Hazards and
  Disasters"** teach **cyclones**, and specifically that a tropical cyclone's energy is the latent
  heat released by warm moist air, and that Bay of Bengal cyclones peak in **October and
  November**. That is Cyclone Heat Potential and the barrier layer, drawn.

So the education claim can name a chapter. *"This draws Class 11 Geography chapter 13 with this
year's real data"* is a checkable sentence; *"valuable for students"* is not.

## 3.3 What already exists, so the deck does not claim a first that is not one

| Tool | What it is | Where it stops |
| --- | --- | --- |
| **Copernicus MyOcean Pro Viewer** (`data.marine.copernicus.eu/viewer/expert`) | The reference. Built for Copernicus by Lobelia Earth, free, no account to view. The whole Copernicus catalogue | **2D map with a depth slider.** No 3D and no volumetric rendering. Graphs for a point, a line and an area |
| **earth.nullschool.net** | The particle animation everybody recognises | A 2D globe, ocean currents at the **surface** only |
| **NOAA Science on a Sphere** | The exhibition standard | A physical globe in a room |
| WebGPU ocean volume rendering (Applied Sciences, Mar 2025); **i4Ocean** (transfer-function T/S volumes) | Genuine browser volume rendering of ocean scalars | Research prototypes. Not deployed tools, and **neither carries the in-situ observations** |

**The claim that survives all of that**, and the one to put in the deck:

> Depth-resolved volumetric rendering **in a browser, with the in-situ observations in the same
> water and the model scored against them**.

Not "the first 3D ocean viewer". That does not survive a judge with a search engine.

And one more, which is INCOIS's own gap rather than ours: their **Argo value-added products** -
D26, heat content, mixed layer depth, geostrophic currents - **stop on 2019-03-30**, measured
twice, on their ERDDAP and independently in their LAS catalogue. This platform computes those
quantities on a 2026 timeline.

## 3.4 What the reference viewer has that we do not

Being fair about this is worth more than the comparison above, because a judge who knows MyOcean
will notice.

| MyOcean Pro has | We have |
| --- | --- |
| Point, line and area analysis: time series, depth profile, transect with depth, area average, histogram | The Profile chart on an instrument, and the vertical section along a drawn line |
| Export to NetCDF, CSV, SVG, **PNG, GIF, MP4** | Nothing. See idea B5 |
| **Embed as an iframe**, with generated code | Deep links only |
| Several layers at once, each with its own opacity | One Field at a time |
| Projections, removable basemap, **full mobile support** | One scene, desktop-first |
| A colour-map chooser with colour-blind palettes | One palette per Field, on purpose - ADR 0010 |

The last row is the only one that is a decision rather than a gap. **The rest are real gaps**, and
the honest framing is that MyOcean is a large production service with analysis tools this does not
have, and this does the one thing it cannot.

## 3.5 The colourbar clause, re-read against that viewer

The PS asks for a *"Dynamic color bar editor (color palette, min/max range, log/linear scale),
variable selector, layer opacity controls, and vertical exaggeration slider"*. Put beside the
MyOcean Pro feature list, five of those six match a real product's feature names nearly word for
word - *"Colour palettes categories: SEQUENTIAL, DISCRETE and DIVERGING"*, *"Custom scale range
values (min and max)"*, *"Scales Range Selection: LINEAR, LOGARITHMIC"*, *"Layer Opacity"*, and
several variables of one dataset - and the sixth, vertical exaggeration, is the one you can only
have in 3D. That is not proof of intent and must not be presented as one, but it is a strong
reading: **the clause describes that settings panel, plus the control a 3D version would need.**

Where we stand, clause by clause: min/max is built and is a **superset** - ours fades water
outside the window out of the render rather than only recolouring it; log/linear is built, one
curve, offered on the three Fields where a logarithm means anything; opacity and vertical
exaggeration are built; the variable selector carries 15 Fields in 5 groups. **Only the palette
chooser is declined**, and ADR 0010 is why.

**A constrained chooser is worth considering and is not what ADR 0010 deleted.** The bug that
record fixed was *semantic mislabelling*: the old dropdown offered `algae` and `oxy`, quantities
this platform does not carry, so a user could paint temperature in the colours of a measurement
nobody took. Copernicus's own answer avoids that entirely by **grouping palettes by class** -
sequential, diverging, discrete - and adding colour-blind-safe ones. A chooser restricted to
palettes of the Field's own class, named by appearance rather than by quantity, with a
colour-blind option and a reverse toggle, closes the one clause the build declines and adds an
accessibility win that matters for the exhibition screen. The cost is in the seams rather than the
science: `liftedPalette` must stay the single source so the swatch, the sheet, the drape and the
arrows cannot disagree; `describePalette()` writes per-Field text naming the scale and would have
to follow the choice; and `probe-bias.mjs` compares marker tints against `palette.ts` and would
have to read the active palette rather than the Field's default. Half a day to a day, and ADR 0010
would need a third amendment saying exactly why this is not the thing it deleted.

**Not built this round.** It is a considered "not yet", not an oversight.

## 3.6 The timeline, measured - and why it is a design change rather than a bake flag

The obvious complaint about the moving flow is that the slider it moves along is short: **12
steps, 2026-04-10 to 2026-07-30**, against INCOIS's own archive of **813** ten-day steps back to
2004 and the Copernicus multiyear product's 1993 onward.

Measured on disk, 2026-09-04:

| | Size |
| --- | --- |
| One Volume file (one Field, one Timestep) | **0.387 MB** |
| One native Grid file | 0.194 MB |
| One current vector file | 0.387 MB |
| One hazard surface file | 0.008 MB |
| **Everything, per Timestep** | **about 4.88 MB** |
| Today, 12 steps | 58.6 MB of the 71.1 MB total |
| A year (36 steps), everything | **176 MB** |
| Three years, everything | **527 MB** |
| The whole VAM archive, everything | **about 4 GB** |

Three hard limits, none of them about taste: **GitHub Pages publishes no site over 1 GB**; the
baked data is committed, so every re-bake writes its whole size into git history and `.git` is
already 70 MB; and a bake that takes about a minute for 12 steps takes roughly an hour for 813,
every time anything changes.

**And the browser does not download 71 MB.** It fetches one file, 0.387 MB, per Field per
Timestep, only when that Field is looked at - see `loadVolumeTexture` in `web/src/data/load.ts`.
So the constraint is what gets *deployed*, not what a visitor loads, which makes "currents only,
one year" look cheap at **13.9 MB**.

**It is not cheap, and this is the finding.** `manifest.timesteps` is **one axis shared by every
Field**. The Timeline slider, `positionAt`, the Anomaly Features, the collocations and the drift
check all index it. Giving currents 36 steps while salinity has 12 means a slider position at
which selecting salinity has no file - which is either a blank Field or a silent fallback to
another date, and this project's whole posture forbids the second. So a longer current timeline
needs a **per-Field time axis**, which is a real feature with its own UI question - what does the
slider show when two Fields disagree about what exists? - and not a bake flag.

**Recommended instead, and unbuilt:** a long thin series - the basin's temperature at every Level
for all 813 analysis steps back to 2004, as a chart rather than a block. Estimated at 48 levels x
813 steps x 4 bytes that is about **0.16 MB**: twenty-two years of ocean for the size of one
photograph, on a page rather than in the Volume, and needing no per-Field axis. It comes with a
warning attached: the Temperature Anomaly Field currently means "different from these twelve
steps", and every sentence that says so would have to change if a real multi-year baseline
arrived beside it.
