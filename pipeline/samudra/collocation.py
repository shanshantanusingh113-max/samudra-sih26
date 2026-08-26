"""Collocation: what the model said, against what the ocean actually was.

This is the thing the problem statement says no existing tool does. Everything else in the
platform is in service of getting a forecaster to this comparison quickly.

Two deliberate choices, both about not flattering the model:

- The comparison happens on the *observation's* depths, not the model's Levels. The float
  measured where it measured; resampling its data to suit the model would smooth away exactly
  the fine vertical structure that makes the comparison interesting.
- Observations the model cannot reach - below its deepest Level, above its shallowest one, or
  over a Mask - are kept and shown as unmatched rather than dropped. A Collocation that
  silently discarded every point the model got wrong would be worse than no Collocation.

The shallow end is counted separately, because it is not a curiosity. INCOIS's top Level is 5 m
and 88% of Argo casts report something above it, so on most comparisons the very surface - the
part a fisheries or cyclone reader looks at first - has nothing to compare against. Extrapolating
the model up to meet it would be inventing the one number people most want, so instead
`above_model_count` lets the panel say how many points were skipped and why.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .grid import Grid


@dataclass(frozen=True)
class Collocation:
    """One Profile paired with the model interpolated to its position, depth by depth."""

    latitude: float
    longitude: float
    depths: np.ndarray
    observed: np.ndarray
    modelled: np.ndarray
    residual: np.ndarray
    # Observations shallower than the model's top Level. Reported, never extrapolated into.
    above_model_count: int = 0

    @property
    def matched_count(self) -> int:
        return int(np.isfinite(self.residual).sum())

    @property
    def mean_residual(self) -> float:
        """Bias: is the model warm or cold here, on average?"""
        return float(np.nanmean(self.residual)) if self.matched_count else float("nan")

    @property
    def rms_residual(self) -> float:
        """Overall disagreement, blind to sign."""
        if not self.matched_count:
            return float("nan")
        return float(np.sqrt(np.nanmean(np.square(self.residual))))


def collocate(grid: Grid, latitude: float, longitude: float, depths, observed) -> Collocation:
    depths = np.asarray(depths, dtype=float)
    observed = np.asarray(observed, dtype=float)
    if depths.shape != observed.shape:
        raise ValueError(f"got {depths.size} depths but {observed.size} observed values")

    order = np.argsort(depths)
    depths, observed = depths[order], observed[order]

    column = grid.column_at(latitude, longitude)  # raises if the Profile is off-grid

    modelled = _interpolate_column(grid.levels, column, depths)
    return Collocation(
        latitude=latitude,
        longitude=longitude,
        depths=depths,
        observed=observed,
        modelled=modelled,
        residual=observed - modelled,
        above_model_count=int((depths < grid.levels[0]).sum()),
    )


def _interpolate_column(levels: np.ndarray, column: np.ndarray, depths: np.ndarray) -> np.ndarray:
    """Linear in metres, refusing to extrapolate or to bridge a Masked Level."""
    upper = np.clip(np.searchsorted(levels, depths, side="right"), 1, len(levels) - 1)
    lower = upper - 1

    weight = np.clip((depths - levels[lower]) / (levels[upper] - levels[lower]), 0.0, 1.0)
    out = column[lower] * (1.0 - weight) + column[upper] * weight

    out[np.isnan(column[lower]) | np.isnan(column[upper])] = np.nan
    out[(depths < levels[0]) | (depths > levels[-1])] = np.nan
    return out
