import numpy as np
import pytest

from samudra.volume import LAND, OCEAN, encode_volume


def channels(encoded):
    raw = np.frombuffer(encoded.data, dtype=np.uint8)
    shape = (encoded.depth, encoded.height, encoded.width)
    return raw[0::4].reshape(shape), raw[1::4].reshape(shape)


def gradient_channel(encoded):
    raw = np.frombuffer(encoded.data, dtype=np.uint8)
    return raw[2::4].reshape((encoded.depth, encoded.height, encoded.width))


def test_shape_is_flattened_depth_major_with_two_bytes_per_voxel():
    v = encode_volume(np.zeros((4, 5, 6)), vmin=0.0, vmax=1.0)
    assert (v.width, v.height, v.depth) == (6, 5, 4)
    assert len(v.data) == 4 * 5 * 6 * 4


def test_coverage_marks_where_the_ocean_is():
    field = np.zeros((2, 2, 2))
    field[0, 0, 0] = np.nan
    _, coverage = channels(encode_volume(field, vmin=0.0, vmax=1.0))
    assert coverage[0, 0, 0] == LAND
    assert (coverage.sum() / OCEAN) == 7


def test_masked_cells_borrow_a_real_neighbours_value_rather_than_a_sentinel():
    """The whole point: an interpolated land voxel must not drag its neighbours cold."""
    field = np.full((1, 1, 4), 25.0)
    field[0, 0, 0] = np.nan
    values, coverage = channels(encode_volume(field, vmin=0.0, vmax=50.0))
    assert coverage[0, 0, 0] == LAND
    # The land cell carries 25 degC, not 0 - so blending it with the sea beside it is a no-op.
    assert values[0, 0, 0] == values[0, 0, 1]


def test_an_entirely_masked_volume_is_all_land_and_does_not_raise():
    v = encode_volume(np.full((2, 3, 4), np.nan), vmin=0.0, vmax=1.0)
    _, coverage = channels(v)
    assert (coverage == LAND).all()
    assert v.masked_fraction == 1.0


def test_a_volume_with_no_land_reports_none():
    v = encode_volume(np.zeros((2, 3, 4)), vmin=0.0, vmax=1.0)
    assert v.masked_fraction == 0.0


def test_values_span_the_full_byte_range():
    values, _ = channels(encode_volume(np.array([[[0.0, 30.0]]]), vmin=0.0, vmax=30.0))
    assert values.min() == 0 and values.max() == 255


def test_values_outside_the_range_are_clamped_not_wrapped():
    values, _ = channels(encode_volume(np.array([[[-999.0, 999.0]]]), vmin=0.0, vmax=30.0))
    assert list(values.ravel()) == [0, 255]


def test_decoding_recovers_the_value_within_quantisation_error():
    rng = np.random.default_rng(0)
    field = rng.uniform(2.0, 31.0, size=(8, 9, 10))
    vmin, vmax = 2.0, 31.0
    values, _ = channels(encode_volume(field, vmin=vmin, vmax=vmax))
    decoded = vmin + values.astype(float) / 255.0 * (vmax - vmin)
    assert np.abs(decoded - field).max() <= (vmax - vmin) / 255.0


def test_gradient_is_high_where_the_field_changes_and_low_where_it_does_not():
    """A sharp step in the middle of otherwise flat water must stand out."""
    field = np.zeros((8, 1, 1))
    field[4:, 0, 0] = 20.0
    gradient = gradient_channel(encode_volume(field, vmin=0.0, vmax=20.0))
    assert gradient[3, 0, 0] > 200
    assert gradient[0, 0, 0] < 30
    assert gradient[7, 0, 0] < 30


def test_gradient_is_flat_for_a_uniform_field():
    gradient = gradient_channel(encode_volume(np.full((4, 4, 4), 7.0), vmin=0.0, vmax=20.0))
    assert (gradient == 0).all()


def test_gradient_is_zero_on_land():
    field = np.full((3, 3, 3), 10.0)
    field[:, 0, 0] = np.nan
    gradient = gradient_channel(encode_volume(field, vmin=0.0, vmax=20.0))
    assert (gradient[:, 0, 0] == 0).all()


def test_rejects_a_degenerate_range():
    with pytest.raises(ValueError):
        encode_volume(np.zeros((2, 2, 2)), vmin=5.0, vmax=5.0)


def test_rejects_a_non_three_dimensional_field():
    with pytest.raises(ValueError):
        encode_volume(np.zeros((2, 2)), vmin=0.0, vmax=1.0)
