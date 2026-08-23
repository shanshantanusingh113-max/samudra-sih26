"""One-off: write the architecture decision records."""

from pathlib import Path

ADRS = {
    "0001-threejs-for-both-views.md": """# Three.js for both views, and no Cesium

The problem statement sanctions "WebGL / Three.js **or** Cesium.js". We use Three.js for the
globe *and* the volume, and do not use Cesium at all.

Cesium is the obvious choice for a globe, and we rejected it for three reasons. It wants a
Cesium ion access token for usable imagery, which is an external dependency that can fail in
front of a judge. It ships roughly 10 MB. And compositing a custom ray-marched volume into its
render pipeline was the single riskiest integration in the build - its shader entry points are
not designed for a user-supplied sampler3D ray march.

The deciding argument was positive rather than defensive. With one Three.js scene the
Drill-down is a genuine continuous deformation of one piece of geometry - every coastline
vertex carries its lon/lat and mixes between a position on a sphere and a position on a flat
equirectangular map - instead of a cross-fade between two libraries pretending to agree. The
transition is the demo's centrepiece, so the architecture is built around making it real.

Consequence: no tiled basemap and no terrain. We do not need them; the region is fixed and
coastlines are drawn as vector lines from Natural Earth, which suits the instrument look.
""",
    "0002-incois-public-erddap.md": """# INCOIS's own public ERDDAP is the model source

Prior research concluded that INCOIS exposes no public API and that the demo would have to use
a substitute such as HYCOM. Both halves turned out to be wrong, in our favour.

tds.hycom.org is unreachable from the build machine - 20-second timeouts on both the catalog
and the OPeNDAP endpoint - as is coastwatch.pfeg.noaa.gov. Meanwhile erddap.incois.gov.in is a
real, running, public ERDDAP, and `incois_argo_10d_VAM` is exactly what the platform needs:
temperature and salinity on 24 levels from 5 m to 2000 m, 1 degree, over the whole Indian
Ocean, on a 10-day cycle and current to this month.

The demo therefore runs on INCOIS's own operational product rather than a stand-in, which
removes the "this is not really our data" objection entirely.

It also makes the Collocation scientifically meaningful rather than contrived: the VAM analysis
is *derived from* Argo profiles, so comparing it against raw Argo casts asks a real operational
question - did the analysis reproduce the observations that fed it? - and INCOIS publish their
own error fields alongside it.

One wart, recorded so nobody rediscovers it at 3 a.m.: their server sends only its leaf
certificate and omits the GlobalSign intermediate. Browsers and curl paper over this; Python's
ssl module does not. See pipeline/samudra/tls.py.
""",
    "0003-bake-static-api-deployable.md": """# The demo runs on baked static files; the API is the deployable half

Everything the browser demo needs is committed as static assets, and the REST API is not on the
critical path for the demo at all.

The reason is operational, not technical. The demo runs on a venue network we do not control,
and the two upstream servers are in Hyderabad and Brest. A cold fetch is fast when it works and
the entire platform is dead when it is not. Free-tier hosting adds 30-50 second cold starts on
top of that. None of it is a risk worth taking in a scored demo.

The API still exists and is real, because a Collocation is a *query*, not a fixture - any float,
any cast, any analysis step, or an arbitrary position - and precomputing that cross-product is
neither possible nor sensible. /api/live/timesteps proves the ingestion path is live by asking
INCOIS what exists right now.

Consequence: two read paths to keep honest. The rule is that the bake and the API both go
through the same Source Adapters and the same collocate(), so they cannot disagree about the
science, only about how much has been precomputed.
""",
    "0004-depth-warp.md": """# The Volume's vertical axis is warped, not linear in metres

INCOIS publishes 24 unevenly spaced levels - 5 m apart near the surface, 200 m apart in the
abyss - because that is where the physics is. A GPU 3D texture samples on an evenly spaced
lattice. Something has to reconcile the two.

Resampling linearly in metres would spend about 85% of the texture on the featureless deep
ocean and crush the thermocline - the one structure a forecaster actually looks at - into three
voxels. So the third axis is a warped coordinate, dense near the surface and sparse at depth:
the top 300 m gets roughly half the axis instead of 15%.

The cost is that the vertical axis is not proportional to depth, which is a real perceptual
claim to make carelessly about a "block of water". Two things keep it honest: a stretched depth
axis is ordinary practice in oceanography, and the profile chart uses the *same* warp, so the
3D view and the chart agree about where the thermocline is.

The inverse mapping is shipped in the manifest as the sampled axis (depthAxisMetres) and read
back by the frontend, rather than the warp formula being reimplemented in a second language
where it could silently drift out of step with the pipeline.
""",
    "0005-volume-channels.md": """# The Volume carries coverage and gradient, not just a value

Four bytes per voxel: value, coverage, gradient magnitude, spare.

**Coverage** exists because of how GPUs filter. The obvious design is one channel with a
reserved "no data" sentinel, but the texture unit interpolates trilinearly *before* the shader
sees a voxel, so a sentinel gets averaged with the ocean next to it. On a temperature field that
paints a cold fringe along every coastline - which does not read as a bug, it reads as
upwelling, a real phenomenon a forecaster would act on. Fabricating one is far worse than
rendering a blocky coast. So masked cells are back-filled from their nearest valid neighbour,
which makes them harmless to interpolate against, and coverage carries the truth about where
the ocean is. Filtering coverage is then not merely safe but desirable: it turns a 1 degree
stair-stepped coastline into a smooth edge without inventing a single temperature.

**Gradient magnitude** is what makes the water legible. Ocean temperature is monotonic with
depth, so a plain ray march is dominated by the warm surface and everything below it vanishes.
Weighting opacity by how fast the field is *changing* inverts that: featureless water turns
transparent, and the thermocline, haloclines and fronts become the solid things in the picture -
which are also the features anyone is actually looking for. It is precomputed because doing it
in the shader costs six extra texture fetches at every one of ~128 ray steps, which integrated
graphics will not absorb.
""",
    "0006-explicit-render-order.md": """# Transparent passes are ordered explicitly

Three.js sorts transparent objects by distance to each object's **centroid**. That is a fine
heuristic for compact meshes and useless for ours: the sea surface spans the entire globe, so
its centroid sits at the origin while the part you are looking at is thousands of units away.

The symptom cost hours and is worth recording. The ray-marched volume rendered as a thin bright
sliver instead of a 32-unit-tall block. Every plausible cause was investigated and cleared by
measurement - the mesh transform was correct (45 x 32.3 x 35), the shader uniforms were correct,
the box projected to 844 px of a 900 px viewport, and the baked data had 69-78% coverage at
every depth with values falling smoothly from 248 to 13. The geometry rendered perfectly and was
then painted over by the opaque world sea surface, which the centroid sort had placed *after*
it. Disabling depthWrite did not help, because it was never a depth-test failure.

Draw order is now stated rather than inferred: surface 0, lines 5, volume 10, markers 20.

The general lesson, which applies to anything world-spanning we add later: centroid-based
sorting is meaningless for geometry whose extent dwarfs its centre, and the failure mode is
silent - it looks exactly like a broken shader.
""",
    "0007-palette-display-lift.md": """# cmocean palettes get a display lift, applied to the palette itself

Every perceptually-uniform ocean palette runs to near-black at its cold end, because that is
what makes it perceptually uniform on a white page. In a dark 3D scene it is a disaster: water
at 3 degC encodes to a colour within a couple of levels of the background, so the bottom of the
water column renders correctly and is invisible.

We apply a gamma lift (0.62). It is monotonic, so colder still reads darker than warmer, and the
ordering a viewer infers from the image is never wrong.

The important part is *where*. The lift is applied to the palette, in one place, so the colourbar
drawn in the control panel and the water drawn in the scene are the same numbers. Applying it
only in the shader - the first thing we tried - would have quietly made the legend a lie.

We keep cmocean rather than inventing a palette: thermal, haline and the rest are the convention
in oceanography, and any oceanographer on a judging panel will recognise them.
""",
    "0008-regional-salinity-qc.md": """# Argo salinity is filtered against a regional floor, stricter than the Argo standard

Real GDAC data contains failed sensors. This region currently has a float reporting about
20 PSU at the surface - fresher than the Baltic and impossible in the open Bay of Bengal -
which renders as a wild spike on the Collocation chart and looks like our bug.

Argo's global gross range check (QC Manual, test 4) passes salinity from 2 PSU, because it must
accommodate brackish marginal seas. It therefore does not catch this float. Our floor is
regional, is a judgement call rather than a published threshold, and is labelled as such in the
code.

25 PSU is the floor rather than something tighter because the northern Bay of Bengal really is
that fresh: Ganges-Brahmaputra discharge drives monsoon surface salinity down to roughly 28 PSU.
Clamping at, say, 33 would delete one of the most scientifically interesting features in India's
own EEZ as though it were instrument error.

Filtering is per channel, so a cast with a failed salinity sensor still contributes its
perfectly good temperature.
""",
}

out = Path(__file__).resolve().parent.parent / "docs" / "adr"
out.mkdir(parents=True, exist_ok=True)
for name, body in ADRS.items():
    (out / name).write_text(body, encoding="utf-8")
print(f"wrote {len(ADRS)} ADRs to {out}")
