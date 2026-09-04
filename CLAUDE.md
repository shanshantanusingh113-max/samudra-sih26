# Working on Samudra 3D

Browser-native 3D ocean visualisation for INCOIS. Smart India Hackathon 2026, PS 26067.
Category Software, **theme Disaster Management**, team Sigmoid. The theme changed in the
September 2026 revision of the problem statement, along with four new dataset links. Every
one of those was tested on 2026-09-01 and the results are in
[`docs/plan/04-ps-update-2026-09.md`](docs/plan/04-ps-update-2026-09.md), which is the
current work plan. **Read it before starting anything.**

**Live:** https://rak2315.github.io/samudra-sih26/ (landing), `/app.html` (the platform),
`/provenance.html` (where every figure came from) and `/requirements.html` (every clause of the
PS against what answers it, with a link that opens the app on that control)
**Repo:** https://github.com/RAK2315/samudra-sih26 - branch `main`, deploys on push

**Read [`CONTEXT.md`](CONTEXT.md) first.** It defines the domain vocabulary and the scope cut
line, and its terms - Grid, Volume, Profile, Collocation, Depth Warp, Source Adapter - are used
precisely throughout the code. Then skim [`docs/adr/`](docs/adr/): seventeen decision records, several
of which document traps that already cost hours. **0013, 0014 and 0017 are the September 2026
round**: currents became numbers and superseded 0011, five hazard Fields arrived with three new
ways of drawing a Field that is not a Volume, and the currents became *moving dots* without
becoming the volumetric streamlines this project has refused twice.

---

## What this thing is, in three sentences

It reads INCOIS's own gridded ocean analysis and the Argo float profiles measured in the same
water, renders the model as a GPU ray-marched 3D block you can fly into, and lets you click any
float to compare what it measured against what the model predicted, quantified. The demo runs
entirely from data baked into the build, so it makes zero network calls. A REST API exists for
the queries a static bundle cannot precompute.

---

## Where everything lives

### `pipeline/` - Python. Reads the data, does the science. All tested logic is here.

File-by-file map in [`pipeline/CLAUDE.md`](pipeline/CLAUDE.md), loaded when you work there.
The adapter seam is `samudra/sources/base.py`; the scientific truth is `samudra/grid.py`.

### `api/` - FastAPI. Answers what the static bundle cannot, and serves the open standards.

`api/main.py` is the REST half; `GRID_SOURCES` and `PROFILE_SOURCES` near the top are the
adapter registry. `api/standards.py` registers OPeNDAP, CF-1.8 NetCDF and OGC WMS, built on
`api/cf.py` (Grid to CF dataset), `api/dap.py` (DAP2) and `api/wms.py` (WMS 1.3.0). ADR 0012.
`api/upload.py` is the **only endpoint on the service that accepts anything**: a visitor's own
NetCDF file, as the raw body, parsed by `samudra/sources/netcdf.py` and held in memory for the
life of the process. Nothing is stored and the platform stays read-only.

**Every one of those reads the native Grid and none can reach a Volume.** This is the easiest
place in the project to break the first rule, because a consumer pulling NetCDF over the wire
cannot see that they have been handed a quantised, depth-warped picture of the data.

### `web/` - React + TypeScript + Three.js. One WebGL scene for globe and volume.

File-by-file map in [`web/CLAUDE.md`](web/CLAUDE.md), loaded when you work there.
The scene lives in `src/scene/OceanScene.ts`; every control is explained in `src/guide.ts`.

### Generated data - do not hand-edit

- `web/public/data/` - manifest, volumes (`.bin`), `surfaces/*.bin` (the hazard Fields, float32 on the Grid), `currents/vectors_*.bin` (float32 u and v on the Grid), **`grids/*.bin`** (the native float32 Grid for the three collocated Fields, which is what the vertical section is cut from), `floats.json`, `collocations.json`, **`residuals.json`** (the bias map), **`drift.json`** (the drift check), `anomalies.json`, **`tests.json`** (what the provenance page says about the test suite, written by `pipeline/scripts/collect_tests.py` rather than by the bake) and coastlines. Written by `bake.py`. 71.1 MB.
- `web/public/fonts/` and `web/public/fonts.css` - the two typefaces, served from the build. Written by `scripts/fetch_fonts.py`. Do not replace with a Google Fonts link; that is the zero-network-calls rule.
- `data/grids/` - native Grids as `.npz` for the API. Server-side only.
- `data/glider/glider_prof_index_region.txt` - the 2,876 rows of the 248 MB EGO glider index that fall inside the region, cut from the real thing on 2026-09-01 with its own header kept. Committed so the glider finding is reproducible in every bake without the download. Server-side only.

### Documents

| File | What it is |
| --- | --- |
| `CONTEXT.md` | Domain vocabulary and the scope cut line. Read first. |
| `docs/adr/00*.md` | Seventeen decision records. **0017 is the newest**: the flow drawn as moving dots, which is the drift model's own integrator and is *not* the volumetric streamlines this project still refuses. Before it, 0015 (drift that publishes its own score) and 0016 (a real 1991-2020 climatological baseline). |
| `docs/Samudra3D-Dossier.pdf` | Full project dossier including an anticipated-questions section. Regenerate with `web/render-dossier.mjs` from `scripts/dossier.html`. |
| `docs/demo/script.md` | The demo script: what to say, what to do. |
| `docs/plan/00-data-sources-verified.md` | Every endpoint tested, including the dead ones. |
| `docs/plan/01-cut-features.md` | What was cut, what is worth adding back, known rough edges. |
| `docs/plan/03-requirement-gaps.md` | Every unmet clause of PS 26067, researched with dates and row counts, and the decision taken on each. Read before proposing to add a data source. |
| `docs/plan/05-coverage-audit-and-ideas.md` | The PS audited clause by clause against what answers it, and the ideas that close what does not. Names the three operational mandates the PS lists and the build does not answer, and the outreach section it answers with one tour. |
| `ppt/README.md` | **The deck folder's index**: what is in it, the order to use it, and the two commands that regenerate its pictures and its figures. |
| `ppt/DESIGN-SPEC.md` | How the SIH deck and every picture in it must look. Written so an AI can build the deck from it alone. |
| `ppt/DECK.md` | The exact words for each of the six slides, where each image goes, and a generation prompt for every diagram. |
| `ppt/FACTS.md` | **Generated.** Every figure the deck may quote, read off the bake by `pipeline/scripts/collect_facts.py`. `DECK.md` has warned "do not adjust a number by arithmetic" for three rounds; this is what that warning points at. |
| `assets/screenshots/{light,dark}/` | **The one copy of every screenshot**, named by what it shows. `docs/images/`, `web/public/images/` and `ppt/images/` are outputs, filled by `cd web && node capture.mjs --publish-only --publish`. |
| `design/STITCH.md` | Per-screen prompts for Google Stitch. |

---

## Commands

```bash
# tests - run before claiming anything works
cd pipeline && ../.venv/Scripts/python -m pytest -q

# what the provenance page says about the tests. Run it after adding or removing any.
cd pipeline && ../.venv/Scripts/python scripts/collect_tests.py

# typecheck and build
cd web && npm run typecheck && npx vite build

# refresh the data from INCOIS and Argo (about a minute)
cd pipeline && ../.venv/Scripts/python -m samudra.bake

# run
cd web && npm run dev                                     # http://localhost:5173
.venv/Scripts/python -m uvicorn api.main:app --port 8000  # the REST API

# regenerate artefacts
cd web && node render-diagrams.mjs      # PPT diagrams from scripts/ppt_diagrams.html
cd web && node render-dossier.mjs       # the dossier PDF
cd web && node capture.mjs --theme light --publish  # screenshots: shoot, encode as JPEG, copy into the docs
cd web && node probe-hazard.mjs         # measures the sheet, the drape and the arrows
cd web && node probe-guide.mjs          # every control has an entry, every figure in one is live
cd web && node probe-controls.mjs       # every Field against its log and isosurface controls
cd web && node probe-bias.mjs           # the bias map: every marker's tint against palette.ts
cd web && node probe-drift.mjs          # the browser's drift integrator against the pipeline's
cd web && node probe-particles.mjs      # the moving flow: it is the drift model, it draws, no dot on land
cd web && node probe-tour.mjs           # "Show me around" visits every control, and survives
cd web && node probe-outreach.mjs       # every Explore question keeps its promise; kiosk; the copied link
cd web && node probe-landing.mjs        # the landing page: no missing picture, an honest count, a readable hero
cd web && node probe-section.mjs        # the browser's section against /api/section   (needs the API)
cd web && node probe-upload.mjs         # drop a NetCDF in, and refuse one              (needs the API)
```

Deployment is automatic: push to `main` and the GitHub Actions workflow builds and publishes.

---

## Rules that matter here

**A publish is a total, silent overwrite, so the map decides the theme and not the operator.**
`capture.mjs --publish --target site` with a *light* `shots/` directory replaced thirteen dark
pictures with thirteen light ones in under a second, on a landing page that is dark by default,
and printed thirteen cheerful `published` lines while it did it. It was recoverable only because
`web/dist/images/` still held the previous build's copy of `public/` - luck, not design, and the
six tracked files in git were from an August commit rather than the round being worked on.
So `WANTS_THEME` now names what each document's pictures are supposed to be - `docs` and `ppt`
light, `site` dark - the run stamps `shots/.theme` **before its first shot**, and a mismatch is
refused per file rather than warned about. The rule needed a **per-entry override** almost
immediately: the exhibition screen is dark in all three documents, so a light `--target ppt`
run passed the per-document check and quietly replaced it. **Two entries writing one file is the
same failure one level up** - `08-coverage` and `handpicked/coverage` both named
`web/public/images/coverage.jpg`, and the winner was whichever came later in the list.

**There is one home for every screenshot, and the three image folders are outputs.**
`assets/screenshots/light/` and `assets/screenshots/dark/` hold one copy of each picture, named
by what it *shows* - `collocation`, `hazard`, `bias` - not by which document uses it, because the
same frame is `hero.jpg` in the README, `volume.jpg` on the landing page and `S2-app.jpg` in the
deck. `docs/images/`, `web/public/images/` and `ppt/images/` are filled from there by
`node capture.mjs --publish-only --publish`, which opens no browser and takes about a second.
Four folders holding overlapping near-copies in two themes is how a project stops being able to
say which picture is current, and that lasted a round here: one of the sets was from August and
nothing pointed it out.

**`web/shots/` is scratch and a capture may not promote itself.** The next run overwrites
`shots/` wholesale, so nothing may reference it. `--ingest` is what copies a shot into
`assets/screenshots/`, it is **opt-in**, and it refuses to overwrite anything in `HANDPICKED`
without `--force` - because the harness shoots one camera angle per state and cannot tell that
its own flow shot has no Somali Current in it. Seventeen of the nineteen light pictures were
grabbed from a real browser for exactly that reason. `scripts/normalise_screenshot.py` crops a
grab to 16:9 and resizes it to the harness's own 1600x900 at quality 82 - **crop and resize
only**, because `ppt/DESIGN-SPEC.md` section 8 is explicit that a screenshot is the deck's proof
and may not be retouched. `--no-crop` exists for one real case: a frame wider than 16:9 whose
subject is on the right, where cropping left keeps the panel and throws the subject away.

**A publish map with a hole in it is invisible everywhere except on the page.** `PUBLISH_MAP` in
`capture.mjs` sent `07-anomaly` into `docs/images/` and not into `web/public/images/`, and two
cards on the landing page asked for `./images/anomaly.jpg` and got alt text over an empty panel.
Nothing could catch it: no build compiles HTML against the files it names, no typecheck sees an
`<img src>`, and every other probe drives `app.html`. `probe-landing.mjs` now checks both copies
- the file in `web/public/images/`, which is what a publish writes, and a non-zero `naturalWidth`
in the browser for what the preview serves out of `web/dist/`, because a publish that never made
it into a build fails only the second. It also fails on an external request, on a heading whose
number word disagrees with the number of cards under it, and on hero type that drops under 3:1
against the ground actually under it.

**The hero is a dark band in both themes, and it carries its own colours to be one.** The
photograph stays the same dark render on light, deliberately - a light capture of ray-marched
water is a worse picture. The *type* followed the page, so on light `--ink` is `#0d1b22` and
"Fly into the" was near-black over the darkest part of the image. Measured against the rendered
ground beneath it: the headline was **3.66:1** at 1600 px and **3.97:1** at 1280, and the cyan
"Indian Ocean." was **1.27:1**, which is no contrast at all. Neither scrim could fix it, because
the problem was the ink and not the ground. `.hero` re-declares the dark palette for everything
inside it and keeps its scrim dark to its own bottom edge - it used to fade to `var(--deep)`,
which on light is nearly white and would have put light ink and dark tiles on a pale ground.
Measured after: headline **6.49** and **6.15**, accent **3.46** and **3.50**, and **light and
dark now agree to two decimal places at both widths**, which is the check that the band is one
band. `probe-landing.mjs` fails if they ever separate.

**Four variables that are all "a depth to do with warm water" have to say why you would open
this one.** Cyclone Heat Potential, Depth of 26 degC, Mixed Layer Depth, Isothermal Layer Depth
and Barrier Layer Thickness read one after another in the same panel, and every entry opened with
its own definition and none with its neighbour. They are one chain - how much fuel there is, how
far down it reaches, how far the wind has stirred, that same boundary measured with a thermometer
instead, and the gap between the last two - so **the first bullet of each now names its neighbour
and says what it asks instead**. Nothing measured was cut to make room: barrier layer's level
spacing moved from `means` into `look`, which is where a limitation of the picture belongs.
Measured by `probe-guide.mjs`: median **113 words** on the panel, unmoved; longest 150; no list
over 4 bullets; longest bullet 20 words against a limit of 24.

**A surface asserts a position; haze does not, and they cannot share a coverage floor.** The ray
marcher draws water wherever coverage is above 0.02, which is right for the haze: it fades, and
nobody reads a position off it. The isosurface used the same floor, and an isosurface says "the
value is exactly this, **here**" - so near the coast it kept drawing for almost a full cell past
the real shoreline, out of the neighbouring cell's back-filled value. That is what put sheets
over India and Sri Lanka. It now needs `coverage > 0.6`, ramped to 0.9 so the cut is not a second
staircase. Measured: **16.5% of ocean voxels touch land horizontally**, which is the shell this
acts in; on screen the surface went from **23.20%** of the frame to **22.86%**, and an extreme
floor of 0.97 only reaches 22.60% - so the whole borrowed-value fringe is about 0.6 points of the
frame. **Small in area, conspicuous in position**, which is why area was the wrong thing to
optimise and the coastline was the right thing to look at.

**Kiosk mode is not a CSS state, so nothing may borrow it for a screenshot.** `capture.mjs` hid
the panels for its hero shot by turning kiosk on, which also mounts the component that plays the
eight Explore questions on a loop - so the hero came back as the *currents*, with a drift pin in
it, because two questions had run while the frame was being taken. Bare shots inject a
stylesheet and touch nothing else.

**No backticks inside a GLSL template literal.** A comment written with `pipeline/samudra/
volume.py` in backticks ended the string, and TypeScript reported it as a missing comma two lines
later. The shaders are template literals; markdown habits do not survive in them.

**A mark drawn on top of a field coloured by the same number is invisible, and that is
structural rather than aesthetic.** The current trails took their colour from the palette, like
the arrows - and they sit directly on water coloured by the same speed through the same palette,
so over slow water a pale dot lands on pale water and has zero contrast against exactly the
background it is drawn on. Most of the basin, on both themes. The trails are **inked** now, one
colour per theme, and carry direction only; speed is still carried by the water underneath, by
how far a dot travels per frame, and by the number under the cursor. This is the **one** mark in
the platform not coloured by its own value, so it is the one place the legend has to say so - the
map key names the trails as flow and the water as speed. Measured: the layer went from **1.33%**
of the frame to **1.83%**. The Transfer Function window still drops a dot outside it rather than
inking it, so narrowing the range stays analytical.

**That share is a range and it was written down as a point.** `particles.ts` seeds its 2,400
dots with `Math.random()`, so where they happen to be when a probe takes its frame is not the
same twice - measured **1.83%** on 2026-09-04 and **2.47%** on a re-run the same evening, on an
unchanged build. `probe-particles.mjs` was always right about this: it asserts a *floor* and that
the layer beats its own hidden baseline threefold, not an exact figure. Anything quoting the
share has to quote both ends, and **the pre-ink 1.33% is one sample of the old layer against one
sample of the new one**, so it sizes the change loosely and not to two decimal places. If a
precise figure is ever needed, seed the population deterministically for the probe rather than
re-running until a number looks familiar.

**A Field can be two render kinds at once, and `render` names only one of them.** Current Speed
declares `render: "vector"` and *also* carries a Volume, and `OceanScene` hides the volume mesh
only for a sheet or a drape - so the currents drew a block of water while `Controls.tsx` hid Water
opacity, Ray steps and Show volume, all three gated on `render === "volume"`. A reader was shown a
layer with no control over it, which is the "hiding a control is not turning it off" rule running
the other way: the *thing* stayed on while its control was hidden. **A panel predicate about what
is drawn has to be the scene's predicate**, and the scene's is `isSurfaceField` - not a sheet, not
a drape.

**A pretty layer gets the measured integrator, not a cheap one.** The current flow is a few
thousand dots carried by the field, and nobody reads a number off it - which is exactly the
argument that would have given it its own advection code. It runs `midpointStep` and `sample` in
`drift.ts` instead, the two functions the scored drift model runs on, and `integrateDrift` was
refactored onto the same step in the same change so there is one copy and not two. Measured by
`probe-particles.mjs`: a particle and a drift pin from the same start point over the same elapsed
ocean time end **0.002 km apart after 724 km of travel**. That equivalence is the entire claim -
an animation whose error is published, median 38.5 km over an Argo cycle - and an unchecked claim
is decoration. ADR 0017.

**A dot on a Level is not a streamline through the block, and the difference is `w`.**
`CONTEXT.md` and `README.md` both said particle advection was "a project in itself", which was
true of the three-dimensional version and read as a refusal of both. Copernicus publish `uo` and
`vo` and no vertical velocity, and INCOIS publish neither, so a 3-D particle claims a motion
nobody measured. A sheet of dots on the chosen Level claims nothing beyond the two components
that exist. **And do not bake a finer field to make it prettier**: 1/12 degree over this region is
about 2.2 MB a Timestep and would be affordable, and it would make the picture finer than every
number the platform reports.

**Changing a default silently retires the probe that measured the old one.** The current layer's
default became moving dots, and `probe-hazard.mjs` went on printing `arrowVertices: 0` and a
`share` of 3.33% that was the animation moving between its two frames rather than the arrows being
drawn. It passed, because it printed those numbers and asserted on neither. It now sets
`currentStyle: "arrows"` before measuring arrows, hides **both** styles for the off-frame, and
fails on a vector Field that builds no arrow geometry. Correctly paired the arrows are **0.59%**
of the frame, which is the figure this file has quoted all along.

**"Show me around" walks every control, and that is a measurement.** It was five steps against 43
explained controls - a demo, not a tour, and the four the user's teammates would present from were
among the 38 it never visited. It is 21 steps in 6 chapters now, and every step declares the
`GUIDE` keys it puts on screen. `probe-tour.mjs` fails if any entry in `GUIDE` is not named by
some step, if a step ends the tour, or if a step changes nothing the scene reads. **Add a control,
give it a guide entry as the rules already require, and the probe tells you the tour has stopped
being complete.**

**A step that presses a control on the user's behalf has to put the tour back.** `set("touched")`
and `hazardPreset()` both null `tourStep`, correctly, because a *user* pressing them means "stop
showing me things". The tour's own effect re-asserts the index after every step for exactly that
reason. This is why every step drives `setState` directly and never `set`.

**The outreach half lives behind one door, and the console gains nothing.** Six scattered buttons
would have been the easy version and it would have left the product with no front door at all.
`Explore` is one full-screen surface holding all eight questions, the float journey, the coverage
view and true scale; `?kiosk=1` is the same list with the panels hidden, the type scaled and a
reset a minute after the last visitor walks away. **The left panel gained zero groups.**

**Every simplified question carries its caveat, beside it and never after it.** "Where could a
cyclone get stronger" is a map of conditions and not a forecast, and the reader this door exists
for is exactly the reader who will not make that distinction unprompted. `probe-outreach.mjs`
fails if one of the five questions that simplify a limit away has no `caution`, and it checks each
question against what its own card promised rather than against "it did something".

**`getBoundingClientRect()` on a `display: none` element returns zeros, and zero is a number.**
The depth ruler places its figures beside the control panel by measuring it. In kiosk mode the
panel is hidden, so the measurement succeeded, returned 0, and every landmark ran off the left
edge of the exhibition screen. Presence is not the question; width is.

**`scrollbar-gutter: stable` is asymmetric by definition.** It reserves the track on the scrolling
edge only, so the panel's contents sat 1 px from its left edge and 11 px from its right,
permanently, on the panel a judge looks at first. `both-edges` fixes it and - measured at
1366x768, both ways, three open sets - **costs no height at all**: 408 px closed, 527 px with
Variable open, 722 px with Variable and Colourbar, identical under either value. What it costs is
11 px of content width, which nothing in the panel needed.

**Two modules are deliberately implemented twice, and both copies are measured against each
other.** The standing rule is one curve in one file - `transfer.ts` exists because a second copy
of the Scale silently disagreed with the first. Drift and the vertical section break it once
each, because both are interactive and both have to run where the user is: the demo runs with
the API off and the static deployment at `rak2315.github.io` has no API at all, so an API-only
version would be dead on stage and dead on the link a judge opens. The rule is kept the only way
that survives: `web/probe-drift.mjs` and `web/probe-section.mjs` run the **shipped browser
modules** against the pipeline's and fail on disagreement. Measured - drift, median 0.331 km and
worst 1.573 km over 101 days; section, 1,102 values with a worst gap of 5.07e-5 degC. Do not add
a third without the same harness.

**A deleted CSS class is a silent regression, because nothing compiles CSS against its markup.**
`GuidePanel` moved from three prose blocks to bullets a round ago and `.guide-body` went with
them - but `AnomalyPanel.tsx` still uses the class, so the Anomaly Feature panel quietly reverted
to a browser-default definition list: label flush left, value indented under it, no rule, no
spacing. No error, no missing element, nothing a typecheck or a probe was looking at. When a
class is removed, grep the whole of `src/` for it before deleting the rules.

**A figure on the guide panel comes from the bake, never from the sentence around it.**
An entry writes `{token}` and `guideFigures()` fills it from the manifest; a token with nothing
behind it takes its whole bullet off the panel, because a sentence that cannot be completed
truthfully is better absent than approximate. Four figures were typed in by hand and every one
moves on a re-bake - the anomaly-feature counts had been stale since August and nothing could
notice, because a wrong number and a right number are the same shape. `probe-guide.mjs` fails on
an unfilled token reaching the screen, and on a control with no entry at all: it found three,
which is the rule two paragraphs down being broken silently for a round.

**INCOIS assimilate Argo, so a float's residual is largely the model agreeing with itself.**
The nine moored buoys are the only instruments in this bake their analysis did not ingest, and
measured they disagree 4.5x more on temperature - 0.748 degC against 0.167 - 4.9x on salinity and
6.4x on density. Pooled into one basin-wide number the nine of them vanish into 221 floats and
the headline becomes a statement about self-consistency. `residuals.field_bias` takes a `kind`
and the panel prints both. Any new sentence about "how far the model sits from the observations"
has to say which observations.

**A score may only be measured on the days the data covers.** `CurrentSeries._bracket_time`
holds the first analysis rather than extrapolating before it, which is right for drawing a line
and silent inside a number. Measured: the earliest Fix was 2026-03-22 against a first analysis of
2026-04-10, and 199 of 202 baked drift comparisons started inside that 19-day hole.
`CurrentSeries.covers` refuses them - the same refusal `choose_cast` and the Float markers
already make - and the score moved from 39 km to 38 km over one cycle, on 195 floats rather than
202. **Anything drawn is separate from anything scored**, and the browser's integrator is
unchanged: a dropped pin always starts inside the window.

**A cast drawn on a figure is an observation of the water in that figure, or it is a lie.**
The vertical section took every fix of every float in the corridor with no time filter at all:
measured on a line from 80 E, 5 N to 90 E, 20 N at the last Timestep, 127 casts drawn and 98 of
them from March to June, under a caption saying "casts within 150 km of the line". It now uses
the bake's own coverage window, which is the rule `floatTime.positionAt` already enforces for the
markers - 8 casts on that line, all from July.

**A corridor is measured against the line that is drawn, and the line drawn is a great circle.**
`casts_near_line` projected onto a straight line in degrees scaled by the cosine of the mean
latitude, which is right at the middle of a section and wrong at both ends, and is a rhumb line
rather than the great circle `section_along` samples. Measured against a numeric minimisation
over 20,001 points of the drawn line, on 45 E 10 S to 100 E 25 N: the reported offset was out by
up to **179 km** against a corridor 150 km wide. Both copies now use the spherical cross-track
and along-track pair, which has no length at which it stops being right.

**A masked corner refuses a Level, not a column.** `Grid.column_at` makes one Level missing when
one of its four corners is; the browser's first section refused the **whole column** instead, so
every place where the sea floor cuts in blanked the good water above it - 142 of 1,464 cells in
one Bay of Bengal cut, all of them water the model has. The values were correct to 5e-5 the
whole time, which is exactly why "the numbers match" is not the same question as "the picture is
right".

**Never answer a scientific question from the `Volume`.** It is quantised to bytes,
depth-warped and back-filled across land for the GPU's benefit. Collocations, tooltips, API
responses and anything a user reads as a measurement come from the `Grid`. This is why
`data/grids/` exists.

**Do not re-derive the Depth Warp.** The pipeline ships the sampled axis in the manifest
(`depthAxisMetres`) and the frontend inverts it via `geography.ts`. A second copy of the formula
drifts silently. This has already been fixed once.

**A frame pair must differ by exactly one thing, and a store change is never that thing.**
`updateArrows` and `updateSheet` set their mesh's `visible` back to true on every `push(state)`,
so a probe that changes the store between the "geometry on" frame and the "geometry off" frame
gets two identical frames and reports that the Field draws nothing. It happened: the current
arrows were measured as hidden under the water at 0.007% of the frame, and correctly paired they
are 0.54% with the water on against 0.59% with it off - not hidden at all. The render loop is
continuous, so moving `visible` alone is enough. **And never diff PNG bytes for a magnitude**:
compressed bytes shift wholesale from a handful of changed pixels, which is why the same frames
read as "99.4% different" and as "0.5% different" depending only on which was counted.

**Verify rendering by measuring, not by looking.** The worst bugs here all looked like shader
bugs and were not: invisible deep water, a "thin sliver" volume, a half-cell field offset,
frozen floats. `OceanScene.debug()` reports the real transform, uniforms and projected screen
extent. `window.__scene` and `window.__store` are exposed for this. Screenshot with
`web/capture.mjs`; measure pixel extents in Python when the eye is not enough.

**Transparent draw order is explicit.** See ADR 0006. Three.js sorts by centroid, meaningless
for world-spanning geometry. Anything new and transparent needs a `renderOrder` from the `ORDER`
table in `OceanScene.ts`.

**The demo path makes zero network calls.** Everything the browser needs is in
`web/public/data` and `web/public/fonts`. Keep it that way; a dead venue network must not be
able to kill a demo. This was quietly false for a while - all three pages linked Google Fonts,
about 63 KB over three requests - while the README carried a badge saying otherwise.

**If you add a control, add its guide entry.** An unexplained control is worse than no control.
`src/guide.ts` is the single place. A Field with a `GUIDE` entry under its own key explains
itself when clicked; the rest fall back to the entry for the selector.

**The left panel says what and how much. The guide panel says why, in points.** Both used to do
both and neither well: the panel carried a paragraph restating what the guide already said, and
the guide answered in three prose blocks of 40 to 70 words that nobody reads while a demo is
running. A `GuideEntry` is now one sentence of definition plus `means` and `look` as **bullets,
max 4, max 2 lines each** - about 70 words against 170. **Every number keeps its unit and
survives; only words get cut.** A sentence on the left that explains rather than reports belongs
on the right, and a figure on the right that is already a readout on the left belongs on the
left.

**Colour last. Bilinear on the values, never on the colours.** The Sheet and the Drape sit on a
56 x 36 Grid - about 110 km a cell - and read as tiling under a full-resolution coastline.
`src/surface.ts` upsamples the lattice 4x *before* anything is coloured, because halfway between
two ends of a diverging palette is its pale midpoint: blurring colours across a warm patch and a
cool one would draw a band of water that did not change between two bodies that did. The same
pass returns a coverage fraction, which is the alpha ramp that turned the coast from a dropped
quad into a fade. What is deliberately **not** smoothed is the interior: the 26 degC crossing
jumps between Levels and that quantisation is in the data, which `hazard.py` documents as the
limitation to state rather than hide.

**A blob a viewer cannot isolate is a blob they cannot read.** Every sentence on the Anomaly
Feature panel is measured over one box of water, and until "Show only this body of water" existed
that box could not be seen: a coloured patch inside a solid block says *that* water departed and
nothing about where it starts, how deep it runs, or whether it is one body or three. Two things
the clip alone did not solve, both measured: the remaining body needs about four times the
opacity, because the ray no longer accumulates anything on its way through; and the view has to
**pan** onto it, not zoom - `focusOn`'s fixed radius is right for a Float and collapses the block
frame to a diagonal for a body five degrees across.

**The Volume texture's v axis is referenced to the SOUTH edge.** `toTexture` computes
`(uBoxMax.z - p.z) / span.z` and world z is *minus* latitude, so that expands to
`(lat - south) / (north - south)`: v = 0 is the southern edge, not the northern one. Anything
building a box in texture coordinates - `applyFocus` is the only one so far - must match. Written
north-referenced it mirrors the box about the region's centre line and gives no error at all:
the isolation clip showed -5.0N to 4.0N for a feature at 12.5N to 20.5N, about 1800 km from the
ring pointing at it. Measure a clip by projecting the feature's own corners and diffing the
rendered frame against a volume-off frame; `web/probe-isolate.mjs` does exactly that.

**A chart's depth axis is trimmed to the instrument, so everything drawn must be trimmed too.**
The Profile chart stops at the depth the Float or buoy actually reached, which is right - a buoy
whose deepest sensor is 180 m should not be squashed into the top of a 2000 m axis. The model has
values far below that, and drawing them puts the model curve outside the frame. Below the last
measurement there is nothing to compare against anyway, and comparing is the only thing the chart
is for. Extending the axis instead was tried and rejected: it drops the measured part of the
worst case from 69% of the plot to 30%.

**A marker points at the thing, not at its extreme.** An Anomaly Feature's marker and every
fact its panel reports come from the cell nearest the body's centre, never the peak cell. Placed
at the peak the ring sat a median 222 km from its own feature and 1063 km at worst, describing
water at the other end of it. `peak_value` is still reported, and labelled "at its strongest".

**Anything whose meaning changes with the Field must be built per Field, not written once.**
`describePalette()` and `describeIsosurface()` in `src/guide.ts` exist for this. A surface of
constant value is an isotherm, an isohaline or an isopycnal depending on what it cuts, and one
static entry written for temperature explained cyclone fuel to someone looking at density. The
same trap caught the Collocation verdict, which told users the model read "cooler than" the
float for a density field.

**A Field with no render hint gets the default, not the last Field's.** `selectField()` in
`store.ts` applies `emphasis` and `opacity` from the `FieldSpec` where one is given and from
`DEFAULT_EMPHASIS` / `DEFAULT_OPACITY` where it is not. It used to change nothing when a Field
declared nothing, so the hints leaked forwards: visiting Observation Coverage once left
Temperature with the gradient weighting switched off, which turns the thermocline into an
invisible band under an opaque warm lid while the guide panel still tells the reader to look
for it.

**A log scale needs a real zero and a gradient to bend, and neither was being checked.**
`supportsLog` asked only whether the range went below zero, so the toggle appeared on 11 of the
14 Fields and meant something on 3 - there are 15 Fields now, and the rule is what decides, not the count. Two separate failures came out of that. On **Observation
Coverage** the palette is four flat bands whose edges sit at whole cast counts, and bending the
position along a palette moves every edge while the key beside it cannot move: measured, every
cell with **1, 2 or 3 casts painted as "4 or more casts"**, under a legend still saying
otherwise. On **Temperature** the curve is applied to the *window fraction*, so "log" gave half
the palette to the coldest water in a range starting at 2.60 degC - a logarithm of nothing. The
rule now is all three of: range starts at zero (within 5% of its span), the palette is not
banded, and the range never goes negative. That leaves heat potential, current speed and INCOIS's
error estimate. Anything encoding the same quantity twice must go through the curve too - the
current **arrows' length** did not, so under Log one arrow was short and dark at once.

**An isosurface through a diverging Field is two surfaces, not one.** `sampled.r - uIsoValue` is
a single signed crossing, so a contour of departure at +0.3 degC enclosed the water that warmed
and drew **nothing at all** for water that had cooled by two degrees - measured at 5.6% of the
frame simply absent, with nothing on screen admitting it. The mirror value is `1 - uIsoValue` in
the encoded range, each skin takes its colour from its own end of the palette, and the panel says
`±`. That also settles a second confusion: a reader seeing cream and dark brown was seeing **one**
value under a hard light, and the ambient floor is now 0.62 rather than 0.35.

**A derived surface may not enclose water this platform refuses to call a departure.** The
anomaly isosurface defaulted to 0.27 degC while `find_anomaly_features()` demands 0.5 degC *and*
two standard deviations before it will mark a body at all - so the default surface drew the
thermocline's ordinary seasonal breathing as a block full of blobs. The contour's floor is the
detector's own threshold, read from the manifest, so the surface and the rings agree.

**`openGroups[id] ?? true` means "absent is open", which is the opposite of what a collapsed
panel is for.** The map started complete, so the fallback never fired and nobody noticed. The
moment the panel was made an accordion, replacing the whole map with a single key, every
untouched group's entry became `undefined` and sprang open behind the one just opened. A group
is open when its entry is `=== true`. The accordion itself is gone - the user wanted groups
open together - so `toggleGroup` and `selectField` both **merge** into the previous map rather
than replacing it, and the map is kept complete. What actually fixed the fold was the tab strip,
not the accordion, and that stays.

**The fold figures in this paragraph were stale and are now re-measured, and one of them has
stopped being true.** At 1366x768 the panel starts 74 px down and has **678 px**; measured as
`scrollHeight`, all groups closed is **408 px**, Variable alone **527 px**, Variable and
Colourbar together **722 px**, and every group open is **2,664 px**. So two groups open now
scrolls, where the old figures said it fitted. That is the panel having grown since - it is not
the scrollbar gutter, which was measured both ways and costs no height at all.

**Hiding a control is not turning it off, and `selectField` is the only place that can.** The
same leak, one field along: `isoEnabled` was not reset, so switching from Temperature with the
isosurface on to Observation Coverage, INCOIS Cast Count or Current Speed left the shader
drawing slabs and vertical columns with **no control on screen to turn them off** - those Fields
declare `isosurface: false`, which correctly hides the checkbox and did nothing else. Anything a
`FieldSpec` can forbid must be reset by `selectField` when it forbids it, not merely hidden by
the panel. `pipeline/tests/test_field_specs.py` holds which Fields may offer one and why.

**An instrument is not always an Argo float, and a number about them is not always 221.**
There are Floats and there are moorings, `reportingByKind()` splits them, and the count on
screen is the count *drawn at the Timestep on screen* - measured across the twelve steps, 192 to
220 Floats and 5 to 9 buoys, against a bake of 228 and 9. Anything that says "Argo floats" and
means "instruments" is wrong twice.

**Not every Field is a Volume, and drawing one as a Volume is drawing the wrong thing.**
ADR 0014. `FieldSpec.render` says which of four kinds a Field is. Three of the hazard Fields *are
a depth*, so they are drawn as a sheet sitting at that depth inside the block; two are a total for
the whole column, so they are draped on the sea surface; currents are arrows. The Volume mesh is
**hidden** for all of them - it still holds the last Field's texture, and leaving it visible puts
one Field's data on screen under another Field's name, which is the worst failure available here.

**A Field that is not a Volume ships as float32 on the Grid, and that is the first rule, not an
optimisation.** A reader reads *metres* off a depth sheet and kJ/cm2 off a drape. Byte-quantising
and depth-warping them would look identical on screen and would be answering a scientific
question from a rendering artefact, in the one place nobody would ever check. 8 KB a file.

**The scale has exactly one curve, in `web/src/transfer.ts`.** A TypeScript function and the
identical GLSL as a string, inlined by the ray marcher. The log scale was cut once because the
shader bent the water while the colourbar stayed straight - that was a bug, and a second copy is
what caused it. Anything that colours a value goes through `transfer()`; nothing reimplements it.
The same rule sends `colourOf` and `surfacePixels` in `palette.ts` through `liftedPalette`, so
the sheet, the drape and the swatch cannot disagree. ADR 0010, amended.

**Currents are numbers now, and every sentence that said otherwise had to move.** ADR 0013
supersedes 0011. They are a Field with a palette, an entry in the Variable selector, arrows on
the chosen depth and a real speed under the cursor read from the Grid. The old rule said a
tooltip with a speed in it meant something had gone wrong; the opposite is now true. The one
thing that must stay said out loud is the cost: **no account to view or use the platform, one
free Copernicus account to rebuild its data**, and the credential never leaves the bake machine.

**`flat` is a reserved word in GLSL, and the error points at the wrong line.** It is an
interpolation qualifier, so `vec3 flat = ...` fails to compile and the message names the line
*after* the declaration. Both new vertex shaders had it, both silently failed, and the geometry
was perfectly correct the whole time - so nothing looked wrong except that nothing was drawn.
`web/probe-hazard.mjs` caught it by diffing a frame against the same frame with the mesh hidden,
which is the method this project's history keeps proving is the only one that works.

**A mode is not a Field button.** "Set up a cyclone question" changes the Field, the Timestep,
the render hints and the anomaly rings in one press, and it lived inside the Variable group -
which meant it rendered under Ocean state, under Circulation and under Change, a cyclone shortcut
sitting beneath Salinity. It is a **mode** above the group now, Hazard is what the mode contains
rather than the fourth of five tabs, and `selectField` sets `hazardMode` from the Field's own
group so the two cannot disagree however the Field was chosen - a tab, a deep link, the tour or
the preset itself.

**A palette belongs to a Field, never to a chooser.** There used to be a dropdown of nine, seven
of which named quantities the platform does not carry. The derivable ones became Fields and the
rest were deleted. If a new palette is needed, it arrives attached to a `FieldSpec` and to
nothing else. ADR 0010.

**Never ship a derived Field that is plausible and wrong.** Geostrophic current speed was
prototyped and rejected: it reported 0.16 m/s for the Somali Current in peak monsoon against a
real 1.5-2.5 m/s, and put the fastest water in the block on the equator, where geostrophy does
not hold. Finite and physical-looking is not the bar. ADR 0010 carries the numbers.

**Both themes are real, and the scene is part of the theme.** Chrome responds to `data-theme`
in CSS, but the globe, coastlines, markers and box frame are drawn by us in WebGL and swap via
`OceanScene.setTheme()`. The palette lift is theme-aware too (identity on light, where cmocean
was designed to live), and the colourbar and the water read the same value so ADR 0007 still
holds. All three pages share one `localStorage` key.

**Anything drawn on screen needs to be named.** Floats and tracks were drawn for days with
nothing saying what they were. `src/ui/MapKey.tsx` is where that lives.

---

## Testing

TDD applies to the science: depth warp, volume encoding, grid interpolation, collocation, the
Argo parser, the glider index parser, the adapter seam, and every derived Field - including the
five hazard ones, each of which is held to a hand-computable case because a wrong constant there
produces a number that is finite, smooth and completely believable. Not to glue, UI or shaders. It also
applies to anything we *serve* - the DAP2 and WMS endpoints are science leaving the building,
and `test_dap.py` checks them by opening them with a real `pydap` client rather than by
asserting on our own bytes. 377 tests currently, and `pipeline/scripts/collect_tests.py`
writes what `provenance.html` says about them - so the public page cannot claim a suite that no
longer exists, which it did for a month: 11 modules, 123 tests, "67 passed", against 377 in 25.

When a test and the code disagree, work out which is wrong before changing either. Three times
the *test's* expectation was the wrong one: gravity-corrected depth, a fixture too small for the
minimum-points filter, and a coverage test that asserted the very artefact it should have caught
(`test_a_coarsely_sampled_cast_leaves_the_thin_surface_slabs_empty`, which called a bug
"honest, not a bug" in its own docstring).

Fixtures have been too small twice now. If a test clips a percentile, count how much of the
fixture the outliers are before believing the assertion.

## Style

Simple, boring code; the obvious solution over the clever one. No abstraction until something is
needed twice. Comments explain *why*, especially where the obvious approach was rejected for a
real reason. **No em dashes** anywhere - plain hyphens only.

## Known upstream quirks

- **INCOIS ERDDAP sends an incomplete certificate chain.** Browsers and curl hide it, Python
  does not. `pipeline/samudra/tls.py` supplies the missing intermediate.
- **`tds.hycom.org` and `coastwatch.pfeg.noaa.gov` are unreachable from this network.** Do not
  retry; see `docs/plan/00-data-sources-verified.md`.
- **Real Argo floats fail, and quality control is two layers.** Argo's own `_qc` flags are
  fetched beside every value and 3/4/9 are refused per channel; on top of that a regional
  salinity floor catches what the global standard passes, because one float here reported
  ~20 PSU - ADR 0008. Reading the flags more than doubled the usable observations, because
  asking for them meant also asking for the raw columns the fallback chain had always declared
  and never fetched: 93 floats became 221.
- **INCOIS's own Argo archive ends 2025-04-23**, fifteen months before their analysis. That is
  why the demo reads Ifremer - ADR 0009.
