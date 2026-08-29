# Currents arrive as somebody else's picture, and say so

ADR 0010 removed current speed and gave two reasons: INCOIS's own geostrophic series ends
2019-03 and cannot share this timeline, and our own thermal-wind derivation was wrong by more
than a factor of ten at the Somali Current. Both still hold. This does not reverse either of
them; it takes a third route that neither considered.

## What changed

Copernicus Marine's `GLOBAL_ANALYSISFORECAST_PHY_001_024` carries eastward and northward
velocity at 1/12 degree, 50 levels, daily, running to a nine-day forecast. It is the right
source and it is not open. Measured against their ARCO store:

| Object | Result |
| --- | --- |
| `geoChunked.zarr/.zmetadata` | 200 |
| `geoChunked.zarr/latitude/0` | 200 |
| `geoChunked.zarr/elevation/0` | 200 |
| `geoChunked.zarr/uo/0.0.0.0` | **403** |
| `geoChunked.zarr/vo/0.0.0.0` | **403** |

Metadata is public; the numbers need a Copernicus account, which means a secret in the bake.

Their **WMTS is anonymous**. A GetTile with no credentials returns 200 and a 30 KB PNG, the time
dimension runs 2022-06-01 to 2026-09-05 daily, and the elevation dimension carries all 50 levels.

So the choice was not "currents or no currents". It was "a picture we can have, or numbers we
cannot".

## The decision

Bake the tiles. Draw them as a labelled overlay. Never pretend they are anything else.

- It is **not a Field**. It never enters the Variable selector, has no Volume, no isosurface, no
  Collocation and no place in the manifest's `fields` list. Putting it beside temperature would
  imply it had been through this pipeline, and it has not.
- **Nothing about it is clickable and no number is read off it.** That is not a discipline the
  code has to maintain - a rendered tile physically cannot give you a number - which is exactly
  what makes a picture the safe way to carry a field we cannot verify ourselves.
- The panel says, in those words, that it is Copernicus's own rendering, at their date, and that
  unlike every other layer you cannot query it.
- The tiles are fetched at bake time and committed, so the zero-network-calls property survives.

## Two things that had to be got right

**Projection.** The service offers EPSG:3857 and EPSG:4326. We take 4326, which is plate
carree - linear in longitude and latitude, the projection the scene already uses - so the tiles
drop straight onto the map with no reprojection and no resampling error. The stitched sheet is
always larger than the region and is cropped back to it; `test_currents.py` holds that
arithmetic, because half a degree of error draws the Somali Current over Somalia.

**Arrow density.** Copernicus draws a fixed number of arrows per *tile*, so in the plain matrix
set the arrows come out eight pixels apart at every zoom - the arrow count and the pixel count
double together and cancel. At zoom 4 the region came back with roughly 128 arrows across it,
which reads as texture rather than as vectors. The `@2x` sets serve the same geographic tile at
double the pixels, so zoom 3 at `@2x` keeps the resolution and quarters the arrows: about 64
across, an arrow every 0.7 degrees.

## Why this is honest rather than a loophole

The test ADR 0010 set was not "is it available" but "is it right", and it rejected a field that
was finite and plausible and wrong. This layer passes that test in the one way it can: the
Somali Current is *there*, dark green and running north at the height of the monsoon, which is
precisely what our own derivation failed to produce.

It also fails safely. If Copernicus restyle their tiles the picture changes and no number we
publish moves, because we publish none. If the bake cannot reach them the manifest carries no
currents block and the control is never offered.

## What this does not do

It does not close the clause fully, and the README says Partly rather than Met. A forecaster
cannot ask this layer what the speed is at a point, cannot slice it by depth beyond the surface,
and cannot compare it against an instrument. Doing any of that needs the numbers, which needs an
account. That remains the right upgrade if this platform is ever deployed rather than
demonstrated, and it is a change to how the project is built rather than to what it contains.
