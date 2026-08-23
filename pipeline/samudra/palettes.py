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
    "thermal": "Temperature — cold and dark to warm and bright",
    "haline": "Salinity — fresh to saline",
    "dense": "Density",
    "speed": "Current speed",
    "balance": "Diverging — anomalies and Residuals about zero",
    "delta": "Diverging — differences",
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
