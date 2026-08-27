# Working on Samudra 3D

Browser-native 3D ocean visualisation for INCOIS. Smart India Hackathon 2026, PS 26067.

**Live:** https://rak2315.github.io/samudra-sih26/ (landing) and `/app.html` (the platform)
**Repo:** https://github.com/RAK2315/samudra-sih26 - branch `main`, deploys on push

**Read [`CONTEXT.md`](CONTEXT.md) first.** It defines the domain vocabulary and the scope cut
line, and its terms - Grid, Volume, Profile, Collocation, Depth Warp, Source Adapter - are used
precisely throughout the code. Then skim [`docs/adr/`](docs/adr/): nine decision records, several
of which document traps that already cost hours.

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

### `api/` - FastAPI. Answers what the static bundle cannot.

`api/main.py`. `GRID_SOURCES` and `PROFILE_SOURCES` near the top are the adapter registry.

### `web/` - React + TypeScript + Three.js. One WebGL scene for globe and volume.

File-by-file map in [`web/CLAUDE.md`](web/CLAUDE.md), loaded when you work there.
The scene lives in `src/scene/OceanScene.ts`; every control is explained in `src/guide.ts`.

### Generated data - do not hand-edit

- `web/public/data/` - manifest, volumes (`.bin`), `floats.json`, `collocations.json`, `anomalies.json`, coastlines. Written by `bake.py`.
- `data/grids/` - native Grids as `.npz` for the API. Server-side only.

### Documents

| File | What it is |
| --- | --- |
| `CONTEXT.md` | Domain vocabulary and the scope cut line. Read first. |
| `docs/adr/00*.md` | Ten decision records. |
| `docs/Samudra3D-Dossier.pdf` | Full project dossier including an anticipated-questions section. Regenerate with `web/render-dossier.mjs` from `scripts/dossier.html`. |
| `docs/demo/script.md` | The demo script: what to say, what to do. |
| `docs/plan/00-data-sources-verified.md` | Every endpoint tested, including the dead ones. |
| `docs/plan/01-cut-features.md` | What was cut, what is worth adding back, known rough edges. |
| `ppt/SLIDES.md`, `ppt/PROMPT.md` | SIH deck content and a generation prompt. |
| `design/STITCH.md` | Per-screen prompts for Google Stitch. |

---

## Commands

```bash
# tests - run before claiming anything works
cd pipeline && ../.venv/Scripts/python -m pytest -q

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
cd web && node capture.mjs              # app screenshots (needs a preview server running)
```

Deployment is automatic: push to `main` and the GitHub Actions workflow builds and publishes.

---

## Rules that matter here

**Never answer a scientific question from the `Volume`.** It is quantised to bytes,
depth-warped and back-filled across land for the GPU's benefit. Collocations, tooltips, API
responses and anything a user reads as a measurement come from the `Grid`. This is why
`data/grids/` exists.

**Do not re-derive the Depth Warp.** The pipeline ships the sampled axis in the manifest
(`depthAxisMetres`) and the frontend inverts it via `geography.ts`. A second copy of the formula
drifts silently. This has already been fixed once.

**Verify rendering by measuring, not by looking.** The worst bugs here all looked like shader
bugs and were not: invisible deep water, a "thin sliver" volume, a half-cell field offset,
frozen floats. `OceanScene.debug()` reports the real transform, uniforms and projected screen
extent. `window.__scene` and `window.__store` are exposed for this. Screenshot with
`web/capture.mjs`; measure pixel extents in Python when the eye is not enough.

**Transparent draw order is explicit.** See ADR 0006. Three.js sorts by centroid, meaningless
for world-spanning geometry. Anything new and transparent needs a `renderOrder` from the `ORDER`
table in `OceanScene.ts`.

**The demo path makes zero network calls.** Everything the browser needs is in
`web/public/data`. Keep it that way; a dead venue network must not be able to kill a demo.

**If you add a control, add its guide entry.** An unexplained control is worse than no control.
`src/guide.ts` is the single place. A Field with a `GUIDE` entry under its own key explains
itself when clicked; the rest fall back to the entry for the selector.

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
Argo parser, the adapter seam, and every derived Field. Not to glue, UI or shaders. 146 tests
currently.

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
