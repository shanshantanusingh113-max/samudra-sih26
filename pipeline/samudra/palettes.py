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

# One palette per Field, and nothing else.
#
# There used to be nine, offered to the user in a dropdown next to the variable selector. Seven
# of them named quantities this platform does not carry - `algae` is chlorophyll, `oxy` is
# dissolved oxygen - so choosing one recoloured the temperature field in the colours of a
# measurement nobody had taken, under a warning line admitting the colours meant nothing. A
# presentation control was reading as a data control.
#
# The ones that named something derivable became Fields instead: `dense` now carries density and
# `balance` carries the temperature anomaly. The ones that never could - chlorophyll and oxygen
# are biological and optical, bathymetry is a separate dataset and is scenery rather than a
# variable - are gone, because offering their palettes was offering a lie. `delta` went with
# them as a second diverging scale with nothing to sit on.
#
# Each Field names its palette in its FieldSpec, so a Field and its colours cannot be separated.
AVAILABLE = {
    "thermal": "Temperature - cold and dark to warm and bright",
    "haline": "Salinity - fresh to saline",
    "dense": "Density",
    "balance": "Diverging - anomalies and Residuals about zero",
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
#
# But hue cannot be the only thing carrying that order, and it used to be. Grey, red, amber,
# green had luminances of 0.055, 0.188, 0.455, 0.338 - so even for normal vision the amber was
# the brightest band and the ordering cue reversed at the top. Under a red-green deficiency,
# which about 8% of men have, it got worse: the red and the green simulated to (132,132,53) and
# (155,155,110), 66 apart in RGB against 158 for normal vision, and the perceived ranking became
# none < one < several < a few. Backwards, on the one Field whose whole job is saying how much
# evidence there is.
#
# So lightness carries the order and hue carries the meaning. Each band is measurably lighter
# than the one below it under normal vision, deuteranopia, protanopia and tritanopia, and under
# the dark console's display lift as well - the lift is a per-channel gamma, which is monotone
# per channel but not in luminance across different hues, so it has to be checked rather than
# assumed. `test_palettes.py` holds all of that as an assertion; the tightest step the palette
# currently manages is 0.046 in relative luminance, under protanopia.
COVERAGE_BANDS = (
    (0x35, 0x40, 0x46),  # no observations
    (0xB4, 0x43, 0x2D),  # very sparse
    (0xCC, 0x8C, 0x1E),  # moderate
    (0x8F, 0xD6, 0xA9),  # good
)


# Band edges are placed half a count below the threshold they name, not on it.
#
# The thresholds are whole numbers of casts, and the Volume that carries them has been quantised
# to 255 levels. Putting an edge exactly on a threshold makes the answer depend on which side
# `rint` happened to round to: at an encoding range of 0..7 a count of 1 becomes byte 36, whose
# position 0.1412 falls just under the edge at 1/7 = 0.1429, so every one-cast voxel was painted
# with the "no casts" colour and the sparse band was never drawn at all. It worked at 0..8 and
# broke the first time a re-bake moved the 99.5th percentile.
#
# Half a count is also where the edge belongs on its own merits. The GPU filters the value
# channel trilinearly, so the boundary a viewer sees between "none" and "one" is a contour
# through interpolated values, and 0.5 is the honest place to draw it.
_EDGE_OFFSET_COUNTS = 0.5


def banded_table(thresholds, vmin: float, vmax: float) -> list[list[int]]:
    """A 256-entry table that is flat within each band and steps just below each threshold.

    `thresholds` are whole numbers in the Field's own units - casts, here - and are converted to
    positions in the encoded range so the colourbar's tick marks and the water agree about where
    a band ends. `test_palettes.py` holds the round trip that keeps them agreeing.
    """
    if not vmax > vmin:
        raise ValueError(f"need vmax > vmin, got vmin={vmin}, vmax={vmax}")
    if len(thresholds) + 1 != len(COVERAGE_BANDS):
        raise ValueError(
            f"{len(thresholds)} thresholds need {len(thresholds) + 1} colours, "
            f"have {len(COVERAGE_BANDS)}"
        )

    edges = np.asarray(thresholds, dtype=float) - _EDGE_OFFSET_COUNTS
    positions = np.clip((edges - vmin) / (vmax - vmin), 0.0, 1.0)
    samples = np.linspace(0.0, 1.0, RESOLUTION)
    index = np.searchsorted(positions, samples, side="right")
    return [list(COVERAGE_BANDS[i]) for i in index]
