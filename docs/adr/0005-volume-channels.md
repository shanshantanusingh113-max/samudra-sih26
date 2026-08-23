# The Volume carries coverage and gradient, not just a value

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
