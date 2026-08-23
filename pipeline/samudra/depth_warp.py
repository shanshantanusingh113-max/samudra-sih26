"""The Depth Warp.

INCOIS publishes 24 unevenly spaced Levels — 5 m apart near the surface, 200 m apart in the
abyss — because that is where the physics is. A GPU 3D texture, however, samples on an evenly
spaced lattice. Something has to reconcile the two, and doing it naively (linear in metres)
would spend 85% of the texture on the featureless deep ocean and crush the thermocline, the
one structure a forecaster actually looks at, into three voxels.

So the Volume's third axis is not depth in metres. It is a warped coordinate that is dense
near the surface and sparse at depth, and this module owns the mapping in both directions.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Sets how hard the warp bites. Roughly "the depth below which resolution starts to fall off".
# 50 m puts the mixed layer and the thermocline in the upper half of the axis.
_SCALE_METRES = 50.0


@dataclass(frozen=True)
class DepthWarp:
    """Maps depth in metres onto the Volume's evenly spaced [0, 1] third axis."""

    top: float
    bottom: float

    def __post_init__(self) -> None:
        if not self.bottom > self.top >= 0:
            raise ValueError(f"need 0 <= top < bottom, got top={self.top}, bottom={self.bottom}")

    @property
    def _span(self) -> tuple[float, float]:
        return (
            float(np.log1p(self.top / _SCALE_METRES)),
            float(np.log1p(self.bottom / _SCALE_METRES)),
        )

    def to_axis(self, depth):
        """Depth in metres -> axis position in [0, 1]. 0 is the surface."""
        lo, hi = self._span
        return (np.log1p(np.asarray(depth, dtype=float) / _SCALE_METRES) - lo) / (hi - lo)

    def to_depth(self, axis):
        """Axis position in [0, 1] -> depth in metres."""
        lo, hi = self._span
        return _SCALE_METRES * np.expm1(np.asarray(axis, dtype=float) * (hi - lo) + lo)

    def sample_depths(self, samples: int) -> np.ndarray:
        """The real depths the Volume's evenly spaced slabs actually sit at."""
        return self.to_depth(np.linspace(0.0, 1.0, samples))

    def resample(self, levels, values, samples: int) -> np.ndarray:
        """Resample one water column from source Levels onto the even axis.

        Interpolation is linear in warped space, and it refuses to invent water: a target that
        is bracketed by any missing Level comes back missing. That matters because missing here
        means "sea floor" or "land", and quietly interpolating across it would paint solid rock
        as plausible-looking ocean.
        """
        levels = np.asarray(levels, dtype=float)
        values = np.asarray(values, dtype=float)

        source_axis = self.to_axis(levels)
        target_axis = np.linspace(0.0, 1.0, samples)

        upper = np.clip(np.searchsorted(source_axis, target_axis, side="right"), 1, len(levels) - 1)
        lower = upper - 1

        width = source_axis[upper] - source_axis[lower]
        weight = np.clip((target_axis - source_axis[lower]) / width, 0.0, 1.0)

        out = values[lower] * (1.0 - weight) + values[upper] * weight
        # NaN propagates through the arithmetic above already, but only when the *weighted*
        # side is missing; a zero weight would hide a NaN on the far side. Be explicit.
        out[np.isnan(values[lower]) | np.isnan(values[upper])] = np.nan
        return out
