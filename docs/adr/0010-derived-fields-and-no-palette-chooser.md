# Derivable quantities become Variables; the palette chooser goes

The Colourbar was a dropdown of nine cmocean palettes sitting directly under the Variable
selector. Seven of them named quantities the platform does not carry. Choosing "dense - Density"
drew the temperature field in the colours of density, under a printed warning that the colours
would "not carry their usual meaning". A presentation control was reading as a data control, and
the warning was an admission rather than a fix.

## What we did

Split the nine by whether the quantity behind them is real, derivable, or neither.

| Palette | Quantity | Outcome |
| --- | --- | --- |
| `thermal`, `haline` | Temperature, Salinity | Already Fields. Now bound to them. |
| `coverage` | Observation Coverage | Already a Field. Removed from the chooser, where it was a duplicate of its own button. |
| `dense` | Density | **Became a Field.** TEOS-10 sigma-theta from temperature, salinity and pressure. Exact, no download. |
| `balance` | Anomalies about zero | **Became a Field.** Departure from the twelve-step mean. |
| `delta` | Differences | Deleted. A second diverging scale with nothing to sit on. |
| `algae` | Chlorophyll | Deleted. Biological and optical; needs BGC-Argo or satellite ocean colour, and either would be a 2-D surface layer rather than a Volume. |
| `oxy` | Dissolved oxygen | Deleted. The only complete gridded field for this region is a decadal climatology with no date, which cannot share a ten-day 2026 timeline. Deriving it from T/S regressions would be inventing data. |
| `deep` | Bathymetry | Deleted. GEBCO is a download, not a derivation, and the sea floor is scenery rather than a variable. |
| `speed` | Current speed | Deleted. See below. |

What is left is one palette per Field, named in the `FieldSpec`. A Field and its colours cannot
be separated, so there is no mismatch left to warn about and no chooser to make one. The
colourbar swatch, the band key and the range sliders stay: those do analytical work.

This is also the answer to the part of PS 26067 that asks for additional model variables "with
minimal code change". Density and the anomaly ride the existing bake, encoder, manifest and
shader. Neither needed a line of GLSL.

## Why current speed is not among them

It is the one the problem statement names, so it was prototyped rather than dismissed:
geostrophic velocity by thermal wind from the new density field, integrated from a reference
level of no motion at 1000 dbar, the Argo parking depth.

It does not blow up at the equator - the Grid's rows sit at half degrees, so `f` never reaches
zero - and every value it produces is finite and plausible. That is the problem. Measured on
2026-07-30, at the height of the southwest monsoon:

| Region | Prototype | Reality |
| --- | --- | --- |
| Somali Current, 5-11 N | max **0.16 m/s** | 1.5-2.5 m/s, the Great Whirl |
| Equatorial band, 2 S to 2 N | max **1.90 m/s** | ~0.5-1 m/s, and geostrophy does not hold here at all |
| Bay of Bengal interior | 0.08 m/s median | 0.1-0.3 m/s |
| Arabian Sea interior | 0.05 m/s median | 0.1-0.3 m/s |

So the field is wrong by more than a factor of ten at the fastest current in the region, in the
month it is fastest, and puts the fastest water in the block in the one place the method is
guaranteed not to apply. A 1 degree analysis smooths away the density gradients that drive a
western boundary current, and "no motion at 1000 m" is false underneath one.

A blank band would have been survivable. A calm Somalia and a racing equator is worse, because
it is plausible: it invites a viewer to believe it, and the first person to look for the Somali
Current would find it missing.

INCOIS's own `incois_valueadded_products_datasets` publishes GEO_U and GEO_V, properly derived
and validated. That series stops in March 2019 against an analysis running to July 2026, so it
cannot share this timeline. It remains the right source if currents are ever added, on their own
clearly dated view.

## The sixth Field, when there is one

TCHP - heat integrated from the surface to the 26 degC isotherm - is exact, uses only the
temperature Grid already on disk, and is the quantity that governs cyclone rapid intensification.
It is a column integral rather than a volume, so it needs a rendering decision the other derived
Fields did not, which is the only reason it is not here already.
