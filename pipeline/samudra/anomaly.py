"""Anomaly: how far this Timestep's water is from its own average, cell by cell.

Absolute temperature is dominated by geography. The Arabian Sea is warmer than the equatorial
Indian Ocean and 100 m is colder than the surface, and both are true in every frame, so an
absolute field spends its whole colour range restating the map. Subtracting each cell's own
average over time throws that away and leaves only what changed, which is the question a
forecaster is actually asking.

What the baseline is, and what it is not

**It is the mean of the Timesteps in this bake and nothing else.** Twelve ten-day steps, April
to July 2026. That is roughly four months of one year.

It is **not** a climatology. "Warmer than normal" in the sense an operational centre means it -
warmer than the 1991-2020 average for this week of the year - would need a thirty-year
reference series that this platform does not hold and would have to download and validate
separately. The two readings look identical on screen and mean completely different things, so
the guide panel says which one this is, in those words. Shipping a four-month mean while
implying a thirty-year one would be the same class of error as calling a z-score a confidence.

What it does show honestly is the seasonal swing: this window spans the pre-monsoon into the
southwest monsoon, and the departure is largest at 75-125 m rather than at the surface, because
what moves is the thermocline. In this bake the standard deviation runs 0.74 degC at 5 m, peaks
at 1.55 degC at 100 m, and falls to 0.08 degC by 2000 m. The deep ocean does not do much in four
months, and the field says so.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

from .grid import Grid

# The anomalies of a few cells are enormous - a thermocline that moved a long way vertically
# puts 24 degC of departure into a single cell - and a colour scale stretched to reach them
# would leave the entire ocean sitting in the middle two colours. Clipped, like every other
# Field's range, and stated rather than hidden.
_RANGE_PERCENTILE = 99.0

# A field that never moves still needs a drawable range. Half a degree is small enough that any
# real signal fills the bar and large enough that vmin never equals vmax.
_MINIMUM_HALF_RANGE = 0.5


def anomaly_series(grids: Sequence[Grid]) -> list[Grid]:
    """Each Grid's departure from the per-cell mean of all of them.

    Per cell, not per block: a permanently cold corner of the map is a cold corner, not an
    anomaly, and only its departure from its own average over time is one.

    Masked cells stay masked. The land mask is identical in every Timestep of this product, so
    a plain mean is safe, but NaN propagating is what keeps that true if it ever stops being.
    """
    grids = list(grids)
    if len(grids) < 2:
        raise ValueError(
            f"an anomaly needs at least two Timesteps to average, got {len(grids)}"
        )
    _require_same_axes(grids)

    stacked = np.stack([g.values for g in grids])
    baseline = stacked.mean(axis=0)

    return [
        Grid(
            levels=g.levels,
            latitudes=g.latitudes,
            longitudes=g.longitudes,
            values=g.values - baseline,
        )
        for g in grids
    ]


def symmetric_encoding_range(
    grids: Sequence[Grid], percentile: float = _RANGE_PERCENTILE
) -> tuple[float, float]:
    """An encoding range centred on zero, so a diverging palette's midpoint means what it says.

    Every other Field takes its range from the 0.5th and 99.5th percentiles of its own values.
    Doing that here would put zero somewhere other than the middle of the colourbar, and every
    colour either side of it would then be claiming the wrong sign.
    """
    finite = np.concatenate([g.values[np.isfinite(g.values)].ravel() for g in grids])
    reach = float(np.percentile(np.abs(finite), percentile)) if finite.size else 0.0
    reach = max(reach, _MINIMUM_HALF_RANGE)
    return -reach, reach


def _require_same_axes(grids: Sequence[Grid]) -> None:
    first = grids[0]
    for name in ("levels", "latitudes", "longitudes"):
        for other in grids[1:]:
            if not np.array_equal(getattr(first, name), getattr(other, name)):
                raise ValueError(f"Timesteps disagree about {name}; they are not one series")
