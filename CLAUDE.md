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

| File | Lines | What it does |
| --- | --- | --- |
| `samudra/bake.py` | 287 | Orchestrator. Fetches, warps, encodes, writes everything the browser and API consume. The `main()` CLI is `python -m samudra.bake`. |
| `samudra/sources/base.py` | 87 | **The extensibility seam.** `BoundingBox`, `FieldSpec`, `Profile`, and the `GridSource` / `ProfileSource` protocols. A new provider implements one of these and nothing else changes. |
| `samudra/sources/incois.py` | 104 | INCOIS ERDDAP adapter. Gridded temperature and salinity, `incois_argo_10d_VAM`. |
| `samudra/sources/argo.py` | 284 | Argo adapters. `ProfileColumns` makes the column layout data rather than code; `ArgoErddapSource` (Ifremer, used by the demo) and `IncoisArgoSource` (INCOIS, registered to prove the seam). Also QC and pressure-to-depth. |
| `samudra/grid.py` | 57 | `Grid` - model data on its native axes. **Scientific truth.** `column_at()` does bilinear interpolation that refuses to blend across land. |
| `samudra/volume.py` | 126 | `encode_volume()` - Grid to 4 bytes per voxel: value, coverage, gradient, spare. Read the module docstring before touching it. |
| `samudra/depth_warp.py` | 80 | `DepthWarp` - maps INCOIS's 24 uneven depth levels onto an even GPU axis. |
| `samudra/collocation.py` | 85 | `collocate()` - pairs a Profile against the model at its exact position. The scientific core. |
| `samudra/palettes.py` | 44 | cmocean palettes as 256-entry lookup tables. |
| `samudra/tls.py` | 40 | Supplies the intermediate certificate INCOIS's server omits. Do not replace with `verify=False`. |
| `tests/` | 6 files | 54 tests. `test_depth_warp`, `test_volume`, `test_grid`, `test_collocation`, `test_argo`, `test_profile_columns`. |

### `api/` - FastAPI. Answers what the static bundle cannot.

`api/main.py` (339 lines). Endpoints: `/api/health`, `/api/sources`, `/api/manifest`,
`/api/fields`, `/api/timesteps`, `/api/volume/{field}/{index}`, `/api/floats`,
`/api/floats/{id}/profiles`, `/api/column`, `/api/collocation/{id}`, `/api/live/timesteps`.
`GRID_SOURCES` and `PROFILE_SOURCES` near the top are the adapter registry.

### `web/` - React + TypeScript + Three.js. One WebGL scene for globe and volume.

| File | Lines | What it does |
| --- | --- | --- |
| `index.html` | - | The landing page. Plain HTML and CSS, **no JavaScript**. |
| `app.html` | - | The application entry. Loads fonts, mounts `src/main.tsx`. |
| `vite.config.ts` | - | Multi-page build: `landing` and `app`. `base: "./"` so it works under a sub-path. |
| `src/App.tsx` | 243 | Orchestration: loads data, builds the scene, pushes view state, runs the dive and playback, handles clicks. |
| `src/store.ts` | 111 | Zustand store. Every control's value, plus `touched` (which control the guide explains). |
| `src/types.ts` | 72 | Shapes of the baked JSON. Keep in step with `bake.py`. |
| `src/guide.ts` | 247 | **Plain-language explanation of every control.** Edit here to change what the guide panel says. |
| `src/floatTime.ts` | 54 | `positionAt()` / `trackUpTo()` - where a float was at a given moment. |
| `src/palette.ts` | 36 | The display lift applied to cmocean palettes. Applied here so the colourbar and the water agree. |
| `src/data/load.ts` | 78 | Fetches the manifest, floats, collocations and volumes; builds GPU textures. |
| `src/scene/OceanScene.ts` | **785** | The largest file. Renderer, camera, all geometry, picking, the `ORDER` draw-order table, `debug()`. |
| `src/scene/volumeShader.ts` | 181 | The ray-marching GLSL. Transfer function, depth gate, isosurface, gradient emphasis. |
| `src/scene/earthShader.ts` | 153 | The globe-to-map morph, and the sea-surface field. |
| `src/scene/geography.ts` | 95 | Coordinate mapping and the depth-axis inversion. One place decides where things go. |
| `src/scene/morph.ts` | 36 | The morph in TypeScript, for picking. Must match `earthShader.ts`. |
| `src/ui/Controls.tsx` | 332 | Left panel. Every slider carries a `guide` key. |
| `src/ui/ProfilePanel.tsx` | 281 | The comparison: chart, verdict, statistics. |
| `src/ui/GuidePanel.tsx` | 99 | The right-hand explanation panel. |
| `src/ui/Chrome.tsx` | 72 | Top bar, dive button, attribution. |
| `src/ui/Timeline.tsx` | 57 | Playback and the time slider. |
| `src/ui/DepthRuler.tsx` | 69 | Depth labels down the flank of the volume. |
| `src/ui/MapKey.tsx` | 42 | The key naming floats, tracks and coastlines. |
| `src/styles.css` | 1155 | All styling, plus the motion system. Design tokens are at the top. |

### Generated data - do not hand-edit

- `web/public/data/` - manifest, volumes (`.bin`), `floats.json`, `collocations.json`, coastlines. Written by `bake.py`.
- `data/grids/` - native Grids as `.npz` for the API. Server-side only.

### Documents

| File | What it is |
| --- | --- |
| `CONTEXT.md` | Domain vocabulary and the scope cut line. Read first. |
| `docs/adr/000*.md` | Nine decision records. |
| `docs/Samudra3D-Dossier.pdf` | Full project dossier including an anticipated-questions section. Regenerate with `web/render-dossier.mjs` from `scripts/dossier.html`. |
| `script.md` | The demo script: what to say, what to do. |
| `plan/00-data-sources-verified.md` | Every endpoint tested, including the dead ones. |
| `plan/01-cut-features.md` | What was cut, what is worth adding back, known rough edges. |
| `ppt/SLIDES.md`, `ppt/PROMPT.md` | SIH deck content and a generation prompt. |
| `design/STITCH.md` | Per-screen prompts for Google Stitch. |
| `REVIEW-PROMPT.md` | A brief for a fresh agent to review the whole project. |

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
`src/guide.ts` is the single place.

**Anything drawn on screen needs to be named.** Floats and tracks were drawn for days with
nothing saying what they were. `src/ui/MapKey.tsx` is where that lives.

---

## Testing

TDD applies to the science: depth warp, volume encoding, grid interpolation, collocation, the
Argo parser, and the adapter seam. Not to glue, UI or shaders. 54 tests currently.

When a test and the code disagree, work out which is wrong before changing either. Twice the
*test's* expectation was the wrong one: gravity-corrected depth, and a fixture too small for the
minimum-points filter.

## Style

Simple, boring code; the obvious solution over the clever one. No abstraction until something is
needed twice. Comments explain *why*, especially where the obvious approach was rejected for a
real reason. **No em dashes** anywhere - plain hyphens only.

## Known upstream quirks

- **INCOIS ERDDAP sends an incomplete certificate chain.** Browsers and curl hide it, Python
  does not. `pipeline/samudra/tls.py` supplies the missing intermediate.
- **`tds.hycom.org` and `coastwatch.pfeg.noaa.gov` are unreachable from this network.** Do not
  retry; see `plan/00-data-sources-verified.md`.
- **Real Argo floats fail.** One in this region reports ~20 PSU, which passes Argo's global QC.
  Our salinity floor is regional and deliberately stricter - ADR 0008.
- **INCOIS's own Argo archive ends 2025-04-23**, fifteen months before their analysis. That is
  why the demo reads Ifremer - ADR 0009.
