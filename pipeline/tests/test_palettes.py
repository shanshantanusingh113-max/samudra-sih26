"""The banded palette has to survive the trip through the byte encoder.

`encode_volume` quantises a Field to 255 steps and `banded_table` draws the band edges as
positions along that same range. If the two disagree by a single level, a whole band vanishes:
at an encoding range of 0..7 a count of exactly 1 quantised to byte 36, whose position 0.1412
fell just under the edge at 1/7 = 0.1429, so every one-cast voxel was painted with the "no
casts" colour and the sparse band was never drawn at all. It happened to work at 0..8 and broke
when a re-bake moved the 99.5th percentile, which is the kind of luck a test replaces.
"""

from __future__ import annotations

import numpy as np
import pytest

from samudra.coverage import BANDS, band_of
from samudra.palettes import COVERAGE_BANDS, banded_table
from samudra.volume import encode_volume


def band_read_back(count: int, vmin: float, vmax: float) -> int:
    """Encode a count as the bake does, then look it up in the palette as the shader does."""
    encoded = encode_volume(
        np.full((1, 1, 1), float(count)), vmin=vmin, vmax=vmax
    )
    byte = encoded.data[0]
    colour = banded_table(BANDS, vmin, vmax)[byte]
    return [i for i, c in enumerate(COVERAGE_BANDS) if list(c) == colour][0]


@pytest.mark.parametrize("vmax", [6.0, 7.0, 8.0, 9.0, 10.0, 13.0, 40.0])
def test_every_cast_count_reads_back_as_its_own_band(vmax):
    """Whatever range this bake happens to produce, the water and `band_of` must agree."""
    for count in range(0, int(vmax) + 1):
        assert band_read_back(count, 0.0, vmax) == band_of(count), (
            f"{count} casts read as the wrong band at range 0..{vmax}"
        )


def test_every_band_is_actually_reachable():
    """A band nothing can land in is a legend advertising a colour the picture cannot show."""
    for vmax in (6.0, 7.0, 8.0, 12.0):
        seen = {band_read_back(c, 0.0, vmax) for c in range(0, int(vmax) + 1)}
        assert seen == set(range(len(COVERAGE_BANDS))), f"range 0..{vmax} reached only {seen}"


def test_the_table_is_flat_between_edges_and_steps_at_them():
    table = banded_table(BANDS, 0.0, 8.0)
    assert len(table) == 256
    assert {tuple(row) for row in table} == {tuple(c) for c in COVERAGE_BANDS}
    # Monotone: once the table has stepped up it never steps back down.
    order = [[tuple(c) for c in COVERAGE_BANDS].index(tuple(row)) for row in table]
    assert order == sorted(order)


def test_a_table_needs_one_more_colour_than_it_has_thresholds():
    with pytest.raises(ValueError):
        banded_table((1, 2), 0.0, 8.0)
    with pytest.raises(ValueError):
        banded_table(BANDS, 5.0, 5.0)


# ---------------------------------------------------------------- colour vision
#
# The four bands are ordered - none, one, a few, several - so the picture has to carry that
# order, and hue alone does not. Grey to red to amber to green reads correctly for most people
# and collapses for the roughly 8% of men with a red-green deficiency: measured on the previous
# palette, the "1 cast" red and the "4 or more" green simulated to (132,132,53) and (155,155,110)
# under deuteranopia, 66 apart in RGB against 158 for normal vision, and the amber came out
# *brighter* than both. The perceived ranking became none < one < several < a few, which is
# exactly backwards on the one Field that exists to say how much evidence there is.
#
# Hue still does the semantic work. Lightness now does the ordering, so the ranking survives any
# colour deficiency - and it also survives the display lift, which is why that is asserted too.
# The lift is a per-channel gamma and monotone per channel, but a gamma is not monotone in
# *luminance* across different hues, so it has to be checked rather than assumed.

# Vienot, Brettel and Mollon (1999), the standard dichromat simulation.
_RGB_TO_LMS = np.array(
    [
        [17.8824, 43.5161, 4.11935],
        [3.45565, 27.1554, 3.86714],
        [0.0299566, 0.184309, 1.46709],
    ]
)
_LMS_TO_RGB = np.linalg.inv(_RGB_TO_LMS)
_DICHROMAT = {
    "deuteranopia": np.array([[1, 0, 0], [0.494207, 0, 1.24827], [0, 0, 1]]),
    "protanopia": np.array([[0, 2.02344, -2.52581], [0, 1, 0], [0, 0, 1]]),
    "tritanopia": np.array([[1, 0, 0], [0, 1, 0], [-0.395913, 0.801109, 0]]),
    "normal": np.eye(3),
}

# Matches LIFT_DARK in web/src/palette.ts. The dark console draws the lifted palette, so that is
# the one a viewer actually sees; ADR 0007 explains why the lift exists and why it lives in one
# place.
_DISPLAY_LIFT = 0.62


def _to_linear(channel: np.ndarray) -> np.ndarray:
    channel = np.asarray(channel, dtype=float) / 255.0
    return np.where(channel <= 0.04045, channel / 12.92, ((channel + 0.055) / 1.055) ** 2.4)


def _relative_luminance(colour) -> float:
    r, g, b = _to_linear(np.asarray(colour, dtype=float))
    return float(0.2126 * r + 0.7152 * g + 0.0722 * b)


def _simulate(colour, matrix) -> np.ndarray:
    linear = _to_linear(np.asarray(colour, dtype=float))
    out = _LMS_TO_RGB @ (matrix @ (_RGB_TO_LMS @ linear))
    out = np.clip(out, 0.0, 1.0)
    encoded = np.where(out <= 0.0031308, 12.92 * out, 1.055 * out ** (1 / 2.4) - 0.055)
    return np.rint(255 * encoded)


def _lifted(colour):
    return [round(255 * (c / 255) ** _DISPLAY_LIFT) for c in colour]


@pytest.mark.parametrize("vision", sorted(_DICHROMAT))
@pytest.mark.parametrize("lift", [False, True])
def test_the_bands_get_lighter_as_the_evidence_gets_stronger(vision, lift):
    """The order has to be readable without seeing the hues, in either theme."""
    palette = [_lifted(c) if lift else list(c) for c in COVERAGE_BANDS]
    seen = [_relative_luminance(_simulate(c, _DICHROMAT[vision])) for c in palette]
    assert seen == sorted(seen), (
        f"{vision}{' (display-lifted)' if lift else ''} puts the bands in the order "
        f"{np.argsort(seen).tolist()} rather than 0, 1, 2, 3: luminances "
        f"{[round(v, 3) for v in seen]}"
    )


@pytest.mark.parametrize("vision", sorted(_DICHROMAT))
def test_neighbouring_bands_stay_far_enough_apart_to_be_told_apart(vision):
    """Monotone is not enough: two bands a rounding error apart still read as one band."""
    seen = [_relative_luminance(_simulate(c, _DICHROMAT[vision])) for c in COVERAGE_BANDS]
    gaps = [b - a for a, b in zip(seen, seen[1:])]
    # 0.04 in relative luminance is a clearly visible step at these levels, and the palette
    # currently manages 0.046 at its tightest, under protanopia.
    assert min(gaps) >= 0.04, f"{vision}: closest bands differ by only {min(gaps):.4f}"
