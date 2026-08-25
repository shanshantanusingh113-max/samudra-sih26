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
