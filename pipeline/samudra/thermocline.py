"""Where an isotherm sits.

The depth of the 20 degC surface is the conventional proxy for the bottom of the warm surface
layer, and it is one of the numbers INCOIS publishes as an operational product. It matters here
for two reasons.

It explains the anomaly Field. Measured across this bake, the correlation between the
temperature departure at 100 m and the departure of this depth is +0.63, peaking at exactly the
depth where the anomaly signal peaks and falling away above and below it (+0.22 at 50 m, +0.13
at 500 m). So the warm and cool bodies a user sees in the middle of the water column are, mostly,
the thermocline sitting deeper or shallower there than it usually does. That is a cause with a
number behind it rather than an interpretation, which is the only kind this platform ships.

It is also the first half of TCHP, the heat integrated down to the 26 degC isotherm, which is
the quantity that governs cyclone rapid intensification and is the next Field worth adding.
"""

from __future__ import annotations

import numpy as np

from .grid import Grid


def isotherm_depth(grid: Grid, value: float) -> np.ndarray:
    """Depth in metres of the first crossing of `value`, read from the surface down.

    Returns a (lat, lon) array, NaN wherever the column never crosses - either because it is
    land, or because the whole column is warmer or colder than the value asked for. Missing is
    the honest answer there: falling back to the deepest Level would draw a thermocline exactly
    where the data says there is not one.

    Read from the surface down because that is the operational definition. Columns do invert,
    and the figure a forecaster wants is the bottom of the warm surface layer, not the last time
    the profile happened to pass the value on its way to the abyss.
    """
    levels = np.asarray(grid.levels, dtype=float)
    values = np.asarray(grid.values, dtype=float)
    depth = np.full(values.shape[1:], np.nan)

    for row in range(values.shape[1]):
        for column in range(values.shape[2]):
            depth[row, column] = _crossing(levels, values[:, row, column], value)
    return depth


def _crossing(levels: np.ndarray, column: np.ndarray, value: float) -> float:
    """The first depth at which a column drops through `value`, or NaN."""
    real = np.isfinite(column)
    if real.sum() < 2:
        return np.nan

    depths = levels[real]
    temperatures = column[real]

    # Walk down. A crossing is a pair where the value sits between two consecutive Levels; the
    # >= on the upper side keeps a column that is exactly at the value from being missed.
    for i in range(len(temperatures) - 1):
        upper, lower = temperatures[i], temperatures[i + 1]
        if upper >= value > lower:
            span = upper - lower
            fraction = (upper - value) / span if span else 0.0
            return float(depths[i] + fraction * (depths[i + 1] - depths[i]))
    return np.nan


def swept_through(here: float, usually: float, top: float, bottom: float) -> bool:
    """Did the isotherm move through the depth band between `top` and `bottom`?

    This is what decides whether an Anomaly Feature gets told why it is there. Asking whether the
    isotherm sits inside the body *today* is the obvious test and it is too strict: it fails on
    the strongest feature in the current bake, a cool body at 30-100 m off Oman where the 20 degC
    line has risen from 116 m to 29 m. The line is one metre above the body, so containment says
    "unrelated", when in fact it swept up through every metre of that water.

    So the test is overlap between the band and the interval the isotherm travelled. A line that
    did not move still counts if it is sitting in that water, which is why the interval is
    closed.
    """
    if not (np.isfinite(here) and np.isfinite(usually)):
        return False
    travelled_top, travelled_bottom = min(here, usually), max(here, usually)
    # A plain bool, not numpy's. The inputs come off a numpy array, so the comparison returns
    # np.bool_, which json.dumps refuses and which the signature above does not promise.
    return bool(travelled_top <= bottom and travelled_bottom >= top)
