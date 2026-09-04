"""Departure from a real climatological normal, so "warmer than usual" means what a forecaster
means by it.

PS 26067 names **climate monitoring** among the four operational mandates a missing 3D platform
impedes. The Temperature Anomaly this platform already had is a departure from the mean of the
twelve baked Timesteps - roughly April to July 2026 - which is a **seasonal swing**, and the
guide entry beside it has always said so rather than letting a reader assume otherwise. It is a
useful field and it is not what "warmer than usual" means.

This is the other one: the 2026 analysis differenced against the **World Ocean Atlas 2023
1991-2020 normal** for that Timestep's own calendar month. One degree, monthly, to 1500 m - the
same horizontal resolution and the same node centres as the INCOIS analysis, which is the whole
reason it fits. `sources/woa.py` fetches it.

**Why this is not the oxygen decision again.** ADR 0010 refused dissolved oxygen because the
only field for this region was a decadal climatology with no date, which cannot share a ten-day
2026 timeline. That is exactly right for a *value* and exactly backwards for a *baseline*: a
climatology having no year is what makes it a climatology. It is the reference the analysis is
differenced against, and it is never drawn as a value in its own right.

Two caveats ship with the Field and are not optional.

**The atlas is monthly and the bake is ten-daily**, so each Timestep is differenced against its
own calendar month and three Timesteps in a month share one baseline.

**The atlas stops at 1500 m** and the analysis runs to 2000 m, so the deepest Levels have no
normal at all and are Mask rather than zero.
"""

from __future__ import annotations

from datetime import datetime

import numpy as np

from .grid import Grid


class AxisMismatch(ValueError):
    """The normal and the analysis are not on the same horizontal nodes.

    WOA 2023's one-degree product sits on exactly the node centres the INCOIS analysis uses, and
    that is why this Field is cheap. If it ever stops being true the answer is to say so, not to
    regrid one onto the other and quietly difference two different pieces of water.
    """


def month_of(when: datetime) -> int:
    """The calendar month a Timestep is differenced against.

    Read off the Timestep, never off the clock. Every analysis in this bake is April to July
    2026 and the bake runs in September; reading the clock would difference all twelve against
    September's normal, which is smooth, plausible and wrong by a season.
    """
    return when.month


def to_model_levels(normal: Grid, levels) -> np.ndarray:
    """The normal, interpolated in depth onto the model's own Levels.

    Linear in metres, node by node. **Below the deepest published normal the answer is Mask, not
    the last value held down**: the atlas stops at 1500 m and the analysis runs to 2000 m, and
    extending it would draw an anomaly at a depth nothing was ever averaged over.

    A Masked node in the normal propagates: a target Level bracketed by a missing one comes back
    missing rather than being interpolated across, which is the same refusal `DepthWarp.resample`
    makes and for the same reason.
    """
    levels = np.asarray(levels, dtype=float)
    source = np.asarray(normal.levels, dtype=float)
    values = np.asarray(normal.values, dtype=float)

    upper = np.clip(np.searchsorted(source, levels, side="right"), 1, len(source) - 1)
    lower = upper - 1
    width = source[upper] - source[lower]
    weight = np.clip((levels - source[lower]) / width, 0.0, 1.0)

    shaped = weight[:, np.newaxis, np.newaxis]
    out = values[lower] * (1.0 - shaped) + values[upper] * shaped
    # NaN already propagates through the arithmetic where the weight is non-zero; be explicit so
    # a zero weight cannot hide a missing value on the far side.
    out[np.isnan(values[lower]) | np.isnan(values[upper])] = np.nan
    # And past the end of the atlas there is nothing to interpolate between at all.
    out[levels > source[-1]] = np.nan
    return out


def climatological_anomaly(analysis: Grid, normal: Grid) -> Grid:
    """The analysis minus the normal, on the analysis's own axes.

    Positive means the ocean is **warmer than the normal**, which is the way round a forecaster
    reads it. Getting the sign backwards produces a field that is exactly as smooth and exactly
    as wrong, which is why it has a test of its own.
    """
    if not np.allclose(analysis.latitudes, normal.latitudes):
        raise AxisMismatch(
            "the normal is on different latitude nodes from the analysis: "
            f"{normal.latitudes[0]}..{normal.latitudes[-1]} against "
            f"{analysis.latitudes[0]}..{analysis.latitudes[-1]}"
        )
    if not np.allclose(analysis.longitudes, normal.longitudes):
        raise AxisMismatch(
            "the normal is on different longitude nodes from the analysis: "
            f"{normal.longitudes[0]}..{normal.longitudes[-1]} against "
            f"{analysis.longitudes[0]}..{analysis.longitudes[-1]}"
        )

    baseline = to_model_levels(normal, analysis.levels)
    return Grid(
        levels=np.asarray(analysis.levels, dtype=float),
        latitudes=np.asarray(analysis.latitudes, dtype=float),
        longitudes=np.asarray(analysis.longitudes, dtype=float),
        values=np.asarray(analysis.values, dtype=float) - baseline,
    )
