# Three.js for both views, and no Cesium

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
