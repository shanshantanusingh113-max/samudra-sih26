"""Potential density: the first Field the platform computes instead of downloading.

Temperature and salinity are what INCOIS publishes and what a float measures. Density is what
the ocean actually responds to. Water does not move because it is warm, it moves because it is
light, and in this region those are different statements: the Bay of Bengal takes the Ganges and
the Brahmaputra, so its surface can be both cool and buoyant at once. A barrier layer - the
thing that lets a cyclone spin up over water a temperature map says is unremarkable - is a
density structure and is invisible in either input on its own.

Nothing is downloaded and nothing is assumed. Density is a *function* of temperature, salinity
and pressure, fixed by TEOS-10, the international standard since 2010. We already hold all three
for every cell of every Timestep, so this Field costs an evaluation and no new provider.

Why sigma-theta, and what the number means

The output is potential density anomaly referenced to the surface: take the parcel, move it
adiabatically to zero pressure, work out its density, subtract 1000 kg/m^3. So 22 means
1022 kg/m^3, and the subtraction is convention rather than laziness - seawater density varies
over about 8 kg/m^3 in this block against an absolute value near 1025, and a scale running
1020 to 1028 would spend its whole range on a constant.

Referencing to the surface is the standard choice for the upper ocean, and the upper ocean is
what this platform is for. It does understate how stratified the deep really is, because a deep
parcel brought to the surface expands. Anyone comparing water masses below about 1000 m wants
sigma-2 instead; that is a different reference pressure and a different Field, not a correction
to this one.

What the field does, and does not, guarantee

Nothing here makes the water stably stratified, and it should not. INCOIS analyses temperature
and salinity independently, so nothing constrains the density that falls out of them to increase
with depth. Measured on the last Timestep of this bake, 8.5% of vertical steps decrease.

That number sounds alarming and is not, because of where it sits. Between 10 and 20 m the median
step is -0.004 kg/m^3 and the negative and positive departures are the same size, 0.12 against
0.10: there is no real density gradient in a mixed layer, so the sign of the analysis noise is a
coin toss and about half of it lands negative. By 50-75 m the median step is +0.86 and the
inversions are a thin tail; by 700-800 m only 1% remain. The largest single inversion in the bake
is at 24.5 N 57.5 E in the Gulf of Oman, where the analysis puts 36.57 PSU at 75 m above
33.95 PSU at 100 m - a place with almost no float coverage, which the Observation Coverage field
will tell you independently.

So the inversions are the analysis showing its own uncertainty, not an error in this module. Do
not "fix" them by sorting the column: that would erase a real signal about where the model is
weak, and it is exactly the signal this platform exists to surface.

The chain, and the traps in it

TEOS-10 does not work in the units the data arrives in. Three conversions run first, and each
is somewhere a plausible-looking wrong answer could come from:

1. **Depth to pressure.** INCOIS publishes Levels in metres. TEOS-10 wants sea pressure in
   dbar, and the conversion depends on latitude because gravity does. About 1 dbar at 1000 m
   across this region, which is small but free to get right.
2. **Practical to Absolute Salinity.** PSU is a conductivity ratio; TEOS-10 works in g/kg and
   applies a regional correction for the dissolved matter conductivity cannot see. It needs
   position, so this is the step that would silently break if latitude and longitude were
   swapped.
3. **In-situ to Conservative Temperature.** Argo, and therefore the INCOIS analysis built from
   it, reports in-situ temperature. Feeding it to TEOS-10 unconverted is the classic error.
"""

from __future__ import annotations

import gsw
import numpy as np

from .grid import Grid


def potential_density(temperature: Grid, salinity: Grid) -> Grid:
    """Sigma-theta in kg/m^3, on the axes both inputs share.

    Masked cells stay masked. NaN propagates through the whole TEOS-10 chain on its own, but the
    result is checked rather than trusted: a density painted over the sea floor would look
    entirely reasonable and be entirely invented.
    """
    _require_same_axes(temperature, salinity)

    # Broadcast the axes to the value grid's shape so the whole block evaluates at once. gsw is
    # vectorised; doing this cell by cell would take minutes per Timestep.
    depth = temperature.levels[:, None, None]
    latitude = temperature.latitudes[None, :, None]
    longitude = temperature.longitudes[None, None, :]

    pressure = gsw.p_from_z(-depth, latitude)  # metres down -> dbar, gravity varies with lat
    absolute = gsw.SA_from_SP(salinity.values, pressure, longitude, latitude)
    conservative = gsw.CT_from_t(absolute, temperature.values, pressure)
    values = gsw.sigma0(absolute, conservative)

    values = np.where(
        np.isnan(temperature.values) | np.isnan(salinity.values), np.nan, values
    )
    return Grid(
        levels=temperature.levels,
        latitudes=temperature.latitudes,
        longitudes=temperature.longitudes,
        values=np.asarray(values, dtype=float),
    )


def profile_density(
    latitude: float,
    longitude: float,
    depths: np.ndarray,
    temperature: np.ndarray,
    salinity: np.ndarray,
) -> np.ndarray:
    """Sigma-theta down one observed cast, so a Float can be compared against the model.

    Density is the first computed Field that a float can also be held to. It measures
    temperature and salinity at the same instant at the same place, and TEOS-10 turns that pair
    into a density exactly as it does for the model, so the Collocation is a real comparison
    rather than a substitution. Without this the panel would have had to tell the user that
    density "is measured, not predicted", which is untrue in both halves.

    Levels the float did not report, or that failed QC, come back NaN and the Collocation drops
    them, exactly as it drops a missing temperature.
    """
    depths = np.asarray(depths, dtype=float)
    pressure = gsw.p_from_z(-depths, latitude)
    absolute = gsw.SA_from_SP(
        np.asarray(salinity, dtype=float), pressure, longitude, latitude
    )
    conservative = gsw.CT_from_t(absolute, np.asarray(temperature, dtype=float), pressure)
    return np.asarray(gsw.sigma0(absolute, conservative), dtype=float)


def _require_same_axes(temperature: Grid, salinity: Grid) -> None:
    for name in ("levels", "latitudes", "longitudes"):
        if not np.array_equal(getattr(temperature, name), getattr(salinity, name)):
            raise ValueError(
                f"temperature and salinity disagree about {name}; density needs the same water"
            )
