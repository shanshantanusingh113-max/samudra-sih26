# OPeNDAP, CF NetCDF and WMS, served from the Grids and never the Volume

`CONTEXT.md` put OGC WMS/WCS out of scope: "we consume open standards; we do not re-serve them.
A day of work for a checkbox no judge will click." The README marked OPeNDAP Not met and CF
Conventions Partly. All three are now built, and two measurements are what changed the argument.

## What we measured

**ERDDAP's griddap is a DAP2 server.** On INCOIS's own:
`incois_argo_10d_VAM.dds` returns 200 with a proper dataset descriptor, and
`.dods?TEMP[812][0][30:32][30:32]` returns 200 with binary DAP. So "we consume ERDDAP
subsetting" and "we consume OPeNDAP" were always the same sentence. The README said otherwise
and has been corrected. Only the serving half was ever missing.

**INCOIS's ERDDAP already publishes WMS 1.3.0 for the dataset we read.** GetCapabilities returns
200 and 26 KB, with layers for SAL, TERR and SERR. That reframes the whole question: re-serving
*their* temperature as WMS is re-publishing and is worth nothing to anyone. What is worth serving
is what this platform computes and nobody else publishes - density and the temperature anomaly.
The capabilities document says which layers are which, in those words.

The third thing that changed is cost. Each of the three was a day on its own. They share one
`Grid -> xarray` wrapper with CF attributes, and after that they are an afternoon between them.

## The one rule

**Everything here reads the native Grid. None of it can reach a Volume.**

This is the project's first rule and these endpoints are where it is easiest to break, because
unlike a picture on a screen a consumer pulling NetCDF over the wire cannot see what they have
been handed. The Volume is quantised to 255 levels, depth-warped and back-filled across land.
Serving it would be handing somebody a picture of the data labelled as the data.

The rule has one visible consequence, and it is stated rather than left to be noticed:
**Observation Coverage is not served over any of the three.** It is counted on the Volume's
warped lattice, because "how many casts dived through this slab" is a question about a slab, and
a slab is a rendering construct. Asking for it returns 404 with that sentence, not silence.

Nor does a Field get to borrow a standard name it has no right to. Temperature, salinity and
density have real CF standard names. The anomaly does not - a CF anomaly is a departure from a
climatology and this is a departure from four months - so it carries a `long_name` and no
`standard_name` at all. Inventing one that looks official is the same class of error as printing
"the conventional oceanographic scale for observation coverage", which this project has already
made once.

## Why hand-written

`xpublish` is the sanctioned xarray route and requires Python 3.11; this project runs 3.10.
`xpublish-wms` would install Cartopy, dask, distributed, datashader, numba, pyarrow and bokeh -
forty packages - to draw five one-degree fields. DAP2 over a rectangular array is three
responses, two of them plain text, and WMS 1.3.0 over a lat/lon grid is a capabilities document
and a resampler.

The risk in hand-writing a protocol is that it only satisfies its own author, so neither is
tested against itself. `test_dap.py` hands the bytes to `pydap` - the reference DAP2 client, the
one `xarray.open_dataset(engine="pydap")` uses - and checks the numbers that come back against
the Grid they came from. Two bugs surfaced that way and neither would have from reading the
code: the DDS needs one bracket pair per dimension rather than comma-separated dimensions, and
pydap's xarray backend does not lift a DAP Grid's MAPS into coordinates, so the axes have to be
declared as top-level variables as well. ERDDAP declares them both ways, for the same reason.

## WCS is still not built

There is no maintained pure-Python WCS server. Hand-rolling the coverage encodings is a day that
buys a checkbox, and the numbers are already served properly over OPeNDAP, which is what this
community actually uses. That is a decision with a reason, recorded here and in
`docs/plan/03-requirement-gaps.md`, rather than an omission.

## The trap WMS 1.3.0 sets, recorded so it is not re-sprung

Version 1.3.0 reversed the axis order. In `CRS=EPSG:4326` a BBOX is minLat,minLon,maxLat,maxLon,
because that is the axis order the EPSG registry defines. In `CRS=CRS:84` - the same datum,
defined lon-first precisely because so much software got 4326 wrong - it is
minLon,minLat,maxLon,maxLat.

Getting it backwards raises nothing. It serves the Arabian Sea rotated into the Southern Ocean,
and the result still looks like an ocean. Both orders are supported, both are tested, and the
capabilities document declares each CRS's bounding box in its own order.
