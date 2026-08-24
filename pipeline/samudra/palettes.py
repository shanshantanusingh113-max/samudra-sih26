"""Palettes, taken from cmocean.

Oceanography has a house style and it is not the rainbow. `jet` and its relatives put bright
bands at arbitrary values, which invent fronts that are not in the data and hide ones that
are. cmocean's palettes are perceptually uniform - equal steps in value look like equal steps
in colour - and each is designed for a specific quantity, which is why `thermal` runs cold-dark
to warm-light and `haline` does not.

Exported as a flat 256-entry RGB table the fragment shader can sample as a 1-D texture.
"""

from __future__ import annotations

import cmocean
import numpy as np

# Palette per quantity, following cmocean's own guidance.
AVAILABLE = {
    "thermal": "Temperature - cold and dark to warm and bright",
    "haline": "Salinity - fresh to saline",
    "dense": "Density",
    "speed": "Current speed",
    "balance": "Diverging - anomalies and Residuals about zero",
    "delta": "Diverging - differences",
    "algae": "Chlorophyll",
    "oxy": "Dissolved oxygen",
    "deep": "Bathymetry / depth",
}

RESOLUTION = 256


def lookup_table(name: str) -> np.ndarray:
    """A (256, 3) uint8 RGB table for the named cmocean palette."""
    if name not in AVAILABLE:
        raise KeyError(f"unknown palette {name!r}; have {sorted(AVAILABLE)}")
    colormap = getattr(cmocean.cm, name)
    samples = colormap(np.linspace(0.0, 1.0, RESOLUTION))
    return np.rint(samples[:, :3] * 255).astype(np.uint8)


def all_tables() -> dict[str, list[list[int]]]:
    """Every palette, JSON-ready, for shipping in the manifest."""
    return {name: lookup_table(name).tolist() for name in AVAILABLE}


# Not a cmocean palette, and deliberately not in AVAILABLE: it is derived here rather than
# resolved through cmocean, and all_tables() would fail looking it up.
#
# Observation Coverage is not a continuous quantity a reader should interpolate. "Twice as many
# observations" is not "twice as good", and a smooth ramp invites exactly that reading. So its
# palette is four flat bands with hard edges: a voxel is in one band or another, and the
# colourbar shows the thresholds rather than a gradient.
#
# Colours run grey (no evidence) through red and amber to green, which is the one ordering a
# non-specialist reads correctly without a legend.
COVERAGE_BANDS = (
    (0x3A, 0x44, 0x4A),  # no observations
    (0xC7, 0x54, 0x3D),  # very sparse
    (0xE8, 0xA8, 0x38),  # moderate
    (0x4F, 0xB0, 0x6B),  # good
)


def banded_table(thresholds, vmin: float, vmax: float) -> list[list[int]]:
    """A 256-entry table that is flat within each band and steps at the thresholds.

    `thresholds` are in the Field's own units - counts, here - and are converted to positions in
    the encoded range so the colourbar's tick marks and the water agree about where a band ends.
    """
    if not vmax > vmin:
        raise ValueError(f"need vmax > vmin, got vmin={vmin}, vmax={vmax}")
    if len(thresholds) + 1 != len(COVERAGE_BANDS):
        raise ValueError(
            f"{len(thresholds)} thresholds need {len(thresholds) + 1} colours, "
            f"have {len(COVERAGE_BANDS)}"
        )

    positions = np.clip(
        (np.asarray(thresholds, dtype=float) - vmin) / (vmax - vmin), 0.0, 1.0
    )
    samples = np.linspace(0.0, 1.0, RESOLUTION)
    index = np.searchsorted(positions, samples, side="right")
    return [list(COVERAGE_BANDS[i]) for i in index]
