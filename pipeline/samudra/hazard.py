"""The five quantities a hazard forecaster names, computed from what INCOIS already publishes.

PS 26067 was revised in September 2026 and its theme is now **Disaster Management**. The
platform had no Field a cyclone forecaster would ask for by name. These five are the ones they
would, and none of them needs a new provider, an account or a dependency that is not already in
the tree: every one falls out of the temperature and salinity in the Grid, plus the TEOS-10
density this project already computes.

INCOIS used to publish exactly these. `incois_valueadded_products_datasets` carried depth of the
26 degC isotherm, heat content, isothermal layer depth and mixed layer depth, and it **stopped
on 2019-03-30** - measured twice, once on their ERDDAP and once independently in their LAS
catalogue. So this is filling a gap INCOIS has rather than duplicating something they ship.

What each one is, in one line each:

- **Depth of the 26 degC isotherm (D26)** - how deep the water warm enough to feed a cyclone
  runs. Computed by `thermocline.isotherm_depth`, which already existed for the 20 degC surface.
- **Tropical cyclone heat potential (TCHP)** - how much heat is actually in that layer.
  Leipper and Volgenau, 1972. This is the number that separates a storm that intensifies from
  one that does not, because a cyclone mixes the column and a thin warm skin cools itself out.
- **Mixed layer depth (MLD)** - how deep the water is uniformly stirred, by density.
- **Isothermal layer depth (ILD)** - the same by temperature alone.
- **Barrier layer thickness (BLT)** - ILD minus MLD. Where fresh water holds the density layer
  above the warm layer, a cyclone cannot stir cold water up into its own path. The Bay of Bengal
  has the strongest barrier layers in the world ocean and takes the storms to match.

**The limitation, stated rather than hidden.** The Levels are 5, 10, 20, 30, 50, 75, 100 m and
then coarser, so anything found by a threshold crossing inherits that spacing. D26 near 70 m is
interpolated across a 25 m gap. MLD is the most exposed, because its criterion bites in the 10
to 30 m range where there are only three Levels. INCOIS computed their own value-added products
from this same grid, so the practice is theirs as much as ours - but that is an explanation and
not an excuse, and the app says so on the panel rather than in a footnote.
"""

from __future__ import annotations

import numpy as np

from .grid import Grid
from .thermocline import isotherm_depth

# Leipper and Volgenau's constants, and the isotherm the integral stops at. 26 degC is the
# conventional threshold for water that can sustain a tropical cyclone.
ISOTHERM_26 = 26.0
RHO_SEAWATER = 1026.0  # kg/m3
CP_SEAWATER = 4178.0   # J/(kg K)

# de Boyer Montegut et al. 2004. Both criteria are referenced to 10 m rather than to the
# shallowest value, because the top few metres carry the diurnal skin - a sunny afternoon puts a
# warm film on the surface that is not part of the mixed layer, and referencing to it would
# report a one-metre mixed layer over half the Arabian Sea in April.
REFERENCE_METRES = 10.0
DENSITY_THRESHOLD = 0.03  # kg/m3, sigma-theta
TEMPERATURE_THRESHOLD = 0.2  # degC


def depth_of_26(grid: Grid) -> np.ndarray:
    """Depth in metres of the 26 degC isotherm. NaN where the column never crosses it."""
    return isotherm_depth(grid, ISOTHERM_26)


def heat_potential(temperature: Grid) -> np.ndarray:
    """Tropical cyclone heat potential in kJ/cm2, integrated surface to D26.

    `rho * cp * integral(T - 26) dz`, which is the heat stored above the temperature a cyclone
    can no longer draw on. Reported in kJ/cm2 because that is the unit every operational centre
    publishes it in, and because the numbers land in a readable 0 to 150 range.

    **The integral starts at the sea surface, not at the shallowest Level.** The model's top
    Level is 5 m and there is nothing above it, so the 5 m value is carried up to 0 m - which is
    what a mixed layer physically does. Starting at 5 m instead would drop a slab of the warmest
    water in the column and bias every cell in the block low by around 10%.

    Zero, not NaN, where the column never reaches 26 degC. A cold column has a heat potential and
    it is nothing; NaN would say we could not tell, and we can.
    """
    levels = np.asarray(temperature.levels, dtype=float)
    values = np.asarray(temperature.values, dtype=float)
    crossings = depth_of_26(temperature)

    out = np.full(values.shape[1:], np.nan)
    for row in range(values.shape[1]):
        for column in range(values.shape[2]):
            out[row, column] = _column_heat(levels, values[:, row, column], crossings[row, column])
    return out


def _column_heat(levels: np.ndarray, column: np.ndarray, d26: float) -> float:
    real = np.isfinite(column)
    if real.sum() < 2:
        return np.nan
    if not np.isfinite(d26):
        # Either the whole column is colder than 26 - no fuel - or it is warmer than 26 all the
        # way to 2000 m, which does not happen in this ocean and would be an analysis fault
        # rather than a hazard. Both come back as no fuel, which is the safe direction.
        return 0.0

    depths = np.concatenate(([0.0], levels[real]))
    # Clamped at zero, because the quantity is the heat stored in water that is *above* 26 degC
    # and water below it stores none. Without this an inverted column - a cool skin over a warmer
    # subsurface layer, which the Somali upwelling produces every monsoon - integrates its cold
    # top against its warm middle and reports a **negative** heat potential. Measured on
    # 2026-07-30 at 9.5 N, 51.5 E: -0.2 kJ/cm2, which is not a small number, it is a meaningless
    # one. Every non-inverted column is unaffected, because there the excess is positive
    # everywhere above D26 by construction.
    excess = np.concatenate(([column[real][0]], column[real])) - ISOTHERM_26
    excess = np.maximum(excess, 0.0)

    # Trapezoidal down to D26, with the last segment cut at the crossing where the excess is by
    # definition zero.
    inside = depths < d26
    d = np.concatenate((depths[inside], [d26]))
    e = np.concatenate((excess[inside], [0.0]))
    integrate = getattr(np, "trapezoid", None) or np.trapz
    integral = float(integrate(e, d))

    # J/m2 -> kJ/cm2 is a factor of 1e-7.
    return RHO_SEAWATER * CP_SEAWATER * integral * 1e-7


def mixed_layer_depth(density: Grid) -> np.ndarray:
    """Depth in metres where sigma-theta first exceeds its 10 m value by 0.03 kg/m3.

    NaN where the criterion is never met in the column we hold, and NaN where there is no 10 m
    Level to reference. Falling back to the deepest Level would draw a 2000 m mixed layer out of
    a column that says only that it did not stratify by 0.03 within the range published.
    """
    return _threshold_depth(density, DENSITY_THRESHOLD, rising=True)


def isothermal_layer_depth(temperature: Grid) -> np.ndarray:
    """Depth in metres where temperature first falls 0.2 degC below its 10 m value."""
    return _threshold_depth(temperature, TEMPERATURE_THRESHOLD, rising=False)


def _threshold_depth(grid: Grid, threshold: float, rising: bool) -> np.ndarray:
    levels = np.asarray(grid.levels, dtype=float)
    values = np.asarray(grid.values, dtype=float)

    reference_index = int(np.argmin(np.abs(levels - REFERENCE_METRES)))
    if abs(levels[reference_index] - REFERENCE_METRES) > 1e-6:
        return np.full(values.shape[1:], np.nan)

    out = np.full(values.shape[1:], np.nan)
    for row in range(values.shape[1]):
        for column in range(values.shape[2]):
            out[row, column] = _crossing_below(
                levels, values[:, row, column], reference_index, threshold, rising
            )
    return out


def _crossing_below(
    levels: np.ndarray,
    column: np.ndarray,
    reference_index: int,
    threshold: float,
    rising: bool,
) -> float:
    """First depth at or below the reference Level where the column passes the threshold."""
    reference = column[reference_index]
    if not np.isfinite(reference):
        return np.nan

    # Signed so one walk covers both criteria: density rises away from the reference, temperature
    # falls away from it, and both are "departed by more than `threshold`".
    departure = (column - reference) if rising else (reference - column)

    for i in range(reference_index, len(levels) - 1):
        here, next_one = departure[i], departure[i + 1]
        if not (np.isfinite(here) and np.isfinite(next_one)):
            return np.nan
        if next_one >= threshold > here:
            span = next_one - here
            fraction = (threshold - here) / span if span else 0.0
            return float(levels[i] + fraction * (levels[i + 1] - levels[i]))
    return np.nan


def barrier_layer_thickness(
    isothermal_depth: np.ndarray, mixed_depth: np.ndarray
) -> np.ndarray:
    """Isothermal layer depth minus mixed layer depth, in metres.

    **Signed, and the sign carries meaning** - the same rule this project applies to a Residual.
    Positive is a barrier layer: warm water below the density-mixed layer that a cyclone cannot
    stir cold water up through. Negative is a compensated layer, where salinity stratifies water
    the temperature says is mixed. Clamping the negatives to zero would erase a real structure
    and would make the Field look tidier than the ocean is.
    """
    return np.asarray(isothermal_depth, dtype=float) - np.asarray(mixed_depth, dtype=float)
