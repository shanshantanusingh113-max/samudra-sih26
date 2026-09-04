# A real climatological baseline, and why this is not the oxygen decision again

PS 26067 names **climate monitoring** among the four operational mandates it says a missing 3D
platform impedes. The platform's Temperature Anomaly is a departure from the mean of the twelve
baked Timesteps - roughly April to July 2026 - which is a **seasonal swing**. The guide entry
beside it has always said so, which was honest and was not the same as answering the clause.

## What was built

A second Field, `temperature_normal_anomaly`, labelled **Temperature vs Normal**: INCOIS's
analysis minus NOAA's **World Ocean Atlas 2023 1991-2020 mean** for that Timestep's own calendar
month. One degree, monthly, to 1500 m.

Measured on the bake of 2026-09-02, across 349,692 cells:

| | |
| --- | --- |
| Monthly normals fetched | 4 - April, May, June, July |
| Mean departure | **-0.014 degC** |
| 95th percentile of the magnitude | **2.104 degC** |
| Encoding range | **±3.365 degC**, symmetric, because the palette diverges |

## Why the axes made this cheap

WOA 2023's one-degree product publishes at node centres -89.5, -88.5 … and 45.5, 46.5 … which
are **exactly** the node centres INCOIS's analysis uses. So the subset over this region comes
back 36 x 56, the same lattice, and the difference is subtraction with no horizontal regridding
at all.

That is not assumed. `climatology.climatological_anomaly` compares both axes and raises
`AxisMismatch` if they ever stop matching, because regridding one onto the other silently would
mean differencing two different pieces of water - the failure mode that produces a beautiful and
wrong field.

The bounds are taken from **the analysis's own axes**, not from `DEMO_REGION`. That cost one
debugging round: `DEMO_REGION` is 45-100 E, 10 S-25 N, which is the *request* sent to INCOIS,
and their nodes sit half a degree inside it. Asking WOA for `DEMO_REGION` returns a 35 x 55 grid
against the analysis's 36 x 56, and the subtraction cannot be done at all.

## Why this is not the oxygen decision again

ADR 0010 refused dissolved oxygen because the only field for this region was a decadal
climatology with no date, and a value with no date cannot share a ten-day 2026 timeline.

That argument is exactly right for a **value** and exactly backwards for a **baseline**. A
climatology having no year is what makes it a climatology. WOA is never drawn as a value here
and never appears in the Variable selector; it is the reference the 2026 analysis is differenced
against, and what the reader sees is the difference.

## The two caveats, which ship on the panel

**The atlas is monthly and the bake is ten-daily.** Three Timesteps inside one calendar month
share a baseline. That is a limitation of the atlas rather than a shortcut, and the guide entry
says it in the reader's words.

**The atlas stops at 1500 m and the analysis runs to 2000 m.** Below 1500 m there is no normal
and the Field is Mask, not zero. `to_model_levels` refuses to hold the last value down: an
anomaly at a depth nothing was ever averaged over is an extrapolation dressed as a measurement.

## Cost, and what it did not cost

Anonymous over OPeNDAP - no account at bake time and none at demo time, unlike Copernicus.
Measured 2026-09-02: the `.dds` answers 200 in 1.53 s, and the direct file answers 206 on a range
request. Four monthly subsets are about 1.5% of the global field each; pulling whole files would
be hundreds of megabytes.

It is **not fatal**. A bake that cannot reach NOAA prints a warning, offers fourteen Fields
instead of fifteen and is otherwise identical - the same treatment Copernicus and the moored
buoys already get.

## What was rejected

**Differencing against the whole-year normal** rather than the calendar month. It is one file
instead of four and it would fold the seasonal cycle straight back into the anomaly, which is
the thing this Field exists to remove.

**Salinity vs normal as well.** WOA publishes it and the adapter already reads it - `s_an` is
one entry in `VARIABLES`. It was left out because two diverging Fields in the Change group,
telling the same story about two quantities, is a longer Variable selector for a smaller gain
than the first one closed. The adapter is written so adding it is a `FieldSpec` and one loop.

## The coastline moves, and the panel says so

Measured 2026-09-03 on the last Timestep, at the model's own resolution: the seasonal anomaly is
**70.1%** ocean voxels and the climatological one is **60.2%**, and the two masks are not the
same mask. Most of the drop is the deep water - the atlas stops at 1500 m and the analysis runs
to 2000 m, so the bottom three Levels are empty here and full there - which was documented from
the start and is on the panel.

What was not documented is the coast. The climatological Field is the intersection of INCOIS's
land-sea mask and the World Ocean Atlas's, and the atlas is the coarser of the two: at 5 m it
loses **79 of 1,537** ocean cells, between 28 and 59 at every Level down to 1400 m, and it
**never gains one** - 0 cells at every Level are wet in the atlas and dry in the analysis. The
79 are all coastal or island water: the Andaman and Nicobar chain around 93-100 E, the Gulf of
Mannar at 78-81 E, and the Somali and Yemeni shelf at 45-54 E.

That is small and it is a moving coastline, which a reader switching between the two Fields
would otherwise read as the land having changed shape. The guide entry says it with the figure.
