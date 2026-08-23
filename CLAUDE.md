# Working on Samudra 3D

Browser-native 3D ocean visualisation for INCOIS. Smart India Hackathon 2026, PS 26067.

**Read [`CONTEXT.md`](CONTEXT.md) first.** It defines the domain vocabulary and the scope cut
line, and the terms in it (Grid, Volume, Profile, Collocation, Depth Warp, Source Adapter) are
used precisely throughout the code. Then skim [`docs/adr/`](docs/adr/) — eight decision records,
several of which document traps that already cost hours.

## Layout

```
pipeline/   Python. Reads data, does the science. All tested logic lives here.
api/        FastAPI. Answers queries the static bundle cannot precompute.
web/        React + TypeScript + Three.js. One WebGL scene for globe and volume.
data/grids/ Native Grids for the API (server-side, not shipped to the browser).
ppt/        SIH submission deck: slide text, art direction, and rendered images.
plan/       Verified data sources, cut-feature backlog, demo script.
```

## Commands

```bash
# tests (run these before claiming anything works)
cd pipeline && ../.venv/Scripts/python -m pytest -q

# typecheck + build
cd web && npm run typecheck && npx vite build

# refresh the data from INCOIS and Argo (~1 min)
cd pipeline && ../.venv/Scripts/python -m samudra.bake

# run
cd web && npm run dev                                    # http://localhost:5173
.venv/Scripts/python -m uvicorn api.main:app --port 8000 # the REST API

# regenerate the PPT diagrams
cd web && node render-diagrams.mjs
```

## Rules that matter here

**Never answer a scientific question from the `Volume`.** It is quantised to bytes, depth-warped
and back-filled across land for the GPU's benefit. Collocations, tooltips, API responses and
anything a user reads as a measurement must come from the `Grid`. This boundary is the reason
`data/grids/` exists at all.

**Do not re-derive the Depth Warp.** The pipeline ships the sampled axis in the manifest
(`depthAxisMetres`) and the frontend inverts it via `geography.ts`. A second copy of the formula
in another language drifts silently and nothing catches it. This has already been fixed once.

**Verify rendering by measuring, not by looking.** Three of the worst bugs in this project
(invisible deep water, a "thin sliver" volume, a half-cell field offset) all looked like shader
bugs and were not. `OceanScene.debug()` reports the real transform, uniforms and projected screen
extent; `window.__scene` and `window.__store` are exposed for exactly this. Screenshot with
`web/capture.mjs`, and measure pixel extents in Python when the eye is not enough.

**Transparent draw order is explicit, not sorted.** See ADR 0006. Three.js sorts by centroid,
which is meaningless for world-spanning geometry. Anything new and transparent needs a
`renderOrder` from the `ORDER` table in `OceanScene.ts`.

**The demo path makes zero network calls.** Everything the browser needs is baked into
`web/public/data`. Keep it that way — a dead venue network must not be able to kill a demo.

## Testing

TDD applies to the science: depth warp, volume encoding, grid interpolation, collocation, and
the Argo parser. Not to glue, UI or shaders. 48 tests currently.

When a test and the code disagree, work out which is wrong before changing either — twice now
the *test's* expectation was the wrong one (gravity-corrected depth, and a fixture too small for
the minimum-points filter).

## Style

Simple, boring code; the obvious solution over the clever one. No abstraction until something is
needed twice. No config systems, no plugin layers. Comments explain *why*, especially where the
obvious approach was rejected for a real reason — most non-obvious code here carries that
explanation, and it should stay that way.

## Known upstream quirks

- **INCOIS ERDDAP sends an incomplete certificate chain.** Browsers and curl paper over it;
  Python does not. `pipeline/samudra/tls.py` supplies the missing intermediate. Do not reach for
  `verify=False`.
- **`tds.hycom.org` and `coastwatch.pfeg.noaa.gov` are unreachable from this network.** Do not
  retry them; see `plan/00-data-sources-verified.md`.
- **Real Argo floats fail.** One in this region reports ~20 PSU, which passes Argo's global QC.
  Our salinity floor is regional and deliberately stricter — ADR 0008.
