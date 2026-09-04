# The hazard Fields, and the three ways of drawing a Field that is not a Volume

PS 26067 was revised in September 2026 and its theme became **Disaster Management**. The platform
had no Field a cyclone forecaster would name.

## What was built

Five quantities, all from the temperature and salinity already in the Grid, plus the TEOS-10
density this project already computes. No new provider, no account, no new dependency.

| Field | Definition | Reference |
| --- | --- | --- |
| Depth of the 26 degC isotherm | first crossing from the surface, linearly interpolated | conventional |
| Cyclone heat potential | `rho * cp * integral(T - 26)` from the surface to D26, rho 1026, cp 4178, in kJ/cm2 | Leipper and Volgenau 1972 |
| Mixed layer depth | sigma-theta 0.03 kg/m3 above the 10 m value | de Boyer Montegut 2004 |
| Isothermal layer depth | 0.2 degC below the 10 m value | de Boyer Montegut 2004 |
| Barrier layer thickness | isothermal layer depth minus mixed layer depth, signed | conventional |

## Why this is filling a gap rather than duplicating one

INCOIS used to publish exactly these, in `incois_valueadded_products_datasets`: depth of the 20
and 26 degC isotherms, dynamic height, geostrophic currents, heat content to 300 m, isothermal
layer depth, mixed layer depth. **That series ends 2019-03-30.**

It has now been measured dead twice, independently: once on their ERDDAP
(`03-requirement-gaps.md`) and once in their LAS catalogue (`04-ps-update-2026-09.md`), which
confirms the same end date by a different route.

So INCOIS publish the quantities a hazard forecaster needs, and stopped seven years ago. That is
the strongest argument this platform has for computing them: it is not competing with a provider,
it is restoring something the provider dropped.

## The bar ADR 0010 set, and how these clear it

ADR 0010 rejected a derived Field for being finite, smooth and wrong. The check that matters here
is Oman in peak monsoon, where the wind drags cold water to the surface: D26 should be almost at
the surface and there should be no cyclone fuel at all.

Measured on 2026-07-30 at 17.5 N, 58.5 E: **D26 9.7 m, heat potential 1.1 kJ/cm2.**

Separately, and by a completely different method, this platform's own anomaly detector already
flags that exact water at that exact step as the strongest cold feature in the block: -6.65 degC
peak, 12.5 to 20.5 N, 55.5 to 60.5 E, 381,106 km2. Two independent methods agreeing on one
physical event is the strongest evidence available without ground truth.

The Bay of Bengal rows carry the other expected signature: a shallow mixed layer under a deeper
warm layer in the north, 25.5 m against a 64.3 m D26, which is the fresh-water barrier layer the
Bay is known for.

## The limitation, stated rather than hidden

The Levels are 5, 10, 20, 30, 50, 75, 100 m and then coarser, so anything found by a threshold
crossing inherits that spacing. D26 near 70 m is interpolated across a 25 m gap. Mixed layer
depth is the most exposed, because its criterion bites in the 10 to 30 m range where there are
only three Levels. INCOIS computed their own value-added products from this same grid, so the
practice is theirs as much as ours - but that is an explanation and not an excuse, and it is said
on the panel rather than in a footnote.

Two smaller decisions worth recording:

- **The heat integral starts at the sea surface, not at the shallowest Level.** The 5 m value is
  carried up to 0 m, which is what a mixed layer physically does. Starting at 5 m instead drops a
  slab of the warmest water in the column and biases every cell low by around 10%.
- **Both layer-depth criteria are referenced to 10 m, not to the shallowest value.** The top few
  metres carry a diurnal skin, and referencing to it would report a one-metre mixed layer over
  half the Arabian Sea in April.

## Three of them are not Volumes, and that is the design opportunity

This is the part worth recording, because it is where a lazy implementation would have gone
wrong. Three of these Fields **are a depth**. Two are **one number for the whole column**. Neither
is a value at every point in a body of water, and drawing either as a ray-marched Volume would be
drawing a picture of the wrong thing.

| Kind | Fields | Drawn as |
| --- | --- | --- |
| Volume | temperature, salinity, density, anomaly, coverage, INCOIS cast count, INCOIS error, analysis spread | ray-marched, as before |
| **A depth** | D26, mixed layer depth, isothermal layer depth | **a sheet inside the block, sitting at that depth** |
| **A column total** | cyclone heat potential, barrier layer thickness | **draped on the sea surface** |
| **A vector** | currents | **arrows on the chosen depth** |

Build the sheet once and three Fields have it. It is also the best thing in the plan visually:
you watch the 26 degC isotherm dome up and collapse across four months, from inside the water,
with the Floats sitting on it. No flat map can do that.

`FieldSpec.render` carries which one, so the frontend has no per-field special cases - the same
discipline `emphasis` and `opacity` already followed.

## They are float32 on the Grid, and never encoded

A depth Field and a column total ship as **float32 on the Grid's own horizontal axes**, one file
per Field per Timestep, 8 KB each. They are never byte-quantised, never depth-warped and never
land-filled.

That is not an optimisation. It is the project's first rule applied in the one place it would
never have been noticed: a reader reads **metres** off these Fields. A quantised, depth-warped
sheet would look identical and would be answering a scientific question from a rendering
artefact.

The colouring is done on the CPU by `palette.ts`, through the same `liftedPalette` and `transfer`
calls that draw the colourbar swatch, so no shader in the new render types knows a unit, a range
or a scale - and none of them can drift out of step with the legend. That is ADR 0007's rule for
the colourbar, extended to everything that is not the ray marcher.

## One thing measured rather than assumed

The sheets were checked by measurement, not by looking: the probe hides the sheet mesh and diffs
the frame, and projects the deepest and shallowest cells of the file to confirm they land in the
right order down the warped axis. That found a real bug on the first run - `flat` is a reserved
GLSL interpolation qualifier, so both new vertex shaders failed to compile and every sheet was
silently absent while the geometry was perfectly correct. Exactly the class of failure
`CLAUDE.md` warns about, caught by exactly the method it prescribes.
